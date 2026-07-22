import { conditionKey, hasEffectiveCondition } from "./conditionRulesCore.js";

function uniqueIds(ids = []) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
}

function conditionsFor(item, readConditions) {
  const conditions = readConditions(item);
  return Array.isArray(conditions) ? conditions : [];
}

function concentrationsFor(item, readConcentrations) {
  const concentrations = readConcentrations(item);
  return concentrations && typeof concentrations === "object" ? concentrations : {};
}

export function getPotentialConditionAutomationChanges(items = [], itemIds = [], options = {}) {
  const subjects = new Set(uniqueIds(itemIds));
  const readConditions = options.readConditions || ((item) => item?.conditions || []);
  const readConcentrations = options.readConcentrations || ((item) => item?.concentrations || {});
  const concentrationTargetIds = new Set();
  const grappleRemovals = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (subjects.has(item?.id)) {
      for (const entry of Object.values(concentrationsFor(item, readConcentrations))) {
        for (const targetId of Array.isArray(entry?.targets) ? entry.targets : []) {
          if (targetId) concentrationTargetIds.add(targetId);
        }
      }
    }

    for (const instance of conditionsFor(item, readConditions)) {
      if (conditionKey(instance) !== "afferrato") continue;
      if (!subjects.has(String(instance.sourceId || ""))) continue;
      grappleRemovals.push({ itemId: item.id, instanceId: instance.id });
    }
  }

  return {
    subjectIds: [...subjects],
    concentrationTargetIds: [...concentrationTargetIds],
    grappleRemovals,
    affectedIds: uniqueIds([
      ...subjects,
      ...concentrationTargetIds,
      ...grappleRemovals.map((entry) => entry.itemId),
    ]),
  };
}

export function buildConditionAutomationPlan(items = [], itemIds = [], options = {}) {
  const readConditions = options.readConditions || ((item) => item?.conditions || []);
  const subjectSet = new Set(uniqueIds(itemIds));
  const incapacitatedIds = (Array.isArray(items) ? items : [])
    .filter((item) => subjectSet.has(item?.id))
    .filter((item) => hasEffectiveCondition(conditionsFor(item, readConditions), "Incapacitato"))
    .map((item) => item.id);
  const changes = getPotentialConditionAutomationChanges(items, incapacitatedIds, options);
  return { ...changes, incapacitatedIds };
}
