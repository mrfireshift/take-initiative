// A card imported from a monster's stat block (attacchi dei mostri, lotto 1): where it came from and its Multiattack,
// shown at the top of the attack console. The actions are the card's attack quick actions, the AC its armorClass; the
// stat block's full text never goes on the token.
export const MONSTER_PROFILE_FIELD = "monster";
export const MONSTER_PROFILE_SOURCES = Object.freeze(["manual", "5etools", "open5e"]);
export const MAX_MONSTER_MULTIATTACK = 280;

const sourceSet = new Set(MONSTER_PROFILE_SOURCES);

// { source, multiattack? }, or null: null removes it (a card that is no longer a monster's), like the species.
export function sanitizeMonsterProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = sourceSet.has(value.source) ? value.source : "manual";
  const multiattack = String(value.multiattack ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_MONSTER_MULTIATTACK);
  return { source, ...(multiattack ? { multiattack } : {}) };
}

export function isMonsterProfileCard(card) {
  return !!sanitizeMonsterProfile(card?.[MONSTER_PROFILE_FIELD]);
}
