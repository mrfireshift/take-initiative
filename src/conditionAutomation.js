import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getConditionInstances } from "./conditions.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import {
  getPotentialConditionAutomationChanges,
} from "./conditionAutomationCore.js";

const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;

function uniqueIds(ids = []) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
}

const automationOptions = {
  readConditions: (item) => getConditionInstances(item?.metadata?.[META_KEY]?.conditions || {}),
  readConcentrations: (item) => item?.metadata?.[META_KEY]?.[CONC_META_KEY] || {},
};

export async function getConditionAutomationHistoryIds(itemIds = []) {
  const subjectIds = new Set(uniqueIds(itemIds));
  if (!subjectIds.size) return [];
  const items = await OBR.scene.items.getItems();
  return getPotentialConditionAutomationChanges(items, [...subjectIds], automationOptions).affectedIds;
}

export async function applyConditionAutomationsForItems(itemIds = []) {
  const subjectIds = new Set(uniqueIds(itemIds));
  if (!subjectIds.size) return [];
  const plan = await runEffectsMutation([{
    type: "condition:automate",
    subjectIds: [...subjectIds],
  }], {
    history: false,
    kind: "condition:automate",
    label: "Aggiornata automazione condizioni",
    targetIds: [...subjectIds],
  });
  requireAppliedEffectsMutation(plan);
  return plan.changedIds;
}
