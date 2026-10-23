import { ID } from "./constants.js";
import {
  hasReactionUsed,
  reactionConditionOptions,
  REACTION_USED_CONDITION,
} from "./reactionTrackerCore.js";

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
  const casterId = String(caster?.id || "").trim();
  const order = Array.isArray(initiativeState?.order) ? initiativeState.order.filter(Boolean) : [];
  if (!isReactionSpell(spellId) || !casterId || !order.length) {
    return { applies: false, alreadyUsed: false, operations: [], message: "" };
  }
  const name = String(caster?.name || "Il caster").trim() || "Il caster";
  if (hasReactionUsed(caster?.metadata?.[META_KEY]?.conditions)) {
    return {
      applies: true,
      alreadyUsed: true,
      operations: [],
      message: `${name} ha già usato la reazione in questo round.`,
    };
  }
  return {
    applies: true,
    alreadyUsed: false,
    operations: [
      {
        type: "condition:add",
        targetIds: [casterId],
        conditionName: REACTION_USED_CONDITION,
        options: reactionConditionOptions(initiativeState),
      },
      { type: "condition:automate", subjectIds: [casterId] },
    ],
    message: "",
  };
}
