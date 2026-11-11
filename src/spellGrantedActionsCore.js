// CAP-ORIGIN: the actions a spell gives the creature that carries its pill, used in that creature's attack console.
// Lotto O3: Dragon's Breath, breathed by the creature touched with its own action (decision D1: the console of who has
// the action, as a dragonborn's breath). Built on the fly from the spell records on the token, in the shape of a
// monster's save action (quickActionsCore.js): its own DC (the caster's, written at the cast), its area from the token,
// half on a passed save. Nothing is stored on the card: the action goes with the pill, when the concentration ends.
// No imports beyond the constants: the catalog (spells-srd.js) and the console read it.
import { ID } from "./constants.js";

export const SPELL_GRANT_ACTION_PREFIX = "spell-grant:";
export const DRAGON_BREATH_SPELL_ID = "xanathar-soffio-del-drago";

// The five energies of the text, in its order: the id is the damage type of the console, the label the Italian word.
export const DRAGON_BREATH_TYPES = Object.freeze([
  Object.freeze({ id: "acid", label: "acido" }),
  Object.freeze({ id: "cold", label: "freddo" }),
  Object.freeze({ id: "fire", label: "fuoco" }),
  Object.freeze({ id: "lightning", label: "fulmine" }),
  Object.freeze({ id: "poison", label: "veleno" }),
]);

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

const text = (value) => String(value ?? "").trim();

export function spellGrantActionId(instanceId) {
  const id = text(instanceId);
  return id ? `${SPELL_GRANT_ACTION_PREFIX}${id}` : "";
}

export function isSpellGrantActionId(actionId) {
  return text(actionId).startsWith(SPELL_GRANT_ACTION_PREFIX);
}

export function spellGrantInstanceId(actionId) {
  return isSpellGrantActionId(actionId) ? text(actionId).slice(SPELL_GRANT_ACTION_PREFIX.length) : "";
}

// 3d6, and 1d6 more for each slot above the 2nd.
export function dragonBreathDice(slotLevel) {
  const slot = Math.max(2, Math.min(9, Math.floor(Number(slotLevel)) || 2));
  return `${3 + slot - 2}d6`;
}

function dragonBreathAction(record) {
  const instanceId = text(record?.instanceId);
  const context = record?.castContext && typeof record.castContext === "object" ? record.castContext : {};
  const type = DRAGON_BREATH_TYPES.find((entry) => entry.id === text(context.choice)) || null;
  const saveDC = Number(context.spellSaveDC);
  // Without the caster's DC the console cannot ask the save: the breath stays at the table, as before.
  if (!instanceId || !type || !Number.isInteger(saveDC) || saveDC < 1 || saveDC > 30) return null;
  return {
    id: spellGrantActionId(instanceId),
    label: `Soffio del Drago (${type.label})`,
    kind: "attack",
    targetMode: "selection",
    range: "ranged",
    components: [{ type: type.id, formula: dragonBreathDice(context.slotLevel) }],
    save: "dex",
    saveDC,
    saveHalf: true,
    // No note: the console shows a monster's note as "Da risolvere al tavolo", and here nothing is left to the table.
    area: { shape: "cone", sizeFeet: 15, origin: "self" },
  };
}

function grantedAction(record) {
  if (text(record?.spellId) === DRAGON_BREATH_SPELL_ID) return dragonBreathAction(record);
  return null;
}

// The actions this token's pills grant, one per spell record (a raw quick action: the console sanitizes it).
export function spellGrantedActionsForItem(item) {
  const records = item?.metadata?.[META_KEY]?.[SPELLS_KEY];
  const seen = new Set();
  return (Array.isArray(records) ? records : []).map(grantedAction).filter((action) => {
    if (!action || seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

export function spellGrantedActionForItem(item, actionId) {
  const id = text(actionId);
  return id ? spellGrantedActionsForItem(item).find((action) => action.id === id) || null : null;
}
