// CAP-TEMP, lotto T3b (texts 2014: PHB, Xanathar): the temporary hit points a spell gives when it is cast, in the same
// command as its pill. base and perSlotAbove (from baseSlot) make the amount; with die, the roll entered at the table is
// added. effectId: the pill whose end takes the ones left (their source, lotto T3a); none when they outlast the spell.
const SPELL_CAST_TEMPORARY_HP = Object.freeze({
  // False Life: 1d4 + 4 for the duration, 5 more for each slot level above the 1st.
  "false-life": Object.freeze({ die: "1d4", base: 4, baseSlot: 1, perSlotAbove: 5, effectId: "false-life-temporary-hit-points" }),
  // Armor of Agathys: 5 for the duration, 5 more for each slot level above the 1st; its pill ends with them.
  "phb2014-armatura-di-agathys": Object.freeze({ base: 5, baseSlot: 1, perSlotAbove: 5, effectId: "agathys-armor" }),
  // Tenser's Transformation: 50, which its text does not tie to the duration (decision D3): they stay after it.
  "xanathar-trasformazione-di-tenser": Object.freeze({ base: 50, effectId: "" }),
});

export function spellCastTemporaryHpRule(spellId) {
  return SPELL_CAST_TEMPORARY_HP[String(spellId || "").trim()] || null;
}

export function spellCastTemporaryHpDie(spellId) {
  return spellCastTemporaryHpRule(spellId)?.die || "";
}

// The amount for a slot level (and the die's roll, 1 to its faces), or null when the roll is missing or outside it.
export function spellCastTemporaryHpAmount(rule, { slotLevel = null, roll = null } = {}) {
  if (!rule) return null;
  const level = Number.isInteger(Number(slotLevel)) ? Number(slotLevel) : Number(rule.baseSlot) || 0;
  const above = Math.max(0, level - (Number(rule.baseSlot) || 0));
  const fixed = Math.max(0, Math.floor(Number(rule.base) || 0)) + above * Math.max(0, Math.floor(Number(rule.perSlotAbove) || 0));
  if (!rule.die) return fixed;
  const faces = Number(String(rule.die).match(/^1d(\d+)$/u)?.[1]) || 0;
  const value = Number(roll);
  if (!faces || !Number.isInteger(value) || value < 1 || value > faces) return null;
  return fixed + value;
}

// The panel's line for the roll: what the plugin adds to it at this slot level.
export function spellCastTemporaryHpHint(rule, slotLevel = null) {
  if (!rule?.die) return "";
  const added = spellCastTemporaryHpAmount({ ...rule, die: "" }, { slotLevel });
  return `Tira ${rule.die}: il plugin aggiunge ${added} (PF temporanei = tiro + ${added}).`;
}
