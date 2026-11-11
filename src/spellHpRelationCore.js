import { calculateQuickHPChange, QUICK_HP_FACTORS, QUICK_HP_MODES } from "./quickHpCore.js";

// CAP-RELATION (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md): hit points that go from one creature to another in the same cast.
// Life Transference (Xanathar): the caster takes the necrotic roll and the creature it chooses regains twice the damage
// taken. The owner's decisions of 11/11/2026: nothing reduces that damage (R-D1: no resistance, immunity or reaction,
// as the English text says); temporary hit points absorb it as any damage and the healing counts all of it, the part
// beyond 0 included (R-D2); the caster cannot choose itself (R-D3).
export const LIFE_TRANSFERENCE_SPELL_ID = "xanathar-trasferimento-di-vita";

const SPELL_HP_RELATION_RULES = Object.freeze({
  [LIFE_TRANSFERENCE_SPELL_ID]: Object.freeze({ ratio: 2, unreducible: true, damageType: "necrotici" }),
});

export function spellHpRelationRule(spellId) {
  return SPELL_HP_RELATION_RULES[String(spellId || "").trim()] || null;
}

// The healing the target regains for the damage the caster took (its whole roll: temporary hit points and the part
// beyond 0 are damage taken too).
export function spellHpRelationHealing(spellId, casterChange) {
  const rule = spellHpRelationRule(spellId);
  if (!rule) return 0;
  return Math.max(0, Math.floor(Number(casterChange?.requested) || 0)) * rule.ratio;
}

// The two changes of the cast, as the panel's preview and the commit count them: the caster's damage, the full roll,
// then the target's healing. caster/target: { hp, hpMax, tempHp }. null for a spell without a relation.
export function spellHpRelationChanges({
  spellId = "",
  amount = 0,
  caster = {},
  target = null,
  deathSaveDamage = false,
} = {}) {
  const rule = spellHpRelationRule(spellId);
  if (!rule) return null;
  const roll = Math.max(0, Math.floor(Number(amount) || 0));
  const casterChange = calculateQuickHPChange({
    mode: QUICK_HP_MODES.DAMAGE,
    value: roll,
    factor: QUICK_HP_FACTORS.FULL,
    hp: caster?.hp,
    hpMax: caster?.hpMax,
    tempHp: caster?.tempHp,
    deathSaveDamage,
  });
  const healing = spellHpRelationHealing(spellId, casterChange);
  const targetChange = target
    ? calculateQuickHPChange({
      mode: QUICK_HP_MODES.HEAL,
      value: healing,
      factor: QUICK_HP_FACTORS.FULL,
      hp: target.hp,
      hpMax: target.hpMax,
      tempHp: target.tempHp,
    })
    : null;
  return { rule, roll, healing, casterChange, targetChange };
}
