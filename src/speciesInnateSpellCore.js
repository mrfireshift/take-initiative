// The spells a species casts without a slot (an innate spell: a tiefling's Hellish Rebuke, a githyanki's Misty Step),
// cast from the spell panel: the trait's use is spent in the spell's own command (one Undo gives both back) and the
// save DC is the trait's, 8 + proficiency + its casting ability, not the one of the character's class.
// The trait reaches the panel as the quick action "species-spell:<trait id>", like the breath ("breath:<trait id>").
// Pure: no SDK, DOM or runtime state.
import { abilityModifier, proficiencyBonusForLevel, totalCharacterLevel } from "./abilityModifiersCore.js";
import { classFeatureResourceEntries } from "./classFeatureCore.js";
import {
  SPECIES_FEATURES,
  SPECIES_RESOURCE_POOLS,
  SPECIES_SPELL_ABILITY_FIELD,
  sanitizeSpeciesSpellAbility,
  speciesFeaturesForProfile,
} from "./speciesTraitCore.js";

export const SPECIES_SPELL_ACTION_PREFIX = "species-spell:";

const FEATURE_BY_ID = new Map(SPECIES_FEATURES.filter((feature) => feature.innateSpell).map((feature) => [feature.id, feature]));
const POOL_BY_ID = new Map(SPECIES_RESOURCE_POOLS.map((pool) => [pool.id, pool]));
const ABILITY_LABELS = Object.freeze({ str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma" });
const CHOICE_ABILITIES = Object.freeze(["int", "wis", "cha"]);

export function speciesSpellActionId(featureId) {
  return `${SPECIES_SPELL_ACTION_PREFIX}${String(featureId || "")}`;
}

export function speciesSpellFeatureId(actionId) {
  const value = String(actionId || "");
  return value.startsWith(SPECIES_SPELL_ACTION_PREFIX) ? value.slice(SPECIES_SPELL_ACTION_PREFIX.length) : "";
}

export function getSpeciesSpellFeature(featureId) {
  return FEATURE_BY_ID.get(String(featureId || "")) || null;
}

// The casting ability: the trait's, or for "a scelta" the one stored on the card, else the highest of Intelligence,
// Wisdom and Charisma (the first of them on a tie).
export function speciesSpellAbility(feature, card = {}) {
  return speciesChosenAbility(feature?.innateSpell?.ability, card);
}

// An ability of the species: itself, or for "choice" the card's speciesSpellAbility, else the highest of Int, Wis, Cha.
function speciesChosenAbility(ability, card = {}) {
  if (!ability) return "";
  if (ability !== "choice") return ability;
  const chosen = sanitizeSpeciesSpellAbility(card?.[SPECIES_SPELL_ABILITY_FIELD]);
  if (chosen) return chosen;
  return CHOICE_ABILITIES.reduce((best, key) => {
    const value = abilityModifier(card?.abilityModifiers, key);
    const bestValue = abilityModifier(card?.abilityModifiers, best);
    return value !== null && (bestValue === null || value > bestValue) ? key : best;
  }, CHOICE_ABILITIES[0]);
}

// 8 + proficiency + the casting ability's modifier; null without the level or the modifier on the card.
export function speciesSpellSaveDC(feature, card = {}) {
  const proficiency = proficiencyBonusForLevel(totalCharacterLevel(card?.characterBuild));
  const modifier = abilityModifier(card?.abilityModifiers, speciesSpellAbility(feature, card));
  return proficiency === null || modifier === null ? null : 8 + proficiency + modifier;
}

// The save a species trait forces (speciesSave: Daunting Roar, Taunt): { ability, abilityLabel, dc, dcAbility, label },
// or null. The DC is 8 + proficiency + the modifier of its ability ("choice": as for the innate spells).
export function speciesTraitSave(feature, card = {}) {
  const save = feature?.speciesSave;
  if (!save) return null;
  const dcAbility = speciesChosenAbility(save.dc, card);
  const proficiency = proficiencyBonusForLevel(totalCharacterLevel(card?.characterBuild));
  const modifier = abilityModifier(card?.abilityModifiers, dcAbility);
  const dc = proficiency === null || modifier === null ? null : 8 + proficiency + modifier;
  return { ability: save.ability, abilityLabel: ABILITY_LABELS[save.ability] || "", dc, dcAbility,
    label: `TS ${ABILITY_LABELS[save.ability] || ""}${dc !== null ? ` CD ${dc} (${ABILITY_LABELS[dcAbility]})` : ""}` };
}

// The trait's use: { pool, current, maximum, unlimited }, or null.
export function speciesSpellUses(feature, card = {}, resources = {}) {
  const [entry] = classFeatureResourceEntries({ version: 1, resources: resources || {}, instances: [] }, [feature], POOL_BY_ID,
    card?.characterBuild, card?.abilityModifiers);
  return entry ? { pool: entry.pool, current: entry.current, maximum: entry.maximum, unlimited: entry.unlimited === true } : null;
}

/**
 * The innate spell a quick action id names, for this character and this spell: the trait (available for the card's
 * species, option and level), its ability, DC and uses, and the panel's line. null when the id is not a species spell,
 * the trait is not the character's, or the spell is another.
 */
export function speciesSpellCast({ actionId = "", card = {}, resources = {}, spellId = "" } = {}) {
  const feature = getSpeciesSpellFeature(speciesSpellFeatureId(actionId));
  if (!feature) return null;
  if (spellId && feature.innateSpell.spellId !== spellId) return null;
  const level = totalCharacterLevel(card?.characterBuild);
  if (!speciesFeaturesForProfile(card, level).some((entry) => entry.id === feature.id)) return null;
  const ability = speciesSpellAbility(feature, card);
  const dc = speciesSpellSaveDC(feature, card);
  const uses = speciesSpellUses(feature, card, resources);
  const usesText = uses && !uses.unlimited && uses.current !== null && uses.maximum !== null ? ` · usi ${uses.current}/${uses.maximum}` : "";
  return {
    feature,
    spellId: feature.innateSpell.spellId,
    slotLevel: feature.innateSpell.slotLevel,
    self: feature.innateSpell.self,
    ability,
    abilityLabel: ABILITY_LABELS[ability] || "",
    dc,
    uses,
    label: `Incantesimo di specie: ${feature.name}${dc !== null ? ` · CD ${dc} (${ABILITY_LABELS[ability]})` : ""}${usesText}`,
  };
}

/**
 * The cost of the cast: one use of the trait, spent in the spell's command as the quick actions' own uses are
 * (spellSlotSpendCore.js). Returns { operation, spent, exhausted, message, slotLevel } like planSpellCastCost.
 */
export function planSpeciesSpellCost({ cast, sourceId = "", card = {}, phase = "cast" } = {}) {
  const nothing = { operation: null, spent: "", exhausted: false, message: "", slotLevel: null };
  const castPhase = String(phase || "cast").trim().toLowerCase();
  if (!cast?.uses || (castPhase !== "cast" && castPhase !== "prepare")) return nothing;
  const { pool, current, maximum, unlimited } = cast.uses;
  if (!unlimited && current !== null && current < 1) {
    return { ...nothing, exhausted: true, message: `Nessun uso rimasto per ${cast.feature.name} (0/${maximum}).` };
  }
  return {
    ...nothing,
    operation: {
      type: "class-feature:adjust-resource",
      operationId: `species-spell-use:${cast.feature.id}:${Date.now().toString(36)}`,
      sourceId: String(sourceId || "").trim(),
      pool,
      characterBuild: card?.characterBuild,
      abilityModifiers: card?.abilityModifiers || null,
      adjustment: { delta: -1 },
    },
    spent: `uso di ${cast.feature.name}${!unlimited && current !== null ? ` (${current - 1}/${maximum})` : ""}`,
  };
}

// The request that opens the spell panel on the trait's spell (the tracker's panel channel, or openCardSpellsPopup):
// no slot, the level it is cast at, the character as target of a spell cast on itself.
export function speciesSpellOpenRequest(feature, sourceId = "") {
  const id = String(sourceId || "").trim();
  const spell = feature?.innateSpell;
  if (!spell || !id) return null;
  return {
    intent: "spell-cast",
    sourceId: id,
    casterId: id,
    spellId: spell.spellId,
    slotSource: "none",
    ...(spell.slotLevel ? { slotLevel: spell.slotLevel } : {}),
    ...(spell.self ? { targetIds: [id] } : {}),
    quickActionId: speciesSpellActionId(feature.id),
    origin: "quick-action",
  };
}
