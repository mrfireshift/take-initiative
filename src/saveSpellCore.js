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
  if (rule.manualRemoval === true) options.manualRemoval = true;
  if (rule.endsParentOnRemoval === true) options.endsParentOnRemoval = true;

  return { conditionName, options };
}

export function normalizeSaveSpellAutomation(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const rulesByOutcome = {};
  for (const outcome of OUTCOME_KEYS) {
    rulesByOutcome[outcome] = (Array.isArray(source[outcome]) ? source[outcome] : [])
      .map(normalizeConditionRule)
      .filter(Boolean);
  }

  const explicitTrackOutcomes = uniqueIds(source.trackOutcomes)
    .map((outcome) => outcome.toLocaleLowerCase("it"))
    .filter((outcome) => OUTCOME_SET.has(outcome));
  const trackOutcomes = explicitTrackOutcomes.length
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

export function resolveSaveSpellResolution({
  spell = null,
  casterId = "",
  targetIds = [],
  outcomes = new Map(),
  automation = null,
} = {}) {
  const targets = uniqueIds(targetIds);
  const caster = String(casterId || "").trim();
  const spellId = String(spell?.id || "").trim();
  const spellName = String(spell?.displayName || spell?.name || "").trim();
  const concentration = spell?.concentration === true;
  const partitions = partitionSaveSpellTargets(targets, outcomes);
  const normalizedAutomation = normalizeSaveSpellAutomation(
    automation ?? spell?.saveAutomation ?? {}
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
      conditionApplications.push({
        outcome,
        targetIds: [...outcomeTargetIds],
        conditionName: rule.conditionName,
        options: clone(rule.options),
      });
    }
  }

  const spellTargetIds = uniqueIds(normalizedAutomation.trackOutcomes.flatMap(
    (outcome) => idsByOutcome[outcome] || []
  ));
  const errors = [];
  if (!spellId || !spellName) errors.push("spell-required");
  if (!targets.length) errors.push("targets-required");
  if (partitions.missingIds.length) errors.push("outcomes-incomplete");
  if (concentration && !caster) errors.push("caster-required");

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
  };
}
