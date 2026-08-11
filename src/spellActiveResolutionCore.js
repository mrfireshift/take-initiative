import { ID } from "./constants.js";
import { getSpellActiveResolutionActions } from "./spellActiveResolutionRules.js";

export const SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE = `${ID}/spell-active-resolution`;
export const SPELL_ACTIVE_RESOLUTION_KINDS = Object.freeze([
  "save-area",
  "single-attack",
]);
export const SPELL_ACTIVE_RESOLUTION_ECONOMIES = Object.freeze([
  "action",
  "bonus-action",
]);
export const SPELL_ACTIVE_RESOLUTION_RANGE_ORIGINS = Object.freeze([
  "caster",
  "root",
]);
export const SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES = Object.freeze([
  "passed",
  "failed",
  "immune",
]);
export const SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES = Object.freeze([
  "hit",
  "miss",
]);

export function spellActiveResolutionPopoverId(instanceId, actionId) {
  const instance = String(instanceId || "").trim().replaceAll("/", "_");
  const action = String(actionId || "").trim().replaceAll("/", "_");
  return `${ID}/spell-active-resolution/${instance}/${action}`;
}

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function integer(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function actionDamage(action) {
  return action?.damage && typeof action.damage === "object" ? action.damage : null;
}

export function validateSpellActiveResolutionAction(action) {
  const errors = [];
  const id = String(action?.id || "").trim();
  const kind = String(action?.resolutionKind || "").trim();
  const economy = String(action?.economy || "").trim();
  const rangeOrigin = String(action?.rangeOrigin || "").trim();
  const damageRule = actionDamage(action);
  if (!id) errors.push("action-id-required");
  if (!String(action?.label || action?.buttonLabel || "").trim()) {
    errors.push("action-label-required");
  }
  if (!SPELL_ACTIVE_RESOLUTION_ECONOMIES.includes(economy)) {
    errors.push("action-economy-invalid");
  }
  if (!SPELL_ACTIVE_RESOLUTION_KINDS.includes(kind)) {
    errors.push("action-resolution-kind-invalid");
  }
  if (action?.subjectMode !== "none") errors.push("action-subject-mode-invalid");
  if (action?.requiresTargets !== false) errors.push("action-target-contract-invalid");
  if (!SPELL_ACTIVE_RESOLUTION_RANGE_ORIGINS.includes(rangeOrigin)) {
    errors.push("action-range-origin-invalid");
  }
  if (kind === "save-area" && !String(action?.placementRuleId || "").trim()) {
    errors.push("action-placement-rule-required");
  }
  if (action?.requiresParentInstance !== true) {
    errors.push("action-parent-instance-required");
  }
  if (kind === "single-attack" && action?.requiresZoneRoot !== true) {
    errors.push("action-zone-root-required");
  }
  if (rangeOrigin === "root" && (
    !action?.range
    || action.range.unit !== "m"
    || !Number.isFinite(Number(action.range.value))
    || Number(action.range.value) <= 0
  )) {
    errors.push("action-range-required");
  }
  if (!String(damageRule?.formula || "").trim() || !String(damageRule?.type || "").trim()) {
    errors.push("action-damage-required");
  }
  const baseSlot = integer(damageRule?.baseSlot, 0);
  const perSlot = integer(damageRule?.additionalPerSlotAbove, 0);
  if (baseSlot < 0 || perSlot < 0) errors.push("action-damage-scaling-invalid");
  if (kind === "save-area" && !["half", "none"].includes(damageRule?.onSave)) {
    errors.push("action-save-damage-invalid");
  }
  if (kind === "single-attack") {
    if (integer(action?.maxTargets, 0) !== 1) errors.push("action-single-target-invalid");
    if (!Array.isArray(action?.attack?.outcomes)
      || action.attack.outcomes.some((outcome) => !SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES.includes(outcome))) {
      errors.push("action-attack-outcomes-invalid");
    }
  }
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

export function isSpellActiveResolutionAction(action) {
  return validateSpellActiveResolutionAction(action).valid;
}

export function getSpellResolutionAction(spellId, actionId) {
  const actions = getSpellActiveResolutionActions(spellId);
  return actions.find((action) => String(action?.id || "") === String(actionId || "")) || null;
}

function readSlotLevel(group, spell) {
  const castContext = group?.castContext || {};
  return Math.max(0, integer(
    castContext.slotLevel
      ?? castContext.targeting?.slotLevel
      ?? spell?.level,
    0,
  ));
}

export function buildSpellActiveResolutionPayload({
  spell = null,
  action = null,
  group = null,
  sceneEpoch = null,
  zoneItemId = "",
  turnKey = "",
} = {}) {
  const actionValidation = validateSpellActiveResolutionAction(action);
  if (!actionValidation.valid) {
    throw new Error(`Invalid active resolution action: ${actionValidation.errors.join(",")}`);
  }
  const spellId = String(spell?.id || "").trim();
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!spellId || !instanceId || !casterId) throw new Error("active-resolution-context-required");
  const epoch = integer(sceneEpoch);
  if (epoch === null || epoch < 0) throw new Error("active-resolution-scene-epoch-required");
  const castContext = group?.castContext && typeof group.castContext === "object"
    ? clone(group.castContext)
    : {};
  const payload = {
    type: SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE,
    version: 1,
    spellId,
    spellName: String(spell?.displayName || spell?.name || group?.name || spellId).trim(),
    instanceId,
    casterId,
    casterName: String(group?.casterName || "").trim(),
    castContext,
    slotLevel: readSlotLevel(group, spell),
    sceneEpoch: epoch,
    actionId: String(action.id).trim(),
    action: clone(action),
    ...(String(zoneItemId || "").trim() ? { zoneItemId: String(zoneItemId).trim() } : {}),
    ...(String(turnKey || "").trim() ? { turnKey: String(turnKey).trim() } : {}),
  };
  return deepFreeze(payload);
}

export function validateSpellActiveResolutionPayload(payload) {
  const errors = [];
  if (payload?.type !== SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE) errors.push("payload-type-invalid");
  if (integer(payload?.version) !== 1) errors.push("payload-version-invalid");
  for (const field of ["spellId", "instanceId", "casterId", "actionId"]) {
    if (!String(payload?.[field] || "").trim()) errors.push(`payload-${field}-required`);
  }
  if (integer(payload?.sceneEpoch) === null || integer(payload.sceneEpoch) < 0) {
    errors.push("payload-scene-epoch-invalid");
  }
  const slotLevel = integer(payload?.slotLevel);
  if (slotLevel === null || slotLevel < 0) errors.push("payload-slot-level-invalid");
  const actionValidation = validateSpellActiveResolutionAction(payload?.action);
  if (!actionValidation.valid) errors.push(...actionValidation.errors.map((error) => `payload-${error}`));
  if (String(payload?.action?.id || "") !== String(payload?.actionId || "")) {
    errors.push("payload-action-mismatch");
  }
  const declaredAction = getSpellResolutionAction(payload?.spellId, payload?.actionId);
  if (!declaredAction) errors.push("payload-action-not-declared");
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

export function resolveSpellActiveResolutionDamage({
  action = null,
  slotLevel = 0,
  outcome = "",
  roll = 0,
} = {}) {
  const rule = actionDamage(action);
  const normalizedOutcome = String(outcome || "").trim();
  const validOutcomes = action?.resolutionKind === "single-attack"
    ? SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES
    : SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES;
  const baseSlot = Math.max(0, integer(rule?.baseSlot, 0));
  const perSlot = Math.max(0, integer(rule?.additionalPerSlotAbove, 0));
  const level = Math.max(baseSlot, integer(slotLevel, baseSlot));
  const scaledDice = Math.max(0, perSlot * Math.max(0, level - baseSlot));
  const formula = String(rule?.formula || "").trim();
  const scaledFormula = scaledDice > 0
    ? formula.replace(/^(\d+)d/iu, (_, count) => `${Number(count) + scaledDice}d`)
    : formula;
  const numericRoll = Number(roll);
  const valid = validOutcomes.includes(normalizedOutcome)
    && Number.isFinite(numericRoll)
    && numericRoll >= 0
    && !!rule;
  if (!valid) return { valid: false, errors: Object.freeze(["resolution-damage-input-invalid"]) };
  const factor = normalizedOutcome === "failed" || normalizedOutcome === "hit"
    ? 1
    : normalizedOutcome === "passed" && rule.onSave === "half"
      ? 0.5
      : 0;
  return {
    valid: true,
    outcome: normalizedOutcome,
    roll: Math.floor(numericRoll),
    factor,
    amount: Math.floor(numericRoll * factor),
    formula,
    scaledFormula,
    type: String(rule.type).trim(),
  };
}

export function normalizeActiveResolutionTargetIds(targetIds) {
  return uniqueIds(targetIds);
}
