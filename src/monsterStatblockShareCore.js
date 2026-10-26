// A monster's stat block as a whole (attacchi dei mostri, fase 4, lotto 1). Pure.
// - Importing a monster's stat block replaces the one the card had: a section the new block has and the GM keeps
//   ticked is replaced, a section the new block does not have is emptied, a section the GM unticks stays as it is.
// - Tokens with the same name carry the same stat block (the user's rule, 26/10/2026): saving a monster's card copies
//   its stat block to the other creatures with that name, never their own state (hit points, conditions, uses).
import { ID } from "./constants.js";
import { DAMAGE_DEFENSES_FIELD } from "./damageDefensesCore.js";
import { ABILITY_MODIFIERS_FIELD } from "./abilityModifiersCore.js";
import { SPELLBOOK_FIELD } from "./spellbookCore.js";
import { MONSTER_PROFILE_FIELD, isMonsterProfileCard } from "./monsterProfileCore.js";
import { monsterNamesakes } from "./monsterHitPointsImportCore.js";

const META_KEY = `${ID}/meta`;

// The import's sections that make a monster's stat block (characterSheetImportCore.js ids). The class, the book and the
// innate spells come from its spellcasting (lotto 4): a block without spells leaves none of the previous ones.
export const MONSTER_STATBLOCK_SECTIONS = Object.freeze(["classes", "stats", "abilities", "saves", "defenses", "spells", "innate", "attacks",
  "multiattack", "notes"]);

// The sections to empty before a monster's block is applied: the ones it replaces (ticked) and the ones it lacks.
export function monsterStatblockSectionsToClear({ sections = {}, chosen = [] } = {}) {
  const ticked = new Set(chosen);
  return MONSTER_STATBLOCK_SECTIONS.filter((id) => sections[id] === undefined || ticked.has(id));
}

// The card's fields that are the monster's stat block: what the namesakes get. Never the token's own state: exhaustion,
// the actor's identity, the boss binding, the class features' state (uses, recharge) that lives outside the card.
export const MONSTER_STATBLOCK_FIELDS = Object.freeze([
  "armorClass", "passivePerception", "speed", "spellSaveDC", "spellAttackBonus", "notes", "quickActions", "savingThrows",
  "characterBuild", "enabledClassFeatureIds", "classFeaturesConfigured",
  ABILITY_MODIFIERS_FIELD, DAMAGE_DEFENSES_FIELD, SPELLBOOK_FIELD, MONSTER_PROFILE_FIELD,
]);

export function monsterStatblockOf(card) {
  const source = card && typeof card === "object" ? card : {};
  return Object.fromEntries(MONSTER_STATBLOCK_FIELDS.filter((field) => Object.hasOwn(source, field)).map((field) => [field, structuredClone(source[field])]));
}

// The tokens that get the stat block of a monster's card: the other creatures with its name, never a character (its
// sheet is its own). [] for a card that is not a monster's.
export function monsterStatblockTargets(items = [], sourceId = "", card = null) {
  if (!isMonsterProfileCard(card)) return [];
  return monsterNamesakes(items, sourceId).filter((item) => String(item.metadata?.[META_KEY]?.attitude || "").trim().toLowerCase() !== "pc");
}

// Whether a namesake already carries this stat block (nothing to write).
export function sameMonsterStatblock(left, right) {
  return JSON.stringify(monsterStatblockOf(left)) === JSON.stringify(monsterStatblockOf(right));
}
