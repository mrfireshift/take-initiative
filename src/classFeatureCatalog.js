import catalog from "./class-features-runtime.json" with { type: "json" };
import {
  sanitizeCharacterBuild,
  sanitizeEnabledClassFeatureIds,
  activeClassFeatureInstances,
  classFeatureRemainingRounds,
  classFeatureDisplayName,
  classFeatureIsReferenceOnly,
  classFeatureParentFeatureId,
  classFeatureRuntimeSupport,
  classFeatureTargeting as resolveClassFeatureTargeting,
  classFeatureTheme,
  classFeatureResourceEntries,
  classFeatureResourceCostUsesActiveParent,
} from "./classFeatureCore.js";

export { classFeatureIsReferenceOnly, classFeatureRuntimeSupport };

export const CLASS_FEATURE_CATALOG = catalog;
export const CLASS_FEATURES = Object.freeze(
  (Array.isArray(catalog.features) ? catalog.features : []).map(Object.freeze)
);
export const CLASS_FEATURE_CLASSES = Object.freeze(
  (Array.isArray(catalog.classes) ? catalog.classes : []).map(Object.freeze)
);
export const CLASS_FEATURE_SUBCLASSES = Object.freeze(
  (Array.isArray(catalog.subclasses) ? catalog.subclasses : []).map(Object.freeze)
);
export const CLASS_FEATURE_RESOURCE_POOLS = Object.freeze(
  (Array.isArray(catalog.resourcePools) ? catalog.resourcePools : []).map(Object.freeze)
);

export const CLASS_FEATURE_BY_ID = new Map(
  CLASS_FEATURES.map((feature) => [feature.id, feature])
);
export const CLASS_FEATURE_RESOURCE_POOL_BY_ID = new Map(
  CLASS_FEATURE_RESOURCE_POOLS.map((pool) => [pool.id, pool])
);

export function getClassFeatureDefinition(featureId) {
  return CLASS_FEATURE_BY_ID.get(String(featureId || "").trim()) || null;
}

export function getClassFeatureResourcePool(poolId) {
  return CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(String(poolId || "").trim()) || null;
}

export function getClassFeatureSubclasses(classId) {
  const wanted = String(classId || "").trim();
  return CLASS_FEATURE_SUBCLASSES.filter((entry) => entry.classId === wanted);
}

export function getAdditionalSubclassSpellEntries(profile, classId) {
  const wantedClassId = String(classId || "").trim();
  if (!wantedClassId) return { subclass: null, entries: [] };
  const classEntry = sanitizeCharacterBuild(profile?.characterBuild)
    .find((entry) => entry.classId === wantedClassId);
  if (!classEntry?.subclassId) return { subclass: null, entries: [] };
  const subclass = CLASS_FEATURE_SUBCLASSES.find((entry) =>
    entry.id === classEntry.subclassId && entry.classId === wantedClassId
  ) || null;
  const byLevel = subclass?.additionalSpellsByLevel;
  if (!byLevel || typeof byLevel !== "object") {
    return { subclass, entries: [] };
  }
  return {
    subclass,
    entries: Object.entries(byLevel)
      .filter(([level]) => Number(level) <= classEntry.level)
      .sort(([left], [right]) => Number(left) - Number(right))
      .flatMap(([level, names]) => (Array.isArray(names) ? names : []).map((name) => ({
        level: Number(level),
        name,
      }))),
  };
}

export function orderClassFeaturesByParent(features) {
  const entries = (Array.isArray(features) ? features : [])
    .filter((feature) => feature?.id);
  const byId = new Map(entries.map((feature) => [feature.id, feature]));
  const childrenByParent = new Map();
  for (const feature of entries) {
    const parentId = classFeatureParentFeatureId(feature);
    if (!parentId || !byId.has(parentId)) continue;
    const children = childrenByParent.get(parentId) || [];
    children.push(feature);
    childrenByParent.set(parentId, children);
  }

  const ordered = [];
  const visited = new Set();
  const append = (feature) => {
    if (!feature?.id || visited.has(feature.id)) return;
    visited.add(feature.id);
    ordered.push(feature);
    for (const child of childrenByParent.get(feature.id) || []) append(child);
  };

  const roots = entries.filter((feature) => {
    const parentId = classFeatureParentFeatureId(feature);
    return !parentId || !byId.has(parentId);
  });
  for (const feature of roots) append(feature);
  for (const feature of entries) append(feature);
  return ordered;
}

export function classFeatureAvailableForBuild(feature, characterBuild) {
  if (!feature?.classId) return false;
  const build = sanitizeCharacterBuild(characterBuild);
  const classEntry = build.find((entry) => entry.classId === feature.classId);
  if (!classEntry || classEntry.level < Number(feature.minimumLevel || 1)) return false;
  return !feature.subclassId || classEntry.subclassId === feature.subclassId;
}

export function getAvailableClassFeatures(characterBuild) {
  return CLASS_FEATURES.filter((feature) =>
    classFeatureAvailableForBuild(feature, characterBuild)
  );
}

export function getEnabledClassFeatures(profile) {
  const available = getAvailableClassFeatures(profile?.characterBuild);
  const configured = profile?.classFeaturesConfigured === true;
  const enabled = new Set(sanitizeEnabledClassFeatureIds(profile?.enabledClassFeatureIds));
  const selected = available.filter((feature) =>
    configured ? enabled.has(feature.id) : feature.defaultEnabled
  );
  const seenOptionGroups = new Set();
  const result = [];
  for (const feature of selected) {
    if (feature.optionGroup) {
      if (seenOptionGroups.has(feature.optionGroup)) continue;
      seenOptionGroups.add(feature.optionGroup);
    }
    result.push(feature);
  }
  return result;
}

export function classFeatureTargetMode(feature, characterBuild = []) {
  return resolveClassFeatureTargeting(feature, characterBuild).mode === "single-target"
    ? "selection"
    : "self";
}

export function classFeatureTargeting(feature, characterBuild = []) {
  return resolveClassFeatureTargeting(feature, characterBuild);
}

export function classFeatureDisplayNameWithParent(feature, choiceId = "") {
  const label = classFeatureDisplayName(feature, choiceId);
  const parentId = classFeatureParentFeatureId(feature);
  const parent = parentId ? CLASS_FEATURE_BY_ID.get(parentId) : null;
  const parentName = String(parent?.name || "").trim();
  return parentName && !label.includes(parentName)
    ? `${parentName}: ${label}`
    : label;
}

export function buildClassFeatureQuickActions(profile) {
  return getEnabledClassFeatures(profile)
    .filter((feature) => (
      !classFeatureIsReferenceOnly(feature)
      && feature.quickActionEligible !== false
      && classFeatureRuntimeSupport(feature).ready
    ))
    .map((feature) => ({
      version: 1,
      id: `feature:${feature.id}`,
      label: classFeatureDisplayNameWithParent(feature),
      kind: "feature",
      featureId: feature.id,
      targetMode: classFeatureTargetMode(feature, profile?.characterBuild),
    }));
}

function classFeatureResourceStatus(feature, profile, stateValue) {
  const costs = Array.isArray(feature?.resourceCosts) ? feature.resourceCosts : [];
  if (!costs.length) {
    return { ready: true, entries: [] };
  }
  const entries = classFeatureResourceEntries(
    stateValue,
    [feature],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
  );
  const byId = new Map(entries.map((entry) => [entry.pool.id, entry]));
  const resourceEntries = costs.map((cost) => {
    const entry = byId.get(String(cost?.poolId || "").trim());
    const amount = cost?.variable === true
      ? 1
      : Math.max(1, Math.floor(Number(cost?.amount) || 1));
    const sharedWithActiveParent = classFeatureResourceCostUsesActiveParent(
      feature,
      cost,
      stateValue,
    );
    return {
      poolId: String(cost?.poolId || "").trim(),
      amount,
      current: entry?.current ?? null,
      maximum: entry?.maximum ?? null,
      unlimited: entry?.unlimited === true,
      ready: !!entry && (
        sharedWithActiveParent
        || entry.unlimited === true
        || entry.current === null
        || Number(entry.current) >= amount
      ),
    };
  });
  return {
    ready: resourceEntries.every((entry) => entry.ready),
    entries: resourceEntries,
  };
}

export function buildClassFeatureContextEntries(
  profile,
  stateValue,
  currentRound = null,
) {
  const active = activeClassFeatureInstances(stateValue, currentRound);
  return getEnabledClassFeatures(profile)
    .filter((feature) => (
      !classFeatureIsReferenceOnly(feature)
      && feature.quickActionEligible !== false
    ))
    .map((feature) => {
      const runtimeSupport = classFeatureRuntimeSupport(feature);
      const targeting = resolveClassFeatureTargeting(feature, profile?.characterBuild);
      const activeInstances = active
        .filter((instance) => instance.featureId === feature.id)
        .map((instance) => ({
          instanceId: instance.instanceId,
          remainingRounds: classFeatureRemainingRounds(instance, currentRound),
          targetIds: [...(instance.targetIds || [])],
        }));
      const resources = classFeatureResourceStatus(feature, profile, stateValue);
      return {
        featureId: feature.id,
        label: classFeatureDisplayNameWithParent(feature),
        plainName: String(feature.name || feature.id),
        targetMode: targeting.mode,
        targetLabel: targeting.mode === "aura"
          ? "area"
          : targeting.mode === "single-target"
            ? "bersaglio"
            : "su di sé",
        rangeMeters: targeting.rangeMeters,
        active: activeInstances.length > 0,
        activeInstances,
        resourceReady: resources.ready,
        resources: resources.entries,
        runtimeStatus: runtimeSupport.status,
        runtimeReady: runtimeSupport.ready,
        runtimeReason: runtimeSupport.reason,
        theme: classFeatureTheme(feature),
      };
    });
}

export function classFeatureBuildLabel(characterBuild) {
  const classById = new Map(CLASS_FEATURE_CLASSES.map((entry) => [entry.id, entry]));
  const subclassById = new Map(CLASS_FEATURE_SUBCLASSES.map((entry) => [entry.id, entry]));
  return sanitizeCharacterBuild(characterBuild).map((entry) => {
    const className = classById.get(entry.classId)?.name || entry.classId;
    const subclassName = subclassById.get(entry.subclassId)?.name || "";
    return `${className} ${entry.level}${subclassName ? ` · ${subclassName}` : ""}`;
  });
}
