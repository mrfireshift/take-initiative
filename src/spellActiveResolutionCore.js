import { ID } from "./constants.js";
import {
  spellEffectConditionName,
  spellEffectConditionOptions,
} from "./spellEffectCore.js";
import { getSpellActiveResolutionActions } from "./spellActiveResolutionRules.js";

export const SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE = `${ID}/spell-active-resolution`;
export const SPELL_ACTIVE_RESOLUTION_KINDS = Object.freeze([
  "save-area",
  "single-attack",
  "single-save",
  "child-zone",
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
  "critical",
]);
const SPELL_SAVE_ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);


function baseActorId(value) {
  return String(value || "").trim().replace(/::p\d+$/u, "");
}

// Sincronizza i dropdown dei popup con la selezione corrente di Owlbear.
// La selezione sulla mappa ha precedenza; in assenza di match mantiene il
// valore precedente se è ancora tra i candidati validi.
export function spellActiveResolutionSelectedTargetId(entries = [], selection = [], previous = "") {
  const ids = (Array.isArray(entries) ? entries : [])
    .map((entry) => String(entry?.item?.id || entry?.id || entry || "").trim())
    .filter(Boolean);
  const exact = new Set(ids);
  const byActor = new Map(ids.map((id) => [baseActorId(id), id]));
  for (const value of Array.isArray(selection) ? selection : []) {
    const selectedId = String(value || "").trim();
    if (exact.has(selectedId)) return selectedId;
    const mapped = byActor.get(baseActorId(selectedId));
    if (mapped) return mapped;
  }
  const previousId = String(previous || "").trim();
  return exact.has(previousId) ? previousId : "";
}

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

function rememberedGroupTargetIds(group, casterId = "") {
  const targets = group?.targets;
  const values = targets instanceof Map
    ? [...targets.keys()]
    : Array.isArray(targets)
      ? targets
      : targets && typeof targets === "object"
        ? Object.keys(targets)
        : [];
  return uniqueIds(values).filter((targetId) => targetId !== casterId);
}

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

export function spellActiveResolutionAttackDamageRequired(action = null, outcome = "") {
  if (action?.resolutionKind !== "single-attack" || !actionDamage(action)) return false;
  if (action?.attack?.damageRequiredOnHitOnly === true) {
    return ["hit", "critical"].includes(String(outcome || "").trim());
  }
  return true;
}

export function validateSpellActiveResolutionAction(action) {
  const errors = [];
  const id = String(action?.id || "").trim();
  const kind = String(action?.resolutionKind || "").trim();
  const economy = String(action?.economy || "").trim();
  const rangeOrigin = String(action?.rangeOrigin || "").trim();
  const damageRule = actionDamage(action);
  const fixedCasterRadius = action?.fixedCasterRadius && typeof action.fixedCasterRadius === "object"
    ? action.fixedCasterRadius
    : null;
  const hasFixedCasterRadius = kind === "save-area"
    && fixedCasterRadius?.unit === "m"
    && Number.isFinite(Number(fixedCasterRadius?.value))
    && Number(fixedCasterRadius.value) > 0
    && (fixedCasterRadius.includeCaster === true || fixedCasterRadius.includeCaster === false);
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
  if (
    (kind === "save-area" || kind === "child-zone")
    && !String(action?.placementRuleId || action?.childZone?.placementRuleId || "").trim()
    && !hasFixedCasterRadius
  ) {
    errors.push("action-placement-rule-required");
  }
  if (action?.fixedCasterRadius !== undefined && !hasFixedCasterRadius) {
    errors.push("action-fixed-caster-radius-invalid");
  }
  if (hasFixedCasterRadius && rangeOrigin !== "caster") {
    errors.push("action-fixed-caster-radius-origin-invalid");
  }
  if (action?.requiresParentInstance !== true) {
    errors.push("action-parent-instance-required");
  }
  if (
    ["single-attack", "single-save", "child-zone"].includes(kind)
    && action?.requiresZoneRoot !== true
    && action?.requiresZoneRoot !== false
  ) {
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
  const saveHasDeclarativeEffects = ["save-area", "single-save"].includes(kind)
    && !damageRule
    && (
      (Array.isArray(action?.failureEffects) && action.failureEffects.length > 0)
      || (Array.isArray(action?.successEffects) && action.successEffects.length > 0)
      || (Array.isArray(action?.postDamageEffects) && action.postDamageEffects.length > 0)
    );
  const damageOptional = (kind === "single-save" && !damageRule) || saveHasDeclarativeEffects;
  if (kind !== "child-zone" && !damageOptional
    && (!String(damageRule?.formula || "").trim() || !String(damageRule?.type || "").trim())) {
    errors.push("action-damage-required");
  }
  const baseSlot = integer(damageRule?.baseSlot, 0);
  const perSlot = integer(damageRule?.additionalPerSlotAbove, 0);
  if (baseSlot < 0 || perSlot < 0) errors.push("action-damage-scaling-invalid");
  if (["save-area", "single-save"].includes(kind)
    && damageRule
    && !["full", "half", "none"].includes(damageRule?.onSave)) {
    errors.push("action-save-damage-invalid");
  }
  if (["save-area", "single-save"].includes(kind)) {
    const ability = String(action?.save?.ability || "").trim().toLowerCase();
    if (!SPELL_SAVE_ABILITIES.has(ability)) errors.push("action-save-ability-invalid");
  }
  if (action?.failureEffects !== undefined) {
    if (!Array.isArray(action.failureEffects)) {
      errors.push("action-failure-effects-invalid");
    } else {
      for (const effect of action.failureEffects) {
        if (!String(effect?.id || "").trim()) errors.push("action-failure-effect-id-required");
        if (!String(effect?.label || "").trim()) errors.push("action-failure-effect-label-required");
      }
    }
  }
  if (action?.successEffects !== undefined) {
    if (!Array.isArray(action.successEffects)) {
      errors.push("action-success-effects-invalid");
    } else {
      for (const effect of action.successEffects) {
        if (!String(effect?.id || "").trim()) errors.push("action-success-effect-id-required");
        if (!String(effect?.label || "").trim()) errors.push("action-success-effect-label-required");
      }
    }
  }
  if (action?.postDamageEffects !== undefined) {
    if (!Array.isArray(action.postDamageEffects)) {
      errors.push("action-post-damage-effects-invalid");
    } else {
      for (const effect of action.postDamageEffects) {
        if (!String(effect?.id || "").trim()) errors.push("action-post-damage-effect-id-required");
        if (!String(effect?.label || "").trim()) errors.push("action-post-damage-effect-label-required");
      }
    }
  }
  if (action?.resource && typeof action.resource === "object") {
    const resourceKey = String(action.resource.key || "").trim();
    const consume = integer(action?.resource?.consume, 0);
    if (!resourceKey) errors.push("action-resource-key-required");
    if (consume < 1) errors.push("action-resource-consume-invalid");
  }
  if (kind === "single-attack") {
    if (integer(action?.maxTargets, 0) !== 1) errors.push("action-single-target-invalid");
    const maxAttacks = integer(action?.maxAttacks, 1);
    if (maxAttacks < 1) errors.push("action-max-attacks-invalid");
    if (!Array.isArray(action?.attack?.outcomes)
      || action.attack.outcomes.some((outcome) => !SPELL_ACTIVE_RESOLUTION_ATTACK_OUTCOMES.includes(outcome))) {
      errors.push("action-attack-outcomes-invalid");
    }
  }
  if (kind === "single-save") {
    if (integer(action?.maxTargets, 0) !== 1) errors.push("action-single-target-invalid");
    if (action?.requiredTargetEffectId !== undefined
      && !String(action.requiredTargetEffectId || "").trim()) {
      errors.push("action-required-target-effect-invalid");
    }
    if (action?.excludedTargetEffectId !== undefined
      && !String(action.excludedTargetEffectId || "").trim()) {
      errors.push("action-excluded-target-effect-invalid");
    }
    if (action?.excludedTargetEffectIds !== undefined) {
      if (!Array.isArray(action.excludedTargetEffectIds)
        || action.excludedTargetEffectIds.some((effectId) => !String(effectId || "").trim())) {
        errors.push("action-excluded-target-effects-invalid");
      }
    }
    if (action?.replaceLinkedEffectId !== undefined
      && !String(action.replaceLinkedEffectId || "").trim()) {
      errors.push("action-replace-linked-effect-invalid");
    }
  }
  if (kind === "child-zone") {
    const childZone = action?.childZone;
    const childKind = String(childZone?.childKind || "").trim();
    const childPlacementRuleId = String(
      childZone?.placementRuleId || action?.placementRuleId || "",
    ).trim();
    const minimum = integer(childZone?.placementCount?.min, 0);
    const maximum = integer(childZone?.placementCount?.max, 0);
    if (!childZone || typeof childZone !== "object") {
      errors.push("action-child-zone-required");
    }
    if (!childKind) errors.push("action-child-kind-required");
    if (!childPlacementRuleId) errors.push("action-child-placement-rule-required");
    if (minimum < 1 || maximum < minimum) {
      errors.push("action-child-placement-count-invalid");
    }
    if (childZone?.resolution === "save") {
      const ability = String(childZone?.save?.ability || "").trim();
      if (!SPELL_ACTIVE_RESOLUTION_SAVE_OUTCOMES.length || !ability) {
        errors.push("action-child-save-invalid");
      }
      if (!String(childZone?.failureEffect?.label || "").trim()) {
        errors.push("action-child-failure-effect-invalid");
      }
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
  const requiredTargetEffectId = String(action?.requiredTargetEffectId || "").trim();
  const linkedTargetIds = requiredTargetEffectId
    ? uniqueIds((Array.isArray(group?.effectInstances) ? group.effectInstances : [])
      .filter((effect) => (
        effect?.active !== false
        && String(effect?.effectId || "").trim() === requiredTargetEffectId
      ))
      .map((effect) => effect?.itemId))
    : action?.rememberTargets === true
      ? rememberedGroupTargetIds(group, casterId)
    : [];
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
    ...(linkedTargetIds.length === 1 ? { linkedTargetId: linkedTargetIds[0] } : {}),
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

export function buildSpellActiveResolutionFailureOperations({
  action = null,
  payload = null,
  targetIds = [],
  outcomes = {},
} = {}) {
  if (!["save-area", "single-save"].includes(action?.resolutionKind)) return [];
  const failedIds = normalizeActiveResolutionTargetIds(
    (Array.isArray(targetIds) ? targetIds : [])
      .filter((targetId) => outcomes?.[targetId] === "failed"),
  );
  const effects = Array.isArray(action?.failureEffects) ? action.failureEffects : [];
  if (!failedIds.length || !effects.length) return [];
  const operations = [];
  for (const effect of effects) {
    const conditionName = spellEffectConditionName(effect);
    if (!conditionName) continue;
    operations.push({
      type: "condition:add",
      targetIds: failedIds,
      conditionName,
      options: spellEffectConditionOptions(
        effect,
        {
          sourceId: payload?.casterId,
          sourceName: payload?.casterName,
          expiry: effect.expiry || { mode: "manual" },
        },
        payload?.instanceId,
      ),
    });
  }
  if (operations.length) {
    operations.push({ type: "condition:automate", subjectIds: failedIds });
  }
  return operations;
}

export function buildSpellActiveResolutionPostDamageOperations({
  action = null,
  payload = null,
  targetIds = [],
} = {}) {
  if (! ["save-area", "single-save"].includes(action?.resolutionKind)) return [];
  const resolvedTargetIds = normalizeActiveResolutionTargetIds(targetIds);
  const effects = Array.isArray(action?.postDamageEffects)
    ? action.postDamageEffects
    : [];
  if (!resolvedTargetIds.length || !effects.length) return [];
  const operations = [];
  for (const effect of effects) {
    const conditionName = spellEffectConditionName(effect);
    if (!conditionName) continue;
    operations.push({
      type: "condition:add",
      targetIds: resolvedTargetIds,
      conditionName,
      options: spellEffectConditionOptions(
        effect,
        {
          sourceId: payload?.casterId,
          sourceName: payload?.casterName,
          expiry: effect.expiry || { mode: "manual" },
        },
        payload?.instanceId,
      ),
    });
  }
  if (operations.length) {
    operations.push({ type: "condition:automate", subjectIds: resolvedTargetIds });
  }
  return operations;
}

export function buildSpellActiveResolutionSuccessOperations({
  action = null,
  payload = null,
  targetIds = [],
  outcomes = {},
} = {}) {
  if (!["save-area", "single-save"].includes(action?.resolutionKind)) return [];
  const passedIds = normalizeActiveResolutionTargetIds(
    (Array.isArray(targetIds) ? targetIds : [])
      .filter((targetId) => outcomes?.[targetId] === "passed"),
  );
  const effects = Array.isArray(action?.successEffects) ? action.successEffects : [];
  if (!passedIds.length || !effects.length) return [];
  const operations = [];
  for (const effect of effects) {
    const conditionName = spellEffectConditionName(effect);
    if (!conditionName) continue;
    operations.push({
      type: "condition:add",
      targetIds: passedIds,
      conditionName,
      options: spellEffectConditionOptions(
        effect,
        {
          sourceId: payload?.casterId,
          sourceName: payload?.casterName,
          expiry: effect.expiry || { mode: "manual" },
        },
        payload?.instanceId,
      ),
    });
  }
  if (operations.length) {
    operations.push({ type: "condition:automate", subjectIds: passedIds });
  }
  return operations;
}

export function spellActiveResolutionDamageFormula({
  action = null,
  slotLevel = 0,
  outcome = "",
} = {}) {
  const rule = actionDamage(action);
  const baseSlot = Math.max(0, integer(rule?.baseSlot, 0));
  const perSlot = Math.max(0, integer(rule?.additionalPerSlotAbove, 0));
  const level = Math.max(baseSlot, integer(slotLevel, baseSlot));
  const everySlotLevels = Math.max(
    1,
    integer(action?.damageScaling?.everySlotLevels, 1),
  );
  const scaledDice = Math.max(
    0,
    perSlot * Math.floor(Math.max(0, level - baseSlot) / everySlotLevels),
  );
  const formula = String(rule?.formula || "").trim();
  let scaledFormula = scaledDice > 0
    ? formula.replace(/^(\d+)d/iu, (_, count) => `${Number(count) + scaledDice}d`)
    : formula;
  if (String(outcome || "").trim() === "critical"
    && String(action?.critical?.additionalDice || "").trim()) {
    const [baseCount, baseSides] = scaledFormula.split("d").map(Number);
    const [additionalCount, additionalSides] = String(action.critical.additionalDice)
      .trim()
      .split("d")
      .map(Number);
    if (
      Number.isInteger(baseCount)
      && Number.isInteger(baseSides)
      && Number.isInteger(additionalCount)
      && Number.isInteger(additionalSides)
      && baseSides === additionalSides
    ) {
      scaledFormula = `${baseCount + additionalCount}d${baseSides}`;
    }
  }
  return { formula, scaledFormula };
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
  const { formula, scaledFormula } = spellActiveResolutionDamageFormula({
    action,
    slotLevel,
    outcome: normalizedOutcome,
  });
  const numericRoll = Number(roll);
  const valid = validOutcomes.includes(normalizedOutcome)
    && Number.isFinite(numericRoll)
    && numericRoll >= 0
    && !!rule;
  if (!valid) return { valid: false, errors: Object.freeze(["resolution-damage-input-invalid"]) };
  const factor = normalizedOutcome === "failed"
    || normalizedOutcome === "hit"
    || normalizedOutcome === "critical"
    ? 1
    : normalizedOutcome === "passed"
      ? rule.onSave === "full"
        ? 1
        : rule.onSave === "half"
          ? 0.5
          : 0
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

export function buildSpellActiveResolutionLinkedEffectRemovals({
  action = null,
  payload = null,
  items = [],
} = {}) {
  const parentEffectId = String(payload?.instanceId || "").trim();
  const effectId = String(action?.replaceLinkedEffectId || "").trim();
  if (!parentEffectId || !effectId) return [];
  const removals = [];
  for (const item of Array.isArray(items) ? items : []) {
    const meta = item?.metadata?.[`${ID}/meta`] || {};
    const conditions = Array.isArray(meta.conditions)
      ? meta.conditions
      : Array.isArray(meta.conditions?.instances)
        ? meta.conditions.instances
        : [];
    for (const instance of conditions) {
      if (String(instance?.parentEffectId || "").trim() !== parentEffectId) continue;
      if (String(instance?.effectId || "").trim() !== effectId) continue;
      const instanceId = String(instance?.id || "").trim();
      if (item?.id && instanceId) removals.push({ itemId: item.id, instanceId });
    }
  }
  return removals;
}

export function buildSpellActiveResolutionResourceOperations({
  action = null,
  payload = null,
  spellEntry = null,
} = {}) {
  const resource = action?.resource && typeof action.resource === "object" ? action.resource : null;
  if (!resource) return { valid: true, operations: Object.freeze([]), remaining: null };

  const key = String(resource.key || "").trim();
  const consume = Math.max(1, integer(resource.consume, 1));
  const instanceId = String(payload?.instanceId || spellEntry?.instanceId || "").trim();
  const uses = spellEntry?.castContext?.uses && typeof spellEntry.castContext.uses === "object"
    ? spellEntry.castContext.uses
    : null;
  const remaining = integer(uses?.remaining, null);
  if (!spellEntry || !instanceId || !key || String(uses?.key || "").trim() !== key || remaining === null) {
    return { valid: false, errors: Object.freeze(["active-resolution-resource-missing"]), operations: Object.freeze([]), remaining: null };
  }
  if (remaining < consume) {
    return { valid: false, errors: Object.freeze(["active-resolution-resource-depleted"]), operations: Object.freeze([]), remaining };
  }

  const nextRemaining = Math.max(0, remaining - consume);
  if (nextRemaining === 0 && resource.endSpellAtZero === true) {
    return {
      valid: true,
      remaining: nextRemaining,
      operations: Object.freeze([{
        type: "spell:remove-instance",
        targetIds: [String(payload?.casterId || spellEntry?.casterId || "").trim()],
        instanceId,
      }]),
    };
  }

  const nextCastContext = {
    ...(spellEntry.castContext && typeof spellEntry.castContext === "object" ? clone(spellEntry.castContext) : {}),
    uses: { ...clone(uses), remaining: nextRemaining },
  };
  return {
    valid: true,
    remaining: nextRemaining,
    operations: Object.freeze([{
      type: "spell:upsert",
      targetIds: [String(payload?.casterId || spellEntry?.casterId || "").trim()],
      name: String(spellEntry.name || payload?.spellName || payload?.spellId || "").trim(),
      turns: Math.max(1, integer(spellEntry.turns, 1)),
      conc: spellEntry.conc === true,
      source: String(spellEntry.casterId || payload?.casterId || "").trim(),
      ...(spellEntry.casterName ? { casterName: String(spellEntry.casterName) } : {}),
      instanceId,
      spellId: String(spellEntry.spellId || payload?.spellId || "").trim(),
      ...(spellEntry.appliedAt ? { appliedAt: clone(spellEntry.appliedAt) } : {}),
      castContext: nextCastContext,
    }]),
  };
}

export function normalizeActiveResolutionTargetIds(targetIds) {
  return uniqueIds(targetIds);
}
