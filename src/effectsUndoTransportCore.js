const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value));
};

// L'Undo generico costruisce internamente snapshot completi degli item per
// prevalidazione, commit e recovery. Quegli snapshot appartengono però al
// coordinatore background: al client servono solo i change-set necessari al
// reconcile derivato. Evita quindi di trasportare initialItems/finalItems/states
// attraverso OBR.broadcast dopo che il commit è già avvenuto.
export function compactBackgroundUndoTransportResult(result) {
  if (!result || typeof result !== "object" || !result.plan || typeof result.plan !== "object") {
    return result;
  }
  const plan = result.plan;
  return {
    ...result,
    plan: {
      historyUndo: plan.historyUndo === true,
      changes: clone(Array.isArray(plan.changes) ? plan.changes : []),
      changedIds: clone(Array.isArray(plan.changedIds) ? plan.changedIds : (result.changedIds || [])),
      ...(plan.metadataKey ? { metadataKey: String(plan.metadataKey) } : {}),
      ...(plan.effectKeys && typeof plan.effectKeys === "object"
        ? { effectKeys: clone(plan.effectKeys) }
        : {}),
    },
  };
}
