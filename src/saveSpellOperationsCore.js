import { spellLifecycleOperations } from "./spellLifecycleOperationsCore.js";

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export function saveSpellResolutionOperations({
  resolution = null,
  instanceId = "",
  casterName = "",
  turns = 1,
  spellExpiry = null,
  appliedAt = null,
  castContext = null,
  concentrationAction = "replace",
  concentrationReference = null,
} = {}) {
  if (!resolution?.valid) {
    const reasons = Array.isArray(resolution?.errors) ? resolution.errors.join(", ") : "invalid-resolution";
    throw new Error(`Invalid save spell resolution: ${reasons}`);
  }

  const spellInstanceId = String(instanceId || "").trim();
  if (!spellInstanceId) throw new Error("Invalid save spell resolution: instance-required");

  const resolvedCastContext = castContext && typeof castContext === "object"
    ? clone(castContext)
    : {};
  if (resolution.targetContexts && typeof resolution.targetContexts === "object") {
    const resolvedTargetContexts = clone(resolution.targetContexts);
    if (Object.keys(resolvedTargetContexts).length) {
      resolvedCastContext.targetContexts = {
        ...(resolvedCastContext.targetContexts && typeof resolvedCastContext.targetContexts === "object"
          ? resolvedCastContext.targetContexts
          : {}),
        ...resolvedTargetContexts,
      };
    }
  }

  const targetIds = Array.from(new Set(
    (resolution.spellTargetIds || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  const casterId = String(resolution.casterId || "").trim();
  const concentration = resolution.concentration === true;
  const conditionApplications = [];
  for (const application of resolution.conditionApplications || []) {
    const applicationTargetIds = Array.from(new Set(
      (application?.targetIds || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ));
    const conditionName = String(application?.conditionName || "").trim();
    if (!applicationTargetIds.length || !conditionName) continue;
    conditionApplications.push({
      targetIds: applicationTargetIds,
      conditionName,
      options: {
        sourceId: casterId,
        sourceName: String(casterName || "").trim(),
        ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
        parentEffectId: spellInstanceId,
        type: "spell",
        ...(application.options && typeof application.options === "object"
          ? clone(application.options)
          : {}),
      },
    });
  }

  return spellLifecycleOperations({
    targetIds,
    casterId,
    name: resolution.spellName,
    turns,
    concentration,
    instanceId: spellInstanceId,
    spellId: resolution.spellId,
    spellExpiry,
    appliedAt,
    castContext: Object.keys(resolvedCastContext).length ? resolvedCastContext : null,
    replaceNames: [resolution.spellName],
    conditionApplications,
    concentrationAction,
    concentrationReference,
  });
}

export function saveSpellTriggerResolutionOperations({
  resolution = null,
  instanceId = "",
  casterName = "",
  turns = 1,
  spellExpiry = null,
  appliedAt = null,
} = {}) {
  if (!resolution?.valid) {
    const reasons = Array.isArray(resolution?.errors)
      ? resolution.errors.join(", ")
      : "invalid-resolution";
    throw new Error(`Invalid save spell trigger resolution: ${reasons}`);
  }
  const parentEffectId = String(instanceId || "").trim();
  if (!parentEffectId) {
    throw new Error("Invalid save spell trigger resolution: instance-required");
  }
  const sourceId = String(resolution.casterId || "").trim();
  const spellTargetIds = Array.from(new Set(
    (resolution.spellTargetIds || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  const concentration = resolution.concentration === true && !!sourceId;
  const operations = [];
  const automatedIds = new Set();
  if (spellTargetIds.length) {
    operations.push({
      type: "spell:upsert",
      targetIds: spellTargetIds,
      name: resolution.spellName,
      turns: Math.max(1, Math.floor(Number(turns) || 1)),
      conc: concentration,
      source: sourceId,
      instanceId: parentEffectId,
      spellId: resolution.spellId,
      ...(spellExpiry ? { expiry: clone(spellExpiry) } : {}),
      ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
    });
  }
  for (const application of resolution.conditionApplications || []) {
    const targetIds = Array.from(new Set(
      (application?.targetIds || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ));
    const conditionName = String(application?.conditionName || "").trim();
    if (!targetIds.length || !conditionName) continue;
    operations.push({
      type: "condition:add",
      targetIds,
      conditionName,
      options: {
        sourceId,
        sourceName: String(casterName || "").trim(),
        ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
        parentEffectId,
        type: "spell",
        ...(application.options && typeof application.options === "object"
          ? clone(application.options)
          : {}),
      },
    });
    for (const targetId of targetIds) automatedIds.add(targetId);
  }
  if (concentration && spellTargetIds.length) {
    operations.push({
      type: "concentration:register",
      casterId: sourceId,
      targetIds: spellTargetIds,
      name: resolution.spellName,
      instanceId: parentEffectId,
      spellId: resolution.spellId,
    });
  }
  if (automatedIds.size) {
    operations.push({
      type: "condition:automate",
      subjectIds: [...automatedIds],
    });
  }
  return operations;
}
