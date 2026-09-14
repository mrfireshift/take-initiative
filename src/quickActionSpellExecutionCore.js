import {
  quickActionDirectTargetIds,
  quickActionInitialTargetIds,
  sanitizeQuickAction,
} from "./quickActionsCore.js";
import { ID } from "./constants.js";
import {
  resolveSpellConcentration,
  resolveSpellSlotLevel,
} from "./spellCastContextCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";
import { getSpellDefinition } from "./spells-srd.js";
import {
  buildSpellUnifiedLifecycleRequest,
  getSpellUnifiedLifecycleEligibility,
} from "./spellUnifiedLifecycleAdapter.js";
import {
  getSpellUnifiedAreaEligibility,
} from "./spellUnifiedAreaAdapter.js";
import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_PANEL_LANES,
} from "./spellUnifiedPanelCore.js";
import {
  buildSpellUnifiedPanelRouteQuery,
} from "./spellUnifiedPanelRoutingCore.js";
import { applyTargetingLimitState } from "./spellTargetingCapacityCore.js";

const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;

export const QUICK_ACTION_INITIAL_SAVE_OUTCOME = "failed";

function text(value) {
  return String(value ?? "").trim();
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function spellReviewRoute({ normalized, spell, session, initialTargetIds }) {
  const request = {
    intent: "spell-cast",
    sourceId: session.casterId,
    casterId: session.casterId,
    spellId: spell.id,
    phase: session.phase,
    slotLevel: session.slotLevel,
    durationTurns: session.durationTurns,
    applyAutomatedConditions: session.applyAutomatedConditions,
    targetIds: initialTargetIds,
    origin: "quick-action",
    quickActionId: normalized.id,
  };
  const query = buildSpellUnifiedPanelRouteQuery(request);
  return {
    destination: "spell-unified-panel",
    request,
    query: Object.fromEntries(query.entries()),
    queryString: query.toString(),
  };
}

function review({ normalized, spell, contract, session, initialTargetIds, reason }) {
  return {
    mode: "review",
    reason,
    kind: "spell",
    launchMode: normalized.launchMode,
    spellId: spell.id,
    contract,
    session,
    route: spellReviewRoute({ normalized, spell, session, initialTargetIds }),
  };
}

function invalid(reason, extra = {}) {
  return {
    mode: "invalid",
    reason,
    ...extra,
  };
}

function contractReviewReason(contract, phasePlan) {
  const execution = contract?.execution || {};
  const inputs = contract?.presentation?.inputs || {};
  const placement = contract?.presentation?.placement || {};
  const targeting = contract?.presentation?.targeting || {};
  const phase = contract?.presentation?.phase || {};
  const variant = contract?.presentation?.variant || {};

  if (execution.lane !== SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE) {
    return "lane-not-supported";
  }
  if (execution.hasZones === true) return "zones-required";
  if (execution.hasTokens === true) return "tokens-required";
  if (execution.activeResolution === true && text(execution.selectedActionId)) {
    return "active-resolution-required";
  }
  if (execution.requiresCompositeUndo === true || execution.undo?.scope === "composite") {
    return "composite-undo-required";
  }
  if (placement.policy && placement.policy !== "unavailable") {
    return "placement-required";
  }
  if (inputs.placement?.required === true) return "placement-required";
  if (execution.castHasHP === true
    || execution.phaseHasHP === true
    || inputs.hp?.required === true
    || inputs.damage?.required === true
    || inputs.healing?.required === true) {
    return "hp-input-required";
  }
  if (inputs.outcomes?.required === true) return "outcomes-required";
  if (variant.required === true || (Array.isArray(variant.options) && variant.options.length)) {
    return "variant-review-required";
  }
  if (inputs.primaryTarget?.required === true || targeting.primaryTarget?.required === true) {
    return "primary-target-review-required";
  }
  if (targeting.spatialRules || targeting.mode === "geometric" || targeting.confirmTargets === true) {
    return "spatial-targeting-review-required";
  }
  if (inputs.targetContext?.required === true) return "target-context-review-required";
  const phaseValues = Array.isArray(phase.options)
    ? phase.options.map((option) => text(option?.value)).filter(Boolean)
    : [];
  if (phase.selected && phase.selected !== "cast") return "prepared-resolution-required";
  if (phaseValues.some((value) => value !== "cast")) return "prepared-resolution-required";
  if (phasePlan?.phase && phasePlan.phase !== "cast") return "prepared-resolution-required";
  if (phasePlan?.subjectMode === "caster") return "prepared-resolution-required";
  return "";
}

function quickActionEligibilityReason(contract, eligibility) {
  if (
    eligibility?.code === "lane-not-supported"
    && contract?.execution?.lane === "area-transaction"
  ) {
    return "area-review-required";
  }
  return text(eligibility?.code) || "lifecycle-review-required";
}

function hasRequiredInput(inputs, key) {
  return inputs?.[key]?.required === true;
}

function phaseRequiresReview(presentation) {
  const phase = presentation?.phase || {};
  const phaseValues = Array.isArray(phase.options)
    ? phase.options.map((option) => text(option?.value)).filter(Boolean)
    : [];
  return Boolean(
    (phase.selected && phase.selected !== "cast")
      || phaseValues.some((value) => value !== "cast")
      || (phase.plan?.phase && phase.plan.phase !== "cast")
      || phase.plan?.subjectMode === "caster",
  );
}

/**
 * A Quick Action can skip only the initial save outcome picker when the
 * contract leaves no other cast input to resolve. The normal area command
 * and save resolver still validate the target set and consume the explicit
 * outcome map.
 */
export function getQuickActionDirectSaveEligibility({
  contract = null,
  targetIds = [],
} = {}) {
  const execution = contract?.execution || {};
  const presentation = contract?.presentation || {};
  const inputs = presentation.inputs || {};
  const placement = presentation.placement || {};
  const targeting = presentation.targeting || {};
  const variant = presentation.variant || {};
  const outcomes = presentation.outcomes || {};

  const reject = (reason) => ({ eligible: false, reason });
  if (execution.lane !== SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION) {
    return reject("lane-not-supported");
  }
  if (execution.hasZones === true) return reject("zones-required");
  if (execution.hasTokens === true) return reject("tokens-required");
  if (execution.activeResolution === true || text(execution.selectedActionId)) {
    return reject("active-resolution-required");
  }
  if (phaseRequiresReview(presentation)) return reject("prepared-resolution-required");
  if (targeting.mode !== "discrete") return reject("spatial-targeting-review-required");
  if (targeting.confirmTargets === true) return reject("target-confirmation-required");
  if (placement.policy && placement.policy !== "unavailable") {
    return reject("placement-required");
  }
  if (hasRequiredInput(inputs, "placement")) return reject("placement-required");
  if (variant.required === true || (Array.isArray(variant.options) && variant.options.length)) {
    return reject("variant-review-required");
  }
  if (hasRequiredInput(inputs, "composition")) return reject("composition-review-required");
  if (hasRequiredInput(inputs, "duration")) return reject("duration-review-required");
  if (hasRequiredInput(inputs, "primaryTarget") || targeting.primaryTarget?.required === true) {
    return reject("primary-target-review-required");
  }
  if (hasRequiredInput(inputs, "targetContext")) return reject("target-context-review-required");
  if (
    execution.hasHP === true
    || execution.castHasHP === true
    || execution.phaseHasHP === true
    || execution.deferredHP === true
    || hasRequiredInput(inputs, "hp")
    || hasRequiredInput(inputs, "damage")
    || hasRequiredInput(inputs, "primaryDamage")
    || hasRequiredInput(inputs, "healing")
  ) {
    return reject("hp-input-required");
  }
  if (presentation.capabilities?.saveOutcomes !== true
    || inputs.outcomes?.required !== true
    || outcomes.mode !== "save") {
    return reject("outcomes-required");
  }

  const capacity = applyTargetingLimitState(
    targeting.limit || {},
    { targetIds },
  );
  if (capacity.errors?.length) return reject("target-capacity-invalid");
  if (capacity.resolved === false || capacity.contextMissing === true) {
    return reject("target-capacity-context-required");
  }
  if (capacity.exceeded) return reject("target-limit-exceeded");
  return {
    eligible: true,
    reason: "direct-safe",
    targetingCapacity: capacity,
  };
}

function quickActionInitialSaveOutcomes(targetIds = []) {
  return Object.fromEntries(uniqueIds(targetIds).map((targetId) => [
    targetId,
    QUICK_ACTION_INITIAL_SAVE_OUTCOME,
  ]));
}

function isDirectAutomaticAreaCast(contract) {
  const execution = contract?.execution || {};
  const presentation = contract?.presentation || {};
  const inputs = presentation.inputs || {};
  const placement = presentation.placement || {};
  const targeting = presentation.targeting || {};
  const phase = presentation.phase || {};
  const variant = presentation.variant || {};
  const placementRules = Array.isArray(placement.rules) ? placement.rules : [];
  const phaseValues = Array.isArray(phase.options)
    ? phase.options.map((option) => text(option?.value)).filter(Boolean)
    : [];
  return execution.lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION
    && execution.hasZones === true
    && !text(execution.selectedActionId)
    && execution.castHasHP !== true
    && execution.phaseHasHP !== true
    && placement.policy === "automatic"
    && placement.mode === "area"
    && placementRules.length === 1
    && placementRules[0]?.kind === "aura"
    && targeting.mode === "geometric"
    && targeting.confirmTargets !== true
    && phase.selected === "cast"
    && !phaseValues.some((value) => value !== "cast")
    && variant.required !== true
    && !(Array.isArray(variant.options) && variant.options.length)
    && inputs.duration?.required !== true
    && inputs.targets?.required !== true
    && inputs.primaryTarget?.required !== true
    && inputs.targetContext?.required !== true
    && inputs.placement?.required !== true
    && inputs.outcomes?.required !== true
    && inputs.hp?.required !== true
    && inputs.damage?.required !== true
    && inputs.healing?.required !== true;
}

function candidateSession({ normalized, spell, contract, casterId, targetIds }) {
  const slotLevel = resolveSpellSlotLevel(spell, normalized.slotLevel);
  const castContext = Number.isInteger(slotLevel) ? { slotLevel } : {};
  const phasePlan = getSpellCastPhasePlan(spell, "", castContext);
  const phase = text(contract?.presentation?.phase?.selected)
    || text(phasePlan?.phase)
    || "cast";
  const durationTurns = normalized.turns
    ?? contract?.presentation?.duration?.defaultTurns
    ?? spell.defaultTurns
    ?? null;
  return {
    spellId: spell.id,
    phase,
    casterId,
    slotLevel: Number.isInteger(slotLevel) ? slotLevel : null,
    durationTurns: Number.isInteger(durationTurns) ? durationTurns : null,
    applyAutomatedConditions: normalized.applyAutomations !== false,
    targetIds: uniqueIds(targetIds),
    targetContext: {},
    primaryTargetId: "",
    variant: "",
    placement: null,
    outcomes: {},
    hpValues: { hp: null, damage: null, healing: null },
    castContext,
    requestedConcentration: resolveSpellConcentration(spell, false),
    enteredName: spell.displayName || spell.name || spell.id,
    phasePlan,
  };
}

export function quickActionConcentrationNames(item) {
  const concentrations = item?.metadata?.[META_KEY]?.[CONC_META_KEY];
  if (!concentrations || typeof concentrations !== "object") return [];
  return Array.from(new Set(
    Object.entries(concentrations)
      .map(([key, entry]) =>
        String(entry?.name || entry?.spellName || key || "").trim()
      )
      .filter(Boolean)
  ));
}

export function buildQuickActionSpellLaunchPlan({
  action = null,
  sourceId = "",
  selectedTargetIds = [],
} = {}) {
  const normalized = sanitizeQuickAction(action);
  if (!normalized || normalized.kind !== "spell") {
    return invalid("unsupported-action");
  }

  const casterId = text(sourceId);
  const spell = getSpellDefinition(normalized.spellId);
  if (!spell || !casterId) {
    return invalid("spell-or-caster-missing", {
      kind: "spell",
      spellId: normalized.spellId,
    });
  }

  const slotLevel = resolveSpellSlotLevel(spell, normalized.slotLevel);
  const contract = buildSpellUnifiedPanelContract({
    spellId: spell.id,
    castContext: { slotLevel },
  });
  if (!contract) return invalid("spell-contract-missing", { spellId: spell.id });

  const initialTargetIds = quickActionInitialTargetIds(
    normalized,
    casterId,
    selectedTargetIds,
  );
  const directTargetIds = quickActionDirectTargetIds(
    normalized,
    casterId,
    selectedTargetIds,
  );
  const reviewSession = candidateSession({
    normalized,
    spell,
    contract,
    casterId,
    targetIds: initialTargetIds,
  });

  if (normalized.launchMode === "review") {
    return review({
      normalized,
      spell,
      contract,
      session: reviewSession,
      initialTargetIds,
      reason: "launch-mode-review",
    });
  }

  if (isDirectAutomaticAreaCast(contract)) {
    const areaEligibility = getSpellUnifiedAreaEligibility(contract, reviewSession);
    if (!areaEligibility.eligible) {
      return review({
        normalized,
        spell,
        contract,
        session: reviewSession,
        initialTargetIds,
        reason: quickActionEligibilityReason(contract, areaEligibility),
      });
    }
    const session = candidateSession({
      normalized,
      spell,
      contract,
      casterId,
      targetIds: [],
    });
    return {
      mode: "direct",
      reason: "direct-safe",
      kind: "spell",
      launchMode: normalized.launchMode,
      spellId: spell.id,
      contract,
      session,
      areaExecution: true,
      initialTargetIds,
      replacesConcentration: resolveSpellConcentration(spell, false) === true
        && session.phasePlan?.concentrationAction === "replace",
    };
  }

  const directSaveEligibility = getQuickActionDirectSaveEligibility({
    contract,
    targetIds: initialTargetIds,
  });
  if (directSaveEligibility.eligible) {
    if (!initialTargetIds.length) {
      return review({
        normalized,
        spell,
        contract,
        session: reviewSession,
        initialTargetIds,
        reason: "targets-missing",
      });
    }
    const session = candidateSession({
      normalized,
      spell,
      contract,
      casterId,
      targetIds: initialTargetIds,
    });
    session.outcomes = quickActionInitialSaveOutcomes(initialTargetIds);
    return {
      mode: "direct",
      reason: "direct-safe",
      kind: "spell",
      launchMode: normalized.launchMode,
      spellId: spell.id,
      contract,
      session,
      areaExecution: true,
      initialTargetIds,
      initialSaveOutcome: QUICK_ACTION_INITIAL_SAVE_OUTCOME,
      initialSaveOutcomeSource: "quick-action",
      targetingCapacity: directSaveEligibility.targetingCapacity,
      fallbackRoute: spellReviewRoute({ normalized, spell, session, initialTargetIds }),
      replacesConcentration: resolveSpellConcentration(spell, false) === true
        && session.phasePlan?.concentrationAction === "replace",
    };
  }

  const eligibility = getSpellUnifiedLifecycleEligibility(contract);
  if (!eligibility.eligible) {
    return review({
      normalized,
      spell,
      contract,
      session: reviewSession,
      initialTargetIds,
      reason: quickActionEligibilityReason(contract, eligibility),
    });
  }

  const phaseReason = contractReviewReason(contract, reviewSession.phasePlan);
  if (phaseReason) {
    return review({
      normalized,
      spell,
      contract,
      session: reviewSession,
      initialTargetIds,
      reason: phaseReason,
    });
  }

  if (!directTargetIds.length) {
    return review({
      normalized,
      spell,
      contract,
      session: reviewSession,
      initialTargetIds,
      reason: normalized.targetMode === "selection"
        ? "single-target-required"
        : "targets-missing",
    });
  }

  const session = candidateSession({
    normalized,
    spell,
    contract,
    casterId,
    targetIds: directTargetIds,
  });
  let lifecycleRequest;
  try {
    lifecycleRequest = buildSpellUnifiedLifecycleRequest({
      contract,
      session,
      spell,
    });
  } catch (error) {
    return review({
      normalized,
      spell,
      contract,
      session,
      initialTargetIds,
      reason: text(error?.details?.fields?.[0]?.code || error?.code)
        || "session-incomplete",
    });
  }

  const replacesConcentration = lifecycleRequest.requestedConcentration === true
    && lifecycleRequest.phasePlan?.concentrationAction === "replace";
  return {
    mode: "direct",
    reason: "direct-safe",
    kind: "spell",
    launchMode: normalized.launchMode,
    spellId: spell.id,
    contract,
    session,
    lifecycleRequest,
    initialTargetIds,
    fallbackRoute: spellReviewRoute({ normalized, spell, session, initialTargetIds }),
    replacesConcentration,
  };
}

// Kept as a narrow compatibility alias for modules from the previous phase.
export function buildDirectQuickActionSpellRequest(args = {}) {
  return buildQuickActionSpellLaunchPlan(args);
}
