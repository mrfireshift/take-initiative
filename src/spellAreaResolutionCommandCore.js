import {
  buildSpellUnifiedPanelContract,
  SPELL_PANEL_PLACEMENT_POLICIES,
  SPELL_UNIFIED_PANEL_LANES,
  SPELL_UNIFIED_TARGETING_MODES,
} from "./spellUnifiedPanelCore.js";
import { AREA_HEALING_SPELL_ID_SET } from "./areaSaveSpellRules.js";
import {
  getAreaSaveAutomation,
  getSpellAttackResolution,
  getSpellDefinition,
} from "./spells-srd.js";
import { getSpellSaveWorkflowRule } from "./spellSaveWorkflowRules.js";
import { getSpellSaveTargetMaximum } from "./spellSaveTargetingCore.js";
import {
  getSpellAreaRuleForPlacement,
  getSpellAreaRuleById,
} from "./spellAreaRules.js";
import { isTeleportSpell } from "./spellTeleportCore.js";
import {
  spellBoardTokenPlacementPosition,
} from "./spellBoardTokenCore.js";
import {
  CHAIN_LIGHTNING_TARGETING,
  resolveChainLightningTargeting,
} from "./chainLightningTargetingCore.js";
import { validateAnimatedObjectComposition } from "./animatedObjectsCore.js";
import {
  resolveSaveSpellResolution,
  SAVE_SPELL_OUTCOMES,
} from "./saveSpellCore.js";
import { QUICK_HP_FACTORS } from "./quickHpCore.js";
import {
  getSpellCastResolutionRule,
  spellSaveDamageFactor,
} from "./spellCastResolutionRules.js";
import {
  spellEffectConditionName,
  spellEffectConditionOptions,
} from "./spellEffectCore.js";

export const SPELL_AREA_RESOLUTION_COMMAND_TYPE = "spell-area-resolution";

export const SPELL_AREA_RESOLUTION_SOURCE_KINDS = Object.freeze([
  "cast",
  "prepared-resolution",
  "active-action",
  "zone-trigger",
]);

export const SPELL_AREA_RESOLUTION_ERROR_CODES = Object.freeze({
  SPELL_REQUIRED: "spell-required",
  SPELL_NOT_FOUND: "spell-not-found",
  SPELL_MISMATCH: "spell-mismatch",
  PHASE_MISMATCH: "phase-contract-mismatch",
  SOURCE_KIND_INVALID: "source-kind-invalid",
  SOURCE_PHASE_MISMATCH: "source-phase-mismatch",
  LANE_REQUIRED: "lane-required",
  LANE_INCOMPATIBLE: "lane-incompatible",
  ACTIVE_ACTION_INVALID: "active-action-invalid",
  ACTIVE_ACTION_MISMATCH: "active-action-mismatch",
  CASTER_REQUIRED: "caster-required",
  SLOT_INVALID: "slot-level-invalid",
  CHOICE_REQUIRED: "choice-required",
  CHOICE_INVALID: "choice-invalid",
  TARGETS_REQUIRED: "targets-required",
  TARGET_LIMIT: "target-limit-exceeded",
  PRIMARY_REQUIRED: "primary-required",
  PRIMARY_NOT_SELECTED: "primary-not-selected",
  DUPLICATE_TARGETS: "duplicate-targets",
  OUTCOME_INVALID: "outcome-invalid",
  OUTCOMES_REQUIRED: "outcomes-incomplete",
  OUTCOME_TARGET_UNSELECTED: "outcome-target-unselected",
  ATTACK_OUTCOME_REQUIRED: "attack-outcome-required",
  ATTACK_OUTCOME_INVALID: "attack-outcome-invalid",
  TARGET_CONTEXT_REQUIRED: "target-context-required",
  PLACEMENT_UNEXPECTED: "placement-unexpected",
  PLACEMENT_REQUIRED: "placement-required",
  PLACEMENT_PENDING: "placement-pending",
  PLACEMENT_NOT_CONFIRMED: "placement-not-confirmed",
  PLACEMENT_RULE_REQUIRED: "placement-rule-required",
  PLACEMENT_RULE_MISMATCH: "placement-rule-mismatch",
  PLACEMENT_SPELL_MISMATCH: "placement-spell-mismatch",
  PLACEMENT_CASTER_MISMATCH: "placement-caster-mismatch",
  PLACEMENT_CHOICE_MISMATCH: "placement-choice-mismatch",
  PLACEMENT_PHASE_MISMATCH: "placement-phase-mismatch",
  PLACEMENT_ACTION_MISMATCH: "placement-action-mismatch",
  PLACEMENT_TARGETS_MISSING: "placement-targets-missing",
  PLACEMENT_TARGET_NOT_CANDIDATE: "placement-target-not-candidate",
  PLACEMENT_LOCK_REQUIRED: "placement-target-lock-required",
  PLACEMENT_STALE: "placement-stale",
  PLACEMENT_POSITION_REQUIRED: "placement-position-required",
  COMPOSITION_REQUIRED: "composition-required",
  COMPOSITION_INVALID: "composition-invalid",
  TARGET_LOCK_REQUIRED: "target-lock-required",
  HP_REQUIRED: "hp-required",
  HP_INVALID: "hp-invalid",
  PRIMARY_DAMAGE_REQUIRED: "primary-damage-required",
  PRIMARY_DAMAGE_INVALID: "primary-damage-invalid",
  HP_UNEXPECTED: "hp-unexpected",
  ZONE_TRIGGER_REQUIRED: "zone-trigger-required",
  ZONE_TRIGGER_ACTIVATION_REQUIRED: "zone-trigger-activation-required",
  ZONE_TRIGGER_INSTANCE_REQUIRED: "zone-trigger-instance-required",
  ZONE_TRIGGER_INSTANCE_MISMATCH: "zone-trigger-instance-mismatch",
  ZONE_TRIGGER_SPELL_MISMATCH: "zone-trigger-spell-mismatch",
  ZONE_TRIGGER_CASTER_MISMATCH: "zone-trigger-caster-mismatch",
  ZONE_TRIGGER_RULE_MISMATCH: "zone-trigger-rule-mismatch",
  ZONE_TRIGGER_ACTION_MISMATCH: "zone-trigger-action-mismatch",
  ZONE_TRIGGER_TARGET_REQUIRED: "zone-trigger-target-required",
  ZONE_TRIGGER_TARGET_LOCK_REQUIRED: "zone-trigger-target-lock-required",
  SCENE_EPOCH_MISMATCH: "scene-epoch-mismatch",
  TRIGGER_CONTEXT_INCONSISTENT: "zone-trigger-context-inconsistent",
  PREPARED_INSTANCE_REQUIRED: "prepared-instance-required",
});

const SOURCE_KIND_SET = new Set(SPELL_AREA_RESOLUTION_SOURCE_KINDS);
const OUTCOME_SET = new Set(Object.values(SAVE_SPELL_OUTCOMES));
const ATTACK_OUTCOME_SET = new Set(["hit", "miss", "critical"]);
const PREPARED_AREA_HIT_SPELL_IDS = new Set([
  "phb2014-raffica-di-spine",
  "phb2014-freccia-folgorante",
]);
const PLACEMENT_POLICY_SET = new Set(Object.values(SPELL_PANEL_PLACEMENT_POLICIES));

const text = (value) => String(value ?? "").trim();

function firstDefined(...values) {
  const value = values.find((entry) => entry !== undefined && entry !== null);
  return value === undefined ? null : value;
}

function uniqueIds(values) {
  const source = values instanceof Set
    ? [...values]
    : Array.isArray(values)
      ? values
      : [];
  return [...new Set(source.map(text).filter(Boolean))];
}

function integerOrNull(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function hasProvidedValue(value) {
  return value !== null && value !== undefined && text(value) !== "";
}

function finiteOrNull(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recordEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value);
}

function recordValue(value) {
  return Object.fromEntries(recordEntries(value)
    .map(([key, entry]) => [text(key), entry])
    .filter(([key]) => key));
}

function serializable(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === "function") return null;
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }
  if (seen.has(value)) return null;
  seen.add(value);
  if (value instanceof Map) {
    const result = Object.fromEntries([...value.entries()]
      .map(([key, entry]) => [text(key), serializable(entry, seen)])
      .filter(([key]) => key));
    seen.delete(value);
    return result;
  }
  if (value instanceof Set) {
    const result = [...value].map((entry) => serializable(entry, seen));
    seen.delete(value);
    return result;
  }
  if (Array.isArray(value)) {
    const result = value.map((entry) => serializable(entry, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "function") continue;
    result[key] = serializable(entry, seen);
  }
  seen.delete(value);
  return result;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function addError(errors, code) {
  if (code && !errors.includes(code)) errors.push(code);
}

function addErrors(errors, values = []) {
  for (const value of Array.isArray(values) ? values : []) addError(errors, text(value));
}

function normalizedSession(input) {
  return input?.session && typeof input.session === "object"
    ? input.session
    : {};
}

function inputOrSession(input, session, key, ...aliases) {
  const keys = [key, ...aliases];
  for (const candidate of keys) {
    if (input[candidate] !== undefined) return input[candidate];
  }
  for (const candidate of keys) {
    if (session[candidate] !== undefined) return session[candidate];
  }
  return undefined;
}

function normalizeTargetContexts(value) {
  const source = value?.contextByTarget && typeof value.contextByTarget === "object"
    ? value.contextByTarget
    : value;
  return Object.fromEntries(recordEntries(source)
    .map(([targetId, context]) => [
      text(targetId),
      context && typeof context === "object" ? serializable(context) : {},
    ])
    .filter(([targetId]) => targetId));
}

function normalizeOutcomes(value) {
  const source = value?.byTarget && typeof value.byTarget === "object"
    ? value.byTarget
    : value?.save && typeof value.save === "object"
      ? value.save
      : value;
  const byTarget = {};
  const invalidTargetIds = [];
  for (const [targetIdValue, outcomeValue] of recordEntries(source)) {
    const targetId = text(targetIdValue);
    if (!targetId) continue;
    if (["attack", "attackOutcome"].includes(targetId)) continue;
    const outcome = text(outcomeValue).toLocaleLowerCase("it");
    if (!OUTCOME_SET.has(outcome)) {
      invalidTargetIds.push(targetId);
      continue;
    }
    byTarget[targetId] = outcome;
  }
  return {
    byTarget,
    invalidTargetIds: uniqueIds(invalidTargetIds),
    attack: text(value?.attack || value?.attackOutcome).toLocaleLowerCase("it") || null,
  };
}

function normalizeAttackOutcome(input, session, outcomeValue) {
  const raw = firstDefined(
    input.attackOutcome,
    input.attack?.outcome,
    outcomeValue?.attack,
    session.attackOutcome,
  );
  const normalized = text(raw).toLocaleLowerCase("it");
  return normalized === "colpito"
    ? "hit"
    : normalized === "mancato"
      ? "miss"
      : normalized === "critico" || normalized === "crit"
        ? "critical"
        : normalized || null;
}

function normalizeTargetIds(input, session) {
  const value = firstDefined(input.targetIds, input.targets, session.targetIds);
  if (value instanceof Set) return uniqueIds([...value]);
  return uniqueIds(value);
}

function normalizeTrigger(value, activationId = "") {
  if (!value || typeof value !== "object") return null;
  if (value.activation && typeof value.activation === "object") {
    return normalizeTrigger(value.activation, activationId);
  }
  if (Array.isArray(value.pending)) {
    const wanted = text(activationId);
    const selected = value.pending.find((entry) =>
      !wanted || text(entry?.id || entry?.activationId) === wanted,
    );
    return selected ? normalizeTrigger(selected, wanted) : null;
  }
  const targetIds = uniqueIds([
    ...(Array.isArray(value.targetIds) ? value.targetIds : []),
    value.targetId,
  ]);
  return {
    activationId: text(value.activationId || value.id),
    instanceId: text(value.instanceId || value.zoneInstanceId),
    ...(text(value.zoneItemId) ? { zoneItemId: text(value.zoneItemId) } : {}),
    ...(uniqueIds([
      ...(Array.isArray(value.zoneItemIds) ? value.zoneItemIds : []),
      value.zoneItemId,
    ]).length
      ? {
        zoneItemIds: uniqueIds([
          ...(Array.isArray(value.zoneItemIds) ? value.zoneItemIds : []),
          value.zoneItemId,
        ]),
      }
      : {}),
    spellId: text(value.spellId),
    casterId: text(value.casterId),
    targetIds,
    targetLocked: value.targetLocked === true || value.locked === true,
    sceneEpoch: firstDefined(value.sceneEpoch, value.epoch, null),
    ruleId: text(value.ruleId),
    actionId: text(value.actionId),
    ruleChoice: text(value.ruleChoice),
    resolution: text(value.resolution),
    suggestedDamage: serializable(
      value.suggestedDamage
        ?? value.damage
        ?? value.resolutionData?.damage
        ?? null,
    ),
  };
}

function placementPayload(value) {
  if (!value || typeof value !== "object") return null;
  const result = value.result && typeof value.result === "object"
    ? value.result
    : value;
  const preview = result.preview && typeof result.preview === "object"
    ? result.preview
    : null;
  return {
    raw: result,
    preview,
    status: text(result.status || result.state || result.phase).toLocaleLowerCase("it"),
    ruleId: text(result.ruleId || result.rule?.id),
    spellId: text(result.spellId || result.rule?.spellId),
    casterId: text(result.casterId),
    ruleChoice: text(
      result.ruleChoice
        || result.placementChoice
        || result.choiceValue
        || result.choice,
    ),
    phase: text(
      result.workflowPhase
        || result.spellPhase
        || result.castPhase
        || result.phaseId,
    ),
    actionId: text(result.actionId || result.activeActionId),
    sceneEpoch: firstDefined(result.sceneEpoch, preview?.sceneEpoch, null),
    requestId: text(result.requestId || result.placementRequestId),
    targetLocked: result.targetLocked === true
      || result.locked === true
      || preview?.targetLocked === true,
    explicitTargetLock: result.targetLocked !== undefined
      || result.locked !== undefined
      || preview?.targetLocked !== undefined,
    targetIds: uniqueIds([
      ...(Array.isArray(result.confirmedTargetIds) ? result.confirmedTargetIds : []),
      ...(Array.isArray(result.targetIds) ? result.targetIds : []),
      ...(Array.isArray(preview?.targetIds) ? preview.targetIds : []),
    ]),
    previewSnapshot: preview ? normalizePreview(preview) : null,
  };
}

function normalizePreview(value) {
  if (!value || typeof value !== "object") return null;
  const preview = {};
  for (const key of [
    "type",
    "start",
    "end",
    "gridOrigin",
    "dpi",
    "position",
    "positions",
    "radius",
    "widthSquares",
    "parentClip",
    "targetIds",
  ]) {
    if (value[key] !== undefined) preview[key] = serializable(value[key]);
  }
  if (!Array.isArray(preview.targetIds)) preview.targetIds = [];
  return preview;
}

function placementRuleId(contract, activeAction, trigger) {
  return text(
    contract?.execution?.selectedActionRuleId
      || activeAction?.placementRuleId
      || contract?.presentation?.placement?.ruleId
      || contract?.presentation?.placement?.rules?.[0]?.ruleId
      || trigger?.ruleId,
  );
}

function selectedActionFor(contract, actionId) {
  const actions = Array.isArray(contract?.presentation?.activeActions)
    ? contract.presentation.activeActions
    : [];
  if (!actionId) return null;
  return actions.find((action) => text(action?.id) === actionId) || null;
}

function resolveAreaRule(ruleId, choiceValue) {
  if (!ruleId) return null;
  return getSpellAreaRuleForPlacement(ruleId, choiceValue)
    || getSpellAreaRuleById(ruleId)
    || null;
}

function effectivePlacementPolicy(descriptor, rule) {
  const value = text(descriptor?.policy).toLocaleLowerCase("it");
  if (PLACEMENT_POLICY_SET.has(value)) return value;
  if (rule?.kind === "aura" && rule?.placement?.origin === "caster") {
    return SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC;
  }
  if (rule) return SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED;
  return SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE;
}

function placementHasPendingState(payload) {
  return ["pending", "placing", "review", "loading"].includes(payload?.status)
    || payload?.raw?.pending === true;
}

function placementIsConfirmed(payload) {
  return payload?.raw?.confirmed === true || payload?.status === "confirmed";
}

function placementSnapshot(payload, {
  policy,
  rule,
  spellId,
  casterId,
  choiceValue,
  status = "confirmed",
  targetIds = [],
} = {}) {
  return {
    policy,
    status,
    ruleId: text(rule?.id || payload?.ruleId),
    spellId: text(rule?.spellId || payload?.spellId || spellId),
    casterId: text(payload?.casterId || casterId) || null,
    ruleChoice: text(payload?.ruleChoice || rule?.placementChoice || choiceValue) || null,
    preview: payload?.previewSnapshot || null,
    targetIds: uniqueIds(targetIds),
  };
}

function placementValidation({
  input,
  contract,
  spellId,
  casterId,
  choiceValue,
  activeAction,
  phase,
  trigger,
  sceneEpoch,
  expectedSceneEpoch,
  targetMode,
  errors,
}) {
  const descriptor = contract?.presentation?.placement || {};
  const expectedRuleId = placementRuleId(contract, activeAction, trigger);
  const rule = resolveAreaRule(expectedRuleId, choiceValue);
  const policy = effectivePlacementPolicy(descriptor, rule);
  const rawPlacement = firstDefined(input.placement, input.placementResult, null);
  const payload = placementPayload(rawPlacement);
  const confirmed = placementIsConfirmed(payload);
  const pending = placementHasPendingState(payload);
  const explicitAutomatic = policy === SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC
    && payload?.status === "automatic";

  if (policy === SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE) {
    if (rawPlacement) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_UNEXPECTED);
    return {
      descriptor,
      policy,
      rule,
      expectedRuleId,
      payload,
      targetIds: [],
      locked: false,
      commandPlacement: null,
    };
  }

  if (policy === SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC && !rawPlacement) {
    return {
      descriptor,
      policy,
      rule,
      expectedRuleId,
      payload: null,
      targetIds: [],
      locked: true,
      commandPlacement: {
        policy,
        status: "automatic",
        ruleId: text(rule?.id || expectedRuleId) || null,
        spellId: text(rule?.spellId || spellId) || null,
        casterId: casterId || null,
        ruleChoice: text(rule?.placementChoice || choiceValue) || null,
        preview: null,
        targetIds: [],
      },
    };
  }

  if (!payload) {
    if (policy === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED && !trigger) {
      addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_REQUIRED);
    }
    return {
      descriptor,
      policy,
      rule,
      expectedRuleId,
      payload: null,
      targetIds: [],
      locked: false,
      commandPlacement: null,
    };
  }

  if (policy === SPELL_PANEL_PLACEMENT_POLICIES.AUTOMATIC && !explicitAutomatic) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_UNEXPECTED);
  }
  if (pending) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_PENDING);
  else if (!confirmed && !explicitAutomatic) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_NOT_CONFIRMED);
  }
  if (payload.raw?.stale === true) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_STALE);
  if (payload.requestId && text(input.placementRequestId)
    && payload.requestId !== text(input.placementRequestId)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_STALE);
  }
  if (payload.sceneEpoch !== null && expectedSceneEpoch !== null
    && String(payload.sceneEpoch) !== String(expectedSceneEpoch)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_STALE);
  }
  if (payload.sceneEpoch !== null && sceneEpoch !== null
    && String(payload.sceneEpoch) !== String(sceneEpoch)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_STALE);
  }
  if (!expectedRuleId) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_RULE_REQUIRED);
  if (payload.ruleId && expectedRuleId && payload.ruleId !== expectedRuleId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_RULE_MISMATCH);
  }
  if (payload.spellId && payload.spellId !== spellId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_SPELL_MISMATCH);
  }
  if (rule?.spellId && rule.spellId !== spellId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_SPELL_MISMATCH);
  }
  if (payload.casterId && casterId && payload.casterId !== casterId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_CASTER_MISMATCH);
  }
  if (payload.phase && payload.phase !== phase) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_PHASE_MISMATCH);
  }
  if (payload.actionId && text(activeAction?.id) && payload.actionId !== text(activeAction.id)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_ACTION_MISMATCH);
  }
  if (payload.ruleChoice && choiceValue && payload.ruleChoice !== choiceValue) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_CHOICE_MISMATCH);
  }
  if (rule?.placementChoice && choiceValue && rule.placementChoice !== choiceValue) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_CHOICE_MISMATCH);
  }
  if (payload.explicitTargetLock && !payload.targetLocked && targetMode === "geometric") {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_LOCK_REQUIRED);
  }
  if (
    rule?.kind === "board-token"
    && confirmed
    && !spellBoardTokenPlacementPosition(payload.preview || payload.raw)
  ) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_POSITION_REQUIRED);
  }
  if (rule?.kind === "board-token" && rule?.composition && confirmed) {
    const positions = Array.isArray(payload.preview?.positions)
      ? payload.preview.positions
      : [];
    if (!positions.length) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.COMPOSITION_INVALID);
  }

  const targetIds = confirmed ? payload.targetIds : [];
  const requiresConfirmedTargets = targetMode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC
    && contract?.presentation?.targeting?.confirmTargets === true
    && !["zone", "aura"].includes(rule?.kind)
    && !isTeleportSpell(spellId);
  if (
    confirmed
    && requiresConfirmedTargets
    && contract?.presentation?.targeting?.selectionMode !== "post-placement"
    && !targetIds.length
  ) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_TARGETS_MISSING);
  }

  const candidateTargetIds = uniqueIds(firstDefined(
    input.candidateTargetIds,
    input.candidateIds,
    input.availableTargetIds,
    [],
  ));
  if (candidateTargetIds.length) {
    for (const targetId of targetIds) {
      if (!candidateTargetIds.includes(targetId)) {
        addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_TARGET_NOT_CANDIDATE);
        break;
      }
    }
  }

  return {
    descriptor,
    policy,
    rule,
    expectedRuleId,
    payload,
    targetIds,
    locked: confirmed || payload.targetLocked,
    commandPlacement: placementSnapshot(payload, {
      policy,
      rule,
      spellId,
      casterId,
      choiceValue,
      status: confirmed ? "confirmed" : payload.status || "pending",
      targetIds,
    }),
  };
}

function expectedContextFields(contract, workflowRule) {
  return contract?.presentation?.targeting?.workflow?.context?.fields
    || workflowRule?.targeting?.context?.fields
    || [];
}

function validateTargetContexts(contract, workflowRule, targetIds, targetContexts, errors) {
  if (contract?.presentation?.inputs?.targetContext?.required !== true) return;
  const fields = expectedContextFields(contract, workflowRule)
    .filter((field) => field?.required === true);
  for (const targetId of targetIds) {
    const context = targetContexts[targetId];
    if (!context || fields.some((field) => {
      const value = context[field.id];
      return value === null || value === undefined || text(value) === "";
    })) {
      addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.TARGET_CONTEXT_REQUIRED);
      return;
    }
  }
}

function chainSpatialSnapshot(input, primaryTargetId, targetIds) {
  const spatial = input.spatialValidation && typeof input.spatialValidation === "object"
    ? input.spatialValidation
    : input.spatial && typeof input.spatial === "object"
      ? input.spatial
      : {};
  const secondaryIds = targetIds.filter((targetId) => targetId !== primaryTargetId);
  const secondaryDistances = firstDefined(
    input.secondaryDistancesMeters,
    spatial.secondaryDistancesMeters,
    {},
  );
  return {
    primaryDistanceMeters: firstDefined(
      input.primaryDistanceMeters,
      spatial.primaryDistanceMeters,
      input.casterDistancesMeters?.[primaryTargetId],
      null,
    ),
    secondaryDistancesMeters: Object.fromEntries(secondaryIds.map((targetId) => [
      targetId,
      finiteOrNull(secondaryDistances?.[targetId]),
    ])),
  };
}

function chainTargeting({ input, slotLevel, primaryTargetId, targetIds, errors }) {
  const spatial = chainSpatialSnapshot(input, primaryTargetId, targetIds);
  const result = resolveChainLightningTargeting({
    spellId: CHAIN_LIGHTNING_TARGETING.spellId,
    slotLevel,
    primaryId: primaryTargetId,
    secondaryIds: targetIds.filter((targetId) => targetId !== primaryTargetId),
    primaryDistanceMeters: spatial.primaryDistanceMeters,
    secondaryDistancesMeters: spatial.secondaryDistancesMeters,
    validateDistances: input.validateSpatial !== false,
  });
  addErrors(errors, result.errors);
  return result;
}

function targetLimit(contract, slotLevel, chainResult, workflowRule) {
  if (chainResult) return chainResult.maximumTargets;
  if (workflowRule) return getSpellSaveTargetMaximum(workflowRule, slotLevel);
  const maximum = contract?.presentation?.targeting?.limit?.maximum;
  if (maximum === null || maximum === undefined || text(maximum) === "") return null;
  return Number.isInteger(Number(maximum)) ? Number(maximum) : null;
}

function normalizeHp(
  input,
  session,
  contract,
  rule,
  activeAction,
  targetIds,
  outcomes,
  errors,
  attackResolution = null,
  attackOutcome = null,
  spell = null,
  primaryTargetId = "",
  legacyPreparedArea = false,
) {
  const rawHp = input.hp && typeof input.hp === "object" ? input.hp : {
    ...(input.hp === null || input.hp === undefined ? {} : { amount: input.hp }),
  };
  const healing = AREA_HEALING_SPELL_ID_SET.has(text(contract?.spell?.id));
  const boardTokenInitial = rule?.kind === "board-token" && !activeAction;
  const automaticAuraInitial = rule?.kind === "aura" && !activeAction;
  const contractHpRequired = contract?.presentation?.inputs?.hp?.required === true;
  const targeting = contract?.presentation?.targeting || {};
  const emptyInitialZone = targetIds.length === 0
    && rule?.kind === "zone"
    && targeting.mode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC
    && targeting.confirmTargets !== true;
  const required = contractHpRequired
    && !(
      spell?.id === "phb2014-raffica-di-spine"
      && text(contract?.presentation?.phase?.selected) === "resolve"
      && attackOutcome === "miss"
    )
    && !boardTokenInitial
    && !automaticAuraInitial
    && !emptyInitialZone;
  const mode = text(
    rawHp.mode
      || input.hpMode
      || (healing ? "heal" : contract?.presentation?.inputs?.healing?.required
        ? "heal"
        : contract?.presentation?.inputs?.damage?.required || contract?.execution?.hasHP
          ? "damage"
          : "none"),
  ).toLocaleLowerCase("it") || "none";
  const normalizedMode = mode === "healing" ? "heal" : mode;
  const validMode = ["damage", "heal", "none"].includes(normalizedMode)
    ? normalizedMode
    : "none";
  const amountValue = firstDefined(
    rawHp.amount,
    input.hpAmount,
    input.damageAmount,
    input.healingAmount,
    normalizedMode === "heal" ? session.hpValues?.healing : session.hpValues?.damage,
    session.hpValues?.hp,
    null,
  );
  const amountProvided = amountValue !== null
    && amountValue !== undefined
    && text(amountValue) !== "";
  const amount = amountValue === null || amountValue === undefined || text(amountValue) === ""
    ? null
    : finiteOrNull(amountValue);
  const primaryDamageValue = firstDefined(
    rawHp.primaryAmount,
    rawHp.primaryDamage,
    input.primaryDamageAmount,
    input.primaryDamageValue,
    input.primaryDamage,
    session.hpValues?.primaryDamage,
    null,
  );
  const primaryDamageProvided = primaryDamageValue !== null
    && primaryDamageValue !== undefined
    && text(primaryDamageValue) !== "";
  const primaryAmount = primaryDamageValue === null
    || primaryDamageValue === undefined
    || text(primaryDamageValue) === ""
    ? null
    : finiteOrNull(primaryDamageValue);
  const primaryDamageRequired = spell?.id === "phb2014-freccia-folgorante"
    && text(contract?.presentation?.phase?.selected) === "resolve";
  if (primaryDamageRequired && !primaryDamageProvided && !legacyPreparedArea) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PRIMARY_DAMAGE_REQUIRED);
  }
  if (primaryDamageProvided && (primaryAmount === null || primaryAmount < 0)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PRIMARY_DAMAGE_INVALID);
  }
  if (required && !amountProvided) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.HP_REQUIRED);
  if (amountProvided && (amount === null || amount < 0 || !Number.isFinite(amount))) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.HP_INVALID);
  }
  if (!required && validMode === "none" && amount !== null) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.HP_UNEXPECTED);
  }
  const outcomeFactors = {};
  for (const targetId of targetIds) {
    const outcome = outcomes.byTarget[targetId];
    outcomeFactors[targetId] = attackResolution && attackOutcome
      ? attackResolution.initialDamage?.factor === "zero"
        ? "zero"
        : attackResolution.initialDamage?.factor === "half"
          ? QUICK_HP_FACTORS.HALF
          : QUICK_HP_FACTORS.FULL
      : outcome === SAVE_SPELL_OUTCOMES.PASSED
      ? spellSaveDamageFactor(contract?.spell?.id, outcome) || QUICK_HP_FACTORS.HALF
      : outcome === SAVE_SPELL_OUTCOMES.IMMUNE
        ? "zero"
        : QUICK_HP_FACTORS.FULL;
  }
  return {
    required,
    mode: required || amount !== null ? validMode : "none",
    amount: amount === null ? null : Math.floor(amount),
    primaryAmount: primaryAmount === null ? null : Math.floor(primaryAmount),
    primaryRequired: primaryDamageRequired,
    primaryTargetId: text(primaryTargetId),
    primaryOutcomeFactor: attackOutcome === "miss"
      ? QUICK_HP_FACTORS.HALF
      : QUICK_HP_FACTORS.FULL,
    outcomeFactors,
    targetIds: uniqueIds(targetIds),
  };
}

function normalizeExecution(contract, {
  activeAction,
  placementRule,
  placementPolicy,
  phase,
  sourceKind,
  errors,
}) {
  const source = contract?.execution || {};
  const lane = text(source.lane);
  const execution = {
    lane: lane || null,
    requiresCompositeUndo: source.requiresCompositeUndo === true,
    hasHP: source.hasHP === true,
    hasZones: source.hasZones === true,
    hasTokens: source.hasTokens === true,
  };
  if (!lane) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.LANE_REQUIRED);
  const boardTokenPlacement = placementRule?.kind === "board-token"
    || placementPolicy === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED
      && text(contract?.presentation?.placement?.mode) === "board-token";
  const activeArea = !!activeAction && (
    activeAction.capabilities?.placement === true
      || activeAction.capabilities?.save === true
      || activeAction.capabilities?.attack === true
      || activeAction.capabilities?.zone === true
      || ["save-area", "child-zone", "board-token", "single-attack"].includes(
        text(activeAction.resolutionKind),
      )
  );
  const areaTransaction = lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION;
  const activeResolution = lane === SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION
    && activeArea;
  const boardLifecycle = lane === SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE
    && boardTokenPlacement;
  if (lane && !(areaTransaction || activeResolution || boardLifecycle)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.LANE_INCOMPATIBLE);
  }
  if (phase === "prepare" && !boardLifecycle && !activeResolution) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.LANE_INCOMPATIBLE);
  }
  if (sourceKind === "zone-trigger" && execution.hasZones !== true) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.LANE_INCOMPATIBLE);
  }
  return execution;
}

function validateZoneTrigger(trigger, {
  input,
  session,
  spellId,
  casterId,
  actionId,
  expectedRuleId,
  sceneEpoch,
  expectedSceneEpoch,
  targetIds,
  errors,
}) {
  if (!trigger) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_REQUIRED);
    return null;
  }
  if (!trigger.activationId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_ACTIVATION_REQUIRED);
  }
  if (!trigger.instanceId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_INSTANCE_REQUIRED);
  }
  const expectedInstanceId = text(firstDefined(
    input.expectedZoneInstanceId,
    input.zoneInstanceId,
    input.parentInstanceId,
    session.activeConcentration?.instanceId,
  ));
  if (expectedInstanceId && trigger.instanceId && expectedInstanceId !== trigger.instanceId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_INSTANCE_MISMATCH);
  }
  if (trigger.spellId && trigger.spellId !== spellId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_SPELL_MISMATCH);
  }
  if (trigger.casterId && casterId && trigger.casterId !== casterId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_CASTER_MISMATCH);
  }
  if (trigger.ruleId && expectedRuleId && trigger.ruleId !== expectedRuleId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_RULE_MISMATCH);
  }
  if (trigger.actionId && actionId && trigger.actionId !== actionId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_ACTION_MISMATCH);
  }
  if (!trigger.targetIds.length) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_TARGET_REQUIRED);
  }
  if (!trigger.targetLocked) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ZONE_TRIGGER_TARGET_LOCK_REQUIRED);
  }
  if (trigger.sceneEpoch !== null && expectedSceneEpoch !== null
    && String(trigger.sceneEpoch) !== String(expectedSceneEpoch)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SCENE_EPOCH_MISMATCH);
  }
  if (trigger.sceneEpoch !== null && sceneEpoch !== null
    && String(trigger.sceneEpoch) !== String(sceneEpoch)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SCENE_EPOCH_MISMATCH);
  }
  if (targetIds.length && trigger.targetIds.length
    && targetIds.some((targetId) => !trigger.targetIds.includes(targetId))) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.TRIGGER_CONTEXT_INCONSISTENT);
  }
  return {
    activationId: trigger.activationId || null,
    instanceId: trigger.instanceId || null,
    ...(trigger.zoneItemId ? { zoneItemId: trigger.zoneItemId } : {}),
    ...(Array.isArray(trigger.zoneItemIds) && trigger.zoneItemIds.length
      ? { zoneItemIds: trigger.zoneItemIds }
      : {}),
    spellId: trigger.spellId || spellId,
    casterId: trigger.casterId || casterId || null,
    targetIds: trigger.targetIds,
    targetLocked: trigger.targetLocked,
    sceneEpoch: trigger.sceneEpoch,
    ruleId: trigger.ruleId || expectedRuleId || null,
    actionId: trigger.actionId || actionId || null,
    ruleChoice: trigger.ruleChoice || null,
    suggestedDamage: trigger.suggestedDamage,
    resolution: trigger.resolution || null,
  };
}

function resolutionProjection(result, fallbackTargeting = null, attackResolution = null) {
  if (!result && !fallbackTargeting && !attackResolution) return null;
  return {
    spellTargetIds: uniqueIds(result?.spellTargetIds),
    conditionApplications: serializable(result?.conditionApplications || []),
    targeting: serializable(result?.targeting || fallbackTargeting || null),
    choice: serializable(result?.choice || result?.targeting?.choice || null),
    ...(result?.persistence && typeof result.persistence === "object"
      ? { persistence: serializable(result.persistence) }
      : {}),
    ...(attackResolution ? { attackResolution: serializable(attackResolution) } : {}),
  };
}

function outputSourceKind(input, session, phase, activeActionId, trigger) {
  const explicit = text(input.source?.kind || input.sourceKind);
  if (explicit) return explicit;
  if (trigger) return "zone-trigger";
  if (activeActionId) return "active-action";
  if (phase === "resolve") return "prepared-resolution";
  return "cast";
}

function selectedValue(input, session, contract, trigger) {
  return text(firstDefined(
    input.choiceValue,
    input.variant,
    input.ruleChoice,
    input.spellChoice,
    session.variant,
    trigger?.ruleChoice,
    contract?.presentation?.variant?.selected,
    "",
  ));
}

function buildContract(input, session, spellId, phase, actionId, choiceValue) {
  if (input.contract && typeof input.contract === "object") return input.contract;
  return buildSpellUnifiedPanelContract({
    spellId,
    phase,
    actionId,
    choiceValue,
    castContext: input.castContext || session.castContext || {},
  });
}

export function buildSpellAreaResolutionCommand(input = {}) {
  const sourceInput = input && typeof input === "object" ? input : {};
  const session = normalizedSession(sourceInput);
  const provisionalSpellId = text(firstDefined(
    sourceInput.spellId,
    session.spellId,
    sourceInput.contract?.spell?.id,
  ));
  const provisionalPhase = text(firstDefined(
    sourceInput.phase,
    session.phase,
    sourceInput.contract?.presentation?.phase?.selected,
    "cast",
  ));
  const provisionalActionId = text(firstDefined(
    sourceInput.activeActionId,
    sourceInput.actionId,
    session.activeActionId,
    sourceInput.contract?.execution?.selectedActionId,
    "",
  ));
  const triggerInput = firstDefined(
    sourceInput.zoneTrigger,
    sourceInput.triggerRuntime,
    session.triggerRuntime,
    null,
  );
  const activationId = text(firstDefined(
    sourceInput.activationId,
    sourceInput.source?.activationId,
    triggerInput?.activationId,
    triggerInput?.id,
    "",
  ));
  const trigger = normalizeTrigger(triggerInput, activationId);
  const choiceValue = selectedValue(sourceInput, session, sourceInput.contract, trigger);
  const contract = buildContract(
    sourceInput,
    session,
    provisionalSpellId,
    provisionalPhase,
    provisionalActionId,
    choiceValue,
  );
  const spellId = text(firstDefined(
    sourceInput.spellId,
    session.spellId,
    contract?.spell?.id,
    provisionalSpellId,
  ));
  const phase = text(firstDefined(
    sourceInput.phase,
    session.phase,
    contract?.presentation?.phase?.selected,
    provisionalPhase,
  ));
  const actionId = text(firstDefined(
    sourceInput.activeActionId,
    sourceInput.actionId,
    session.activeActionId,
    contract?.execution?.selectedActionId,
    provisionalActionId,
  ));
  const errors = [];
  if (!spellId) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SPELL_REQUIRED);
  if (sourceInput.contract?.spell?.id && sourceInput.spellId
    && text(sourceInput.contract.spell.id) !== text(sourceInput.spellId)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SPELL_MISMATCH);
  }
  const spell = getSpellDefinition(spellId) || (
    sourceInput.spell && typeof sourceInput.spell === "object"
      ? sourceInput.spell
      : null
  );
  if (spellId && !spell) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SPELL_NOT_FOUND);
  if (!contract) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SPELL_REQUIRED);
  const contractPhase = text(contract?.presentation?.phase?.selected);
  if (sourceInput.phase !== undefined && contractPhase && phase !== contractPhase) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PHASE_MISMATCH);
  }
  const sourceKind = outputSourceKind(sourceInput, session, phase, actionId, trigger);
  if (!SOURCE_KIND_SET.has(sourceKind)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SOURCE_KIND_INVALID);
  }
  if (sourceKind === "prepared-resolution" && phase !== "resolve") {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SOURCE_PHASE_MISMATCH);
  }
  if (sourceKind === "active-action" && !actionId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ACTIVE_ACTION_INVALID);
  }
  const parentInstanceId = text(firstDefined(
    sourceInput.parentInstanceId,
    sourceInput.source?.parentInstanceId,
    session.activeConcentration?.instanceId,
  ));
  if (sourceKind === "prepared-resolution" && !parentInstanceId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PREPARED_INSTANCE_REQUIRED);
  }

  const activeAction = selectedActionFor(contract, actionId);
  if (actionId && !activeAction) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ACTIVE_ACTION_INVALID);
  if (contract?.execution?.selectedActionId
    && actionId !== text(contract.execution.selectedActionId)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ACTIVE_ACTION_MISMATCH);
  }
  const casterId = text(firstDefined(sourceInput.casterId, session.casterId, ""));
  const slotLevel = integerOrNull(firstDefined(
    sourceInput.slotLevel,
    session.slotLevel,
    contract?.presentation?.slot?.default,
    null,
  ));
  const slotOptions = contract?.presentation?.slot?.options || [];
  const slotWasProvided = hasProvidedValue(sourceInput.slotLevel)
    || hasProvidedValue(session.slotLevel);
  const slotIsValid = Number.isInteger(slotLevel)
    && (!slotOptions.length || slotOptions.some((option) => Number(option.value) === slotLevel));
  if ((contract?.presentation?.inputs?.slot?.required === true && !slotIsValid)
    || (slotWasProvided && !slotIsValid)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SLOT_INVALID);
  }
  if (contract?.presentation?.inputs?.caster?.required === true && !casterId) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.CASTER_REQUIRED);
  }
  const variantOptions = contract?.presentation?.variant?.options || [];
  if (contract?.presentation?.inputs?.variant?.required === true && !choiceValue) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.CHOICE_REQUIRED);
  } else if (choiceValue && variantOptions.length
    && contract?.presentation?.inputs?.variant?.required === true
    && !variantOptions.some((option) => text(option.value) === choiceValue)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.CHOICE_INVALID);
  }
  const boardComposition = contract?.presentation?.composition;
  if (boardComposition?.required === true) {
    const compositionKey = text(boardComposition.key) || "composition";
    const composition = firstDefined(
      sourceInput.castContext?.[compositionKey],
      session.castContext?.[compositionKey],
      sourceInput[compositionKey],
      session[compositionKey],
      null,
    );
    const compositionValidation = validateAnimatedObjectComposition(composition);
    if (!composition) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.COMPOSITION_REQUIRED);
    else if (!compositionValidation.valid) {
      addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.COMPOSITION_INVALID);
    }
  }

  const targetingContract = contract?.presentation?.targeting || {};
  const targetMode = text(targetingContract.mode) || SPELL_UNIFIED_TARGETING_MODES.NONE;
  const rawTargetIds = normalizeTargetIds(sourceInput, session);
  const rawTargetContexts = firstDefined(
    sourceInput.targetContexts,
    sourceInput.targetContext,
    session.targetContext,
    {},
  );
  const targetContexts = normalizeTargetContexts(rawTargetContexts);
  const outcomesInput = firstDefined(
    sourceInput.outcomes,
    sourceInput.saveOutcomes,
    session.outcomes,
    {},
  );
  const outcomes = normalizeOutcomes(outcomesInput);
  addErrors(errors, outcomes.invalidTargetIds.map(() => SPELL_AREA_RESOLUTION_ERROR_CODES.OUTCOME_INVALID));

  const sceneEpoch = firstDefined(
    sourceInput.source?.sceneEpoch,
    sourceInput.sceneEpoch,
    trigger?.sceneEpoch,
    null,
  );
  const expectedSceneEpoch = firstDefined(
    sourceInput.expectedSceneEpoch,
    sourceInput.currentSceneEpoch,
    sourceInput.appliedAt?.sceneEpoch,
    null,
  );
  if (sceneEpoch !== null && expectedSceneEpoch !== null
    && String(sceneEpoch) !== String(expectedSceneEpoch)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.SCENE_EPOCH_MISMATCH);
  }

  const placement = placementValidation({
    input: sourceInput,
    contract,
    spellId,
    casterId,
    choiceValue,
    activeAction,
    phase,
    trigger,
    sceneEpoch,
    expectedSceneEpoch,
    targetMode,
    errors,
  });
  const expectedRuleId = placement.expectedRuleId;
  const validatedTrigger = sourceKind === "zone-trigger"
    ? validateZoneTrigger(trigger, {
      input: sourceInput,
      session,
      spellId,
      casterId,
      actionId,
      expectedRuleId,
      sceneEpoch,
      expectedSceneEpoch,
      targetIds: rawTargetIds,
      errors,
    })
    : null;

  const isAreaSubset = targetingContract.selectionMode === "area-subset";
  const externalTargetSelection = ["manual", "post-placement"].includes(
    targetingContract.selectionMode,
  );
  let targetIds = validatedTrigger?.targetIds?.length
    ? validatedTrigger.targetIds
    : placement.payload && placementIsConfirmed(placement.payload)
      && targetMode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC
      && !externalTargetSelection
      && !isAreaSubset
        ? placement.targetIds
        : rawTargetIds;
  targetIds = uniqueIds(targetIds);

  if (isAreaSubset && placement.payload && placementIsConfirmed(placement.payload)) {
    const candidateTargetIds = uniqueIds(firstDefined(
      sourceInput.candidateTargetIds,
      sourceInput.candidateIds,
      sourceInput.availableTargetIds,
      placement.payload.targetIds,
      [],
    ));
    if (candidateTargetIds.length) {
      for (const targetId of targetIds) {
        if (!candidateTargetIds.includes(targetId)) {
          addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_TARGET_NOT_CANDIDATE);
          break;
        }
      }
    }
  }
  const explicitAttackOutcome = hasProvidedValue(sourceInput.attackOutcome)
    || hasProvidedValue(sourceInput.attack?.outcome)
    || hasProvidedValue(session.attackOutcome);
  const legacyPreparedArea = sourceKind === "prepared-resolution"
    && PREPARED_AREA_HIT_SPELL_IDS.has(spellId)
    && !explicitAttackOutcome;
  let primaryTargetId = text(firstDefined(
    sourceInput.primaryTargetId,
    sourceInput.primaryId,
    session.primaryTargetId,
    "",
  ));
  const isChainLightning = spellId === CHAIN_LIGHTNING_TARGETING.spellId;
  const requiresPrimary = targetingContract.primaryTarget?.required === true
    || isChainLightning
    || (phase === "resolve" && PREPARED_AREA_HIT_SPELL_IDS.has(spellId));
  if (requiresPrimary && !primaryTargetId && !legacyPreparedArea) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PRIMARY_REQUIRED);
  } else if (requiresPrimary && !primaryTargetId && legacyPreparedArea) {
    primaryTargetId = targetIds[0] || "";
  }
  if (primaryTargetId && !targetIds.includes(primaryTargetId)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.PRIMARY_NOT_SELECTED);
  }
  if (new Set(targetIds).size !== targetIds.length) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.DUPLICATE_TARGETS);
  }

  const workflowRule = isChainLightning ? null : getSpellSaveWorkflowRule(spellId);
  const castResolutionRule = spell
    ? getSpellCastResolutionRule(spell)
    : null;
  const directDamageCast = sourceKind === "cast"
    && phase === "cast"
    && castResolutionRule?.resolution === "manual-damage";
  const requestedAttackOutcome = normalizeAttackOutcome(
    sourceInput,
    session,
    outcomesInput,
  );
  const attackResolution = spell
    ? getSpellAttackResolution(
      spell,
      requestedAttackOutcome || choiceValue,
      { slotLevel },
    )
    : null;
  const chainResult = isChainLightning
    ? chainTargeting({
      input: sourceInput,
      slotLevel,
      primaryTargetId,
      targetIds,
      errors,
    })
    : null;
  const maximumTargets = targetLimit(contract, slotLevel, chainResult, workflowRule);
  if (maximumTargets !== null && targetIds.length > maximumTargets) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.TARGET_LIMIT);
  }
  const ruleKind = placement.rule?.kind;
  const nonConfirmedZoneAllowsEmptyTargets = ruleKind === "zone"
    && targetMode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC
    && targetingContract.confirmTargets !== true;
  const allowEmptyTargets = (targetMode === SPELL_UNIFIED_TARGETING_MODES.NONE
    || phase === "prepare"
    || ruleKind === "zone"
    || ruleKind === "aura"
    || ruleKind === "board-token" && contract?.presentation?.targeting?.confirmTargets !== true
    || isTeleportSpell(spellId)
      ? placement.rule?.zonePolicy?.targetScope !== "spell-targets"
        && placement.rule?.zonePolicy?.initialResolution !== "manual-save"
      : false)
    || nonConfirmedZoneAllowsEmptyTargets;
  if (contract?.presentation?.inputs?.targets?.required === true
    && !targetIds.length
    && !allowEmptyTargets) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.TARGETS_REQUIRED);
  }
  validateTargetContexts(contract, workflowRule, targetIds, targetContexts, errors);

  const attackChoice = text(choiceValue).toLocaleLowerCase("it");
  let attackOutcome = attackResolution
    ? requestedAttackOutcome
      || (ATTACK_OUTCOME_SET.has(attackChoice) ? attackChoice : null)
    : requestedAttackOutcome;
  const preparedAttackRequired = sourceKind === "prepared-resolution"
    && phase === "resolve"
    && contract?.presentation?.phase?.plan?.attack?.required === true;
  if (preparedAttackRequired && !attackOutcome && legacyPreparedArea) attackOutcome = "hit";
  const attackRequired = activeAction?.capabilities?.attack === true
    || !!attackResolution
    || preparedAttackRequired;
  if (attackRequired && !attackOutcome && !legacyPreparedArea) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ATTACK_OUTCOME_REQUIRED);
  }
  if (attackOutcome && !ATTACK_OUTCOME_SET.has(attackOutcome)) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.ATTACK_OUTCOME_INVALID);
  }
  const saveOutcomesRequired = (
    contract?.presentation?.capabilities?.saveOutcomes === true
    && !(sourceKind === "prepared-resolution"
      && spellId === "phb2014-raffica-di-spine"
      && attackOutcome === "miss")
  )
    || activeAction?.capabilities?.save === true
    || validatedTrigger?.resolution === "manual-save";
  if (saveOutcomesRequired) {
    for (const targetId of targetIds) {
      if (!outcomes.byTarget[targetId]) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.OUTCOMES_REQUIRED);
    }
  }
  for (const targetId of Object.keys(outcomes.byTarget)) {
    if (!targetIds.includes(targetId)) addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.OUTCOME_TARGET_UNSELECTED);
  }

  const execution = normalizeExecution(contract, {
    activeAction,
    placementRule: placement.rule,
    placementPolicy: placement.policy,
    phase,
    sourceKind,
    errors,
  });
  const hp = normalizeHp(
    sourceInput,
    session,
    contract,
    placement.rule,
    activeAction,
    targetIds,
    outcomes,
    errors,
    attackResolution,
    attackOutcome,
    spell,
    primaryTargetId,
    legacyPreparedArea,
  );

  let resolutionResult = null;
  if (spell && !attackRequired && directDamageCast) {
    const postDamageEffects = Array.isArray(castResolutionRule?.postDamageEffects)
      ? castResolutionRule.postDamageEffects
      : [];
    resolutionResult = {
      valid: true,
      errors: [],
      spellId: spell.id,
      spellName: spell.displayName || spell.name,
      concentration: spell.concentration === true,
      casterId,
      targetIds,
      spellTargetIds: [...targetIds],
      conditionApplications: postDamageEffects
        .map((effect) => {
          const conditionName = spellEffectConditionName(effect);
          if (!conditionName) return null;
          return {
            targetIds: [...targetIds],
            conditionName,
            options: spellEffectConditionOptions(
              effect,
              { expiry: effect.expiry || { mode: "manual" } },
              effect.parentEffectId || "",
            ),
          };
        })
        .filter(Boolean),
    };
  } else if (spell && !attackRequired) {
    const resolutionOutcomes = saveOutcomesRequired
      ? outcomes.byTarget
      : workflowRule?.manualSaveAtTable === true
        ? Object.fromEntries(targetIds.map((targetId) => [
          targetId,
          outcomes.byTarget[targetId]
            || workflowRule.assumedOutcome
            || SAVE_SPELL_OUTCOMES.FAILED,
        ]))
        : Object.fromEntries(targetIds.map((targetId) => [
          targetId,
          SAVE_SPELL_OUTCOMES.FAILED,
        ]));
    resolutionResult = resolveSaveSpellResolution({
      spell,
      casterId,
      targetIds,
      outcomes: resolutionOutcomes,
      automation: sourceInput.automation
        ?? getAreaSaveAutomation(spell, choiceValue)
        ?? spell.saveAutomation
        ?? null,
      allowEmptyTargets,
      saveWorkflowRule: workflowRule,
      slotLevel,
      choiceValue,
      pairwiseDistancesMeters: sourceInput.pairwiseDistancesMeters
        ?? sourceInput.spatialValidation?.pairwiseDistancesMeters
        ?? [],
      casterDistancesMeters: sourceInput.casterDistancesMeters
        ?? sourceInput.spatialValidation?.casterDistancesMeters
        ?? {},
      validateSpatial: sourceInput.validateSpatial !== false,
      targetContexts,
    });
    addErrors(errors, resolutionResult.errors);
  }
  if (chainResult) addErrors(errors, chainResult.errors);

  const spatialValidation = serializable(
    chainResult
      || resolutionResult?.targeting?.spatial
      || sourceInput.spatialValidation
      || sourceInput.spatial
      || null,
  );
  if (
    contract?.presentation?.targeting?.spatialRules?.mode === "placement-range"
    && sourceInput.validateSpatial !== false
    && Array.isArray(spatialValidation?.invalidTargetIds)
    && spatialValidation.invalidTargetIds.length
  ) {
    addError(errors, "target-out-of-range");
  }
  const locked = validatedTrigger?.targetLocked === true
    || placement.locked === true
    || sourceInput.targetLocked === true
    || sourceInput.targetSelectionLocked === true;
  if (
    (targetMode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC && targetIds.length)
    && !locked
    && (placement.payload || sourceKind === "zone-trigger")
  ) {
    addError(errors, SPELL_AREA_RESOLUTION_ERROR_CODES.TARGET_LOCK_REQUIRED);
  }
  const executionOutput = {
    ...execution,
    ...(validatedTrigger ? {
      zoneTrigger: validatedTrigger,
    } : {}),
    ...(validatedTrigger?.instanceId ? {
      ownerContext: { instanceId: validatedTrigger.instanceId, casterId: casterId || null },
    } : {}),
  };
  const command = {
    type: SPELL_AREA_RESOLUTION_COMMAND_TYPE,
    source: {
      kind: SOURCE_KIND_SET.has(sourceKind) ? sourceKind : null,
      sceneEpoch: sceneEpoch ?? null,
      ...(parentInstanceId ? { parentInstanceId } : {}),
      activationId: validatedTrigger?.activationId || activationId || null,
    },
    ...(sourceInput.automation && typeof sourceInput.automation === "object"
      ? { automation: serializable(sourceInput.automation) }
      : {}),
    ...(sourceInput.phaseResolution && typeof sourceInput.phaseResolution === "object"
      ? { phaseResolution: serializable(sourceInput.phaseResolution) }
      : {}),
    spell: {
      spellId: spellId || null,
      casterId: casterId || null,
      slotLevel,
      phase: phase || null,
      actionId: actionId || null,
      choiceValue: choiceValue || null,
      ...(session.castContext && Object.keys(session.castContext).length
        ? { castContext: serializable(session.castContext) }
        : sourceInput.castContext && Object.keys(sourceInput.castContext).length
          ? { castContext: serializable(sourceInput.castContext) }
          : {}),
    },
    targeting: {
      mode: [
        SPELL_UNIFIED_TARGETING_MODES.DISCRETE,
        SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC,
        SPELL_UNIFIED_TARGETING_MODES.NONE,
      ].includes(targetMode) ? targetMode : SPELL_UNIFIED_TARGETING_MODES.NONE,
      targetIds,
      primaryTargetId: primaryTargetId || null,
      targetContexts,
      locked,
      spatialValidation,
    },
    placement: placement.commandPlacement,
    outcomes: {
      required: saveOutcomesRequired || attackRequired,
      byTarget: outcomes.byTarget,
      ...(attackOutcome ? { attack: attackOutcome } : {}),
    },
    hp,
    execution: executionOutput,
    resolution: resolutionProjection(
      resolutionResult,
      chainResult,
      attackResolution,
    ),
    valid: errors.length === 0,
    errors,
  };
  return freeze(serializable(command));
}

export const buildSpellAreaResolutionModel = buildSpellAreaResolutionCommand;
