// A dragonborn's breath weapon in the PC attack console: not a stored quick action, but an action built from the
// species trait, addressed as "breath:<trait id>". Kept apart so the card and the tracker can open the console
// without loading the attack core.
export const PC_ATTACK_BREATH_PREFIX = "breath:";

export function pcAttackBreathActionId(featureId) {
  return `${PC_ATTACK_BREATH_PREFIX}${String(featureId || "")}`;
}

export function pcAttackBreathFeatureId(actionId) {
  const value = String(actionId || "");
  return value.startsWith(PC_ATTACK_BREATH_PREFIX) ? value.slice(PC_ATTACK_BREATH_PREFIX.length) : "";
}
