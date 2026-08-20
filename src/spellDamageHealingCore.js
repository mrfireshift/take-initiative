import {
  calculateQuickHPChange,
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
} from "./quickHpCore.js";

export function spellCasterHealingAmount(appliedDamage = 0, ratio = 0) {
  const damage = Math.max(0, Math.floor(Number(appliedDamage) || 0));
  const multiplier = Number(ratio);
  if (!Number.isFinite(multiplier) || multiplier <= 0 || damage <= 0) return 0;
  return Math.max(0, Math.floor(damage * multiplier));
}

export function spellCasterHealingChange({
  damageChanges = [],
  ratio = 0,
  hp = 0,
  hpMax = 0,
} = {}) {
  const appliedDamage = (Array.isArray(damageChanges) ? damageChanges : []).reduce((total, change) => {
    const requested = Number(change?.requested);
    if (Number.isFinite(requested)) return total + Math.max(0, requested);
    const before = Number(change?.hp);
    const after = Number(change?.afterHP);
    return total + (Number.isFinite(before) && Number.isFinite(after)
      ? Math.max(0, before - after)
      : 0);
  }, 0);
  const healing = spellCasterHealingAmount(appliedDamage, ratio);
  return calculateQuickHPChange({
    mode: QUICK_HP_MODES.HEAL,
    value: healing,
    factor: QUICK_HP_FACTORS.FULL,
    hp,
    hpMax,
  });
}
