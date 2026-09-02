import blinkReferenceData from "./spell-reference-it.json" with { type: "json" };
import {
  gridPlanarDistance,
  gridScaleParts,
} from "./distance3dCore.js";
import { buildTerminationResumeOperation } from "./spellTerminationGatewayCore.js";

export const BLINK_ID = "blink";
export const BLINK_RETURN_PLACEMENT_RULE_ID = "blink:return";
export const BLINK_DURATION_ROUNDS = 10;
export const BLINK_RETURN_MAX_METERS = 3;
export const BLINK_VIEW_METERS = 18;

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const rawReference = blinkReferenceData?.spells?.[BLINK_ID] || {};

// Questo modulo contiene soltanto il contratto persistente e le invarianti
// Blink. Non contiene dadi, targeting planare, LOS o ricerca di spazi.
export const BLINK_RAW = Object.freeze(clone(rawReference));

const BLINK_TERMINAL_RESOLUTION = Object.freeze({
  kind: "blink-return",
  resolutionKind: "blink-return",
  maxMeters: BLINK_RETURN_MAX_METERS,
  viewMeters: BLINK_VIEW_METERS,
  statePath: "blink.plane",
  requiresState: "ethereal",
});

const BLINK_TURN_BOUNDARY_NOTICES = Object.freeze([
  Object.freeze({
    id: "blink-turn-end",
    timing: "turn-end",
    actor: "source",
    statePath: "blink.plane",
    requiresPlane: "material",
    title: "Intermittenza",
    label: "Esito d20 fisico",
    instruction: "Tira fisicamente un d20 alla fine del turno del caster.",
    choiceLabels: Object.freeze({
      passed: "1–10 · Rimane",
      failed: "11+ · Piano Etereo",
    }),
    resolutionData: Object.freeze({
      kind: "blink-roll",
      expectedPlane: "material",
    }),
    deferRoundExpiry: true,
  }),
  Object.freeze({
    id: "blink-turn-start-return",
    timing: "turn-start",
    actor: "source",
    statePath: "blink.plane",
    requiresPlane: "ethereal",
    title: "Ritorno da Intermittenza",
    label: "Ritorno",
    instruction: "Scegli la destinazione del ritorno sulla mappa.",
    choiceLabels: Object.freeze({
      passed: "Scegli destinazione",
    }),
    resolutionData: Object.freeze({
      kind: "blink-return",
      maxMeters: BLINK_RETURN_MAX_METERS,
      viewMeters: BLINK_VIEW_METERS,
    }),
  }),
]);

function normalizePlane(value) {
  return String(value || "").trim().toLocaleLowerCase("it") === "ethereal"
    ? "ethereal"
    : "material";
}

export function blinkPosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function blinkStateFromCastContext(castContext = {}) {
  const state = castContext?.blink && typeof castContext.blink === "object"
    ? castContext.blink
    : {};
  const plane = normalizePlane(state.plane);
  return {
    plane,
    departurePosition: blinkPosition(state.departurePosition),
    departureTurnKey: String(state.departureTurnKey || "").trim() || null,
    returnTurnKey: String(state.returnTurnKey || "").trim() || null,
    pendingTurnBoundary: castContext?.pendingTurnBoundary
      && typeof castContext.pendingTurnBoundary === "object"
      ? clone(castContext.pendingTurnBoundary)
      : null,
    resolvedTurnBoundary: castContext?.resolvedTurnBoundary
      && typeof castContext.resolvedTurnBoundary === "object"
      ? clone(castContext.resolvedTurnBoundary)
      : null,
  };
}

export function blinkTurnBoundaryNotices() {
  return clone(BLINK_TURN_BOUNDARY_NOTICES);
}

export function blinkTerminalResolution() {
  return clone(BLINK_TERMINAL_RESOLUTION);
}

export function blinkInitialCastContext(castContext = {}) {
  const existing = castContext && typeof castContext === "object" ? clone(castContext) : {};
  const descriptors = new Map(
    (Array.isArray(existing.turnBoundaryNotices) ? existing.turnBoundaryNotices : [])
      .filter((descriptor) => String(descriptor?.id || "").trim())
      .map((descriptor) => [String(descriptor.id).trim(), descriptor]),
  );
  for (const descriptor of BLINK_TURN_BOUNDARY_NOTICES) {
    descriptors.set(descriptor.id, clone(descriptor));
  }
  return {
    ...existing,
    blink: {
      plane: "material",
      departurePosition: null,
      departureTurnKey: null,
      returnTurnKey: null,
    },
    pendingTurnBoundary: null,
    resolvedTurnBoundary: null,
    turnBoundaryNotices: [...descriptors.values()],
    terminalResolution: blinkTerminalResolution(),
  };
}

export function blinkCastContextForState(castContext = {}, state = {}) {
  const existing = castContext && typeof castContext === "object" ? clone(castContext) : {};
  return {
    ...existing,
    blink: {
      plane: normalizePlane(state.plane),
      departurePosition: blinkPosition(state.departurePosition),
      departureTurnKey: String(state.departureTurnKey || "").trim() || null,
      returnTurnKey: String(state.returnTurnKey || "").trim() || null,
    },
    pendingTurnBoundary: Object.prototype.hasOwnProperty.call(state, "pendingTurnBoundary")
      ? clone(state.pendingTurnBoundary)
      : (Object.prototype.hasOwnProperty.call(existing, "pendingTurnBoundary")
        ? clone(existing.pendingTurnBoundary)
        : null),
    resolvedTurnBoundary: Object.prototype.hasOwnProperty.call(state, "resolvedTurnBoundary")
      ? clone(state.resolvedTurnBoundary)
      : (Object.prototype.hasOwnProperty.call(existing, "resolvedTurnBoundary")
        ? clone(existing.resolvedTurnBoundary)
        : null),
    turnBoundaryNotices: Array.isArray(existing.turnBoundaryNotices)
      ? clone(existing.turnBoundaryNotices)
      : blinkTurnBoundaryNotices(),
    terminalResolution: existing.terminalResolution
      && typeof existing.terminalResolution === "object"
      ? clone(existing.terminalResolution)
      : blinkTerminalResolution(),
  };
}

export function blinkSummaryParts(castContext = {}) {
  return blinkStateFromCastContext(castContext).plane === "ethereal"
    ? [{ id: "blink-ethereal", label: "Etereo" }]
    : [];
}

export function blinkSemanticDetail(castContext = {}) {
  return blinkStateFromCastContext(castContext).plane === "ethereal"
    ? `Piano Etereo · vista ${BLINK_VIEW_METERS} m · interazioni solo eteree`
    : "";
}

export function blinkIsEthereal(entry = null) {
  return String(entry?.spellId || "").trim() === BLINK_ID
    && blinkStateFromCastContext(entry?.castContext).plane === "ethereal";
}

export function blinkMetersPerCell(scale = {}) {
  const parts = gridScaleParts(scale);
  const multiplier = Number.isFinite(parts.multiplier) && parts.multiplier > 0
    ? parts.multiplier
    : 1.5;
  return multiplier * (Number.isFinite(parts.unitMeters) && parts.unitMeters > 0
    ? parts.unitMeters
    : 1);
}

export function blinkReturnDistance({
  departurePosition = null,
  chosenPosition = null,
  dpi = 1,
  gridMultiplier = 1.5,
  fromSize = {},
  toSize = {},
} = {}) {
  const departure = blinkPosition(departurePosition);
  const chosen = blinkPosition(chosenPosition);
  const safeDpi = Number(dpi);
  const safeMultiplier = Number(gridMultiplier);
  if (!departure || !chosen || !Number.isFinite(safeDpi) || safeDpi <= 0
    || !Number.isFinite(safeMultiplier) || safeMultiplier <= 0) {
    return null;
  }
  return gridPlanarDistance(
    departure,
    chosen,
    safeDpi,
    safeMultiplier,
    fromSize,
    toSize,
  );
}

export function validateBlinkReturnPlacement({
  departurePosition = null,
  chosenPosition = null,
  dpi = 1,
  scale = {},
  fallback = false,
  enforceDistance = true,
  maxMeters = BLINK_RETURN_MAX_METERS,
  fromSize = {},
  toSize = {},
} = {}) {
  const distance = blinkReturnDistance({
    departurePosition,
    chosenPosition,
    dpi,
    gridMultiplier: blinkMetersPerCell(scale),
    fromSize,
    toSize,
  });
  const errors = [];
  if (!blinkPosition(departurePosition)) errors.push("blink-departure-position-missing");
  if (!blinkPosition(chosenPosition)) errors.push("blink-return-position-required");
  if (!distance) errors.push("blink-return-distance-unavailable");
  if (enforceDistance && !fallback && distance && distance.distance > Number(maxMeters) + 1e-6) {
    errors.push("blink-return-out-of-range");
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    distance,
  };
}

function spellName(spellEntry) {
  return String(spellEntry?.name || "Intermittenza").trim() || "Intermittenza";
}

export function blinkStateUpsertOperation({
  targetId = "",
  spellEntry = null,
  nextState = null,
} = {}) {
  const normalizedTargetId = String(targetId || "").trim();
  const instanceId = String(spellEntry?.instanceId || "").trim();
  const casterId = String(spellEntry?.casterId || normalizedTargetId).trim();
  if (!normalizedTargetId || !instanceId || !casterId || !spellEntry) return null;
  const currentContext = spellEntry.castContext && typeof spellEntry.castContext === "object"
    ? clone(spellEntry.castContext)
    : {};
  const nextContext = blinkCastContextForState(currentContext, nextState || {});
  return {
    type: "spell:upsert",
    targetIds: [normalizedTargetId],
    name: spellName(spellEntry),
    turns: Number.isFinite(Number(spellEntry.turns))
      ? Math.max(0, Math.floor(Number(spellEntry.turns)))
      : BLINK_DURATION_ROUNDS,
    ...(Number(spellEntry.turns) === 0 ? { allowZeroTurns: true } : {}),
    conc: false,
    source: casterId,
    ...(spellEntry.casterName ? { casterName: String(spellEntry.casterName) } : {}),
    instanceId,
    spellId: BLINK_ID,
    ...(spellEntry.appliedAt ? { appliedAt: clone(spellEntry.appliedAt) } : {}),
    castContext: nextContext,
    summaryParts: blinkSummaryParts(nextContext),
    expectedInstanceId: instanceId,
    expectedCastContext: currentContext,
  };
}

export function buildBlinkRollStateOperation({
  targetId = "",
  spellEntry = null,
  outcome = "",
  currentPosition = null,
  departureTurnKey = "",
  returnTurnKey = "",
  resolvedTurnBoundary = null,
} = {}) {
  const normalizedOutcome = String(outcome || "").trim().toLocaleLowerCase("it");
  if (normalizedOutcome === "passed") return null;
  if (normalizedOutcome !== "failed") return null;
  const currentState = blinkStateFromCastContext(spellEntry?.castContext);
  if (currentState.plane !== "material") return null;
  const departurePosition = blinkPosition(currentPosition);
  if (!departurePosition) return null;
  return blinkStateUpsertOperation({
    targetId,
    spellEntry,
    nextState: {
      plane: "ethereal",
      departurePosition,
      departureTurnKey: String(departureTurnKey || "").trim() || null,
      returnTurnKey: String(returnTurnKey || "").trim() || null,
      pendingTurnBoundary: null,
      resolvedTurnBoundary: resolvedTurnBoundary && typeof resolvedTurnBoundary === "object"
        ? clone(resolvedTurnBoundary)
        : null,
    },
  });
}

export function buildBlinkReturnOperations({
  targetId = "",
  spellEntry = null,
  chosenPosition = null,
  fallback = false,
  dpi = 1,
  scale = {},
  fromSize = {},
  toSize = {},
} = {}) {
  const currentState = blinkStateFromCastContext(spellEntry?.castContext);
  const validation = validateBlinkReturnPlacement({
    departurePosition: currentState.departurePosition,
    chosenPosition,
    dpi,
    scale,
    fallback,
    // La destinazione è scelta manualmente dal GM sulla mappa. Il resolver
    // conserva la distanza RAW come dato diagnostico, ma non la rifiuta.
    enforceDistance: false,
    fromSize,
    toSize,
  });
  if (!validation.valid) return { ...validation, operations: [], sideEffects: [] };
  const stateOperation = blinkStateUpsertOperation({
    targetId,
    spellEntry,
    nextState: {
      plane: "material",
      departurePosition: null,
      departureTurnKey: null,
      returnTurnKey: null,
      pendingTurnBoundary: null,
      resolvedTurnBoundary: null,
    },
  });
  if (!stateOperation) {
    return {
      valid: false,
      errors: ["blink-parent-instance-required"],
      operations: [],
      sideEffects: [],
      distance: validation.distance,
    };
  }
  const operations = [stateOperation];
  const pending = spellEntry?.pendingTermination && typeof spellEntry.pendingTermination === "object"
    ? spellEntry.pendingTermination
    : null;
  if (pending) {
    operations.push(buildTerminationResumeOperation({
      casterId: spellEntry.casterId || targetId,
      reference: spellEntry.instanceId,
      instanceId: spellEntry.instanceId,
      requestId: pending.requestId,
    }));
  }
  return {
    valid: true,
    errors: [],
    operations,
    sideEffects: [{
      type: "token:teleport",
      targetId: String(targetId || "").trim(),
      position: blinkPosition(chosenPosition),
      skipAnimation: true,
    }],
    distance: validation.distance,
  };
}
