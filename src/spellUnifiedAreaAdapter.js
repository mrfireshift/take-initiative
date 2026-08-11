import {
  buildSpellAreaResolutionCommand,
} from "./spellAreaResolutionCommandCore.js";
import {
  SPELL_PANEL_PLACEMENT_POLICIES,
  SPELL_UNIFIED_PANEL_LANES,
  SPELL_UNIFIED_TARGETING_MODES,
} from "./spellUnifiedPanelCore.js";

export const SPELL_UNIFIED_AREA_STATUS = Object.freeze({
  APPLIED: "applied",
  NOOP: "noop",
  REJECTED: "rejected",
  FAILED: "failed",
  UNDONE: "undone",
});

export const SPELL_UNIFIED_AREA_ERROR_CODES = Object.freeze({
  SPELL_REQUIRED: "spell-required",
  LANE_NOT_SUPPORTED: "lane-not-supported",
  ZONES_NOT_SUPPORTED: "zones-not-supported",
  TOKENS_NOT_SUPPORTED: "tokens-not-supported",
  ACTIVE_ACTION_NOT_SUPPORTED: "active-action-not-supported",
  TRIGGER_NOT_SUPPORTED: "zone-trigger-not-supported",
  PREPARED_NOT_SUPPORTED: "prepared-resolution-not-supported",
  PREPARED_INSTANCE_REQUIRED: "prepared-instance-required",
  PREPARED_INSTANCE_STALE: "prepared-instance-stale",
  CHILD_ZONE_NOT_SUPPORTED: "child-zone-not-supported",
  TARGETING_NOT_SUPPORTED: "targeting-not-supported",
  PLACEMENT_NOT_SUPPORTED: "placement-not-supported",
  SPATIAL_VALIDATION_FAILED: "spatial-validation-failed",
  COMMAND_INVALID: "command-invalid",
  EXECUTOR_FAILED: "executor-failed",
  UNDO_UNAVAILABLE: "undo-unavailable",
  UNDO_API_UNAVAILABLE: "undo-api-unavailable",
  UNDO_FAILED: "undo-failed",
});

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

function normalizedError(error, fallbackCode = SPELL_UNIFIED_AREA_ERROR_CODES.EXECUTOR_FAILED) {
  if (typeof error === "string") return { code: fallbackCode, message: error };
  return {
    code: text(error?.code || error?.reason || error?.name) || fallbackCode,
    message: text(error?.message || error?.reason) || "Operazione non riuscita.",
  };
}

function errorList(errors = [], fallbackCode = SPELL_UNIFIED_AREA_ERROR_CODES.COMMAND_INVALID) {
  return (Array.isArray(errors) ? errors : [errors])
    .filter((error) => error !== null && error !== undefined && error !== "")
    .map((error) => typeof error === "object"
      ? normalizedError(error, fallbackCode)
      : { code: text(error) || fallbackCode, message: "" });
}

function resultBase({
  status = SPELL_UNIFIED_AREA_STATUS.REJECTED,
  command = null,
  changedIds = [],
  historyEntryId = "",
  undoAvailable = false,
  warnings = [],
  errors = [],
  instanceId = "",
  } = {}) {
  const targetIds = uniqueIds(command?.targeting?.targetIds);
  return {
    status,
    commandType: text(command?.type) || "spell-area-resolution",
    spellId: text(command?.spell?.spellId),
    instanceId: text(instanceId),
    casterId: text(command?.spell?.casterId),
    changedIds: uniqueIds(changedIds),
    historyEntryId: text(historyEntryId),
    undoAvailable: undoAvailable === true,
    targetIds,
    hpChanges: [],
    effectChanges: [],
    sceneItemChanges: [],
    triggerChanges: [],
    warnings: errorList(warnings, "area-warning"),
    errors: errorList(errors),
    summary: {
      targetCount: targetIds.length,
      changedCount: uniqueIds(changedIds).length,
      hpChangeCount: 0,
      effectChangeCount: 0,
    },
  };
}

function selectedAction(contract, session) {
  const actionId = text(session?.activeActionId || contract?.execution?.selectedActionId);
  if (!actionId) return null;
  return (Array.isArray(contract?.presentation?.activeActions)
    ? contract.presentation.activeActions
    : [])
    .find((action) => text(action?.id) === actionId) || null;
}

function reject(code, message) {
  return { eligible: false, code, message };
}

export function getSpellUnifiedAreaEligibility(contract = null, session = {}) {
  if (!contract) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.SPELL_REQUIRED,
      "Seleziona un incantesimo.",
    );
  }

  const execution = contract.execution || {};
  const presentation = contract.presentation || {};
  const targeting = presentation.targeting || {};
  const placement = presentation.placement || {};
  const action = selectedAction(contract, session);
  const phase = text(session.phase || presentation.phase?.selected);
  const boardTokenLifecycle = execution.lane === SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE
    && execution.hasTokens === true;
  const areaTransaction = execution.lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION;

  if (!areaTransaction && !boardTokenLifecycle) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.LANE_NOT_SUPPORTED,
      "Questo workflow non appartiene alla transazione area.",
    );
  }
  if (action || text(session.activeActionId)) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.ACTIVE_ACTION_NOT_SUPPORTED,
      "Le active actions restano nel workflow di risoluzione dedicato.",
    );
  }
  if (session.triggerRuntime && execution.hasZones !== true) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.TRIGGER_NOT_SUPPORTED,
      "Il trigger non appartiene a una zona supportata.",
    );
  }
  if (phase === "prepare") {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.PREPARED_NOT_SUPPORTED,
      "La risoluzione delle spell preparate resta separata.",
    );
  }
  if (phase === "resolve") {
    const parent = session?.activeConcentration;
    if (!text(parent?.instanceId)) {
      return reject(
        SPELL_UNIFIED_AREA_ERROR_CODES.PREPARED_INSTANCE_REQUIRED,
        "La risoluzione preparata richiede l'istanza parent ancora attiva.",
      );
    }
    if (parent?.spellId && text(parent.spellId) !== text(contract.spell?.id)) {
      return reject(
        SPELL_UNIFIED_AREA_ERROR_CODES.PREPARED_INSTANCE_STALE,
        "L'istanza parent non appartiene più a questo incantesimo.",
      );
    }
  }
  if (execution.childZone === true || action?.capabilities?.zone === true
    || action?.resolutionKind === "child-zone") {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.CHILD_ZONE_NOT_SUPPORTED,
      "Le child-zone restano nel workflow dedicato.",
    );
  }
  if (![SPELL_UNIFIED_TARGETING_MODES.DISCRETE, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC]
    .includes(text(targeting.mode))) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.TARGETING_NOT_SUPPORTED,
      "Questo workflow non espone un targeting area collegabile.",
    );
  }
  if (targeting.mode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC
    && placement.policy === SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.PLACEMENT_NOT_SUPPORTED,
      "Il targeting geometrico non dichiara un placement.",
    );
  }
  if (targeting.mode === SPELL_UNIFIED_TARGETING_MODES.DISCRETE
    && placement.policy !== SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE) {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.PLACEMENT_NOT_SUPPORTED,
      "Il placement non appartiene al targeting discreto.",
    );
  }
  if (boardTokenLifecycle && placement.mode !== "board-token") {
    return reject(
      SPELL_UNIFIED_AREA_ERROR_CODES.PLACEMENT_NOT_SUPPORTED,
      "Il cast della pedina non dichiara il placement board-token.",
    );
  }
  return { eligible: true, code: null, message: "" };
}

function hpInput(contract, session) {
  const inputs = contract?.presentation?.inputs || {};
  if (inputs.healing?.required === true) {
    return {
      mode: "heal",
      amount: session?.hpValues?.healing,
    };
  }
  if (inputs.damage?.required === true) {
    return {
      mode: "damage",
      amount: session?.hpValues?.damage,
    };
  }
  return undefined;
}

function placementFor(contract, session) {
  const descriptor = contract?.presentation?.placement || {};
  if (descriptor.policy === SPELL_PANEL_PLACEMENT_POLICIES.UNAVAILABLE) return null;
  return session?.placement && typeof session.placement === "object"
    ? session.placement
    : null;
}

export function buildSpellUnifiedAreaCommand({
  contract = null,
  session = {},
  source = {},
  spatialValidation = null,
  candidateTargetIds = [],
} = {}) {
  const trigger = session?.triggerRuntime && typeof session.triggerRuntime === "object"
    ? session.triggerRuntime
    : null;
  const placement = trigger
    ? {
      status: "confirmed",
      ruleId: text(trigger.ruleId),
      spellId: text(trigger.spellId || contract?.spell?.id),
      casterId: text(trigger.casterId || session?.casterId),
      ruleChoice: text(trigger.ruleChoice || session?.variant),
      preview: trigger.preview || trigger.previewSnapshot || null,
      targetIds: uniqueIds(trigger.targetIds),
      targetLocked: true,
      confirmed: true,
    }
    : placementFor(contract, session);
  const targetingMode = text(contract?.presentation?.targeting?.mode);
  const targetIds = uniqueIds(
    Array.isArray(session?.targetIds) && session.targetIds.length
      ? session.targetIds
      : trigger?.targetIds,
  );
  const sceneEpoch = source.sceneEpoch ?? null;
  const phase = text(session?.phase || contract?.presentation?.phase?.selected) || "cast";
  const preparedResolution = phase === "resolve";
  const sourceKind = trigger
    ? "zone-trigger"
    : preparedResolution
      ? "prepared-resolution"
      : "cast";
  const parentInstanceId = text(session?.activeConcentration?.instanceId);
  const locked = targetingMode === SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC
    ? placement?.targetLocked === true || placement?.confirmed === true
    : false;
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: contract?.spell?.id,
    phase,
    source: {
      kind: sourceKind,
      sceneEpoch,
      ...(parentInstanceId ? { parentInstanceId } : {}),
      ...(trigger?.activationId ? { activationId: trigger.activationId } : {}),
    },
    sourceKind,
    automation: preparedResolution
      ? {
        concentrationAction: text(contract?.presentation?.phase?.plan?.concentrationAction)
          || "dismiss",
      }
      : undefined,
    phaseResolution: preparedResolution
      ? contract?.presentation?.phase?.plan?.resolution
      : undefined,
    ...(trigger ? { zoneTrigger: trigger, triggerRuntime: trigger } : {}),
    ...(trigger?.activationId ? { activationId: trigger.activationId } : {}),
    ...(trigger?.instanceId ? { expectedZoneInstanceId: trigger.instanceId } : {}),
    casterId: text(session?.casterId),
    slotLevel: session?.slotLevel,
    choiceValue: text(session?.variant),
    activeActionId: "",
    targetIds,
    candidateTargetIds: uniqueIds(candidateTargetIds.length ? candidateTargetIds : targetIds),
    primaryTargetId: text(session?.primaryTargetId),
    targetContexts: session?.targetContext || {},
    outcomes: session?.outcomes || {},
    attackOutcome: session?.attackOutcome || "",
    targetLocked: locked,
    placement,
    hp: hpInput(contract, session),
    sceneEpoch,
    currentSceneEpoch: sceneEpoch,
    expectedSceneEpoch: sceneEpoch,
    spatialValidation: spatialValidation || undefined,
    validateSpatial: true,
  });
}

function uiSummary(command, result) {
  const targetCount = uniqueIds(command?.targeting?.targetIds).length;
  const changedIds = uniqueIds(result?.changedIds);
  const hpChanges = Array.isArray(result?.hpChanges) ? result.hpChanges : [];
  const effectChanges = Array.isArray(result?.effectChanges) ? result.effectChanges : [];
  return {
    targetCount,
    changedCount: changedIds.length,
    hpChangeCount: hpChanges.length,
    effectChangeCount: effectChanges.length,
  };
}

function persistentResult(contract, command, result = {}) {
  const execution = command?.execution || {};
  if (execution.hasZones !== true && execution.hasTokens !== true) return null;
  const placementRules = Array.isArray(contract?.presentation?.placement?.rules)
    ? contract.presentation.placement.rules
    : [];
  const ruleId = text(command?.placement?.ruleId);
  const rule = placementRules.find((candidate) => text(candidate?.ruleId) === ruleId)
    || placementRules[0]
    || null;
  const kind = execution.hasTokens === true
    ? "board-token"
    : text(rule?.kind) || "zone";
  const sceneItemChanges = Array.isArray(result.sceneItemChanges)
    ? result.sceneItemChanges
    : [];
  return {
    kind,
    policy: text(contract?.presentation?.placement?.policy) || null,
    ruleId: ruleId || text(rule?.ruleId) || null,
    instanceId: text(result.instanceId),
    sceneItemChanges,
    state: result.status === SPELL_UNIFIED_AREA_STATUS.APPLIED
      || result.status === SPELL_UNIFIED_AREA_STATUS.NOOP
      ? "committed"
      : "not-committed",
  };
}

function normalizeExecutionResult(contract, command, result = {}) {
  const normalized = resultBase({
    status: text(result.status) || SPELL_UNIFIED_AREA_STATUS.FAILED,
    command,
    changedIds: result.changedIds,
    historyEntryId: result.historyEntryId,
    undoAvailable: result.undoAvailable,
    warnings: result.warnings,
    errors: result.errors,
    instanceId: result.instanceId,
  });
  return {
    ...normalized,
    hpChanges: Array.isArray(result.hpChanges) ? result.hpChanges : [],
    effectChanges: Array.isArray(result.effectChanges) ? result.effectChanges : [],
    sceneItemChanges: Array.isArray(result.sceneItemChanges) ? result.sceneItemChanges : [],
    triggerChanges: Array.isArray(result.triggerChanges) ? result.triggerChanges : [],
    visualEvents: Array.isArray(result.visualEvents) ? result.visualEvents : [],
    summary: uiSummary(command, result),
    persistent: persistentResult(contract, command, result),
    command,
  };
}

export async function executeSpellUnifiedArea({
  contract = null,
  session = {},
  source = {},
  runtime = {},
  candidateTargetIds = [],
} = {}) {
  const eligibility = getSpellUnifiedAreaEligibility(contract, session);
  if (!eligibility.eligible) {
    return {
      ...resultBase({}),
      status: SPELL_UNIFIED_AREA_STATUS.REJECTED,
      errors: [{ code: eligibility.code, message: eligibility.message }],
      eligibility,
    };
  }

  let spatialValidation = null;
  if (typeof runtime.getSpatialValidation === "function") {
    try {
      spatialValidation = await runtime.getSpatialValidation({
        contract,
        session,
        source,
        candidateTargetIds,
      });
    } catch (error) {
      return {
        ...resultBase({}),
        status: SPELL_UNIFIED_AREA_STATUS.REJECTED,
        errors: [normalizedError(
          error,
          SPELL_UNIFIED_AREA_ERROR_CODES.SPATIAL_VALIDATION_FAILED,
        )],
        eligibility,
      };
    }
  }

  const command = buildSpellUnifiedAreaCommand({
    contract,
    session,
    source: {
      ...source,
      sceneEpoch: source.sceneEpoch ?? runtime.sceneEpoch ?? null,
    },
    spatialValidation,
    candidateTargetIds,
  });
  if (command.valid !== true) {
    return {
      ...resultBase({ command, errors: command.errors }),
      status: SPELL_UNIFIED_AREA_STATUS.REJECTED,
      eligibility,
      command,
    };
  }

  const executor = typeof runtime.executor === "function"
    ? runtime.executor
    : (await import("./spellAreaResolutionExecutor.js")).executeSpellAreaResolution;
  const executorRuntime = { ...runtime };
  delete executorRuntime.executor;
  delete executorRuntime.getSpatialValidation;
  try {
    const result = await executor(command, executorRuntime);
    return {
      ...normalizeExecutionResult(contract, command, result),
      eligibility,
    };
  } catch (error) {
    return {
      ...resultBase({
        command,
        errors: [normalizedError(error)],
      }),
      status: SPELL_UNIFIED_AREA_STATUS.FAILED,
      eligibility,
      command,
    };
  }
}

export async function undoSpellUnifiedArea({ session = {}, runtime = {} } = {}) {
  const undoState = session?.undoState || {};
  const historyEntryId = text(undoState.activationId || session?.commitState?.activationId);
  if (undoState.available !== true || !historyEntryId) {
    return {
      ...resultBase({}),
      status: SPELL_UNIFIED_AREA_STATUS.REJECTED,
      errors: [{
        code: SPELL_UNIFIED_AREA_ERROR_CODES.UNDO_UNAVAILABLE,
        message: "L'ultima applicazione non è più disponibile per Undo.",
      }],
    };
  }
  const undoHistory = typeof runtime.undoHistoryEntry === "function"
    ? runtime.undoHistoryEntry
    : runtime.undoHistoryThrough;
  if (typeof undoHistory !== "function") {
    return {
      ...resultBase({}),
      status: SPELL_UNIFIED_AREA_STATUS.REJECTED,
      errors: [{
        code: SPELL_UNIFIED_AREA_ERROR_CODES.UNDO_API_UNAVAILABLE,
        message: "L'API condivisa di Undo non è disponibile.",
      }],
    };
  }
  try {
    const entries = await undoHistory(historyEntryId);
    const restoredIds = Array.from(new Set(
      (Array.isArray(entries) ? entries : []).flatMap((entry) => (
        Array.isArray(entry?.changes) ? entry.changes : []
      )).map((change) => text(change?.id)).filter(Boolean),
    ));
    const status = entries?.status || entries?.result?.status || "applied";
    if (status !== "applied" || !entries?.length) {
      return {
        ...resultBase({
          changedIds: restoredIds,
          historyEntryId,
          errors: [{
            code: SPELL_UNIFIED_AREA_ERROR_CODES.UNDO_FAILED,
            message: "Undo non ha ripristinato l'ultima applicazione.",
          }],
        }),
        status: SPELL_UNIFIED_AREA_STATUS.FAILED,
      };
    }
    return {
      ...resultBase({
        status: SPELL_UNIFIED_AREA_STATUS.UNDONE,
        changedIds: restoredIds,
        historyEntryId,
      }),
      status: SPELL_UNIFIED_AREA_STATUS.UNDONE,
      undoAvailable: false,
    };
  } catch (error) {
    return {
      ...resultBase({
        errors: [normalizedError(error, SPELL_UNIFIED_AREA_ERROR_CODES.UNDO_FAILED)],
        historyEntryId,
      }),
      status: SPELL_UNIFIED_AREA_STATUS.FAILED,
    };
  }
}
