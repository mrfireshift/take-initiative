import {
  CUSTOM_AURA_META_KEY,
  CUSTOM_AURA_EFFECT_TYPE,
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
  preservePendingActivationIds = [],
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
      metadataKey: CUSTOM_AURA_META_KEY,
      effectType: CUSTOM_AURA_EFFECT_TYPE,
    },
    runtime: previousRuntime,
    currentTargetIds: desiredTargetIds,
    initiativeState,
    areaPosition,
    preservePendingActivationIds,
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

export function rearmedCustomAuraNotices({
  auraItem = null,
  pendingActivations = [],
  rearmRequests = [],
  itemsById = new Map(),
} = {}) {
  const requestsBySource = new Map();
  for (const value of Array.isArray(rearmRequests) ? rearmRequests : []) {
    const activationId = String(value?.activationId || value || "").trim();
    const sourceActivationId = String(
      value?.sourceActivationId || activationId,
    ).trim();
    if (!activationId || !sourceActivationId) continue;
    const requested = requestsBySource.get(sourceActivationId) || new Set();
    requested.add(activationId);
    requestsBySource.set(sourceActivationId, requested);
  }
  if (!requestsBySource.size) return [];
  const noticeItemsById = itemsById instanceof Map
    ? new Map(itemsById)
    : new Map(Object.entries(itemsById || {}));
  if (auraItem?.id) noticeItemsById.set(auraItem.id, auraItem);
  const noticesById = new Map();
  for (const activation of Array.isArray(pendingActivations) ? pendingActivations : []) {
    const sourceActivationId = String(activation?.id || "").trim();
    const requested = requestsBySource.get(sourceActivationId);
    if (!requested?.size) continue;
    const notices = zoneTriggerNoticesFromActivation({
      ...activation,
      zoneItemId: auraItem?.id,
    }, noticeItemsById);
    for (const notice of notices) {
      if (!requested.has(sourceActivationId) && !requested.has(notice.activationId)) continue;
      noticesById.set(notice.activationId, notice);
    }
  }
  return [...noticesById.values()];
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
