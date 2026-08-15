export const HISTORY_UNDO_OUTCOME = Object.freeze({
  COMMITTED: "committed",
  NOOP: "noop",
  REJECTED: "rejected",
  CONFLICT: "conflict",
  RECOVERY_REQUIRED: "recovery-required",
  FAILED: "failed",
});

function resultOf(value) {
  if (value?.result && typeof value.result === "object") return value.result;
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function normalizeHistoryUndoResult(value) {
  const result = resultOf(value);
  const entries = Array.isArray(value) ? [...value] : [];
  const rawStatus = String(result.status || (entries.length ? "applied" : "noop"));
  const status = rawStatus === "no-op" ? "noop" : rawStatus;
  const committed = status === "applied" && result.committed === true;
  let outcome = HISTORY_UNDO_OUTCOME.FAILED;

  if (committed) outcome = HISTORY_UNDO_OUTCOME.COMMITTED;
  else if (status === "noop" || (status === "applied" && result.committed !== true)) {
    outcome = HISTORY_UNDO_OUTCOME.NOOP;
  } else if (status === "rejected") outcome = HISTORY_UNDO_OUTCOME.REJECTED;
  else if (status === "conflict") outcome = HISTORY_UNDO_OUTCOME.CONFLICT;
  else if (status === "recovery-required") outcome = HISTORY_UNDO_OUTCOME.RECOVERY_REQUIRED;

  return {
    status,
    outcome,
    committed,
    entries,
    changedIds: Array.isArray(result.changedIds) ? [...result.changedIds] : [],
    reason: result.reason || "",
    historyRemovalPending: result.historyRemovalPending === true,
    result,
  };
}

export function historyUndoCommitted(value) {
  return normalizeHistoryUndoResult(value).outcome === HISTORY_UNDO_OUTCOME.COMMITTED;
}
