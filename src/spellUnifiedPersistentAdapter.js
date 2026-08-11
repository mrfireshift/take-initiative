export const SPELL_UNIFIED_PERSISTENT_STATUS = Object.freeze({
  UPDATED: "updated",
  RECREATED: "recreated",
  REJECTED: "rejected",
  FAILED: "failed",
});

function text(value) {
  return String(value ?? "").trim();
}

function persistentContext(overview = {}) {
  const persistent = overview?.persistent && typeof overview.persistent === "object"
    ? overview.persistent
    : overview;
  return {
    instanceId: text(persistent.instanceId || overview?.instanceId),
    casterId: text(persistent.casterId || overview?.casterId),
    spellId: text(persistent.spellId || overview?.spellId),
    name: text(overview?.name || persistent.label),
    castContext: persistent.castContext && typeof persistent.castContext === "object"
      ? { ...persistent.castContext }
      : Number.isInteger(Number(persistent.slotLevel))
        ? { slotLevel: Number(persistent.slotLevel) }
        : {},
  };
}

function invalidResult(code, message, overview = {}) {
  const context = persistentContext(overview);
  return {
    status: SPELL_UNIFIED_PERSISTENT_STATUS.REJECTED,
    instanceId: context.instanceId,
    spellId: context.spellId,
    casterId: context.casterId,
    changedIds: [],
    sceneItemChanges: [],
    errors: [{ code, message }],
  };
}

function normalizedError(error) {
  return {
    code: text(error?.code || error?.reason || error?.name) || "persistent-operation-failed",
    message: text(error?.message || error?.reason) || "Operazione sulla pedina non riuscita.",
  };
}

function changedIds(changes = []) {
  return Array.from(new Set(
    (Array.isArray(changes) ? changes : [])
      .flatMap((change) => [change?.id, change?.itemId, change?.entityId])
      .map(text)
      .filter(Boolean),
  ));
}

function mutationResult(status, overview, changes = []) {
  const context = persistentContext(overview);
  const sceneItemChanges = Array.isArray(changes) ? changes : [];
  return {
    status,
    instanceId: context.instanceId,
    spellId: context.spellId,
    casterId: context.casterId,
    changedIds: changedIds(sceneItemChanges),
    sceneItemChanges,
    errors: [],
  };
}

async function stateExecutor(runtime = {}) {
  if (typeof runtime.executor === "function") return runtime.executor;
  return (await import("./spellApplicationExecutor.js")).executeSpellBoardTokenStateUpdate;
}

async function recreateExecutor(runtime = {}) {
  if (typeof runtime.executor === "function") return runtime.executor;
  return (await import("./spellApplicationExecutor.js")).executeSpellBoardTokenRecreate;
}

export async function executeSpellUnifiedBoardTokenStateUpdate({
  overview = null,
  hp = undefined,
  runtime = {},
} = {}) {
  const context = persistentContext(overview || {});
  if (!context.instanceId || !context.casterId || !context.spellId) {
    return invalidResult(
      "board-token-context-required",
      "La pedina non espone un contesto runtime completo.",
      overview || {},
    );
  }
  try {
    const executor = await stateExecutor(runtime);
    const changes = await executor({ group: context, hp });
    return mutationResult(SPELL_UNIFIED_PERSISTENT_STATUS.UPDATED, overview, changes);
  } catch (error) {
    return {
      ...mutationResult(SPELL_UNIFIED_PERSISTENT_STATUS.FAILED, overview),
      errors: [normalizedError(error)],
    };
  }
}

export async function executeSpellUnifiedBoardTokenRecreate({
  overview = null,
  position = null,
  runtime = {},
} = {}) {
  const context = persistentContext(overview || {});
  if (!context.instanceId || !context.casterId || !context.spellId
    || !Number.isFinite(Number(position?.x))
    || !Number.isFinite(Number(position?.y))) {
    return invalidResult(
      "board-token-recreation-context-required",
      "La ricreazione richiede contesto e posizione validi.",
      overview || {},
    );
  }
  try {
    const executor = await recreateExecutor(runtime);
    const changes = await executor({
      group: context,
      position: {
        x: Number(position.x),
        y: Number(position.y),
      },
    });
    return mutationResult(SPELL_UNIFIED_PERSISTENT_STATUS.RECREATED, overview, changes);
  } catch (error) {
    return {
      ...mutationResult(SPELL_UNIFIED_PERSISTENT_STATUS.FAILED, overview),
      errors: [normalizedError(error)],
    };
  }
}
