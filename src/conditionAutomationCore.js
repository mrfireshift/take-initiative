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

// The grapples the creatures of grapplerIds hold, when they fall to 0 HP or are incapacitated: each Grappled pill they
// are the source of, and the Restrained that lasts while it holds ("until this grapple ends", the Vine Blight's Constrict:
// the same source, no spell behind it, as the console's end of a grapple reads it, pcAttackManeuverCore.js). Never a grapple
// whose source is the creature itself (the condition panel's default source). [{ itemId, instanceId }].
export function grappleReleaseRemovals(items = [], grapplerIds = [], readConditions = (item) => item?.conditions || []) {
  const grapplers = new Set(uniqueIds(grapplerIds).map(String));
  if (!grapplers.size) return [];
  const removals = [];
  for (const item of Array.isArray(items) ? items : []) {
    const itemId = String(item?.id || "");
    const instances = conditionsFor(item, readConditions).filter((instance) => instance?.active !== false);
    const sourceOf = (instance) => String(instance?.sourceId || "").trim();
    const held = new Set(instances.filter((instance) => conditionKey(instance) === "afferrato"
      && grapplers.has(sourceOf(instance)) && sourceOf(instance) !== itemId).map(sourceOf));
    if (!held.size) continue;
    for (const instance of instances) {
      const key = conditionKey(instance);
      const tied = key === "afferrato" || (key === "trattenuto" && !String(instance?.parentEffectId || "").trim());
      if (tied && held.has(sourceOf(instance)) && String(instance?.id || "")) removals.push({ itemId, instanceId: String(instance.id) });
    }
  }
  return removals;
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
