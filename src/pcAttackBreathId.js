// A dragonborn's breath weapon in the PC attack console: not a stored quick action, but an action built from the
// species trait, addressed as "breath:<trait id>". Kept apart so the card and the tracker can open the console
// without loading the attack core.
export const PC_ATTACK_BREATH_PREFIX = "breath:";

// variant: one of the breath's options (the metallic breath's "debilitante" or "repulsivo"), after a colon.
export function pcAttackBreathActionId(featureId, variant = "") {
  return `${PC_ATTACK_BREATH_PREFIX}${String(featureId || "")}${variant ? `:${variant}` : ""}`;
}

export function pcAttackBreathFeatureId(actionId) {
  const value = String(actionId || "");
  return value.startsWith(PC_ATTACK_BREATH_PREFIX) ? value.slice(PC_ATTACK_BREATH_PREFIX.length).split(":")[0] : "";
}

export function pcAttackBreathVariant(actionId) {
  const value = String(actionId || "");
  return value.startsWith(PC_ATTACK_BREATH_PREFIX) ? value.slice(PC_ATTACK_BREATH_PREFIX.length).split(":")[1] || "" : "";
}

// The rule of the shape drawn on the map for a breath (spellAreaRules.js): its cone or line and its damage type.
export function pcBreathAreaRuleId(shape, damageType) {
  const type = String(damageType || "").trim().toLowerCase();
  return ["cone", "line"].includes(shape) && /^[a-z]+$/.test(type) ? `pc-breath-area:${shape}:${type}` : "";
}
