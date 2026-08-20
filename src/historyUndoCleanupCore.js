function idOf(entry) {
  return String(entry?.id || "").trim();
}

function hasTruthyFieldMap(value) {
  return Object.entries(value || {}).some(([, touched]) => touched === true);
}

function hasChangePayload(change) {
  if (!String(change?.id || "").trim()) return false;
  if (change?.lifecycle && typeof change.lifecycle === "object") return true;
  if (Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore")) return true;
  if (Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter")) return true;
  if (Object.prototype.hasOwnProperty.call(change || {}, "beforePosition")) return true;
  if (Object.prototype.hasOwnProperty.call(change || {}, "afterPosition")) return true;
  if (hasTruthyFieldMap(change?.fields) || hasTruthyFieldMap(change?.metadataFields)) return true;
  return Object.keys(change?.before || {}).length > 0
    || Object.keys(change?.after || {}).length > 0
    || Object.keys(change?.beforeMetadata || {}).length > 0
    || Object.keys(change?.afterMetadata || {}).length > 0;
}

export const SUPPORTED_UNDO_SIDE_EFFECT_TYPES = Object.freeze([
  "item",
  "metadata",
  "static-zone-move",
  "static-zone-reorient",
  "reminder-zone-activation",
  "token:teleport",
  "token-position",
]);

function hasSideEffectPayload(sideEffect) {
  if (!String(sideEffect?.id || "").trim()) return false;
  const type = String(sideEffect?.type || "").trim();
  if (type === "reminder-zone-activation") {
    return !!String(sideEffect?.activationId || "").trim()
      && !!String(sideEffect?.metadataKey || "").trim();
  }
  if (type === "static-zone-reorient") {
    return Object.prototype.hasOwnProperty.call(sideEffect, "beforePosition")
      || Object.prototype.hasOwnProperty.call(sideEffect, "afterPosition")
      || Object.prototype.hasOwnProperty.call(sideEffect, "beforeCommands")
      || Object.prototype.hasOwnProperty.call(sideEffect, "afterCommands")
      || (Array.isArray(sideEffect.metadataChanges) && sideEffect.metadataChanges.length > 0);
  }
  return Object.prototype.hasOwnProperty.call(sideEffect, "before")
    || Object.prototype.hasOwnProperty.call(sideEffect, "after")
    || Object.prototype.hasOwnProperty.call(sideEffect, "beforePosition")
    || Object.prototype.hasOwnProperty.call(sideEffect, "afterPosition")
    || Object.prototype.hasOwnProperty.call(sideEffect, "beforeMetadata")
    || Object.prototype.hasOwnProperty.call(sideEffect, "afterMetadata");
}

export function historyEntryHasUndoPayload(entry) {
  if (!idOf(entry)) return false;
  const changes = [
    ...(Array.isArray(entry?.effectsMutation?.changes) ? entry.effectsMutation.changes : []),
    ...(Array.isArray(entry?.changes) ? entry.changes : []),
  ];
  const sideEffects = Array.isArray(entry?.effectsMutation?.sideEffects)
    ? entry.effectsMutation.sideEffects
    : [];
  return changes.some(hasChangePayload) || sideEffects.some(hasSideEffectPayload);
}

export const HISTORY_UNDO_READINESS_STATUS = Object.freeze({
  UNDOABLE: "undoable",
  CONFLICT: "conflict",
  UNAVAILABLE: "unavailable",
  INVALID: "invalid",
  NOOP: "noop",
});

export function filterPendingHistoryRemovalEntries(entries, pendingIds = []) {
  const pending = new Set(
    (Array.isArray(pendingIds) ? pendingIds : [pendingIds])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  if (!pending.size) return (Array.isArray(entries) ? entries : []).filter(Boolean);
  return (Array.isArray(entries) ? entries : []).filter((entry) => (
    entry && !pending.has(idOf(entry))
  ));
}

export function historyUndoPlanHasWork(plan) {
  if (!plan || plan.status) return false;
  if ((Array.isArray(plan.lifecycle) && plan.lifecycle.length)
    || (Array.isArray(plan.undoSideEffects) && plan.undoSideEffects.length)) return true;
  return (Array.isArray(plan.changes) ? plan.changes : []).some((change) => (
    hasTruthyFieldMap(change?.fields)
    || hasTruthyFieldMap(change?.metadataFields)
    || change?.position === true
    || (Array.isArray(change?.externalMetadata) && change.externalMetadata.length > 0)
    || (Array.isArray(change?.zoneTriggerActivations) && change.zoneTriggerActivations.length > 0)
  ));
}

export function malformedHistoryEntryIds(entries) {
  return uniqueIds((Array.isArray(entries) ? entries : [])
    .filter((entry) => !historyEntryHasUndoPayload(entry)));
}

/**
 * Builds the newest-first projection used by the Undo UI. Each row represents
 * the exact chronological suffix that would be reverted by "Undo through";
 * entries are never deleted merely because the live scene currently conflicts.
 */
export async function evaluateHistoryUndoReadiness(entries, validateSuffix) {
  const source = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const rows = [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const entry = source[index];
    const suffix = source.slice(index);
    const invalid = suffix.find((candidate) => !historyEntryHasUndoPayload(candidate));
    if (invalid) {
      rows.push({
        entry,
        id: idOf(entry),
        depth: suffix.length,
        status: HISTORY_UNDO_READINESS_STATUS.INVALID,
        undoable: false,
        reason: "invalid-history-chain",
        blockingEntryId: idOf(invalid) || null,
      });
      continue;
    }

    let plan;
    try {
      plan = await validateSuffix(suffix, { entry, index, depth: suffix.length });
    } catch (error) {
      rows.push({
        entry,
        id: idOf(entry),
        depth: suffix.length,
        status: HISTORY_UNDO_READINESS_STATUS.UNAVAILABLE,
        undoable: false,
        reason: "validation-failed",
        error: {
          name: String(error?.name || "Error"),
          message: String(error?.message || error || "Undo validation failed."),
        },
      });
      continue;
    }

    if (!plan) {
      rows.push({
        entry,
        id: idOf(entry),
        depth: suffix.length,
        status: HISTORY_UNDO_READINESS_STATUS.UNAVAILABLE,
        undoable: false,
        reason: "validation-unavailable",
      });
      continue;
    }
    if (plan.status === "conflict") {
      rows.push({
        entry,
        id: idOf(entry),
        depth: suffix.length,
        status: HISTORY_UNDO_READINESS_STATUS.CONFLICT,
        undoable: false,
        reason: plan.reason || "scene-state-conflict",
        conflicts: Array.isArray(plan.conflicts) ? plan.conflicts : [],
      });
      continue;
    }
    if (plan.status) {
      rows.push({
        entry,
        id: idOf(entry),
        depth: suffix.length,
        status: plan.status === "noop"
          ? HISTORY_UNDO_READINESS_STATUS.NOOP
          : HISTORY_UNDO_READINESS_STATUS.UNAVAILABLE,
        undoable: false,
        reason: plan.reason || plan.status,
      });
      continue;
    }
    if (!historyUndoPlanHasWork(plan)) {
      rows.push({
        entry,
        id: idOf(entry),
        depth: suffix.length,
        status: HISTORY_UNDO_READINESS_STATUS.NOOP,
        undoable: false,
        reason: "no-reversible-change",
      });
      continue;
    }
    rows.push({
      entry,
      id: idOf(entry),
      depth: suffix.length,
      status: HISTORY_UNDO_READINESS_STATUS.UNDOABLE,
      undoable: true,
      reason: null,
      changedIds: Array.isArray(plan.changedIds) ? [...plan.changedIds] : [],
    });
  }
  return rows;
}

function uniqueIds(entries) {
  return Array.from(new Set(
    (Array.isArray(entries) ? entries : [])
      .map(idOf)
      .filter(Boolean),
  ));
}

/**
 * Backward-compatible cleanup helper. Live conflicts are reversible state,
 * not corrupt data, so cleanup is deliberately limited to malformed entries.
 */
export async function findNonUndoableHistoryIds(entries) {
  return malformedHistoryEntryIds(entries);
}
