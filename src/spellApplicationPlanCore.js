import {
  getAreaSaveAutomation,
  getSpellChoiceTiming,
  getProposedConditions,
  getSpellEffectChoices,
  getSpellEffects,
} from "./spells-srd.js";
import { buildSpellCastAutomationPlan } from "./spellCastAutomationCore.js";
import { resolveSpellConcentration } from "./spellCastContextCore.js";
import {
  getSpellCastPhasePlan,
  withSpellPhaseTransitionOperations,
} from "./spellCastPhaseCore.js";
import { catalogSpellApplicationOperations } from "./spellLifecycleOperationsCore.js";

const uniqueIds = (values) => Array.from(new Set((values || []).filter(Boolean)));

export function buildSpellApplicationIntent({
  spell = null,
  enteredName = "",
  turns = 1,
  casterId = "",
  targetIds = [],
  castContext = {},
  selectedChoice = "",
  phasePlan = null,
  applyAutomatedConditions = true,
  activeConcentration = null,
  historyLabel = "",
  requestedConcentration = false,
} = {}) {
  const subjects = uniqueIds(targetIds);
  if (!subjects.length) return null;

  const name = spell?.displayName || enteredName;
  const resolvedPhasePlan = phasePlan || getSpellCastPhasePlan(spell, "", castContext);
  const wantsConcentration = resolveSpellConcentration(spell, requestedConcentration);
  const persistedCastContext = {
    ...(castContext && typeof castContext === "object" ? castContext : {}),
    phase: resolvedPhasePlan.phase,
    choice: String(selectedChoice || ""),
    applyAutomatedConditions: applyAutomatedConditions !== false,
  };
  const catalogEffects = getSpellEffects(spell, selectedChoice, persistedCastContext);
  const phaseEffects = resolvedPhasePlan.effects === null
    ? catalogEffects
    : resolvedPhasePlan.effects;
  const castAutomationPlan = resolvedPhasePlan.useCatalogAutomation
    ? buildSpellCastAutomationPlan({
      proposedConditions: getProposedConditions(spell, selectedChoice),
      proposedEffects: phaseEffects,
      saveAutomation: getAreaSaveAutomation(spell, selectedChoice),
      applyAutomatedConditions,
      hasEffectChoices: getSpellEffectChoices(spell).length > 0,
    })
    : {
      conditions: [],
      effects: phaseEffects,
      usedSaveAutomation: false,
    };
  const choiceTiming = getSpellChoiceTiming(spell, selectedChoice, persistedCastContext);
  const concentrationAction = castAutomationPlan.concentrationAction
    || choiceTiming?.concentrationAction
    || resolvedPhasePlan.concentrationAction
    || "replace";
  if (
    resolvedPhasePlan.phase === "resolve"
    && concentrationAction === "extend"
    && !activeConcentration?.instanceId
  ) {
    throw new Error("prepared-instance-required");
  }

  return {
    activeConcentration,
    castAutomationPlan,
    casterId,
    choiceTiming,
    concentrationAction,
    enteredName,
    historyLabel,
    name,
    persistedCastContext,
    phasePlan: resolvedPhasePlan,
    spell,
    subjects,
    turns,
    wantsConcentration,
  };
}

export function buildSpellApplicationPlan({
  intent = null,
  instanceId = "",
  appliedAt = null,
  casterName = "",
} = {}) {
  if (!intent) return null;

  const {
    activeConcentration,
    castAutomationPlan,
    casterId,
    choiceTiming,
    concentrationAction,
    enteredName,
    historyLabel,
    name,
    persistedCastContext,
    phasePlan,
    spell,
    subjects,
    turns,
    wantsConcentration,
  } = intent;
  const spellExpiry = choiceTiming && Object.prototype.hasOwnProperty.call(
    choiceTiming,
    "spellExpiry",
  )
    ? choiceTiming.spellExpiry
    : spell?.expiry ? { ...spell.expiry } : null;
  const expiry = spellExpiry || (wantsConcentration
    ? { mode: "concentration" }
    : { mode: "rounds", remaining: turns });
  const lifecycleOperations = catalogSpellApplicationOperations({
    targetIds: subjects,
    casterId,
    enteredName,
    name,
    storedName: spell?.name,
    turns,
    concentration: wantsConcentration,
    instanceId,
    spellId: spell?.id || "",
    spellExpiry,
    appliedAt,
    castContext: persistedCastContext,
    proposedConditions: castAutomationPlan.conditions,
    proposedEffects: castAutomationPlan.effects,
    conditionOptions: {
      sourceId: casterId || "",
      sourceName: casterName,
      appliedAt,
      expiry,
    },
    concentrationAction,
  });
  const operations = withSpellPhaseTransitionOperations({
    operations: lifecycleOperations,
    phasePlan,
    concentrationAction,
    activeConcentration,
    casterId,
  });

  return {
    concentrationAction,
    historyLabel: historyLabel || (
      phasePlan.phase === "prepare"
        ? "Preparazione: " + name
        : phasePlan.phase === "resolve"
          ? "Risoluzione: " + name
          : "Incantesimo: " + name
    ),
    name,
    operations,
    phasePlan,
    spellExpiry,
  };
}
