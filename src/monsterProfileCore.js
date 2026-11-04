import { normalizeSpeedMeters } from "./speedCheckCore.js";

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
export const MONSTER_PROFILE_STATBLOCK_FIELDS = Object.freeze(["conditionImmunities", "evasion", "speeds", "hover"]);
// Its speeds beyond walking, which stays the card's speed (velocità dei mostri, lotto 1).
export const MONSTER_SPEED_MODES = Object.freeze(["fly", "swim", "climb", "burrow"]);
const MONSTER_SPEED_LABELS = Object.freeze({ fly: "Volare", swim: "Nuotare", climb: "Scalare", burrow: "Scavare" });

export function sanitizeMonsterProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = sourceSet.has(value.source) ? value.source : "manual";
  const ref = String(value.ref ?? "").trim().slice(0, MAX_MONSTER_REF);
  const multiattack = String(value.multiattack ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_MONSTER_MULTIATTACK);
  // From its stat block (fase 5, lotto 2, decision D3): the conditions it is immune to, as the plugin names them
  // ("spaventato"), for the console's «Immune»; Evasion, for a Dexterity save that halves.
  const conditionImmunities = [...new Set((Array.isArray(value.conditionImmunities) ? value.conditionImmunities : [])
    .map((name) => String(name ?? "").trim().toLocaleLowerCase("it").slice(0, MAX_MONSTER_CONDITION_NAME)).filter(Boolean))].slice(0, MAX_MONSTER_CONDITION_IMMUNITIES);
  // { fly: 24, swim: 12 } in metres; hover only with a flying speed.
  const speeds = Object.fromEntries(MONSTER_SPEED_MODES.map((mode) => [mode, normalizeSpeedMeters(value.speeds?.[mode])]).filter(([, meters]) => meters > 0));
  return { source, ...(ref ? { ref } : {}), ...(multiattack ? { multiattack } : {}),
    ...(conditionImmunities.length ? { conditionImmunities } : {}), ...(value.evasion === true ? { evasion: true } : {}),
    ...(Object.keys(speeds).length ? { speeds } : {}), ...(value.hover === true && speeds.fly ? { hover: true } : {}) };
}

// "Volare 24 m (stazionario) · Nuotare 12 m", "" without other speeds.
export function monsterSpeedsText(profile) {
  const clean = sanitizeMonsterProfile(profile);
  return MONSTER_SPEED_MODES.filter((mode) => clean?.speeds?.[mode])
    .map((mode) => `${MONSTER_SPEED_LABELS[mode]} ${String(clean.speeds[mode]).replace(".", ",")} m${mode === "fly" && clean.hover ? " (stazionario)" : ""}`)
    .join(" · ");
}

// The stat block's speeds as a passive movement effect, the form in which the engine already takes a mode from a spell
// or a class feature: conditions and spells apply to them and nothing else has to know about monsters (velocità dei
// mostri, lotto 2). A creature that does not walk has no walking mode at all: left at 0 m it would be the active mode of
// a banshee, and its every move rejected. null without other speeds.
export function monsterSpeedsMovementInstance(card, baseSpeedMeters = card?.speed) {
  const speeds = card?.[MONSTER_PROFILE_FIELD]?.speeds;
  const modes = {};
  for (const mode of MONSTER_SPEED_MODES) {
    const meters = Number(speeds?.[mode]);
    if (meters > 0) modes[mode] = { grantMeters: meters };
  }
  if (!Object.keys(modes).length) return null;
  return {
    id: "monster-statblock-speeds",
    effectId: "monster-statblock-speeds",
    condition: "Velocità dello statblock",
    active: true,
    mechanics: { movement: { modes, ...(Number(baseSpeedMeters) > 0 ? {} : { suppressModes: ["walk"] }) } },
  };
}

export function isMonsterProfileCard(card) {
  return !!sanitizeMonsterProfile(card?.[MONSTER_PROFILE_FIELD]);
}
