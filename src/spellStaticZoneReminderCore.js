import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { zoneTriggerNoticeFromActivation } from "./zoneTriggerNoticeCore.js";

export function planStaticSpellZoneReminder({
  zoneItem = null,
  rule = null,
  desiredTargetIds = [],
  directTargetIds = [],
  currentTargetPositions = {},
  initiativeState = null,
  suppressedTargetIdsByTrigger = {},
  itemsById = new Map(),
  now = Date.now(),
} = {}) {
  const zoneMetadata = zoneItem?.metadata?.[SPELL_STATIC_ZONE_META_KEY] || {};
  const previousRuntime = normalizeSpellZoneTriggerRuntime(
    zoneMetadata.triggerRuntime
  );
  const hasCastMembershipBaseline = Object.prototype.hasOwnProperty.call(
    zoneMetadata,
    "targetIds",
  );
  const planningRuntime = previousRuntime.initialized || !hasCastMembershipBaseline
    ? previousRuntime
    : {
      ...previousRuntime,
      // La membership registrata al cast è la baseline reale della zona.
      // Se una creatura entra prima del primo reconcile, deve risultare
      // "entering" invece di essere assorbita dal bootstrap.
      initialized: true,
      memberIds: Array.isArray(zoneMetadata.targetIds)
        ? [...zoneMetadata.targetIds]
        : [],
      areaPosition: zoneItem?.position && typeof zoneItem.position === "object"
        ? { ...zoneItem.position }
        : null,
    };
  const triggerPlan = planSpellZoneTriggers({
    rule,
    zoneMetadata,
    runtime: planningRuntime,
    currentTargetIds: desiredTargetIds,
    currentDirectTargetIds: directTargetIds,
    currentTargetPositions,
    initiativeState,
    suppressedTargetIdsByTrigger,
    areaPosition: zoneItem?.position,
    now,
  });
  const noticeItemsById = new Map(itemsById);
  if (zoneItem?.id) noticeItemsById.set(zoneItem.id, zoneItem);
  const notices = triggerPlan.newActivations
    .map((activation) => zoneTriggerNoticeFromActivation({
      ...activation,
      zoneItemId: zoneItem?.id,
    }, noticeItemsById))
    .filter(Boolean);

  return {
    changed: JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime),
    baseRuntime: previousRuntime,
    runtime: triggerPlan.runtime,
    newActivations: triggerPlan.newActivations,
    notices,
  };
}

export function mergeStaticSpellZoneReminderMetadata(
  currentZoneMetadata = {},
  update = null,
) {
  if (!update) return { ...(currentZoneMetadata || {}) };
  return {
    ...(currentZoneMetadata || {}),
    triggerRuntime: mergePlannedSpellZoneTriggerRuntime(
      currentZoneMetadata?.triggerRuntime,
      update.runtime,
      update.newActivations,
      update.baseRuntime,
    ),
  };
}
