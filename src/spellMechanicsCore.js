import { effectSummaryPartsFor } from "./effectLabelCore.js";

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function scaledNumber(value, castContext = {}) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (!value || typeof value !== "object") return null;
  const base = Number(value.base);
  if (!Number.isFinite(base)) return null;
  const baseSlot = Math.max(0, Number(value.baseSlot) || 0);
  const slotLevel = Math.max(baseSlot, Number(castContext?.slotLevel) || baseSlot);
  const perSlot = Number(value.perSlotAbove) || 0;
  const step = Math.max(1, Math.floor(Number(value.step) || 1));
  const firstIncrementAtValue = Number(value.firstIncrementAt);
  const firstIncrementAt = Number.isFinite(firstIncrementAtValue)
    ? Math.max(baseSlot, firstIncrementAtValue)
    : null;
  const increments = firstIncrementAt === null
    ? Math.floor(Math.max(0, slotLevel - baseSlot) / step)
    : slotLevel < firstIncrementAt
      ? 0
      : 1 + Math.floor((slotLevel - firstIncrementAt) / step);
  const resolved = base + increments * perSlot;
  const maximum = Number(value.max);
  return Number.isFinite(maximum) ? Math.min(maximum, resolved) : resolved;
}

function scaledDice(value, castContext = {}) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const sides = Math.max(0, Math.floor(Number(value.sides) || 0));
  const count = scaledNumber(value.count, castContext);
  if (!sides || !Number.isFinite(count) || count <= 0) return "";
  return `${Math.floor(count)}d${sides}`;
}

export function resolveSpellMechanics(value, castContext = {}) {
  if (!value || typeof value !== "object") return null;
  const mechanics = clone(value);
  for (const path of [
    ["attackRoll", "bonus"],
    ["armorClass", "bonus"],
    ["abilityCheck", "bonus"],
    ["tempHp", "amount"],
    ["retaliationDamage", "amount"],
    ["weaponBonus", "bonus"],
  ]) {
    const [group, field] = path;
    if (!mechanics[group] || mechanics[group][field] === undefined) continue;
    const resolved = scaledNumber(mechanics[group][field], castContext);
    if (resolved != null) mechanics[group][field] = resolved;
  }
  for (const group of ["damageBonus", "areaDamage", "damageReplacement", "ongoingDamage"]) {
    if (mechanics[group]?.dice === undefined) continue;
    const dice = scaledDice(mechanics[group].dice, castContext);
    if (dice) mechanics[group].dice = dice;
  }
  return mechanics;
}

function signedDice(value) {
  const dice = String(value || "").trim();
  if (!dice) return "";
  return /^[+-]/u.test(dice) ? dice : `+${dice}`;
}

export function spellMechanicsLabel(mechanics, fallback = "", effectId = "") {
  if (!mechanics || mechanics.deriveLabel !== true) return String(fallback || "").trim();
  const parts = [];
  const attackDice = signedDice(mechanics.attackRoll?.modifierDice);
  const saveDice = signedDice(mechanics.savingThrow?.modifierDice);
  if (attackDice && attackDice === saveDice) {
    parts.push(`${attackDice} Att/TS`);
  } else {
    if (attackDice) parts.push(`${attackDice} Att`);
    if (saveDice) parts.push(`${saveDice} TS`);
  }
  const abilityDice = signedDice(mechanics.abilityCheck?.modifierDice);
  if (abilityDice) parts.push(`${abilityDice} prova`);
  if (Number.isFinite(Number(mechanics.attackRoll?.bonus))) {
    parts.push(`+${Number(mechanics.attackRoll.bonus)} Att`);
  }
  if (Number.isFinite(Number(mechanics.abilityCheck?.bonus))) {
    const skill = String(mechanics.abilityCheck?.skill || "prove").trim();
    parts.push(`+${Number(mechanics.abilityCheck.bonus)} ${skill}`);
  }
  if (Number.isFinite(Number(mechanics.armorClass?.bonus))) {
    parts.push(`+${Number(mechanics.armorClass.bonus)} CA`);
  }
  if (Number.isFinite(Number(mechanics.weaponBonus?.bonus))) {
    const label = String(mechanics.weaponBonus?.label || "Bonus arma").trim();
    parts.push(`${label} · +${Number(mechanics.weaponBonus.bonus)}`);
  }
  if (mechanics.damageBonus?.dice) {
    const type = String(mechanics.damageBonus.type || "danni").trim();
    const source = mechanics.damageBonus.sourceOnly === true ? " dal caster" : "";
    const prefix = mechanics.damageBonus.total === true ? "" : "+";
    const context = effectId.startsWith("next-melee-hit-")
      ? " in mischia"
      : effectId.startsWith("spirit-shroud-")
        ? " entro 3m"
        : "";
    parts.push(`${prefix}${mechanics.damageBonus.dice} ${type}${source}${context}`);
  }
  const areaDamageDice = String(mechanics.areaDamage?.dice || "").trim();
  const areaDamageType = String(mechanics.areaDamage?.type || "perforanti").trim();
  const replacementDamageDice = String(mechanics.damageReplacement?.dice || "").trim();
  const replacementDamageType = String(mechanics.damageReplacement?.type || "fulmine").trim();
  if (effectId === "hail-of-thorns-trigger" && areaDamageDice) {
    parts.push(`Prossimo attacco a distanza / area ${areaDamageDice} ${areaDamageType}`);
  }
  if (effectId === "lightning-arrow-trigger" && replacementDamageDice && areaDamageDice) {
    parts.push(`Prossimo attacco a distanza / ${replacementDamageDice} / area ${areaDamageDice} ${replacementDamageType}`);
  }
  if (Number.isFinite(Number(mechanics.tempHp?.amount))) {
    parts.push(`${Number(mechanics.tempHp.amount)} PF temp.`);
  }
  if (Number.isFinite(Number(mechanics.retaliationDamage?.amount))) {
    const type = String(mechanics.retaliationDamage.type || "danni").trim();
    parts.push(`${Number(mechanics.retaliationDamage.amount)} ${type} a chi colpisce in mischia`);
  }
  return parts.length ? parts.join(" / ") : String(fallback || "").trim();
}

export function resolveSpellEffect(effect, castContext = {}) {
  const mechanics = resolveSpellMechanics(effect?.mechanics, castContext);
  return {
    ...(effect || {}),
    ...(mechanics ? { mechanics } : {}),
    ...(Array.isArray(effect?.summaryParts)
      ? { summaryParts: effectSummaryPartsFor({ ...effect, mechanics }) }
      : {}),
    label: spellMechanicsLabel(mechanics, effect?.label, effect?.id),
  };
}
