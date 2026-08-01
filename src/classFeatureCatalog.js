import catalog from "./class-features-runtime.json" with { type: "json" };
import {
  sanitizeCharacterBuild,
  sanitizeEnabledClassFeatureIds,
  activeClassFeatureInstances,
  classFeatureRemainingRounds,
  classFeatureDisplayName,
  classFeatureRuntimeSupport,
  classFeatureTargeting as resolveClassFeatureTargeting,
  classFeatureTheme,
  classFeatureResourceEntries,
  classFeatureResourceCostUsesActiveParent,
} from "./classFeatureCore.js";

export { classFeatureRuntimeSupport };

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
  return available.filter((feature) =>
    configured ? enabled.has(feature.id) : feature.defaultEnabled
  );
}

export function classFeatureTargetMode(feature) {
  return resolveClassFeatureTargeting(feature).mode === "single-target"
    ? "selection"
    : "self";
}

export function classFeatureTargeting(feature) {
  return resolveClassFeatureTargeting(feature);
}

export function buildClassFeatureQuickActions(profile) {
  return getEnabledClassFeatures(profile)
    .filter((feature) => classFeatureRuntimeSupport(feature).ready)
    .map((feature) => ({
      version: 1,
      id: `feature:${feature.id}`,
      label: classFeatureDisplayName(feature),
      kind: "feature",
      featureId: feature.id,
      targetMode: classFeatureTargetMode(feature),
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
    const amount = Math.max(1, Math.floor(Number(cost?.amount) || 1));
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
  return getEnabledClassFeatures(profile).map((feature) => {
    const runtimeSupport = classFeatureRuntimeSupport(feature);
    const targeting = resolveClassFeatureTargeting(feature);
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
      label: classFeatureDisplayName(feature),
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
