const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

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
  maxResults = 256,
} = {}) {
  if (typeof executeApply !== "function") throw new TypeError("executeApply must be a function");
  if (typeof executeUndo !== "function") throw new TypeError("executeUndo must be a function");

  let sceneIdentity = null;
  const results = new Map();

  function setSceneIdentity(value) {
    const next = String(value || "").trim() || null;
    if (next === sceneIdentity) return sceneIdentity;
    sceneIdentity = next;
    results.clear();
    return sceneIdentity;
  }

  async function handle(message = {}) {
    const kind = String(message.kind || "");
    const requestId = String(message.requestId || "");
    if (kind === "context") {
      return {
        duplicate: false,
        command: null,
        result: sceneIdentity
          ? { status: "applied", sceneIdentity }
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

    await beforeExecute(command);
    let task = results.get(commandId);
    const duplicate = !!task;
    if (!task) {
      task = kind === "undo"
        ? Promise.resolve().then(() => executeUndo(command.entry, command))
        : Promise.resolve().then(() => executeApply(command.operations || [], command));
      results.set(commandId, task);
      if (results.size > Math.max(1, Number(maxResults) || 256)) {
        results.delete(results.keys().next().value);
      }
    }
    return { duplicate, command, result: await task };
  }

  return {
    handle,
    setSceneIdentity,
    clear: () => setSceneIdentity(null),
    getState: () => ({ sceneIdentity, cachedResults: results.size }),
  };
}
