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
const MAX_MONSTER_CONDITION_IMMUNITIES = 16;
const MAX_MONSTER_CONDITION_NAME = 40;
// The stat block's own fields of the profile: a new monster's block replaces them, never merges with the old ones.
export const MONSTER_PROFILE_STATBLOCK_FIELDS = Object.freeze(["conditionImmunities", "evasion"]);

export function sanitizeMonsterProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = sourceSet.has(value.source) ? value.source : "manual";
  const ref = String(value.ref ?? "").trim().slice(0, MAX_MONSTER_REF);
  const multiattack = String(value.multiattack ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_MONSTER_MULTIATTACK);
  // From its stat block (fase 5, lotto 2, decision D3): the conditions it is immune to, as the plugin names them
  // ("spaventato"), for the console's «Immune»; Evasion, for a Dexterity save that halves.
  const conditionImmunities = [...new Set((Array.isArray(value.conditionImmunities) ? value.conditionImmunities : [])
    .map((name) => String(name ?? "").trim().toLocaleLowerCase("it").slice(0, MAX_MONSTER_CONDITION_NAME)).filter(Boolean))].slice(0, MAX_MONSTER_CONDITION_IMMUNITIES);
  return { source, ...(ref ? { ref } : {}), ...(multiattack ? { multiattack } : {}),
    ...(conditionImmunities.length ? { conditionImmunities } : {}), ...(value.evasion === true ? { evasion: true } : {}) };
}

export function isMonsterProfileCard(card) {
  return !!sanitizeMonsterProfile(card?.[MONSTER_PROFILE_FIELD]);
}
