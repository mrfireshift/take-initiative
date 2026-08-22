const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value));
};

// Reminder resolution consumers need the field-scoped change set and the
// immutable History payload, not the coordinator's full scene state or the
// duplicate operation list. The background broker keeps the complete result;
// this function only shapes the copy sent across the iframe transport.
export function compactBackgroundReminderTransportResult(result) {
  if (!result || typeof result !== "object" || !result.plan || typeof result.plan !== "object") {
    return result;
  }
  const plan = result.plan;
  const commitResult = result.commitResult && typeof result.commitResult === "object"
    ? result.commitResult
    : null;
  const changedIds = Array.isArray(result.changedIds)
    ? result.changedIds
    : (Array.isArray(plan.changedIds) ? plan.changedIds : []);
  const changes = Array.isArray(plan.changes)
    ? plan.changes
    : (Array.isArray(result.changes) ? result.changes : []);

  return {
    status: result.status,
    reason: result.reason || null,
    error: clone(result.error || null),
    commandId: result.commandId || null,
    correlationId: result.correlationId || result.commandId || null,
    kind: result.kind || "reminder-resolution",
    sceneEpoch: result.sceneEpoch,
    sceneIdentity: result.sceneIdentity || null,
    committed: result.committed === true,
    changedIds: clone(changedIds),
    plan: {
      changedIds: clone(changedIds),
      changes: clone(changes),
    },
    historyPending: result.historyPending === true,
    historyRecovered: result.historyRecovered === true,
    historySkipped: result.historySkipped === true,
    historyError: clone(result.historyError || null),
    historyEntry: clone(result.historyEntry || null),
    postCommitErrors: clone(result.postCommitErrors || []),
    sideEffectsPending: clone(result.sideEffectsPending || []),
    sideEffectsRecovered: result.sideEffectsRecovered === true,
    commitResult: commitResult
      ? {
        status: commitResult.status || null,
        reason: commitResult.reason || null,
        committed: commitResult.committed === true,
        changedIds: clone(commitResult.changedIds || changedIds),
        postCommitErrors: clone(commitResult.postCommitErrors || []),
        sideEffectsPending: clone(commitResult.sideEffectsPending || []),
        sideEffectChanges: clone(commitResult.sideEffectChanges || []),
      }
      : null,
  };
}
