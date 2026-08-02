import { getConditionAutomationHistoryIds } from "./conditionAutomation.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

export function getZeroHPConditionHistoryIds(itemIds = []) {
  return getConditionAutomationHistoryIds(itemIds);
}

export async function reconcileZeroHPConditionsForItems(
  itemIds = [],
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const ids = Array.from(new Set((Array.isArray(itemIds) ? itemIds : []).filter(Boolean)));
  if (!ids.length) return [];
  const mutation = await runEffectsMutation([{
    type: "condition:reconcile-zero-hp",
    targetIds: ids,
  }], {
    history: false,
    kind: "condition:hp-automation",
    label: "Aggiornata condizione a 0 HP",
    targetIds: ids,
  });
  if (mutation.status === "rejected") return [];
  requireAppliedEffectsMutation(mutation);
  return isCurrentSceneEpoch(sceneEpoch) ? mutation.changedIds : [];
}
