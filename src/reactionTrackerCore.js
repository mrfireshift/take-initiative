// Reaction used and readied action: two ordinary conditions on the creature that end by themselves at the start of its
// next turn (the condition engine's turn-start expiry), so nothing new runs on the turn change. The tracker card shows
// the reaction as a clickable indicator; the readied action lives in the card's context menu.
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";

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
