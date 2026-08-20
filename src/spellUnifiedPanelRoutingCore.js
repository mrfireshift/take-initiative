import {
  buildSpellUnifiedPanelContract,
  SPELL_PANEL_PLACEMENT_POLICIES,
  SPELL_UNIFIED_PANEL_LANES,
} from "./spellUnifiedPanelCore.js";

export const SPELL_UNIFIED_PANEL_DESTINATION = "spell-unified-panel";

export const SPELL_UNIFIED_PANEL_ROUTE_STATUS = Object.freeze({
  READY: "ready",
  CATALOG: "catalog",
  UNSUPPORTED: "unsupported",
});

function text(value) {
  return String(value ?? "").trim();
}

function integerOrNull(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function booleanOrDefault(value, fallback = true) {
  if (value === undefined || value === null || text(value) === "") return fallback;
  if (value === true || value === false) return value;
  const normalized = text(value).toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
  );
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function routePayloadFromRequest(request = {}) {
  return request?.route && typeof request.route === "object"
    ? request.route
    : parseJson(request?.route, {});
}

export function normalizeSpellUnifiedPanelOpenRequest(request = {}) {
  const payload = routePayloadFromRequest(request) || {};
  const targetSource = request.targetIds
    ?? payload.targetIds
    ?? request.targetIdsCsv
    ?? payload.targetIdsCsv
    ?? [];
  const targetIds = uniqueIds(
    Array.isArray(targetSource) ? targetSource : text(targetSource).split(","),
  );
  const zoneTriggerSource = request.zoneTrigger
    || payload.zoneTrigger
    || request.zoneTriggerPayload;
  const placementSource = request.placement
    || payload.placement
    || request.placementPayload;
  const zoneTrigger = typeof zoneTriggerSource === "string"
    ? parseJson(zoneTriggerSource, null)
    : zoneTriggerSource;
  const placement = typeof placementSource === "string"
    ? parseJson(placementSource, null)
    : placementSource;
  const targetContextSource = request.targetContext
    || payload.targetContext
    || request.targetContextPayload;
  const targetContext = typeof targetContextSource === "string"
    ? parseJson(targetContextSource, {})
    : targetContextSource;
  const quickActionId = text(
    request.quickActionId || payload.quickActionId || request.quickAction,
  );
  return {
    intent: text(request.intent || payload.intent) || "spell",
    sourceId: text(request.sourceId || payload.sourceId || request.source),
    spellId: text(request.spellId || payload.spellId),
    phase: text(request.phase || payload.phase),
    actionId: text(request.actionId || payload.actionId),
    activeInstanceId: text(request.activeInstanceId || payload.activeInstanceId),
    activeActionId: text(request.activeActionId || payload.activeActionId),
    quickActionId,
    casterId: text(request.casterId || payload.casterId || request.sourceId || payload.sourceId),
    slotLevel: integerOrNull(request.slotLevel ?? payload.slotLevel),
    variant: text(request.variant || payload.variant || request.choiceValue || payload.choiceValue),
    durationTurns: integerOrNull(request.durationTurns ?? payload.durationTurns),
    applyAutomatedConditions: booleanOrDefault(request.applyAutomatedConditions
      ?? payload.applyAutomatedConditions
      ?? request.applyAutomations
      ?? payload.applyAutomations),
    targetIds,
    targetContext: clone(targetContext || {}),
    placement: clone(placement),
    sceneEpoch: integerOrNull(request.sceneEpoch ?? payload.sceneEpoch),
    revision: integerOrNull(request.revision ?? payload.revision),
    activationId: text(request.activationId || payload.activationId),
    zoneRoot: text(request.zoneRoot || payload.zoneRoot),
    parentInstanceId: text(request.parentInstanceId || payload.parentInstanceId),
    zoneTrigger: clone(zoneTrigger),
    origin: text(request.origin || payload.origin)
      || (quickActionId ? "quick-action" : "legacy-entry-point"),
  };
}

export function spellUnifiedPanelShouldAutoStartPlacement(route = {}) {
  const placementState = text(
    route?.session?.placement?.state
      || route?.session?.placement?.status,
  );
  return text(route?.status) === SPELL_UNIFIED_PANEL_ROUTE_STATUS.READY
    && text(route?.origin) === "quick-action"
    && !!text(route?.quickActionId)
    && text(route?.contract?.presentation?.placement?.policy)
      === SPELL_PANEL_PLACEMENT_POLICIES.REQUIRED
    && !["pending", "confirmed"].includes(placementState);
}

function laneForContract(contract, request) {
  if (request.actionId || request.activeActionId || request.activeInstanceId) {
    return SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION;
  }
  return text(contract?.execution?.lane) || null;
}

function adapterForLane(lane, contract = null) {
  if (lane === SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION) {
    return "spellUnifiedActiveAdapter";
  }
  if (lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION) {
    return "spellUnifiedAreaAdapter";
  }
  if (lane === SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE) {
    const execution = contract?.execution || {};
    if (execution.hasZones === true || execution.hasTokens === true) {
      return "spellUnifiedAreaAdapter";
    }
    return "spellUnifiedLifecycleAdapter";
  }
  return null;
}

function executorForLane(lane, contract = null) {
  if (lane === SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION) {
    return "executeSpellUnifiedActiveAction";
  }
  if (lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION) {
    return "executeSpellUnifiedArea";
  }
  if (lane === SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE) {
    const execution = contract?.execution || {};
    if (execution.hasZones === true || execution.hasTokens === true) {
      return "executeSpellUnifiedArea";
    }
    return "executeSpellUnifiedLifecycle";
  }
  return null;
}

export function routeSpellUnifiedPanelOpenRequest(
  request = {},
  { buildContract = buildSpellUnifiedPanelContract } = {},
) {
  const normalized = normalizeSpellUnifiedPanelOpenRequest(request);
  const base = {
    destination: SPELL_UNIFIED_PANEL_DESTINATION,
    intent: normalized.intent,
    status: SPELL_UNIFIED_PANEL_ROUTE_STATUS.CATALOG,
    sourceId: normalized.sourceId,
    spellId: normalized.spellId,
    lane: null,
    adapter: null,
    executor: null,
    session: {
      spellId: normalized.spellId,
      phase: normalized.phase,
      casterId: normalized.casterId,
      slotLevel: normalized.slotLevel,
      variant: normalized.variant,
      durationTurns: normalized.durationTurns,
      applyAutomatedConditions: normalized.applyAutomatedConditions,
      targetIds: normalized.targetIds,
      targetContext: normalized.targetContext,
      placement: normalized.placement,
      activeInstanceId: normalized.activeInstanceId,
      activeActionId: normalized.activeActionId || normalized.actionId,
      activeConcentration: normalized.parentInstanceId
        ? {
          instanceId: normalized.parentInstanceId,
          spellId: normalized.spellId,
        }
        : null,
      triggerRuntime: normalized.zoneTrigger,
      castContext: {
        ...(normalized.slotLevel === null ? {} : { slotLevel: normalized.slotLevel }),
        ...(normalized.variant ? { choice: normalized.variant } : {}),
        ...(normalized.phase ? { phase: normalized.phase } : {}),
      },
    },
    context: {
      casterId: normalized.casterId,
      targetIds: normalized.targetIds,
      targetContext: normalized.targetContext,
      placement: normalized.placement,
      sceneEpoch: normalized.sceneEpoch,
      revision: normalized.revision,
      activationId: normalized.activationId,
      zoneRoot: normalized.zoneRoot,
      parentInstanceId: normalized.parentInstanceId,
    },
    quickActionId: normalized.quickActionId,
    origin: normalized.origin,
  };

  if (!normalized.spellId) return base;

  const contract = buildContract({
    spellId: normalized.spellId,
    phase: normalized.phase,
    actionId: normalized.actionId || normalized.activeActionId,
    choiceValue: normalized.variant,
    castContext: normalized.slotLevel === null
      ? {}
      : { slotLevel: normalized.slotLevel },
  });
  if (!contract) {
    return {
      ...base,
      status: SPELL_UNIFIED_PANEL_ROUTE_STATUS.UNSUPPORTED,
    };
  }

  const lane = laneForContract(contract, normalized);
  return {
    ...base,
    status: SPELL_UNIFIED_PANEL_ROUTE_STATUS.READY,
    contract,
    lane,
    adapter: adapterForLane(lane, contract),
    executor: executorForLane(lane, contract),
    session: {
      ...base.session,
      spellId: contract.spell?.id || normalized.spellId,
      phase: normalized.phase || contract.presentation?.phase?.selected || "cast",
      slotLevel: normalized.slotLevel ?? contract.presentation?.slot?.default ?? null,
      durationTurns: normalized.durationTurns
        ?? contract.presentation?.duration?.defaultTurns
        ?? null,
      activeConcentration: normalized.parentInstanceId
        ? {
          instanceId: normalized.parentInstanceId,
          spellId: contract.spell?.id || normalized.spellId,
        }
        : null,
    },
  };
}

export function buildSpellUnifiedPanelRouteQuery(request = {}) {
  const normalized = normalizeSpellUnifiedPanelOpenRequest(request);
  const query = new URLSearchParams();
  const scalarEntries = [
    ["intent", normalized.intent === "spell" ? "" : normalized.intent],
    ["source", normalized.sourceId],
    ["spellId", normalized.spellId],
    ["casterId", normalized.casterId],
    ["phase", normalized.phase],
    ["actionId", normalized.actionId],
    ["activeInstanceId", normalized.activeInstanceId],
    ["activeActionId", normalized.activeActionId],
    ["quickAction", normalized.quickActionId],
    ["slotLevel", normalized.slotLevel],
    ["variant", normalized.variant],
    ["durationTurns", normalized.durationTurns],
    ["applyAutomations", normalized.applyAutomatedConditions ? "true" : "false"],
    ["sceneEpoch", normalized.sceneEpoch],
    ["revision", normalized.revision],
    ["activationId", normalized.activationId],
    ["zoneRoot", normalized.zoneRoot],
    ["parentInstanceId", normalized.parentInstanceId],
    ["origin", normalized.origin === "legacy-entry-point" ? "" : normalized.origin],
  ];
  for (const [key, value] of scalarEntries) {
    if (value !== null && value !== undefined && text(value)) query.set(key, String(value));
  }
  if (normalized.targetIds.length) query.set("targetIds", normalized.targetIds.join(","));
  if (Object.keys(normalized.targetContext || {}).length) {
    query.set("targetContext", JSON.stringify(normalized.targetContext));
  }
  if (normalized.placement) query.set("placement", JSON.stringify(normalized.placement));
  if (normalized.zoneTrigger) query.set("zoneTrigger", JSON.stringify(normalized.zoneTrigger));
  return query;
}

export function resolveGlobalSpellSourceEntryCore({
  entries = [],
  state = {},
  selection = [],
  explicitSourceId = "",
} = {}) {
  const byId = new Map(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry && entry.id)
      .map((entry) => [entry.id, entry]),
  );

  const cleanBaseId = (rawId) => {
    const textId = String(rawId || "").trim();
    if (!textId || textId === "__LAIR__" || textId.startsWith("__EPIC__")) return "";
    return textId.replace(/::p\d+$/, "");
  };

  const isEligibleEntry = (entry) => {
    if (!entry || !entry.id) return false;
    const baseId = cleanBaseId(entry.id);
    return Boolean(baseId);
  };

  if (explicitSourceId) {
    const explicitBaseId = cleanBaseId(explicitSourceId);
    if (explicitBaseId) {
      const explicitEntry = byId.get(explicitBaseId);
      if (explicitEntry && isEligibleEntry(explicitEntry)) return explicitEntry;
    }
  }

  const order = Array.isArray(state?.order) ? state.order : [];
  if (order.length > 0) {
    const activeIndex = Math.max(0, Math.min(order.length - 1, state?.current ?? 0));
    const activeId = order[activeIndex];
    const activeBaseId = cleanBaseId(activeId);
    if (activeBaseId) {
      const activeEntry = byId.get(activeBaseId);
      if (activeEntry && isEligibleEntry(activeEntry)) return activeEntry;
    }
  }

  for (const selectedId of Array.isArray(selection) ? selection : []) {
    const selectedBaseId = cleanBaseId(selectedId);
    if (!selectedBaseId) continue;
    const entry = byId.get(selectedBaseId);
    if (entry && isEligibleEntry(entry)) return entry;
  }

  const firstEligible = (Array.isArray(entries) ? entries : []).find(isEligibleEntry);
  return firstEligible || null;
}
