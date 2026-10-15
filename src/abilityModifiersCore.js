// Modificatori di caratteristica salvati nel profilo card (initiativeCard.abilityModifiers).
// Dati puri: nessun SDK, nessuna scrittura di metadata.

export const ABILITY_MODIFIERS_FIELD = "abilityModifiers";
export const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

const MIN_MODIFIER = -5;
const MAX_MODIFIER = 10;

// Nomi usati dalle formule del catalogo (es. "max(1, modificatore_carisma)").
export const ABILITY_FORMULA_KEYS = Object.freeze({
  forza: "str",
  destrezza: "dex",
  costituzione: "con",
  intelligenza: "int",
  saggezza: "wis",
  carisma: "cha",
});

function optionalModifier(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(MIN_MODIFIER, Math.min(MAX_MODIFIER, Math.round(number)));
}

// Accetta l'oggetto del profilo o l'array compatto del registry Room.
export function sanitizeAbilityModifiers(value) {
  const source = Array.isArray(value)
    ? Object.fromEntries(ABILITY_KEYS.map((key, index) => [key, value[index]]))
    : value && typeof value === "object" ? value : {};
  return Object.fromEntries(ABILITY_KEYS.map((key) => [key, optionalModifier(source[key])]));
}

export function hasAbilityModifiers(value) {
  const modifiers = sanitizeAbilityModifiers(value);
  return ABILITY_KEYS.some((key) => modifiers[key] !== null);
}

// Il registry Room salva i sei valori come array, nell'ordine di ABILITY_KEYS.
export function compactAbilityModifiers(value) {
  const modifiers = sanitizeAbilityModifiers(value);
  return ABILITY_KEYS.map((key) => modifiers[key]);
}

export function abilityModifier(value, ability) {
  const key = ABILITY_FORMULA_KEYS[ability] || ability;
  return ABILITY_KEYS.includes(key) ? sanitizeAbilityModifiers(value)[key] : null;
}

export function totalCharacterLevel(characterBuild) {
  const source = Array.isArray(characterBuild) ? characterBuild : [];
  const total = source.reduce((sum, entry) => {
    const level = Math.round(Number(entry?.level));
    return Number.isFinite(level) && level > 0 ? sum + Math.min(20, level) : sum;
  }, 0);
  return Math.min(20, total);
}

export function proficiencyBonusForLevel(level) {
  const total = Math.min(20, Math.round(Number(level) || 0));
  return total > 0 ? 2 + Math.floor((total - 1) / 4) : null;
}

// CD 8 + competenza + modificatore: null se manca il livello o il modificatore.
export function abilitySaveDC(profile, ability) {
  const proficiency = proficiencyBonusForLevel(totalCharacterLevel(profile?.characterBuild));
  const modifier = abilityModifier(profile?.[ABILITY_MODIFIERS_FIELD], ability);
  if (proficiency === null || modifier === null) return null;
  return 8 + proficiency + modifier;
}
