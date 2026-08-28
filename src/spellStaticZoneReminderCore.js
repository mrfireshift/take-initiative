import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { zoneTriggerNoticesFromActivation } from "./zoneTriggerNoticeCore.js";

const normalizedIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
));

export function planStaticSpellZoneReminder({
  zoneItem = null,
  rule = null,
  desiredTargetIds = [],
  directTargetIds = [],
  currentTargetIdsByTrigger = {},
  crossingTargetIdsByTrigger = {},
  currentTargetPositions = {},
  initiativeState = null,
  suppressedTargetIdsByTrigger = {},
  preservePendingActivationIds = [],
  suppressGeometricActivationTargetIds = [],
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
  const exemptCreatureIds = new Set(
    normalizedIds(zoneMetadata.exemptCreatureIds),
  );
  const withoutExemptions = (values = []) => normalizedIds(values)
    .filter((targetId) => !exemptCreatureIds.has(targetId));
  const scopedDesiredTargetIds = withoutExemptions(desiredTargetIds);
  const scopedDirectTargetIds = withoutExemptions(directTargetIds);
  const scopedCurrentTargetIdsByTrigger = Object.fromEntries(
    Object.entries(currentTargetIdsByTrigger || {}).map(([triggerId, targetIds]) => [
      triggerId,
      withoutExemptions(targetIds),
    ]),
  );
  const scopedCrossingTargetIdsByTrigger = Object.fromEntries(
    Object.entries(crossingTargetIdsByTrigger || {}).map(([triggerId, targetIds]) => [
      triggerId,
      withoutExemptions(targetIds),
    ]),
  );
  const suppressionTriggerIds = new Set([
    ...Object.keys(suppressedTargetIdsByTrigger || {}),
    ...Object.keys(scopedCurrentTargetIdsByTrigger),
    ...Object.keys(scopedCrossingTargetIdsByTrigger),
  ]);
  const scopedSuppressedTargetIdsByTrigger = Object.fromEntries(
    [...suppressionTriggerIds].map((triggerId) => [
      triggerId,
      normalizedIds([
        ...(suppressedTargetIdsByTrigger?.[triggerId] || []),
        ...exemptCreatureIds,
      ]),
    ]),
  );
  const prismaticWallProximityTriggerIds = new Set(
    (Array.isArray(rule?.zonePolicy?.triggers) ? rule.zonePolicy.triggers : [])
      .filter((trigger) => trigger?.targetArea === "proximity")
      .map((trigger) => String(trigger?.id || "").trim())
      .filter(Boolean),
  );
  const usePrismaticWallProximityBaseline = (
    String(zoneMetadata.spellId || rule?.spellId || "").trim()
      === "prismatic-wall"
    && prismaticWallProximityTriggerIds.size > 0
  );
  const planningRuntime = previousRuntime.initialized || !hasCastMembershipBaseline
    ? previousRuntime
    : {
      ...previousRuntime,
      // Per le zone generiche la membership registrata al cast è la baseline
      // reale. Muro Prismatico fa eccezione: per i trigger di prossimità la
      // baseline deve fotografare la hot zone, altrimenti un token già vicino
      // viene scambiato per un ingresso durante il bootstrap del cast.
      initialized: true,
      memberIds: withoutExemptions(zoneMetadata.targetIds),
      ...(Object.keys(scopedCurrentTargetIdsByTrigger).length
        ? {
          memberIdsByTrigger: Object.fromEntries(
            Object.keys(scopedCurrentTargetIdsByTrigger).map((triggerId) => [
              triggerId,
              usePrismaticWallProximityBaseline
                && prismaticWallProximityTriggerIds.has(triggerId)
                ? scopedCurrentTargetIdsByTrigger[triggerId]
                : withoutExemptions(zoneMetadata.targetIds),
            ]),
          ),
        }
        : {}),
      areaPosition: zoneItem?.position && typeof zoneItem.position === "object"
        ? { ...zoneItem.position }
        : null,
    };
  const triggerPlan = planSpellZoneTriggers({
    rule,
    zoneMetadata,
    runtime: planningRuntime,
    currentTargetIds: scopedDesiredTargetIds,
    currentDirectTargetIds: scopedDirectTargetIds,
    currentTargetIdsByTrigger: scopedCurrentTargetIdsByTrigger,
    crossingTargetIdsByTrigger: scopedCrossingTargetIdsByTrigger,
    currentTargetPositions,
    initiativeState,
    suppressedTargetIdsByTrigger: scopedSuppressedTargetIdsByTrigger,
    preservePendingActivationIds,
    suppressGeometricActivationTargetIds,
    areaPosition: zoneItem?.position,
    now,
  });
  const noticeItemsById = new Map(itemsById);
  if (zoneItem?.id) noticeItemsById.set(zoneItem.id, zoneItem);
  const notices = triggerPlan.newActivations
    .flatMap((activation) => zoneTriggerNoticesFromActivation({
      ...activation,
      zoneItemId: zoneItem?.id,
    }, noticeItemsById));

  return {
    changed: JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime),
    baseRuntime: previousRuntime,
    runtime: triggerPlan.runtime,
    newActivations: triggerPlan.newActivations,
    notices,
  };
}

export function rearmedStaticSpellZoneNotices({
  zoneItem = null,
  pendingActivations = [],
  rearmActivationIds = [],
  itemsById = new Map(),
} = {}) {
  const rearmIds = new Set(
    (Array.isArray(rearmActivationIds) ? rearmActivationIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  if (!rearmIds.size) return [];
  const noticeItemsById = new Map(itemsById);
  if (zoneItem?.id) noticeItemsById.set(zoneItem.id, zoneItem);
  return (Array.isArray(pendingActivations) ? pendingActivations : [])
    .filter((activation) => rearmIds.has(String(activation?.id || "").trim()))
    .flatMap((activation) => zoneTriggerNoticesFromActivation({
      ...activation,
      zoneItemId: zoneItem?.id,
    }, noticeItemsById));
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
