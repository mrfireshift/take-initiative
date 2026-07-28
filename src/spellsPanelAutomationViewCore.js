import { buildSpellCastAutomationPlan } from "./spellCastAutomationCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";
import {
  getAreaSaveAutomation,
  getAreaSaveRuleChoices,
  getProposedConditions,
  getSpellEffectChoices,
  getSpellEffects,
} from "./spells-srd.js";

function spellChoiceOptions(spell, areaRuleChoices, effectChoices) {
  if (spell?.automation?.mode === "choice") {
    return (spell.automation.choices || []).map((choice) => ({
      value: String(choice),
      label: String(choice),
    }));
  }
  if (areaRuleChoices.length) {
    return areaRuleChoices.map((choice) => ({
      value: String(choice.value),
      label: String(choice.label),
    }));
  }
  return effectChoices.map((choice) => ({
    value: String(choice.value),
    label: String(choice.label),
  }));
}

function selectedSpellChoice(choices, previousChoice) {
  const previous = String(previousChoice || "");
  return choices.some((choice) => choice.value === previous)
    ? previous
    : choices[0]?.value || "";
}

export function buildSpellAutomationViewModel({
  spell,
  castContext = {},
  previousChoice = "",
} = {}) {
  if (!spell) return null;

  const phasePlan = getSpellCastPhasePlan(spell, "", castContext);
  const automation = spell.automation;
  const areaRuleChoices = getAreaSaveRuleChoices(spell);
  const effectChoices = getSpellEffectChoices(spell);
  const choices = spellChoiceOptions(spell, areaRuleChoices, effectChoices);
  const selectedChoice = selectedSpellChoice(choices, previousChoice);
  const catalogEffects = getSpellEffects(spell, selectedChoice, castContext);
  const phaseEffects = phasePlan.effects === null ? catalogEffects : phasePlan.effects;
  const previewPlan = phasePlan.useCatalogAutomation
    ? buildSpellCastAutomationPlan({
      proposedConditions: getProposedConditions(spell, selectedChoice),
      proposedEffects: phaseEffects,
      saveAutomation: getAreaSaveAutomation(spell, selectedChoice),
      applyAutomatedConditions: true,
      hasEffectChoices: effectChoices.length > 0,
    })
    : {
      conditions: [],
      effects: phaseEffects,
      usedSaveAutomation: false,
    };
  const targetMode = phasePlan.subjectMode || spell.targetMode;
  const targetLabel = targetMode === "self" || targetMode === "caster"
    ? "caster"
    : previewPlan.usedSaveAutomation
      ? "token selezionati con esito configurato"
      : "token selezionati";
  const conditionLabels = previewPlan.conditions.map((condition) =>
    typeof condition === "string" ? condition : condition.name
  );
  const effectLabels = previewPlan.effects.map((effect) => effect.label);
  const effectsLabel = effectLabels.length
    ? " Pill effetto: " + effectLabels.join(", ") + "."
    : "";
  const durationLabel = spell.duration
    ? " Durata da catalogo: " + spell.duration + "."
      + (spell.defaultTurns ? "" : " Imposta i round manualmente.")
    : "";
  const hasAutomatedConditions = conditionLabels.length > 0;
  const hasChoices = phasePlan.useCatalogAutomation && (
    automation?.mode === "choice"
    || areaRuleChoices.length > 0
    || effectChoices.length > 0
  );

  let showChoice = false;
  let text = "";
  if (!hasAutomatedConditions) {
    showChoice = hasChoices;
    text = (effectLabels.length ? "Tracciamento con effetti." : "Solo tracciamento.")
      + " Bersaglio: " + targetLabel + "." + effectsLabel + durationLabel;
  } else if (automation?.mode === "choice") {
    showChoice = true;
    text = "Scegli condizione; bersaglio: " + targetLabel + "."
      + effectsLabel + durationLabel;
  } else if (areaRuleChoices.length) {
    showChoice = true;
    text = "Ai bersagli selezionati con TS fallito applica: "
      + conditionLabels.join(", ") + "." + effectsLabel + durationLabel;
  } else {
    showChoice = effectChoices.length > 0;
    const prefix = automation?.mode === "automatic"
      ? "Applica automaticamente: "
      : "Dopo gli esiti, applica: ";
    text = prefix + conditionLabels.join(", ")
      + ". Bersaglio: " + targetLabel + "."
      + effectsLabel + durationLabel;
  }

  return {
    spellId: String(spell.id || ""),
    phasePlan,
    choices,
    selectedChoice,
    conditionLabels,
    effectLabels,
    targetLabel,
    hasAutomatedConditions,
    showChoice,
    text,
  };
}
