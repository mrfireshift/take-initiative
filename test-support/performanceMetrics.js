import { AsyncLocalStorage } from "node:async_hooks";

export function percentile(values, percent) {
  const samples = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!samples.length) return 0;
  const probability = Math.max(0, Math.min(100, Number(percent) || 0));
  const rank = Math.max(1, Math.ceil((probability / 100) * samples.length));
  return samples[rank - 1];
}

export function summarizeDurations(samples = []) {
  const values = (Array.isArray(samples) ? samples : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    totalMs,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    maxMs: values.length ? Math.max(...values) : 0,
  };
}

export class DeterministicClock {
  #time = 0;
  #nextId = 1;
  #timers = new Map();
  #microtasks = [];
  #activePromises = new Set();

  now = () => this.#time;

  tick(milliseconds = 0) {
    const amount = Number(milliseconds);
    if (Number.isFinite(amount) && amount >= 0) this.#time += amount;
    return this.#time;
  }

  setTimeout(callback, delay = 0) {
    const id = this.#nextId++;
    const amount = Math.max(0, Number(delay) || 0);
    this.#timers.set(id, {
      id,
      due: this.#time + amount,
      callback,
    });
    return id;
  }

  clearTimeout(id) {
    this.#timers.delete(id);
  }

  queueMicrotask(callback) {
    const id = this.#nextId++;
    this.#microtasks.push({ id, callback });
    return id;
  }

  pendingCount() {
    return this.#timers.size + this.#microtasks.length + this.#activePromises.size;
  }

  timerCount() {
    return this.#timers.size;
  }

  microtaskCount() {
    return this.#microtasks.length;
  }

  #trackResult(result) {
    if (!result || typeof result.then !== "function") return;
    let tracked;
    tracked = Promise.resolve(result)
      .catch(() => {})
      .finally(() => this.#activePromises.delete(tracked));
    this.#activePromises.add(tracked);
  }

  #runCallback(callback) {
    try {
      this.#trackResult(callback?.());
    } catch {}
  }

  #nextDueTimer() {
    return [...this.#timers.values()]
      .sort((left, right) => left.due - right.due || left.id - right.id)[0] || null;
  }

  async flush({ maxSteps = 100000 } = {}) {
    let steps = 0;
    let quietRounds = 0;
    while (steps < maxSteps) {
      steps += 1;
      let progressed = false;

      while (this.#microtasks.length) {
        progressed = true;
        const task = this.#microtasks.shift();
        this.#runCallback(task.callback);
      }

      const due = [...this.#timers.values()]
        .filter((timer) => timer.due <= this.#time)
        .sort((left, right) => left.due - right.due || left.id - right.id);
      for (const timer of due) {
        if (!this.#timers.delete(timer.id)) continue;
        progressed = true;
        this.#runCallback(timer.callback);
      }

      await Promise.resolve();
      if (this.#activePromises.size) {
        progressed = true;
        await Promise.allSettled([...this.#activePromises]);
      }
      await Promise.resolve();

      if (progressed || this.#microtasks.length || this.#activePromises.size) {
        quietRounds = 0;
        continue;
      }
      quietRounds += 1;
      // Some production callbacks intentionally use `void promise` from a
      // timer. A few quiet turns let those promises finish without coupling
      // the harness to their internal implementation.
      if (quietRounds >= 4) break;
    }
    if (steps >= maxSteps) throw new Error("deterministic-clock-did-not-stabilize");
    return this.#time;
  }

  async runAll({ maxSteps = 100000 } = {}) {
    let steps = 0;
    while (steps < maxSteps) {
      steps += 1;
      await this.flush({ maxSteps });
      const next = this.#nextDueTimer();
      if (!next) break;
      this.#time = Math.max(this.#time, next.due);
    }
    if (steps >= maxSteps) throw new Error("deterministic-clock-run-all-did-not-stabilize");
    return this.#time;
  }
}

function bucket() {
  return {
    count: 0,
    totalMs: 0,
    samples: [],
  };
}

function addSample(target, durationMs = 0) {
  const value = Math.max(0, Number(durationMs) || 0);
  target.count = (target.count || 0) + 1;
  if (Object.prototype.hasOwnProperty.call(target, "calls")) target.calls += 1;
  target.totalMs += value;
  target.samples.push(value);
}

function summarizeBucket(value) {
  const durations = summarizeDurations(value?.samples || []);
  return {
    count: value?.count || 0,
    totalMs: value?.totalMs || 0,
    p50Ms: durations.p50Ms,
    p95Ms: durations.p95Ms,
    maxMs: durations.maxMs,
  };
}

function clone(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function phaseRecord(name, startedAt, heapStart) {
  return {
    name,
    startedAt,
    finishedAt: null,
    durationMs: 0,
    heapStart,
    heapEnd: null,
    sdk: {
      methods: new Map(),
    },
    events: { ...eventRecord(), byRealm: new Map() },
    rendering: { ...renderingRecord(), byRealm: new Map() },
    reconcilers: new Map(),
    queues: new Map(),
    lifecycle: { ...lifecycleRecord(), byRealm: new Map() },
    caches: new Map(),
    timings: new Map(),
  };
}

function methodRecord() {
  return {
    calls: 0,
    totalMs: 0,
    samples: [],
    requestedIds: 0,
    returnedItems: 0,
    fullCalls: 0,
    filteredCalls: 0,
    idScopedCalls: 0,
    maxConcurrency: 0,
    errors: 0,
    byRealm: new Map(),
  };
}

function queueRecord() {
  return {
    currentDepth: 0,
    maxDepth: 0,
    taskQueued: 0,
    taskCompleted: 0,
    failed: 0,
    rejected: 0,
    conflicts: 0,
    waitSamples: [],
    serviceSamples: [],
    byRealm: new Map(),
  };
}

function eventRecord() {
  return {
    source: 0,
    snapshotsClassified: 0,
    immediate: 0,
    batchFlushes: 0,
    subscribers: 0,
    duplicate: 0,
    coalesced: 0,
    fanoutTotal: 0,
    fanoutMax: 0,
  };
}

function renderingRecord() {
  return {
    full: bucket(),
    incremental: bucket(),
    stale: 0,
    failed: 0,
    skipped: 0,
    dirtyIds: 0,
  };
}

function lifecycleRecord() {
  return {
    events: 0,
    epochInvalidations: 0,
    sceneChanges: 0,
    staleRequests: 0,
    timersCancelled: 0,
    listenersBeforeClose: 0,
    listenersAfterClose: 0,
    crossSceneWritesBlocked: 0,
  };
}

function cacheRecord() {
  return {
    samples: [],
    hits: 0,
    misses: 0,
    byRealm: new Map(),
  };
}

function applyQueueRecord(record, event, detail = {}) {
  const normalized = String(event || "");
  if (normalized === "queued") {
    record.taskQueued += 1;
    record.currentDepth += 1;
  }
  if (normalized === "completed") {
    record.taskCompleted += 1;
    record.currentDepth = Math.max(0, record.currentDepth - 1);
  }
  if (normalized === "failed") record.failed += 1;
  if (normalized === "rejected") record.rejected += 1;
  if (normalized === "conflict") record.conflicts += 1;
  const depth = Math.max(0, Number(detail.depth ?? record.currentDepth) || 0);
  record.currentDepth = depth;
  record.maxDepth = Math.max(record.maxDepth, depth);
  if (detail.waitMs !== undefined) record.waitSamples.push(Number(detail.waitMs) || 0);
  if (detail.serviceMs !== undefined) record.serviceSamples.push(Number(detail.serviceMs) || 0);
}

function applyEventRecord(record, type, count, fanout) {
  const normalized = String(type || "source");
  if (normalized === "source") record.source += count;
  else if (normalized === "classified") record.snapshotsClassified += count;
  else if (normalized === "immediate") record.immediate += count;
  else if (normalized === "batch") record.batchFlushes += count;
  else if (normalized === "subscriber") record.subscribers += count;
  else if (normalized === "duplicate") record.duplicate += count;
  else if (normalized === "coalesced") record.coalesced += count;
  if (fanout !== undefined) {
    const value = Math.max(0, Number(fanout) || 0);
    record.fanoutTotal += value;
    record.fanoutMax = Math.max(record.fanoutMax, value);
  }
}

function applyRenderRecord(record, mode, type, detail = {}) {
  const bucketRecord = mode === "incremental" ? record.incremental : record.full;
  const normalized = String(type || "");
  if (["queued", "started", "committed"].includes(normalized)) {
    if (normalized === "queued") bucketRecord.queued = (bucketRecord.queued || 0) + 1;
    if (normalized === "started") bucketRecord.started = (bucketRecord.started || 0) + 1;
    if (normalized === "committed") addSample(bucketRecord, Number(detail.durationMs) || 0);
  }
  if (normalized === "stale") {
    record.stale += 1;
    if (detail.superseded === true) record.skipped += 1;
  }
  if (normalized === "failed") record.failed += 1;
  record.dirtyIds += Math.max(0, Number(detail.dirtyIds ?? detail.itemIds?.length) || 0);
}

function applyLifecycleRecord(record, type, detail = {}) {
  record.events += 1;
  const normalized = String(type || "");
  if (normalized === "unload" || normalized === "invalidate") record.epochInvalidations += 1;
  if (normalized === "scene-change") record.sceneChanges += 1;
  if (normalized === "stale") record.staleRequests += 1;
  if (normalized === "timer-cancelled") record.timersCancelled += 1;
  if (normalized === "cross-scene-write") record.crossSceneWritesBlocked += 1;
  if (detail.listenersBeforeClose !== undefined) record.listenersBeforeClose += Number(detail.listenersBeforeClose) || 0;
  if (detail.listenersAfterClose !== undefined) record.listenersAfterClose += Number(detail.listenersAfterClose) || 0;
}

function reconcilerRecord() {
  return {
    passes: 0,
    desired: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    recovery: 0,
    watchdog: 0,
    samples: [],
    byRealm: new Map(),
  };
}

export function createPerformanceMetrics({
  enabled = false,
  clock = null,
} = {}) {
  const storage = new AsyncLocalStorage();
  const phases = new Map();
  const baseContext = { realm: "unscoped", controller: "driver" };
  let activePhase = null;

  const currentTime = () => (
    typeof clock?.now === "function" ? clock.now() : Date.now()
  );

  const heap = () => {
    try {
      return Number(process.memoryUsage().heapUsed);
    } catch {
      return null;
    }
  };

  function context() {
    return storage.getStore() || baseContext;
  }

  function withContext(nextContext, callback) {
    if (!enabled) return callback();
    return storage.run({ ...context(), ...nextContext }, callback);
  }

  function currentPhase(detail = {}) {
    const phase = String(detail.phase || context().phase || activePhase || "unscoped");
    if (!phases.has(phase)) phases.set(phase, phaseRecord(phase, currentTime(), heap()));
    return phases.get(phase);
  }

  function attribution(detail = {}) {
    const current = context();
    return {
      phase: String(detail.phase || current.phase || activePhase || "unscoped"),
      realm: String(detail.realm || current.realm || "unscoped"),
      controller: String(detail.controller || current.controller || "unknown"),
      correlationId: detail.correlationId || current.correlationId || null,
      commandId: detail.commandId || current.commandId || null,
      eventGeneration: detail.eventGeneration ?? current.eventGeneration ?? null,
    };
  }

  function beginPhase(name) {
    if (!enabled) return;
    const phase = String(name || "unscoped");
    phases.set(phase, phaseRecord(phase, currentTime(), heap()));
    activePhase = phase;
  }

  function finishPhase(name = activePhase) {
    if (!enabled) return null;
    const phase = phases.get(String(name || "unscoped"));
    if (!phase) return null;
    phase.finishedAt = currentTime();
    phase.durationMs = Math.max(0, phase.finishedAt - phase.startedAt);
    phase.heapEnd = heap();
    if (activePhase === phase.name) activePhase = null;
    return phase.durationMs;
  }

  function recordSdk(method, detail = {}) {
    if (!enabled) return;
    const at = attribution(detail);
    const phase = currentPhase(at);
    const name = String(method || "unknown");
    if (!phase.sdk.methods.has(name)) phase.sdk.methods.set(name, methodRecord());
    const record = phase.sdk.methods.get(name);
    const durationMs = Math.max(0, Number(detail.durationMs) || 0);
    addSample(record, durationMs);
    record.requestedIds += Math.max(0, Number(detail.requestedIds) || 0);
    record.returnedItems += Math.max(0, Number(detail.returnedItems) || 0);
    if (detail.full === true) record.fullCalls += 1;
    if (detail.filtered === true) record.filteredCalls += 1;
    if (detail.idScoped === true) record.idScopedCalls += 1;
    record.maxConcurrency = Math.max(record.maxConcurrency, Number(detail.concurrency) || 0);
    if (detail.error) record.errors += 1;
    const realmKey = `${at.realm}:${at.controller}`;
    if (!record.byRealm.has(realmKey)) record.byRealm.set(realmKey, methodRecord());
    const realmRecord = record.byRealm.get(realmKey);
    addSample(realmRecord, durationMs);
    realmRecord.requestedIds += Math.max(0, Number(detail.requestedIds) || 0);
    realmRecord.returnedItems += Math.max(0, Number(detail.returnedItems) || 0);
    if (detail.full === true) realmRecord.fullCalls += 1;
    if (detail.filtered === true) realmRecord.filteredCalls += 1;
    if (detail.idScoped === true) realmRecord.idScopedCalls += 1;
    realmRecord.maxConcurrency = Math.max(realmRecord.maxConcurrency, Number(detail.concurrency) || 0);
    if (detail.error) realmRecord.errors += 1;
  }

  function recordEvent(type, detail = {}) {
    if (!enabled) return;
    const at = attribution(detail);
    const events = currentPhase(at).events;
    const count = Math.max(1, Number(detail.count) || 1);
    applyEventRecord(events, type, count, detail.fanout);
    const realmKey = `${at.realm}:${at.controller}`;
    if (!events.byRealm.has(realmKey)) events.byRealm.set(realmKey, eventRecord());
    applyEventRecord(events.byRealm.get(realmKey), type, count, detail.fanout);
  }

  function recordRender(detail = {}) {
    if (!enabled) return;
    const at = attribution(detail);
    const phase = currentPhase(at);
    const mode = detail.mode === "incremental" ? "incremental" : "full";
    const type = String(detail.type || "");
    applyRenderRecord(phase.rendering, mode, type, detail);
    const realmKey = `${at.realm}:${at.controller}`;
    if (!phase.rendering.byRealm.has(realmKey)) phase.rendering.byRealm.set(realmKey, renderingRecord());
    applyRenderRecord(phase.rendering.byRealm.get(realmKey), mode, type, detail);
  }

  function recordReconcile(kind, detail = {}) {
    if (!enabled) return;
    const phase = currentPhase(attribution(detail));
    const name = String(kind || "unknown");
    if (!phase.reconcilers.has(name)) phase.reconcilers.set(name, reconcilerRecord());
    const record = phase.reconcilers.get(name);
    const passes = Math.max(1, Math.floor(Number(detail.passes) || 1));
    record.passes += passes;
    record.desired += Math.max(0, Number(detail.desired) || 0);
    record.added += Math.max(0, Number(detail.added) || 0);
    record.updated += Math.max(0, Number(detail.updated) || 0);
    record.deleted += Math.max(0, Number(detail.deleted) || 0);
    record.recovery += detail.recovery === true ? 1 : 0;
    record.watchdog += detail.watchdog === true ? 1 : 0;
    addSample(record, Number(detail.durationMs) || 0);
    const realm = String(detail.realm || context().realm || "unscoped");
    if (!record.byRealm.has(realm)) record.byRealm.set(realm, reconcilerRecord());
    const byRealm = record.byRealm.get(realm);
    byRealm.passes += passes;
    byRealm.desired += Math.max(0, Number(detail.desired) || 0);
    byRealm.added += Math.max(0, Number(detail.added) || 0);
    byRealm.updated += Math.max(0, Number(detail.updated) || 0);
    byRealm.deleted += Math.max(0, Number(detail.deleted) || 0);
    byRealm.recovery += detail.recovery === true ? 1 : 0;
    byRealm.watchdog += detail.watchdog === true ? 1 : 0;
    addSample(byRealm, Number(detail.durationMs) || 0);
  }

  function recordQueue(name, detail = {}) {
    if (!enabled) return;
    const at = attribution(detail);
    const phase = currentPhase(at);
    const key = String(name || "unknown");
    if (!phase.queues.has(key)) phase.queues.set(key, queueRecord());
    const record = phase.queues.get(key);
    applyQueueRecord(record, detail.event, detail);
    const realmKey = `${at.realm}:${at.controller}`;
    if (!record.byRealm.has(realmKey)) record.byRealm.set(realmKey, queueRecord());
    applyQueueRecord(record.byRealm.get(realmKey), detail.event, detail);
  }

  function recordLifecycle(type, detail = {}) {
    if (!enabled) return;
    const at = attribution(detail);
    const lifecycle = currentPhase(at).lifecycle;
    applyLifecycleRecord(lifecycle, type, detail);
    const realmKey = `${at.realm}:${at.controller}`;
    if (!lifecycle.byRealm.has(realmKey)) lifecycle.byRealm.set(realmKey, lifecycleRecord());
    applyLifecycleRecord(lifecycle.byRealm.get(realmKey), type, detail);
  }

  function recordCache(name, detail = {}) {
    if (!enabled) return;
    const at = attribution(detail);
    const phase = currentPhase(at);
    const key = String(name || "unknown");
    if (!phase.caches.has(key)) phase.caches.set(key, cacheRecord());
    const record = phase.caches.get(key);
    const apply = (target) => {
      if (detail.hit === true) target.hits += 1;
      if (detail.miss === true) target.misses += 1;
      if (detail.size !== undefined) target.samples.push(Number(detail.size) || 0);
    };
    apply(record);
    const realmKey = `${at.realm}:${at.controller}`;
    if (!record.byRealm.has(realmKey)) record.byRealm.set(realmKey, cacheRecord());
    apply(record.byRealm.get(realmKey));
  }

  function recordTiming(name, durationMs, detail = {}) {
    if (!enabled) return;
    const phase = currentPhase(attribution(detail));
    const key = String(name || "unknown");
    if (!phase.timings.has(key)) phase.timings.set(key, []);
    phase.timings.get(key).push(Math.max(0, Number(durationMs) || 0));
  }

  function formatMethod(value) {
    return {
      ...summarizeBucket(value),
      calls: value.calls || value.count || 0,
      requestedIds: value.requestedIds || 0,
      returnedItems: value.returnedItems || 0,
      fullCalls: value.fullCalls || 0,
      filteredCalls: value.filteredCalls || 0,
      idScopedCalls: value.idScopedCalls || 0,
      maxConcurrency: value.maxConcurrency || 0,
      serialObserved: (value.maxConcurrency || 0) <= 1,
      errors: value.errors || 0,
      byRealm: Object.fromEntries([...value.byRealm.entries()].map(([key, item]) => [key, formatMethod(item)])),
    };
  }

  function formatQueue(value) {
    return {
      currentDepth: value.currentDepth,
      maxDepth: value.maxDepth,
      taskQueued: value.taskQueued,
      taskCompleted: value.taskCompleted,
      failed: value.failed,
      rejected: value.rejected,
      conflicts: value.conflicts,
      wait: summarizeDurations(value.waitSamples),
      service: summarizeDurations(value.serviceSamples),
      byRealm: Object.fromEntries([...(value.byRealm || new Map()).entries()]
        .map(([key, item]) => [key, formatQueue(item)])),
    };
  }

  function formatEvents(value) {
    return {
      source: value.source,
      snapshotsClassified: value.snapshotsClassified,
      immediate: value.immediate,
      batchFlushes: value.batchFlushes,
      subscribers: value.subscribers,
      duplicate: value.duplicate,
      coalesced: value.coalesced,
      fanoutTotal: value.fanoutTotal,
      fanoutMax: value.fanoutMax,
      fanoutAverage: value.source ? value.fanoutTotal / value.source : 0,
      byRealm: Object.fromEntries([...(value.byRealm || new Map()).entries()]
        .map(([key, item]) => [key, formatEvents(item)])),
    };
  }

  function formatRendering(value) {
    return {
      full: summarizeBucket(value.full),
      incremental: summarizeBucket(value.incremental),
      queuedFull: value.full.queued || 0,
      queuedIncremental: value.incremental.queued || 0,
      startedFull: value.full.started || 0,
      startedIncremental: value.incremental.started || 0,
      stale: value.stale,
      failed: value.failed,
      skipped: value.skipped,
      dirtyIds: value.dirtyIds,
      byRealm: Object.fromEntries([...(value.byRealm || new Map()).entries()]
        .map(([key, item]) => [key, formatRendering(item)])),
    };
  }

  function formatReconciler(value) {
    return {
      passes: value.passes,
      desired: value.desired,
      added: value.added,
      updated: value.updated,
      deleted: value.deleted,
      recovery: value.recovery,
      watchdog: value.watchdog,
      duration: summarizeBucket(value),
      byRealm: Object.fromEntries([...value.byRealm.entries()].map(([key, item]) => [key, formatReconciler(item)])),
    };
  }

  function formatLifecycle(value) {
    return {
      events: value.events,
      epochInvalidations: value.epochInvalidations,
      sceneChanges: value.sceneChanges,
      staleRequests: value.staleRequests,
      timersCancelled: value.timersCancelled,
      listenersBeforeClose: value.listenersBeforeClose,
      listenersAfterClose: value.listenersAfterClose,
      crossSceneWritesBlocked: value.crossSceneWritesBlocked,
      byRealm: Object.fromEntries([...(value.byRealm || new Map()).entries()]
        .map(([key, item]) => [key, formatLifecycle(item)])),
    };
  }

  function formatCache(value) {
    return {
      hits: value.hits,
      misses: value.misses,
      size: value.samples.length ? value.samples.at(-1) : 0,
      sizeSamples: value.samples.slice(),
      byRealm: Object.fromEntries([...(value.byRealm || new Map()).entries()]
        .map(([key, item]) => [key, formatCache(item)])),
    };
  }

  function formatPhase(phase) {
    return {
      name: phase.name,
      durationMs: phase.durationMs,
      heap: { start: phase.heapStart, end: phase.heapEnd },
      sdk: { methods: Object.fromEntries([...phase.sdk.methods.entries()].map(([key, value]) => [key, formatMethod(value)])) },
      events: formatEvents(phase.events),
      rendering: formatRendering(phase.rendering),
      reconcilers: Object.fromEntries([...phase.reconcilers.entries()].map(([key, value]) => [key, formatReconciler(value)])),
      queues: Object.fromEntries([...phase.queues.entries()].map(([key, value]) => [key, formatQueue(value)])),
      lifecycle: formatLifecycle(phase.lifecycle),
      caches: Object.fromEntries([...phase.caches.entries()]
        .map(([key, value]) => [key, formatCache(value)])),
      timings: Object.fromEntries([...phase.timings.entries()].map(([key, value]) => [key, summarizeDurations(value)])),
    };
  }

  function snapshot() {
    if (!enabled) return { enabled: false, phases: [] };
    return {
      enabled: true,
      phases: [...phases.values()].map(formatPhase),
    };
  }

  return Object.freeze({
    enabled,
    context,
    withContext,
    beginPhase,
    finishPhase,
    recordSdk,
    recordEvent,
    recordRender,
    recordReconcile,
    recordQueue,
    recordLifecycle,
    recordCache,
    recordTiming,
    snapshot,
    get activePhase() { return activePhase; },
  });
}
