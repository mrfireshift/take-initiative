import {
  resolveSpellConcentration,
  resolveSpellSlotLevel,
  resolveSpellSubjectIds,
} from "./spellCastContextCore.js";
import {
  getSpellCastPhasePlan,
} from "./spellCastPhaseCore.js";
import { getSpellDefinition } from "./spells-srd.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";
import {
  SPELL_UNIFIED_PANEL_LANES,
} from "./spellUnifiedPanelCore.js";

export const SPELL_UNIFIED_LIFECYCLE_STATUS = Object.freeze({
  COMMITTED: "committed",
  REJECTED: "rejected",
  FAILED: "failed",
});

function text(value) {
  return String(value || "").trim();
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function integerOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function hasValue(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "" && Number.isFinite(Number(value));
  return value !== null && value !== undefined;
}

function placementConfirmed(contract, session) {
  const policy = text(contract?.presentation?.placement?.policy);
  if (policy === "automatic") return true;
  const placement = session?.placement;
  return placement?.confirmed === true
    || text(placement?.state || placement?.status) === "confirmed";
}

function normalizedError(error, fallbackCode = "spell-lifecycle-failed") {
  return {
    code: text(error?.code) || fallbackCode,
    message: text(error?.message || error) || "Operazione non riuscita.",
  };
}

export class SpellUnifiedLifecycleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SpellUnifiedLifecycleError";
    this.code = code;
    this.details = details;
  }
}

export function getSpellUnifiedLifecycleEligibility(contract = null) {
  if (!contract) {
    return {
      eligible: false,
      code: "spell-required",
      message: "Seleziona un incantesimo.",
    };
  }

  const execution = contract.execution || {};
  const inputs = contract.presentation?.inputs || {};
  const placement = contract.presentation?.placement || {};
  const reject = (code, message) => ({ eligible: false, code, message });

  if (execution.lane !== SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE) {
    return reject("lane-not-supported", "Questo workflow usa una lane dedicata.");
  }
  if (execution.hasZones === true) {
    return reject("zones-not-supported", "Le zone restano gestite dal workflow area.");
  }
  if (execution.hasTokens === true) {
    return reject("tokens-not-supported", "Le pedine restano gestite dal workflow dedicato.");
  }
  if (execution.activeResolution === true && text(execution.selectedActionId)) {
    return reject("active-resolution-not-supported", "La risoluzione attiva resta separata.");
  }
  if (execution.requiresCompositeUndo === true || execution.undo?.scope === "composite") {
    return reject("composite-undo-not-supported", "Questa applicazione richiede undo composito.");
  }
  if (placement.policy === "required" || inputs.placement?.required === true) {
    return reject("placement-not-supported", "Il placement richiesto resta nella lane area.");
  }
  if (inputs.hp?.required === true
    || inputs.damage?.required === true
    || inputs.healing?.required === true) {
    return reject("hp-input-not-supported", "Gli input HP restano nella lane area.");
  }
  return { eligible: true, code: null, message: "" };
}

function fallbackSpell(contract, session) {
  const id = text(contract?.spell?.id);
  const label = text(session?.enteredName || contract?.spell?.label || id);
  return {
    id,
    name: label,
    displayName: label,
    level: Number(contract?.spell?.level) || 0,
    concentration: contract?.spell?.concentration === true,
    targetMode: text(contract?.presentation?.subjectMode) || "selected",
    duration: contract?.presentation?.duration?.label || "",
    defaultTurns: contract?.presentation?.duration?.defaultTurns,
    effects: [],
    effectChoices: [],
  };
}

function resolveRuntimeSpell(contract, session, runtime = {}) {
  return runtime.spell
    || getSpellDefinition(contract?.spell?.id)
    || fallbackSpell(contract, session);
}

function requiredTargetContextComplete(contract, targetIds, targetContext) {
  const fields = contract?.presentation?.targeting?.workflow?.context?.fields;
  const required = Array.isArray(fields)
    ? fields.filter((field) => field?.required === true)
    : [];
  if (!required.length) return true;
  return targetIds.every((targetId) => required.every((field) => hasValue(
    targetContext?.[targetId]?.[field.id],
  )));
}

function validationErrors(contract, session, targetIds, phasePlan, slotLevel, durationTurns) {
  const inputs = contract.presentation?.inputs || {};
  const errors = [];
  const add = (field, code) => {
    if (!errors.some((entry) => entry.field === field)) errors.push({ field, code });
  };

  if (inputs.caster?.required && !text(session.casterId)) add("caster", "caster-required");
  if (inputs.slot?.required && integerOrNull(slotLevel) === null) {
    add("slot-level", "slot-level-required");
  }
  if (inputs.duration?.required && !hasValue(durationTurns)) {
    add("duration", "duration-required");
  }
  if (inputs.variant?.required && !text(session.variant)) add("variant", "variant-required");
  if (inputs.targets?.required && !targetIds.length) add("targets", "targets-required");
  if (Number.isInteger(inputs.targets?.maximum)
    && inputs.targets.maximum >= 0
    && targetIds.length > inputs.targets.maximum) {
    add("targets", "target-limit-exceeded");
  }
  if (inputs.primaryTarget?.required && (
    !text(session.primaryTargetId)
    || !targetIds.includes(text(session.primaryTargetId))
  )) {
    add("primary-target", "primary-target-required");
  }
  if (inputs.targetContext?.required
    && !requiredTargetContextComplete(contract, targetIds, session.targetContext)) {
    add("target-context", "target-context-required");
  }
  if (inputs.placement?.required && !placementConfirmed(contract, session)) {
    add("placement", "placement-required");
  }
  if (inputs.outcomes?.required && targetIds.some((id) => !session.outcomes?.[id])) {
    add("outcomes", "outcomes-required");
  }
  if (inputs.damage?.required && !hasValue(session.hpValues?.damage)) {
    add("damage", "damage-required");
  }
  if (inputs.healing?.required && !hasValue(session.hpValues?.healing)) {
    add("healing", "healing-required");
  }
  if (phasePlan?.phase === "prepare" && !text(session.casterId)) {
    add("caster", "prepared-caster-required");
  }
  return errors;
}

export function buildSpellUnifiedLifecycleRequest({
  contract = null,
  session = {},
  spell = null,
  activeConcentration = null,
  appliedAt = undefined,
  casterName = "",
  castContext = {},
} = {}) {
  const eligibility = getSpellUnifiedLifecycleEligibility(contract);
  if (!eligibility.eligible) {
    throw new SpellUnifiedLifecycleError(
      eligibility.code,
      eligibility.message,
      { eligibility },
    );
  }

  const runtimeSpell = spell || resolveRuntimeSpell(contract, session, {});
  const phase = text(session.phase || contract.presentation?.phase?.selected) || "cast";
  const slotLevel = session.slotLevel ?? contract.presentation?.slot?.default ?? null;
  const selectedChoice = text(session.variant || contract.presentation?.variant?.selected);
  const mergedCastContext = {
    ...(castContext && typeof castContext === "object" ? clone(castContext) : {}),
    ...(session.castContext && typeof session.castContext === "object"
      ? clone(session.castContext)
      : {}),
    phase,
    ...(slotLevel !== null && slotLevel !== undefined ? { slotLevel } : {}),
    ...(selectedChoice ? { choice: selectedChoice } : {}),
    ...(text(session.primaryTargetId)
      ? { primaryTargetId: text(session.primaryTargetId) }
      : {}),
    ...(session.targetContext && Object.keys(session.targetContext).length
      ? { targetContext: clone(session.targetContext) }
      : {}),
  };
  const phasePlan = getSpellCastPhasePlan(
    runtimeSpell,
    phase === "cast" ? "" : phase,
    mergedCastContext,
  );
  const targetIds = resolveSpellSubjectIds({
    spell: runtimeSpell,
    casterId: session.casterId,
    selectedIds: session.targetIds,
    subjectMode: phasePlan.subjectMode || contract.presentation.subjectMode,
  });
  const durationPolicy = contract.presentation?.duration?.policy;
  const durationTurns = durationPolicy === "manual"
    ? integerOrNull(session.durationTurns)
    : integerOrNull(
      contract.presentation?.duration?.defaultTurns
      ?? runtimeSpell.defaultTurns
      ?? session.durationTurns
      ?? 1,
    );
  const normalizedSlot = integerOrNull(slotLevel) === null
    ? null
    : resolveSpellSlotLevel(runtimeSpell, slotLevel);
  const errors = validationErrors(
    contract,
    session,
    targetIds,
    phasePlan,
    normalizedSlot,
    durationTurns,
  );
  if (errors.length) {
    throw new SpellUnifiedLifecycleError(
      "session-incomplete",
      "Completa i campi richiesti prima dell'applicazione.",
      { fields: errors },
    );
  }

  return {
    spell: runtimeSpell,
    enteredName: text(session.enteredName)
      || text(runtimeSpell.displayName || runtimeSpell.name || contract.spell.label),
    turns: Math.max(1, durationTurns || 1),
    casterId: text(session.casterId),
    targetIds: uniqueIds(targetIds),
    castContext: mergedCastContext,
    selectedChoice,
    phasePlan,
    applyAutomatedConditions: session.applyAutomatedConditions !== false,
    activeConcentration: activeConcentration || session.activeConcentration || null,
    requestedConcentration: resolveSpellConcentration(
      runtimeSpell,
      session.requestedConcentration === true,
    ),
    ...(appliedAt !== undefined ? { appliedAt } : {}),
    ...(text(casterName) ? { casterName: text(casterName) } : {}),
  };
}

export async function executeSpellUnifiedLifecycle({
  contract = null,
  session = {},
  runtime = {},
} = {}) {
  let request = null;
  try {
    const runtimeSpell = resolveRuntimeSpell(contract, session, runtime);
    let resolvedActiveConcentration = runtime.activeConcentration
      || session.activeConcentration
      || null;
    if (!resolvedActiveConcentration && typeof runtime.resolveActiveConcentration === "function") {
      resolvedActiveConcentration = await runtime.resolveActiveConcentration({
        casterId: text(session.casterId),
        spell: runtimeSpell,
        contract,
        session,
      });
    }
    let appliedAt = runtime.appliedAt;
    if (appliedAt === undefined && typeof runtime.getAppliedAt === "function") {
      appliedAt = await runtime.getAppliedAt();
    }
    request = buildSpellUnifiedLifecycleRequest({
      contract,
      session,
      spell: runtimeSpell,
      activeConcentration: resolvedActiveConcentration,
      appliedAt,
      casterName: runtime.casterName,
      castContext: runtime.castContext,
    });
  } catch (error) {
    const normalized = normalizedError(error, "session-incomplete");
    return {
      status: SPELL_UNIFIED_LIFECYCLE_STATUS.REJECTED,
      changedIds: [],
      error: normalized,
      request: null,
    };
  }

  const executor = typeof runtime.executor === "function"
    ? runtime.executor
    : (await import("./spellApplicationExecutor.js")).executeSpellApplication;
  try {
    const executionResult = await executor(request);
    const changedIds = Array.isArray(executionResult)
      ? executionResult
      : executionResult?.changedIds;
    const history = spellExecutionHistoryDetails(executionResult);
    return {
      status: SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED,
      changedIds: uniqueIds(changedIds),
      ...history,
      error: null,
      request,
    };
  } catch (error) {
    return {
      status: SPELL_UNIFIED_LIFECYCLE_STATUS.FAILED,
      changedIds: [],
      error: normalizedError(error),
      request,
    };
  }
}
