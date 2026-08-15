export const INITIATIVE_STATE_STATUS = Object.freeze({
  APPLIED: "applied",
  UNCHANGED: "unchanged",
  DUPLICATE: "duplicate",
  CONFLICT: "conflict",
  REJECTED: "rejected",
  FAILED: "failed",
});

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("initiative-state-value-must-not-be-cyclic");
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((entry) => stableValue(entry, seen));
    seen.delete(value);
    return output;
  }
  const output = Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, stableValue(value[key], seen)]),
  );
  seen.delete(value);
  return output;
}

export function semanticInitiativeStateEqual(left, right) {
  try {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  } catch {
    return left === right;
  }
}

export function normalizeInitiativeState(value) {
  const root = isRecord(value) ? clone(value) : {};
  return {
    ...root,
    order: Array.isArray(root.order) ? root.order.slice() : [],
    current: Number.isFinite(Number(root.current))
      ? Math.floor(Number(root.current))
      : 0,
    round: Math.max(1, Number.isFinite(Number(root.round))
      ? Math.floor(Number(root.round))
      : 1),
    collapsed: isRecord(root.collapsed) ? clone(root.collapsed) : {},
  };
}

function serializedError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Initiative state command failed."),
  };
}

function normalizeFields(fields) {
  return Array.from(new Set(
    (Array.isArray(fields) ? fields : [])
      .map((field) => String(field || "").trim())
      .filter(Boolean),
  ));
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function fieldChanged(previous, next, field) {
  const previousHas = own(previous, field);
  const nextHas = own(next, field);
  if (previousHas !== nextHas) return true;
  return previousHas && !semanticInitiativeStateEqual(previous[field], next[field]);
}

function changedFields(previous, next) {
  const fields = new Set([
    ...Object.keys(previous || {}),
    ...Object.keys(next || {}),
  ]);
  return [...fields].filter((field) => fieldChanged(previous, next, field));
}

function copyFields(source, fields) {
  const output = {};
  for (const field of fields) {
    if (own(source, field)) output[field] = clone(source[field]);
  }
  return output;
}

function normalizeSceneContext(value, fallback = {}) {
  const source = isRecord(value) ? value : {};
  const identity = String(source.identity ?? source.sceneIdentity ?? fallback.identity ?? "").trim();
  const epoch = source.epoch ?? source.sceneEpoch ?? fallback.epoch ?? 0;
  return {
    ready: source.ready !== false,
    identity: identity || null,
    epoch,
  };
}

function sceneKey(scene) {
  return `${scene.identity || ""}:${String(scene.epoch ?? "")}:${scene.ready ? "ready" : "unready"}`;
}

function commandBase(command, scene) {
  return {
    commandId: String(command.commandId || ""),
    sceneIdentity: scene.identity,
    sceneEpoch: scene.epoch,
  };
}

function rejected(command, scene, reason, extra = {}) {
  return {
    ...commandBase(command, scene),
    status: INITIATIVE_STATE_STATUS.REJECTED,
    changed: false,
    applied: false,
    committed: false,
    reason,
    ...extra,
  };
}

function fingerprintFor(command) {
  const payload = command.payload !== undefined
    ? command.payload
    : {
      operation: command.operation || command.kind || "patch",
      patch: command.patch,
      reducer: typeof command.reducer === "function" ? String(command.reducer) : undefined,
      ownedFields: command.ownedFields,
      expected: command.expected,
    };
  try {
    return JSON.stringify(stableValue(payload));
  } catch {
    return String(payload);
  }
}

function fieldsMatch(state, expected, fields) {
  return fields.every((field) => {
    const expectedHas = own(expected, field);
    const stateHas = own(state, field);
    if (expectedHas !== stateHas) return false;
    return !expectedHas || semanticInitiativeStateEqual(state[field], expected[field]);
  });
}

function readBackMatches(state, next, fields) {
  return fields.every((field) => semanticInitiativeStateEqual(state?.[field], next?.[field]));
}

function isAmbiguousWriteError(error) {
  if (error?.ambiguous === true || error?.committed === "unknown") return true;
  const code = String(error?.code || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return code.includes("timeout")
    || code.includes("aborted")
    || name.includes("timeout")
    || name.includes("abort")
    || message.includes("timeout")
    || message.includes("timed out");
}

/**
 * Runtime-independent owner for the initiative state metadata value.
 *
 * The owner deliberately accepts patches/reducers, never a stale full-state
 * replacement. The transport adapter supplies the SDK read/write functions;
 * tests can therefore force every await interleaving without importing OBR.
 */
export function createInitiativeStateGateway({
  readState,
  writeState,
  getRole = async () => "GM",
  getSceneContext = null,
  isSceneCurrent = () => true,
  initialSceneContext = { ready: true, identity: "runtime", epoch: 0 },
  readBack = true,
  maxCachedResults = 256,
} = {}) {
  if (typeof readState !== "function") throw new TypeError("readState must be a function");
  if (typeof writeState !== "function") throw new TypeError("writeState must be a function");

  let manualScene = normalizeSceneContext(initialSceneContext);
  let scene = manualScene;
  let generation = 0;
  let lastSceneKey = null;
  let queue = Promise.resolve();
  let sequence = 0;
  const records = new Map();
  const inFlight = new Map();

  function currentScene() {
    let raw = manualScene;
    if (typeof getSceneContext === "function") {
      try { raw = getSceneContext(); } catch { raw = { ready: false }; }
    }
    const next = normalizeSceneContext(raw, manualScene);
    const nextKey = sceneKey(next);
    if (lastSceneKey !== null && nextKey !== lastSceneKey) {
      generation += 1;
      records.clear();
      inFlight.clear();
    }
    scene = { ...next, generation };
    lastSceneKey = nextKey;
    return scene;
  }

  function setSceneContext(next = {}) {
    manualScene = normalizeSceneContext(next, manualScene);
    if (typeof getSceneContext !== "function") currentScene();
    else {
      generation += 1;
      records.clear();
      inFlight.clear();
      scene = { ...manualScene, generation };
      lastSceneKey = sceneKey(scene);
    }
    return { ...scene };
  }

  function resetSceneScope() {
    generation += 1;
    records.clear();
    inFlight.clear();
    return { ...currentScene() };
  }

  function isCurrent(captured) {
    const live = currentScene();
    if (!live.ready || live.generation !== captured?.generation) return false;
    if (live.identity !== (captured?.identity || null)) return false;
    if (String(live.epoch ?? "") !== String(captured?.epoch ?? "")) return false;
    try {
      return isSceneCurrent(captured) !== false;
    } catch {
      return false;
    }
  }

  async function readAtHead(command, captured) {
    if (!isCurrent(captured)) return { stale: true };
    const raw = await readState({ command, scene: captured });
    if (!isCurrent(captured)) return { stale: true };
    return { value: normalizeInitiativeState(raw), stale: false };
  }

  async function verifyAfterCommit(command, captured, next, fields) {
    if ((command.readBack === undefined ? readBack : command.readBack) !== true) {
      return { state: null, errors: [] };
    }
    if (!isCurrent(captured)) {
      return {
        state: null,
        errors: [{ phase: "read-back", reason: "stale-after-write" }],
        stale: true,
      };
    }
    try {
      const raw = await readState({ command, scene: captured, phase: "read-back" });
      if (!isCurrent(captured)) {
        return {
          state: null,
          errors: [{ phase: "read-back", reason: "stale-after-read" }],
          stale: true,
        };
      }
      const state = normalizeInitiativeState(raw);
      return {
        state,
        errors: readBackMatches(state, next, fields)
          ? []
          : [{ phase: "read-back", reason: "owned-fields-mismatch", fields }],
        stale: false,
      };
    } catch (error) {
      return {
        state: null,
        errors: [{ phase: "read-back", error: serializedError(error) }],
        stale: false,
      };
    }
  }

  async function execute(command, captured) {
    const base = commandBase(command, captured);
    if (!isCurrent(captured)) return rejected(command, captured, "stale-before-command");

    let role;
    try {
      role = await getRole({ command, scene: captured });
    } catch (error) {
      return rejected(command, captured, "role-unavailable", { error: serializedError(error) });
    }
    if (!isCurrent(captured)) return rejected(command, captured, "stale-after-role");
    if (String(role || "PLAYER").toUpperCase() !== "GM") {
      return rejected(command, captured, "player-not-authorized");
    }

    const read = await readAtHead(command, captured);
    if (read.stale) return rejected(command, captured, "stale-after-state-read");
    const previous = read.value;

    let suppliedPatch = command.patch;
    let candidate;
    let fields = normalizeFields(command.ownedFields);
    try {
      if (typeof command.reducer === "function") {
        candidate = await command.reducer(clone(previous), {
          command,
          scene: captured,
          previous: clone(previous),
        });
        if (!isCurrent(captured)) return rejected(command, captured, "stale-after-reducer");
        if (!isRecord(candidate)) {
          return rejected(command, captured, "reducer-must-return-object");
        }
        if (!fields.length) fields = changedFields(previous, candidate);
        suppliedPatch = candidate;
      } else {
        if (!isRecord(suppliedPatch)) return rejected(command, captured, "patch-must-be-object");
        if (!fields.length && Object.keys(suppliedPatch).length) {
          return rejected(command, captured, "owned-fields-required-for-patch");
        }
        if (!fields.length) fields = Object.keys(suppliedPatch);
        const unowned = Object.keys(suppliedPatch).filter((field) => !fields.includes(field));
        if (unowned.length) {
          return rejected(command, captured, "patch-contains-unowned-fields", { fields: unowned });
        }
      }
    } catch (error) {
      return {
        ...base,
        status: INITIATIVE_STATE_STATUS.FAILED,
        changed: false,
        applied: false,
        committed: false,
        error: serializedError(error),
      };
    }

    if (!fields.length) {
      return {
        ...base,
        status: INITIATIVE_STATE_STATUS.UNCHANGED,
        changed: false,
        applied: false,
        committed: false,
      };
    }
    const expected = isRecord(command.expected) ? command.expected : null;
    if (expected) {
      const expectedFields = Object.keys(expected);
      const unownedExpected = expectedFields.filter((field) => !fields.includes(field));
      if (unownedExpected.length) {
        return rejected(command, captured, "expected-contains-unowned-fields", { fields: unownedExpected });
      }
      if (!fieldsMatch(previous, expected, expectedFields)) {
        return {
          ...base,
          status: INITIATIVE_STATE_STATUS.CONFLICT,
          changed: false,
          applied: false,
          committed: false,
          conflict: {
            reason: "owned-fields-baseline-mismatch",
            fields: expectedFields,
          },
        };
      }
    }

    const patch = copyFields(suppliedPatch, fields);
    const next = { ...previous, ...patch };
    const changed = fields.filter((field) => fieldChanged(previous, next, field));
    if (!changed.length) {
      return {
        ...base,
        status: INITIATIVE_STATE_STATUS.UNCHANGED,
        changed: false,
        applied: false,
        committed: false,
        fields,
      };
    }

    if (!isCurrent(captured)) return rejected(command, captured, "stale-before-state-write");
    let writeResult;
    try {
      writeResult = await writeState(next, {
        command,
        scene: captured,
        previous: clone(previous),
        fields: changed.slice(),
      });
      if (!isCurrent(captured)) {
        return {
          ...base,
          status: INITIATIVE_STATE_STATUS.APPLIED,
          changed: true,
          applied: true,
          committed: true,
          stale: true,
          postCommitPending: true,
          fields: changed,
        };
      }
    } catch (error) {
      if (!isAmbiguousWriteError(error)) {
        return {
          ...base,
          status: INITIATIVE_STATE_STATUS.FAILED,
          changed: false,
          applied: false,
          committed: false,
          fields: changed,
          error: serializedError(error),
        };
      }

      const verification = await verifyAfterCommit(command, captured, next, changed);
      if (verification.stale) {
        return {
          ...base,
          status: INITIATIVE_STATE_STATUS.FAILED,
          changed: false,
          applied: false,
          committed: false,
          stale: true,
          ambiguous: true,
          error: serializedError(error),
          postCommitPending: true,
        };
      }
      if (verification.state && readBackMatches(verification.state, next, changed)) {
        return {
          ...base,
          status: INITIATIVE_STATE_STATUS.APPLIED,
          changed: true,
          applied: true,
          committed: true,
          ambiguous: true,
          fields: changed,
          readBack: clone(verification.state),
          postCommitErrors: verification.errors,
        };
      }
      return {
        ...base,
        status: INITIATIVE_STATE_STATUS.FAILED,
        changed: false,
        applied: false,
        committed: false,
        ambiguous: true,
        fields: changed,
        error: serializedError(error),
        readBack: verification.state ? clone(verification.state) : undefined,
      };
    }

    const verification = await verifyAfterCommit(command, captured, next, changed);
    const postCommitErrors = verification.errors || [];
    return {
      ...base,
      status: INITIATIVE_STATE_STATUS.APPLIED,
      changed: true,
      applied: true,
      committed: true,
      stale: verification.stale === true,
      postCommitPending: verification.stale === true || postCommitErrors.length > 0,
      fields: changed,
      writeResult: writeResult === undefined ? undefined : clone(writeResult),
      readBack: verification.state ? clone(verification.state) : undefined,
      postCommitErrors,
    };
  }

  function cacheResult(commandId, fingerprint, result) {
    const cacheable = result.status === INITIATIVE_STATE_STATUS.APPLIED
      || result.status === INITIATIVE_STATE_STATUS.UNCHANGED
      || result.status === INITIATIVE_STATE_STATUS.DUPLICATE;
    if (!cacheable) {
      records.delete(commandId);
      return;
    }
    records.set(commandId, { fingerprint, result: clone(result) });
    while (records.size > Math.max(1, Number(maxCachedResults) || 256)) {
      records.delete(records.keys().next().value);
    }
  }

  function enqueue(command = {}) {
    const current = currentScene();
    const commandId = String(command.commandId || `initiative-state:${++sequence}`).trim();
    const normalized = { ...command, commandId };
    const fingerprint = fingerprintFor(normalized);

    const known = records.get(commandId);
    if (known) {
      if (known.fingerprint !== fingerprint) {
        return Promise.resolve({
          ...commandBase(normalized, current),
          status: INITIATIVE_STATE_STATUS.CONFLICT,
          changed: false,
          applied: false,
          committed: false,
          conflict: { reason: "command-id-payload-mismatch" },
        });
      }
      if (known.promise) return known.promise;
      return Promise.resolve({ ...clone(known.result), duplicate: true, status: INITIATIVE_STATE_STATUS.DUPLICATE });
    }
    const pending = inFlight.get(commandId);
    if (pending) {
      const pendingRecord = records.get(commandId);
      if (pendingRecord && pendingRecord.fingerprint !== fingerprint) {
        return Promise.resolve({
          ...commandBase(normalized, current),
          status: INITIATIVE_STATE_STATUS.CONFLICT,
          changed: false,
          applied: false,
          committed: false,
          conflict: { reason: "command-id-payload-mismatch" },
        });
      }
      return pending;
    }
    if (!current.ready) return Promise.resolve(rejected(normalized, current, "scene-not-ready"));
    if (command.sceneEpoch !== undefined
      && String(command.sceneEpoch) !== String(current.epoch)) {
      return Promise.resolve(rejected(normalized, current, "stale-scene-epoch"));
    }
    if (command.sceneIdentity !== undefined
      && String(command.sceneIdentity || "") !== String(current.identity || "")) {
      return Promise.resolve(rejected(normalized, current, "stale-scene-identity"));
    }

    const captured = { ...current };
    // Reserve the command ID before it enters the queue. A retry arriving
    // while the first command waits returns the same promise, never a second
    // write.
    const reservation = { fingerprint, promise: null };
    records.set(commandId, reservation);
    const task = queue.then(
      () => execute(normalized, captured),
      () => execute(normalized, captured),
    );
    const tracked = task.then((result) => {
      if (inFlight.get(commandId) === tracked) inFlight.delete(commandId);
      if (captured.generation === scene.generation) cacheResult(commandId, fingerprint, result);
      return result;
    }, (error) => {
      if (inFlight.get(commandId) === tracked) inFlight.delete(commandId);
      if (captured.generation === scene.generation) records.delete(commandId);
      return {
        ...commandBase(normalized, captured),
        status: INITIATIVE_STATE_STATUS.FAILED,
        changed: false,
        applied: false,
        committed: false,
        error: serializedError(error),
      };
    });
    reservation.promise = tracked;
    inFlight.set(commandId, tracked);
    queue = tracked.catch(() => {});
    return tracked;
  }

  return Object.freeze({
    enqueue,
    setSceneContext,
    resetSceneScope,
    getSceneContext: () => ({ ...currentScene() }),
    getState: () => ({
      scene: { ...currentScene() },
      pending: inFlight.size,
      cachedResults: records.size,
    }),
  });
}
