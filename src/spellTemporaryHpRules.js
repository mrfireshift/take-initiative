// CAP-TEMP, lotto T3b (texts 2014: PHB, Xanathar): the temporary hit points a spell gives when it is cast, in the same
// command as its pill. base and perSlotAbove (from baseSlot) make the amount; with die, the roll entered at the table is
// added. effectId: the pill whose end takes the ones left (their source, lotto T3a); none when they outlast the spell.
const SPELL_CAST_TEMPORARY_HP = Object.freeze({
  // False Life: 1d4 + 4 for the duration, 5 more for each slot level above the 1st.
  "false-life": Object.freeze({ die: "1d4", base: 4, baseSlot: 1, perSlotAbove: 5, effectId: "false-life-temporary-hit-points" }),
  // Armor of Agathys: 5 for the duration, 5 more for each slot level above the 1st; its pill ends with them.
  "phb2014-armatura-di-agathys": Object.freeze({ base: 5, baseSlot: 1, perSlotAbove: 5, effectId: "agathys-armor" }),
  // Tenser's Transformation: 50, the ones left are lost when the spell ends.
  "xanathar-trasformazione-di-tenser": Object.freeze({ base: 50, effectId: "tensers-transformation" }),
});

// The temporary hit points of one variant of a spell. Enhance Ability, Bear's Endurance: 2d6, lost when the spell ends.
// One roll for all the targets of the cast: the panel has one field.
const SPELL_CAST_TEMPORARY_HP_BY_CHOICE = Object.freeze({
  "enhance-ability": Object.freeze({
    "bears-endurance": Object.freeze({ die: "2d6", base: 0, effectId: "constitution-check-advantage" }),
  }),
  // Guardian of Nature, Great Tree: 10 among the benefits of the form, which lasts as long as the spell.
  "xanathar-guardiano-della-natura": Object.freeze({
    "great-tree": Object.freeze({ base: 10, effectId: "great-tree-benefits" }),
  }),
});

// CAP-TEMP, lotto T3e (Xanathar): Negative Energy Flood on an undead: no save, half the roll as temporary hit points. The
// panel's third outcome says it ("immune" in the command, "Non morto" on its button).
export const SPELL_UNDEAD_TEMPORARY_HP_OUTCOME = "immune";
const SPELL_UNDEAD_TEMPORARY_HP = new Set(["xanathar-flusso-di-energia-negativa"]);

// The temporary hit points of that outcome, rounded down, or null when the spell and the outcome do not give them.
export function spellUndeadTemporaryHpAmount(spellId, outcome, roll) {
  if (!SPELL_UNDEAD_TEMPORARY_HP.has(String(spellId || "").trim()) || outcome !== SPELL_UNDEAD_TEMPORARY_HP_OUTCOME) return null;
  return Math.floor(Math.max(0, Math.floor(Number(roll) || 0)) / 2);
}

// CAP-REPEAT-HEAL (2014): the healing a tracked spell gives when it is cast: its total entered in the panel, with its dice
// as the field's label (Regenerate).
const SPELL_CAST_HEALING_DICE = Object.freeze({ "regenerate": "4d8+15" });

export function spellCastHealingDice(spellId) {
  return SPELL_CAST_HEALING_DICE[String(spellId || "").trim()] || "";
}

export function spellCastTemporaryHpRule(spellId, choiceValue = "") {
  const id = String(spellId || "").trim();
  return SPELL_CAST_TEMPORARY_HP_BY_CHOICE[id]?.[String(choiceValue || "").trim()]
    || SPELL_CAST_TEMPORARY_HP[id]
    || null;
}

export function spellCastTemporaryHpDie(spellId, choiceValue = "") {
  return spellCastTemporaryHpRule(spellId, choiceValue)?.die || "";
}

// What a roll of that die can give: False Life's 1d4 from 1 to 4, Bear's Endurance's 2d6 from 2 to 12.
export function spellCastTemporaryHpRollRange(die = "") {
  const match = String(die).match(/^(\d+)d(\d+)$/u);
  if (!match) return null;
  const count = Number(match[1]);
  const faces = Number(match[2]);
  return count > 0 && faces > 0 ? { min: count, max: count * faces } : null;
}

// The amount for a slot level (and the die's roll, within what the die can give), or null when the roll is missing or outside it.
export function spellCastTemporaryHpAmount(rule, { slotLevel = null, roll = null } = {}) {
  if (!rule) return null;
  const level = Number.isInteger(Number(slotLevel)) ? Number(slotLevel) : Number(rule.baseSlot) || 0;
  const above = Math.max(0, level - (Number(rule.baseSlot) || 0));
  const fixed = Math.max(0, Math.floor(Number(rule.base) || 0)) + above * Math.max(0, Math.floor(Number(rule.perSlotAbove) || 0));
  if (!rule.die) return fixed;
  const range = spellCastTemporaryHpRollRange(rule.die);
  const value = Number(roll);
  if (!range || !Number.isInteger(value) || value < range.min || value > range.max) return null;
  return fixed + value;
}

// The panel's line for the roll: what the plugin adds to it at this slot level.
export function spellCastTemporaryHpHint(rule, slotLevel = null) {
  if (!rule?.die) return "";
  const added = spellCastTemporaryHpAmount({ ...rule, die: "" }, { slotLevel });
  return added > 0
    ? `Tira ${rule.die}: il plugin aggiunge ${added} (PF temporanei = tiro + ${added}).`
    : `Tira ${rule.die}: lo stesso tiro vale per ogni bersaglio.`;
}
