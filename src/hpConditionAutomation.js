import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getConditionInstances } from "./conditions.js";
import { getConditionAutomationHistoryIds } from "./conditionAutomation.js";
import {
  commitEffectsMutationPlan,
  prepareEffectsMutation,
} from "./effectsMutations.js";
import {
  resolveZeroHPUnconsciousAction,
  ZERO_HP_UNCONSCIOUS_TYPE,
} from "./hpConditionRulesCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

const META_KEY = `${ID}/meta`;

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
  const items = await OBR.scene.items.getItems(ids);
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const addIds = [];
  const removals = [];

  for (const item of items) {
    const meta = item?.metadata?.[META_KEY] || {};
    const instances = getConditionInstances(meta.conditions || {});
    const action = resolveZeroHPUnconsciousAction(meta, instances);
    if (action.add) addIds.push(item.id);
    for (const instanceId of action.removeInstanceIds) {
      removals.push({ itemId: item.id, instanceId });
    }
  }

  const operations = [];
  if (addIds.length) {
    operations.push({
      type: "condition:add",
      targetIds: addIds,
      conditionName: "Privo di sensi",
      options: {
        type: ZERO_HP_UNCONSCIOUS_TYPE,
        expiry: { mode: "manual" },
      },
    });
  }
  if (removals.length) {
    operations.push({ type: "condition:remove-instances", removals });
  }
  if (addIds.length) {
    operations.push({ type: "condition:automate", subjectIds: addIds });
  }
  if (!operations.length) return [];

  const plan = await prepareEffectsMutation(operations);
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  await commitEffectsMutationPlan(plan, {
    isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
  });
  return isCurrentSceneEpoch(sceneEpoch) ? plan.changedIds : [];
}
