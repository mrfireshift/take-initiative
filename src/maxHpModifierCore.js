// CAP-MAXHP (docs/PIANO_CAP_MAXHP.md, PHB 2014 texts): the part of a creature's hit point maximum that comes from its
// pills. meta.hpMax stays the only maximum (decision M1): a pill that raises or lowers it says by how much in
// mechanics.maxHp = { amount, raisesCurrent, stack }.
// Decision M0 of 13/11/2026: the PC's memory (hpMemory, actorVitals) keeps the creature without these effects, as if
// they ended now, and each token gets them back from its own pills. With no such pill the values stay as they are.

function integer(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? number : 0;
}

function conditionInstances(meta) {
  const value = meta?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}

// What one active pill does to the maximum, or null. stack: the effect it counts as (the spell, unless it says).
export function maxHpModifierOf(instance) {
  if (!instance || typeof instance !== "object" || instance.active === false) return null;
  const raw = instance.mechanics?.maxHp;
  if (!raw || typeof raw !== "object") return null;
  const amount = integer(raw.amount);
  if (!amount) return null;
  const instanceId = String(instance.id || "").trim();
  return {
    amount,
    raisesCurrent: raw.raisesCurrent === true,
    stack: String(raw.stack || instance.spellId || instance.effectId || instanceId).trim() || instanceId,
    instanceId,
  };
}

// Decision M2 (PHB 2014, p. 205): the same spell twice counts once, with its strongest effect; different ones add up.
export function maxHpModifiersFromInstances(instances = []) {
  const byStack = new Map();
  for (const instance of Array.isArray(instances) ? instances : []) {
    const modifier = maxHpModifierOf(instance);
    if (!modifier) continue;
    const current = byStack.get(modifier.stack);
    if (!current || Math.abs(modifier.amount) > Math.abs(current.amount)) byStack.set(modifier.stack, modifier);
  }
  return [...byStack.values()];
}

export function maxHpBonusFromInstances(instances = []) {
  return maxHpModifiersFromInstances(instances).reduce((sum, modifier) => sum + modifier.amount, 0);
}

export function maxHpBonusOf(meta) {
  return maxHpBonusFromInstances(conditionInstances(meta));
}

export function maxHpModifiersOf(meta) {
  return maxHpModifiersFromInstances(conditionInstances(meta));
}

// Decision M0: what the memory keeps of hit points read on a token with these pills: the maximum without their bonus
// (at least 1), the hit points within it. values: numbers the caller has already checked.
export function maxHpBaseValues(values = {}, meta = null) {
  const bonus = maxHpBonusOf(meta);
  if (!bonus) return { hp: values.hp, hpMax: values.hpMax };
  const hpMax = Math.max(1, Math.floor(Number(values.hpMax)) - bonus);
  return { hp: Math.max(0, Math.min(Math.floor(Number(values.hp)), hpMax)), hpMax };
}

// The other way: the hit points a token with these pills gets from base ones (the memory's), its maximum with their
// bonus (at least 1) and the hit points within it.
export function maxHpEffectiveValues(values = {}, meta = null) {
  const bonus = maxHpBonusOf(meta);
  if (!bonus) return { hp: values.hp, hpMax: values.hpMax };
  const hpMax = Math.max(1, Math.floor(Number(values.hpMax)) + bonus);
  return { hp: Math.max(0, Math.min(Math.floor(Number(values.hp)), hpMax)), hpMax };
}

// Lotto X1, decisions M1–M3: what a command does to one creature when its pills change the bonus. state: its hit points
// as the command leaves them, already within the maximum (quickHPStateOf). The maximum moves by the difference, never
// below 1; the hit points go up only with a pill that says so, when it arrives and by what it adds over the one it takes
// the place of (Aid, Heroes' Feast), then stay within the new maximum. null when the bonus does not change.
export function planMaxHpChange({ beforeInstances = [], afterInstances = [], state = {} } = {}) {
  const before = maxHpModifiersFromInstances(beforeInstances);
  const after = maxHpModifiersFromInstances(afterInstances);
  const bonusBefore = before.reduce((sum, modifier) => sum + modifier.amount, 0);
  const bonusAfter = after.reduce((sum, modifier) => sum + modifier.amount, 0);
  if (bonusBefore === bonusAfter) return null;
  const beforeByStack = new Map(before.map((modifier) => [modifier.stack, modifier]));
  let raised = 0;
  for (const modifier of after) {
    if (!modifier.raisesCurrent || modifier.amount <= 0) continue;
    raised += Math.max(0, modifier.amount - Math.max(0, beforeByStack.get(modifier.stack)?.amount || 0));
  }
  const hpMax = Math.max(1, Math.floor(Number(state.hpMax) || 0) + bonusAfter - bonusBefore);
  const hp = Math.max(0, Math.min(Math.floor(Number(state.hp) || 0) + raised, hpMax));
  return { hp, hpMax, bonusBefore, bonusAfter, raised };
}

// The chip of a pill that says its bonus ("PF max +5"): its summary part's id ends this way.
export const MAX_HP_SUMMARY_PART_SUFFIX = "-max-hp";

export function maxHpSummaryLabel(amount) {
  const value = integer(amount);
  return `PF max ${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
}

// A definition that scales with the slot (Aid: base 5 at the 2nd, 5 more for each slot above) gives its pill the amount
// of this cast; its chip says it. A definition with an amount already, or none, comes back as it is.
export function maxHpEffectForCast(effect, slotLevel = null) {
  const raw = effect?.mechanics?.maxHp;
  if (!raw || typeof raw !== "object" || raw.amount !== undefined || raw.base === undefined) return effect;
  const baseSlot = Math.max(0, Math.floor(Number(raw.baseSlot) || 0));
  const requested = Math.floor(Number(slotLevel));
  const slot = Number.isFinite(requested) && slotLevel !== null && slotLevel !== "" ? Math.max(baseSlot, requested) : baseSlot;
  const amount = integer(raw.base) + (slot - baseSlot) * integer(raw.perSlotAbove);
  const { base: _base, baseSlot: _baseSlot, perSlotAbove: _perSlotAbove, ...rest } = raw;
  const detail = String(effect.detail || "").trim();
  return {
    ...effect,
    // Decision M3: the GM reads in the pill how much of the maximum is its own (the tooltip, where the chip is not shown).
    detail: detail ? `${maxHpSummaryLabel(amount)}. ${detail}` : maxHpSummaryLabel(amount),
    mechanics: { ...effect.mechanics, maxHp: { ...rest, amount } },
    ...(Array.isArray(effect.summaryParts) ? {
      summaryParts: effect.summaryParts.map((part) => String(part?.id || "").endsWith(MAX_HP_SUMMARY_PART_SUFFIX)
        ? { ...part, label: maxHpSummaryLabel(amount) } : part),
    } : {}),
  };
}

// Decision M9: on a creature whose hit points the engine does not write (not tracked, shared, a spell's token) the pill
// stays a label: no bonus, no chip, and its detail says so.
export const MAX_HP_NOT_APPLIED_NOTE = "Qui i PF non cambiano da soli (PF non tracciati o condivisi): il bonus va messo a mano.";

export function maxHpConditionOptionsAsLabel(options = {}) {
  const { maxHp: _maxHp, ...mechanics } = options?.mechanics || {};
  const detail = String(options?.effectDetail || "").trim();
  const next = { ...options, effectDetail: detail ? `${detail} ${MAX_HP_NOT_APPLIED_NOTE}` : MAX_HP_NOT_APPLIED_NOTE };
  if (Object.keys(mechanics).length) next.mechanics = mechanics;
  else delete next.mechanics;
  if (Array.isArray(options?.summaryParts)) {
    next.summaryParts = options.summaryParts.filter((part) => !String(part?.id || "").endsWith(MAX_HP_SUMMARY_PART_SUFFIX));
  }
  return next;
}
