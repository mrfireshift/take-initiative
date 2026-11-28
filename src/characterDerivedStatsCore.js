// The sheet's spell save DC, spell attack bonus and saving throws, computed from the class tables (PHB 2014), never typed
// (28/11, decisions of the user: the base is always automatic, the bonuses the tables do not know, a magic item's, go in
// «Altri bonus»; a multiclass character casts with the spellcasting class of most levels).
// - Proficiency bonus: from the total level, +2 at levels 1-4 up to +6 at 17-20 (proficiencyBonusForLevel).
// - Saving throws: the ability modifier, plus the proficiency bonus in the saves of the first class on the sheet (the
//   saves of a multiclass character are its first class's), Resilient's ability, Diamond Soul (monk 14: all) and
//   Slippery Mind (rogue 15: Wisdom); plus «Altri bonus» on every save.
// - Spell save DC 8 + proficiency + the spellcasting modifier, spell attack proficiency + the modifier: of the class with
//   spellcasting at its level (a paladin or a ranger from level 2, an Eldritch Knight or an Arcane Trickster from 3); plus
//   «Altri bonus».
// A value it cannot compute (no level, no modifier, no spellcasting class) stays as the sheet has it, typed or imported.
// A monster's sheet keeps its stat block's values.
import { ABILITY_MODIFIERS_FIELD, abilityModifier, proficiencyBonusForLevel, totalCharacterLevel } from "./abilityModifiersCore.js";
import { FEATS_FIELD, sanitizeFeats } from "./featCatalog.js";
import { MONSTER_PROFILE_FIELD } from "./monsterProfileCore.js";

export const OTHER_BONUSES_FIELD = "otherBonuses";
const SAVE_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const OTHER_BONUS_KEYS = ["spellSaveDC", "spellAttackBonus", "savingThrows"];

export const CLASS_SAVE_PROFICIENCIES = Object.freeze({
  barbaro: ["str", "con"], bardo: ["dex", "cha"], chierico: ["wis", "cha"], druido: ["int", "wis"],
  guerriero: ["str", "con"], ladro: ["dex", "int"], mago: ["int", "wis"], monaco: ["str", "dex"],
  paladino: ["wis", "cha"], ranger: ["str", "dex"], "ranger-revised": ["str", "dex"], stregone: ["con", "cha"],
  warlock: ["wis", "cha"],
});

// [ability, the class level spellcasting starts at, the subclass it needs].
const SPELLCASTING = Object.freeze({
  bardo: ["cha", 1], chierico: ["wis", 1], druido: ["wis", 1], mago: ["int", 1], stregone: ["cha", 1], warlock: ["cha", 1],
  paladino: ["cha", 2], ranger: ["wis", 2], "ranger-revised": ["wis", 2],
  guerriero: ["int", 3, "guerriero-cavaliere-mistico"], ladro: ["int", 3, "ladro-mistificatore-arcano"],
});

const RESILIENT = "resiliente";

function boundedInteger(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : null;
}

// { spellSaveDC, spellAttackBonus, savingThrows }: integers, 0 when not given; the stored object keeps only what is not 0.
export function sanitizeOtherBonuses(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const clean = {};
  for (const key of OTHER_BONUS_KEYS) {
    const bonus = boundedInteger(source[key], -20, 20);
    if (bonus) clean[key] = bonus;
  }
  return clean;
}

function spellcastingClass(characterBuild) {
  let best = null;
  for (const entry of Array.isArray(characterBuild) ? characterBuild : []) {
    const casting = SPELLCASTING[entry?.classId];
    if (!casting) continue;
    const [ability, fromLevel, subclassId] = casting;
    if (Number(entry.level) < fromLevel || (subclassId && entry.subclassId !== subclassId)) continue;
    if (!best || Number(entry.level) > best.level) best = { classId: entry.classId, level: Number(entry.level), ability };
  }
  return best;
}

function proficientSaves(characterBuild, feats) {
  const build = Array.isArray(characterBuild) ? characterBuild : [];
  const saves = new Set(CLASS_SAVE_PROFICIENCIES[build[0]?.classId] || []);
  for (const feat of sanitizeFeats(feats)) if (feat.id === RESILIENT && SAVE_KEYS.includes(feat.ability)) saves.add(feat.ability);
  const levelOf = (classId) => Number(build.find((entry) => entry?.classId === classId)?.level) || 0;
  if (levelOf("monaco") >= 14) SAVE_KEYS.forEach((key) => saves.add(key));
  if (levelOf("ladro") >= 15) saves.add("wis");
  return saves;
}

// What the tables give the sheet: null for a monster's sheet or without a level. Each value null when it cannot be
// computed (its modifier missing, no spellcasting class).
export function derivedCharacterStats(profile) {
  if (!profile || typeof profile !== "object" || profile[MONSTER_PROFILE_FIELD]) return null;
  const proficiency = proficiencyBonusForLevel(totalCharacterLevel(profile.characterBuild));
  if (proficiency === null) return null;
  const modifiers = profile[ABILITY_MODIFIERS_FIELD];
  const other = sanitizeOtherBonuses(profile[OTHER_BONUSES_FIELD]);
  const saves = proficientSaves(profile.characterBuild, profile[FEATS_FIELD]);
  const savingThrows = Object.fromEntries(SAVE_KEYS.map((key) => {
    const modifier = abilityModifier(modifiers, key);
    return [key, modifier === null ? null : modifier + (saves.has(key) ? proficiency : 0) + (other.savingThrows || 0)];
  }));
  const caster = spellcastingClass(profile.characterBuild);
  const castingModifier = caster ? abilityModifier(modifiers, caster.ability) : null;
  return {
    proficiency,
    proficientSaves: SAVE_KEYS.filter((key) => saves.has(key)),
    savingThrows,
    spellcasting: caster && castingModifier !== null ? { classId: caster.classId, ability: caster.ability, modifier: castingModifier } : null,
    spellSaveDC: caster && castingModifier !== null ? 8 + proficiency + castingModifier + (other.spellSaveDC || 0) : null,
    spellAttackBonus: caster && castingModifier !== null ? proficiency + castingModifier + (other.spellAttackBonus || 0) : null,
  };
}

// The profile with the values the tables give in place of the stored ones (the others as they are). Every reader of the
// sheet's DC and saves reads these: the card writes them with the profile (initiativeCards.js).
export function withDerivedCharacterStats(profile) {
  const derived = derivedCharacterStats(profile);
  if (!derived) return profile;
  const savingThrows = { ...(profile.savingThrows || {}) };
  for (const key of SAVE_KEYS) if (derived.savingThrows[key] !== null) savingThrows[key] = derived.savingThrows[key];
  return {
    ...profile,
    ...(derived.spellSaveDC !== null ? { spellSaveDC: Math.min(99, Math.max(0, derived.spellSaveDC)) } : {}),
    ...(derived.spellAttackBonus !== null ? { spellAttackBonus: Math.min(99, Math.max(-99, derived.spellAttackBonus)) } : {}),
    savingThrows,
  };
}
