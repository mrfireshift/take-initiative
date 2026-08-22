import { CLASS_FEATURE_AURA_META_KEY } from "./classFeatureAuraCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { zoneTriggerNoticesFromActivation } from "./zoneTriggerNoticeCore.js";

export function planClassFeatureAuraReminder({
  aura = null,
  auraItem = null,
  desiredTargetIds = [],
  initiativeState = null,
  itemsById = new Map(),
  areaPosition = null,
  now = Date.now(),
} = {}) {
  const auraMetadata = auraItem?.metadata?.[CLASS_FEATURE_AURA_META_KEY] || {};
  const previousRuntime = normalizeSpellZoneTriggerRuntime(
    auraMetadata.triggerRuntime,
  );
  const triggerPlan = planSpellZoneTriggers({
    rule: {
      triggerPolicy: aura?.triggerPolicy,
    },
    zoneMetadata: {
      instanceId: aura?.instanceId,
      ruleId: aura?.featureId,
      spellId: aura?.featureId,
      casterId: aura?.sourceId,
    },
    runtime: previousRuntime,
    currentTargetIds: desiredTargetIds,
    initiativeState,
    areaPosition,
    now,
  });
  const activations = triggerPlan.newActivations.map((activation) => ({
    ...activation,
    ...(auraItem?.id ? { zoneItemId: auraItem.id } : {}),
    spellName: aura?.conditionName || aura?.featureId,
  }));
  const noticeItemsById = itemsById instanceof Map
    ? new Map(itemsById)
    : new Map(Object.entries(itemsById || {}));
  if (auraItem?.id) noticeItemsById.set(auraItem.id, auraItem);
  const notices = activations.flatMap((activation) => zoneTriggerNoticesFromActivation(
      activation,
      noticeItemsById,
    ));

  return {
    changed: JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime),
    baseRuntime: previousRuntime,
    runtime: triggerPlan.runtime,
    newActivations: activations,
    notices,
  };
}

export function mergeClassFeatureAuraReminderMetadata(
  currentAuraMetadata = {},
  update = null,
) {
  if (!update) return { ...(currentAuraMetadata || {}) };
  return {
    ...(currentAuraMetadata || {}),
    triggerRuntime: mergePlannedSpellZoneTriggerRuntime(
      currentAuraMetadata?.triggerRuntime,
      update.runtime,
      update.newActivations,
      update.baseRuntime,
    ),
  };
}
