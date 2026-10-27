// A species' natural weapon (claws, bite, horns, hooves, a ram's head) as an attack of the card, filled from the trait:
// its die, damage type and the ability added to the damage (Constitution for the dhampir's bite). The modifier is the
// card's when the attack is added; the GM edits the formula if the ability changes later.
// Pure: no SDK, DOM or runtime state.
import { abilityModifier } from "./abilityModifiersCore.js";
import { MAX_QUICK_ACTION_ATTACKS, isAttackQuickAction, sanitizeQuickAction } from "./quickActionsCore.js";

const PREFIX = "species-weapon-";

export function speciesNaturalWeaponActionId(feature) {
  return feature?.id ? `${PREFIX}${feature.id}` : "";
}

// The attack quick action of the trait's natural weapon, or null.
export function speciesNaturalWeaponAction(feature, card = {}) {
  const weapon = feature?.naturalWeapon;
  if (!weapon) return null;
  const modifier = abilityModifier(card?.abilityModifiers, weapon.ability);
  const formula = Number.isFinite(modifier) && modifier !== 0 ? `${weapon.dice}${modifier > 0 ? "+" : ""}${modifier}` : weapon.dice;
  return sanitizeQuickAction({ id: speciesNaturalWeaponActionId(feature), label: weapon.label, kind: "attack", range: "melee",
    components: [{ type: weapon.type, formula }] });
}

// Whether the card can take it: { present } when already among the attacks, { full } when the attacks are at the limit.
export function speciesNaturalWeaponState(feature, card = {}) {
  const actions = Array.isArray(card?.quickActions) ? card.quickActions : [];
  const id = speciesNaturalWeaponActionId(feature);
  return {
    present: actions.some((action) => action?.id === id),
    full: actions.filter((action) => isAttackQuickAction(action)).length >= MAX_QUICK_ACTION_ATTACKS,
  };
}
