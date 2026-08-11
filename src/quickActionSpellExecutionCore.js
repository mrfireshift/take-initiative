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
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_PANEL_LANES,
} from "./spellUnifiedPanelCore.js";
import {
  buildSpellUnifiedPanelRouteQuery,
} from "./spellUnifiedPanelRoutingCore.js";

const META_KEY = `${ID}/meta`;
const CONC_META_KEY = `${ID}/concentration`;

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

function review({ normalized, spell, contract, session, initialTargetIds, reason }) {
  const routeRequest = {
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
  const query = buildSpellUnifiedPanelRouteQuery(routeRequest);
  return {
    mode: "review",
    reason,
    kind: "spell",
    launchMode: normalized.launchMode,
    spellId: spell.id,
    contract,
    session,
    route: {
      destination: "spell-unified-panel",
      request: routeRequest,
      query: Object.fromEntries(query.entries()),
      queryString: query.toString(),
    },
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

  const contract = buildSpellUnifiedPanelContract({ spellId: spell.id });
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
    replacesConcentration,
  };
}

// Kept as a narrow compatibility alias for modules from the previous phase.
export function buildDirectQuickActionSpellRequest(args = {}) {
  return buildQuickActionSpellLaunchPlan(args);
}
