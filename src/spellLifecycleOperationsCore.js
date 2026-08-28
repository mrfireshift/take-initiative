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
  summaryParts = null,
  casterName = "",
  onSpellEnd = null,
  replaceNames = [],
  conditionApplications = [],
  concentrationAction = "replace",
  concentrationReference = null,
  persistSpell = true,
} = {}) {
  const targets = uniqueIds(targetIds);
  const caster = String(casterId || "").trim();
  const mode = concentrationMode(concentrationAction);
  const tracksConcentration = persistSpell === true && concentration === true && !!caster;
  const operations = [];

  if (mode !== "extend" && tracksConcentration) {
    operations.push({
      type: "concentration:break",
      casterIds: [caster],
      ...(String(concentrationReference || "").trim()
        ? { reference: String(concentrationReference).trim() }
        : {}),
    });
  }
  if (persistSpell === true && mode !== "dismiss" && targets.length) {
    operations.push({
      type: "spell:upsert",
      targetIds: targets,
      name,
      turns: Math.max(1, Math.floor(Number(turns) || 1)),
      conc: tracksConcentration,
      source: caster,
      ...(casterName ? { casterName: String(casterName) } : {}),
      instanceId,
      spellId,
      ...(onSpellEnd ? { onSpellEnd: clone(onSpellEnd) } : {}),
      ...(spellExpiry ? { expiry: clone(spellExpiry) } : {}),
      ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
      ...(castContext ? { castContext: clone(castContext) } : {}),
      ...(Array.isArray(summaryParts) && summaryParts.length
        ? { summaryParts: clone(summaryParts) }
        : {}),
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
      ...(castContext && typeof castContext === "object"
        ? { castContext: clone(castContext) }
        : {}),
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
  summaryParts = null,
  proposedConditions = [],
  proposedEffects = [],
  conditionApplications = [],
  conditionOptions = {},
  concentrationAction = "replace",
  concentrationReference = null,
  casterName = "",
  onSpellEnd = null,
  persistSpell = true,
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
    const effectOptions = spellEffectConditionOptions(
      effect,
      conditionOptions,
      persistSpell === true ? instanceId : "",
    );
    if (persistSpell !== true) {
      effectOptions.type = "automatic";
      effectOptions.parentEffectId = "";
    }
    applications.push({
      targetIds: targets,
      conditionName: effectLabel,
      options: effectOptions,
    });
  }

  for (const application of conditionApplications || []) {
    const applicationTargetIds = uniqueIds(application?.targetIds);
    const conditionName = String(application?.conditionName || "").trim();
    if (!applicationTargetIds.length || !conditionName) continue;
    const applicationOptions = application?.options && typeof application.options === "object"
      ? application.options
      : {};
    applications.push({
      targetIds: applicationTargetIds,
      conditionName,
      options: {
        ...conditionOptions,
        parentEffectId: persistSpell === true ? instanceId : "",
        type: persistSpell === true ? "spell" : "automatic",
        ...applicationOptions,
      },
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
    summaryParts,
    casterName,
    onSpellEnd,
    replaceNames: [enteredName, name, storedName],
    conditionApplications: applications,
    concentrationAction,
    concentrationReference,
    persistSpell,
  });
}
