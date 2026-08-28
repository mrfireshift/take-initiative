import {
  getAreaSaveAutomation,
  getSpellChoiceTiming,
  getProposedConditions,
  getSpellEffectChoices,
  getSpellEffects,
  getSpellSummaryParts,
  getSpellAttackResolution,
} from "./spells-srd.js";
import { buildSpellCastAutomationPlan } from "./spellCastAutomationCore.js";
import { resolveSpellConcentration } from "./spellCastContextCore.js";
import { resolveSaveSpellResolution } from "./saveSpellCore.js";
import { getSpellSaveWorkflowRule } from "./spellSaveWorkflowRules.js";
import {
  getSpellCastPhasePlan,
  withSpellPhaseTransitionOperations,
} from "./spellCastPhaseCore.js";
import { catalogSpellApplicationOperations } from "./spellLifecycleOperationsCore.js";
import { spellEffectThemeFor } from "./spellColorCore.js";

const uniqueIds = (values) => Array.from(new Set((values || []).filter(Boolean)));

function normalizeAttackOutcome(value) {
  const outcome = String(value || "").trim().toLocaleLowerCase("it");
  if (["hit", "colpito", "successo"].includes(outcome)) return "hit";
  if (["miss", "mancato", "fallimento"].includes(outcome)) return "miss";
  if (["critical", "critico", "critico!", "crit"].includes(outcome)) return "critical";
  return "";
}

function normalizedSaveOutcomes(value, targetIds, singleOutcome) {
  const result = {};
  if (value instanceof Map) {
    for (const [targetId, outcome] of value.entries()) {
      if (targetId) result[String(targetId)] = String(outcome || "").trim().toLocaleLowerCase("it");
    }
  } else if (value && typeof value === "object") {
    for (const [targetId, outcome] of Object.entries(value)) {
      if (targetId) result[targetId] = String(outcome || "").trim().toLocaleLowerCase("it");
    }
  }
  const scalar = String(singleOutcome || "").trim().toLocaleLowerCase("it");
  if (scalar && targetIds.length === 1 && !result[targetIds[0]]) result[targetIds[0]] = scalar;
  return result;
}

const INITIAL_SPELL_USE_RULES = Object.freeze({
  "xanathar-corona-di-stelle": Object.freeze({
    key: "stars",
    label: "stelle",
    baseSlot: 7,
    baseUses: 7,
    usesPerSlot: 2,
  }),
  "xanathar-frecce-infuocate": Object.freeze({
    key: "ammunition",
    label: "munizioni",
    baseSlot: 3,
    baseUses: 12,
    usesPerSlot: 2,
  }),
});

function initialSpellUses(spell, castContext = {}) {
  const context = castContext && typeof castContext === "object" ? { ...castContext } : {};
  const rule = INITIAL_SPELL_USE_RULES[spell?.id];
  if (!rule) return context;
  const slotLevel = Math.max(
    rule.baseSlot,
    Math.min(9, Math.floor(Number(context.slotLevel) || rule.baseSlot)),
  );
  const total = rule.baseUses + Math.max(0, slotLevel - rule.baseSlot) * rule.usesPerSlot;
  return {
    ...context,
    uses: {
      key: rule.key,
      label: rule.label,
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
  attackOutcome = undefined,
  saveOutcomes = undefined,
  saveOutcome = "",
  damageValue = undefined,
  primaryDamageValue = undefined,
  primaryTargetId = "",
  manualAttackOutcomeRequired = false,
  ignoreTargetLimit = false,
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
  const summaryParts = getSpellSummaryParts(spell, selectedChoice, persistedCastContext);
  const attackResolution = getSpellAttackResolution(
    spell,
    selectedChoice,
    persistedCastContext,
  );
  const phaseEffects = resolvedPhasePlan.effects === null
    ? catalogEffects
    : resolvedPhasePlan.effects;
  let castAutomationPlan = resolvedPhasePlan.useCatalogAutomation
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
  const normalizedAttackOutcome = normalizeAttackOutcome(attackOutcome);
  const attackContract = resolvedPhasePlan.attack && typeof resolvedPhasePlan.attack === "object"
    ? resolvedPhasePlan.attack
    : null;
  const attackOutcomeSupplied = attackOutcome !== undefined;
  if (
    resolvedPhasePlan.phase === "resolve"
    && attackContract?.required === true
    && manualAttackOutcomeRequired === true
    && !normalizedAttackOutcome
  ) {
    throw new Error("attack-outcome-required");
  }
  if (attackOutcomeSupplied && !normalizedAttackOutcome) {
    throw new Error("attack-outcome-invalid");
  }
  const normalizedSaveOutcomeMap = normalizedSaveOutcomes(
    saveOutcomes,
    subjects,
    saveOutcome,
  );
  const saveRequired = resolvedPhasePlan.phase === "resolve"
    && !!resolvedPhasePlan.resolution?.mechanics?.savingThrow;
  if (
    saveRequired
    && manualAttackOutcomeRequired === true
    && normalizedAttackOutcome !== "miss"
    && subjects.some((targetId) => !normalizedSaveOutcomeMap[targetId])
  ) {
    throw new Error("save-outcome-required");
  }
  const explicitSaveOutcomes = Object.keys(normalizedSaveOutcomeMap).length > 0;
  const saveResolution = explicitSaveOutcomes && saveRequired
    ? resolveSaveSpellResolution({
      spell,
      casterId,
      targetIds: subjects,
      outcomes: normalizedSaveOutcomeMap,
      automation: getAreaSaveAutomation(spell, selectedChoice),
      saveWorkflowRule: getSpellSaveWorkflowRule(spell?.id),
      choiceValue: selectedChoice,
      slotLevel: persistedCastContext?.slotLevel,
      validateSpatial: false,
      ignoreTargetLimit,
    })
    : null;
  if (saveResolution && !saveResolution.valid) {
    throw new Error(`save-resolution-invalid: ${saveResolution.errors.join(", ")}`);
  }
  if (saveResolution) {
    // Quando il tavolo ha già fornito l'esito, le regole di automazione non
    // possono più trattare implicitamente tutti i bersagli come falliti.
    // Le applicazioni target-specifiche arrivano dal resolver condiviso.
    castAutomationPlan = {
      ...castAutomationPlan,
      conditions: [],
    };
  }
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
    summaryParts,
    phasePlan: resolvedPhasePlan,
    spell,
    attackResolution,
    attackOutcome: normalizedAttackOutcome,
    attackOutcomeSupplied,
    manualAttackOutcomeRequired: manualAttackOutcomeRequired === true,
    primaryDamageValue,
    primaryTargetId: String(primaryTargetId || "").trim(),
    ignoreTargetLimit: ignoreTargetLimit === true,
    saveOutcomes: normalizedSaveOutcomeMap,
    saveResolution,
    damageValue,
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
    summaryParts,
    phasePlan,
    spell,
    attackResolution,
    attackOutcome,
    damageValue,
    primaryDamageValue,
    primaryTargetId,
    saveResolution,
    saveOutcomes,
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
  const initialDamage = phasePlan?.resolution?.mechanics?.damageBonus || null;
  const hasPersistentResolutionEffect = castAutomationPlan.conditions.length > 0
    || castAutomationPlan.effects.length > 0
    || (saveResolution?.conditionApplications?.length || 0) > 0;
  const resolvedConcentrationAction = phasePlan.phase === "resolve"
    && concentrationAction === "extend"
    && saveResolution
    && !hasPersistentResolutionEffect
    ? "dismiss"
    : concentrationAction;
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
    ...(summaryParts.length ? { summaryParts } : {}),
    proposedConditions: castAutomationPlan.conditions,
    proposedEffects: [
      ...castAutomationPlan.effects,
      ...(attackResolution?.effect ? [attackResolution.effect] : []),
    ],
    conditionApplications: saveResolution?.conditionApplications || [],
    conditionOptions: {
      sourceId: casterId || "",
      sourceName: casterName,
      appliedAt,
      ...(Number.isFinite(Number(persistedCastContext?.spellSaveDC))
        ? {
          spellSaveDC: Math.max(
            0,
            Math.min(99, Math.round(Number(persistedCastContext.spellSaveDC))),
          ),
        }
        : {}),
      expiry,
      ...(spellEffectTheme ? { theme: spellEffectTheme } : {}),
    },
    concentrationAction: resolvedConcentrationAction,
    concentrationReference: phasePlan.phase === "resolve"
      ? activeConcentration?.instanceId || null
      : null,
    casterName,
    onSpellEnd: spell?.onSpellEnd,
    persistSpell: !attackResolution,
  });
  const operations = withSpellPhaseTransitionOperations({
    operations: lifecycleOperations,
    phasePlan,
    concentrationAction: resolvedConcentrationAction,
    activeConcentration,
    casterId,
  });

  const attackHistory = attackResolution
    ? ` · ${attackResolution.outcomeLabel}: ${attackResolution.initialDamage.dice} ${attackResolution.initialDamage.factor === "half" ? "(metà)" : "(pieno)"} manuali`
    : "";
  return {
    concentrationAction: resolvedConcentrationAction,
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
    attackOutcome,
    damageValue,
    primaryDamageValue,
    primaryTargetId,
    saveOutcomes,
    initialDamage,
    summaryParts,
    damageRequired: phasePlan.phase === "resolve" && !!initialDamage,
    phasePlan,
    spellExpiry,
  };
}
