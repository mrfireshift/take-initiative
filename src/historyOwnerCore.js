export const HISTORY_OWNER_MAX_ENTRIES = 30;

export const HISTORY_OWNER_STATUS = Object.freeze({
  APPLIED: "appended",
  DUPLICATE: "duplicate",
  REMOVED: "removed",
  NOOP: "noop",
  CLEARED: "cleared",
  CONFLICT: "conflict",
  REJECTED: "rejected",
  FAILED: "failed",
});

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return !!value && typeof value === "object";
}



function stableSemanticValue(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("history-value-must-not-be-cyclic");
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((item) => stableSemanticValue(item, seen));
    seen.delete(value);
    return output;
  }
  const output = Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableSemanticValue(value[key], seen)]),
  );
  seen.delete(value);
  return output;
}

function historyStorageValuesEqual(left, right) {
  try {
    return JSON.stringify(stableSemanticValue(left))
      === JSON.stringify(stableSemanticValue(right));
  } catch {
    return false;
  }
}

export function compactHistoryEntryForStorage(value) {
  if (!isObject(value) || Array.isArray(value)) return clone(value);
  const compact = clone(value);
  const mutation = compact.effectsMutation;
  if (isObject(mutation) && !Array.isArray(mutation)) {
    if (
      Array.isArray(compact.changes)
      && Array.isArray(mutation.changes)
      && historyStorageValuesEqual(compact.changes, mutation.changes)
    ) {
      delete mutation.changes;
    }
    if (Array.isArray(mutation.sideEffects) && mutation.sideEffects.length === 0) {
      delete mutation.sideEffects;
    }
  }
  return compact;
}

function semanticHistoryEntryValue(value) {
  if (!isObject(value) || Array.isArray(value)) return value;
  const semantic = compactHistoryEntryForStorage(value);
  // storeSeq belongs to the History owner, not to the action payload. Ignore
  // only this top-level transport field so nested domain data remains strict.
  delete semantic.storeSeq;
  return semantic;
}

export function semanticHistoryEqual(left, right) {
  try {
    return JSON.stringify(stableSemanticValue(semanticHistoryEntryValue(left)))
      === JSON.stringify(stableSemanticValue(semanticHistoryEntryValue(right)));
  } catch {
    return left === right;
  }
}

export function normalizeHistoryState(
  value,
  {
    maxEntries = HISTORY_OWNER_MAX_ENTRIES,
    version = 1,
    roomId = "",
  } = {},
) {
  const root = isObject(value) && !Array.isArray(value) ? clone(value) : {};
  const normalizedRoomId = String(roomId || "").trim();
  const storedRoomId = String(root.roomId || "").trim();
  const rawEntries = normalizedRoomId && storedRoomId !== normalizedRoomId
    ? []
    : (Array.isArray(root.entries) ? root.entries.filter(Boolean) : []);
  const limit = Math.max(1, Math.floor(Number(maxEntries) || HISTORY_OWNER_MAX_ENTRIES));
  const maxExistingSeq = rawEntries.reduce((max, e) => {
    const s = Number(e?.storeSeq);
    return Number.isFinite(s) && s > max ? s : max;
  }, 0);
  const seq = Number.isFinite(root.seq) ? Number(root.seq) : maxExistingSeq;
  return {
    ...root,
    version,
    seq,
    ...(normalizedRoomId ? { roomId: normalizedRoomId } : {}),
    // La normalizzazione non deve mai espellere Undo validi per un budget
    // arbitrario piu basso del limite Owlbear. Compattiamo solo ridondanze
    // semantiche e manteniamo la retention canonica per conteggio.
    entries: rawEntries.slice(-limit).map((entry) => compactHistoryEntryForStorage(entry)),
  };
}

function result(status, history, extra = {}) {
  return {
    status,
    changed: false,
    history,
    ...extra,
  };
}

function historyEntryOrderValue(entry) {
  const at = Number(entry?.at) || 0;
  const storeSeq = Number(entry?.storeSeq);
  return {
    at,
    hasStoreSeq: Number.isFinite(storeSeq),
    storeSeq: Number.isFinite(storeSeq) ? storeSeq : 0,
    id: String(entry?.id || ""),
  };
}

export function compareHistoryEntries(a, b) {
  const ordA = historyEntryOrderValue(a);
  const ordB = historyEntryOrderValue(b);
  // `at` belongs to the action and survives retries/reloads. The owner-only
  // storeSeq is a deterministic tie-breaker for actions created in the same
  // millisecond, not a replacement for action chronology.
  if (ordA.at !== ordB.at) {
    return ordA.at - ordB.at;
  }
  if (ordA.hasStoreSeq && ordB.hasStoreSeq && ordA.storeSeq !== ordB.storeSeq) {
    return ordA.storeSeq - ordB.storeSeq;
  }
  return ordA.id.localeCompare(ordB.id);
}

export function appendHistoryEntry(
  historyValue,
  entry,
  options = {},
) {
  const history = normalizeHistoryState(historyValue, options);
  const entryId = String(entry?.id || "").trim();
  if (!entryId) {
    return result(HISTORY_OWNER_STATUS.REJECTED, history, {
      reason: "entry-id-required",
    });
  }

  const existing = history.entries.find((candidate) => String(candidate?.id || "") === entryId);
  if (existing) {
    if (semanticHistoryEqual(existing, entry)) {
      return result(HISTORY_OWNER_STATUS.DUPLICATE, history, {
        entry: clone(existing),
      });
    }
    return result(HISTORY_OWNER_STATUS.CONFLICT, history, {
      entry: clone(existing),
      conflict: {
        entryId,
        reason: "entry-id-payload-mismatch",
        existing: clone(existing),
        incoming: clone(entry),
      },
    });
  }

  const limit = Math.max(1, Math.floor(Number(options.maxEntries) || HISTORY_OWNER_MAX_ENTRIES));
  // Compatta sempre la rappresentazione persistita senza perdere semantica Undo.
  // In particolare, non salviamo due copie identiche di `changes`.
  let assignedEntry = compactHistoryEntryForStorage(entry);
  let nextSeq = Number(history.seq) || 0;
  if (!Number.isFinite(Number(assignedEntry?.storeSeq))) {
    nextSeq += 1;
    assignedEntry.storeSeq = nextSeq;
  } else {
    const existingSeq = Number(assignedEntry.storeSeq);
    if (existingSeq > nextSeq) nextSeq = existingSeq;
  }

  const entries = [...history.entries];
  let insertIdx = entries.length;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (compareHistoryEntries(assignedEntry, entries[i]) < 0) {
      insertIdx = i;
    } else {
      break;
    }
  }
  entries.splice(insertIdx, 0, clone(assignedEntry));
  const nextHistory = {
    ...history,
    seq: nextSeq,
    entries: entries.slice(-limit),
  };
  return result(HISTORY_OWNER_STATUS.APPLIED, nextHistory, {
    changed: true,
    entry: clone(assignedEntry),
  });
}

export function removeHistoryEntries(
  historyValue,
  ids,
  options = {},
) {
  const history = normalizeHistoryState(historyValue, options);
  const wanted = new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  if (!wanted.size) return result(HISTORY_OWNER_STATUS.NOOP, history, { removedIds: [] });

  const removedIds = [];
  const entries = history.entries.filter((entry) => {
    const id = String(entry?.id || "");
    if (!wanted.has(id)) return true;
    removedIds.push(id);
    return false;
  });
  if (!removedIds.length) return result(HISTORY_OWNER_STATUS.NOOP, history, { removedIds });

  return result(HISTORY_OWNER_STATUS.REMOVED, {
    ...history,
    entries,
  }, {
    changed: true,
    removedIds,
  });
}

export function clearHistoryEntries(historyValue, options = {}) {
  const history = normalizeHistoryState(historyValue, options);
  if (!history.entries.length) return result(HISTORY_OWNER_STATUS.NOOP, history, { removedIds: [] });
  return result(HISTORY_OWNER_STATUS.CLEARED, {
    ...history,
    entries: [],
  }, {
    changed: true,
    removedIds: history.entries.map((entry) => entry?.id).filter(Boolean),
  });
}

function serializedError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "History owner command failed."),
  };
}

function commandBase(command, scene) {
  return {
    requestId: String(command?.requestId || ""),
    commandId: String(command?.commandId || command?.requestId || ""),
    correlationId: String(command?.correlationId || command?.commandId || command?.requestId || ""),
    sceneIdentity: scene.identity,
    sceneEpoch: scene.epoch,
  };
}

function rejected(command, scene, reason) {
  return {
    ...commandBase(command, scene),
    status: HISTORY_OWNER_STATUS.REJECTED,
    reason,
    changed: false,
  };
}

/**
 * Serializes History commands while leaving scene transport and metadata APIs
 * to the runtime adapter.  The adapter must replace the scene context on
 * every scene transition; a captured context is never compared with a
 * caller's numeric epoch.
 */
export function createHistoryOwnerBroker({
  readHistory,
  writeHistory,
  notify = async () => {},
  recordCombatLog = async () => {},
  normalizeHistory = (value, options) => normalizeHistoryState(value, options),
  maxEntries = HISTORY_OWNER_MAX_ENTRIES,
  isSceneCurrent = () => true,
  maxResults = 256,
} = {}) {
  if (typeof readHistory !== "function") throw new TypeError("readHistory must be a function");
  if (typeof writeHistory !== "function") throw new TypeError("writeHistory must be a function");

  let scene = {
    ready: false,
    identity: null,
    epoch: null,
    generation: 0,
  };
  let queue = Promise.resolve();
  const results = new Map();
  const inFlight = new Map();
  // Reserve append order when the owner first accepts an entry, before the
  // metadata write. A failed write therefore cannot let a later entry jump
  // ahead of the retried action. Reservations live for the scene context.
  const appendOrderReservations = new Map();
  let nextReservedStoreSeq = 0;

  function captureScene() {
    return { ...scene };
  }

  function isCurrent(captured) {
    if (!captured?.ready || !captured.identity) return false;
    if (
      scene.generation !== captured.generation
      || scene.identity !== captured.identity
      || scene.epoch !== captured.epoch
      || scene.ready !== true
    ) return false;
    try {
      return isSceneCurrent(captured);
    } catch {
      return false;
    }
  }

  function setSceneContext({ ready = false, sceneIdentity = null, sceneEpoch = null } = {}) {
    const requestedIdentity = String(sceneIdentity || "").trim() || null;
    const nextReady = ready === true && !!requestedIdentity;

    // A readiness event can be delivered more than once while a command is
    // in flight. Keep the current owner context stable for the same epoch;
    // otherwise the duplicate would clear the result cache and make the
    // in-flight command look stale for no reason.
    if (scene.ready && nextReady && scene.epoch === sceneEpoch && scene.identity) {
      return captureScene();
    }
    if (!scene.ready && !nextReady) return captureScene();

    scene = {
      ready: nextReady,
      identity: nextReady ? requestedIdentity : null,
      epoch: nextReady ? sceneEpoch : null,
      generation: scene.generation + 1,
    };
    queue = Promise.resolve();
    results.clear();
    inFlight.clear();
    appendOrderReservations.clear();
    nextReservedStoreSeq = 0;
    return captureScene();
  }

  function getSceneContext() {
    return captureScene();
  }

  function remember(requestId, task, captured) {
    if (!requestId) return;
    task.then((value) => {
      // A task from the previous scene may settle after the context was
      // invalidated. It must not repopulate the cache belonging to the new
      // scene with a stale response.
      if (!isCurrent(captured)) return;
      results.set(requestId, value);
      if (results.size > Math.max(1, Number(maxResults) || 256)) {
        results.delete(results.keys().next().value);
      }
    }).catch(() => {});
  }

  async function execute(command, captured) {
    const base = commandBase(command, captured);
    if (!isCurrent(captured)) return rejected(command, captured, "stale-scene");

    let rawHistory;
    let preparedAppendEntry = null;
    try {
      rawHistory = await readHistory({ command, scene: captured });
      if (!isCurrent(captured)) return rejected(command, captured, "stale-after-history-read");

      const history = normalizeHistory(rawHistory, { maxEntries });
      let outcome;
      if (command.kind === "append") {
        const entryId = String(command?.entry?.id || "").trim();
        const persistedSeq = Number(history?.seq) || 0;
        if (persistedSeq > nextReservedStoreSeq) nextReservedStoreSeq = persistedSeq;

        let reservedStoreSeq = Number(command?.entry?.storeSeq);
        if (!Number.isFinite(reservedStoreSeq)) {
          reservedStoreSeq = appendOrderReservations.get(entryId);
        }
        if (!Number.isFinite(reservedStoreSeq)) {
          nextReservedStoreSeq += 1;
          reservedStoreSeq = nextReservedStoreSeq;
        } else if (reservedStoreSeq > nextReservedStoreSeq) {
          nextReservedStoreSeq = reservedStoreSeq;
        }
        if (entryId) appendOrderReservations.set(entryId, reservedStoreSeq);

        preparedAppendEntry = {
          ...clone(command.entry),
          storeSeq: reservedStoreSeq,
        };
        outcome = appendHistoryEntry(history, preparedAppendEntry, { maxEntries });
      } else if (command.kind === "remove") {
        outcome = removeHistoryEntries(history, command.ids, { maxEntries });
      } else if (command.kind === "clear") {
        outcome = clearHistoryEntries(history, { maxEntries });
      } else {
        return { ...base, status: HISTORY_OWNER_STATUS.REJECTED, reason: "unknown-command", changed: false };
      }

      if (outcome.status === HISTORY_OWNER_STATUS.CONFLICT
        || outcome.status === HISTORY_OWNER_STATUS.REJECTED) {
        return { ...base, ...outcome, history: undefined };
      }
      if (!outcome.changed) {
        return { ...base, ...outcome, history: undefined };
      }

      if (!isCurrent(captured)) return rejected(command, captured, "stale-before-history-write");
      await writeHistory(outcome.history, { command, scene: captured });
      if (!isCurrent(captured)) {
        return {
          ...base,
          status: HISTORY_OWNER_STATUS.REJECTED,
          reason: "stale-after-history-write",
          changed: false,
          committed: true,
        };
      }

      const postCommitErrors = [];
      if (command.kind === "append") {
        try {
          if (!isCurrent(captured)) throw new Error("stale-before-history-notification");
          await notify({
            ...base,
            entry: clone(command.entry),
            status: outcome.status,
          }, { command, scene: captured });
          if (!isCurrent(captured)) throw new Error("stale-after-history-notification");
        } catch (error) {
          postCommitErrors.push({ phase: "history-notification", ...serializedError(error) });
        }
        try {
          if (!isCurrent(captured)) throw new Error("stale-before-combat-log");
          await recordCombatLog(clone(command.entry), { command, scene: captured });
          if (!isCurrent(captured)) throw new Error("stale-after-combat-log");
        } catch (error) {
          postCommitErrors.push({ phase: "combat-log", ...serializedError(error) });
        }
      } else {
        try {
          if (!isCurrent(captured)) throw new Error("stale-before-history-notification");
          await notify({ ...base, status: outcome.status }, { command, scene: captured });
          if (!isCurrent(captured)) throw new Error("stale-after-history-notification");
        } catch (error) {
          postCommitErrors.push({ phase: "history-notification", ...serializedError(error) });
        }
      }

      return {
        ...base,
        status: outcome.status,
        changed: true,
        entry: outcome.entry,
        removedIds: outcome.removedIds,
        postCommitErrors,
      };
    } catch (error) {
      return {
        ...base,
        status: HISTORY_OWNER_STATUS.FAILED,
        changed: false,
        ...(preparedAppendEntry ? { entry: clone(preparedAppendEntry) } : {}),
        error: serializedError(error),
      };
    }
  }

  async function handle(command = {}) {
    const requestId = String(command.requestId || "").trim();
    const kind = String(command.kind || "").trim();
    const current = captureScene();
    if (kind === "context") {
      return current.ready
        ? {
          ...commandBase(command, current),
          status: HISTORY_OWNER_STATUS.APPLIED,
          sceneIdentity: current.identity,
        }
        : rejected(command, current, "scene-not-ready");
    }
    if (!requestId) return rejected(command, current, "request-id-required");
    if (results.has(requestId)) return clone(results.get(requestId));
    if (inFlight.has(requestId)) return inFlight.get(requestId);
    if (!current.ready) return rejected(command, current, "scene-not-ready");
    if (String(command.sceneIdentity || "") !== current.identity) {
      return rejected(command, current, "stale-scene-identity");
    }

    const captured = current;
    const task = queue.then(
      () => execute(command, captured),
      () => execute(command, captured),
    );
    queue = task.catch(() => {});
    inFlight.set(requestId, task);
    remember(requestId, task, captured);
    task.finally(() => {
      if (inFlight.get(requestId) === task) inFlight.delete(requestId);
    }).catch(() => {});
    return task;
  }

  return {
    handle,
    setSceneContext,
    getSceneContext,
    clear: () => setSceneContext(),
    getState: () => ({
      scene: captureScene(),
      queued: !!queue,
      pending: inFlight.size,
      cachedResults: results.size,
    }),
  };
}
