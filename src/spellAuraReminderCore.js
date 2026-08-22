import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { zoneTriggerNoticesFromActivation } from "./zoneTriggerNoticeCore.js";

export function planMobileAuraReminder({
  aura = null,
  auraItem = null,
  desiredTargetIds = [],
  initiativeState = null,
  itemsById = new Map(),
  areaPosition = null,
  preservePendingActivationIds = [],
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
    preservePendingActivationIds,
    now,
  });
  const activations = triggerPlan.newActivations.map((activation) => ({
    ...activation,
    zoneItemId: auraItem?.id,
    spellName: aura?.spellName || aura?.spellId,
  }));
  const noticeItemsById = new Map(itemsById);
  if (auraItem?.id) noticeItemsById.set(auraItem.id, auraItem);
  const notices = activations.flatMap((activation) =>
    zoneTriggerNoticesFromActivation(activation, noticeItemsById)
  );

  return {
    changed: JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime),
    baseRuntime: previousRuntime,
    runtime: triggerPlan.runtime,
    newActivations: activations,
    notices,
  };
}

export function rearmedMobileAuraNotices({
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
  const noticeItemsById = new Map(itemsById);
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
