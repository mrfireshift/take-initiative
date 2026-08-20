import { ID } from "./constants.js";
import {
  CLASS_FEATURE_STATE_FIELD,
  activeClassFeatureInstances,
  classFeatureEffectProjection,
  normalizeClassFeatureState,
} from "./classFeatureCore.js";
import {
  areaMembershipPlan,
  areaMembershipTargetIds,
} from "./spellAreaMembershipCore.js";
import { hasEffectiveCondition } from "./conditionRulesCore.js";

export const CLASS_FEATURE_AURA_META_KEY = `${ID}/classFeatureAura`;
export const CLASS_FEATURE_AREA_EFFECT_TYPE = "class-feature-area";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

function normalizedConditionName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

export function classFeatureAuraEndsOnSourceCondition(
  aura = null,
  conditionInstances = [],
) {
  const endConditions = Array.isArray(aura?.feature?.duration?.endConditions)
    ? aura.feature.duration.endConditions
    : [];
  return endConditions
    .map(normalizedConditionName)
    .filter(Boolean)
    .some((conditionName) => hasEffectiveCondition(conditionInstances, conditionName));
}

function auraRule(aura) {
  const targetEffects = Array.isArray(aura?.targetEffects) && aura.targetEffects.length
    ? aura.targetEffects
    : aura?.targetEffect ? [aura.targetEffect] : [];
  const membershipTargeting = aura?.membershipTargeting
    && typeof aura.membershipTargeting === "object"
    ? aura.membershipTargeting
    : {};
  return {
    zonePolicy: {
      membershipTargeting: {
        // L’area applica la stessa etichetta al caster e agli alleati;
        // la sorgente non crea una pill separata sulla Card.
        includeCaster: membershipTargeting.includeCaster === true,
        filter: membershipTargeting.filter || "friendly",
      },
    },
    effectPolicy: {
      mode: "while-inside",
      effects: targetEffects,
    },
  };
}

export function classFeatureAuraEffectId(aura) {
  return `${String(aura?.featureId || "").trim()}:area`;
}

export function collectActiveClassFeatureAuras(
  items = [],
  {
    metaKey = "",
    featureById = new Map(),
    currentRound = null,
    characterBuildBySourceId = new Map(),
  } = {},
) {
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const state = normalizeClassFeatureState(item?.metadata?.[metaKey]?.[CLASS_FEATURE_STATE_FIELD]);
    for (const activation of activeClassFeatureInstances(state, currentRound)) {
      const feature = featureById.get(activation.featureId);
      const characterBuild = characterBuildBySourceId instanceof Map
        ? characterBuildBySourceId.get(activation.sourceId || item.id)
        : characterBuildBySourceId?.[activation.sourceId || item.id];
      const effectiveChoiceId = activation.choiceId
        || (activation.parentInstanceId
          ? state.instances.find((i) => i.instanceId === activation.parentInstanceId)?.choiceId
          : "")
        || "";
      const projection = classFeatureEffectProjection(
        feature,
        effectiveChoiceId,
        characterBuild || [],
      );
      if (projection.kind !== "aura") continue;
      result.push({
        instanceId: activation.instanceId,
        featureId: activation.featureId,
        sourceId: activation.sourceId || item.id,
        sourceName: String(item.name || "").trim(),
        feature,
        activation,
        radiusMeters: projection.radiusMeters,
        conditionName: projection.conditionName,
        theme: projection.theme,
        targetEffect: projection.targetEffect
          ? {
            id: classFeatureAuraEffectId({ featureId: activation.featureId }),
            label: projection.targetEffect.conditionName,
            kind: projection.targetEffect.effectKind,
            detail: projection.targetEffect.detail,
            mechanics: projection.targetEffect.mechanics,
            theme: projection.targetEffect.theme,
          }
          : null,
        targetEffects: projection.targetEffects.map((effect, index) => ({
          id: index === 0
            ? classFeatureAuraEffectId({ featureId: activation.featureId })
            : `${classFeatureAuraEffectId({ featureId: activation.featureId })}:${effect.idSuffix || `secondary-${index}`}`,
          label: effect.conditionName,
          kind: effect.effectKind,
          detail: effect.detail,
          mechanics: effect.mechanics,
          theme: effect.theme,
        })),
        membershipTargeting: projection.membershipTargeting,
        membershipMode: projection.membershipTargeting?.membership || "",
        ...(projection.triggerPolicy
          ? { triggerPolicy: projection.triggerPolicy }
          : {}),
      });
    }
  }
  return result;
}

export function classFeatureAuraTargetIds({
  aura = null,
  area = null,
  candidates = [],
  metaKey = "",
} = {}) {
  const hasTargetEffects = !!(aura?.targetEffects?.length || aura?.targetEffect);
  const hasTriggers = !!aura?.triggerPolicy?.triggers?.length;
  if (!aura || !area || (!hasTargetEffects && !hasTriggers)) return [];
  const ids = areaMembershipTargetIds({
    sourceId: aura.sourceId,
    rule: auraRule(aura),
    area,
    candidates,
    metaKey,
  });
  if (aura.membershipMode !== "selected") return ids;
  const selected = new Set(uniqueIds(aura.activation?.targetIds || []));
  return ids.filter((id) => selected.has(id));
}

export function classFeatureAuraMembershipPlan({
  aura = null,
  desiredTargetIds = [],
  items = [],
  metaKey = "",
} = {}) {
  if (!aura || !aura.targetEffects?.length && !aura.targetEffect) {
    return { entering: [], leaving: [], operations: [] };
  }
  return areaMembershipPlan({
    instanceId: aura.instanceId,
    sourceId: aura.sourceId,
    rule: auraRule(aura),
    desiredTargetIds: uniqueIds(desiredTargetIds),
    items,
    metaKey,
    sourceName: aura.sourceName,
    defaultExpiry: { mode: "manual" },
    effectType: CLASS_FEATURE_AREA_EFFECT_TYPE,
    manualRemoval: true,
  });
}

export function staleClassFeatureAuraEffectRemovals(
  items = [],
  {
    activeInstanceIds = [],
    suppressSourceCardPillInstanceIds = [],
    suppressCardPillInstanceIds = [],
    metaKey = "",
  } = {},
) {
  const active = new Set(uniqueIds(activeInstanceIds));
  const suppressSourceCardPills = new Set(uniqueIds([
    ...suppressSourceCardPillInstanceIds,
    ...suppressCardPillInstanceIds,
  ]));
  const removals = [];
  for (const item of Array.isArray(items) ? items : []) {
    const conditions = item?.metadata?.[metaKey]?.conditions;
    const instances = Array.isArray(conditions)
      ? conditions
      : Array.isArray(conditions?.instances) ? conditions.instances : [];
    for (const instance of instances) {
      const type = String(instance?.type || "");
      const parentEffectId = String(instance?.parentEffectId || "");
      const staleArea = type === CLASS_FEATURE_AREA_EFFECT_TYPE
        && !active.has(parentEffectId);
      const staleSuppressedSourceCardPill = suppressSourceCardPills.has(parentEffectId)
        && type === "class-feature"
        && String(instance.targetId || "") === String(instance.sourceId || "");
      if (!staleArea && !staleSuppressedSourceCardPill) continue;
      if (item?.id && instance?.id) {
        removals.push({
          itemId: item.id,
          instanceId: instance.id,
          ...(staleSuppressedSourceCardPill ? { skipClassFeatureReconcile: true } : {}),
        });
      }
    }
  }
  return removals;
}
