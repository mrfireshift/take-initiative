import {
  AREA_PLACEMENT_ONLY_SPELL_ID_SET,
  AREA_SAVE_SPELL_ID_SET,
} from "./areaSaveSpellRules.js";
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
  summaryParts = null,
  concentrationAction = "replace",
  concentrationReference = null,
} = {}) {
  if (!resolution?.valid) {
    const reasons = Array.isArray(resolution?.errors) ? resolution.errors.join(", ") : "invalid-resolution";
    throw new Error(`Invalid save spell resolution: ${reasons}`);
  }

  const spellInstanceId = String(instanceId || "").trim();
  if (!spellInstanceId) {
    throw new Error("instance-required: save spell lifecycle operations require an instanceId");
  }

  const resolvedCastContext = {
    ...(resolution.castContext && typeof resolution.castContext === "object"
      ? clone(resolution.castContext)
      : {}),
    ...(castContext && typeof castContext === "object"
      ? clone(castContext)
      : {}),
  };
  if (resolution.slotLevel !== undefined && resolution.slotLevel !== null && resolution.slotLevel !== "") {
    const slotLevel = Number(resolution.slotLevel);
    if (Number.isFinite(slotLevel)) {
      resolvedCastContext.slotLevel = Math.max(0, Math.floor(slotLevel));
    }
  }

  const casterId = String(resolution.casterId || "").trim();
  const persistedTargetIds = resolution?.persistence?.owner === "caster" && casterId
    ? [casterId]
    : resolution.spellTargetIds || [];
  const targetIds = Array.from(new Set(
    persistedTargetIds
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
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
        ...(resolution.spellName ? { spellName: resolution.spellName } : {}),
        ...(resolution.spellId ? { spellId: resolution.spellId } : {}),
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
    summaryParts,
    replaceNames: [resolution.spellName],
    conditionApplications,
    concentrationAction,
    concentrationReference,
    persistSpell: targetIds.length > 0
      || conditionApplications.length > 0
      || AREA_SAVE_SPELL_ID_SET.has(resolution.spellId)
      || AREA_PLACEMENT_ONLY_SPELL_ID_SET.has(resolution.spellId),
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
