// Damage-type defenses stored in the Actor Profile (initiativeCard.damageDefenses).
// Pure data + arithmetic: no SDK, no metadata writes.
import { scaledQuickHPAmount } from "./quickHpCore.js";
import { sanitizeCharacterBuild, sanitizeEnabledClassFeatureIds } from "./classFeatureCore.js";

export const DAMAGE_DEFENSES_FIELD = "damageDefenses";

export const DAMAGE_TYPES = Object.freeze([
  Object.freeze({ id: "acid", label: "acido" }),
  Object.freeze({ id: "bludgeoning", label: "contundenti" }),
  Object.freeze({ id: "cold", label: "freddo" }),
  Object.freeze({ id: "fire", label: "fuoco" }),
  Object.freeze({ id: "force", label: "forza" }),
  Object.freeze({ id: "lightning", label: "fulmine" }),
  Object.freeze({ id: "necrotic", label: "necrotici" }),
  Object.freeze({ id: "piercing", label: "perforanti" }),
  Object.freeze({ id: "poison", label: "veleno" }),
  Object.freeze({ id: "psychic", label: "psichici" }),
  Object.freeze({ id: "radiant", label: "radiosi" }),
  Object.freeze({ id: "slashing", label: "taglienti" }),
  Object.freeze({ id: "thunder", label: "tuono" }),
]);
const TYPE_IDS = new Set(DAMAGE_TYPES.map((type) => type.id));
// Precedence when a type is listed twice: immunity wins, then resistance, then vulnerability.
const DEFENSE_LISTS = Object.freeze([
  ["immunities", "immunity"],
  ["resistances", "resistance"],
  ["vulnerabilities", "vulnerability"],
]);
export const DAMAGE_DEFENSE_LABELS = Object.freeze({ immunity: "Imm.", resistance: "Res.", vulnerability: "Vuln." });

export function damageTypeLabel(type) {
  return DAMAGE_TYPES.find((entry) => entry.id === type)?.label || String(type || "");
}

export function sanitizeDamageDefenses(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const seen = new Set();
  const result = {};
  for (const [list] of DEFENSE_LISTS) {
    result[list] = (Array.isArray(source[list]) ? source[list] : [])
      .map((type) => String(type || "").trim().toLowerCase())
      .filter((type) => TYPE_IDS.has(type) && !seen.has(type) && seen.add(type))
      .sort((left, right) => DAMAGE_TYPES.findIndex((entry) => entry.id === left) - DAMAGE_TYPES.findIndex((entry) => entry.id === right));
  }
  return result;
}

export function hasDamageDefenses(value) {
  const defenses = sanitizeDamageDefenses(value);
  return DEFENSE_LISTS.some(([list]) => defenses[list].length > 0);
}

export function damageDefenseFor(defenses, type) {
  const clean = sanitizeDamageDefenses(defenses);
  return DEFENSE_LISTS.find(([list]) => clean[list].includes(type))?.[1] || null;
}

// Order follows the 2024 rules: other modifiers (save halving) first, then resistance, then vulnerability.
// Every step uses the shared floor policy, so UI previews and commits always agree.
export function componentDamageAfterDefense(inputAmount, outcomeFactor, defense) {
  const afterOutcome = scaledQuickHPAmount(inputAmount, outcomeFactor);
  if (defense === "immunity") return 0;
  if (defense === "resistance") return scaledQuickHPAmount(afterOutcome, "half");
  if (defense === "vulnerability") return scaledQuickHPAmount(afterOutcome, "double");
  return afterOutcome;
}

export function damageDefensesForItem(item, metaKey) {
  return sanitizeDamageDefenses(item?.metadata?.[metaKey]?.initiativeCard?.[DAMAGE_DEFENSES_FIELD]);
}

// Defenses that matter for these components, minus the ones the GM chose to ignore for this resolution.
export function relevantDamageDefenses(defenses, components = [], ignoredTypes = []) {
  const ignored = new Set(Array.isArray(ignoredTypes) ? ignoredTypes : []);
  return components
    .map((component) => ({ type: component.type, defense: damageDefenseFor(defenses, component.type) }))
    .filter((row, index, rows) => row.defense && rows.findIndex((other) => other.type === row.type) === index)
    .map((row) => ({ ...row, ignored: ignored.has(row.type) }));
}

// Evasion is a defense the Actor Profile derives from the class build: the Rogue class feature
// "ladro-elusione" (7th level, enabled by default; once features are configured, only if enabled).
// It applies to any effect whose DEX save halves the damage: success → no damage, failure → half.
export const EVASION_DEFENSE = "evasion";
export const EVASION_FEATURE = Object.freeze({ id: "ladro-elusione", classId: "ladro", minimumLevel: 7 });
export function actorHasEvasion(card) {
  const rogue = sanitizeCharacterBuild(card?.characterBuild).find((entry) => entry.classId === EVASION_FEATURE.classId);
  if (!rogue || rogue.level < EVASION_FEATURE.minimumLevel) return false;
  return card?.classFeaturesConfigured === true
    ? sanitizeEnabledClassFeatureIds(card.enabledClassFeatureIds).includes(EVASION_FEATURE.id) : true;
}
export function evasionForItem(item, metaKey) {
  return actorHasEvasion(item?.metadata?.[metaKey]?.initiativeCard);
}
export function evasionAppliesTo(execution) {
  return execution?.save?.ability === "dex" && execution?.success === "half";
}
export function evasionFactor(factor) {
  return factor === "full" ? "half" : factor === "half" ? "zero" : factor;
}

export function damageDefenseTag({ type, defense }) {
  return `${DAMAGE_DEFENSE_LABELS[defense] || defense} ${damageTypeLabel(type)}`;
}
