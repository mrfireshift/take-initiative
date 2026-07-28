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
} = {}) {
  if (!resolution?.valid) {
    const reasons = Array.isArray(resolution?.errors) ? resolution.errors.join(", ") : "invalid-resolution";
    throw new Error(`Invalid save spell resolution: ${reasons}`);
  }

  const spellInstanceId = String(instanceId || "").trim();
  if (!spellInstanceId) throw new Error("Invalid save spell resolution: instance-required");

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
    castContext,
    replaceNames: [resolution.spellName],
    conditionApplications,
    concentrationAction,
  });
}
