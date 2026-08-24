import { resolveSpellSaveTargeting } from "./spellSaveTargetingCore.js";
import { getSpellSaveWorkflowChoiceAutomation } from "./spellSaveWorkflowRules.js";
import { spellEffectThemeFor } from "./spellColorCore.js";

export const SAVE_SPELL_OUTCOMES = Object.freeze({
  PASSED: "passed",
  FAILED: "failed",
  IMMUNE: "immune",
});

const OUTCOME_KEYS = Object.freeze(Object.values(SAVE_SPELL_OUTCOMES));
const OUTCOME_SET = new Set(OUTCOME_KEYS);

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function outcomeFor(outcomes, targetId) {
  const value = typeof outcomes?.get === "function"
    ? outcomes.get(targetId)
    : outcomes?.[targetId];
  const outcome = String(value || "").trim().toLocaleLowerCase("it");
  return OUTCOME_SET.has(outcome) ? outcome : "";
}

function normalizeConditionRule(value) {
  const rule = typeof value === "string"
    ? { condition: value }
    : value && typeof value === "object"
      ? value
      : {};
  const conditionName = String(rule.condition || rule.conditionName || rule.name || "").trim();
  if (!conditionName) return null;

  const options = {
    ...(rule.options && typeof rule.options === "object" ? clone(rule.options) : {}),
  };
  if (rule.expiry && typeof rule.expiry === "object") options.expiry = clone(rule.expiry);
  if (rule.effectId) options.effectId = String(rule.effectId);
  if (rule.effectKind === "buff" || rule.effectKind === "debuff") {
    options.effectKind = rule.effectKind;
  }
  if (rule.effectDetail) options.effectDetail = String(rule.effectDetail);
  if (rule.mapVisible === false) options.mapVisible = false;
  if (rule.mechanics && typeof rule.mechanics === "object") {
    options.mechanics = clone(rule.mechanics);
  }
  if (Array.isArray(rule.summaryParts)) {
    options.summaryParts = clone(rule.summaryParts);
  }
  if (rule.saveReminder && typeof rule.saveReminder === "object") {
    options.saveReminder = clone(rule.saveReminder);
  }
  if (rule.deferredEffect !== undefined || rule.deferredEffects !== undefined) {
    options.deferredEffects = clone(
      rule.deferredEffects ?? rule.deferredEffect,
    );
  }
  if (rule.manualRemoval === true) options.manualRemoval = true;
  if (rule.endsParentOnRemoval === true) options.endsParentOnRemoval = true;
  if (rule.parentRemoval === "target" || rule.parentRemoval === "spell") {
    options.parentRemoval = rule.parentRemoval;
  }
  if (rule.parentEndCondition && typeof rule.parentEndCondition === "object") {
    options.parentEndCondition = clone(rule.parentEndCondition);
  }
  if (rule.exhaustionContribution === true) options.exhaustionContribution = true;

  return {
    conditionName,
    options,
    ...(rule.context && typeof rule.context === "object"
      ? { context: clone(rule.context) }
      : {}),
  };
}

export function normalizeSaveSpellAutomation(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const rulesByOutcome = {};
  for (const outcome of OUTCOME_KEYS) {
    rulesByOutcome[outcome] = (Array.isArray(source[outcome]) ? source[outcome] : [])
      .map(normalizeConditionRule)
      .filter(Boolean);
  }

  const hasExplicitTrackOutcomes = Array.isArray(source.trackOutcomes);
  const explicitTrackOutcomes = uniqueIds(source.trackOutcomes)
    .map((outcome) => outcome.toLocaleLowerCase("it"))
    .filter((outcome) => OUTCOME_SET.has(outcome));
  const trackOutcomes = hasExplicitTrackOutcomes
    ? explicitTrackOutcomes
    : OUTCOME_KEYS.filter((outcome) => rulesByOutcome[outcome].length > 0);

  return {
    rulesByOutcome,
    trackOutcomes,
  };
}

export function partitionSaveSpellTargets(targetIds = [], outcomes = new Map()) {
  const partitions = {
    passedIds: [],
    failedIds: [],
    immuneIds: [],
    missingIds: [],
  };
  for (const targetId of uniqueIds(targetIds)) {
    const outcome = outcomeFor(outcomes, targetId);
    if (outcome === SAVE_SPELL_OUTCOMES.PASSED) partitions.passedIds.push(targetId);
    else if (outcome === SAVE_SPELL_OUTCOMES.FAILED) partitions.failedIds.push(targetId);
    else if (outcome === SAVE_SPELL_OUTCOMES.IMMUNE) partitions.immuneIds.push(targetId);
    else partitions.missingIds.push(targetId);
  }
  return partitions;
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
  const actual = String(context?.[fieldId] ?? "").trim();
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

function contextModifierOptions(targeting, targetId, outcome, conditionName) {
  const targetContext = targeting?.targetContext;
  const context = targetContext?.contextByTarget?.[targetId] || {};
  const modifier = (targetContext?.modifiers || []).find((candidate) => {
    if (String(candidate?.outcome || "").trim() !== outcome) return false;
    if (candidate?.condition && String(candidate.condition).trim() !== conditionName) return false;
    if (candidate?.when && !contextConditionMatches(context, candidate.when)) return false;
    if (candidate?.field) {
      const value = String(context[candidate.field] ?? "").trim();
      return !!candidate.values?.[value];
    }
    return true;
  });
  if (!modifier) return {};
  if (modifier.field) {
    const value = String(context[modifier.field] ?? "").trim();
    const selected = modifier.values?.[value];
    return selected && typeof selected === "object"
      ? clone(selected.options || selected)
      : {};
  }
  return clone(modifier.options || {});
}

function contextEffectConditionName(effect, context) {
  if (typeof effect?.condition === "string") return effect.condition.trim();
  if (!effect?.condition || typeof effect.condition !== "object") return "";
  const field = String(effect.condition.field || "").trim();
  const value = String(context?.[field] ?? "").trim();
  if (!field || !value) return "";
  return `${String(effect.condition.prefix || "")}${value}${String(effect.condition.suffix || "")}`.trim();
}

function contextEffectTargetIds(targeting, classification, involvedTargetIds) {
  const context = targeting?.targetContext;
  if (classification === "involved") return involvedTargetIds;
  if (classification === "automatic") return context?.automaticTargetIds || [];
  if (classification === "resisted") return context?.excludedTargetIds || [];
  return [];
}

function contextEffectApplication(effect, targetId, targeting) {
  const context = targeting?.targetContext?.contextByTarget?.[targetId] || {};
  const conditionName = contextEffectConditionName(effect, context);
  if (!conditionName) return null;
  const rule = normalizeConditionRule({
    condition: conditionName,
    ...(effect.options && typeof effect.options === "object"
      ? { options: effect.options }
      : {}),
    ...(effect.expiry && typeof effect.expiry === "object"
      ? { expiry: effect.expiry }
      : {}),
    ...(effect.effectId ? { effectId: effect.effectId } : {}),
    ...(effect.effectKind ? { effectKind: effect.effectKind } : {}),
    ...(effect.effectDetail ? { effectDetail: effect.effectDetail } : {}),
    ...(effect.mechanics && typeof effect.mechanics === "object"
      ? { mechanics: effect.mechanics }
      : {}),
    ...(effect.deferredEffects !== undefined || effect.deferredEffect !== undefined
      ? { deferredEffects: effect.deferredEffects ?? effect.deferredEffect }
      : {}),
    ...(effect.manualRemoval === true ? { manualRemoval: true } : {}),
    ...(effect.endsParentOnRemoval === true ? { endsParentOnRemoval: true } : {}),
  });
  if (!rule) return null;
  const mechanics = {
    ...(rule.options.mechanics && typeof rule.options.mechanics === "object"
      ? clone(rule.options.mechanics)
      : {}),
  };
  for (const fieldId of mechanics.contextFields || []) {
    if (Object.prototype.hasOwnProperty.call(context, fieldId)) {
      mechanics[fieldId] = context[fieldId];
    }
  }
  if (Object.keys(mechanics).length) rule.options.mechanics = mechanics;
  if (effect.theme && typeof effect.theme === "object") {
    rule.options.theme = clone(effect.theme);
  }
  return {
    outcome: "context",
    targetIds: [targetId],
    conditionName: rule.conditionName,
    options: rule.options,
  };
}

export function resolveSaveSpellResolution({
  spell = null,
  casterId = "",
  targetIds = [],
  outcomes = new Map(),
  automation = null,
  allowEmptyTargets = false,
  saveWorkflowRule = null,
  slotLevel = null,
  choiceValue = "",
  pairwiseDistancesMeters = [],
  casterDistancesMeters = {},
  validateSpatial = true,
  targetContexts = {},
} = {}) {
  const inputTargetIds = Array.isArray(targetIds) ? targetIds : [];
  const targets = uniqueIds(targetIds);
  const caster = String(casterId || "").trim();
  const spellId = String(spell?.id || "").trim();
  const concentration = spell?.concentration === true;
  const targeting = saveWorkflowRule
    ? resolveSpellSaveTargeting({
      spellId,
      rule: saveWorkflowRule,
      slotLevel,
      targetIds: inputTargetIds,
      allowEmptyTargets,
      choiceValue,
      pairwiseDistancesMeters,
      casterDistancesMeters,
      validateSpatial,
      targetContexts,
    })
    : null;
  const automaticOutcomes = targeting?.targetContext?.automaticOutcomeByTarget || {};
  const effectiveOutcomes = new Map();
  for (const targetId of targets) {
    const automaticOutcome = automaticOutcomes[targetId];
    const suppliedOutcome = outcomeFor(outcomes, targetId);
    if (automaticOutcome) effectiveOutcomes.set(targetId, automaticOutcome);
    else if (suppliedOutcome) effectiveOutcomes.set(targetId, suppliedOutcome);
  }
  const outcomeTargetIds = targeting?.targetContext?.saveTargetIds || targets;
  const partitions = partitionSaveSpellTargets(outcomeTargetIds, effectiveOutcomes);
  const choiceAutomation = targeting?.choice
    ? getSpellSaveWorkflowChoiceAutomation(saveWorkflowRule, targeting.choiceValue)
    : null;
  const spellName = String(
    targeting?.choice?.spellName
      || spell?.displayName
      || spell?.name
      || "",
  ).trim();
  const spellEffectTheme = spellEffectThemeFor(spell);
  const normalizedAutomation = normalizeSaveSpellAutomation(
    automation ?? choiceAutomation ?? spell?.saveAutomation ?? {}
  );
  const idsByOutcome = {
    [SAVE_SPELL_OUTCOMES.PASSED]: partitions.passedIds,
    [SAVE_SPELL_OUTCOMES.FAILED]: partitions.failedIds,
    [SAVE_SPELL_OUTCOMES.IMMUNE]: partitions.immuneIds,
  };

  const conditionApplications = [];
  for (const outcome of OUTCOME_KEYS) {
    const outcomeTargetIds = idsByOutcome[outcome];
    if (!outcomeTargetIds.length) continue;
    for (const rule of normalizedAutomation.rulesByOutcome[outcome]) {
      const grouped = new Map();
      for (const targetId of outcomeTargetIds) {
        if (rule.context && !contextConditionMatches(
          targeting?.targetContext?.contextByTarget?.[targetId] || {},
          rule.context,
        )) continue;
        const options = {
          ...(spellEffectTheme ? { theme: spellEffectTheme } : {}),
          ...clone(rule.options),
          ...contextModifierOptions(targeting, targetId, outcome, rule.conditionName),
        };
        const key = JSON.stringify(options);
        const group = grouped.get(key) || { ...options, targetIds: [] };
        group.targetIds.push(targetId);
        grouped.set(key, group);
      }
      for (const group of grouped.values()) {
        conditionApplications.push({
          outcome,
          targetIds: group.targetIds,
          conditionName: rule.conditionName,
          options: Object.fromEntries(
            Object.entries(group).filter(([key]) => key !== "targetIds"),
          ),
        });
      }
    }
  }

  const automaticInvolvedIds = targeting?.targetContext?.automaticInvolvedIds || [];
  const involvedOnOutcomes = targeting?.targetContext?.involvedOnOutcomes || [];
  const involvedTargetIds = uniqueIds([
    ...automaticInvolvedIds,
    ...involvedOnOutcomes.flatMap((outcome) => idsByOutcome[outcome] || []),
  ]);
  for (const effect of targeting?.targetContext?.effects || []) {
    const effectTargetIds = contextEffectTargetIds(
      targeting,
      effect.classification,
      involvedTargetIds,
    );
    for (const targetId of effectTargetIds) {
      const application = contextEffectApplication(effect, targetId, targeting);
      if (application) conditionApplications.push(application);
    }
  }

  const spellTargetIds = uniqueIds([
    ...normalizedAutomation.trackOutcomes.flatMap(
      (outcome) => idsByOutcome[outcome] || [],
    ),
    ...(targeting?.targetContext?.trackInvolved ? involvedTargetIds : []),
  ]);
  const errors = [];
  if (!spellId || !spellName) errors.push("spell-required");
  if (!targets.length && !allowEmptyTargets) errors.push("targets-required");
  if (partitions.missingIds.length) errors.push("outcomes-incomplete");
  if (concentration && !caster) errors.push("caster-required");
  if (targeting && !targeting.valid) {
    for (const error of targeting.errors) {
      if (!errors.includes(error)) errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    spellId,
    spellName,
    concentration,
    casterId: caster,
    targetIds: targets,
    ...partitions,
    spellTargetIds,
    conditionApplications,
    trackOutcomes: [...normalizedAutomation.trackOutcomes],
    ...(saveWorkflowRule?.persistence && typeof saveWorkflowRule.persistence === "object"
      ? { persistence: clone(saveWorkflowRule.persistence) }
      : {}),
    ...(targeting?.choice ? { choice: targeting.choice } : {}),
    ...(targeting ? { targeting } : {}),
    ...(targeting?.targetContext
      ? {
        targetContexts: targeting.targetContext.contextByTarget,
        involvedTargetIds,
        automaticTargetIds: targeting.targetContext.automaticTargetIds,
        automaticOutcomeByTarget: targeting.targetContext.automaticOutcomeByTarget,
      }
      : {}),
  };
}
