import { gridPlanarDistance } from "./distance3dCore.js";

export const CLASS_FEATURE_STATE_FIELD = "classFeatureState";
export const CLASS_FEATURE_STATE_VERSION = 1;
export const MAX_CHARACTER_CLASSES = 4;
export const MAX_ENABLED_CLASS_FEATURES = 256;
export const MAX_CLASS_FEATURE_INSTANCES = 256;

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
      : null;
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "illimitato" || normalized === "illimitate" || normalized === "unlimited") {
    return { maximum: null, unlimited: true };
  }
  return {
    maximum: finiteResourceValue(raw),
    unlimited: false,
  };
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
  const maximum = resolved.maximum ?? stored?.maximum ?? null;
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
      .flatMap((feature) => Array.isArray(feature?.resourceCosts)
        ? feature.resourceCosts.map((cost) => cost.poolId)
        : [])
      .filter(Boolean)
  ));
  return poolIds.map((poolId) => {
    const pool = poolsById.get(poolId);
    if (!pool) return null;
    return {
      pool,
      ...resourceEntryForCost(state, pool, characterBuild),
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

export function classFeatureTargeting(feature) {
  const raw = feature?.targeting && typeof feature.targeting === "object"
    ? feature.targeting
    : {};
  const fallbackMode = feature?.targetMode === "selection" ? "single-target" : "self";
  const mode = ["self", "single-target", "aura"].includes(raw.mode)
    ? raw.mode
    : fallbackMode;
  const rangeMeters = Number(raw.rangeMeters);
  const maxTargets = raw.maxTargets === null
    ? null
    : Math.max(1, Math.floor(Number(raw.maxTargets) || (mode === "self" || mode === "single-target" ? 1 : 1)));
  return {
    mode,
    rangeMeters: Number.isFinite(rangeMeters) && rangeMeters > 0 ? rangeMeters : null,
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
) {
  const targeting = classFeatureTargeting(feature);
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

export function classFeatureEffectProjection(feature, choiceId = "") {
  const raw = classFeatureEffectPlan(feature, choiceId);
  const targeting = classFeatureTargeting(feature);
  const runtimeSupport = classFeatureRuntimeSupport(feature);
  const conditionName = shortText(
    raw.conditionName || feature?.name || "Capacità",
    160,
  );
  const detail = shortText(raw.detail || feature?.name || "", 240);
  if (!runtimeSupport.ready) {
    return {
      kind: "none",
      conditionName,
      detail,
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
  const radiusMeters = Number(raw.radiusMeters ?? targeting.rangeMeters);
  const targetRaw = raw.targetEffect && typeof raw.targetEffect === "object"
    ? raw.targetEffect
    : null;
  const targetEffect = targetRaw
    ? {
      conditionName: shortText(targetRaw.conditionName || raw.conditionName || feature?.name || "Capacità", 160),
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
  return {
    kind,
    conditionName,
    detail,
    radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : null,
    theme: classFeatureTheme(feature),
    targetEffect,
    targetEffects,
    secondaryEffects,
    membershipTargeting,
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
) {
  const sourceId = shortText(activation?.sourceId, 220);
  const instanceId = shortText(activation?.instanceId, 220);
  const target = shortText(targetId, 220);
  if (!sourceId || !instanceId || !target) return null;
  const targeting = classFeatureTargeting(feature);
  if (targeting.excludeSource && target === sourceId) return null;
  const choiceId = shortText(activation?.choiceId, 120);
  const projection = classFeatureEffectProjection(feature, choiceId);
  if (projection.kind === "none") return null;
  const durationTiming = classFeatureDurationTiming(feature);
  const durationParentFeatureId = classFeatureDurationParentFeatureId(feature);
  const nextTurnTiming = durationTiming === "next-turn";
  const nextTurnEndTiming = durationTiming === "next-turn-end";
  const remaining = classFeatureRemainingRounds(
    activation,
    activation?.startedRound,
  );
  const instance = {
    id: `class-feature:${instanceId}:${target}`,
    condition: projection.conditionName,
    active: true,
    targetId: target,
    sourceId,
    sourceName: shortText(sourceName, 180),
    parentEffectId: instanceId,
    type: "class-feature",
    effectId: shortText(feature?.id, 220),
    ...(choiceId ? { choiceId } : {}),
    ...(durationParentFeatureId ? { parentFeatureId: durationParentFeatureId } : {}),
    ...(activation?.parentInstanceId ? { parentInstanceId: activation.parentInstanceId } : {}),
    effectDetail: projection.detail,
    theme: projection.theme,
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
  if (projection.kind === "aura") {
    instance.mechanics = {
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
) {
  const primary = classFeatureConditionInstance(feature, activation, targetId, sourceName);
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
) {
  if (!activation?.instanceId) return [];
  const choiceId = shortText(activation?.choiceId, 120);
  const projection = classFeatureEffectProjection(feature, choiceId);
  if (projection.kind === "none") return [];
  const sourceId = shortText(activation.sourceId, 220);
  const targeting = classFeatureTargeting(feature);
  const targets = projection.kind === "aura"
    ? [activation.sourceId]
    : (Array.isArray(activation.targetIds) ? activation.targetIds : [])
      .filter((targetId) => !(targeting.excludeSource
        && String(targetId || "").trim() === sourceId));
  const instances = [];
  for (const targetId of targets) {
    const primary = classFeatureConditionInstance(feature, activation, targetId, sourceName);
    if (primary) instances.push(primary);
    for (const [index, effect] of projection.secondaryEffects.entries()) {
      const secondary = classFeatureSecondaryConditionInstance(
        feature,
        activation,
        targetId,
        sourceName,
        effect,
        index,
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
  createdAt = Date.now(),
} = {}) {
  if (!feature?.id || !instanceId || !sourceId) {
    return { ok: false, reason: "invalid-activation" };
  }
  if (!classFeatureRuntimeSupport(feature).ready) {
    return { ok: false, reason: "feature-not-automated" };
  }
  const choices = classFeatureChoiceOptions(feature);
  const selectedChoiceId = shortText(choiceId, 120);
  if (choices.length && !selectedChoiceId) {
    return { ok: false, reason: "choice-required" };
  }
  if (choices.length && !choices.some((option) => option.id === selectedChoiceId)) {
    return { ok: false, reason: "invalid-choice" };
  }
  const state = normalizeClassFeatureState(stateValue);
  const next = {
    ...state,
    resources: { ...state.resources },
    instances: [...state.instances],
  };

  const parentFeatureId = classFeatureDurationParentFeatureId(feature);
  const parentInstance = parentFeatureId
    ? activeParentInstance(state, parentFeatureId, currentRound)
    : null;
  if (parentFeatureId && !parentInstance) {
    return {
      ok: false,
      reason: "parent-feature-required",
      parentFeatureId,
    };
  }

  for (const cost of Array.isArray(feature.resourceCosts) ? feature.resourceCosts : []) {
    if (classFeatureResourceCostUsesActiveParent(feature, cost, state, currentRound)) {
      continue;
    }
    const pool = poolsById.get(cost.poolId);
    if (!pool) return { ok: false, reason: "resource-pool-missing", poolId: cost.poolId };
    const entry = resourceEntryForCost(state, pool, characterBuild);
    if (!entry.unlimited && entry.current !== null && entry.current < cost.amount) {
      return { ok: false, reason: "resource-empty", poolId: cost.poolId };
    }
    next.resources[cost.poolId] = entry.unlimited
      ? entry
      : entry.current === null
        ? entry
        : { ...entry, current: entry.current - cost.amount };
  }

  const round = optionalInteger(currentRound, 1, 99999) ?? 1;
  const durationTiming = classFeatureDurationTiming(feature);
  const durationRounds = parentInstance
    ? classFeatureRemainingRounds(parentInstance, round)
    : durationTiming === "next-turn" || durationTiming === "next-turn-end"
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
    instance: feature.trackingMode === "instant" ? null : instance,
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
) {
  const base = conditions && typeof conditions === "object" ? conditions : {};
  const instances = Array.isArray(base.instances) ? [...base.instances] : [];
  const persistedParents = new Set(instances
    .map((entry) => String(entry?.parentEffectId || "").trim())
    .filter(Boolean));
  for (const active of activeClassFeatureInstances(stateValue, currentRound)) {
    if (persistedParents.has(active.instanceId)) continue;
    const feature = featureById.get(active.featureId);
    if (!feature) continue;
    const projection = classFeatureEffectProjection(feature, active.choiceId);
    if (projection.kind === "none") continue;
    const targeting = classFeatureTargeting(feature);
    const sourceId = String(active.sourceId || "").trim();
    const sourceIsTargeted = targeting.mode === "self"
      || projection.kind === "aura"
      || (Array.isArray(active.targetIds) && active.targetIds.includes(sourceId));
    if (!sourceIsTargeted) continue;
    const generated = classFeatureConditionInstancesForActivation(
      feature,
      active,
      "",
    ).filter((instance) => String(instance?.targetId || "") === sourceId);
    if (generated.length) instances.push(...generated);
  }
  return { ...base, instances };
}
