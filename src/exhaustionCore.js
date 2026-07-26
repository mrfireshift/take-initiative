export const EXHAUSTION_CONDITION = "Indebolimento";

export function normalizeExhaustionLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(5, Math.round(number)));
}

function isExhaustionInstance(instance) {
  return String(instance?.condition || instance?.name || "").trim().toLocaleLowerCase("it") ===
    EXHAUSTION_CONDITION.toLocaleLowerCase("it");
}

export function exhaustionLevelFromInstances(instances = []) {
  let baseLevel = 0;
  let contributions = 0;
  for (const instance of Array.isArray(instances) ? instances : []) {
    if (!instance || instance.active === false || !isExhaustionInstance(instance)) continue;
    const rawLevel = instance.level;
    const normalized = rawLevel === undefined || rawLevel === null || rawLevel === ""
      ? 1
      : normalizeExhaustionLevel(rawLevel);
    if (instance.exhaustionContribution === true) contributions += normalized || 1;
    else baseLevel = Math.max(baseLevel, normalized || 1);
  }
  return normalizeExhaustionLevel(baseLevel + contributions);
}

export function exhaustionContributionLevelFromInstances(instances = []) {
  return normalizeExhaustionLevel((Array.isArray(instances) ? instances : [])
    .filter((instance) =>
      instance
      && instance.active !== false
      && isExhaustionInstance(instance)
      && instance.exhaustionContribution === true
    )
    .reduce((sum, instance) => sum + Math.max(
      1,
      normalizeExhaustionLevel(instance.level ?? 1),
    ), 0));
}

export function reconcileExhaustionInstances(instances = [], requestedLevel, options = {}) {
  const source = Array.isArray(instances) ? instances : [];
  const level = normalizeExhaustionLevel(requestedLevel);
  const firstIndex = source.findIndex((instance) =>
    isExhaustionInstance(instance) && instance.exhaustionContribution !== true
  );
  const existing = firstIndex >= 0 ? source[firstIndex] : null;
  const remaining = source.filter((instance) =>
    !isExhaustionInstance(instance) || instance.exhaustionContribution === true
  );
  if (level === 0) return remaining;

  const canonical = {
    id: String(existing?.id || options.id || ""),
    condition: EXHAUSTION_CONDITION,
    active: true,
    level,
    targetId: String(options.targetId || existing?.targetId || ""),
    expiry: { mode: "manual" },
    type: "initiative-card",
    createdAt: Number(existing?.createdAt) > 0
      ? Number(existing.createdAt)
      : (Number(options.createdAt) > 0 ? Number(options.createdAt) : Date.now()),
  };

  const insertionIndex = firstIndex < 0 ? remaining.length : Math.min(firstIndex, remaining.length);
  remaining.splice(insertionIndex, 0, canonical);
  return remaining;
}
