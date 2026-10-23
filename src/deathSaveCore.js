import { ID } from "./constants.js";
import { conditionKey } from "./conditionRulesCore.js";
import { resolveZeroHPUnconsciousAction, shouldPCBeUnconsciousAtZeroHP } from "./hpConditionRulesCore.js";

// Death saving throws (PHB 2014, p. 197). A PC at 0 HP rolls a d20 at the start of each of its turns:
// 10 or more is a success, less a failure; a natural 1 counts as two failures, a natural 20 brings the
// creature back to 1 HP. Three successes make it stable, three failures kill it; both counts go back to
// zero when it regains any hit points or becomes stable. The tally lives in the token metadata
// (meta.deathSaves), "Stabile" and "Morto" are pills of their own.
export const DEATH_SAVES_FIELD = "deathSaves";
export const DEATH_SAVE_CONDITION_TYPE = "death-save";
export const DEATH_SAVE_STABLE_CONDITION = "Stabile";
export const DEATH_SAVE_DEAD_CONDITION = "Morto";
export const DEATH_SAVE_RESOLUTION_MODE = "death-save";
export const DEATH_SAVE_ACTIVATION_KIND = "death-save";
export const DEATH_SAVE_OUTCOMES = Object.freeze({
  SUCCESS: "death-success",
  FAILURE: "death-failure",
  NAT1: "death-nat1",
  NAT20: "death-nat20",
});
export const DEATH_SAVE_OUTCOME_LABELS = Object.freeze({
  [DEATH_SAVE_OUTCOMES.SUCCESS]: "Successo",
  [DEATH_SAVE_OUTCOMES.FAILURE]: "Fallimento",
  [DEATH_SAVE_OUTCOMES.NAT1]: "1 naturale",
  [DEATH_SAVE_OUTCOMES.NAT20]: "20 naturale",
});
const OUTCOME_SET = new Set(Object.values(DEATH_SAVE_OUTCOMES));
const LIMIT = 3;
const META_KEY = `${ID}/meta`;

function count(value) {
  return Math.max(0, Math.min(LIMIT, Math.floor(Number(value) || 0)));
}

export function isDeathSaveOutcome(value) {
  return OUTCOME_SET.has(String(value || "").trim());
}

export function readDeathSaves(meta = {}) {
  const value = meta?.[DEATH_SAVES_FIELD];
  return { successes: count(value?.successes), failures: count(value?.failures) };
}

function activeInstances(instances) {
  return (Array.isArray(instances) ? instances : []).filter((instance) => instance?.active !== false);
}

export function deathSaveConditionIds(instances = [], name = "") {
  const key = conditionKey(name);
  return activeInstances(instances)
    .filter((instance) => conditionKey(instance) === key && String(instance?.id || "").trim())
    .map((instance) => String(instance.id).trim());
}

export function isDeadByDeathSaves(instances = []) {
  return deathSaveConditionIds(instances, DEATH_SAVE_DEAD_CONDITION).length > 0;
}

export function isStableByDeathSaves(instances = []) {
  return deathSaveConditionIds(instances, DEATH_SAVE_STABLE_CONDITION).length > 0;
}

// The PC who rolls at the start of its turn: at 0 HP, neither stable nor dead.
export function isDyingPC(meta = {}, instances = []) {
  return shouldPCBeUnconsciousAtZeroHP(meta)
    && !isDeadByDeathSaves(instances)
    && !isStableByDeathSaves(instances);
}

// A PC at 0 HP not yet dead: damage taken now counts on its death saves, though its HP stay at 0.
// The HP writers pass it to calculateQuickHPChange (deathSaveDamage), so that the hit reaches the coordinator.
export function takesDeathSaveDamage(meta = {}) {
  const conditions = meta?.conditions;
  const instances = Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
  return shouldPCBeUnconsciousAtZeroHP(meta) && !isDeadByDeathSaves(instances);
}

export function deathSaveTallyText({ successes = 0, failures = 0 } = {}) {
  const marks = (filled, symbol) => `${symbol.repeat(count(filled))}${"○".repeat(LIMIT - count(filled))}`;
  return `Successi ${marks(successes, "●")} · Fallimenti ${marks(failures, "✕")}`;
}

// One roll on the tally: "dying" goes on, "stable" and "dead" end the rolls, "revived" is the natural 20.
export function applyDeathSaveRoll(tally = {}, outcome = "") {
  const successes = count(tally.successes);
  const failures = count(tally.failures);
  if (outcome === DEATH_SAVE_OUTCOMES.NAT20) return { successes: 0, failures: 0, result: "revived" };
  if (outcome === DEATH_SAVE_OUTCOMES.SUCCESS) {
    return successes + 1 >= LIMIT
      ? { successes: 0, failures: 0, result: "stable" }
      : { successes: successes + 1, failures, result: "dying" };
  }
  if (outcome === DEATH_SAVE_OUTCOMES.FAILURE || outcome === DEATH_SAVE_OUTCOMES.NAT1) {
    const next = Math.min(LIMIT, failures + (outcome === DEATH_SAVE_OUTCOMES.NAT1 ? 2 : 1));
    return { successes, failures: next, result: next >= LIMIT ? "dead" : "dying" };
  }
  return null;
}

export function deathSaveConditionOperation(itemId, name, detail = "") {
  return {
    type: "condition:add",
    targetIds: [itemId],
    conditionName: name,
    options: {
      type: DEATH_SAVE_CONDITION_TYPE,
      expiry: { mode: "manual" },
      ...(String(detail || "").trim() ? { effectDetail: String(detail).trim().slice(0, 240) } : {}),
    },
  };
}

// The consequences of a new HP value on a PC, in the same command as the HP write:
// - back above 0 HP: the tally goes back to zero and Stabile ends (Morto stays to the GM);
// - down to 0 HP with damage left over equal to or above its HP maximum: instant death;
// - damage while already at 0 HP: one failure, two from a critical hit, death from damage of its HP maximum;
//   a stable creature stops being stable. Morto takes the place of the automatic Privo di sensi.
// - instantDeath (Power Word Kill, Divine Word, Disintegrate: hpBranchSpellRules.js): any creature down to 0 HP is
//   dead, Morto with the spell's detail; a PC also gets its three failures.
export function planDeathSaveHpChange({
  meta = {}, instances = [], hpAfter, hpMax, damage = 0, critical = false, instantDeath = false, deathDetail = "",
} = {}) {
  const pc = String(meta?.attitude || "").trim().toLocaleLowerCase("it") === "pc";
  if (instantDeath === true && Number(hpAfter) <= 0 && Number(hpMax ?? meta?.hpMax) > 0 && !isDeadByDeathSaves(instances)) {
    return {
      ...(pc ? { deathSaves: { value: { successes: 0, failures: LIMIT } } } : {}),
      removeInstanceIds: pc
        ? [
          ...deathSaveConditionIds(instances, DEATH_SAVE_STABLE_CONDITION),
          ...resolveZeroHPUnconsciousAction({ ...meta, hp: 0 }, [...instances, { condition: DEATH_SAVE_DEAD_CONDITION }])
            .removeInstanceIds,
        ]
        : [],
      addCondition: DEATH_SAVE_DEAD_CONDITION,
      ...(String(deathDetail || "").trim() ? { deathDetail: String(deathDetail).trim() } : {}),
      instantDeath: true,
    };
  }
  if (!pc) return null;
  const before = Number(meta?.hp);
  const after = Number(hpAfter);
  const max = Number(hpMax ?? meta?.hpMax);
  if (!Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(max) || max <= 0) return null;
  const tally = readDeathSaves(meta);
  const hasTally = Object.prototype.hasOwnProperty.call(meta || {}, DEATH_SAVES_FIELD);
  if (before <= 0 && after > 0) {
    const stableIds = deathSaveConditionIds(instances, DEATH_SAVE_STABLE_CONDITION);
    if (!hasTally && !stableIds.length) return null;
    return {
      ...(hasTally ? { deathSaves: { mode: "delete" } } : {}),
      removeInstanceIds: stableIds,
      addCondition: "",
    };
  }
  if (before > 0 && after <= 0 && !isDeadByDeathSaves(instances)) {
    const leftover = Math.max(0, Math.floor(Number(damage) || 0) - Math.floor(before));
    const massive = leftover >= max;
    if (!massive && !hasTally) return null;
    return {
      ...(massive ? { deathSaves: { value: { successes: 0, failures: LIMIT } } }
        : (tally.successes || tally.failures) ? { deathSaves: { mode: "delete" } } : {}),
      removeInstanceIds: massive ? deathSaveConditionIds(instances, DEATH_SAVE_STABLE_CONDITION) : [],
      addCondition: massive ? DEATH_SAVE_DEAD_CONDITION : "",
      ...(massive ? { instantDeath: true } : {}),
    };
  }
  const hit = Math.max(0, Math.floor(Number(damage) || 0));
  if (before <= 0 && after <= 0 && hit > 0 && !isDeadByDeathSaves(instances)) {
    const stableIds = deathSaveConditionIds(instances, DEATH_SAVE_STABLE_CONDITION);
    // Becoming stable reset the tally: a stable creature starts again from no failures.
    const failures = Math.min(LIMIT, (stableIds.length ? 0 : tally.failures) + (critical ? 2 : 1));
    const dead = hit >= max || failures >= LIMIT;
    const unconsciousIds = dead
      ? resolveZeroHPUnconsciousAction({ ...meta, hp: 0 }, [...instances, { condition: DEATH_SAVE_DEAD_CONDITION }]).removeInstanceIds
      : [];
    return {
      deathSaves: { value: { successes: stableIds.length ? 0 : tally.successes, failures: dead ? LIMIT : failures } },
      removeInstanceIds: [...stableIds, ...unconsciousIds],
      addCondition: dead ? DEATH_SAVE_DEAD_CONDITION : "",
      ...(dead ? { instantDeath: true } : {}),
    };
  }
  return null;
}

// The reminder at the start of the dying PC's turn, through the shared reminder popups (GM and table screen).
export function deathSaveNotice({ item, eventKey = "", noticeTurnKey = eventKey, portrait = "" } = {}) {
  const id = String(item?.id || "").trim();
  if (!id || !String(eventKey || "").trim()) return null;
  const meta = item?.metadata?.[META_KEY] || {};
  const tally = readDeathSaves(meta);
  const activationId = `${id}:death-save:${eventKey}`;
  return {
    activationId,
    turnKey: noticeTurnKey,
    effectName: "TS contro la morte",
    saveLabel: deathSaveTallyText(tally),
    instruction: `${deathSaveTallyText(tally)}. Tira un d20: con 10 o più è un successo, sotto 10 un fallimento. `
      + "Un 1 vale due fallimenti, un 20 riporta a 1 PF. Tre successi: stabile; tre fallimenti: morto.",
    timing: "turn-start",
    kind: "effect-reminder",
    eyebrow: "TS contro la morte",
    resolution: {
      version: 1,
      mode: DEATH_SAVE_RESOLUTION_MODE,
      target: { id },
      activation: { kind: DEATH_SAVE_ACTIVATION_KIND, activationId, turnKey: String(eventKey) },
    },
    target: {
      id,
      name: String(item?.name || "Token").trim().slice(0, 100) || "Token",
      portrait: String(portrait || "").slice(0, 2048),
    },
  };
}

// One roll resolved from the popup: the new tally (or its removal), the pill it adds or removes,
// and the HP write of a natural 20. The reminder resolution core adds its marker and History.
export function planDeathSaveRoll({ meta = {}, instances = [], outcome = "" } = {}) {
  if (!isDeathSaveOutcome(outcome)) return { status: "invalid", message: "Esito del TS contro la morte non valido." };
  if (isDeadByDeathSaves(instances)) return { status: "stale", message: "La creatura è già morta." };
  if (isStableByDeathSaves(instances)) return { status: "stale", message: "La creatura è già stabile." };
  if (!shouldPCBeUnconsciousAtZeroHP(meta)) return { status: "stale", message: "La creatura non è più a 0 PF." };
  const roll = applyDeathSaveRoll(readDeathSaves(meta), outcome);
  const hpMax = Math.max(0, Math.floor(Number(meta.hpMax) || 0));
  const message = {
    dying: `TS contro la morte: ${DEATH_SAVE_OUTCOME_LABELS[outcome]}. ${deathSaveTallyText(roll)}.`,
    stable: "Tre successi: la creatura è stabile.",
    dead: "Tre fallimenti: la creatura è morta.",
    revived: "20 naturale: la creatura torna a 1 PF.",
  }[roll.result];
  return {
    status: "ready",
    result: roll.result,
    deathSaves: roll.result === "dying" || roll.result === "dead"
      ? { value: { successes: roll.successes, failures: roll.failures } }
      : { mode: "delete" },
    addCondition: roll.result === "stable" ? DEATH_SAVE_STABLE_CONDITION
      : roll.result === "dead" ? DEATH_SAVE_DEAD_CONDITION : "",
    hpChange: roll.result === "revived" ? { before: 0, after: Math.min(1, hpMax), hpMax } : null,
    tally: { successes: roll.successes, failures: roll.failures },
    message,
  };
}
