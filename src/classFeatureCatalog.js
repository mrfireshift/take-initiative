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
import { SPECIES_FEATURES, SPECIES_RESOURCE_POOLS, speciesFeaturesForProfile } from "./speciesTraitCore.js";
import { FEATS, FEATS_FIELD, FEAT_FEATURES, FEAT_RESOURCE_POOLS, FEAT_THEME, featBorrowedPoolId, featChosenOptionIds,
  featFeaturesForProfile, sanitizeFeats } from "./featCatalog.js";
import { SPELL_SLOT_RESOURCE_POOLS } from "./spellSlotCore.js";

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

// Lot F9 of docs/STUDIO_TALENTI.md: the options a feat borrows from a class (a fighting style, an invocation), each a
// card of the feat, "talento-<feat>-<option>", copied from the class's record: its name, manual, page and use; its text
// is the option's (sourceFeatureId, classFeatureDescriptions.js). Built here: the feat catalog does not load the class
// catalog. Reference cards, as the class's are today, except where the feat has points of its own (featOptionUse).
const NOT_AUTOMATED = Object.freeze({ status: "not-automated", adapter: null, reason: "adapter-not-implemented" });
const SELF_TARGETING = Object.freeze({ mode: "self", rangeMeters: null, maxTargets: 1, excludeSource: false });
// Lot F9-2: a feat with a pool of its own for the options (Metamagic Adept's points, decision D14) keeps the class's use
// of the option (its adapter and costs), the costs spending the feat's pool instead of the class's.
function featOptionUse(feat, source) {
  const poolId = featBorrowedPoolId(feat.id);
  if (!poolId) return {};
  const costs = (Array.isArray(source.resourceCosts) ? source.resourceCosts : []).map((cost) => Object.freeze({ ...cost, poolId }));
  return {
    automationLevel: source.automationLevel,
    completenessStatus: source.completenessStatus,
    runtimeSupport: source.runtimeSupport,
    trackingMode: source.trackingMode,
    trackedResourcePoolIds: Object.freeze([poolId]),
    resourceCosts: Object.freeze(costs),
  };
}
function featOptionRecord(feat, slot, source) {
  const slug = source.id.slice(slot.parentFeatureId.length + 1);
  return Object.freeze({
    id: `talento-${feat.id}-${slug}`,
    name: `${feat.name}: ${source.name}`,
    description: "",
    classId: "",
    subclassId: "",
    featId: feat.id,
    featOption: Object.freeze({ key: slot.key, slug }),
    sourceFeatureId: source.id,
    minimumLevel: 1,
    source: source.source,
    sourceLabel: source.sourceLabel,
    page: source.page,
    collection: "talenti",
    defaultEnabled: true,
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    automationLevel: "riferimento",
    completenessStatus: "reference",
    runtimeSupport: NOT_AUTOMATED,
    activation: source.activation,
    targetMode: "self",
    targeting: SELF_TARGETING,
    effectPlan: null,
    duration: Object.freeze({ rounds: null }),
    trackingMode: "instant",
    trackedResourcePoolIds: Object.freeze([]),
    theme: FEAT_THEME,
    breaksConcentration: false,
    resourceCosts: Object.freeze([]),
    ...featOptionUse(feat, source),
  });
}
const FEAT_OPTIONS_BY_FEAT = new Map(FEATS.filter((feat) => feat.borrowed).map((feat) => [feat.id, Object.freeze(CLASS_FEATURES
  .filter((source) => source.parentFeatureId === feat.borrowed.parentFeatureId && source.id.startsWith(`${feat.borrowed.parentFeatureId}-`))
  .map((source) => featOptionRecord(feat, feat.borrowed, source)))]));
export const FEAT_OPTION_FEATURES = Object.freeze([...FEAT_OPTIONS_BY_FEAT.values()].flat());

// Species traits share the class-feature record shape: they resolve by id like class features,
// but stay out of CLASS_FEATURES so the class editor and the catalog audits never list them. The feats
// (featCatalog.js, docs/STUDIO_TALENTI.md) do the same, and so do the options they borrow (lot F9).
export const CLASS_FEATURE_BY_ID = new Map(
  [...CLASS_FEATURES, ...SPECIES_FEATURES, ...FEAT_FEATURES, ...FEAT_OPTION_FEATURES].map((feature) => [feature.id, feature])
);

// The options a feat lets choose (lot F9), for the sheet's menus and the import: { slug, name, minimumLevel, featureId },
// the class's own level (an invocation's warlock level) kept for the warnings.
export function featBorrowedCandidates(featId) {
  return (FEAT_OPTIONS_BY_FEAT.get(String(featId || "")) || []).map((record) => ({ slug: record.featOption.slug,
    name: record.name.slice(record.name.indexOf(": ") + 2), featureId: record.id,
    minimumLevel: CLASS_FEATURES.find((source) => source.id === record.sourceFeatureId)?.minimumLevel || 1 }));
}

// The warnings of a chosen option (decision D8, never a block): an invocation above the character's warlock level (the
// 2nd is when a warlock gets them, no prerequisite).
export function featBorrowedWarnings(entry, characterBuild = []) {
  const candidates = featBorrowedCandidates(entry?.id);
  const warlock = (Array.isArray(characterBuild) ? characterBuild : []).find((row) => row?.classId === "warlock");
  const level = Number.isInteger(warlock?.level) ? warlock.level : 0;
  const chosen = featChosenOptionIds(entry).map((slug) => candidates.find((candidate) => candidate.slug === slug)).filter(Boolean);
  const warnings = chosen
    .filter((candidate) => candidate.minimumLevel > 2 && entry.id === "adepto-occulto" && level < candidate.minimumLevel)
    .map((candidate) => `${candidate.name} chiede un warlock di ${candidate.minimumLevel}° livello: i prerequisiti li controlla il GM.`);
  // Lot F9-2: an option that costs more than the feat's points (Heightened Spell, 3 of 2) cannot be used with them.
  const pool = getClassFeatureResourcePool(featBorrowedPoolId(entry?.id));
  const capacity = pool?.capacity?.type === "fixed" ? pool.capacity.value : null;
  for (const candidate of chosen) {
    const cost = CLASS_FEATURE_BY_ID.get(candidate.featureId)?.resourceCosts?.find((value) => value?.poolId);
    if (capacity !== null && cost && cost.variable !== true && Number(cost.amount) > capacity) {
      warnings.push(`${candidate.name} costa ${cost.amount} punti: con i ${capacity} del talento non si usa.`);
    }
  }
  return warnings;
}

// The cards of the options chosen on the sheet, in the feats' order.
function featOptionFeaturesForProfile(profile) {
  const result = [];
  for (const entry of sanitizeFeats(profile?.[FEATS_FIELD])) {
    for (const slug of featChosenOptionIds(entry)) {
      const record = CLASS_FEATURE_BY_ID.get(`talento-${entry.id}-${slug}`);
      if (record?.featOption && !result.includes(record)) result.push(record);
    }
  }
  return result;
}
// Spell slot pools resolve by id too, for the state operations and the resource reset; like the species
// and feat pools they stay out of CLASS_FEATURE_RESOURCE_POOLS and its audits.
export const CLASS_FEATURE_RESOURCE_POOL_BY_ID = new Map(
  [...CLASS_FEATURE_RESOURCE_POOLS, ...SPECIES_RESOURCE_POOLS, ...FEAT_RESOURCE_POOLS, ...SPELL_SLOT_RESOURCE_POOLS].map((pool) => [pool.id, pool])
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
  return [...result, ...getSpeciesFeatures(profile), ...getFeatFeatures(profile)];
}

// Species traits are always enabled for the profile's species and ancestry.
export function getSpeciesFeatures(profile) {
  const totalLevel = Math.min(20, sanitizeCharacterBuild(profile?.characterBuild)
    .reduce((total, entry) => total + entry.level, 0));
  return speciesFeaturesForProfile(profile, totalLevel);
}

// The feats of the sheet are always enabled, like the species traits, with the options they borrow (lot F9).
export function getFeatFeatures(profile) {
  return [...featFeaturesForProfile(profile), ...featOptionFeaturesForProfile(profile)];
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

export function classFeatureResourceStatus(feature, profile, stateValue) {
  const costs = Array.isArray(feature?.resourceCosts) ? feature.resourceCosts : [];
  if (!costs.length) {
    return { ready: true, entries: [] };
  }
  const entries = classFeatureResourceEntries(
    stateValue,
    [feature],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile?.characterBuild,
    profile?.abilityModifiers,
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
