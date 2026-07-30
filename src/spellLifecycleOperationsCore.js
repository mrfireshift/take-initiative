import { spellEffectConditionOptions } from "./spellEffectCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function concentrationMode(value) {
  return value === "dismiss" || value === "extend" ? value : "replace";
}

export function spellLifecycleOperations({
  targetIds = [],
  casterId = "",
  name = "",
  turns = 1,
  concentration = false,
  instanceId = "",
  spellId = "",
  spellExpiry = null,
  appliedAt = null,
  castContext = null,
  replaceNames = [],
  conditionApplications = [],
  concentrationAction = "replace",
} = {}) {
  const targets = uniqueIds(targetIds);
  const caster = String(casterId || "").trim();
  const mode = concentrationMode(concentrationAction);
  const tracksConcentration = concentration === true && !!caster;
  const operations = [];

  if (mode !== "extend" && tracksConcentration) {
    operations.push({ type: "concentration:break", casterIds: [caster] });
  }
  if (mode !== "dismiss" && targets.length) {
    operations.push({
      type: "spell:upsert",
      targetIds: targets,
      name,
      turns: Math.max(1, Math.floor(Number(turns) || 1)),
      conc: tracksConcentration,
      source: caster,
      instanceId,
      spellId,
      ...(spellExpiry ? { expiry: clone(spellExpiry) } : {}),
      ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
      ...(castContext ? { castContext: clone(castContext) } : {}),
      ...(mode === "extend" ? {} : { replaceNames: uniqueIds(replaceNames) }),
    });
  }

  const automatedSubjectIds = [];
  for (const application of conditionApplications || []) {
    const applicationTargetIds = uniqueIds(application?.targetIds);
    const conditionName = String(application?.conditionName || "").trim();
    if (!applicationTargetIds.length || !conditionName) continue;
    automatedSubjectIds.push(...applicationTargetIds);
    operations.push({
      type: "condition:add",
      targetIds: applicationTargetIds,
      conditionName,
      options: application?.options && typeof application.options === "object"
        ? clone(application.options)
        : {},
    });
  }

  if (mode !== "dismiss" && tracksConcentration) {
    operations.push({
      type: "concentration:register",
      casterId: caster,
      targetIds: targets,
      name,
      instanceId,
      spellId,
      ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
    });
  }
  if (automatedSubjectIds.length) {
    operations.push({
      type: "condition:automate",
      subjectIds: uniqueIds(automatedSubjectIds),
    });
  }
  return operations;
}

export function catalogSpellApplicationOperations({
  targetIds = [],
  casterId = "",
  enteredName = "",
  name = "",
  storedName = "",
  turns = 1,
  concentration = false,
  instanceId = "",
  spellId = "",
  spellExpiry = null,
  appliedAt = null,
  castContext = null,
  proposedConditions = [],
  proposedEffects = [],
  conditionOptions = {},
  concentrationAction = "replace",
} = {}) {
  const targets = uniqueIds(targetIds);
  const applications = [];

  for (const proposedCondition of proposedConditions || []) {
    const conditionName = typeof proposedCondition === "string"
      ? proposedCondition
      : String(proposedCondition?.name || "").trim();
    if (!conditionName) continue;
    const proposedOptions = proposedCondition && typeof proposedCondition === "object"
      ? proposedCondition.options || {}
      : {};
    applications.push({
      targetIds: targets,
      conditionName,
      options: {
        ...conditionOptions,
        parentEffectId: instanceId,
        type: "spell",
        ...proposedOptions,
      },
    });
  }

  for (const effect of proposedEffects || []) {
    const effectLabel = String(effect?.label || "").trim();
    const effectKind = effect?.kind === "buff" || effect?.kind === "debuff"
      ? effect.kind
      : "";
    if (!effectLabel || !effectKind) continue;
    applications.push({
      targetIds: targets,
      conditionName: effectLabel,
      options: spellEffectConditionOptions(effect, conditionOptions, instanceId),
    });
  }

  return spellLifecycleOperations({
    targetIds: targets,
    casterId,
    name,
    turns,
    concentration,
    instanceId,
    spellId,
    spellExpiry,
    appliedAt,
    castContext,
    replaceNames: [enteredName, name, storedName],
    conditionApplications: applications,
    concentrationAction,
  });
}
