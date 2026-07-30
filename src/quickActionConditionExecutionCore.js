import {
  quickActionDirectTargetIds,
  sanitizeQuickAction,
} from "./quickActionsCore.js";

export function buildDirectQuickActionConditionRequest({
  action = null,
  sourceId = "",
  selectedTargetIds = [],
} = {}) {
  const normalized = sanitizeQuickAction(action);
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalized || normalized.kind !== "condition") {
    return { mode: "review", reason: "unsupported-action" };
  }
  if (!normalizedSourceId) {
    return { mode: "review", reason: "source-missing" };
  }

  const targetIds = quickActionDirectTargetIds(
    normalized,
    normalizedSourceId,
    selectedTargetIds,
  );
  if (!targetIds.length) {
    return {
      mode: "review",
      reason: normalized.targetMode === "selection"
        ? "single-target-required"
        : "targets-missing",
    };
  }

  const expiry = { mode: normalized.expiryMode };
  if (normalized.expiryMode !== "manual") {
    expiry.remaining = normalized.duration || 1;
  }
  if (
    normalized.expiryMode === "turn-start"
    || normalized.expiryMode === "turn-end"
  ) {
    expiry.actor = "target";
  }

  return {
    mode: "direct",
    kind: "condition",
    request: {
      conditionName: normalized.conditionName,
      targetIds,
      conditionMode: "add",
      sourceId: normalizedSourceId,
      expiry,
    },
  };
}
