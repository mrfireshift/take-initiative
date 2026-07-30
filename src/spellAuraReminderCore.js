import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { zoneTriggerNoticeFromActivation } from "./zoneTriggerNoticeCore.js";

export function planMobileAuraReminder({
  aura = null,
  auraItem = null,
  desiredTargetIds = [],
  initiativeState = null,
  itemsById = new Map(),
  areaPosition = null,
  now = Date.now(),
} = {}) {
  const auraMetadata = auraItem?.metadata?.[SPELL_AURA_META_KEY] || {};
  const previousRuntime = normalizeSpellZoneTriggerRuntime(
    auraMetadata.triggerRuntime,
  );
  const triggerPlan = planSpellZoneTriggers({
    rule: aura?.rule,
    zoneMetadata: {
      instanceId: aura?.instanceId,
      ruleId: aura?.rule?.id,
      spellId: aura?.spellId,
      casterId: aura?.casterId,
    },
    runtime: previousRuntime,
    currentTargetIds: desiredTargetIds,
    initiativeState,
    areaPosition,
    now,
  });
  const activations = triggerPlan.newActivations.map((activation) => ({
    ...activation,
    zoneItemId: auraItem?.id,
    spellName: aura?.spellName || aura?.spellId,
  }));
  const noticeItemsById = new Map(itemsById);
  if (auraItem?.id) noticeItemsById.set(auraItem.id, auraItem);
  const notices = activations
    .map((activation) =>
      zoneTriggerNoticeFromActivation(activation, noticeItemsById)
    )
    .filter(Boolean);

  return {
    changed: JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime),
    baseRuntime: previousRuntime,
    runtime: triggerPlan.runtime,
    newActivations: activations,
    notices,
  };
}

export function mergeMobileAuraReminderMetadata(
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
