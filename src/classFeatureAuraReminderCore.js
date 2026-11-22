import { CLASS_FEATURE_AURA_META_KEY } from "./classFeatureAuraCore.js";
import { characterClassLevel } from "./classFeatureCore.js";
import { ID } from "./constants.js";
import { hasReactionUsed } from "./reactionTrackerCore.js";
import {
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { zoneTriggerNoticesFromActivation } from "./zoneTriggerNoticeCore.js";

const META_KEY = `${ID}/meta`;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

// The side of a creature, as the areas count it (spellAreaMembershipCore.js): heroes and allies one, enemies the other,
// neutrals none.
function attitudeSide(item) {
  const attitude = String(item?.metadata?.[META_KEY]?.attitude || "neutral").toLocaleLowerCase("it");
  if (attitude === "enemy") return "enemy";
  return attitude === "pc" || attitude === "ally" ? "friendly" : "";
}

function sourceConditions(item) {
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(conditions) ? { instances: conditions } : conditions;
}

// What a trigger's resolutionData asks of the aura's source (Twilight Sanctuary, docs/STUDIO_SANTUARIO_HOMEBREW.md):
// - temporaryHpPlus { classLevel }: the source's level in that class, added to the die the GM enters
//   (temporaryHpBonus); without the level on the card the GM enters the total, as before;
// - spendsSourceReaction: no offer while the source's reaction is used (reactionUsed), the homebrew's cost;
// - skipHostileTargets: no offer to a creature hostile to the source (an enemy for a hero, a hero for an enemy).
// The bonus goes in the trigger, so the pending activation the aura keeps has it too.
function auraTriggerPolicyForSource({ aura, itemsById, candidateIds, reactionUsed = false }) {
  const triggers = Array.isArray(aura?.triggerPolicy?.triggers) ? aura.triggerPolicy.triggers : [];
  const source = itemsById.get(String(aura?.sourceId || "").trim()) || null;
  const suppressedTargetIdsByTrigger = {};
  let changed = false;
  const nextTriggers = triggers.map((trigger) => {
    const data = trigger?.resolutionData && typeof trigger.resolutionData === "object" ? trigger.resolutionData : null;
    if (!data) return trigger;
    const triggerId = String(trigger?.id || "").trim();
    const suppressed = new Set();
    if (data.spendsSourceReaction === true && reactionUsed) {
      for (const id of candidateIds) suppressed.add(id);
    }
    if (data.skipHostileTargets === true) {
      const sourceSide = attitudeSide(source);
      for (const id of candidateIds) {
        const side = attitudeSide(itemsById.get(id));
        if (sourceSide && side && side !== sourceSide) suppressed.add(id);
      }
    }
    if (triggerId && suppressed.size) suppressedTargetIdsByTrigger[triggerId] = [...suppressed];
    const classId = String(data.temporaryHpPlus?.classLevel || "").trim();
    if (!classId) return trigger;
    const level = characterClassLevel(source?.metadata?.[META_KEY]?.initiativeCard?.characterBuild, classId);
    if (!level) return trigger;
    changed = true;
    return { ...trigger, resolutionData: { ...data, temporaryHpBonus: level } };
  });
  return {
    triggerPolicy: changed ? { ...aura.triggerPolicy, triggers: nextTriggers } : aura?.triggerPolicy,
    suppressedTargetIdsByTrigger,
  };
}

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
  const sourceItemsById = itemsById instanceof Map
    ? itemsById
    : new Map(Object.entries(itemsById || {}));
  // The source's reaction comes back at the start of its turn (reactionTrackerCore.js), and the plugin may take its
  // «Reazione usata» away before this pass reads the end of the turn just ended, the one of the creature right before
  // it. The aura keeps what it saw at its last pass (sourceReaction: { used, turnKey }): after a turn change the reaction
  // counts as used at the end of that turn if it was then, or is now. Only an aura whose reminders cost it keeps it.
  const watchesReaction = (Array.isArray(aura?.triggerPolicy?.triggers) ? aura.triggerPolicy.triggers : [])
    .some((trigger) => trigger?.resolutionData?.spendsSourceReaction === true);
  const reactionNow = watchesReaction
    && hasReactionUsed(sourceConditions(sourceItemsById.get(String(aura?.sourceId || "").trim())));
  const turnKey = currentInitiativeTurnKey(initiativeState || {});
  const remembered = auraMetadata.sourceReaction && typeof auraMetadata.sourceReaction === "object"
    ? auraMetadata.sourceReaction
    : null;
  const rememberedTurnKey = String(remembered?.turnKey || "").trim();
  const reactionUsed = reactionNow || (remembered?.used === true && !!rememberedTurnKey && rememberedTurnKey !== turnKey);
  const sourceReaction = watchesReaction ? { used: reactionNow, turnKey } : null;
  const { triggerPolicy, suppressedTargetIdsByTrigger } = auraTriggerPolicyForSource({
    aura,
    itemsById: sourceItemsById,
    // A turn ends for a creature counted inside at the last pass, or inside now.
    candidateIds: uniqueIds([...desiredTargetIds, ...previousRuntime.memberIds]),
    reactionUsed,
  });
  const triggerPlan = planSpellZoneTriggers({
    rule: {
      triggerPolicy,
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
    suppressedTargetIdsByTrigger,
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
    changed: JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime)
      || (!!sourceReaction && (remembered?.used !== sourceReaction.used || rememberedTurnKey !== sourceReaction.turnKey)),
    baseRuntime: previousRuntime,
    runtime: triggerPlan.runtime,
    newActivations: activations,
    notices,
    ...(sourceReaction ? { sourceReaction } : {}),
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
    ...(update.sourceReaction ? { sourceReaction: { ...update.sourceReaction } } : {}),
  };
}
