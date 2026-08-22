import {
  CUSTOM_AURA_META_KEY,
  customAuraRule,
} from "./customAuraCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { zoneTriggerNoticesFromActivation } from "./zoneTriggerNoticeCore.js";

export function planCustomAuraReminder({
  aura = null,
  auraItem = null,
  desiredTargetIds = [],
  initiativeState = null,
  itemsById = new Map(),
  areaPosition = null,
  now = Date.now(),
} = {}) {
  const auraMetadata = auraItem?.metadata?.[CUSTOM_AURA_META_KEY] || {};
  const previousRuntime = normalizeSpellZoneTriggerRuntime(
    auraMetadata.triggerRuntime,
  );
  const triggerPlan = planSpellZoneTriggers({
    rule: customAuraRule(aura),
    zoneMetadata: {
      instanceId: aura?.instanceId,
      ruleId: aura?.id,
      spellId: aura?.id,
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
    spellName: aura?.name || "Aura personalizzata",
    eyebrow: "Aura personalizzata",
    instruction: activation.label,
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

export function mergeCustomAuraReminderMetadata(
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
