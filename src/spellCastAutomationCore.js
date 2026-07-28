import { normalizeSaveSpellAutomation } from "./saveSpellCore.js";

function conditionName(value) {
  return typeof value === "string"
    ? String(value || "").trim()
    : String(value?.name || value?.conditionName || value?.condition || "").trim();
}

function normalizedName(value) {
  return conditionName(value).toLocaleLowerCase("it");
}

function effectId(value) {
  return String(value?.id || value?.effectId || value?.options?.effectId || "").trim();
}

function uniqueConditions(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const name = normalizedName(value);
    if (!name) return false;
    const key = `${name}\u0000${effectId(value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Converte le regole "fallito" della Console HP nel formato già consumato
 * dal pannello Spells. I bersagli selezionati nel pannello sono quindi
 * trattati come i bersagli che hanno fallito il TS.
 */
export function buildSpellCastAutomationPlan({
  proposedConditions = [],
  proposedEffects = [],
  saveAutomation = null,
  applyAutomatedConditions = true,
  hasEffectChoices = false,
} = {}) {
  const baseConditions = applyAutomatedConditions
    ? uniqueConditions(Array.isArray(proposedConditions) ? proposedConditions : [])
    : [];
  const baseEffects = Array.isArray(proposedEffects)
    ? proposedEffects.filter((effect) => effect?.kind === "buff" || effect?.kind === "debuff")
    : [];

  if (
    !applyAutomatedConditions
    || !saveAutomation
    || (
      saveAutomation.concentrationAction === "dismiss"
      && saveAutomation.applyOnSpellCast !== true
    )
  ) {
    return {
      conditions: baseConditions,
      effects: baseEffects,
      usedSaveAutomation: false,
    };
  }

  const normalized = normalizeSaveSpellAutomation(saveAutomation);
  const failedRules = normalized.rulesByOutcome.failed || [];
  if (!failedRules.length) {
    return {
      conditions: baseConditions,
      effects: baseEffects,
      usedSaveAutomation: false,
    };
  }

  const saveEffectIds = new Set(failedRules.map(effectId).filter(Boolean));
  const selectedEffectIds = new Set(baseEffects.map(effectId).filter(Boolean));
  const selectedChoiceMatchesSaveEffect = [...saveEffectIds].some((id) =>
    selectedEffectIds.has(id)
  );

  // Alcuni spell riusano lo stesso menu per effetti alternativi. Se la
  // variante scelta non contiene l'effetto da TS (es. fumo di Pirotecnica),
  // non va applicata la regola della variante diversa.
  if (hasEffectChoices && saveEffectIds.size && !selectedChoiceMatchesSaveEffect) {
    return {
      conditions: baseConditions,
      effects: baseEffects,
      usedSaveAutomation: false,
    };
  }

  const saveConditions = uniqueConditions(failedRules.map((rule) => ({
    name: rule.conditionName,
    options: { ...rule.options },
  })));
  const saveNames = new Set(saveConditions.map(normalizedName));
  const conditions = uniqueConditions([
    ...baseConditions.filter((condition) => !saveNames.has(normalizedName(condition))),
    ...saveConditions,
  ]);
  const effects = baseEffects.filter((effect) => !saveEffectIds.has(effectId(effect)));

  return {
    conditions,
    effects,
    usedSaveAutomation: true,
    ...(saveAutomation.concentrationAction === "dismiss"
      ? { concentrationAction: "dismiss" }
      : {}),
  };
}
