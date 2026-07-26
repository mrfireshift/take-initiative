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

export function saveSpellResolutionOperations({
  resolution = null,
  instanceId = "",
  casterName = "",
  turns = 1,
  spellExpiry = null,
  appliedAt = null,
  concentrationAction = "replace",
} = {}) {
  if (!resolution?.valid) {
    const reasons = Array.isArray(resolution?.errors) ? resolution.errors.join(", ") : "invalid-resolution";
    throw new Error(`Invalid save spell resolution: ${reasons}`);
  }

  const spellInstanceId = String(instanceId || "").trim();
  if (!spellInstanceId) throw new Error("Invalid save spell resolution: instance-required");

  const targetIds = uniqueIds(resolution.spellTargetIds);
  const casterId = String(resolution.casterId || "").trim();
  const concentration = resolution.concentration === true;
  const concentrationMode = ["dismiss", "extend"].includes(concentrationAction)
    ? concentrationAction
    : "replace";
  const operations = [];

  if (concentrationMode !== "extend" && concentration && casterId) {
    operations.push({ type: "concentration:break", casterIds: [casterId] });
  }
  if (targetIds.length) {
    operations.push({
      type: "spell:upsert",
      targetIds,
      name: resolution.spellName,
      turns: Math.max(1, Math.floor(Number(turns) || 1)),
      conc: concentrationMode !== "dismiss" && concentration && !!casterId,
      source: casterId,
      instanceId: spellInstanceId,
      spellId: resolution.spellId,
      ...(spellExpiry ? { expiry: clone(spellExpiry) } : {}),
      ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
      ...(concentrationMode === "extend"
        ? {}
        : { replaceNames: uniqueIds([resolution.spellName]) }),
    });
  }

  const automatedSubjectIds = [];
  for (const application of resolution.conditionApplications || []) {
    const applicationTargetIds = uniqueIds(application?.targetIds);
    const conditionName = String(application?.conditionName || "").trim();
    if (!applicationTargetIds.length || !conditionName) continue;
    automatedSubjectIds.push(...applicationTargetIds);
    operations.push({
      type: "condition:add",
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

  if (concentrationMode !== "dismiss" && concentration && casterId) {
    operations.push({
      type: "concentration:register",
      casterId,
      targetIds,
      name: resolution.spellName,
      instanceId: spellInstanceId,
      spellId: resolution.spellId,
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
