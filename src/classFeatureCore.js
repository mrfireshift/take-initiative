import { gridPlanarDistance } from "./distance3dCore.js";

export const CLASS_FEATURE_STATE_FIELD = "classFeatureState";
export const CLASS_FEATURE_STATE_VERSION = 1;
export const MAX_CHARACTER_CLASSES = 4;
export const MAX_ENABLED_CLASS_FEATURES = 256;
export const MAX_CLASS_FEATURE_INSTANCES = 256;
export const CLASS_FEATURE_MAX_VISIBLE_DURATION_ROUNDS = 10;

const BARDIC_INSPIRATION_EFFECT_ID = "bardo-ispirazione-bardica";
const BERSERKER_FRENZY_FEATURE_ID = "barbaro-cammino-del-berserker-frenesia";
const BERSERKER_RAGE_FEATURE_ID = "barbaro-ira";

export const CLASS_FEATURE_RUNTIME_STATUS = Object.freeze({
  IMPLEMENTED: "implemented",
  NOT_AUTOMATED: "not-automated",
});

const DEFAULT_CLASS_FEATURE_THEME = Object.freeze({
  emoji: "✨",
  accent: "#38bdf8",
  background: "#0c4a6e",
  text: "#ecfeff",
});

function shortText(value, maxLength = 160) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function themeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;
}

export function classFeatureTheme(feature) {
  const raw = feature?.theme && typeof feature.theme === "object"
    ? feature.theme
    : {};
  return {
    emoji: shortText(raw.emoji || DEFAULT_CLASS_FEATURE_THEME.emoji, 8),
    accent: themeColor(raw.accent, DEFAULT_CLASS_FEATURE_THEME.accent),
    background: themeColor(raw.background, DEFAULT_CLASS_FEATURE_THEME.background),
    text: themeColor(raw.text, DEFAULT_CLASS_FEATURE_THEME.text),
  };
}

export function classFeatureRuntimeSupport(feature) {
  const raw = feature?.runtimeSupport;
  // Cataloghi creati prima di questo campo restano compatibili con l'adapter
  // legacy fino alla successiva rigenerazione.
  if (!raw || typeof raw !== "object") {
    return {
      status: "legacy",
      adapter: "legacy",
      reason: null,
      ready: true,
    };
  }
  const status = String(raw.status || CLASS_FEATURE_RUNTIME_STATUS.NOT_AUTOMATED)
    .trim()
    .toLowerCase();
  return {
    status,
    adapter: String(raw.adapter || "").trim() || null,
    reason: String(raw.reason || "").trim() || null,
    ready: status === CLASS_FEATURE_RUNTIME_STATUS.IMPLEMENTED,
  };
}

const REFERENCE_ONLY_ACTIVATIONS = new Set([
  "passiva",
  "contenitore_opzioni",
  "sistema_incantesimi",
]);

export function classFeatureIsReferenceOnly(feature) {
  const runtimeSupport = classFeatureRuntimeSupport(feature);
  if (runtimeSupport.status !== CLASS_FEATURE_RUNTIME_STATUS.NOT_AUTOMATED) {
    return false;
  }
  const automationLevel = String(feature?.automationLevel || "")
    .trim()
    .toLowerCase();
  const activation = String(feature?.activation?.primary || "")
    .trim()
    .toLowerCase();
  return automationLevel === "riferimento"
    || REFERENCE_ONLY_ACTIVATIONS.has(activation);
}

export function classFeatureRequiredActiveFeatureId(feature) {
  return shortText(
    feature?.requiresActiveFeatureId
      || feature?.requires_active_feature_id,
    220,
  );
}

export function classFeatureParentFeatureId(feature) {
  return shortText(
    feature?.parentFeatureId
      || feature?.parent_feature_id,
    220,
  );
}

export function classFeaturePassiveMovementMechanics(feature) {
  const activation = String(feature?.activation?.primary || "")
    .trim()
    .toLowerCase();
  if (activation !== "passiva") return null;
  const movement = feature?.passiveMechanics?.movement;
  return movement && typeof movement === "object"
    ? { ...movement }
    : null;
}

export function classFeatureChoiceOptions(feature) {
  return (Array.isArray(feature?.choiceOptions) ? feature.choiceOptions : [])
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const id = shortText(option.id || option.value, 120);
      const label = shortText(option.label || option.name || id, 160);
      if (!id || !label) return null;
      return {
        id,
        label,
        ...(option.effectPlan && typeof option.effectPlan === "object"
          ? { effectPlan: option.effectPlan }
          : {}),
      };
    })
    .filter(Boolean);
}

export function classFeatureRequiresActivationChoice(feature, enabledFeatureIds = []) {
  const choices = classFeatureChoiceOptions(feature);
  if (!choices.length) return false;
  if (feature?.choiceMode === "configuration") return false;
  const parentId = classFeatureDurationParentFeatureId(feature);
  if (parentId) {
    const parent = CLASS_FEATURE_BY_ID.get(parentId);
    if (parent && classFeatureChoiceOptions(parent).length > 0) return false;
  }
  const enabledChoiceId = (Array.isArray(enabledFeatureIds) ? enabledFeatureIds : [])
    .map((id) => {
      const match = choices.find((c) => id === `${feature.id}-${c.id}` || id.endsWith(`-${c.id}`));
      return match ? match.id : "";
    })
    .find(Boolean) || "";
  if (enabledChoiceId) return false;
  return true;
}

export function classFeatureChoiceOption(feature, choiceId = "") {
  const wanted = shortText(choiceId, 120);
  if (!wanted) return null;
  return classFeatureChoiceOptions(feature)
    .find((option) => option.id === wanted) || null;
}

export function classFeatureEffectPlan(feature, choiceId = "") {
  const base = feature?.effectPlan && typeof feature.effectPlan === "object"
    ? feature.effectPlan
    : {};
  const option = classFeatureChoiceOption(feature, choiceId);
  const optionPlan = option?.effectPlan && typeof option.effectPlan === "object"
    ? option.effectPlan
    : null;
  return optionPlan ? { ...base, ...optionPlan } : base;
}

export function classFeatureBreaksConcentration(feature) {
  return feature?.breaksConcentration === true
    || classFeatureDurationParentFeatureId(feature) === "barbaro-ira";
}

export function purifyingSpellSelectionOptions(spells = []) {
  return (Array.isArray(spells) ? spells : [])
    .filter((spell) => spell?.castContext?.staticZoneOwner !== true)
    .map((spell) => {
      const instanceId = String(spell?.instanceId || "").trim();
      const name = String(spell?.name || "Incantesimo").trim();
      const casterName = String(spell?.casterName || "").trim();
      const isConcentration = Boolean(spell?.conc);
      return {
        instanceId,
        name,
        casterName,
        isConcentration,
        label: name,
        subtitle: casterName ? `Lanciato da ${casterName}` : "",
      };
    });
}

export function resolvePurifyingSpellChoice(spells = [], selectedIdentifier = "") {
  const options = purifyingSpellSelectionOptions(spells);
  if (!options.length) return null;
  const wanted = String(selectedIdentifier || "").trim();
  if (!wanted) return options[0];
  const byInstance = options.find((opt) => opt.instanceId === wanted);
  if (byInstance) return byInstance;
  const byName = options.find((opt) => opt.name.toLowerCase() === wanted.toLowerCase());
  return byName || null;
}

export function classFeatureDisplayName(feature, choiceId = "") {
  const name = String(feature?.name || "Capacità").trim();
  const choice = classFeatureChoiceOption(feature, choiceId);
  if (!choice) return `${classFeatureTheme(feature).emoji} ${name}`.trim();
  const projectedName = String(
    classFeatureEffectProjection(feature, choice.id)?.conditionName || ""
  ).trim();
  return `${classFeatureTheme(feature).emoji} ${projectedName || `${name}: ${choice.label}`}`.trim();
}

export function classFeatureTargetWithinRange(
  sourceGeometry,
  targetGeometry,
  rangeCells,
  dpi = 1,
) {
  if (!sourceGeometry?.position || !targetGeometry?.position) return true;
  const limit = Number(rangeCells);
  if (!Number.isFinite(limit) || limit < 0) return true;
  const planar = gridPlanarDistance(
    sourceGeometry.position,
    targetGeometry.position,
    dpi,
    1,
    sourceGeometry.size,
    targetGeometry.size,
  );
  return planar.squares <= limit + 1e-6;
}

function optionalInteger(value, minimum, maximum) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

export function sanitizeCharacterBuild(value) {
  const source = Array.isArray(value) ? value : [];
  const seenClasses = new Set();
  const result = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const classId = shortText(entry.classId ?? entry.class_id, 80);
    const level = optionalInteger(entry.level, 1, 20);
    if (!classId || level === null || seenClasses.has(classId)) continue;
    seenClasses.add(classId);
    result.push({
      classId,
      level,
      subclassId: shortText(entry.subclassId ?? entry.subclass_id, 180),
    });
    if (result.length >= MAX_CHARACTER_CLASSES) break;
  }
  return result;
}

export function sanitizeEnabledClassFeatureIds(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const raw of source) {
    const id = shortText(raw, 220);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_ENABLED_CLASS_FEATURES) break;
  }
  return result;
}

export function characterClassLevel(characterBuild, classId) {
  const wanted = shortText(classId, 80);
  return sanitizeCharacterBuild(characterBuild)
    .find((entry) => entry.classId === wanted)?.level || 0;
}

export function classFeatureConditionResourceDie(value, characterBuild = []) {
  const effectId = String(
    value?.effectId
      || value?.conditionEffectId
      || value?.effectPlan?.conditionEffectId
      || value?.id
      || ""
  ).trim();
  const condition = String(value?.condition || value?.conditionName || "").trim();
  const type = String(value?.type || "").trim();
  const isBardicInspiration = effectId === BARDIC_INSPIRATION_EFFECT_ID
    || ((type === "class-feature" || type === "class-feature-area")
      && condition === "Ispirazione Bardica");
  if (!isBardicInspiration) return null;

  const level = characterClassLevel(characterBuild, "bardo");
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5) return "d8";
  if (level >= 1) return "d6";
  return null;
}

export function normalizeClassFeatureState(value) {
  const source = value && typeof value === "object" ? value : {};
  const resources = {};
  for (const [poolId, entry] of Object.entries(
    source.resources && typeof source.resources === "object"
      ? source.resources
      : {}
  )) {
    const id = shortText(poolId, 220);
    if (!id || !entry || typeof entry !== "object") continue;
    const maximum = optionalInteger(entry.maximum, 0, 9999);
    const current = optionalInteger(entry.current, 0, 9999);
    resources[id] = {
      current: current ?? maximum,
      maximum,
      unlimited: entry.unlimited === true,
    };
  }

  const instances = [];
  const seen = new Set();
  for (const entry of Array.isArray(source.instances) ? source.instances : []) {
    if (!entry || typeof entry !== "object") continue;
    const instanceId = shortText(entry.instanceId ?? entry.id, 220);
    const featureId = shortText(entry.featureId, 220);
    if (!instanceId || !featureId || seen.has(instanceId)) continue;
    seen.add(instanceId);
    const startedRound = optionalInteger(entry.startedRound, 1, 99999);
    const expiresRound = optionalInteger(entry.expiresRound, 1, 99999);
    instances.push({
      instanceId,
      featureId,
      sourceId: shortText(entry.sourceId, 220),
      targetIds: Array.from(new Set(
        (Array.isArray(entry.targetIds) ? entry.targetIds : [])
          .map((id) => shortText(id, 220))
          .filter(Boolean)
      )),
      suppressedTargetIds: Array.from(new Set(
        (Array.isArray(entry.suppressedTargetIds) ? entry.suppressedTargetIds : [])
          .map((id) => shortText(id, 220))
          .filter(Boolean)
      )),
      parentFeatureId: shortText(entry.parentFeatureId, 220),
      parentInstanceId: shortText(entry.parentInstanceId, 220),
      startedRound,
      startedTurnKey: shortText(entry.startedTurnKey, 220),
      expiresRound,
      createdAt: Math.max(0, Number(entry.createdAt) || 0),
      ...(shortText(entry.choiceId, 120)
        ? { choiceId: shortText(entry.choiceId, 120) }
        : {}),
    });
    if (instances.length >= MAX_CLASS_FEATURE_INSTANCES) break;
  }
  return {
    version: CLASS_FEATURE_STATE_VERSION,
    resources,
    instances,
  };
}

function finiteResourceValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
}

export function resolveClassFeatureResourceMaximum(pool, characterBuild) {
  if (!pool || typeof pool !== "object") {
    return { maximum: null, unlimited: false };
  }
  const capacity = pool.capacity && typeof pool.capacity === "object"
    ? pool.capacity
    : {};
  const normalizedExpression = String(capacity.expression || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  const totalCharacterLevel = Math.min(20, sanitizeCharacterBuild(characterBuild)
    .reduce((total, entry) => total + entry.level, 0));
  const formulaValue = capacity.type === "formula"
    && normalizedExpression === "bonus_competenza"
    && totalCharacterLevel > 0
    ? 2 + Math.floor((totalCharacterLevel - 1) / 4)
    : null;
  const classId = String(
    capacity.class_id
    || pool.owner?.classId
    || ""
  ).trim();
  const level = classId ? characterClassLevel(characterBuild, classId) : 0;
  const byLevel = pool.maximumByClassLevel && typeof pool.maximumByClassLevel === "object"
    ? pool.maximumByClassLevel
    : null;
  const raw = byLevel && level
    ? byLevel[String(level)]
    : capacity.type === "fixed"
      ? capacity.value
      : formulaValue;
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "illimitato" || normalized === "illimitate" || normalized === "unlimited") {
    return { maximum: null, unlimited: true };
  }
  return {
    maximum: finiteResourceValue(raw),
    unlimited: false,
  };
}

function resourcePoolClassId(pool, descriptor = null) {
  return String(
    descriptor?.class_id
      || descriptor?.classId
      || pool?.capacity?.class_id
      || pool?.capacity?.classId
      || pool?.owner?.classId
      || ""
  ).trim();
}

function classLevelValue(values, level) {
  if (!values || typeof values !== "object" || !level) return null;
  const exact = values[String(level)];
  if (exact !== undefined && exact !== null && String(exact).trim()) return exact;
  const fallbackLevel = Object.keys(values)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0 && value <= level)
    .sort((left, right) => right - left)[0];
  return fallbackLevel ? values[String(fallbackLevel)] : null;
}

export function resolveClassFeatureResourceDie(pool, characterBuild) {
  const die = pool?.die && typeof pool.die === "object" ? pool.die : null;
  const classId = resourcePoolClassId(pool, die);
  const level = classId ? characterClassLevel(characterBuild, classId) : 0;
  const raw = classLevelValue(pool?.dieByClassLevel, level);
  const normalized = String(raw ?? "").trim();
  return normalized || null;
}

export function resolveClassFeatureProgressionValue(feature, characterBuild) {
  const descriptor = feature?.diceFrom && typeof feature.diceFrom === "object"
    ? feature.diceFrom
    : null;
  const classId = String(
    descriptor?.classId
      || descriptor?.class_id
      || feature?.classId
      || ""
  ).trim();
  const level = classId ? characterClassLevel(characterBuild, classId) : 0;
  const raw = classLevelValue(feature?.diceByClassLevel, level);
  const normalized = String(raw ?? "").trim();
  return normalized || null;
}

export function resolveClassFeatureDice(feature, characterBuild) {
  return resolveClassFeatureProgressionValue(feature, characterBuild);
}

export function classFeatureResourceRefreshEvents(pool, characterBuild) {
  const classId = resourcePoolClassId(pool);
  const level = classId ? characterClassLevel(characterBuild, classId) : 0;
  const byLevel = Array.isArray(pool?.refreshByClassLevel)
    ? pool.refreshByClassLevel
    : [];
  const applicable = byLevel.filter((entry) => {
    const minimum = Math.max(1, Math.floor(Number(entry?.min_level ?? entry?.minLevel) || 1));
    const maximum = Number(entry?.max_level ?? entry?.maxLevel);
    return level >= minimum && (!Number.isFinite(maximum) || level <= maximum);
  });
  const events = applicable.flatMap((entry) => (
    Array.isArray(entry?.events) ? entry.events : []
  ));
  const fallback = Array.isArray(pool?.refresh) ? pool.refresh : [];
  return Array.from(new Set(
    (events.length ? events : fallback)
      .map((entry) => typeof entry === "string" ? entry : entry?.event)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
  ));
}

function resourceEntryForCost(state, pool, characterBuild) {
  const stored = state.resources[pool.id];
  const resolved = resolveClassFeatureResourceMaximum(pool, characterBuild);
  if (resolved.unlimited) {
    return {
      current: null,
      maximum: null,
      unlimited: true,
    };
  }
  const storedMaximum = finiteResourceValue(stored?.maximum);
  const formulaMaximumUnknown = pool?.capacity?.type === "formula"
    && resolved.maximum === null;
  const maximum = resolved.maximum ?? (
    formulaMaximumUnknown
      ? storedMaximum > 0 ? storedMaximum : null
      : storedMaximum
  );
  const storedCurrent = finiteResourceValue(stored?.current);
  return {
    current: maximum === null
      ? storedCurrent
      : Math.min(maximum, storedCurrent ?? maximum),
    maximum,
    unlimited: false,
  };
}

export function classFeatureResourceEntries(
  stateValue,
  features,
  poolsById,
  characterBuild,
) {
  const state = normalizeClassFeatureState(stateValue);
  const poolIds = Array.from(new Set(
    (Array.isArray(features) ? features : [])
      .flatMap((feature) => [
        ...(Array.isArray(feature?.resourceCosts)
          ? feature.resourceCosts.map((cost) => cost.poolId)
          : []),
        ...(Array.isArray(feature?.trackedResourcePoolIds)
          ? feature.trackedResourcePoolIds
          : []),
      ])
      .filter(Boolean)
  ));
  return poolIds.map((poolId) => {
    const pool = poolsById.get(poolId);
    if (!pool) return null;
    const die = resolveClassFeatureResourceDie(pool, characterBuild);
    const refreshEvents = classFeatureResourceRefreshEvents(pool, characterBuild);
    return {
      pool,
      ...resourceEntryForCost(state, pool, characterBuild),
      ...(die ? { die } : {}),
      ...(refreshEvents.length ? { refreshEvents } : {}),
    };
  }).filter(Boolean);
}

export function classFeatureRemainingRounds(instance, currentRound) {
  const expiresRound = optionalInteger(instance?.expiresRound, 1, 99999);
  const round = optionalInteger(currentRound, 1, 99999);
  if (expiresRound === null || round === null) return null;
  return Math.max(0, expiresRound - round + 1);
}

export function classFeatureDurationTiming(feature) {
  const timing = String(feature?.duration?.timing || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  if (timing === "next-turn" || timing === "until-next-turn") return "next-turn";
  if (timing === "next-turn-end" || timing === "until-next-turn-end") return "next-turn-end";
  if (
    timing === "turn-end"
    || timing === "until-end-of-turn"
    || timing === "current-turn-end"
  ) return "turn-end";
  return null;
}

export function classFeatureDurationParentFeatureId(feature) {
  return shortText(
    feature?.duration?.untilFeatureId
      || feature?.duration?.parentFeatureId
      || feature?.duration?.endsWithFeatureId,
    220,
  );
}

export function classFeatureAutoActivateParentFeatureId(feature) {
  const parentFeatureId = classFeatureDurationParentFeatureId(feature);
  return feature?.id === BERSERKER_FRENZY_FEATURE_ID
    && parentFeatureId === BERSERKER_RAGE_FEATURE_ID
    ? parentFeatureId
    : "";
}

export function classFeatureDurationIndefiniteFeatureId(feature) {
  return shortText(
    feature?.duration?.indefiniteWithFeatureId
      || feature?.duration?.indefinite_with_feature_id,
    220,
  );
}

export function classFeatureResolvedRadiusMeters(feature, characterBuild = []) {
  const effectPlan = classFeatureEffectPlan(feature);
  const byLevel = effectPlan?.radiusByClassLevel
    || effectPlan?.radius_by_class_level;
  if (!byLevel || typeof byLevel !== "object") return null;
  const level = characterClassLevel(characterBuild, feature?.classId);
  const levels = Object.keys(byLevel)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
  if (!levels.length) return null;
  const resolvedLevel = levels.includes(level)
    ? level
    : levels.filter((value) => value <= level).pop() || levels[0];
  const radius = Number(byLevel[String(resolvedLevel)]);
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

export function classFeatureTargeting(feature, characterBuild = []) {
  const raw = feature?.targeting && typeof feature.targeting === "object"
    ? feature.targeting
    : {};
  const fallbackMode = feature?.targetMode === "selection" ? "single-target" : "self";
  const mode = ["self", "single-target", "aura"].includes(raw.mode)
    ? raw.mode
    : fallbackMode;
  const rangeMeters = Number(raw.rangeMeters);
  const resolvedRangeMeters = Number.isFinite(rangeMeters) && rangeMeters > 0
    ? rangeMeters
    : classFeatureResolvedRadiusMeters(feature, characterBuild);
  const maxTargets = raw.maxTargets === null
    ? null
    : Math.max(1, Math.floor(Number(raw.maxTargets) || (mode === "self" || mode === "single-target" ? 1 : 1)));
  return {
    mode,
    rangeMeters: resolvedRangeMeters,
    maxTargets,
    excludeSource: raw.excludeSource === false
      ? false
      : mode === "single-target" || raw.excludeSource === true,
  };
}

export function classFeatureTargetIds(
  feature,
  sourceId,
  requestedTargetIds = [],
  characterBuild = [],
) {
  const targeting = classFeatureTargeting(feature, characterBuild);
  const source = shortText(sourceId, 220);
  if (targeting.mode === "self" || targeting.mode === "aura") {
    return source ? [source] : [];
  }
  const ids = Array.from(new Set(
    (Array.isArray(requestedTargetIds) ? requestedTargetIds : [])
      .map((id) => shortText(id, 220))
      .filter(Boolean)
  ));
  return targeting.excludeSource
    ? ids.filter((id) => id !== source)
    : ids;
}

export function classFeatureEffectProjection(
  feature,
  choiceId = "",
  characterBuild = [],
) {
  const raw = classFeatureEffectPlan(feature, choiceId);
  const targeting = classFeatureTargeting(feature, characterBuild);
  const runtimeSupport = classFeatureRuntimeSupport(feature);
  const conditionName = shortText(
    raw.conditionName || feature?.name || "Capacità",
    160,
  );
  const detail = shortText(raw.detail || feature?.name || "", 240);
  const displayLabel = shortText(raw.displayLabel, 160);
  const conditionEffectId = shortText(
    raw.conditionEffectId || raw.condition_effect_id,
    220,
  );
  const projectedIdentity = conditionEffectId ? { conditionEffectId } : {};
  if (!runtimeSupport.ready || raw.kind === "none" || (!feature?.effectPlan && Object.keys(raw).length === 0) || runtimeSupport.adapter === "resource-only") {
    return {
      kind: "none",
      conditionName,
      ...(displayLabel ? { displayLabel } : {}),
      detail,
      ...projectedIdentity,
      radiusMeters: null,
      theme: classFeatureTheme(feature),
      targetEffect: null,
      targetEffects: [],
      secondaryEffects: [],
      membershipTargeting: null,
    };
  }
  const kind = raw.kind === "aura"
    ? "aura"
    : raw.kind === "condition" || targeting.mode !== "aura"
      ? "condition"
      : "aura";
  const radiusMeters = Number(
    raw.radiusMeters
      ?? classFeatureResolvedRadiusMeters(
        { ...feature, effectPlan: raw },
        characterBuild,
      )
      ?? targeting.rangeMeters
  );
  const mechanics = raw.mechanics && typeof raw.mechanics === "object"
    ? { ...raw.mechanics }
    : {};
  const targetRaw = raw.targetEffect && typeof raw.targetEffect === "object"
    ? raw.targetEffect
    : null;
  const targetEffect = targetRaw
    ? {
      conditionName: shortText(targetRaw.conditionName || raw.conditionName || feature?.name || "Capacità", 160),
      ...(targetRaw.displayLabel ? { displayLabel: shortText(targetRaw.displayLabel, 160) } : {}),
      effectKind: targetRaw.effectKind === "debuff" ? "debuff" : "buff",
      detail: shortText(targetRaw.detail || raw.detail || feature?.name || "", 240),
      mechanics: targetRaw.mechanics && typeof targetRaw.mechanics === "object"
        ? { ...targetRaw.mechanics }
        : {},
      theme: classFeatureTheme(targetRaw.theme ? { theme: targetRaw.theme } : feature),
      ...(targetRaw.targeting && typeof targetRaw.targeting === "object"
        ? { targeting: { ...targetRaw.targeting } }
        : {}),
    }
    : null;
  const targetEffects = targetEffect ? [targetEffect] : [];
  const secondaryEffects = (Array.isArray(raw.secondaryEffects)
    ? raw.secondaryEffects
    : Array.isArray(raw.secondary_effects) ? raw.secondary_effects : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => ({
      conditionName: shortText(
        entry.conditionName || entry.label || conditionName,
        160,
      ),
      ...(entry.displayLabel ? { displayLabel: shortText(entry.displayLabel, 160) } : {}),
      effectKind: entry.effectKind === "debuff" ? "debuff" : "buff",
      detail: shortText(entry.detail || detail, 240),
      mechanics: entry.mechanics && typeof entry.mechanics === "object"
        ? { ...entry.mechanics }
        : {},
      theme: classFeatureTheme(entry.theme ? { theme: entry.theme } : feature),
      idSuffix: shortText(entry.idSuffix || entry.id_suffix || `secondary-${index + 1}`, 80),
    }));
  const membershipTargeting = targetEffect?.targeting
    ? { ...targetEffect.targeting }
    : raw.membershipTargeting && typeof raw.membershipTargeting === "object"
      ? { ...raw.membershipTargeting }
      : null;
  const triggerPolicy = raw.triggerPolicy && typeof raw.triggerPolicy === "object"
    ? {
      ...raw.triggerPolicy,
      ...(Array.isArray(raw.triggerPolicy.triggers)
        ? { triggers: raw.triggerPolicy.triggers.map((trigger) => ({ ...trigger })) }
        : {}),
    }
    : null;
  return {
    kind,
    conditionName,
    ...(displayLabel ? { displayLabel } : {}),
    detail,
    ...projectedIdentity,
    radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : null,
    ...(Object.keys(mechanics).length ? { mechanics } : {}),
    theme: classFeatureTheme(feature),
    targetEffect,
    targetEffects,
    secondaryEffects,
    membershipTargeting,
    ...(triggerPolicy ? { triggerPolicy } : {}),
  };
}

export function classFeatureConditionName(feature, choiceId = "") {
  return classFeatureEffectProjection(feature, choiceId).conditionName;
}

export function classFeatureConditionInstance(
  feature,
  activation,
  targetId,
  sourceName = "",
  characterBuild = [],
) {
  const sourceId = shortText(activation?.sourceId, 220);
  const instanceId = shortText(activation?.instanceId, 220);
  const target = shortText(targetId, 220);
  if (!sourceId || !instanceId || !target) return null;
  const targeting = classFeatureTargeting(feature, characterBuild);
  if (targeting.excludeSource && target === sourceId) return null;
  const choiceId = shortText(activation?.choiceId, 120);
  const projection = classFeatureEffectProjection(feature, choiceId, characterBuild);
  if (projection.kind === "none") return null;
  const sourceCardOnly = projection.kind === "aura"
    && feature?.effectPlan?.sourceCardPill?.mapVisible === false;
  const durationTiming = classFeatureDurationTiming(feature);
  const durationParentFeatureId = classFeatureDurationParentFeatureId(feature);
  const nextTurnTiming = durationTiming === "next-turn";
  const nextTurnEndTiming = durationTiming === "next-turn-end";
  const turnEndTiming = durationTiming === "turn-end";
  const remaining = classFeatureRemainingRounds(
    activation,
    activation?.startedRound,
  );
  const resourceDie = classFeatureConditionResourceDie({
    ...feature,
    type: "class-feature",
    condition: projection.conditionName,
    effectId: projection.conditionEffectId || feature?.id,
  }, characterBuild);
  const instance = {
    id: `class-feature:${instanceId}:${target}`,
    condition: projection.conditionName,
    active: true,
    targetId: target,
    sourceId,
    sourceName: shortText(sourceName, 180),
    parentEffectId: instanceId,
    type: "class-feature",
    effectId: shortText(projection.conditionEffectId || feature?.id, 220),
    ...(choiceId ? { choiceId } : {}),
    ...(projection.displayLabel ? { displayLabel: projection.displayLabel } : {}),
    ...(durationParentFeatureId ? { parentFeatureId: durationParentFeatureId } : {}),
    ...(activation?.parentInstanceId ? { parentInstanceId: activation.parentInstanceId } : {}),
    effectDetail: projection.detail,
    ...(resourceDie ? { resourceDie } : {}),
    theme: projection.theme,
    ...(sourceCardOnly ? { mapVisible: false } : {}),
    expiry: nextTurnTiming
      ? {
        mode: "turn-start",
        actor: "source",
        actorId: sourceId,
        remaining: 1,
        anchor: "next-turn",
      }
      : nextTurnEndTiming
        ? {
          mode: "turn-end",
          actor: "source",
          actorId: sourceId,
          remaining: 1,
          anchor: "next-turn",
        }
      : turnEndTiming
        ? {
          mode: "turn-end",
          actor: "source",
          actorId: sourceId,
          remaining: 1,
        }
      : remaining === null
        ? { mode: "manual" }
        : { mode: "rounds", remaining },
    manualRemoval: true,
    appliedAt: {
      round: Math.max(1, Math.floor(Number(activation?.startedRound) || 1)),
      actorId: sourceId,
      ...(activation?.startedTurnKey ? { turnKey: activation.startedTurnKey } : {}),
    },
  };
  if (projection.mechanics && Object.keys(projection.mechanics).length) {
    instance.mechanics = { ...projection.mechanics };
  }
  if (projection.kind === "aura") {
    instance.mechanics = {
      ...(instance.mechanics || {}),
      area: {
        radiusMeters: projection.radiusMeters,
        anchorId: sourceId,
      },
    };
  }
  return instance;
}

function classFeatureSecondaryConditionInstance(
  feature,
  activation,
  targetId,
  sourceName,
  effect,
  index,
  characterBuild = [],
) {
  const primary = classFeatureConditionInstance(
    feature,
    activation,
    targetId,
    sourceName,
    characterBuild,
  );
  if (!primary || !effect?.conditionName) return null;
  return {
    ...primary,
    id: `${primary.id}:secondary:${effect.idSuffix || index + 1}`,
    condition: effect.conditionName,
    effectId: `${String(feature?.id || "capacitÃ ").trim()}:secondary:${effect.idSuffix || index + 1}`,
    effectKind: effect.effectKind === "debuff" ? "debuff" : "buff",
    effectDetail: effect.detail,
    theme: effect.theme,
    ...(effect.mechanics && typeof effect.mechanics === "object"
      ? { mechanics: { ...effect.mechanics } }
      : {}),
  };
}

export function classFeatureConditionInstancesForActivation(
  feature,
  activation,
  sourceName = "",
  characterBuild = [],
) {
  if (!activation?.instanceId) return [];
  const choiceId = shortText(activation?.choiceId, 120);
  const projection = classFeatureEffectProjection(feature, choiceId, characterBuild);
  if (projection.kind === "none") return [];
  if (projection.kind === "aura" && feature?.suppressSourceCardPill === true) return [];
  const sourceId = shortText(activation.sourceId, 220);
  const targeting = classFeatureTargeting(feature, characterBuild);
  const targets = projection.kind === "aura"
    ? [activation.sourceId]
    : (Array.isArray(activation.targetIds) ? activation.targetIds : [])
      .filter((targetId) => !(targeting.excludeSource
        && String(targetId || "").trim() === sourceId));
  const instances = [];
  for (const targetId of targets) {
    const primary = classFeatureConditionInstance(
      feature,
      activation,
      targetId,
      sourceName,
      characterBuild,
    );
    if (primary) instances.push(primary);
    for (const [index, effect] of projection.secondaryEffects.entries()) {
      const secondary = classFeatureSecondaryConditionInstance(
        feature,
        activation,
        targetId,
        sourceName,
        effect,
        index,
        characterBuild,
      );
      if (secondary) instances.push(secondary);
    }
  }
  return instances;
}

export function activeClassFeatureInstances(stateValue, currentRound = null) {
  const state = normalizeClassFeatureState(stateValue);
  const byId = new Map(state.instances.map((instance) => [instance.instanceId, instance]));
  const isActive = (instance, seen = new Set()) => {
    if (!instance || seen.has(instance.instanceId)) return false;
    seen.add(instance.instanceId);
    const remaining = classFeatureRemainingRounds(instance, currentRound);
    if (remaining !== null && remaining <= 0) return false;
    if (!instance.parentInstanceId) return true;
    return isActive(byId.get(instance.parentInstanceId), seen);
  };
  return state.instances.filter((instance) => isActive(instance));
}

function activeParentInstance(state, featureId, currentRound) {
  const wanted = shortText(featureId, 220);
  if (!wanted) return null;
  return normalizeClassFeatureState(state).instances.find((instance) =>
    instance.featureId === wanted
    && classFeatureRemainingRounds(instance, currentRound) !== 0
  ) || null;
}

export function classFeatureResourceCostUsesActiveParent(
  feature,
  cost,
  stateValue,
  currentRound = null,
) {
  const sharedWithFeatureId = shortText(
    cost?.sharedWithFeatureId
      || cost?.shared_with_feature_id,
    220,
  );
  const parentFeatureId = classFeatureDurationParentFeatureId(feature);
  if (!sharedWithFeatureId || !parentFeatureId || sharedWithFeatureId !== parentFeatureId) {
    return false;
  }
  return !!activeParentInstance(
    normalizeClassFeatureState(stateValue),
    sharedWithFeatureId,
    currentRound,
  );
}

export function classFeatureResourceCostAmount(cost, resourceValues = {}) {
  if (cost?.variable !== true) {
    const amount = Number(cost?.amount);
    return Number.isFinite(amount) && amount > 0
      ? Math.floor(amount)
      : 0;
  }
  const raw = resourceValues && typeof resourceValues === "object"
    ? resourceValues[cost.poolId]
      ?? resourceValues.amount
      ?? resourceValues.value
    : resourceValues;
  const amount = Number(raw);
  if (!Number.isInteger(amount)) return null;
  if (cost?.valueInput === "spell-level-0-9" && (amount < 0 || amount > 9)) return null;
  if (amount < 0) return null;
  return cost?.valueInput === "spell-level-0-9"
    ? Math.max(1, amount)
    : amount > 0 ? amount : null;
}

export function classFeatureSpellSlotCreationCost(feature, slotLevel) {
  const operations = Array.isArray(feature?.resourceOperations)
    ? feature.resourceOperations
    : [];
  const operation = operations.find((entry) => entry?.kind === "create-spell-slot");
  const level = Number(slotLevel);
  if (!operation || !Number.isInteger(level) || level < 1 || level > 5) return null;
  const cost = Number(operation.costTable?.[String(level)]);
  return Number.isInteger(cost) && cost > 0 ? cost : null;
}

export function classFeatureTwinnedSpellCost(spellLevel) {
  const level = Number(spellLevel);
  if (!Number.isInteger(level) || level < 0 || level > 9) return null;
  return Math.max(1, level);
}

export function classFeatureSpecialRefresh(pool, characterBuild, event = "riposo_breve") {
  const wantedEvent = String(event || "").trim();
  if (!pool || !wantedEvent) return null;
  const classId = String(
    pool.capacity?.class_id
      || pool.owner?.classId
      || ""
  ).trim();
  const level = classId ? characterClassLevel(characterBuild, classId) : 0;
  const entries = Array.isArray(pool.specialRefresh) ? pool.specialRefresh : [];
  return entries
    .filter((entry) => String(entry?.event || "").trim() === wantedEvent)
    .filter((entry) => level >= Number(entry?.minClassLevel || 1))
    .sort((left, right) => Number(right?.minClassLevel || 0) - Number(left?.minClassLevel || 0))[0]
    || null;
}

export function planClassFeatureSpecialRefresh(
  stateValue,
  pool,
  characterBuild,
  { event = "riposo_breve" } = {},
) {
  const refresh = classFeatureSpecialRefresh(pool, characterBuild, event);
  if (!refresh) {
    return {
      changed: false,
      state: normalizeClassFeatureState(stateValue),
      reason: "special-refresh-unavailable",
    };
  }
  const result = planClassFeatureResourceAdjustment(
    stateValue,
    pool,
    characterBuild,
    { delta: Number(refresh.amount) || 0 },
  );
  return { ...result, refresh };
}

export function planClassFeatureActivation({
  state: stateValue,
  feature,
  poolsById,
  characterBuild,
  sourceId,
  targetIds = [],
  currentRound = 1,
  currentTurnKey = "",
  instanceId,
  choiceId = "",
  resourceValues = {},
  enabledFeatureIds = [],
  createdAt = Date.now(),
} = {}) {
  if (!feature?.id || !instanceId || !sourceId) {
    return { ok: false, reason: "invalid-activation" };
  }
  if (!classFeatureRuntimeSupport(feature).ready) {
    return { ok: false, reason: "feature-not-automated" };
  }
  const state = normalizeClassFeatureState(stateValue);
  const next = {
    ...state,
    resources: { ...state.resources },
    instances: [...state.instances],
  };

  const parentFeatureId = classFeatureDurationParentFeatureId(feature);
  const requiredActiveFeatureId = classFeatureRequiredActiveFeatureId(feature);
  const parentInstance = parentFeatureId
    ? activeParentInstance(state, parentFeatureId, currentRound)
    : null;
  const requiredActiveInstance = requiredActiveFeatureId
    ? activeParentInstance(state, requiredActiveFeatureId, currentRound)
    : null;
  if (parentFeatureId && !parentInstance) {
    return {
      ok: false,
      reason: "parent-feature-required",
      parentFeatureId,
    };
  }
  if (requiredActiveFeatureId && !requiredActiveInstance) {
    return {
      ok: false,
      reason: "parent-feature-required",
      parentFeatureId: requiredActiveFeatureId,
    };
  }

  const choices = classFeatureChoiceOptions(feature);
  const enabledChoiceId = (Array.isArray(enabledFeatureIds) ? enabledFeatureIds : [])
    .map((id) => {
      const match = choices.find((c) => id === `${feature.id}-${c.id}` || id.endsWith(`-${c.id}`));
      return match ? match.id : "";
    })
    .find(Boolean) || "";
  const canonicalConfigChoiceId = parentInstance?.choiceId
    || requiredActiveInstance?.choiceId
    || enabledChoiceId
    || "";
  const selectedChoiceId = canonicalConfigChoiceId || shortText(choiceId, 120);
  if (choices.length && !selectedChoiceId) {
    return { ok: false, reason: "choice-required" };
  }
  if (choices.length && !choices.some((option) => option.id === selectedChoiceId)) {
    return { ok: false, reason: "invalid-choice" };
  }

  const round = optionalInteger(currentRound, 1, 99999) ?? 1;
  if (feature.trackingMode !== "instant") {
    const targeting = classFeatureTargeting(feature, characterBuild);
    const requestedTargetIds = new Set(
      (Array.isArray(targetIds) ? targetIds : [])
        .map((id) => shortText(id, 220))
        .filter(Boolean),
    );
    const duplicate = activeClassFeatureInstances(state, round)
      .filter((entry) => entry.featureId === feature.id)
      .some((entry) => targeting.mode === "self" || targeting.mode === "aura"
        ? true
        : (Array.isArray(entry.targetIds) ? entry.targetIds : [])
          .some((id) => requestedTargetIds.has(id)));
    if (duplicate) {
      return { ok: false, reason: "feature-already-active" };
    }
  }

  for (const cost of Array.isArray(feature.resourceCosts) ? feature.resourceCosts : []) {
    if (classFeatureResourceCostUsesActiveParent(feature, cost, state, currentRound)) {
      continue;
    }
    const pool = poolsById.get(cost.poolId);
    if (!pool) return { ok: false, reason: "resource-pool-missing", poolId: cost.poolId };
    const amount = classFeatureResourceCostAmount(cost, resourceValues);
    if (amount === null) {
      return { ok: false, reason: "resource-value-required", poolId: cost.poolId };
    }
    const entry = resourceEntryForCost(state, pool, characterBuild);
    if (!entry.unlimited && entry.current !== null && entry.current < amount) {
      return { ok: false, reason: "resource-empty", poolId: cost.poolId };
    }
    next.resources[cost.poolId] = entry.unlimited
      ? entry
      : entry.current === null
        ? entry
        : { ...entry, current: entry.current - amount };
  }

  const durationTiming = classFeatureDurationTiming(feature);
  const indefiniteFeatureId = classFeatureDurationIndefiniteFeatureId(feature);
  const enabledFeatureIdSet = new Set(
    (Array.isArray(enabledFeatureIds) ? enabledFeatureIds : [])
      .map((id) => shortText(id, 220))
      .filter(Boolean)
  );
  const indefiniteDuration = !!indefiniteFeatureId
    && enabledFeatureIdSet.has(indefiniteFeatureId);
  const durationRounds = indefiniteDuration
    ? null
    : parentInstance
    ? classFeatureRemainingRounds(parentInstance, round)
    : durationTiming === "next-turn"
      || durationTiming === "next-turn-end"
      || durationTiming === "turn-end"
      ? null
      : optionalInteger(feature?.duration?.rounds, 1, 99999);
  const instance = {
    instanceId: shortText(instanceId, 220),
    featureId: feature.id,
    sourceId: shortText(sourceId, 220),
    ...(selectedChoiceId ? { choiceId: selectedChoiceId } : {}),
    targetIds: Array.from(new Set(
      (Array.isArray(targetIds) ? targetIds : [])
        .map((id) => shortText(id, 220))
        .filter(Boolean)
    )),
    suppressedTargetIds: [],
    ...(parentFeatureId ? { parentFeatureId } : {}),
    ...(parentInstance ? { parentInstanceId: parentInstance.instanceId } : {}),
    startedRound: round,
    startedTurnKey: shortText(currentTurnKey, 220),
    expiresRound: durationRounds === null ? null : round + durationRounds - 1,
    createdAt: Math.max(0, Number(createdAt) || Date.now()),
  };
  if (feature.trackingMode !== "instant") {
    next.instances.push(instance);
    next.instances = next.instances
      .filter((entry) => {
        const remaining = classFeatureRemainingRounds(entry, round);
        return remaining === null || remaining > 0;
      })
      .slice(-MAX_CLASS_FEATURE_INSTANCES);
  }
  return {
    ok: true,
    state: next,
    instance,
  };
}

export function planClassFeatureDeactivation(stateValue, instanceId) {
  const state = normalizeClassFeatureState(stateValue);
  const wanted = shortText(instanceId, 220);
  const removed = new Set(wanted ? [wanted] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of state.instances) {
      if (entry.parentInstanceId && removed.has(entry.parentInstanceId) && !removed.has(entry.instanceId)) {
        removed.add(entry.instanceId);
        changed = true;
      }
    }
  }
  const instances = state.instances.filter((entry) => !removed.has(entry.instanceId));
  return {
    changed: instances.length !== state.instances.length,
    removedInstanceIds: Array.from(removed),
    state: { ...state, instances },
  };
}

export function planClassFeatureResourceAdjustment(
  stateValue,
  pool,
  characterBuild,
  { delta = 0, current = null, maximum = null, reset = false } = {},
) {
  const state = normalizeClassFeatureState(stateValue);
  if (!pool?.id) return { changed: false, state };
  const resolved = resourceEntryForCost(state, pool, characterBuild);
  const nextMaximum = maximum === null
    ? resolved.maximum
    : optionalInteger(maximum, 0, 9999);
  const nextCurrent = resolved.unlimited
    ? null
    : reset
      ? nextMaximum
      : current === null
        ? Math.max(0, Math.min(
          nextMaximum ?? 9999,
          (resolved.current ?? nextMaximum ?? 0) + Math.round(Number(delta) || 0)
        ))
        : Math.max(0, Math.min(
          nextMaximum ?? 9999,
          optionalInteger(current, 0, 9999) ?? 0
        ));
  const entry = {
    current: nextCurrent,
    maximum: nextMaximum,
    unlimited: resolved.unlimited,
  };
  return {
    changed: JSON.stringify(state.resources[pool.id] || null) !== JSON.stringify(entry),
    state: {
      ...state,
      resources: { ...state.resources, [pool.id]: entry },
    },
  };
}

export function planClassFeatureResourceReset(
  stateValue,
  poolsById,
  characterBuild,
  poolIds = [],
) {
  let state = normalizeClassFeatureState(stateValue);
  let changed = false;
  const resetPoolIds = [];
  const ids = Array.from(new Set(
    (Array.isArray(poolIds) ? poolIds : [])
      .map((id) => shortText(id, 220))
      .filter(Boolean)
  ));
  for (const poolId of ids) {
    const pool = poolsById?.get(poolId);
    if (!pool) continue;
    const result = planClassFeatureResourceAdjustment(
      state,
      pool,
      characterBuild,
      { reset: true },
    );
    if (result.changed) changed = true;
    state = result.state;
    resetPoolIds.push(poolId);
  }
  return { changed, state, poolIds: resetPoolIds };
}

export function classFeatureStatusName(feature) {
  const id = String(feature?.id || "");
  if (id === "barbaro-ira") return "Ira";
  if (id.endsWith("giuramento-di-inimicizia")) return "Giuramento di Inimicizia";
  if (id.endsWith("santuario-del-crepuscolo")) return "Santuario del Crepuscolo";
  return String(
    classFeatureEffectProjection(feature).conditionName
      || feature?.name
      || "Capacità"
  ).trim();
}

export function classFeatureTemporaryHpApplications(feature, activation = {}) {
  const plan = classFeatureEffectPlan(feature, activation?.choiceId);
  const temporaryHp = plan?.temporaryHp && typeof plan.temporaryHp === "object"
    ? plan.temporaryHp
    : null;
  const amount = Math.max(0, Math.floor(Number(temporaryHp?.amount) || 0));
  if (!amount) return [];
  const sourceId = shortText(activation?.sourceId, 220);
  const targetIds = Array.from(new Set(
    (Array.isArray(activation?.targetIds) ? activation.targetIds : [])
      .map((id) => shortText(id, 220))
      .filter(Boolean)
  ));
  const applyTo = String(temporaryHp?.applyTo || "").trim().toLowerCase();
  if (applyTo === "source-per-target-count") {
    return sourceId && targetIds.length
      ? [{ targetId: sourceId, amount: amount * targetIds.length }]
      : [];
  }
  if (applyTo === "targets") {
    return targetIds.map((targetId) => ({ targetId, amount }));
  }
  if (applyTo === "source") {
    return sourceId ? [{ targetId: sourceId, amount }] : [];
  }
  return [];
}

export function appendClassFeatureConditionInstances(
  conditions,
  stateValue,
  featureById,
  currentRound = null,
  characterBuild = [],
  characterBuildBySourceId = null,
) {
  const base = conditions && typeof conditions === "object" ? conditions : {};
  const instances = (Array.isArray(base.instances) ? base.instances : []).map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const sourceBuild = characterBuildBySourceId?.get?.(String(entry.sourceId || "").trim())
      || characterBuild;
    const resourceDie = classFeatureConditionResourceDie(entry, sourceBuild);
    return resourceDie && !entry.resourceDie
      ? { ...entry, resourceDie }
      : entry;
  });
  const persistedParents = new Set(instances
    .map((entry) => String(entry?.parentEffectId || "").trim())
    .filter(Boolean));
  for (const active of activeClassFeatureInstances(stateValue, currentRound)) {
    if (persistedParents.has(active.instanceId)) continue;
    const feature = featureById.get(active.featureId);
    if (!feature) continue;
    const sourceBuild = characterBuildBySourceId?.get?.(String(active.sourceId || "").trim())
      || characterBuild;
    const projection = classFeatureEffectProjection(feature, active.choiceId, sourceBuild);
    if (projection.kind === "none") continue;
    const targeting = classFeatureTargeting(feature, sourceBuild);
    const sourceId = String(active.sourceId || "").trim();
    const sourceIsTargeted = targeting.mode === "self"
      || projection.kind === "aura"
      || (Array.isArray(active.targetIds) && active.targetIds.includes(sourceId));
    if (!sourceIsTargeted) continue;
    const generated = classFeatureConditionInstancesForActivation(
      feature,
      active,
      "",
      sourceBuild,
    ).filter((instance) => String(instance?.targetId || "") === sourceId);
    if (generated.length) instances.push(...generated);
  }
  return { ...base, instances };
}
