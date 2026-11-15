// Reaction used and readied action: two ordinary conditions on the creature that end by themselves at the start of its
// next turn (the condition engine's turn-start expiry), so nothing new runs on the turn change. The tracker card shows
// the reaction as a clickable indicator; the readied action lives in the card's context menu.
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { isEpicActionId, isLairId, splitParagonId } from "./initiativeSelectionProjectionCore.js";

export const REACTION_USED_CONDITION = "Reazione usata";
export const READIED_ACTION_CONDITION = "Azione preparata";

// "Until the start of its next turn": the reaction comes back, the readied action expires.
export const NEXT_OWN_TURN_START_EXPIRY = Object.freeze({ mode: "turn-start", actor: "target", remaining: 1 });

const key = (value) => String(value || "").trim().toLocaleLowerCase("it");

// Active instances of a condition in an entry's conditions ({ instances: [...] }).
export function conditionInstancesNamed(conditions, name) {
  const wanted = key(name);
  const instances = Array.isArray(conditions?.instances) ? conditions.instances : [];
  return instances.filter((instance) =>
    instance && typeof instance === "object"
    && instance.active !== false
    && key(instance.condition || instance.name) === wanted
    && String(instance.id || "").trim());
}

// A spell record or a concentration that holds a readied spell (lot T6e of docs/STUDIO_AZIONI_DI_TURNO.md, decision P4):
// its name says so wherever the concentration is named (the save's warning, the card's C, the console, the panel, the
// log). «azione preparata» whatever the spell's gender.
export const READIED_HOLD_TAG = "azione preparata";
export function isReadiedHoldEntry(entry) {
  return entry?.castContext?.readied === true && String(entry?.castContext?.phase || "").trim() === "prepare";
}
export function readiedHoldName(name, entry) {
  const text = String(name || "").trim();
  return text && isReadiedHoldEntry(entry) ? `${text} (${READIED_HOLD_TAG})` : text;
}

// The spell a readied action holds (lot T6c of docs/STUDIO_AZIONI_DI_TURNO.md, decision P5): the record its pill
// belongs to, held on the creature (castContext.readied, at its hold). null for a readied action holding no spell.
export function readiedSpellHold(conditions, spells = []) {
  const parents = new Set(conditionInstancesNamed(conditions, READIED_ACTION_CONDITION)
    .map((instance) => String(instance.parentEffectId || "").trim())
    .filter(Boolean));
  if (!parents.size) return null;
  const hold = (Array.isArray(spells) ? spells : []).find((spell) => (
    parents.has(String(spell?.instanceId || "").trim())
    && spell?.castContext?.readied === true
    && String(spell?.castContext?.phase || "").trim() === "prepare"
  ));
  if (!hold) return null;
  const slotLevel = Math.floor(Number(hold.castContext?.slotLevel));
  return {
    instanceId: String(hold.instanceId).trim(),
    spellId: String(hold.spellId || "").trim(),
    name: String(hold.name || hold.spellId || "Incantesimo").trim(),
    ...(Number.isInteger(slotLevel) && slotLevel > 0 ? { slotLevel } : {}),
  };
}

export function hasReactionUsed(conditions) {
  return conditionInstancesNamed(conditions, REACTION_USED_CONDITION).length > 0;
}

export function hasReadiedAction(conditions) {
  return conditionInstancesNamed(conditions, READIED_ACTION_CONDITION).length > 0;
}

// The scene item behind a card: a Paragon turn (`id::pN`) belongs to its base token.
export function reactionTargetId(entry) {
  const id = String(entry?.__paragonBaseId || entry?.id || "").trim();
  return id.replace(/::p\d+$/u, "") || null;
}

// When the condition was applied, so that its expiry is counted from the current turn.
export function reactionAppliedAt(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const current = Math.floor(Number(state?.current) || 0);
  const actorId = typeof order[current] === "string" ? order[current] : "";
  return {
    round: Math.max(1, Math.floor(Number(state?.round) || 1)),
    ...(actorId ? { actorId } : {}),
    phase: "turn",
    ...(order.length ? { turnKey: currentInitiativeTurnKey(state) } : {}),
  };
}

export function reactionConditionOptions(state) {
  return { appliedAt: reactionAppliedAt(state), expiry: { ...NEXT_OWN_TURN_START_EXPIRY } };
}

// The creature whose turn it is: a Paragon's extra turn is its creature's; none in the Lair or an Epic Action slot.
export function initiativeTurnCreatureId(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return "";
  const id = order[Math.max(0, Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)))];
  if (typeof id !== "string" || !id || isLairId(id) || isEpicActionId(id)) return "";
  return splitParagonId(id).baseId || "";
}

// In combat and not on its own turn (another creature's, the Lair's, an Epic Action's): an attack now is taken with
// the reaction (an opportunity attack, a readied attack).
export function isOffTurn(state, itemId) {
  const id = String(itemId || "").trim();
  const order = Array.isArray(state?.order) ? state.order.filter(Boolean) : [];
  return !!id && order.length > 0 && initiativeTurnCreatureId(state) !== id;
}

// A class feature or species trait used with a reaction (the catalog's activation "reazione").
export function isReactionClassFeature(feature) {
  return String(feature?.activation?.primary || "").trim() === "reazione";
}

// What an action taken with a reaction spends of the actor's reaction, in the action's own command. Only in combat:
// without an initiative order there is no turn for the reaction to come back at. alreadyUsed: nothing more is spent
// (the caller asks the GM first when it can).
export function planReactionSpend({ applies = true, casterId = "", casterName = "", conditions = null, initiativeState = null } = {}) {
  const id = String(casterId || "").trim();
  const order = Array.isArray(initiativeState?.order) ? initiativeState.order.filter(Boolean) : [];
  if (!applies || !id || !order.length) {
    return { applies: false, alreadyUsed: false, operations: [], message: "" };
  }
  const name = String(casterName || "").trim() || "Il caster";
  if (hasReactionUsed(conditions)) {
    return { applies: true, alreadyUsed: true, operations: [], message: `${name} ha già usato la reazione in questo round.` };
  }
  return {
    applies: true,
    alreadyUsed: false,
    operations: [
      {
        type: "condition:add",
        targetIds: [id],
        conditionName: REACTION_USED_CONDITION,
        options: reactionConditionOptions(initiativeState),
      },
      { type: "condition:automate", subjectIds: [id] },
    ],
    message: "",
  };
}
