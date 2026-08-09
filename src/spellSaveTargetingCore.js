import {
  getSpellSaveWorkflowRule,
  validateSpellSaveWorkflowChoice,
} from "./spellSaveWorkflowRules.js";

export const MAX_SPELL_SLOT_LEVEL = 9;

const integerValue = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const normalizedIds = (values = []) => (Array.isArray(values) ? values : [])
  .map((value) => String(value || "").trim())
  .filter(Boolean);

function resolveRule(rule, spellId) {
  if (rule && typeof rule === "object") return rule;
  return getSpellSaveWorkflowRule(spellId);
}

function targetingNumbers(rule) {
  const targeting = rule?.targeting || {};
  return {
    baseSlot: Math.max(1, integerValue(targeting.baseSlot) ?? 1),
    baseMaximum: Math.max(0, integerValue(targeting.baseMaximum) ?? 0),
    additionalPerSlotAbove: Math.max(
      0,
      integerValue(targeting.additionalPerSlotAbove) ?? 0,
    ),
  };
}

const SAVE_OUTCOME_VALUES = new Set(["passed", "failed", "immune"]);

function targetContextContract(rule) {
  const context = rule?.targeting?.context;
  return context && typeof context === "object" && context.scope === "target"
    ? context
    : null;
}

function normalizedTargetContexts(value) {
  const entries = value instanceof Map
    ? Array.from(value.entries())
    : value && typeof value === "object"
      ? Object.entries(value)
      : [];
  const contexts = new Map();
  for (const [targetId, rawContext] of entries) {
    const normalizedTargetId = String(targetId || "").trim();
    if (!normalizedTargetId || !rawContext || typeof rawContext !== "object") continue;
    contexts.set(normalizedTargetId, { ...rawContext });
  }
  return contexts;
}

function contextFieldValue(context, fieldId) {
  const value = context?.[fieldId];
  return value === null || value === undefined ? "" : value;
}

function contextConditionMatches(context, condition) {
  if (!condition || typeof condition !== "object") return true;
  if (Array.isArray(condition.all)) {
    return condition.all.every((entry) => contextConditionMatches(context, entry));
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((entry) => contextConditionMatches(context, entry));
  }
  const fieldId = String(condition.field || "").trim();
  if (!fieldId) return true;
  const actual = String(contextFieldValue(context, fieldId)).trim();
  if (Object.prototype.hasOwnProperty.call(condition, "equals")) {
    return actual === String(condition.equals ?? "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(condition, "notEquals")) {
    return actual !== String(condition.notEquals ?? "").trim();
  }
  if (Array.isArray(condition.values)) {
    return condition.values.some((value) => actual === String(value ?? "").trim());
  }
  return false;
}

function normalizeTargetContextFieldValue(field, value) {
  if (field?.type === "number") {
    if (value === "" || value === null || value === undefined) return "";
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return String(value ?? "").trim();
}

function resolveTargetContext(
  rule,
  targetIds,
  targetContexts = {},
) {
  const contract = targetContextContract(rule);
  const contexts = normalizedTargetContexts(targetContexts);
  if (!contract) {
    return {
      valid: true,
      errors: [],
      details: [],
      contract: null,
      contextByTarget: {},
      saveTargetIds: [...targetIds],
      automaticTargetIds: [],
      automaticOutcomeByTarget: {},
      automaticInvolvedIds: [],
      excludedTargetIds: [],
      involvedOnOutcomes: [],
      involvedTargetIds: [],
      effects: [],
      modifiers: [],
      trackInvolved: false,
      manualAction: null,
    };
  }

  const errors = [];
  const details = [];
  const contextByTarget = {};
  const saveTargetIds = [];
  const automaticTargetIds = [];
  const automaticOutcomeByTarget = {};
  const automaticInvolvedIds = [];
  const excludedTargetIds = [];
  const fieldDefinitions = Array.isArray(contract.fields) ? contract.fields : [];
  for (const targetId of targetIds) {
    const rawContext = contexts.get(targetId) || {};
    const normalizedContext = {};
    for (const field of fieldDefinitions) {
      const fieldId = String(field?.id || "").trim();
      if (!fieldId) continue;
      const value = normalizeTargetContextFieldValue(field, contextFieldValue(rawContext, fieldId));
      normalizedContext[fieldId] = value;
      const required = field.required === true
        || (
          field.requiredWhen
          && contextConditionMatches(normalizedContext, field.requiredWhen)
        );
      const missing = value === "" || value === null || value === undefined;
      if (required && missing) {
        errors.push("target-context-required");
        details.push({ targetId, fieldId, error: "required" });
      }
      if (!missing && field.type === "number" && !Number.isFinite(Number(value))) {
        errors.push("target-context-invalid");
        details.push({ targetId, fieldId, error: "invalid" });
      }
      if (!missing && field.type === "select" && Array.isArray(field.options)) {
        const known = field.options.some((option) => option?.value === String(value));
        if (!known) {
          errors.push("target-context-invalid");
          details.push({ targetId, fieldId, error: "invalid" });
        }
      }
    }
    contextByTarget[targetId] = normalizedContext;

    const automaticRule = (Array.isArray(contract.automatic) ? contract.automatic : [])
      .find((candidate) => contextConditionMatches(normalizedContext, candidate?.when));
    if (automaticRule) {
      automaticTargetIds.push(targetId);
      if (SAVE_OUTCOME_VALUES.has(String(automaticRule.outcome || "").trim())) {
        automaticOutcomeByTarget[targetId] = String(automaticRule.outcome).trim();
      }
      if (automaticRule.classification === "involved") automaticInvolvedIds.push(targetId);
      else excludedTargetIds.push(targetId);
      continue;
    }
    if (
      contract.saveWhen
      && !contextConditionMatches(normalizedContext, contract.saveWhen)
    ) {
      excludedTargetIds.push(targetId);
      continue;
    }
    saveTargetIds.push(targetId);
  }

  const uniqueErrors = Array.from(new Set(errors));
  const involvedOnOutcomes = Array.from(new Set(
    (Array.isArray(contract.involvedOnOutcomes) ? contract.involvedOnOutcomes : [])
      .map((value) => String(value || "").trim().toLocaleLowerCase("it"))
      .filter((value) => SAVE_OUTCOME_VALUES.has(value)),
  ));
  return {
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    details,
    contract,
    contextByTarget,
    saveTargetIds,
    automaticTargetIds,
    automaticOutcomeByTarget,
    automaticInvolvedIds,
    excludedTargetIds,
    involvedOnOutcomes,
    involvedTargetIds: [...automaticInvolvedIds],
    effects: Array.isArray(contract.effects) ? contract.effects : [],
    modifiers: Array.isArray(contract.modifiers) ? contract.modifiers : [],
    trackInvolved: contract.trackInvolved === true,
    manualAction: contract.manualAction && typeof contract.manualAction === "object"
      ? contract.manualAction
      : null,
  };
}

function spatialRule(rule) {
  const value = rule?.targeting?.spatial;
  if (!value || typeof value !== "object") return null;
  return {
    mode: String(value.mode || "").trim(),
    maxMeters: Number(value.maxMeters),
  };
}

function pairKey(firstId, secondId) {
  return [firstId, secondId].sort().join("\u0000");
}

function normalizedPairwiseDistances(value) {
  const distances = new Map();
  for (const entry of Array.isArray(value) ? value : []) {
    const ids = normalizedIds(entry?.targetIds);
    const distance = Number(entry?.distanceMeters);
    if (ids.length !== 2 || ids[0] === ids[1] || !Number.isFinite(distance)) continue;
    distances.set(pairKey(ids[0], ids[1]), distance);
  }
  return distances;
}

function normalizedCasterDistances(value) {
  const distances = new Map();
  if (!value || typeof value !== "object") return distances;
  for (const [targetId, rawDistance] of Object.entries(value)) {
    const normalizedTargetId = String(targetId || "").trim();
    const distance = Number(rawDistance);
    if (normalizedTargetId && Number.isFinite(distance)) {
      distances.set(normalizedTargetId, distance);
    }
  }
  return distances;
}

function resolveSpatialTargeting(
  rule,
  targetIds,
  {
    pairwiseDistancesMeters = [],
    casterDistancesMeters = {},
    validateSpatial = true,
  } = {},
) {
  const spatial = spatialRule(rule);
  if (!spatial) {
    return {
      valid: true,
      errors: [],
      invalidTargetIds: [],
      rule: null,
    };
  }
  if (validateSpatial !== true) {
    return {
      valid: true,
      errors: [],
      invalidTargetIds: [],
      rule: spatial,
      deferred: true,
    };
  }

  const errors = [];
  const invalidTargetIds = new Set();
  const maxMeters = spatial.maxMeters;
  if (!Number.isFinite(maxMeters) || maxMeters < 0) {
    errors.push("spatial-rule-invalid");
    return { valid: false, errors, invalidTargetIds: [], rule: spatial };
  }

  if (spatial.mode === "pairwise-distance") {
    const distances = normalizedPairwiseDistances(pairwiseDistancesMeters);
    for (let index = 0; index < targetIds.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < targetIds.length; nextIndex += 1) {
        const firstId = targetIds[index];
        const secondId = targetIds[nextIndex];
        const distance = distances.get(pairKey(firstId, secondId));
        if (!Number.isFinite(distance)) {
          if (!errors.includes("pairwise-distance-unavailable")) {
            errors.push("pairwise-distance-unavailable");
          }
          invalidTargetIds.add(firstId);
          invalidTargetIds.add(secondId);
        } else if (distance > maxMeters + 1e-9) {
          if (!errors.includes("pairwise-distance-exceeded")) {
            errors.push("pairwise-distance-exceeded");
          }
          invalidTargetIds.add(firstId);
          invalidTargetIds.add(secondId);
        }
      }
    }
  } else if (spatial.mode === "caster-range") {
    const distances = normalizedCasterDistances(casterDistancesMeters);
    for (const targetId of targetIds) {
      const distance = distances.get(targetId);
      if (!Number.isFinite(distance)) {
        if (!errors.includes("caster-distance-unavailable")) {
          errors.push("caster-distance-unavailable");
        }
        invalidTargetIds.add(targetId);
      } else if (distance > maxMeters + 1e-9) {
        if (!errors.includes("caster-range-exceeded")) {
          errors.push("caster-range-exceeded");
        }
        invalidTargetIds.add(targetId);
      }
    }
  } else {
    errors.push("spatial-rule-invalid");
  }

  return {
    valid: errors.length === 0,
    errors,
    invalidTargetIds: Array.from(invalidTargetIds),
    rule: spatial,
  };
}

export function getSpellSaveTargetMaximum(ruleOrSpellId, slotLevel) {
  const rule = typeof ruleOrSpellId === "string"
    ? getSpellSaveWorkflowRule(ruleOrSpellId)
    : ruleOrSpellId;
  if (!rule) return 0;

  const { baseSlot, baseMaximum, additionalPerSlotAbove } = targetingNumbers(rule);
  const requestedSlot = integerValue(slotLevel);
  const resolvedSlot = requestedSlot === null
    ? baseSlot
    : Math.max(baseSlot, Math.min(MAX_SPELL_SLOT_LEVEL, requestedSlot));
  return baseMaximum + Math.max(0, resolvedSlot - baseSlot) * additionalPerSlotAbove;
}

export function resolveSpellSaveTargeting({
  spellId = "",
  rule = null,
  slotLevel = null,
  targetIds = [],
  allowEmptyTargets = false,
  choiceValue = "",
  pairwiseDistancesMeters = [],
  casterDistancesMeters = {},
  validateSpatial = true,
  targetContexts = {},
} = {}) {
  const normalizedSpellId = String(spellId || "").trim();
  const workflowRule = resolveRule(rule, normalizedSpellId);
  const resolvedSpellId = normalizedSpellId || String(workflowRule?.spellId || "").trim();
  const rawTargetIds = normalizedIds(targetIds);
  const uniqueTargetIds = Array.from(new Set(rawTargetIds));
  const duplicateTargetIds = Array.from(new Set(
    rawTargetIds.filter((targetId, index) => rawTargetIds.indexOf(targetId) !== index),
  ));
  const errors = [];

  if (!workflowRule) errors.push("workflow-rule-missing");
  if (
    normalizedSpellId
    && workflowRule?.spellId
    && workflowRule.spellId !== normalizedSpellId
  ) {
    errors.push("workflow-spell-mismatch");
  }

  const { baseSlot } = targetingNumbers(workflowRule);
  const requestedSlot = slotLevel === null || slotLevel === undefined || slotLevel === ""
    ? baseSlot
    : integerValue(slotLevel);
  if (
    requestedSlot === null
    || requestedSlot < baseSlot
    || requestedSlot > MAX_SPELL_SLOT_LEVEL
  ) {
    errors.push("slot-level-invalid");
  }
  const normalizedSlotLevel = requestedSlot === null ? baseSlot : requestedSlot;
  const maximumTargets = workflowRule
    ? getSpellSaveTargetMaximum(workflowRule, normalizedSlotLevel)
    : 0;
  const choiceValidation = validateSpellSaveWorkflowChoice(workflowRule, choiceValue);
  const targetContext = resolveTargetContext(
    workflowRule,
    uniqueTargetIds,
    targetContexts,
  );
  const spatial = resolveSpatialTargeting(workflowRule, uniqueTargetIds, {
    pairwiseDistancesMeters,
    casterDistancesMeters,
    validateSpatial,
  });

  if (duplicateTargetIds.length) errors.push("duplicate-targets");
  if (!allowEmptyTargets && uniqueTargetIds.length === 0) errors.push("targets-required");
  if (uniqueTargetIds.length > maximumTargets) errors.push("target-limit-exceeded");
  for (const error of choiceValidation.errors) {
    if (!errors.includes(error)) errors.push(error);
  }
  for (const error of spatial.errors) {
    if (!errors.includes(error)) errors.push(error);
  }
  for (const error of targetContext.errors) {
    if (!errors.includes(error)) errors.push(error);
  }

  return {
    valid: errors.length === 0,
    errors,
    spellId: resolvedSpellId,
    slotLevel: normalizedSlotLevel,
    maximumTargets,
    targetIds: uniqueTargetIds,
    duplicateTargetIds,
    rule: workflowRule,
    choiceValue: choiceValidation.value,
    choice: choiceValidation.option,
    spatial,
    targetContext,
  };
}

export const validateSpellSaveTargeting = resolveSpellSaveTargeting;

export function validateSpellSaveWorkflowTargetContexts(
  ruleOrSpellId,
  targetIds = [],
  targetContexts = {},
) {
  const rule = typeof ruleOrSpellId === "string"
    ? getSpellSaveWorkflowRule(ruleOrSpellId)
    : ruleOrSpellId;
  return resolveTargetContext(rule, normalizedIds(targetIds), targetContexts);
}
