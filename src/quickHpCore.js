export const QUICK_HP_MODES = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  TEMP: "temp",
});

export const QUICK_HP_FACTORS = Object.freeze({
  FULL: "full",
  HALF: "half",
  QUARTER: "quarter",
  DOUBLE: "double",
});

const FACTOR_VALUES = Object.freeze({
  [QUICK_HP_FACTORS.FULL]: 1,
  [QUICK_HP_FACTORS.HALF]: 0.5,
  [QUICK_HP_FACTORS.QUARTER]: 0.25,
  [QUICK_HP_FACTORS.DOUBLE]: 2,
});

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function scaledQuickHPAmount(value, factor = QUICK_HP_FACTORS.FULL) {
  const multiplier = FACTOR_VALUES[factor] ?? FACTOR_VALUES[QUICK_HP_FACTORS.FULL];
  return Math.floor(nonNegativeInteger(value) * multiplier);
}

export function calculateQuickHPChange({
  mode = QUICK_HP_MODES.DAMAGE,
  value = 0,
  factor = QUICK_HP_FACTORS.FULL,
  hp = 0,
  hpMax = 0,
} = {}) {
  const beforeHP = nonNegativeInteger(hp);
  const maxHP = nonNegativeInteger(hpMax);
  const requested = scaledQuickHPAmount(value, factor);
  let afterHP = beforeHP;

  if (mode === QUICK_HP_MODES.HEAL) {
    afterHP = beforeHP > maxHP
      ? beforeHP
      : Math.min(maxHP, beforeHP + requested);
  } else if (mode === QUICK_HP_MODES.TEMP) {
    const baseHP = Math.min(beforeHP, maxHP);
    const existingTempHP = Math.max(0, beforeHP - maxHP);
    afterHP = baseHP + Math.max(existingTempHP, requested);
  } else {
    afterHP = Math.max(0, beforeHP - requested);
  }

  const delta = afterHP - beforeHP;
  return {
    mode,
    factor: FACTOR_VALUES[factor] == null ? QUICK_HP_FACTORS.FULL : factor,
    hp: beforeHP,
    hpMax: maxHP,
    requested,
    afterHP,
    delta,
    changed: delta !== 0,
  };
}
