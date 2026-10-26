// A card imported from a monster's stat block (attacchi dei mostri, lotto 1): where it came from and its Multiattack,
// shown at the top of the attack console. The actions are the card's attack quick actions, the AC its armorClass; the
// stat block's full text never goes on the token.
export const MONSTER_PROFILE_FIELD = "monster";
export const MONSTER_PROFILE_SOURCES = Object.freeze(["manual", "5etools", "open5e"]);
export const MAX_MONSTER_MULTIATTACK = 280;
export const MAX_MONSTER_REF = 120;

const sourceSet = new Set(MONSTER_PROFILE_SOURCES);

// { source, ref?, multiattack? }, or null: null removes it (a card that is no longer a monster's), like the species.
// ref: the monster the stat block came from, "name|source" in 5eTools (fase 2, lotto 3).
export function sanitizeMonsterProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = sourceSet.has(value.source) ? value.source : "manual";
  const ref = String(value.ref ?? "").trim().slice(0, MAX_MONSTER_REF);
  const multiattack = String(value.multiattack ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_MONSTER_MULTIATTACK);
  return { source, ...(ref ? { ref } : {}), ...(multiattack ? { multiattack } : {}) };
}

export function isMonsterProfileCard(card) {
  return !!sanitizeMonsterProfile(card?.[MONSTER_PROFILE_FIELD]);
}
