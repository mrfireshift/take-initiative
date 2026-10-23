import { ID } from "./constants.js";
import { planReactionSpend } from "./reactionTrackerCore.js";

// The spells cast with a reaction (PHB 2014, Xanathar): their cast spends the caster's reaction, the same "Reazione
// usata" the tracker card shows (reactionTrackerCore.js), in the cast's own command, so one Undo gives both back.
// The list follows the casting time of the reference texts (test/spellReactionCore.test.js checks it).
export const REACTION_SPELL_IDS = Object.freeze([
  "shield",
  "xanathar-assorbire-elementi",
  "hellish-rebuke",
  "feather-fall",
  "counterspell",
  "xanathar-gabbia-dellanima",
]);
const REACTION_SPELL_ID_SET = new Set(REACTION_SPELL_IDS);
const META_KEY = `${ID}/meta`;

export function isReactionSpell(spellId) {
  return REACTION_SPELL_ID_SET.has(String(spellId || "").trim());
}

// What the cast spends of the caster's reaction. Only in combat: without an initiative order there is no turn for the
// reaction to come back at. alreadyUsed: the GM confirms before casting anyway, and nothing more is spent.
export function planSpellReactionSpend({ spellId = "", caster = null, initiativeState = null } = {}) {
  return planReactionSpend({
    applies: isReactionSpell(spellId),
    casterId: caster?.id,
    casterName: caster?.name,
    conditions: caster?.metadata?.[META_KEY]?.conditions,
    initiativeState,
  });
}
