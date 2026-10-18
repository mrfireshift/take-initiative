import { refreshConditionLabels } from "./conditions.js";
import {
  conditionMutationOperations,
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";

export async function executeConditionApplication({
  conditionName = "",
  targetIds = [],
  conditionMode = "add",
  sourceId = "",
  sourceName = "",
  appliedAt = null,
  expiry = { mode: "manual" },
  sceneIdentity = null,
  commandId = "",
  // Optional presentation and mechanics of the effect (consumables, gifts): effectKind, displayLabel, mechanics…
  extraOptions = null,
} = {}) {
  const normalizedName = String(conditionName || "").trim();
  if (!normalizedName || !targetIds.length) return [];

  const mutation = await runEffectsMutation(conditionMutationOperations({
    targetIds,
    conditionName: normalizedName,
    mode: conditionMode,
    options: {
      ...(extraOptions && typeof extraOptions === "object" ? extraOptions : {}),
      sourceId,
      sourceName,
      appliedAt,
      expiry,
    },
  }), {
    kind: "condition",
    label: `Applicata: ${normalizedName}`,
    targetIds,
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
    history: { kind: "condition", label: `Applicata: ${normalizedName}` },
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  await refreshConditionLabels(changedIds);
  return changedIds;
}
