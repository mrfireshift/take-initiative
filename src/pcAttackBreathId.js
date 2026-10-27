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

// The rule of a monster's area drawn on the map (fase 5, lotto 1): its shape at the stat block's size, from the monster's
// token (cone, line, cube; a sphere "within N feet of" it) or on a free point (a sphere elsewhere), coloured by its first
// damage type. "" for a single target or a size the tool cannot draw.
export function pcMonsterAreaRuleId(area, damageType) {
  const type = /^[a-z]+$/.test(String(damageType || "").trim().toLowerCase()) ? String(damageType).trim().toLowerCase() : "force";
  const feet = (value) => (Number.isInteger(value) && value >= 5 && value <= 995 && value % 5 === 0 ? value : 0);
  const size = feet(area?.sizeFeet);
  if (!size) return "";
  if (area.shape === "cone" || area.shape === "cube") return `pc-monster-area:${area.shape}:${size}ft:${type}`;
  if (area.shape === "line") return `pc-monster-area:line:${size}ft:${feet(area.widthFeet) || 5}ft:${type}`;
  if (area.shape === "sphere" || area.shape === "cylinder") return `pc-monster-area:${area.origin === "self" ? "emanation" : "sphere"}:${size}ft:${type}`;
  return "";
}

// The rule of the shape drawn on the map for a breath (spellAreaRules.js): its cone or line and its damage type.
export function pcBreathAreaRuleId(shape, damageType) {
  const type = String(damageType || "").trim().toLowerCase();
  return ["cone", "line"].includes(shape) && /^[a-z]+$/.test(type) ? `pc-breath-area:${shape}:${type}` : "";
}
