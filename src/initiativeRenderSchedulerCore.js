export const RENDER_PRIORITY = Object.freeze({
  FULL: 100,
  INCREMENTAL: 10,
});

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function normalizeEpoch(value) {
  return value === undefined || value === null ? null : Number(value);
}

function sameEpoch(left, right) {
  const a = normalizeEpoch(left);
  const b = normalizeEpoch(right);
  return a === null || b === null || a === b;
}

function settledResult(request, status, extra = {}) {
  return {
    status,
    mode: request.mode,
    priority: request.priority,
    sequence: request.sequence,
    sceneEpoch: request.sceneEpoch,
    sourceRevision: request.sourceRevision,
    correlationId: request.correlationId || null,
    itemIds: [...request.itemIds],
    ...extra,
  };
}

function createWaiter() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function mergeRequest(target, next) {
  if (!target) return next;
  const targetRevision = Number(target.sourceRevision) || 0;
  const nextRevision = Number(next.sourceRevision) || 0;
  const nextIsCurrent = nextRevision >= targetRevision;
  if (nextIsCurrent) {
    target.sequence = next.sequence;
    target.reason = next.reason || target.reason;
    target.sceneEpoch = next.sceneEpoch;
    target.correlationId = next.correlationId || target.correlationId || null;
    if (typeof next.execute === "function") target.execute = next.execute;
  }
  target.sourceRevision = Math.max(
    targetRevision,
    nextRevision,
  );
  for (const id of next.itemIds) target.itemIds.add(id);
  target.waiters.push(...next.waiters);
  return target;
}

/**
 * Serializes tracker DOM work. Full renders are a barrier: incremental work
 * requested while a full render is pending/running is retained and drained
 * only after the full render settles.
 */
export function createInitiativeRenderScheduler({
  getSceneEpoch = null,
  isCurrent = null,
  scheduleTask = (callback) => queueMicrotask(callback),
  onEvent = null,
  runFull = null,
  runIncremental = null,
} = {}) {
  if (typeof scheduleTask !== "function") {
    throw new TypeError("scheduleTask must be a function");
  }

  let sequence = 0;
  let scheduled = false;
  let running = false;
  let fullPending = null;
  let fullRunning = null;
  let incrementalPending = null;
  let activeEpoch = null;
  let latestSourceRevision = 0;
  const idleWaiters = [];

  function emit(type, request, detail = {}) {
    if (typeof onEvent !== "function") return;
    try {
      onEvent({
        type,
        mode: request?.mode || null,
        priority: request?.priority || null,
        sequence: request?.sequence || null,
        sceneEpoch: request?.sceneEpoch ?? null,
        sourceRevision: request?.sourceRevision ?? 0,
        correlationId: request?.correlationId || null,
        itemIds: request ? [...request.itemIds] : [],
        ...detail,
      });
    } catch {}
  }

  function isRequestCurrent(request) {
    if (activeEpoch !== null && !sameEpoch(activeEpoch, request.sceneEpoch)) {
      return false;
    }
    if (typeof getSceneEpoch === "function" &&
        !sameEpoch(getSceneEpoch(), request.sceneEpoch)) {
      return false;
    }
    if (typeof isCurrent === "function" && !isCurrent(request.sceneEpoch, request)) {
      return false;
    }
    if (
      request.mode === "incremental"
      && Number(request.sourceRevision) > 0
      && Number(request.sourceRevision) < latestSourceRevision
    ) {
      return false;
    }
    return true;
  }

  function settleWaiters(request, result, error = null) {
    for (const waiter of request.waiters) {
      if (error) waiter.reject(error);
      else waiter.resolve(result);
    }
  }

  function hasPendingWork() {
    return !!(fullPending || incrementalPending);
  }

  function settleIdle() {
    if (running || scheduled || hasPendingWork()) return;
    for (const resolve of idleWaiters.splice(0)) resolve();
  }

  function scheduleDrain() {
    if (running || scheduled) return;
    scheduled = true;
    scheduleTask(() => {
      scheduled = false;
      void drain();
    });
  }

  function takeFull() {
    const request = fullPending;
    fullPending = null;
    return request;
  }

  function takeIncremental() {
    const request = incrementalPending;
    incrementalPending = null;
    return request;
  }

  async function executeRequest(request) {
    if (!isRequestCurrent(request)) {
      const result = settledResult(request, "stale");
      emit("stale", request);
      settleWaiters(request, result);
      return result;
    }

    const execute = request.execute || (
      request.mode === "full" ? runFull : runIncremental
    );
    if (typeof execute !== "function") {
      const error = new TypeError(`missing-${request.mode}-renderer`);
      settleWaiters(request, null, error);
      emit("failed", request, { error: error.message });
      return null;
    }

    emit("started", request);
    try {
      const value = await execute({
        ...request,
        itemIds: [...request.itemIds],
        isCurrent: () => isRequestCurrent(request),
        isIncrementalBarrierOpen: () => (
          request.mode === "incremental"
          && !fullPending
          && !fullRunning
        ),
      });
      const current = isRequestCurrent(request);
      const status = current ? "committed" : "stale";
      const result = settledResult(request, status, { value });
      emit(status, request);
      settleWaiters(request, result);
      return result;
    } catch (error) {
      emit("failed", request, { error: error?.message || String(error) });
      settleWaiters(request, null, error);
      return null;
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (hasPendingWork()) {
        // Priority is explicit. A full request always crosses the barrier
        // before the accumulated card patches are allowed to run.
        if (fullPending) {
          const request = takeFull();
          fullRunning = request;
          await executeRequest(request);
          fullRunning = null;
          continue;
        }

        const request = takeIncremental();
        if (!request) continue;
        if (fullPending || fullRunning) {
          incrementalPending = mergeRequest(incrementalPending, request);
          continue;
        }
        await executeRequest(request);
      }
    } finally {
      fullRunning = null;
      running = false;
      if (hasPendingWork()) scheduleDrain();
      else settleIdle();
    }
  }

  function createRequest(mode, options = {}) {
    const itemIds = new Set(uniqueIds(options.itemIds));
    const waiter = createWaiter();
    const sourceRevision = Number(options.sourceRevision) || 0;
    const request = {
      mode,
      priority: mode === "full" ? RENDER_PRIORITY.FULL : RENDER_PRIORITY.INCREMENTAL,
      sequence: ++sequence,
      sceneEpoch: options.sceneEpoch ?? (
        typeof getSceneEpoch === "function" ? getSceneEpoch() : null
      ),
      sourceRevision,
      correlationId: String(options.correlationId || "").trim() || null,
      reason: String(options.reason || "unspecified"),
      itemIds,
      execute: typeof options.execute === "function" ? options.execute : null,
      waiters: [waiter],
    };
    if (sourceRevision > latestSourceRevision) latestSourceRevision = sourceRevision;
    return { request, waiter };
  }

  function adoptEpoch(sceneEpoch) {
    if (activeEpoch === null) {
      activeEpoch = sceneEpoch;
      return;
    }
    if (sameEpoch(activeEpoch, sceneEpoch)) return;
    for (const request of [fullPending, incrementalPending]) {
      if (!request) continue;
      settleWaiters(request, settledResult(request, "stale"));
      emit("stale", request, { reset: true });
    }
    fullPending = null;
    incrementalPending = null;
    activeEpoch = sceneEpoch;
    latestSourceRevision = 0;
  }

  function requestFull(options = {}) {
    const { request, waiter } = createRequest("full", options);
    adoptEpoch(request.sceneEpoch);
    latestSourceRevision = Math.max(latestSourceRevision, request.sourceRevision);
    fullPending = mergeRequest(fullPending, request);
    emit("queued", fullPending, { barrier: true });
    scheduleDrain();
    return {
      sequence: request.sequence,
      priority: request.priority,
      done: waiter.promise,
    };
  }

  function requestIncremental(options = {}) {
    const { request, waiter } = createRequest("incremental", options);
    adoptEpoch(request.sceneEpoch);
    latestSourceRevision = Math.max(latestSourceRevision, request.sourceRevision);
    incrementalPending = mergeRequest(incrementalPending, request);
    emit("queued", incrementalPending, {
      barrier: !!(fullPending || fullRunning),
    });
    scheduleDrain();
    return {
      sequence: request.sequence,
      priority: request.priority,
      done: waiter.promise,
    };
  }

  function reset(sceneEpoch = null) {
    activeEpoch = sceneEpoch;
    latestSourceRevision = 0;
    for (const request of [fullPending, incrementalPending]) {
      if (!request) continue;
      settleWaiters(request, settledResult(request, "stale"));
      emit("stale", request, { reset: true });
    }
    fullPending = null;
    incrementalPending = null;
    settleIdle();
  }

  return {
    requestFull,
    requestIncremental,
    reset,
    idle() {
      if (!running && !scheduled && !hasPendingWork()) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    isCurrent: isRequestCurrent,
    getState() {
      return {
        running,
        scheduled,
        activeEpoch,
        latestSourceRevision,
        fullPending: !!fullPending,
        fullRunning: !!fullRunning,
        incrementalPending: incrementalPending
          ? [...incrementalPending.itemIds]
          : [],
        pendingPriority: fullPending
          ? RENDER_PRIORITY.FULL
          : incrementalPending
            ? RENDER_PRIORITY.INCREMENTAL
            : null,
      };
    },
  };
}

export function createDirtyItemSet(initialIds = []) {
  const ids = new Set(uniqueIds(initialIds));
  return {
    add(value) {
      if (Array.isArray(value)) {
        for (const id of uniqueIds(value)) ids.add(id);
      } else {
        for (const id of uniqueIds([value])) ids.add(id);
      }
      return ids.size;
    },
    addMany(values) {
      for (const id of uniqueIds(values)) ids.add(id);
      return ids.size;
    },
    has(value) {
      return ids.has(String(value || "").trim());
    },
    take() {
      const result = [...ids];
      ids.clear();
      return result;
    },
    clear() {
      ids.clear();
    },
    get size() {
      return ids.size;
    },
    values() {
      return [...ids];
    },
  };
}
