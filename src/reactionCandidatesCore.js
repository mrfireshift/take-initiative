// Reaction prompts, lot R0 (docs/STUDIO_AVVISI_REAZIONE.md): who can react to an event, with what and why, and the
// prompts' options. Pure: it reads the scene items and the initiative state it is given and writes nothing. The prompt
// (lot R1 on) shows the candidates; its Usa opens the flow of the catalog entry (reactionTriggerCatalog.js).
//
// What keeps a candidate out, before any option (section 5.1 of the study):
// - no combat (an empty initiative order) or a creature outside the order;
// - the reaction already used ("Reazione usata"), an incapacitated creature (Incapacitato, also from Stordito,
//   Paralizzato, Pietrificato, Privo di sensi) or one at 0 hit points;
// - the reaction's source missing: the spell not castable (creatureCastableSpellIds), the class feature not enabled on
//   the sheet, its resource empty, no slot of the spell's level left (a creature without slots in the plugin, a
//   monster, stays able: as counterspellSlotOptions);
// - a trigger that does not match: melee or ranged, an attack with a roll, a critical, the damage types, the distance
//   to the protected ally or to the caster (an unknown distance keeps a reaction on the reactor itself, and drops one
//   on somebody else), the pill a reaction asks (Rage, Bladesong).
// The options then drop the triggers and the creatures switched off and the reactions muted ("Non chiedere più").
import { ID } from "./constants.js";
import { hasReactionUsed } from "./reactionTrackerCore.js";
import { conditionKey, hasEffectiveCondition } from "./conditionRulesCore.js";
import { ABSORB_ELEMENTS_CHOICES, creatureCastableSpellIds } from "./attackReactionsCore.js";
import { classFeatureResourceStatus, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { spellSlotChoices } from "./spellSlotSpendCore.js";
import { spellSlotStatus } from "./spellSlotCore.js";
import { quickActionUsesLeft, sanitizeQuickAction } from "./quickActionsCore.js";
import { playerMemoryKeyOfItem } from "./playerAssignmentMemoryCore.js";
import { damageTypeLabel } from "./damageDefensesCore.js";
import { REACTION_TRIGGER_CATALOG, REACTION_TRIGGER_OPTION, REACTION_TRIGGERS, reactionTriggerEntriesFor } from "./reactionTriggerCatalog.js";
import { isReactionPromptMuted, normalizeReactionPromptOptions } from "./reactionPromptOptionsCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CLASS_FEATURE_STATE_FIELD = "classFeatureState";
const text = (value, limit = 160) => String(value ?? "").trim().slice(0, limit);
const baseId = (value) => text(value, 220).replace(/::p\d+$/u, "");

// The options (normalized in reactionPromptOptionsCore.js, light for the options panel), re-exported here.
export {
  REACTION_PROMPT_DEFAULTS, REACTION_PROMPT_MUTED_LIMIT, isReactionPromptMuted, normalizeReactionPromptOptions, withReactionPromptMuted,
} from "./reactionPromptOptionsCore.js";

// The key a muted reaction is kept under: the character's short key (playerAssignmentMemoryCore.js, the same across
// scenes), else the token id.
export function reactionActorKey(item) {
  return playerMemoryKeyOfItem(item) || (text(item?.id, 220) ? `i${text(item.id, 220)}` : "");
}

// ---------------------------------------------------------------------------------------------------------------
// The event.
// ---------------------------------------------------------------------------------------------------------------
const ids = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map(baseId).filter(Boolean)));
const level = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Math.floor(Number(value));
  return Number.isInteger(number) && number >= 0 && number <= 9 ? number : null;
};

/**
 * trigger: one of REACTION_TRIGGERS. Attacks (hit, damage, miss): attackerId, targetIds (an area has several),
 * range ("melee" | "ranged"), attackRoll, critical, damageTypes. A spell cast: casterId, spellId, spellName,
 * spellLevel, spellTargetIds. Movement: moverId and reactorIds (the creatures whose reach it left or entered, measured
 * by the caller).
 */
export function normalizeReactionEvent(event = {}) {
  const trigger = REACTION_TRIGGERS.includes(text(event?.trigger)) ? text(event.trigger) : "";
  const range = text(event?.range);
  return {
    trigger,
    attackerId: baseId(event?.attackerId),
    targetIds: ids(event?.targetIds),
    range: range === "melee" || range === "ranged" ? range : "",
    attackRoll: event?.attackRoll === true,
    critical: event?.critical === true,
    damageTypes: Array.from(new Set((Array.isArray(event?.damageTypes) ? event.damageTypes : []).map((type) => text(type, 40)).filter(Boolean))),
    casterId: baseId(event?.casterId),
    spellId: text(event?.spellId),
    spellName: text(event?.spellName, 120),
    spellLevel: level(event?.spellLevel),
    spellTargetIds: ids(event?.spellTargetIds),
    moverId: baseId(event?.moverId),
    reactorIds: ids(event?.reactorIds),
  };
}

// The same event twice (an outcome picked again on the same draft) gives the same signature: the prompt does not come
// back (section 5.1, point 7). The caller adds its own draft key.
export function reactionEventSignature(event) {
  const value = normalizeReactionEvent(event);
  return JSON.stringify([value.trigger, value.attackerId, [...value.targetIds].sort(), value.range, value.attackRoll, value.critical,
    [...value.damageTypes].sort(), value.casterId, value.spellId, value.spellLevel, [...value.spellTargetIds].sort(), value.moverId,
    [...value.reactorIds].sort()]);
}

// ---------------------------------------------------------------------------------------------------------------
// The creature.
// ---------------------------------------------------------------------------------------------------------------
const metaOf = (item) => item?.metadata?.[META_KEY] || {};

function conditionInstances(item) {
  const value = metaOf(item).conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && typeof instance === "object" && instance.active !== false);
}

function attitudeGroup(item) {
  const attitude = text(metaOf(item).attitude || "neutral").toLocaleLowerCase("it");
  if (attitude === "enemy") return "enemy";
  if (attitude === "pc" || attitude === "ally") return "friendly";
  return "neutral";
}

const isPlayerCharacter = (item) => text(metaOf(item).attitude).toLocaleLowerCase("it") === "pc";
const friendly = (a, b) => attitudeGroup(a) !== "neutral" && attitudeGroup(a) === attitudeGroup(b);
// Hostile: one on each side (an enemy against a character or an ally). The neutrals stay out, to keep the prompts few.
const hostile = (a, b) => new Set([attitudeGroup(a), attitudeGroup(b)]).size === 2
  && [attitudeGroup(a), attitudeGroup(b)].every((group) => group !== "neutral");

// Able to react now: the reaction free, not incapacitated, above 0 hit points.
export function creatureCanReact(item) {
  const meta = metaOf(item);
  if (!item?.id || !Object.keys(meta).length) return false;
  if (hasReactionUsed(meta.conditions)) return false;
  if (hasEffectiveCondition(conditionInstances(item), "Incapacitato")) return false;
  if (Object.hasOwn(meta, "hp") && Number.isFinite(Number(meta.hp)) && Number(meta.hp) <= 0) return false;
  return true;
}

function hasCondition(item, name, sourceId = "") {
  const wanted = conditionKey(name);
  return conditionInstances(item).some((instance) => conditionKey(instance) === wanted
    && (!sourceId || text(instance.sourceId, 220) === sourceId));
}

function hasActiveSpell(item, spellId) {
  const spells = Array.isArray(metaOf(item)[SPELLS_KEY]) ? metaOf(item)[SPELLS_KEY] : [];
  return spells.some((spell) => text(spell?.spellId) === spellId);
}

// A spell's cost left: a free or counted quick action with a use left, a slot of its level, or no slots at all in the
// plugin (a monster, an innate spell: the GM knows). Only a creature whose slots are all spent is kept out.
export function reactionSpellAvailable(item, spellId, slotLevel = 1) {
  const meta = metaOf(item);
  const card = meta.initiativeCard || {};
  const resources = meta[CLASS_FEATURE_STATE_FIELD]?.resources || {};
  const actions = (Array.isArray(card.quickActions) ? card.quickActions : []).map((action) => sanitizeQuickAction(action))
    .filter((action) => action?.kind === "spell" && action.spellId === spellId);
  if (actions.some((action) => action.cost === "free")) return true;
  if (actions.some((action) => action.cost === "uses" && (quickActionUsesLeft(action, resources)?.current || 0) > 0)) return true;
  if (!spellSlotStatus(card.characterBuild, resources).length) return true;
  return spellSlotChoices({ characterBuild: card.characterBuild, resources, spellLevel: slotLevel }).some((choice) => choice.current > 0);
}

// The sheet's enabled feature among the entry's ids, with its resource left; null when it has none of them.
function enabledReactionFeature(item, featureIds) {
  const meta = metaOf(item);
  const card = meta.initiativeCard || {};
  const wanted = new Set(featureIds || []);
  for (const feature of getEnabledClassFeatures(card)) {
    if (!wanted.has(feature.id)) continue;
    const resources = classFeatureResourceStatus(feature, card, meta[CLASS_FEATURE_STATE_FIELD]);
    return resources.ready ? feature : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The candidates.
// ---------------------------------------------------------------------------------------------------------------
const nameOf = (item, fallback = "Creatura") => text(item?.name, 80) || fallback;

function within(distance, a, b, meters) {
  if (!Number.isFinite(Number(meters))) return true;
  if (typeof distance !== "function" || !a || !b) return null;
  let measured = null;
  try { measured = distance(a, b); } catch { measured = null; }
  return Number.isFinite(Number(measured)) ? Number(measured) <= Number(meters) + 1e-6 : null;
}

function filtersMatch(entry, event) {
  const filters = entry.filters || {};
  if (filters.range && event.range !== filters.range) return false;
  if (filters.attackRoll && !event.attackRoll) return false;
  if (filters.critical && !event.critical) return false;
  if (Array.isArray(filters.damageTypes) && !event.damageTypes.some((type) => filters.damageTypes.includes(type))) return false;
  return true;
}

// The creatures of an attack the reactor protects with this entry (one candidate each).
function protectedTargets(entry, reactor, attacker, targets, distance) {
  if (entry.attackerRangeMeters !== null && entry.protects !== "other") {
    if (within(distance, reactor, attacker, entry.attackerRangeMeters) === false) return [];
  }
  switch (entry.protects) {
    case "self":
      return targets.filter((target) => target.id === reactor.id);
    case "self-or-ally":
      return targets.filter((target) => target.id === reactor.id
        || (friendly(reactor, target) && within(distance, reactor, target, entry.rangeMeters) === true));
    case "ally":
      return targets.filter((target) => target.id !== reactor.id && friendly(reactor, target)
        && within(distance, reactor, target, entry.rangeMeters) === true);
    case "other":
      if (!attacker || !hostile(reactor, attacker) || within(distance, reactor, attacker, entry.attackerRangeMeters) !== true) return [];
      return targets.filter((target) => target.id !== reactor.id).slice(0, 1);
    default:
      return [];
  }
}

function why(event, { attacker, caster, mover, target }) {
  const attackerName = nameOf(attacker, "l'attaccante");
  const targetName = nameOf(target, "il bersaglio");
  const types = event.damageTypes.length ? ` (${event.damageTypes.map(damageTypeLabel).join(", ")})` : "";
  switch (event.trigger) {
    case "hit": return `${event.critical ? "Critico" : "Colpo"} di ${attackerName} su ${targetName}${event.range === "melee" ? ", in mischia" : event.range === "ranged" ? ", a distanza" : ""}.`;
    case "damage": return `Danno di ${attackerName} a ${targetName}${types}.`;
    case "miss": return `${attackerName} manca ${targetName}.`;
    case "spell-cast": {
      const spell = event.spellName || "un incantesimo";
      const spellLevel = event.spellLevel === null ? "" : event.spellLevel === 0 ? " (trucchetto)" : ` (${event.spellLevel}°)`;
      return `${nameOf(caster, "Una creatura")} lancia ${spell}${spellLevel}.`;
    }
    case "move-leave": return `${nameOf(mover)} esce dalla portata.`;
    case "move-enter": return `${nameOf(mover)} si avvicina.`;
    case "turn-end-near": return `${nameOf(mover)} finisce il turno vicino.`;
    default: return "";
  }
}

const TIMING_ORDER = { before: 0, after: 1 };
const CATALOG_INDEX = new Map(REACTION_TRIGGER_CATALOG.map((entry, index) => [entry.id, index]));

/**
 * The reactions an event allows. context: items (the scene items), state (the initiative state: its order), options
 * (the prompts' options, normalized here), distance(a, b) (meters between two items, or null when unknown),
 * monsterReactions ({ item id: [reactions read from its stat block] }, monsterReactionParseCore.js, lot R4).
 * Returns { trigger, candidates }: each candidate { key, reactionId, label, source, timing, flow, lot, reactorId,
 * reactorName, actorKey, protectedId, protectedName, spellId, featureId, variant, targetIds, short, rule, why }.
 */
export function reactionCandidates(event, { items = [], state = null, options = undefined, distance = null, monsterReactions = null } = {}) {
  const value = normalizeReactionEvent(event);
  const result = { trigger: value.trigger, candidates: [] };
  const opts = normalizeReactionPromptOptions(options);
  const optionKey = REACTION_TRIGGER_OPTION[value.trigger];
  if (!opts.enabled || !optionKey || !opts.triggers[optionKey]) return result;
  const order = new Set((Array.isArray(state?.order) ? state.order : []).map(baseId).filter(Boolean));
  if (!order.size) return result;
  const byId = new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [baseId(item.id), item]));
  const attacker = byId.get(value.attackerId) || null;
  const caster = byId.get(value.casterId) || null;
  const mover = byId.get(value.moverId) || null;
  const targets = value.targetIds.map((id) => byId.get(id)).filter(Boolean);
  const origin = value.trigger === "spell-cast" ? value.casterId : value.trigger.startsWith("move") || value.trigger === "turn-end-near"
    ? value.moverId : value.attackerId;
  const reactors = [...byId.values()].filter((item) => order.has(baseId(item.id)) && baseId(item.id) !== origin
    && (isPlayerCharacter(item) ? opts.actors.pcs : opts.actors.npcs) && creatureCanReact(item));

  for (const entry of reactionTriggerEntriesFor(value.trigger)) {
    if (entry.id === "counterspell" && value.spellLevel === 0 && !opts.counterspellCantrips) continue;
    if (["hit", "damage", "miss"].includes(value.trigger) && !filtersMatch(entry, value)) continue;
    for (const reactor of reactors) {
      const actorKey = reactionActorKey(reactor);
      if (isReactionPromptMuted(opts, actorKey, entry.id)) continue;
      if (entry.requiresReactorCondition && !hasCondition(reactor, entry.requiresReactorCondition)) continue;
      if (entry.requiresAttackerCondition && !(attacker && hasCondition(attacker, entry.requiresAttackerCondition, reactor.id))) continue;

      let protectedList = [null];
      if (["hit", "damage", "miss"].includes(value.trigger)) {
        protectedList = protectedTargets(entry, reactor, attacker, targets, distance);
      } else if (value.trigger === "spell-cast") {
        if (!caster || !hostile(reactor, caster)) continue;
        if (entry.casterRangeMeters && within(distance, reactor, caster, entry.casterRangeMeters) !== true) continue;
        if (entry.requiresSpellTarget && !value.spellTargetIds.includes(baseId(reactor.id))) continue;
      } else {
        if (!mover || !hostile(reactor, mover) || !value.reactorIds.includes(baseId(reactor.id))) continue;
      }
      if (!protectedList.length) continue;

      let featureId = "";
      if (entry.source === "spell") {
        if (!creatureCastableSpellIds(reactor).has(entry.spellId)) continue;
        if (entry.skipIfActiveSpell && hasActiveSpell(reactor, entry.spellId)) continue;
        if (!reactionSpellAvailable(reactor, entry.spellId, entry.slotLevel || 1)) continue;
      } else if (entry.source === "class-feature") {
        const feature = enabledReactionFeature(reactor, entry.featureIds);
        if (!feature) continue;
        featureId = feature.id;
      }
      // Lot R4: a monster's reaction of this kind, read from its stat block; a Parry that says "melee" only in melee.
      let monsterReaction = null;
      if (entry.source === "monster") {
        const list = monsterReactions && typeof monsterReactions === "object" ? monsterReactions[baseId(reactor.id)] : null;
        monsterReaction = (Array.isArray(list) ? list : []).find((reaction) => reaction?.kind === entry.monsterKind) || null;
        if (!monsterReaction) continue;
        if (monsterReaction.melee && value.range !== "melee") continue;
      }

      const absorbed = entry.effect?.variantByType ? value.damageTypes.find((type) => ABSORB_ELEMENTS_CHOICES[type]) : "";
      const targetIds = entry.targetsAttacker ? (value.attackerId ? [value.attackerId] : [])
        : entry.targetsCaster ? (value.casterId ? [value.casterId] : [])
          : entry.targetsMover ? (value.moverId ? [value.moverId] : []) : [];
      if ((entry.targetsAttacker || entry.targetsCaster || entry.targetsMover) && !targetIds.some((id) => byId.has(id))) continue;
      for (const target of protectedList) {
        result.candidates.push({
          key: `${baseId(reactor.id)}::${entry.id}${target ? `::${target.id}` : ""}`,
          reactionId: entry.id,
          label: monsterReaction && entry.effect?.kind === "other" ? monsterReaction.name : entry.label,
          source: entry.source,
          timing: entry.timing,
          flow: entry.flow,
          lot: entry.lot,
          reactorId: baseId(reactor.id),
          reactorName: nameOf(reactor),
          actorKey,
          protectedId: target ? target.id : "",
          protectedName: target ? nameOf(target) : "",
          spellId: entry.spellId || "",
          featureId,
          variant: absorbed ? ABSORB_ELEMENTS_CHOICES[absorbed] : "",
          targetIds,
          short: monsterReaction?.kind === "ac-bonus" ? `+${monsterReaction.amount} CA` : entry.short,
          rule: monsterReaction ? `${monsterReaction.name}: ${monsterReaction.text}` : entry.rule,
          ...(monsterReaction?.kind === "ac-bonus" ? { amount: monsterReaction.amount } : {}),
          why: why(value, { attacker, caster, mover, target }),
        });
      }
    }
  }
  result.candidates.sort((a, b) => (TIMING_ORDER[a.timing] - TIMING_ORDER[b.timing])
    || a.reactorName.localeCompare(b.reactorName, "it")
    || (CATALOG_INDEX.get(a.reactionId) - CATALOG_INDEX.get(b.reactionId))
    || a.protectedName.localeCompare(b.protectedName, "it"));
  return result;
}

// "before" stops the console before Registra; "after" is a notice once the command is applied (section 3).
export function splitReactionCandidates(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return { before: list.filter((candidate) => candidate.timing === "before"), after: list.filter((candidate) => candidate.timing === "after") };
}
