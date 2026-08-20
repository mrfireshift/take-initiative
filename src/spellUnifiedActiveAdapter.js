import { getSpellDefinition } from "./spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "./spellUnifiedPanelCore.js";
import {
  buildPreparedSpellResolutionRequest,
  preparedSpellResolutionChoices,
  preparedSpellResolutionPopoverId,
} from "./preparedSpellResolutionCore.js";
import {
  buildSpellActiveResolutionPayload,
  spellActiveResolutionPopoverId,
} from "./spellActiveResolutionCore.js";
import { spellActiveActionPresentation } from "./spellActiveActionCore.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";

export const SPELL_UNIFIED_ACTIVE_STATUS = Object.freeze({
  POPUP_OPENED: "popup-opened",
  EXECUTED: "executed",
  REJECTED: "rejected",
  FAILED: "failed",
});

export const SPELL_UNIFIED_ACTIVE_ERROR_CODES = Object.freeze({
  CONTEXT_REQUIRED: "active-context-required",
  SPELL_REQUIRED: "active-spell-required",
  ACTION_REQUIRED: "active-action-required",
  ACTION_NOT_AVAILABLE: "active-action-not-available",
  ACTION_NOT_DECLARED: "active-action-not-declared",
  INSTANCE_REQUIRED: "active-instance-required",
  CASTER_REQUIRED: "active-caster-required",
  SCENE_EPOCH_REQUIRED: "active-scene-epoch-required",
  SCENE_EPOCH_STALE: "active-scene-epoch-stale",
  REVISION_STALE: "active-revision-stale",
  ZONE_ROOT_REQUIRED: "active-zone-root-required",
  TARGETS_INVALID: "active-targets-invalid",
  POPUP_UNAVAILABLE: "active-popup-unavailable",
  EXECUTOR_UNAVAILABLE: "active-executor-unavailable",
  EXECUTOR_FAILED: "active-executor-failed",
});

export const SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS = Object.freeze([
  "phb2014-raffica-di-spine",
  "phb2014-freccia-folgorante",
]);

const PREPARED_AREA_SPELL_IDS = new Set(SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS);

function text(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function integerOrNull(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

const ACTIVE_POPUP_RESOLUTION_KINDS = new Set([
  "save-area",
  "single-attack",
  "single-save",
  "child-zone",
]);

function normalizedError(error, fallbackCode = SPELL_UNIFIED_ACTIVE_ERROR_CODES.EXECUTOR_FAILED) {
  return {
    code: text(error?.code || error?.reason || error?.name) || fallbackCode,
    message: text(error?.message || error?.reason) || "Operazione non riuscita.",
  };
}

function actionDefinition(action) {
  if (action?.definition && typeof action.definition === "object") {
    return clone(action.definition);
  }
  if (action?.action && typeof action.action === "object") {
    return clone(action.action);
  }
  return clone(action);
}

function actionId(action) {
  return text(action?.id || action?.actionId);
}

function actionType(action) {
  return text(action?.type)
    || (action?.resolutionKind ? "manual" : "manual");
}

function contextFromOverview(overview = {}) {
  const source = overview?.context && typeof overview.context === "object"
    ? overview.context
    : overview;
  const targetIds = uniqueIds(source?.targetIds);
  const targetNames = Array.isArray(source?.targetNames)
    ? source.targetNames.map(text)
    : [];
  const targets = new Map(targetIds.map((id, index) => [id, targetNames[index] || id]));
  const persistent = overview?.persistent && typeof overview.persistent === "object"
    ? overview.persistent
    : {};
  const zoneItemId = text(
    source?.zoneItemId
      || overview?.zoneItemId
      || persistent.itemId,
  );
  const instanceId = text(source?.instanceId || overview?.instanceId);
  const casterId = text(source?.casterId || overview?.casterId);
  const spellId = text(source?.spellId || overview?.spellId || persistent.spellId);
  return {
    spellId,
    instanceId,
    casterId,
    casterName: text(source?.casterName || overview?.casterName),
    name: text(source?.name || overview?.name),
    storedName: text(source?.storedName || overview?.name),
    castContext: source?.castContext && typeof source.castContext === "object"
      ? clone(source.castContext)
      : {},
    appliedAt: source?.appliedAt && typeof source.appliedAt === "object"
      ? clone(source.appliedAt)
      : null,
    targetIds,
    targetNames,
    targets,
    turns: Array.isArray(source?.turns) ? [...source.turns] : [],
    counters: Array.isArray(source?.counters) ? [...source.counters] : [],
    effectInstances: Array.isArray(source?.effectInstances)
      ? clone(source.effectInstances)
      : [],
    zoneItemId,
    parentZoneId: text(source?.parentZoneId || zoneItemId),
    rootZoneId: text(source?.rootZoneId || zoneItemId),
    targetContext: source?.targetContext && typeof source.targetContext === "object"
      ? clone(source.targetContext)
      : {},
    geometry: source?.geometry && typeof source.geometry === "object"
      ? clone(source.geometry)
      : null,
    position: source?.position && typeof source.position === "object"
      ? clone(source.position)
      : null,
    concentration: source?.concentration,
    uses: source?.uses && typeof source.uses === "object" ? clone(source.uses) : null,
    turn: source?.turn && typeof source.turn === "object" ? clone(source.turn) : null,
    round: source?.round && typeof source.round === "object" ? clone(source.round) : null,
    sceneEpoch: integerOrNull(source?.sceneEpoch),
    revision: integerOrNull(source?.revision),
    turnKey: text(source?.turnKey || source?.appliedAt?.turnKey),
  };
}

function findDeclaredAction(overview, requestedAction, actionIdValue) {
  const requestedId = text(actionIdValue || actionId(requestedAction));
  const actions = Array.isArray(overview?.actions) ? overview.actions : [];
  const declared = actions.find((candidate) => actionId(candidate) === requestedId);
  if (declared) return declared;
  if (requestedAction && actionId(requestedAction) === requestedId) return requestedAction;
  return null;
}

export function normalizeSpellUnifiedActiveContext(overview = {}) {
  return contextFromOverview(overview);
}

export function normalizeSpellUnifiedActiveAction(action = null) {
  const definition = actionDefinition(action);
  return {
    id: actionId(action),
    type: actionType(action),
    label: text(action?.label || definition?.label || action?.id),
    buttonLabel: text(action?.buttonLabel || definition?.buttonLabel || action?.label || action?.id),
    detail: text(action?.detail || definition?.detail),
    resolutionKind: text(action?.resolutionKind || definition?.resolutionKind),
    subjectMode: text(action?.subjectMode || definition?.subjectMode) || "none",
    requiresTargets: action?.requiresTargets === true || definition?.requiresTargets === true,
    maxTargets: Number.isInteger(Number(action?.maxTargets ?? definition?.maxTargets))
      ? Math.max(0, Number(action?.maxTargets ?? definition?.maxTargets))
      : 0,
    available: action?.available !== false && action?.disabled !== true,
    disabledReason: text(action?.disabledReason || action?.unavailableReason),
    definition,
  };
}

export function spellUnifiedActiveActionPresentation({
  action = null,
  selectedTargetIds = [],
  choiceValue = "",
} = {}) {
  const normalized = normalizeSpellUnifiedActiveAction(action);
  const presentation = spellActiveActionPresentation(
    {
      ...normalized.definition,
      ...normalized,
      choiceValue,
      unavailableReason: normalized.disabledReason,
    },
    selectedTargetIds,
    choiceValue,
  );
  return {
    ...presentation,
    disabled: !normalized.available || presentation.disabled,
    title: normalized.disabledReason || presentation.title,
    available: normalized.available,
    reason: normalized.disabledReason,
  };
}

export function validateSpellUnifiedActiveContext({
  overview = null,
  action = null,
  actionId: requestedActionId = "",
  sceneEpoch = null,
  currentSceneEpoch = null,
  currentRevision = null,
  revision = null,
  selectedTargetIds = [],
  choiceValue = "",
} = {}) {
  const context = contextFromOverview(overview || {});
  const declared = findDeclaredAction(overview, action, requestedActionId);
  const normalized = normalizeSpellUnifiedActiveAction(declared || action);
  const errors = [];
  if (!context.spellId) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.SPELL_REQUIRED,
    message: "L'incantesimo attivo non è più disponibile.",
  });
  if (!normalized.id) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.ACTION_REQUIRED,
    message: "Seleziona un'azione attiva.",
  });
  if (requestedActionId && normalized.id !== text(requestedActionId)) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.ACTION_NOT_DECLARED,
    message: "L'azione attiva non appartiene a questa istanza.",
  });
  if (Array.isArray(overview?.actions) && !declared) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.ACTION_NOT_DECLARED,
    message: "L'azione attiva non è più disponibile.",
  });
  if (!context.instanceId) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.INSTANCE_REQUIRED,
    message: "L'istanza dell'incantesimo non è più disponibile.",
  });
  if (!context.casterId) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.CASTER_REQUIRED,
    message: "Il caster dell'istanza non è più disponibile.",
  });
  const epoch = integerOrNull(sceneEpoch ?? context.sceneEpoch);
  if (epoch === null || epoch < 0) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.SCENE_EPOCH_REQUIRED,
    message: "La scena non è pronta per la risoluzione.",
  });
  const currentEpoch = integerOrNull(currentSceneEpoch);
  if (currentEpoch !== null && epoch !== null && currentEpoch !== epoch) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.SCENE_EPOCH_STALE,
    message: "La scena è cambiata: ripeti la risoluzione.",
  });
  const expectedRevision = integerOrNull(currentRevision);
  const requestedRevision = integerOrNull(revision ?? context.revision);
  if (
    expectedRevision !== null
    && requestedRevision !== null
    && expectedRevision !== requestedRevision
  ) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.REVISION_STALE,
    message: "L'istanza dell'incantesimo è cambiata: ripeti la risoluzione.",
  });
  if (normalized.available === false) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.ACTION_NOT_AVAILABLE,
    message: normalized.disabledReason || "L'azione attiva non è disponibile.",
  });
  if (normalized.definition?.requiresParentInstance === true && !context.instanceId) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.INSTANCE_REQUIRED,
    message: "L'azione richiede l'istanza parent.",
  });
  if (
    (normalized.definition?.requiresZoneRoot === true
      || normalized.resolutionKind === "child-zone"
      || (normalized.resolutionKind === "single-attack"
        && normalized.definition?.requiresZoneRoot !== false))
    && !context.zoneItemId
  ) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.ZONE_ROOT_REQUIRED,
    message: "La zona root non è più disponibile.",
  });

  const presentation = spellUnifiedActiveActionPresentation({
    action: declared || action,
    selectedTargetIds,
    choiceValue,
  });
  const usesPanelTargets = normalized.type === "manual"
    && normalized.resolutionKind === ""
    && normalized.subjectMode !== "caster"
    && normalized.subjectMode !== "none";
  if (usesPanelTargets && presentation.disabled) errors.push({
    code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.TARGETS_INVALID,
    message: presentation.title || "La selezione dei bersagli non è valida.",
  });

  return {
    valid: errors.length === 0,
    errors,
    context,
    action: declared || action,
    normalizedAction: normalized,
    presentation,
    sceneEpoch: epoch,
  };
}

function groupFromContext(context) {
  return {
    instanceId: context.instanceId,
    spellId: context.spellId,
    casterId: context.casterId,
    casterName: context.casterName,
    name: context.name,
    storedName: context.storedName || context.name,
    castContext: clone(context.castContext || {}),
    appliedAt: clone(context.appliedAt),
    targets: context.targets instanceof Map
      ? new Map(context.targets)
      : new Map(),
    turns: [...(context.turns || [])],
    counters: [...(context.counters || [])],
    effectInstances: clone(context.effectInstances || []),
    zoneItemId: context.zoneItemId,
  };
}

export function buildSpellUnifiedActiveResolutionPayload({
  overview = null,
  action = null,
  actionId = "",
  sceneEpoch = null,
  currentSceneEpoch = null,
  currentRevision = null,
  turnKey = "",
  revision = null,
} = {}) {
  const validation = validateSpellUnifiedActiveContext({
    overview,
    action,
    actionId,
    sceneEpoch,
    currentSceneEpoch,
    currentRevision,
    revision,
  });
  if (!validation.valid) {
    return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation,
      errors: validation.errors,
      payload: null,
    };
  }
  const payload = buildSpellActiveResolutionPayload({
    spell: getSpellDefinition(validation.context.spellId),
    action: actionDefinition(validation.action),
    group: groupFromContext(validation.context),
    sceneEpoch: validation.sceneEpoch,
    zoneItemId: validation.context.zoneItemId,
    turnKey: text(turnKey || validation.context.turnKey),
  });
  const withRevision = integerOrNull(revision ?? validation.context.revision);
  const context = validation.context;
  const extraPayload = {
    ...(withRevision === null ? {} : { revision: withRevision }),
    ...(context.parentZoneId ? { parentZoneId: context.parentZoneId } : {}),
    ...(context.rootZoneId ? { rootZoneId: context.rootZoneId } : {}),
    ...(Object.keys(context.targetContext || {}).length
      ? { targetContext: clone(context.targetContext) }
      : {}),
    ...(context.geometry ? { geometry: clone(context.geometry) } : {}),
    ...(context.position ? { position: clone(context.position) } : {}),
    ...(context.concentration !== undefined ? { concentration: context.concentration } : {}),
    ...(context.uses ? { uses: clone(context.uses) } : {}),
    ...(context.turn ? { turn: clone(context.turn) } : {}),
    ...(context.round ? { round: clone(context.round) } : {}),
  };
  return {
    status: "payload-ready",
    validation,
    errors: [],
    payload: Object.freeze({ ...payload, ...extraPayload }),
  };
}

export function buildSpellUnifiedPreparedResolutionRequest({
  overview = null,
  action = null,
  targetIds = [],
  choiceValue = "",
  sceneEpoch = null,
  currentSceneEpoch = null,
  currentRevision = null,
  revision = null,
} = {}) {
  const validation = validateSpellUnifiedActiveContext({
    overview,
    action,
    actionId: actionId(action),
    sceneEpoch,
    currentSceneEpoch,
    currentRevision,
    revision,
    selectedTargetIds: targetIds,
    choiceValue,
  });
  if (!validation.valid) {
    return { status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED, validation, request: null };
  }
  if (validation.normalizedAction.type !== "resolve") {
    return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation: {
        ...validation,
        valid: false,
        errors: [{
          code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.ACTION_NOT_DECLARED,
          message: "L'azione selezionata non è una risoluzione preparata.",
        }],
      },
      request: null,
    };
  }
  try {
    const request = buildPreparedSpellResolutionRequest({
      group: groupFromContext(validation.context),
      targetIds: uniqueIds(targetIds),
      selectedChoice: choiceValue,
    });
    const contract = buildSpellUnifiedPanelContract({
      spellId: validation.context.spellId,
      phase: "resolve",
      choiceValue: request.selectedChoice,
      castContext: request.castContext,
    });
    const session = createSpellPanelSession({
      contract,
      spellId: validation.context.spellId,
      phase: "resolve",
      casterId: request.casterId,
      slotLevel: request.castContext?.slotLevel,
      variant: request.selectedChoice,
      durationTurns: request.turns,
      applyAutomatedConditions: request.applyAutomatedConditions,
      activeConcentration: request.activeConcentration,
      targetIds: request.targetIds,
      castContext: request.castContext,
    });
    const unifiedPanelRoute = {
      destination: "spell-unified-panel",
      intent: "spell-cast",
      origin: "prepared-resolution",
      sourceId: request.casterId,
      casterId: request.casterId,
      spellId: validation.context.spellId,
      phase: "resolve",
      slotLevel: request.castContext?.slotLevel ?? null,
      durationTurns: request.turns,
      applyAutomatedConditions: request.applyAutomatedConditions,
      targetIds: request.targetIds,
      parentInstanceId: request.activeConcentration.instanceId,
      variant: request.selectedChoice,
    };
    return {
      status: "request-ready",
      validation,
      request: {
        ...request,
        contract,
        session,
        unifiedPanelRoute,
        usesUnifiedAreaExecutor: PREPARED_AREA_SPELL_IDS.has(validation.context.spellId),
      },
    };
  } catch (error) {
    return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation: {
        ...validation,
        valid: false,
        errors: [normalizedError(error, "prepared-spell-stale")],
      },
      request: null,
    };
  }
}

export function buildSpellUnifiedActivePopoverRequest(payload, {
  width = 360,
  height = null,
  urlBase = "/spell-active-resolution.html",
} = {}) {
  const resolutionKind = text(payload?.action?.resolutionKind);
  const resolvedHeight = height ?? (payload?.spellId === "xanathar-debilitazione"
    ? 245
    : resolutionKind === "single-attack"
      ? 320
      : resolutionKind === "single-save"
        ? 350
        : resolutionKind === "child-zone"
          ? 600
          : 520);
  const popoverId = spellActiveResolutionPopoverId(payload?.instanceId, payload?.actionId);
  return {
    id: popoverId,
    url: `${urlBase}?payload=${encodeURIComponent(JSON.stringify(payload))}`,
    width,
    height: resolvedHeight,
    payload,
  };
}

export function buildSpellUnifiedPreparedPopoverRequest(overview, {
  width = 250,
  height = null,
  urlBase = "/prepared-spell-resolution.html",
} = {}) {
  const context = contextFromOverview(overview);
  const choices = preparedSpellResolutionChoices(groupFromContext(context));
  const resolvedHeight = height ?? (choices.length > 1 ? 150 : 116);
  const popoverId = preparedSpellResolutionPopoverId(context.instanceId);
  return {
    id: popoverId,
    url: `${urlBase}?instance=${encodeURIComponent(context.instanceId)}`,
    width,
    height: resolvedHeight,
    instanceId: context.instanceId,
  };
}

async function importedExecutor(name) {
  const module = await import("./spellApplicationExecutor.js");
  return module[name];
}

export async function executeSpellUnifiedActiveAction({
  overview = null,
  action = null,
  actionId = "",
  selectedTargetIds = [],
  choiceValue = "",
  sceneEpoch = null,
  currentSceneEpoch = null,
  currentRevision = null,
  turnKey = "",
  revision = null,
  runtime = {},
} = {}) {
  const validation = validateSpellUnifiedActiveContext({
    overview,
    action,
    actionId,
    sceneEpoch,
    currentSceneEpoch,
    currentRevision,
    revision,
    selectedTargetIds,
    choiceValue,
  });
  if (!validation.valid) {
    return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation,
      errors: validation.errors,
      changedIds: [],
    };
  }

  const context = validation.context;
  const normalized = validation.normalizedAction;
  const group = groupFromContext(context);
  if (["zone-movement", "zone-direction"].includes(normalized.resolutionKind)) {
    const directionAction = normalized.resolutionKind === "zone-direction";
    const movementExecutor = runtime[directionAction ? "zoneDirectionExecutor" : "zoneMovementExecutor"]
      || await importedExecutor(
        directionAction ? "executeSpellZoneDirection" : "executeSpellZoneMovement",
      );
    if (typeof movementExecutor !== "function") return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation,
      errors: [{
        code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.EXECUTOR_UNAVAILABLE,
        message: directionAction
          ? "L'executor della direzione zona non è disponibile."
          : "L'executor del movimento zona non è disponibile.",
      }],
      changedIds: [],
    };
    try {
      const sceneContext = typeof runtime.getSceneContext === "function"
        ? await runtime.getSceneContext()
        : null;
      if (typeof runtime.isCurrent === "function"
        && runtime.sceneEpoch != null
        && !runtime.isCurrent(runtime.sceneEpoch)) {
        return {
          status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
          validation,
          errors: [{ code: "scene-epoch-stale", message: "La scena è cambiata prima del movimento." }],
          changedIds: [],
        };
      }
      const result = await movementExecutor({
        group,
        action: {
          ...validation.action,
          ruleId: validation.action.ruleId || validation.action.placementRuleId,
          zoneItemId: context.zoneItemId,
          instanceId: context.instanceId,
        },
        casterName: context.casterName,
        movementChoice: choiceValue,
        sceneEpoch: runtime.sceneEpoch ?? validation.sceneEpoch,
        sceneIdentity: sceneContext?.sceneIdentity || runtime.sceneIdentity || null,
        commandId: sceneContext?.commandId || runtime.commandId || "",
        isCurrent: runtime.isCurrent,
      });
      if (typeof runtime.isCurrent === "function"
        && runtime.sceneEpoch != null
        && !runtime.isCurrent(runtime.sceneEpoch)) {
        return {
          status: SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED,
          validation,
          result,
          changedIds: uniqueIds(Array.isArray(result) ? result : result?.changedIds),
          stale: true,
          postCommitPending: true,
        };
      }
      const history = spellExecutionHistoryDetails(result);
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED,
        validation,
        result,
        changedIds: uniqueIds(Array.isArray(result) ? result : result?.changedIds),
        ...history,
      };
    } catch (error) {
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.FAILED,
        validation,
        errors: [normalizedError(error)],
        changedIds: [],
      };
    }
  }

  if (
    ACTIVE_POPUP_RESOLUTION_KINDS.has(normalized.resolutionKind)
    && !(typeof runtime.activeExecutor === "function"
      && typeof runtime.openActiveResolution !== "function")
  ) {
    const built = buildSpellUnifiedActiveResolutionPayload({
      overview,
      action: validation.action,
      actionId: normalized.id,
      sceneEpoch: validation.sceneEpoch,
      currentSceneEpoch,
      currentRevision,
      turnKey,
      revision,
    });
    if (!built.payload) return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation: built.validation,
      errors: built.errors,
      changedIds: [],
    };
    if (typeof runtime.openActiveResolution !== "function") return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation,
      errors: [{
        code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.POPUP_UNAVAILABLE,
        message: "Il popup di risoluzione attiva non è disponibile.",
      }],
      changedIds: [],
    };
    try {
      await runtime.openActiveResolution(built.payload);
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.POPUP_OPENED,
        validation,
        payload: built.payload,
        changedIds: [],
      };
    } catch (error) {
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.FAILED,
        validation,
        errors: [normalizedError(error, SPELL_UNIFIED_ACTIVE_ERROR_CODES.POPUP_UNAVAILABLE)],
        changedIds: [],
      };
    }
  }

  if (normalized.type === "resolve") {
    const built = buildSpellUnifiedPreparedResolutionRequest({
      overview,
      action: validation.action,
      targetIds: selectedTargetIds,
      choiceValue,
      sceneEpoch: validation.sceneEpoch,
    });
    if (!built.request) return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation: built.validation,
      errors: built.validation.errors,
      changedIds: [],
    };
    if (typeof runtime.openPreparedResolution === "function") {
      try {
        await runtime.openPreparedResolution(overview);
        return {
          status: SPELL_UNIFIED_ACTIVE_STATUS.POPUP_OPENED,
          validation,
          request: built.request,
          changedIds: [],
        };
      } catch (error) {
        return {
          status: SPELL_UNIFIED_ACTIVE_STATUS.FAILED,
          validation,
          errors: [normalizedError(error, SPELL_UNIFIED_ACTIVE_ERROR_CODES.POPUP_UNAVAILABLE)],
          changedIds: [],
        };
      }
    }
    const preparedExecutor = runtime.preparedExecutor
      || await importedExecutor("executeSpellApplication");
    if (typeof preparedExecutor !== "function") return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
      validation,
      errors: [{
        code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.EXECUTOR_UNAVAILABLE,
        message: "L'executor della risoluzione preparata non è disponibile.",
      }],
      changedIds: [],
    };
    try {
      const sceneContext = typeof runtime.getSceneContext === "function"
        ? await runtime.getSceneContext()
        : null;
      if (typeof runtime.isCurrent === "function"
        && runtime.sceneEpoch != null
        && !runtime.isCurrent(runtime.sceneEpoch)) {
        return {
          status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
          validation,
          errors: [{ code: "scene-epoch-stale", message: "La scena è cambiata prima della risoluzione." }],
          changedIds: [],
        };
      }
      const result = await preparedExecutor({
        ...built.request,
        casterName: context.casterName,
        sceneEpoch: runtime.sceneEpoch ?? validation.sceneEpoch,
        sceneIdentity: sceneContext?.sceneIdentity || runtime.sceneIdentity || null,
        commandId: sceneContext?.commandId || runtime.commandId || "",
        isCurrent: runtime.isCurrent,
      });
      if (typeof runtime.isCurrent === "function"
        && runtime.sceneEpoch != null
        && !runtime.isCurrent(runtime.sceneEpoch)) {
        return {
          status: SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED,
          validation,
          request: built.request,
          result,
          changedIds: uniqueIds(Array.isArray(result) ? result : result?.changedIds),
          stale: true,
          postCommitPending: true,
        };
      }
      const history = spellExecutionHistoryDetails(result);
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED,
        validation,
        request: built.request,
        result,
        changedIds: uniqueIds(Array.isArray(result) ? result : result?.changedIds),
        ...history,
      };
    } catch (error) {
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.FAILED,
        validation,
        errors: [normalizedError(error)],
        changedIds: [],
      };
    }
  }

  const activeExecutor = runtime.activeExecutor
    || await importedExecutor("executeSpellActiveAction");
  if (typeof activeExecutor !== "function") return {
    status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
    validation,
    errors: [{
      code: SPELL_UNIFIED_ACTIVE_ERROR_CODES.EXECUTOR_UNAVAILABLE,
      message: "L'executor dell'azione attiva non è disponibile.",
    }],
    changedIds: [],
  };
  const spell = getSpellDefinition(context.spellId);
  try {
    const sceneContext = typeof runtime.getSceneContext === "function"
      ? await runtime.getSceneContext()
      : null;
    if (typeof runtime.isCurrent === "function"
      && runtime.sceneEpoch != null
      && !runtime.isCurrent(runtime.sceneEpoch)) {
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.REJECTED,
        validation,
        errors: [{ code: "scene-epoch-stale", message: "La scena è cambiata prima dell'azione." }],
        changedIds: [],
      };
    }
    const result = await activeExecutor({
      spell,
      actionId: normalized.id,
      group,
      selectedTargetIds: uniqueIds(selectedTargetIds),
      appliedAt: context.appliedAt,
      casterName: context.casterName,
      sceneEpoch: runtime.sceneEpoch ?? validation.sceneEpoch,
      sceneIdentity: sceneContext?.sceneIdentity || runtime.sceneIdentity || null,
      commandId: sceneContext?.commandId || runtime.commandId || "",
      isCurrent: runtime.isCurrent,
    });
    if (typeof runtime.isCurrent === "function"
      && runtime.sceneEpoch != null
      && !runtime.isCurrent(runtime.sceneEpoch)) {
      return {
        status: SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED,
        validation,
        result,
        changedIds: uniqueIds(result?.changedIds || result),
        stale: true,
        postCommitPending: true,
      };
    }
    const history = spellExecutionHistoryDetails(result);
    return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED,
      validation,
      result,
      changedIds: uniqueIds(result?.changedIds || result),
      ...history,
    };
  } catch (error) {
    return {
      status: SPELL_UNIFIED_ACTIVE_STATUS.FAILED,
      validation,
      errors: [normalizedError(error)],
      changedIds: [],
    };
  }
}
