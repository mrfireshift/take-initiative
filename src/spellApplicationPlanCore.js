import {
  getAreaSaveAutomation,
  getSpellChoiceTiming,
  getProposedConditions,
  getSpellEffectChoices,
  getSpellEffects,
  getSpellAttackResolution,
} from "./spells-srd.js";
import { buildSpellCastAutomationPlan } from "./spellCastAutomationCore.js";
import { resolveSpellConcentration } from "./spellCastContextCore.js";
import {
  getSpellCastPhasePlan,
  withSpellPhaseTransitionOperations,
} from "./spellCastPhaseCore.js";
import { catalogSpellApplicationOperations } from "./spellLifecycleOperationsCore.js";
import { spellEffectThemeFor } from "./spellColorCore.js";

const uniqueIds = (values) => Array.from(new Set((values || []).filter(Boolean)));

function initialSpellUses(spell, castContext = {}) {
  const context = castContext && typeof castContext === "object" ? { ...castContext } : {};
  if (spell?.id !== "xanathar-corona-di-stelle") return context;
  const slotLevel = Math.max(7, Math.min(9, Math.floor(Number(context.slotLevel) || 7)));
  const total = 7 + Math.max(0, slotLevel - 7) * 2;
  return {
    ...context,
    uses: {
      key: "stars",
      label: "stelle",
      remaining: total,
      total,
      showInPill: true,
    },
  };
}

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
  const persistedCastContext = initialSpellUses(spell, {
    ...(castContext && typeof castContext === "object" ? castContext : {}),
    phase: resolvedPhasePlan.phase,
    choice: String(selectedChoice || ""),
    applyAutomatedConditions: applyAutomatedConditions !== false,
  });
  const catalogEffects = getSpellEffects(spell, selectedChoice, persistedCastContext);
  const attackResolution = getSpellAttackResolution(
    spell,
    selectedChoice,
    persistedCastContext,
  );
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
    attackResolution,
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
    attackResolution,
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
  const spellEffectTheme = spellEffectThemeFor(spell);
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
    proposedEffects: [
      ...castAutomationPlan.effects,
      ...(attackResolution?.effect ? [attackResolution.effect] : []),
    ],
    conditionOptions: {
      sourceId: casterId || "",
      sourceName: casterName,
      appliedAt,
      expiry,
      ...(spellEffectTheme ? { theme: spellEffectTheme } : {}),
    },
    concentrationAction,
    casterName,
    onSpellEnd: spell?.onSpellEnd,
    persistSpell: !attackResolution,
  });
  const operations = withSpellPhaseTransitionOperations({
    operations: lifecycleOperations,
    phasePlan,
    concentrationAction,
    activeConcentration,
    casterId,
  });

  const attackHistory = attackResolution
    ? ` · ${attackResolution.outcomeLabel}: ${attackResolution.initialDamage.dice} ${attackResolution.initialDamage.factor === "half" ? "(metà)" : "(pieno)"} manuali`
    : "";
  return {
    concentrationAction,
    historyLabel: historyLabel || (
      phasePlan.phase === "prepare"
        ? "Preparazione: " + name
        : phasePlan.phase === "resolve"
          ? "Risoluzione: " + name
          : "Incantesimo: " + name
    ) + attackHistory,
    name,
    operations,
    attackResolution,
    phasePlan,
    spellExpiry,
  };
}
