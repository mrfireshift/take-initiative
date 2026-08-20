const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function commandFingerprint(kind, command) {
  try {
    return JSON.stringify(canonicalize({ kind, command }));
  } catch {
    return "[unfingerprintable-command]";
  }
}

function rejected(commandId, reason) {
  return {
    status: "rejected",
    commandId,
    correlationId: commandId,
    reason,
    committed: false,
    changedIds: [],
    changes: [],
  };
}

/**
 * Owns background command identity and delivery deduplication.  Mutation
 * serialization itself remains in the single coordinator passed through the
 * apply/undo executors; clients only submit JSON-safe command data.
 */
export function createEffectsMutationBackgroundBroker({
  executeApply,
  executeUndo,
  beforeExecute = async () => {},
  shouldCacheResult = () => true,
  getContextState = () => ({}),
  maxResults = 256,
} = {}) {
  if (typeof executeApply !== "function") throw new TypeError("executeApply must be a function");
  if (typeof executeUndo !== "function") throw new TypeError("executeUndo must be a function");

  let sceneIdentity = null;
  const results = new Map();
  const fingerprints = new Map();

  function setSceneIdentity(value) {
    const next = String(value || "").trim() || null;
    if (next === sceneIdentity) return sceneIdentity;
    sceneIdentity = next;
    results.clear();
    fingerprints.clear();
    return sceneIdentity;
  }

  async function handle(message = {}) {
    const kind = String(message.kind || "");
    const requestId = String(message.requestId || "");
    if (kind === "context") {
      let contextState = {};
      try {
        const candidate = getContextState();
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          contextState = clone(candidate);
        }
      } catch {}
      return {
        duplicate: false,
        command: null,
        result: sceneIdentity
          ? { status: "applied", sceneIdentity, ...contextState }
          : rejected(requestId, "scene-not-ready"),
      };
    }

    const command = kind === "undo"
      ? { ...(clone(message.options) || {}), entry: clone(message.entry) }
      : { ...(clone(message.command) || {}) };
    const commandId = String(command.commandId || requestId).trim() || requestId;
    if (!sceneIdentity) {
      return { duplicate: false, command, result: rejected(commandId, "scene-not-ready") };
    }
    if (command.sceneIdentity !== sceneIdentity) {
      return { duplicate: false, command, result: rejected(commandId, "stale-scene-identity") };
    }

    const fingerprint = commandFingerprint(kind, command);
    const previousFingerprint = fingerprints.get(commandId);
    if (previousFingerprint && previousFingerprint !== fingerprint) {
      return {
        duplicate: false,
        command,
        result: {
          status: "conflict",
          commandId,
          correlationId: command.correlationId || commandId,
          reason: "command-id-payload-conflict",
          committed: false,
          changedIds: [],
          changes: [],
        },
      };
    }

    await beforeExecute(command);
    let task = results.get(commandId);
    const duplicate = !!task;
    if (!task) {
      fingerprints.set(commandId, fingerprint);
      task = kind === "undo"
        ? Promise.resolve().then(() => executeUndo(command.entry, command))
        : Promise.resolve().then(() => executeApply(command.operations || [], command));
      results.set(commandId, task);
      if (results.size > Math.max(1, Number(maxResults) || 256)) {
        const oldest = results.keys().next().value;
        results.delete(oldest);
        fingerprints.delete(oldest);
      }
    }
    const result = await task;
    if (
      shouldCacheResult(result, { kind, command }) === false
      && results.get(commandId) === task
    ) {
      results.delete(commandId);
      fingerprints.delete(commandId);
    }
    return { duplicate, command, result };
  }

  return {
    handle,
    setSceneIdentity,
    clear: () => setSceneIdentity(null),
    getState: () => ({ sceneIdentity, cachedResults: results.size }),
  };
}
