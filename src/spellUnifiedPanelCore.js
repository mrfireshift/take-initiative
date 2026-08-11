import {
  getAreaSaveRuleChoices,
  getSpellDefinition,
  getSpellEffectChoices,
  getSpellAttackResolution,
} from "./spells-srd.js";
import {
  getSpellCastPhaseOptions,
  getSpellCastPhasePlan,
} from "./spellCastPhaseCore.js";
import { getSpellActiveResolutionActions } from "./spellActiveResolutionRules.js";
import {
  AREA_HEALING_SPELL_ID_SET,
  AREA_POPOVER_SAVE_SPELL_ID_SET,
  AREA_SAVE_SPELL_ID_SET,
} from "./areaSaveSpellRules.js";
import {
  getSpellAreaPlacementChoices,
  getSpellAreaRuleForPlacement,
  getSpellAreaRules,
} from "./spellAreaRules.js";
import {
  getSpellSaveWorkflowChoiceOptions,
  getSpellSaveWorkflowRule,
  getSpellSaveWorkflowTargetContext,
} from "./spellSaveWorkflowRules.js";
import {
  getSpellSaveTargetMaximum,
  MAX_SPELL_SLOT_LEVEL,
} from "./spellSaveTargetingCore.js";
import {
  getSpellBoardTokenPlacementRule,
  getSpellBoardTokenRule,
} from "./spellBoardTokenCore.js";
import {
  CHAIN_LIGHTNING_TARGETING,
  chainLightningSecondaryMaximum,
} from "./chainLightningTargetingCore.js";
import {
  getSpellCastResolutionRule,
  spellHasExplicitInitialHPPolicy,
} from "./spellCastResolutionRules.js";
import {
  spellAttackResolutionChoiceOptions,
} from "./spellAttackResolutionCore.js";

export const SPELL_UNIFIED_PANEL_LANES = Object.freeze({
  SPELL_LIFECYCLE: "spell-lifecycle",
  AREA_TRANSACTION: "area-transaction",
  ACTIVE_RESOLUTION: "active-resolution",
});

export const SPELL_UNIFIED_TARGETING_MODES = Object.freeze({
  NONE: "none",
  DISCRETE: "discrete",
  GEOMETRIC: "geometric",
});

export const SPELL_PANEL_PLACEMENT_POLICIES = Object.freeze({
  UNAVAILABLE: "unavailable",
  REQUIRED: "required",
  OPTIONAL: "optional",
  AUTOMATIC: "automatic",
});

export const SPELL_PANEL_FEEDBACK_STATES = Object.freeze({
  IDLE: "idle",
  INFO: "info",
  LOADING: "loading",
  ERROR: "error",
  SUCCESS: "success",
});

export const SPELL_PANEL_COMMIT_STATES = Object.freeze({
  IDLE: "idle",
  COMMITTING: "committing",
  COMMITTED: "committed",
  FAILED: "failed",
});

export const SPELL_PANEL_UNDO_STATES = Object.freeze({
  UNAVAILABLE: "unavailable",
  AVAILABLE: "available",
  UNDOING: "undoing",
  UNDONE: "undone",
  FAILED: "failed",
});

export const SPELL_PANEL_ACTIVE_ACTION_STATES = Object.freeze({
  IDLE: "idle",
  SELECTED: "selected",
  LOADING: "loading",
  OPENED: "opened",
  EXECUTED: "executed",
  FAILED: "failed",
});

export const SPELL_PANEL_VALIDATION_LABELS = Object.freeze({
  spell: "incantesimo",
  caster: "caster",
  "slot-level": "livello dello slot",
  duration: "durata",
  variant: "variante",
  targets: "bersagli",
  "primary-target": "bersaglio primario",
  "target-context": "contesto dei bersagli",
  placement: "posizione dell'area",
  outcomes: "esiti dei bersagli",
  damage: "danno",
  healing: "cura",
  execution: "pannello dedicato",
});

const SPELL_PANEL_VALIDATION_MESSAGES = Object.freeze({
  spell: "Seleziona un incantesimo",
  caster: "Seleziona il caster",
  "slot-level": "Scegli il livello dello slot",
  duration: "Inserisci la durata",
  variant: "Scegli una variante",
  targets: "Seleziona almeno un bersaglio",
  "primary-target": "Seleziona il bersaglio primario",
  "target-context": "Completa il contesto dei bersagli",
  placement: "Posiziona e conferma l'area",
  outcomes: "Registra l'esito di ogni bersaglio",
  damage: "Inserisci il valore del danno",
  healing: "Inserisci il valore della cura",
  execution: "Apri il pannello dedicato per continuare",
});

export function spellPanelValidationMessage(field) {
  return SPELL_PANEL_VALIDATION_MESSAGES[text(field)] || "Completa la configurazione";
}

const LANE_ORDER = Object.freeze([
  SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE,
  SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION,
  SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION,
]);

const CONTROL_ORDER = Object.freeze([
  "phase",
  "caster",
  "slot-level",
  "duration",
  "concentration",
  "targets",
  "primary-target",
  "placement",
  "rule-choice",
  "variant",
  "save-workflow",
  "save-outcomes",
  "attack-outcomes",
  "target-context",
  "hp",
  "damage",
  "healing",
  "active-action",
  "manual-effect",
  "undo",
]);

function text(value) {
  return String(value || "").trim();
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function positiveIntegerOrNull(value) {
  const number = integerOrNull(value);
  return number !== null && number > 0 ? number : null;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function uniqueById(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const id = text(value?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function uniqueByKey(values = [], key = "id") {
  const seen = new Set();
  return values.filter((value) => {
    const id = text(value?.[key]);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
}

function freezeValue(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeValue(child);
  return Object.freeze(value);
}

function immutable(value) {
  return freezeValue(cloneValue(value));
}

function resolveSpell(value, spellId = "") {
  if (value && typeof value === "object") return value;
  return getSpellDefinition(value || spellId);
}

function phaseOptions(spell) {
  const options = getSpellCastPhaseOptions(spell);
  if (options.length) {
    return options.map((option) => ({
      value: text(option.value),
      label: text(option.label) || text(option.value),
    }));
  }
  return [{ value: "cast", label: "Lancio" }];
}

function selectedPhase(options, requestedPhase = "") {
  const requested = text(requestedPhase);
  return options.some((option) => option.value === requested)
    ? requested
    : options[0]?.value || "cast";
}

function mergeActionDeclarations(spell, boardTokenRule, castRules = []) {
  const declarations = new Map();
  const sources = new Map();

  const add = (action, source) => {
    const id = text(action?.id);
    if (!id) return;
    declarations.set(id, {
      ...(declarations.get(id) || {}),
      ...cloneValue(action),
    });
    sources.set(id, unique([
      ...(sources.get(id) || []),
      source,
    ]));
  };

  for (const action of getSpellActiveResolutionActions(spell?.id)) {
    add(action, "active-resolution");
  }
  for (const action of Array.isArray(spell?.activeActions) ? spell.activeActions : []) {
    add(action, "catalog");
  }
  for (const action of Array.isArray(boardTokenRule?.actions) ? boardTokenRule.actions : []) {
    add(action, "board-token");
  }
  for (const rule of Array.isArray(castRules) ? castRules : []) {
    const movement = rule?.zonePolicy?.movement;
    if (!movement || typeof movement !== "object" || movement.mode !== "action") continue;
    const ruleId = text(rule.id);
    if (!ruleId) continue;
    add({
      id: `${ruleId}:move`,
      label: "Sposta zona",
      buttonLabel: "Sposta zona",
      detail: `Riposiziona la zona fino a ${movement.maximumMeters} m.`,
      economy: text(movement.economy),
      resolutionKind: "zone-movement",
      subjectMode: "none",
      requiresTargets: false,
      requiresParentInstance: true,
      requiresZoneRoot: true,
      rangeOrigin: "root",
      ruleId,
      movement: cloneValue(movement),
    }, "area-rule");
  }

  return [...declarations.entries()].map(([id, action]) => ({
    id,
    action,
    sources: sources.get(id) || [],
  }));
}

function actionSource(sources = []) {
  if (sources.includes("active-resolution")) return "active-resolution";
  if (sources.includes("board-token")) return "board-token";
  return "catalog";
}

function actionPlacementRule(action, choiceValue = "") {
  const ruleId = text(action?.placementRuleId);
  return ruleId
    ? getSpellAreaRuleForPlacement(ruleId, text(choiceValue) || action?.ruleChoice)
    : null;
}

function actionDescriptor(entry) {
  const action = entry.action;
  const rule = actionPlacementRule(action);
  const sources = entry.sources;
  const source = actionSource(sources);
  const resolutionKind = text(action.resolutionKind)
    || (source === "board-token" ? "board-token" : "");
  const maxTargets = Number.isInteger(Number(action.maxTargets))
    ? Math.max(0, Number(action.maxTargets))
    : null;
  const targeting = action.targeting && typeof action.targeting === "object"
    ? cloneValue(action.targeting)
    : {
      subjectMode: text(action.subjectMode) || "none",
      requiresTargets: action.requiresTargets === true,
      maxTargets,
      primaryTarget: action.primaryTarget ? cloneValue(action.primaryTarget) : null,
    };
  const availability = action.availability && typeof action.availability === "object"
    ? cloneValue(action.availability)
    : {
      ...(action.availableAfterCast === true ? { afterCast: true } : {}),
      ...(action.turnStartPrompt === true ? { turnStartPrompt: true } : {}),
    };
  const resource = action.resource && typeof action.resource === "object"
    ? cloneValue(action.resource)
    : action.uses && typeof action.uses === "object"
      ? cloneValue(action.uses)
      : action.charges && typeof action.charges === "object"
        ? cloneValue(action.charges)
        : null;
  const outcomeBehavior = action.outcomeBehavior && typeof action.outcomeBehavior === "object"
    ? cloneValue(action.outcomeBehavior)
    : action.outcomes && typeof action.outcomes === "object"
      ? cloneValue(action.outcomes)
      : null;
  const termination = action.termination && typeof action.termination === "object"
    ? cloneValue(action.termination)
    : action.terminationPolicy && typeof action.terminationPolicy === "object"
      ? cloneValue(action.terminationPolicy)
      : null;
  return {
    ...cloneValue(action),
    id: entry.id,
    definition: cloneValue(action),
    label: text(action.label) || entry.id,
    buttonLabel: text(action.buttonLabel) || text(action.label) || entry.id,
    detail: text(action.detail),
    economy: text(action.economy || action.actionEconomy),
    resolutionKind,
    subjectMode: text(action.subjectMode) || "none",
    requiresTargets: action.requiresTargets === true,
    maxTargets,
    range: action.range ? cloneValue(action.range) : null,
    rangeOrigin: text(action.rangeOrigin),
    requiresParentInstance: action.requiresParentInstance === true,
    requiresZoneRoot: action.requiresZoneRoot === true,
    placementRuleId: text(action.placementRuleId) || text(rule?.id),
    source,
    sources,
    capabilities: {
      placement: !!rule,
      save: resolutionKind === "save-area" || !!action.save,
      attack: Array.isArray(action.attack?.outcomes)
        && action.attack.outcomes.length > 0,
      hp: !!action.damage,
      zone: ["child-zone", "zone-movement"].includes(resolutionKind)
        || rule?.kind === "zone",
    },
    requirements: {
      parentInstance: action.requiresParentInstance === true,
      zoneRoot: action.requiresZoneRoot === true,
      targets: action.requiresTargets === true,
      choice: action.choice?.required === true,
    },
    resolution: {
      kind: resolutionKind || "manual",
      sourcePhase: text(action.sourcePhase || action.phaseSource),
      resultPhase: text(action.resultPhase || action.phaseResult),
    },
    targeting,
    area: action.area && typeof action.area === "object" ? cloneValue(action.area) : null,
    geometry: action.geometry && typeof action.geometry === "object"
      ? cloneValue(action.geometry)
      : null,
    zone: {
      ...(action.zone && typeof action.zone === "object" ? cloneValue(action.zone) : {}),
      root: action.requiresZoneRoot === true,
      parent: action.requiresParentInstance === true,
      child: action.childZone ? cloneValue(action.childZone) : null,
      movement: action.movement ? cloneValue(action.movement) : null,
    },
    attack: action.attack ? cloneValue(action.attack) : null,
    save: action.save ? cloneValue(action.save) : null,
    resource,
    availability,
    outcomeBehavior,
    termination,
  };
}

export function getSpellUnifiedActiveActionDeclarations(spellValue = null) {
  const spell = resolveSpell(spellValue);
  if (!spell) return [];
  const castRules = getSpellAreaRules(spell.id, { triggerType: "cast" });
  const boardTokenRule = getSpellBoardTokenRule(spell);
  return mergeActionDeclarations(spell, boardTokenRule, castRules)
    .map(actionDescriptor);
}

function placementDescriptor(rule) {
  if (!rule) return null;
  const placement = rule.placement || {};
  const geometry = rule.geometry || {};
  const choices = (Array.isArray(rule.placementChoices) ? rule.placementChoices : [])
    .map((choice) => ({
      value: text(choice.id),
      label: text(choice.label) || text(choice.id),
    }))
    .filter((choice) => choice.value);
  const automatic = rule.kind === "aura"
    && placement.origin === "caster"
    && !choices.length;
  const optional = rule.zonePolicy?.placementOptional === true;
  const policy = automatic
    ? SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC
    : optional
      ? SPELL_PANEL_PLACEMENT_POLICIES.OPTIONAL
      : SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED;
  return {
    ruleId: text(rule.id),
    spellId: text(rule.spellId),
    kind: text(rule.kind),
    mode: rule.kind === "board-token" ? "board-token" : "area",
    shape: text(geometry.shape),
    origin: text(placement.origin),
    direction: text(placement.direction),
    anchor: text(placement.anchor),
    range: placement.range ? cloneValue(placement.range) : null,
    choice: text(rule.placementChoice) || null,
    policy,
    required: policy === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED,
    automatic,
    optional,
    choices,
  };
}

function placementFor({
  castRules,
  boardTokenPlacementRule,
  selectedAction,
  choiceValue = "",
}) {
  const rules = selectedAction
    ? [actionPlacementRule(selectedAction, choiceValue)].filter(Boolean)
    : [
      ...castRules.map((rule) => {
        const requestedChoice = text(choiceValue);
        const hasChoice = (rule.placementChoices || [])
          .some((choice) => choice.id === requestedChoice);
        return hasChoice
          ? getSpellAreaRuleForPlacement(rule.id, requestedChoice)
          : rule;
      }),
      ...(castRules.length ? [] : [boardTokenPlacementRule].filter(Boolean)),
    ];
  const descriptors = uniqueByKey(
    rules.map(placementDescriptor).filter(Boolean),
    "ruleId",
  );
  const selected = descriptors[0] || null;
  return {
    available: descriptors.length > 0,
    required: descriptors.some((descriptor) => descriptor.required),
    policy: selected?.policy || SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE,
    mode: selected?.mode || "none",
    ruleId: selected?.ruleId || null,
    rules: descriptors,
    choices: descriptors.flatMap((descriptor) => descriptor.choices),
  };
}

function ruleTargeting(rule) {
  const targeting = rule?.targeting || {};
  return {
    filter: text(targeting.filter) || null,
    includeCaster: targeting.includeCaster === true,
    confirmTargets: targeting.confirmTargets === true,
    selectionMode: text(targeting.selectionMode) || "area",
    spatialRules: targeting.spatial ? cloneValue(targeting.spatial) : null,
  };
}

function chainLightningTargeting(spell) {
  return text(spell?.id) === CHAIN_LIGHTNING_TARGETING.spellId
    ? CHAIN_LIGHTNING_TARGETING
    : null;
}

function targetingLimit({ spell, targetingRule, selectedAction, chainRule, slotLevel = null }) {
  if (chainRule) {
    const resolvedSlot = integerOrNull(slotLevel) ?? chainRule.baseSlot;
    return {
      minimum: 1,
      maximum: 1 + chainLightningSecondaryMaximum(resolvedSlot, chainRule),
      baseMaximum: 1 + Number(chainRule.baseSecondaryMaximum || 0),
      additionalPerSlotAbove: Number(chainRule.additionalSecondaryPerSlotAbove || 0),
      baseSlot: Number(chainRule.baseSlot),
      maximumIncludesPrimary: true,
      source: "chain-lightning-targeting",
    };
  }
  if (targetingRule) {
    const normalizedRule = targetingRule.targeting || targetingRule;
    const baseMaximum = integerOrNull(normalizedRule.baseMaximum);
    const additionalPerSlotAbove = integerOrNull(normalizedRule.additionalPerSlotAbove);
    const baseSlot = integerOrNull(normalizedRule.baseSlot);
    const maximum = targetingRule.targeting
      ? getSpellSaveTargetMaximum(targetingRule, slotLevel)
      : getSpellSaveTargetMaximum({ targeting: normalizedRule }, slotLevel);
    return {
      minimum: 1,
      maximum,
      baseMaximum,
      additionalPerSlotAbove,
      baseSlot,
      maximumIncludesPrimary: true,
      source: "save-workflow",
    };
  }
  if (selectedAction && selectedAction.maxTargets !== null) {
    return {
      minimum: selectedAction.requiresTargets ? 1 : 0,
      maximum: selectedAction.maxTargets,
      baseMaximum: selectedAction.maxTargets,
      additionalPerSlotAbove: 0,
      baseSlot: null,
      maximumIncludesPrimary: true,
      source: "active-action",
    };
  }
  const spellTargeting = spell?.targeting && typeof spell.targeting === "object"
    ? spell.targeting
    : null;
  const spellMaximum = integerOrNull(spellTargeting?.maxTargets);
  const spellBaseMaximum = integerOrNull(spellTargeting?.baseMaximum);
  const spellAdditionalPerSlotAbove = integerOrNull(
    spellTargeting?.additionalPerSlotAbove,
  );
  const spellBaseSlot = integerOrNull(spellTargeting?.baseSlot);
  if (spellMaximum !== null || (
    spellBaseMaximum !== null
    && spellAdditionalPerSlotAbove !== null
    && spellBaseSlot !== null
  )) {
    const maximum = spellMaximum !== null
      ? spellMaximum
      : spellBaseMaximum + Math.max(
        0,
        Math.min(
          MAX_SPELL_SLOT_LEVEL,
          integerOrNull(slotLevel) ?? spellBaseSlot,
        ) - spellBaseSlot,
      ) * spellAdditionalPerSlotAbove;
    return {
      minimum: 1,
      maximum,
      baseMaximum: spellMaximum ?? spellBaseMaximum,
      additionalPerSlotAbove: spellMaximum === null
        ? spellAdditionalPerSlotAbove
        : 0,
      baseSlot: spellMaximum === null ? spellBaseSlot : null,
      maximumIncludesPrimary: true,
      source: "spell-targeting",
    };
  }
  return {
    minimum: 0,
    maximum: null,
    baseMaximum: null,
    additionalPerSlotAbove: 0,
    baseSlot: null,
    maximumIncludesPrimary: true,
    source: null,
  };
}

function primaryTargetDescriptor({ chainRule, selectedAction }) {
  if (chainRule) {
    return {
      required: true,
      maximum: 1,
      source: "chain-lightning-targeting",
      rangeMeters: numericOrNull(chainRule.primaryRangeMeters),
    };
  }
  if (selectedAction?.primaryTarget && typeof selectedAction.primaryTarget === "object") {
    return {
      required: selectedAction.primaryTarget.required === true,
      maximum: integerOrNull(selectedAction.primaryTarget.maximum),
      source: "active-action",
      ...cloneValue(selectedAction.primaryTarget),
    };
  }
  return {
    required: false,
    maximum: null,
    source: null,
    rangeMeters: null,
  };
}

function targetingSpatialRules({ selectedAction, chainRule, workflowTargeting, selectedRuleTargeting }) {
  if (chainRule) {
    return {
      mode: "primary-and-secondary-range",
      primaryRangeMeters: numericOrNull(chainRule.primaryRangeMeters),
      secondaryRangeMeters: numericOrNull(chainRule.secondaryRangeMeters),
      selectionMode: text(chainRule.selectionMode) || "primary-then-secondary",
      unit: "meters",
      source: "chain-lightning-targeting",
    };
  }
  if (workflowTargeting?.spatial) return cloneValue(workflowTargeting.spatial);
  if (selectedAction?.range && typeof selectedAction.range === "object") {
    return {
      mode: "action-range",
      range: cloneValue(selectedAction.range),
      origin: selectedAction.rangeOrigin || null,
      source: "active-action",
    };
  }
  return selectedRuleTargeting.spatialRules
    ? cloneValue(selectedRuleTargeting.spatialRules)
    : null;
}

function targetingDescriptor({
  spell,
  phasePlan,
  castRules,
  boardTokenPlacementRule,
  selectedAction,
  choiceValue = "",
  workflowRule,
  areaPlacement,
  slotLevel = null,
}) {
  const areaCatalogEnabled = phasePlan.phase !== "prepare";
  const actionRule = selectedAction
    ? actionPlacementRule(selectedAction, choiceValue)
    : null;
  const subjectMode = text(selectedAction?.subjectMode) || text(phasePlan.subjectMode) || "selected";
  let mode = SPELL_UNIFIED_TARGETING_MODES.NONE;
  let source = "subject-mode";
  let rule = actionRule || castRules[0] || null;

  if (selectedAction) {
    if (actionRule) {
      mode = SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC;
      source = "active-action-placement";
    } else if (
      selectedAction.requiresTargets
      || (selectedAction.maxTargets || 0) > 0
      || subjectMode === "selected"
      || selectedAction.resolutionKind === "single-attack"
      || selectedAction.source === "board-token"
    ) {
      mode = SPELL_UNIFIED_TARGETING_MODES.DISCRETE;
      source = "active-action";
      rule = null;
    }
  } else if (castRules.length || boardTokenPlacementRule) {
    mode = SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC;
    source = castRules.length ? "area-rule" : "board-token-placement";
    rule = castRules[0] || boardTokenPlacementRule;
  } else if (
    workflowRule
    || (areaCatalogEnabled && AREA_POPOVER_SAVE_SPELL_ID_SET.has(spell.id))
    || subjectMode === "selected"
  ) {
    mode = SPELL_UNIFIED_TARGETING_MODES.DISCRETE;
    source = workflowRule ? "save-workflow" : "area-save-catalog";
    rule = null;
  }

  const selectedRuleTargeting = ruleTargeting(rule);
  const workflowTargeting = workflowRule?.targeting
    ? cloneValue(workflowRule.targeting)
    : null;
  const chainRule = chainLightningTargeting(spell);
  const limit = targetingLimit({
    spell,
    targetingRule: workflowRule || chainRule,
    selectedAction,
    chainRule,
    slotLevel,
  });
  const primaryTarget = primaryTargetDescriptor({ chainRule, selectedAction });
  const spatialRules = targetingSpatialRules({
    selectedAction,
    chainRule,
    workflowTargeting,
    selectedRuleTargeting,
  });
  return {
    mode,
    source,
    subjectMode,
    ruleIds: unique([
      ...castRules.map((entry) => entry.id),
      actionRule?.id,
      areaPlacement.ruleId,
    ]),
    ...selectedRuleTargeting,
    primaryTarget,
    limit,
    spatialRules,
    workflow: workflowTargeting,
  };
}

function hasExplicitDamage({
  spell,
  phasePlan,
  boardTokenRule,
  actions,
  castRules,
}) {
  const explicitPolicy = spellHasExplicitInitialHPPolicy(spell);
  if (explicitPolicy !== null) return explicitPolicy;
  if (getSpellAttackResolution(spell)) return true;
  if (AREA_HEALING_SPELL_ID_SET.has(text(spell?.id))) return true;
  if (phasePlan?.phase !== "prepare" && (phasePlan?.effects || []).some((effect) =>
    !!effect?.mechanics?.areaDamage
    || !!effect?.mechanics?.damage
    || !!effect?.mechanics?.ongoingDamage
  )) return true;
  if (phasePlan?.resolution?.mechanics?.areaDamage
    || phasePlan?.resolution?.mechanics?.damage
    || phasePlan?.resolution?.mechanics?.damageReplacement) return true;
  if ((castRules || []).some((rule) => rule?.zonePolicy?.initialResolution === "manual-save")) {
    return true;
  }
  return (castRules || []).some((rule) => rule?.kind === "instant")
    && text(spell?.damageType) !== "";
}

function hasPersistentArea(areaRules = []) {
  return areaRules.some((rule) => ["zone", "aura"].includes(rule.kind));
}

function hasAreaTransaction({
  spell,
  phasePlan,
  castRules,
  selectedAction,
  selectedActionRule,
}) {
  const areaCatalogEnabled = phasePlan.phase !== "prepare";
  const castResolution = getSpellCastResolutionRule(spell);
  return castRules.length > 0
    || castResolution?.resolution === "manual-damage"
    || (phasePlan?.phase === "resolve" && !!phasePlan?.resolution)
    || (areaCatalogEnabled && !!getSpellAttackResolution(spell))
    || (areaCatalogEnabled && AREA_POPOVER_SAVE_SPELL_ID_SET.has(text(spell?.id)))
    || (areaCatalogEnabled && AREA_SAVE_SPELL_ID_SET.has(text(spell?.id)))
    || (areaCatalogEnabled && AREA_HEALING_SPELL_ID_SET.has(text(spell?.id)))
    || !!selectedActionRule
    || ["save-area", "child-zone"].includes(selectedAction?.resolutionKind);
}

function saveOutcomeRequired({
  spell,
  phasePlan,
  castRules,
  selectedAction,
}) {
  const areaCatalogEnabled = phasePlan.phase !== "prepare";
  if (phasePlan?.resolution?.mechanics?.savingThrow) return true;
  if (selectedAction) {
    return selectedAction.capabilities.save;
  }
  if (castRules.some((rule) => rule.zonePolicy?.initialResolution === "manual-save")) {
    return true;
  }
  if (areaCatalogEnabled
    && !castRules.length
    && AREA_POPOVER_SAVE_SPELL_ID_SET.has(spell.id)) {
    return true;
  }
  return areaCatalogEnabled
    && AREA_SAVE_SPELL_ID_SET.has(spell.id)
    && castRules.some((rule) => rule.effectPolicy?.mode === "on-confirm");
}

function durationDescriptor(spell) {
  const label = text(spell?.duration);
  const defaultTurns = positiveIntegerOrNull(spell?.defaultTurns);
  const normalizedLabel = label.toLocaleLowerCase("it");
  const policy = normalizedLabel === "instantaneous"
    ? "instantaneous"
    : defaultTurns !== null
      ? "catalog-default"
      : label
        ? "catalog"
        : "manual";
  return {
    policy,
    label: label || null,
    defaultTurns,
    minTurns: policy === "manual" ? 1 : null,
    maxTurns: null,
    editable: policy === "manual",
  };
}

function slotDescriptor({ spell, workflowRule, selectedAction }) {
  const chainRule = chainLightningTargeting(spell);
  const actionSlot = selectedAction?.damage?.baseSlot;
  const minimum = Math.max(
    0,
    integerOrNull(workflowRule?.targeting?.baseSlot)
      ?? (chainRule ? Number(chainRule.baseSlot) : null)
      ?? integerOrNull(actionSlot)
      ?? Math.floor(Number(spell?.level) || 0),
  );
  const maximum = minimum > 0
    ? Math.max(
      minimum,
      integerOrNull(workflowRule?.targeting?.maxSlot)
        ?? (chainRule ? Number(chainRule.maxSlot) : 9),
    )
    : 0;
  const options = minimum > 0
    ? Array.from({ length: maximum - minimum + 1 }, (_, index) => {
      const value = minimum + index;
      return { value, label: `${value}° livello` };
    })
    : [];
  return {
    required: options.length > 0,
    visible: options.length > 0,
    min: options.length > 0 ? minimum : null,
    max: options.length > 0 ? maximum : null,
    default: options.length > 0 ? minimum : null,
    options,
    source: workflowRule?.targeting
      ? "save-workflow"
      : chainRule
        ? "chain-lightning-targeting"
        : "spell-level",
  };
}

function casterDescriptor({ spell, targeting, placement, selectedAction }) {
  const reasons = [];
  if (spell?.concentration === true) reasons.push("concentration");
  if (["self", "caster"].includes(targeting.subjectMode)) reasons.push("subject");
  if (["caster-range", "primary-and-secondary-range", "action-range"].includes(
    targeting.spatialRules?.mode,
  )) reasons.push("targeting-spatial");
  if (placement.rules.some((rule) => (
    ["caster", "caster-adjacent"].includes(rule.origin) || !!rule.range
  ))) {
    reasons.push("placement");
  }
  if (selectedAction?.requiresParentInstance === true) reasons.push("parent-instance");
  if (["caster", "root"].includes(selectedAction?.rangeOrigin)) reasons.push("action-range");
  return {
    required: reasons.length > 0,
    mode: reasons.length > 0 ? "required" : "optional",
    source: reasons[0] || null,
    reasons,
    optionsSource: "runtime",
  };
}

function concentrationDescriptor({ spell, phasePlan }) {
  const required = spell?.concentration === true;
  return {
    required,
    policy: required ? "catalog" : "none",
    action: text(phasePlan?.concentrationAction) || "replace",
    editable: false,
  };
}

function automationDescriptor({ spell, phasePlan }) {
  const available = phasePlan?.useCatalogAutomation === true && (
    !!spell?.automation
    || !!spell?.saveAutomation
    || (Array.isArray(spell?.effects) && spell.effects.length > 0)
    || (Array.isArray(spell?.effectChoices) && spell.effectChoices.length > 0)
  );
  return {
    available,
    policy: available ? "catalog" : "none",
    editable: available,
  };
}

function zoneTriggerCapability(allAreaRules = []) {
  const triggers = allAreaRules.flatMap((rule) => (
    Array.isArray(rule?.zonePolicy?.triggers)
      ? rule.zonePolicy.triggers.map((trigger) => ({
        ruleId: text(rule.id),
        type: text(trigger.type || trigger.timing || trigger.event),
        resolution: text(trigger.resolution || trigger.resolutionKind),
        data: cloneValue(trigger),
      }))
      : []
  ));
  return {
    available: triggers.length > 0,
    triggers,
    runtimeActivation: triggers.length > 0,
  };
}

function manualSpellEffectCapability({ spell, phasePlan, selectedAction, workflowContext }) {
  const phaseManual = phasePlan?.useCatalogAutomation === false;
  const targetContextManual = !!workflowContext?.manualAction;
  const actionManual = !!selectedAction;
  return {
    available: phaseManual || targetContextManual || actionManual,
    mode: phaseManual || targetContextManual || actionManual ? "manual" : "catalog",
    source: phaseManual
      ? "phase"
      : targetContextManual
        ? "target-context"
        : actionManual
          ? "active-action"
          : "catalog",
    supportsRuntimeActivation: phaseManual || targetContextManual || actionManual,
  };
}

function inputDescriptor({
  spell,
  phasePlan,
  duration,
  slot,
  caster,
  targeting,
  placement,
  choices,
  workflowContext,
  saveOutcomes,
  selectedAction,
  automation,
  execution,
}) {
  const healing = AREA_HEALING_SPELL_ID_SET.has(text(spell?.id));
  const persistentInitialWithoutHp = placement?.mode === "board-token"
    || placement?.policy === SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC
      && placement?.rules?.some((rule) => rule?.kind === "aura");
  const actionInputRequirements = selectedAction?.inputRequirements
    || selectedAction?.inputs
    || {};
  const selectedActionNeedsHpInput = !selectedAction
    || selectedAction.requiresHPInput === true
    || actionInputRequirements.hp === true
    || actionInputRequirements.damage === true
    || actionInputRequirements.healing === true;
  const currentHp = selectedAction
    ? execution.activeActionHasHP === true
    : execution.castHasHP === true;
  const hpInputApplicable = currentHp
    && !persistentInitialWithoutHp
    && (phasePlan?.phase !== "prepare" || !!selectedAction);
  const hpInputVisible = hpInputApplicable && selectedActionNeedsHpInput;
  const targetSelectionRequired = targeting.mode === SPELL_UNIFIED_TARGETING_MODES.DISCRETE
    || targeting.confirmTargets
    || selectedAction?.requiresTargets === true
    || (selectedAction?.maxTargets || 0) > 0;
  const outcomeRequired = saveOutcomes
    || selectedAction?.capabilities.attack === true
    || !!getSpellAttackResolution(spell);
  const choiceRequired = choices.length > 0;
  const damageRequired = hpInputVisible && !healing;
  const healingRequired = hpInputVisible && healing;
  return {
    phase: { required: phasePlan?.phase === "prepare", visible: false },
    caster: { required: caster.required, visible: caster.required },
    slot: { required: slot.required, visible: slot.visible },
    duration: {
      required: duration.policy === "manual",
      visible: duration.editable,
    },
    variant: { required: choiceRequired, visible: choices.length > 0 },
    targets: {
      required: targetSelectionRequired,
      visible: targetSelectionRequired,
      maximum: targeting.limit.maximum,
    },
    primaryTarget: {
      ...targeting.primaryTarget,
      visible: targeting.primaryTarget.required,
    },
    targetContext: {
      required: !!workflowContext,
      visible: !!workflowContext,
    },
    placement: {
      required: placement.policy === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED,
      visible: placement.policy !== SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE,
      policy: placement.policy,
    },
    outcomes: { required: outcomeRequired, visible: outcomeRequired },
    hp: {
      required: damageRequired || healingRequired,
      visible: damageRequired || healingRequired,
      mode: healing ? "healing" : "damage",
    },
    damage: { required: damageRequired, visible: damageRequired },
    healing: { required: healingRequired, visible: healingRequired },
    automation: { required: false, visible: automation.available },
  };
}

function outcomeOptions({ spell, selectedAction, saveOutcomes }) {
  const declaredAttackOutcomes = Array.isArray(selectedAction?.attack?.outcomes)
    ? selectedAction.attack.outcomes
    : [];
  if (declaredAttackOutcomes.length) {
    const labels = {
      hit: "Colpito",
      miss: "Mancato",
      critical: "Critico",
    };
    return declaredAttackOutcomes
      .map((value) => text(value).toLocaleLowerCase("it"))
      .filter(Boolean)
      .map((value) => ({ value, label: labels[value] || value }));
  }
  const castAttackOptions = spellAttackResolutionChoiceOptions(spell);
  if (castAttackOptions.length) return castAttackOptions;
  return saveOutcomes
    ? [
      { value: "passed", label: "Superato" },
      { value: "failed", label: "Fallito" },
      { value: "immune", label: "Immune" },
    ]
    : [];
}

function controlList({
  spell,
  phaseOptions: phases,
  phasePlan,
  targeting,
  placement,
  choices,
  workflowRule,
  workflowContext,
  selectedAction,
  activeActions,
  saveOutcomes,
  automation,
}) {
  const controls = new Set();
  if (phases.length > 1) controls.add("phase");
  if (Number(spell?.level) > 0) controls.add("slot-level");
  if (
    spell?.concentration === true
    || ["self", "caster"].includes(targeting.subjectMode)
    || placement.rules.some((rule) => ["caster", "caster-adjacent"].includes(rule.origin)
      || !!rule.range)
    || selectedAction?.requiresParentInstance === true
    || ["caster", "root"].includes(selectedAction?.rangeOrigin)
  ) {
    controls.add("caster");
  }
  if (
    targeting.mode === SPELL_UNIFIED_TARGETING_MODES.DISCRETE
    || targeting.confirmTargets
    || selectedAction?.requiresTargets === true
    || (selectedAction?.maxTargets || 0) > 0
  ) {
    controls.add("targets");
  }
  if (placement.required) controls.add("placement");
  if (choices.length) controls.add("rule-choice");
  if (workflowRule) controls.add("save-workflow");
  if (saveOutcomes) controls.add("save-outcomes");
  if (selectedAction?.capabilities.attack || getSpellAttackResolution(spell)) {
    controls.add("attack-outcomes");
  }
  if (workflowContext) controls.add("target-context");
  if (automation.available) controls.add("automations");
  if (activeActions.length) controls.add("active-action");
  return CONTROL_ORDER.filter((control) => controls.has(control));
}

function executionDescriptor({
  spell,
  phasePlan,
  castRules,
  allAreaRules,
  boardTokenRule,
  actions,
  selectedAction,
  selectedActionRule,
  areaTransaction,
}) {
  const castHasHP = hasExplicitDamage({
    spell,
    phasePlan,
    boardTokenRule,
    actions,
    castRules,
  });
  const phaseHasHP = (phasePlan?.effects || []).some((effect) =>
    !!effect?.mechanics?.areaDamage
    || !!effect?.mechanics?.damage
    || !!effect?.mechanics?.ongoingDamage
  );
  const phaseResolutionHasHP = !!phasePlan?.resolution?.mechanics?.areaDamage
    || !!phasePlan?.resolution?.mechanics?.damage
    || !!phasePlan?.resolution?.mechanics?.damageReplacement;
  const activeActionHasHP = !!selectedAction?.capabilities?.hp
    || selectedAction?.requiresHPInput === true
    || selectedAction?.inputRequirements?.hp === true
    || selectedAction?.inputRequirements?.damage === true
    || selectedAction?.inputs?.hp === true
    || selectedAction?.inputs?.damage === true;
  const tokenHasHP = boardTokenRule?.hasHitPoints === true;
  const deferredHP = !!getSpellCastResolutionRule(spell)?.deferredHP
    || actions.some((action) => action.capabilities.hp);
  const hasHP = castHasHP
    || phaseHasHP
    || phaseResolutionHasHP
    || activeActionHasHP
    || tokenHasHP
    || deferredHP;
  const hasZones = hasPersistentArea(allAreaRules);
  const hasTokens = !!boardTokenRule;
  const lanes = [SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE];
  if (areaTransaction) lanes.push(SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
  if (actions.length) lanes.push(SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION);
  const selectedLane = selectedAction
    ? SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION
    : areaTransaction
      ? SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION
      : SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE;
  const compositeUndo = areaTransaction || hasZones || hasTokens;
  const undoCapable = selectedLane === SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION
    || (selectedLane !== SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION
      && (selectedLane === SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE || compositeUndo));
  return {
    lane: selectedLane,
    lanes: LANE_ORDER.filter((lane) => lanes.includes(lane)),
    requiresCompositeUndo: compositeUndo,
    undo: {
      capable: undoCapable,
      scope: compositeUndo ? "composite" : undoCapable ? "history" : "none",
    },
    hasHP,
    castHasHP,
    phaseHasHP: phaseHasHP || phaseResolutionHasHP,
    activeActionHasHP,
    deferredHP,
    tokenHasHP,
    hasZones,
    hasTokens,
    activeResolution: actions.length > 0,
    selectedActionId: selectedAction?.id || null,
    selectedActionRuleId: selectedActionRule?.id || null,
    castRuleIds: castRules.map((rule) => rule.id),
  };
}

export function buildSpellUnifiedPanelContract({
  spell: spellValue = null,
  spellId = "",
  phase = "",
  actionId = "",
  choiceValue = "",
  castContext = {},
} = {}) {
  const spell = resolveSpell(spellValue, spellId);
  if (!spell) return null;

  const phases = phaseOptions(spell);
  const selected = selectedPhase(phases, phase);
  const phasePlan = getSpellCastPhasePlan(
    spell,
    selected === "cast" ? "" : selected,
    castContext,
  );
  const castRules = getSpellAreaRules(spell.id, { triggerType: "cast" });
  const presentationCastRules = phasePlan.phase === "prepare" ? [] : castRules;
  const allAreaRules = getSpellAreaRules(spell.id);
  const boardTokenRule = getSpellBoardTokenRule(spell);
  const boardTokenPlacementRule = getSpellBoardTokenPlacementRule(spell);
  const actionEntries = mergeActionDeclarations(spell, boardTokenRule, presentationCastRules);
  const actions = actionEntries.map(actionDescriptor);
  const selectedAction = actions.find((action) => action.id === text(actionId)) || null;
  const selectedActionRule = selectedAction
    ? actionPlacementRule(selectedAction, choiceValue)
    : null;
  const areaPlacement = placementFor({
    castRules: presentationCastRules,
    boardTokenPlacementRule,
    selectedAction,
    choiceValue,
  });
  const workflowRule = getSpellSaveWorkflowRule(spell.id);
  const workflowContext = getSpellSaveWorkflowTargetContext(spell.id);
  const choices = {
    placement: getSpellAreaPlacementChoices(spell.id),
    save: getSpellSaveWorkflowChoiceOptions(spell.id),
    area: getAreaSaveRuleChoices(spell),
    effect: getSpellEffectChoices(spell),
  };
  const allChoices = uniqueByKey([
    ...choices.placement,
    ...choices.save,
    ...choices.area,
    ...choices.effect,
  ].filter((choice) => text(choice?.value)), "value");
  const targeting = targetingDescriptor({
    spell,
    phasePlan,
    castRules: presentationCastRules,
    boardTokenPlacementRule,
    selectedAction,
    choiceValue,
    workflowRule,
    areaPlacement,
    slotLevel: integerOrNull(castContext?.slotLevel),
  });
  const saveOutcomes = saveOutcomeRequired({
    spell,
    phasePlan,
    castRules: presentationCastRules,
    selectedAction,
  });
  const outcomeOptionsValue = outcomeOptions({
    spell,
    selectedAction,
    saveOutcomes,
  });
  const automation = automationDescriptor({ spell, phasePlan });
  const controls = controlList({
    spell,
    phaseOptions: phases,
    phasePlan,
    targeting,
    placement: areaPlacement,
    choices: allChoices,
    workflowRule,
    workflowContext,
    selectedAction,
    activeActions: actions,
    saveOutcomes,
    automation,
  });
  const areaTransaction = hasAreaTransaction({
    spell,
    phasePlan,
    castRules: presentationCastRules,
    selectedAction,
    selectedActionRule,
  });
  const execution = executionDescriptor({
    spell,
    phasePlan,
    castRules: presentationCastRules,
    allAreaRules,
    boardTokenRule,
    actions,
    selectedAction,
    selectedActionRule,
    areaTransaction,
  });
  const duration = durationDescriptor(spell);
  const slot = slotDescriptor({ spell, workflowRule, selectedAction });
  const caster = casterDescriptor({
    spell,
    targeting,
    placement: areaPlacement,
    selectedAction,
  });
  const concentration = concentrationDescriptor({ spell, phasePlan });
  const zoneTrigger = zoneTriggerCapability(allAreaRules);
  const manualSpellEffect = manualSpellEffectCapability({
    spell,
    phasePlan,
    selectedAction,
    workflowContext,
  });
  const variantOptions = uniqueByKey([
    ...choices.save,
    ...choices.area,
    ...choices.effect,
  ].filter((choice) => text(choice?.value)), "value");
  const inputs = inputDescriptor({
    spell,
    phasePlan,
    duration,
    slot,
    caster,
    targeting,
    placement: areaPlacement,
    choices: variantOptions,
    workflowContext,
    saveOutcomes,
    selectedAction,
    automation,
    execution,
  });

  return immutable({
    spell: {
      id: text(spell.id),
      label: text(spell.displayName || spell.name || spell.id),
      level: Number(spell.level) || 0,
      concentration: spell.concentration === true,
    },
    presentation: {
      phase: {
        selected,
        options: phases,
        plan: {
          phase: text(phasePlan.phase),
          subjectMode: text(phasePlan.subjectMode),
          useCatalogAutomation: phasePlan.useCatalogAutomation === true,
          concentrationAction: text(phasePlan.concentrationAction),
          resolution: phasePlan.resolution ? cloneValue(phasePlan.resolution) : null,
        },
      },
      subjectMode: targeting.subjectMode,
      choice: text(choiceValue) || null,
      variant: {
        selected: text(choiceValue) || null,
        options: variantOptions,
        required: inputs.variant.required,
      },
      duration,
      slot,
      caster,
      concentration,
      automation,
      targeting,
      outcomes: {
        mode: getSpellAttackResolution(spell) || selectedAction?.capabilities?.attack
          ? "attack"
          : "save",
        options: outcomeOptionsValue,
      },
      placement: areaPlacement,
      inputs,
      controls,
      choices,
      capabilities: {
        concentration: spell.concentration === true,
        automation,
        phases: phases.length > 1,
        placement: areaPlacement.available,
        saveOutcomes,
        activeActions: actions.length > 0,
        boardToken: !!boardTokenRule,
        zone: execution.hasZones,
        hp: execution.hasHP,
        zoneTrigger: zoneTrigger.available,
        undo: execution.undo,
        manualSpellEffect,
      },
      zoneTrigger,
      activeActions: actions,
    },
    execution,
  });
}

export const buildSpellUnifiedPanelModel = buildSpellUnifiedPanelContract;

function recordValue(value) {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value && typeof value === "object" && !Array.isArray(value)
    ? cloneValue(value)
    : {};
}

function normalizedActiveConcentration(value) {
  if (!value || typeof value !== "object") return null;
  return cloneValue(value);
}

function normalizedExecutionGate(value) {
  if (!value || typeof value !== "object") {
    return { allowed: true, code: null, message: "" };
  }
  return {
    allowed: value.allowed !== false,
    code: text(value.code) || null,
    message: text(value.message),
  };
}

function normalizedActiveActionState(value) {
  if (typeof value === "string") {
    return {
      state: value || SPELL_PANEL_ACTIVE_ACTION_STATES.IDLE,
      instanceId: null,
      actionId: null,
      choiceValue: "",
      error: null,
    };
  }
  const state = value && typeof value === "object" ? value : {};
  return {
    state: text(state.state || state.status) || SPELL_PANEL_ACTIVE_ACTION_STATES.IDLE,
    instanceId: text(state.instanceId) || null,
    actionId: text(state.actionId) || null,
    choiceValue: text(state.choiceValue),
    error: text(state.error) || null,
  };
}

function optionalInteger(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  return integerOrNull(value);
}

function inputValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return cloneValue(value);
}

function normalizedFeedback(value) {
  if (typeof value === "string") {
    return {
      state: value ? SPELL_PANEL_FEEDBACK_STATES.INFO : SPELL_PANEL_FEEDBACK_STATES.IDLE,
      message: value,
      field: null,
    };
  }
  const feedback = value && typeof value === "object" ? value : {};
  const state = text(feedback.state || feedback.status)
    || SPELL_PANEL_FEEDBACK_STATES.IDLE;
  return {
    state,
    message: text(feedback.message),
    field: text(feedback.field) || null,
  };
}

function normalizedCommitState(value) {
  if (typeof value === "string") {
    return {
      state: value || SPELL_PANEL_COMMIT_STATES.IDLE,
      activationId: null,
      error: null,
    };
  }
  const commit = value && typeof value === "object" ? value : {};
  return {
    state: text(commit.state || commit.status) || SPELL_PANEL_COMMIT_STATES.IDLE,
    activationId: text(commit.activationId) || null,
    error: text(commit.error) || null,
  };
}

function normalizedUndoState(value) {
  if (typeof value === "string") {
    return {
      state: value || SPELL_PANEL_UNDO_STATES.UNAVAILABLE,
      available: value === SPELL_PANEL_UNDO_STATES.AVAILABLE,
      activationId: null,
      error: null,
    };
  }
  const undo = value && typeof value === "object" ? value : {};
  const state = text(undo.state || undo.status)
    || (undo.available === true
      ? SPELL_PANEL_UNDO_STATES.AVAILABLE
      : SPELL_PANEL_UNDO_STATES.UNAVAILABLE);
  return {
    state,
    available: undo.available === true || state === SPELL_PANEL_UNDO_STATES.AVAILABLE,
    activationId: text(undo.activationId) || null,
    error: text(undo.error) || null,
  };
}

function normalizedHpValues(value = {}, overrides = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    hp: inputValue(overrides.hp !== undefined ? overrides.hp : source.hp),
    damage: inputValue(overrides.damage !== undefined ? overrides.damage : source.damage),
    healing: inputValue(overrides.healing !== undefined ? overrides.healing : source.healing),
  };
}

function contractPhase(contract, requestedPhase = "") {
  const options = contract?.presentation?.phase?.options || [];
  if (!options.length) return text(requestedPhase || contract?.presentation?.phase?.selected) || "cast";
  return selectedPhase(options, requestedPhase || contract?.presentation?.phase?.selected);
}

function contractSlotDefault(contract) {
  return optionalInteger(contract?.presentation?.slot?.default);
}

export function createSpellPanelSession({
  contract = null,
  spellId = "",
  phase = "",
  activeActionId = "",
  activeInstanceId = "",
  activeActionState = null,
  actionId = "",
  casterId = "",
  enteredName = "",
  slotLevel,
  variant = "",
  choiceValue = "",
  castContext = {},
  applyAutomatedConditions = true,
  requestedConcentration = false,
  activeConcentration = null,
  durationTurns,
  targetIds = [],
  primaryTargetId = "",
  outcomes = {},
  attackOutcome = "",
  targetContext = {},
  placement = null,
  hpValues = {},
  hpValue,
  damageValue,
  healingValue,
  triggerRuntime = null,
  feedback = null,
  commitState = null,
  undoState = null,
  executionGate = null,
} = {}) {
  const resolvedSpellId = text(spellId || contract?.spell?.id);
  const resolvedSlot = slotLevel === undefined
    ? contractSlotDefault(contract)
    : optionalInteger(slotLevel);
  const resolvedDuration = durationTurns === undefined
    ? optionalInteger(contract?.presentation?.duration?.defaultTurns)
    : optionalInteger(durationTurns);
  const resolvedVariant = text(variant || choiceValue)
    || text(contract?.presentation?.variant?.options?.[0]?.value);
  return immutable({
    spellId: resolvedSpellId,
    phase: contractPhase(contract, phase),
    activeActionId: text(activeActionId || actionId),
    activeInstanceId: text(activeInstanceId),
    activeActionState: normalizedActiveActionState(activeActionState),
    casterId: text(casterId),
    enteredName: text(enteredName || contract?.spell?.label),
    slotLevel: resolvedSlot,
    variant: resolvedVariant,
    castContext: recordValue(castContext),
    applyAutomatedConditions: applyAutomatedConditions !== false,
    requestedConcentration: requestedConcentration === true,
    activeConcentration: normalizedActiveConcentration(activeConcentration),
    targetIds: unique(targetIds),
    primaryTargetId: text(primaryTargetId),
    outcomes: recordValue(outcomes),
    attackOutcome: text(attackOutcome).toLocaleLowerCase("it"),
    targetContext: recordValue(targetContext),
    placement: placement && typeof placement === "object" ? cloneValue(placement) : null,
    durationTurns: resolvedDuration,
    hpValues: normalizedHpValues(hpValues, {
      hp: hpValue,
      damage: damageValue,
      healing: healingValue,
    }),
    triggerRuntime: triggerRuntime && typeof triggerRuntime === "object"
      ? cloneValue(triggerRuntime)
      : null,
    feedback: normalizedFeedback(feedback),
    commitState: normalizedCommitState(commitState),
    undoState: normalizedUndoState(undoState),
    executionGate: normalizedExecutionGate(executionGate),
  });
}

export function updateSpellPanelSession(session, patch = {}) {
  const current = createSpellPanelSession(session || {});
  return createSpellPanelSession({
    ...current,
    ...patch,
    hpValues: patch.hpValues === undefined ? current.hpValues : patch.hpValues,
    targetIds: patch.targetIds === undefined ? current.targetIds : patch.targetIds,
    outcomes: patch.outcomes === undefined ? current.outcomes : patch.outcomes,
    attackOutcome: patch.attackOutcome === undefined
      ? current.attackOutcome
      : patch.attackOutcome,
    targetContext: patch.targetContext === undefined
      ? current.targetContext
      : patch.targetContext,
  });
}

function allowedValues(values) {
  return Array.isArray(values)
    ? values.map((value) => text(value)).filter(Boolean)
    : [];
}

function validCasterId(casterId, contract, validCasterIds) {
  const id = text(casterId);
  if (!id) return false;
  const allowed = allowedValues(validCasterIds);
  return allowed.length === 0 || allowed.includes(id);
}

function validSlotLevel(slotLevel, contract, validSlotLevels) {
  const value = optionalInteger(slotLevel);
  if (value === null) return false;
  const explicit = Array.isArray(validSlotLevels)
    ? validSlotLevels.map((entry) => optionalInteger(entry)).filter((entry) => entry !== null)
    : [];
  if (explicit.length > 0) return explicit.includes(value);
  const options = contract?.presentation?.slot?.options || [];
  return options.length > 0 && options.some((option) => Number(option.value) === value);
}

function resetRuntimeState(current) {
  return {
    ...current,
    activeActionId: "",
    activeInstanceId: "",
    activeActionState: normalizedActiveActionState(null),
    targetIds: [],
    primaryTargetId: "",
    outcomes: {},
    attackOutcome: "",
    targetContext: {},
    placement: null,
    hpValues: { hp: null, damage: null, healing: null },
    triggerRuntime: null,
    activeConcentration: null,
    feedback: normalizedFeedback(null),
    commitState: normalizedCommitState(null),
    undoState: normalizedUndoState(null),
    executionGate: normalizedExecutionGate(null),
  };
}

function transitionSession(currentSession, contract, {
  phase = "",
  activeActionId = "",
  activeInstanceId = "",
  activeActionState = null,
  variant = "",
  resetDuration = false,
  resetSlot = false,
  validCasterIds = [],
  validSlotLevels = [],
} = {}) {
  const current = createSpellPanelSession(currentSession || {});
  const next = resetRuntimeState(current);
  const casterId = validCasterId(current.casterId, contract, validCasterIds)
    ? current.casterId
    : "";
  const slotLevel = resetSlot
    ? contractSlotDefault(contract)
    : validSlotLevel(current.slotLevel, contract, validSlotLevels)
      ? current.slotLevel
      : contractSlotDefault(contract);
  return createSpellPanelSession({
    contract,
    ...next,
    spellId: text(contract?.spell?.id || current.spellId),
    phase: contractPhase(contract, phase),
    activeActionId: text(activeActionId),
    activeInstanceId: text(activeInstanceId),
    activeActionState: normalizedActiveActionState(activeActionState),
    casterId,
    enteredName: text(contract?.spell?.label || current.enteredName),
    slotLevel,
    variant: text(variant),
    castContext: {
      ...recordValue(current.castContext),
      phase: contractPhase(contract, phase),
      ...(slotLevel === null || slotLevel === undefined ? {} : { slotLevel }),
    },
    durationTurns: resetDuration
      ? optionalInteger(contract?.presentation?.duration?.defaultTurns)
      : current.durationTurns,
  });
}

export function changeSpellPanelSpell(session, contract, options = {}) {
  return transitionSession(session, contract, {
    ...options,
    phase: contract?.presentation?.phase?.selected,
    activeActionId: "",
    variant: "",
    resetDuration: true,
    resetSlot: true,
  });
}

export function changeSpellPanelPhase(session, contract, phase, options = {}) {
  return transitionSession(session, contract, {
    ...options,
    phase,
    activeActionId: "",
    variant: "",
  });
}

export function changeSpellPanelActiveAction(session, contract, actionId, options = {}) {
  return transitionSession(session, contract, {
    ...options,
    phase: contract?.presentation?.phase?.selected,
    activeActionId: actionId,
    variant: "",
  });
}

export function changeSpellPanelVariant(session, contract, variant, options = {}) {
  return transitionSession(session, contract, {
    ...options,
    phase: contract?.presentation?.phase?.selected,
    activeActionId: contract?.execution?.selectedActionId || "",
    variant,
  });
}

export function transitionSpellPanelSession(session, event = {}) {
  const type = text(event.type);
  if (type === "spell") return changeSpellPanelSpell(session, event.contract, event);
  if (type === "phase") return changeSpellPanelPhase(
    session,
    event.contract,
    event.phase,
    event,
  );
  if (type === "active-action") return changeSpellPanelActiveAction(
    session,
    event.contract,
    event.actionId,
    event,
  );
  if (type === "variant") return changeSpellPanelVariant(
    session,
    event.contract,
    event.variant,
    event,
  );
  return updateSpellPanelSession(session, event.patch || {});
}

function hasSessionValue(value, field = null) {
  const type = text(field?.type || field?.valueType || field?.inputType).toLocaleLowerCase("it");
  if (["text", "select", "string", "enum"].includes(type)) {
    return typeof value === "string" && value.trim() !== "";
  }
  if (["number", "integer", "numeric"].includes(type)) {
    return (typeof value === "number" && Number.isFinite(value))
      || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
  }
  if (["boolean", "checkbox"].includes(type)) {
    return value === true || value === false || value === "true" || value === "false";
  }
  if (["structured", "object", "record", "json"].includes(type)) {
    return !!value
      && typeof value === "object"
      && Object.keys(value).length > 0;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "" && Number.isFinite(Number(value));
  return value !== null && value !== undefined;
}

function optionContains(options, value) {
  return Array.isArray(options)
    && options.some((option) => String(option?.value) === String(value));
}

function outcomeFor(outcomes, targetId) {
  return outcomes && typeof outcomes === "object"
    ? outcomes[targetId]
    : null;
}

function targetContextComplete(contextContract, targetIds, targetContext) {
  const fields = Array.isArray(contextContract?.fields)
    ? contextContract.fields.filter((field) => field?.required === true)
    : [];
  if (!fields.length) return true;
  return targetIds.every((targetId) => {
    const values = targetContext?.[targetId];
    return fields.every((field) => hasSessionValue(values?.[field.id], field));
  });
}

function placementView(contract, session) {
  const descriptor = contract?.presentation?.placement || {
    available: false,
    policy: SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE,
  };
  const policy = descriptor.policy || (
    descriptor.required
      ? SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED
      : descriptor.available
        ? SPELL_PANEL_PLACEMENT_POLICIES.OPTIONAL
        : SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE
  );
  const runtime = session?.placement && typeof session.placement === "object"
    ? session.placement
    : null;
  const runtimeState = text(runtime?.state || runtime?.status);
  const confirmed = policy === SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC
    || runtime?.confirmed === true
    || runtimeState === "confirmed";
  const pending = runtimeState === "pending" || runtimeState === "loading";
  const cancelled = runtimeState === "cancelled";
  const stale = runtimeState === "stale";
  const state = policy === SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE
    ? "unavailable"
    : policy === SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC
      ? "automatic"
      : pending
        ? "pending"
        : stale
          ? "stale"
          : cancelled
            ? "cancelled"
            : ["error", "failed"].includes(runtimeState)
              ? "failed"
              : confirmed
                ? "confirmed"
                : "idle";
  return {
    available: descriptor.available === true,
    policy,
    state,
    pending,
    confirmed,
    requestId: text(runtime?.requestId) || null,
    targetLocked: runtime?.targetLocked === true,
    required: policy === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED,
    mode: descriptor.mode || "none",
    kind: descriptor.rules?.[0]?.kind || null,
    preview: runtime?.preview ? cloneValue(runtime.preview) : null,
    error: text(runtime?.error) || null,
  };
}

function validationFor(contract, session, placement) {
  if (!contract) {
    return {
      valid: false,
      firstInvalidField: "spell",
      errors: ["spell-required"],
    };
  }
  const inputs = contract.presentation.inputs || {};
  const errors = [];
  const add = (field, error = `${field}-invalid`) => {
    if (!errors.some((entry) => entry.field === field)) errors.push({ field, error });
  };
  if (session.executionGate?.allowed === false) {
    add("execution", session.executionGate.code || "workflow-unavailable");
  }
  if (session.spellId && session.spellId !== contract.spell.id) {
    add("spell", "spell-mismatch");
  }
  if (inputs.caster?.required && !session.casterId) add("caster", "caster-required");
  if (inputs.slot?.required && !optionContains(
    contract.presentation.slot.options,
    session.slotLevel,
  )) add("slot-level", "slot-level-invalid");
  if (inputs.duration?.required && !hasSessionValue(session.durationTurns)) {
    add("duration", "duration-required");
  }
  if (inputs.variant?.required && !optionContains(
    contract.presentation.variant.options,
    session.variant,
  )) add("variant", "variant-required");
  if (inputs.targets?.required && session.targetIds.length < 1) {
    add("targets", "targets-required");
  }
  if (Number.isInteger(inputs.targets?.maximum)
    && inputs.targets.maximum >= 0
    && session.targetIds.length > inputs.targets.maximum) {
    add("targets", "target-limit-exceeded");
  }
  if (inputs.primaryTarget?.required && (
    !session.primaryTargetId || !session.targetIds.includes(session.primaryTargetId)
  )) {
    add("primary-target", "primary-target-required");
  }
  if (inputs.targetContext?.required && !targetContextComplete(
    contract.presentation.targeting?.workflow?.context,
    session.targetIds,
    session.targetContext,
  )) add("target-context", "target-context-required");
  if (inputs.placement?.required && !placement.confirmed) {
    add("placement", "placement-required");
  }
  if (inputs.outcomes?.required) {
    const attackOutcomes = contract.presentation.outcomes?.mode === "attack";
    if (attackOutcomes) {
      if (!hasSessionValue(session.attackOutcome, { type: "text" })) {
        add("outcomes", "outcomes-required");
      }
    } else if (session.targetIds.some((id) => !outcomeFor(session.outcomes, id))) {
      add("outcomes", "outcomes-required");
    }
  }
  if (inputs.damage?.required && !hasSessionValue(session.hpValues.damage)) {
    add("damage", "damage-required");
  }
  if (inputs.healing?.required && !hasSessionValue(session.hpValues.healing)) {
    add("healing", "healing-required");
  }
  return {
    valid: errors.length === 0,
    firstInvalidField: errors[0]?.field || null,
    errors: errors.map((entry) => entry.error),
  };
}

function visibleControlsFor(contract, session, placement) {
  if (!contract) return [];
  const controls = new Set(contract.presentation.controls || []);
  const inputs = contract.presentation.inputs || {};
  const addInputControl = (field, control = field) => {
    if (inputs[field]?.visible) controls.add(control);
  };
  addInputControl("duration");
  if (contract.presentation.concentration?.required) controls.add("concentration");
  addInputControl("targets");
  addInputControl("primaryTarget", "primary-target");
  addInputControl("variant");
  if (placement.available) controls.add("placement");
  addInputControl("targetContext", "target-context");
  addInputControl("outcomes", "save-outcomes");
  addInputControl("damage");
  addInputControl("healing");
  if (contract.presentation.capabilities?.manualSpellEffect?.available) {
    controls.add("manual-effect");
  }
  if (contract.execution?.undo?.capable && session.undoState?.available) controls.add("undo");
  return CONTROL_ORDER.filter((control) => controls.has(control));
}

function primaryActionFor(contract, session, validation, placement, activeAction) {
  if (!contract) {
    return {
      id: "select-spell",
      label: "Seleziona un incantesimo",
      disabled: true,
    };
  }
  const execution = contract?.execution || {};
  const inputs = contract?.presentation?.inputs || {};
  const isBoardTokenCast = execution.hasTokens === true
    && placement?.mode === "board-token"
    && !activeAction;
  const isAuraCast = execution.hasZones === true
    && placement?.kind === "aura"
    && !activeAction;
  const isZoneCast = execution.hasZones === true
    && !isAuraCast
    && !activeAction;

  const applyLabel = () => {
    if (isBoardTokenCast) return "Crea pedina";
    if (isAuraCast) return "Applica aura";
    if (isZoneCast && !(
      inputs.targets?.visible === true
      || inputs.outcomes?.visible === true
      || inputs.damage?.visible === true
      || inputs.healing?.visible === true
    )) return "Crea zona";
    if (isZoneCast && placement.policy === SPELL_PANEL_PLACEMENT_POLICIES.OPTIONAL
      && placement.state !== "confirmed") {
      return "Usa senza placement";
    }
    if (isZoneCast && placement.state === "confirmed") return "Crea zona e applica";
    if (isZoneCast && placement.policy === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED) {
      return "Crea zona e applica";
    }
    return "Applica incantesimo";
  };

  const commitState = session.commitState?.state;
  if (commitState === SPELL_PANEL_COMMIT_STATES.COMMITTING) {
    return { id: "commit", label: "Applicazione in corso", disabled: true };
  }
  if (commitState === SPELL_PANEL_COMMIT_STATES.COMMITTED) {
    return { id: "apply", label: "Applica di nuovo", disabled: false };
  }
  if (placement.pending) {
    return { id: "placement", label: "Placement in corso", disabled: true };
  }
  if (validation.firstInvalidField === "execution") {
    return {
      id: "unavailable",
      label: session.executionGate?.message || "Workflow dedicato richiesto",
      disabled: true,
    };
  }
  if (validation.firstInvalidField === "placement") {
    return {
      id: "place",
      label: isBoardTokenCast ? "Posiziona pedina" : "Posiziona area",
      disabled: false,
    };
  }
  if (!validation.valid) {
    return {
      id: "complete",
      label: spellPanelValidationMessage(validation.firstInvalidField),
      disabled: true,
    };
  }
  if (session.triggerRuntime) {
    return { id: "resolve-trigger", label: "Risolvi trigger", disabled: false };
  }
  if (activeAction) {
    return {
      id: "resolve-active-action",
      label: activeAction.buttonLabel || activeAction.label || "Risolvi azione",
      disabled: false,
    };
  }
  if (contract.presentation.phase?.selected === "prepare") {
    return { id: "prepare", label: "Prepara incantesimo", disabled: false };
  }
  if (execution.lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION
    && session.targetIds.length > 0
    && !isZoneCast
    && !isAuraCast) {
    const count = session.targetIds.length;
    return {
      id: "apply",
      label: count === 1 ? "Applica a 1 bersaglio" : `Applica a ${count} bersagli`,
      disabled: false,
    };
  }
  return { id: "apply", label: applyLabel(), disabled: false };
}

function summaryFor(contract, session, placement, activeAction) {
  if (!contract) {
    return {
      title: "Nessun incantesimo selezionato",
      lines: [],
      text: "Seleziona un incantesimo dal catalogo",
    };
  }
  const phase = contract.presentation.phase?.options?.find(
    (option) => option.value === contract.presentation.phase.selected,
  );
  const lines = [
    phase?.label || contract.presentation.phase.selected,
    `${session.targetIds.length} bersagli`,
  ];
  if (placement.policy !== SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE) {
    const placementState = {
      idle: "da posizionare",
      pending: "in corso",
      confirmed: "confermata",
      cancelled: "annullata",
      stale: "da rinnovare",
      failed: "da riprovare",
      automatic: "gestita automaticamente",
    }[placement.state] || placement.state;
    lines.push(`Area ${placementState}`);
  }
  if (session.primaryTargetId) lines.push("Bersaglio primario selezionato");
  if (activeAction) lines.push("Azione attiva selezionata");
  if (session.executionGate?.allowed === false) {
    lines.push(session.executionGate.message || "Workflow dedicato richiesto");
  }
  return {
    title: contract.spell.label,
    lines,
    text: [contract.spell.label, ...lines].join(" · "),
  };
}

export function buildSpellPanelViewModel(contract, sessionValue = {}) {
  const session = createSpellPanelSession({
    ...(sessionValue || {}),
    contract,
  });
  const placement = placementView(contract, session);
  const validation = validationFor(contract, session, placement);
  const activeActionId = text(
    session.activeActionId || contract?.execution?.selectedActionId,
  );
  const activeAction = activeActionId
    ? contract?.presentation?.activeActions?.find((action) => action.id === activeActionId) || null
    : null;
  const primaryAction = primaryActionFor(
    contract,
    session,
    validation,
    placement,
    activeAction,
  );
  const undoCapable = contract?.execution?.undo?.capable === true;
  const undoAvailable = session.undoState?.available === true;
  const view = {
    spell: contract
      ? {
        label: contract.spell.label,
        level: contract.spell.level,
        concentration: contract.spell.concentration,
      }
      : null,
    phase: contract?.presentation?.phase || null,
    subjectMode: contract?.presentation?.subjectMode || "none",
    activeAction,
    controls: visibleControlsFor(contract, session, placement),
    primaryAction,
    disabled: primaryAction.disabled,
    summary: summaryFor(contract, session, placement, activeAction),
    validation: {
      valid: validation.valid,
      firstInvalidField: validation.firstInvalidField,
      errors: validation.errors,
    },
    placement,
    feedback: session.feedback,
    commit: session.commitState,
    undo: {
      capable: undoCapable,
      available: undoAvailable,
      state: session.undoState.state,
      disabled: !undoCapable || !undoAvailable || session.undoState.state === SPELL_PANEL_UNDO_STATES.UNDOING,
    },
    execution: session.executionGate,
  };
  return immutable(view);
}
