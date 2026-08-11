import {
  getAreaSaveRuleChoices,
  getSpellDefinition,
  getSpellEffectChoices,
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
  getSpellBoardTokenPlacementRule,
  getSpellBoardTokenRule,
} from "./spellBoardTokenCore.js";

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

const LANE_ORDER = Object.freeze([
  SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE,
  SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION,
  SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION,
]);

const CONTROL_ORDER = Object.freeze([
  "phase",
  "caster",
  "slot-level",
  "targets",
  "placement",
  "rule-choice",
  "save-workflow",
  "save-outcomes",
  "attack-outcomes",
  "target-context",
  "active-action",
]);

function text(value) {
  return String(value || "").trim();
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

function mergeActionDeclarations(spell, boardTokenRule) {
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
  return {
    id: entry.id,
    label: text(action.label) || entry.id,
    buttonLabel: text(action.buttonLabel) || text(action.label) || entry.id,
    detail: text(action.detail),
    economy: text(action.economy || action.actionEconomy),
    resolutionKind,
    subjectMode: text(action.subjectMode) || "none",
    requiresTargets: action.requiresTargets === true,
    maxTargets,
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
      zone: resolutionKind === "child-zone" || rule?.kind === "zone",
    },
  };
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
    required: !automatic,
    automatic,
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
  };
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
    workflow: workflowRule?.targeting
      ? cloneValue(workflowRule.targeting)
      : null,
  };
}

function hasExplicitDamage({
  spell,
  phasePlan,
  boardTokenRule,
  actions,
  areaRules,
}) {
  if (text(spell?.damageType)) return true;
  if (AREA_HEALING_SPELL_ID_SET.has(text(spell?.id))) return true;
  if (boardTokenRule?.hasHitPoints === true) return true;
  if (actions.some((action) => action.capabilities.hp)) return true;
  if ((phasePlan?.effects || []).some((effect) =>
    !!effect?.mechanics?.areaDamage
    || !!effect?.mechanics?.damage
    || !!effect?.mechanics?.ongoingDamage
  )) return true;
  return areaRules.some((rule) => (rule.zonePolicy?.triggers || []).some((trigger) =>
    !!trigger.damage
    || !!trigger.resolutionData?.damage
  ));
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
  return castRules.length > 0
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
  if (selectedAction?.capabilities.attack) controls.add("attack-outcomes");
  if (workflowContext) controls.add("target-context");
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
  const hasHP = hasExplicitDamage({
    spell,
    phasePlan,
    boardTokenRule,
    actions,
    areaRules: allAreaRules,
  });
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
  return {
    lane: selectedLane,
    lanes: LANE_ORDER.filter((lane) => lanes.includes(lane)),
    requiresCompositeUndo: areaTransaction || hasZones || hasTokens,
    hasHP,
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
  const actionEntries = mergeActionDeclarations(spell, boardTokenRule);
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
  const allChoices = [
    ...choices.placement,
    ...choices.save,
    ...choices.area,
    ...choices.effect,
  ].filter((choice) => text(choice?.value));
  const targeting = targetingDescriptor({
    spell,
    phasePlan,
    castRules: presentationCastRules,
    boardTokenPlacementRule,
    selectedAction,
    choiceValue,
    workflowRule,
    areaPlacement,
  });
  const saveOutcomes = saveOutcomeRequired({
    spell,
    phasePlan,
    castRules: presentationCastRules,
    selectedAction,
  });
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
        },
      },
      subjectMode: targeting.subjectMode,
      choice: text(choiceValue) || null,
      targeting,
      placement: areaPlacement,
      controls,
      choices,
      capabilities: {
        concentration: spell.concentration === true,
        phases: phases.length > 1,
        placement: areaPlacement.available,
        saveOutcomes,
        activeActions: actions.length > 0,
        boardToken: !!boardTokenRule,
        zone: execution.hasZones,
        hp: execution.hasHP,
      },
      activeActions: actions,
    },
    execution,
  });
}

export const buildSpellUnifiedPanelModel = buildSpellUnifiedPanelContract;
