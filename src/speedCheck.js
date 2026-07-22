import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { loadInitiativeCard } from "./initiativeCards.js";
import { getConditionInstances } from "./conditions.js";
import {
  conditionMovementCostCells,
  proneStandingCostMeters,
  resolveConditionSpeed,
} from "./conditionSpeedCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { suppressMovementHistory } from "./history.js";
import {
  advanceSpeedCycle,
  buildSpeedCheckSnapshot,
  countSpeedLimitCrossings,
  measureSquareGridCells,
  limitedMovementRejection,
  SPEED_CHECK_METERS_PER_CELL,
  resolveSpeedCheckTurn,
  retreatSpeedCycle,
  reversedPathStart,
  shouldRetreatSpeedMovement,
} from "./speedCheckCore.js";

const META_KEY = ID + "/meta";
const STATE_KEY = ID + "/state";
const SPEED_WARNING_CHANNEL = ID + "/speed-warning";
const SPEED_WARNING_MODAL_ID = ID + "/speed-warning-modal";
const SPEED_DRAG_CHANNEL = ID + "/speed-drag";
const SPEED_STATE_CHANNEL = ID + "/speed-state";
const SPEED_CHECK_META_FIELD = "speedCheckMovement";
const SPEED_CHECK_META_VERSION = 1;
const MAX_MOVEMENT_SEGMENTS = 500;


let movementState = null;
let movementStatePromise = null;
let currentTurn = null;
let movementQueue = Promise.resolve();
let processorEnabled = false;
let speedCheckEnabled = false;
let movementLimitEnabled = false;
let warningLayerPromise = null;
let speedDragListenerMounted = false;
let speedStateListenerMounted = false;
let speedMetadataListenerMounted = false;
let remoteMovementSnapshot = null;
let movementPersistQueue = Promise.resolve();
const trackedDrags = new Map();
const rejectedMovementRollbacks = new Map();
const movementStateListeners = new Set();

function emitMovementSnapshot(snapshot) {
  for (const listener of movementStateListeners) {
    try { listener(snapshot); } catch {}
  }
}

function broadcastMovementSnapshot(snapshot) {
  if (!processorEnabled) return;
  void OBR.broadcast.sendMessage(SPEED_STATE_CHANNEL, {
    type: "speed-state",
    snapshot,
  }, { destination: "ALL" }).catch(() => {});
}

function requestMovementSnapshot(turnKey = currentTurn?.turnKey || "") {
  void OBR.broadcast.sendMessage(SPEED_STATE_CHANNEL, {
    type: "request-speed-state",
    turnKey: String(turnKey || ""),
  }, { destination: "ALL" }).catch(() => {});
}

function notifyMovementState() {
  const snapshot = buildSpeedCheckSnapshot(movementState, speedCheckEnabled, movementLimitEnabled);
  emitMovementSnapshot(snapshot);
  broadcastMovementSnapshot(snapshot);
}

export function subscribeSpeedCheckState(listener) {
  if (typeof listener !== "function") return () => {};
  movementStateListeners.add(listener);
  const local = buildSpeedCheckSnapshot(movementState, speedCheckEnabled, movementLimitEnabled);
  listener(local.available ? local : remoteMovementSnapshot || local);
  return () => movementStateListeners.delete(listener);
}

export function mountSpeedCheckStateBroadcast() {
  if (speedStateListenerMounted) return;
  speedStateListenerMounted = true;
  OBR.broadcast.onMessage(SPEED_STATE_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type === "request-speed-state") {
      const requestedTurnKey = String(data.turnKey || "");
      if (processorEnabled && (!requestedTurnKey || requestedTurnKey === currentTurn?.turnKey)) {
        broadcastMovementSnapshot(buildSpeedCheckSnapshot(movementState, speedCheckEnabled, movementLimitEnabled));
      }
      return;
    }
    if (data?.type !== "speed-state" || processorEnabled) return;
    const snapshotTurnKey = String(data.snapshot?.turnKey || "");
    if (currentTurn?.turnKey && snapshotTurnKey !== currentTurn.turnKey) return;
    remoteMovementSnapshot = data.snapshot && typeof data.snapshot === "object"
      ? { ...data.snapshot }
      : null;
    if (remoteMovementSnapshot) emitMovementSnapshot(remoteMovementSnapshot);
  });

  requestMovementSnapshot();

}

function portraitUrl(item) {
  return String(item?.image?.url || item?.image?.src || item?.image?.href || item?.data?.src || "");
}

function validPoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function samePosition(a, b) {
  return !!a && !!b
    && Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= 0.1
    && Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) <= 0.1;
}

function movementTotalMeters(state) {
  return (Math.max(0, Number(state?.cycle) || 0) * Math.max(0, Number(state?.speedMeters) || 0))
    + Math.max(0, Number(state?.cycleMeters) || 0);
}

function conditionSpeedForItem(item, baseSpeedMeters) {
  const conditions = item?.metadata?.[META_KEY]?.conditions || {};
  return resolveConditionSpeed(baseSpeedMeters, getConditionInstances(conditions));
}

async function applyConditionSpeedItem(item) {
  if (!movementState || item?.id !== movementState.itemId || movementState.disabled) return;
  const totalMeters = movementTotalMeters(movementState);
  const wasProne = movementState.prone === true;
  const resolved = conditionSpeedForItem(item, movementState.baseSpeedMeters);
  const previousSignature = [
    movementState.speedMeters,
    movementState.blocked,
    movementState.conditionSummary,
    movementState.prone,
  ].join("|");
  const nextSignature = [resolved.speedMeters, resolved.blocked, resolved.summary, resolved.prone].join("|");
  if (previousSignature === nextSignature) return;

  Object.assign(movementState, {
    speedMeters: resolved.speedMeters,
    blocked: resolved.blocked,
    blocksSpeedBonuses: resolved.blocksSpeedBonuses,
    conditionSummary: resolved.summary,
    conditionReasons: resolved.reasons,
    prone: resolved.prone,
    movementCostMultiplier: resolved.movementCostMultiplier,
    blockedWarningSent: false,
  });
  movementState.cycle = resolved.speedMeters > 0
    ? Math.floor((totalMeters + 1e-9) / resolved.speedMeters)
    : 0;
  movementState.cycleMeters = resolved.speedMeters > 0
    ? Math.max(0, totalMeters - (movementState.cycle * resolved.speedMeters))
    : totalMeters;

  const standingCostMeters = wasProne && !resolved.prone
    ? proneStandingCostMeters(resolved.speedMeters)
    : 0;
  if (standingCostMeters > 0) {
    Object.assign(
      movementState,
      advanceSpeedCycle(
        movementState,
        standingCostMeters / SPEED_CHECK_METERS_PER_CELL,
        movementState.speedMeters
      )
    );
  }
  notifyMovementState();
  if (standingCostMeters > 0) await persistMovementState(movementState);
}

function persistedMovementPayload(state) {
  return {
    version: SPEED_CHECK_META_VERSION,
    turnKey: String(state?.turnKey || ""),
    totalMeters: Math.round(movementTotalMeters(state) * 1000) / 1000,
    lastCell: validPoint(state?.lastCell),
  };
}

function persistedMovementSignature(payload) {
  const lastCell = validPoint(payload?.lastCell);
  return [
    String(payload?.turnKey || ""),
    Math.round(Math.max(0, Number(payload?.totalMeters) || 0) * 1000) / 1000,
    lastCell?.x ?? "",
    lastCell?.y ?? "",
  ].join("|");
}

function trimMovementPathToTotal(state, targetTotal) {
  let excessMeters = Math.max(0, movementTotalMeters(state) - targetTotal);
  while (excessMeters > 0.0001 && state.path?.length) {
    const segment = state.path[state.path.length - 1];
    const segmentMeters = Math.max(0, Number(segment?.cells) || 0) * SPEED_CHECK_METERS_PER_CELL;
    if (segmentMeters <= excessMeters + 0.0001) {
      state.path.pop();
      excessMeters -= segmentMeters;
      continue;
    }
    segment.cells = Math.max(0, (segmentMeters - excessMeters) / SPEED_CHECK_METERS_PER_CELL);
    excessMeters = 0;
  }
}

function applyPersistedMovementItem(item) {
  if (!movementState || item?.id !== movementState.itemId) return;
  const payload = item?.metadata?.[META_KEY]?.[SPEED_CHECK_META_FIELD];
  if (!payload || String(payload.turnKey || "") !== movementState.turnKey) return;
  const signature = persistedMovementSignature(payload);
  if (signature === movementState.persistedSignature) return;

  const totalMeters = Math.max(0, Number(payload.totalMeters) || 0);
  trimMovementPathToTotal(movementState, totalMeters);
  const speed = Math.max(0, Number(movementState.speedMeters) || 0);
  movementState.cycle = speed > 0 ? Math.floor((totalMeters + 1e-9) / speed) : 0;
  movementState.cycleMeters = speed > 0
    ? Math.max(0, totalMeters - (movementState.cycle * speed))
    : totalMeters;
  movementState.lastCell = validPoint(payload.lastCell) || movementState.lastCell;
  movementState.persistedSignature = signature;
  notifyMovementState();
}

function persistMovementState(state) {
  if (!state?.itemId || !state?.turnKey || state.disabled) return Promise.resolve();
  const payload = persistedMovementPayload(state);
  state.persistedSignature = persistedMovementSignature(payload);
  const write = () => OBR.scene.items.updateItems([state.itemId], (drafts) => {
    for (const item of drafts) {
      const previous = { ...(item.metadata?.[META_KEY] || {}) };
      item.metadata = {
        ...(item.metadata || {}),
        [META_KEY]: { ...previous, [SPEED_CHECK_META_FIELD]: payload },
      };
    }
  });
  movementPersistQueue = movementPersistQueue.then(write, write);
  return movementPersistQueue;
}

function mountSpeedMetadataListener() {
  if (speedMetadataListenerMounted) return;
  speedMetadataListenerMounted = true;
  subscribeSceneItemChanges((event) => {
    if (!movementState?.itemId) return;
    const item = event.items.find((candidate) => candidate?.id === movementState.itemId);
    if (!item) return;
    if (event.flags.speedCheck) applyPersistedMovementItem(item);
    if (event.flags.conditions) void applyConditionSpeedItem(item).catch(() => {});
  }, { immediate: true });
}

async function snapToGridCell(position) {
  const fallback = validPoint(position);
  if (!fallback) return null;
  try {
    const snapped = await OBR.scene.grid.snapPosition(fallback, 1, false, true);
    return validPoint(snapped) || fallback;
  } catch {
    return fallback;
  }
}

async function prepareMovementSample(movement) {
  const suppliedBefore = validPoint(movement?.beforeCell);
  const suppliedAfter = validPoint(movement?.afterCell);
  if (suppliedBefore && suppliedAfter) {
    return { ...movement, beforeCell: suppliedBefore, afterCell: suppliedAfter };
  }
  const [beforeCell, afterCell] = await Promise.all([
    snapToGridCell(movement?.beforePosition),
    snapToGridCell(movement?.afterPosition),
  ]);
  return { ...movement, beforeCell, afterCell };
}

async function loadMovementState(turn) {
  const { actorId, turnKey } = turn || {};
  if (!actorId || !turnKey) return null;

  const [item] = await OBR.scene.items.getItems([actorId]);
  const meta = item?.metadata?.[META_KEY] || {};
  if (!item || String(meta.attitude || "").toLowerCase() !== "pc") {
    return { turnKey, itemId: actorId, disabled: true, path: [] };
  }

  const [profile, gridDpi, lastCell] = await Promise.all([
    loadInitiativeCard(item, { hydrate: false }),
    OBR.scene.grid.getDpi().catch(() => 150),
    snapToGridCell(item.position),
  ]);
  const baseSpeedMeters = Math.max(0, Number(profile?.speed) || 0);
  if (baseSpeedMeters <= 0) {
    return { turnKey, itemId: actorId, disabled: true, path: [] };
  }
  const resolvedSpeed = conditionSpeedForItem(item, baseSpeedMeters);
  const speedMeters = resolvedSpeed.speedMeters;

  const persisted = meta?.[SPEED_CHECK_META_FIELD];
  const persistedMatches = String(persisted?.turnKey || "") === turnKey;
  const totalMeters = persistedMatches ? Math.max(0, Number(persisted.totalMeters) || 0) : 0;
  const cycle = speedMeters > 0 ? Math.floor((totalMeters + 1e-9) / speedMeters) : 0;
  return {
    turnKey,
    itemId: actorId,
    disabled: false,
    baseSpeedMeters,
    speedMeters,
    blocked: resolvedSpeed.blocked,
    blocksSpeedBonuses: resolvedSpeed.blocksSpeedBonuses,
    conditionSummary: resolvedSpeed.summary,
    conditionReasons: resolvedSpeed.reasons,
    prone: resolvedSpeed.prone,
    movementCostMultiplier: resolvedSpeed.movementCostMultiplier,
    blockedWarningSent: false,
    gridDpi: Math.max(1, Number(gridDpi) || 150),
    cycle,
    cycleMeters: Math.max(0, totalMeters - (cycle * speedMeters)),
    dashCount: 0,
    bonusMeters: 0,
    name: String(item.name || "Personaggio").trim() || "Personaggio",
    portrait: portraitUrl(item),
    lastCell: persistedMatches ? validPoint(persisted.lastCell) || lastCell : lastCell,
    path: [],
    persistedSignature: persistedMatches ? persistedMovementSignature(persisted) : "",
    needsBaselinePersist: !persistedMatches,
  };
}

async function ensureMovementState(turn) {
  const { actorId, turnKey } = turn || {};
  if (!actorId || !turnKey) return null;
  if (movementState?.turnKey === turnKey && movementState?.itemId === actorId) return movementState;

  if (movementStatePromise?.turnKey !== turnKey) {
    const promise = loadMovementState(turn);
    movementStatePromise = { turnKey, promise };
  }

  const pending = movementStatePromise;
  const loaded = await pending.promise;
  if (currentTurn?.turnKey !== turnKey) return null;
  if (movementStatePromise === pending) movementStatePromise = null;
  movementState = loaded;
  if (movementState?.needsBaselinePersist) {
    delete movementState.needsBaselinePersist;
    void persistMovementState(movementState).catch(() => {});
  }
  notifyMovementState();
  return movementState;
}

export function syncSpeedCheckTurn(state) {
  const next = resolveSpeedCheckTurn(state);
  const changed = !next.turnKey || next.turnKey !== currentTurn?.turnKey;
  if (changed) {
    movementState = null;
    movementStatePromise = null;
  }
  currentTurn = next.turnKey ? next : null;
  if (changed && processorEnabled) {
    notifyMovementState();
    if (speedCheckEnabled && currentTurn) {
      void ensureMovementState({ ...currentTurn }).catch(() => {});
    }
  } else if (changed) {
    remoteMovementSnapshot = null;
    emitMovementSnapshot(buildSpeedCheckSnapshot(null, false, movementLimitEnabled));
    requestMovementSnapshot(currentTurn?.turnKey);
  }
}

function trackedDragFor(itemId) {
  const entry = trackedDrags.get(itemId);
  if (!entry) return null;
  if (entry.until && entry.until < Date.now()) {
    trackedDrags.delete(itemId);
    return null;
  }
  return entry;
}

function passiveMovementIsUndo(entry, movement) {
  if (entry.cancelled || !entry.segments.length) return false;
  const first = entry.segments[0];
  const last = entry.segments[entry.segments.length - 1];
  return samePosition(movement?.beforePosition, last.afterPosition)
    && samePosition(movement?.afterPosition, first.beforePosition);
}

function finishTrackedDrag(itemId, dragId) {
  const entry = trackedDrags.get(itemId);
  if (!entry || entry.dragId !== dragId) return;
  entry.until = Date.now() + 1000;
  void movementQueue.then(() => {
    if (movementState?.itemId === itemId) return persistMovementState(movementState);
  }).catch(() => {});
  setTimeout(() => {
    if (trackedDrags.get(itemId) === entry) trackedDrags.delete(itemId);
  }, 1100);
}

function mountSpeedDragListener() {
  if (speedDragListenerMounted) return;
  speedDragListenerMounted = true;
  OBR.broadcast.onMessage(SPEED_DRAG_CHANNEL, (event) => {
    if (!speedCheckEnabled) return;
    const data = event?.data;
    const itemId = String(data?.itemId || "");
    const dragId = String(data?.dragId || "");
    if (!itemId || !dragId) return;

    if (data.type === "start") {
      trackedDrags.set(itemId, { dragId, segments: [], until: 0, cancelled: false });
      return;
    }

    const entry = trackedDrags.get(itemId);
    if (!entry || entry.dragId !== dragId) return;
    if (data.type === "segment") {
      const segment = {
        id: itemId,
        beforePosition: data.beforePosition,
        afterPosition: data.afterPosition,
        beforeCell: data.beforeCell,
        afterCell: data.afterCell,

        toolSynthetic: true,
        toolDragId: dragId,
      };
      entry.segments.push(segment);
      void queueSpeedCheckMovements([segment]);
      return;
    }

    if (data.type === "cancel") {
      entry.cancelled = true;
      const segments = entry.segments;
      if (segments.length) {
        const first = segments[0];
        const last = segments[segments.length - 1];
        void queueSpeedCheckMovements([{
          id: itemId,
          beforePosition: last.afterPosition,
          afterPosition: first.beforePosition,
          beforeCell: last.afterCell,
          afterCell: first.beforeCell,

          toolSynthetic: true,
          toolDragId: dragId,
          undo: true,
        }]);
      }
    }
    finishTrackedDrag(itemId, dragId);
  });
}

export function enableSpeedCheckProcessor() {
  if (processorEnabled) return;
  processorEnabled = true;
  mountSpeedMetadataListener();
  mountSpeedDragListener();
  if (speedCheckEnabled && currentTurn) void ensureMovementState({ ...currentTurn }).catch(() => {});
}

export function setSpeedCheckEnabled(enabled) {
  const next = !!enabled;
  if (speedCheckEnabled === next) return;
  speedCheckEnabled = next;
  movementState = null;
  movementStatePromise = null;
  trackedDrags.clear();
  notifyMovementState();
  if (next && processorEnabled && currentTurn) {
    void ensureMovementState({ ...currentTurn }).catch(() => {});
  }
}

export function setSpeedCheckMovementLimit(enabled) {
  const next = !!enabled;
  if (movementLimitEnabled === next) return;
  movementLimitEnabled = next;
  notifyMovementState();
}

async function readSpeedCheckTurn() {
  if (currentTurn?.turnKey) return { ...currentTurn };
  const metadata = await OBR.scene.getMetadata();
  syncSpeedCheckTurn(metadata?.[STATE_KEY]);
  return currentTurn ? { ...currentTurn } : null;
}


async function processSpeedCheckMovement(movement, turn) {
  if (!speedCheckEnabled) return;
  const { actorId, turnKey } = turn || {};
  if (!actorId || !turnKey) return;
  if (currentTurn?.turnKey !== turnKey || movement?.id !== actorId) return;

  const state = await ensureMovementState(turn);
  if (!state || state.disabled || currentTurn?.turnKey !== turnKey) return;

  const beforeCell = state.lastCell || movement?.beforeCell;
  const afterCell = movement?.afterCell;
  const rawBefore = validPoint(movement?.beforePosition);
  const rawAfter = validPoint(movement?.afterPosition);
  if (!beforeCell || !afterCell || !rawBefore || !rawAfter) return;

  const sample = { ...movement, beforeCell, afterCell };
  let movedCells;
  try {
    const measured = await OBR.scene.grid.getDistance(beforeCell, afterCell);
    movedCells = Number.isFinite(measured) && measured >= 0
      ? Number(measured)
      : measureSquareGridCells(beforeCell, afterCell, state.gridDpi);
  } catch {
    movedCells = measureSquareGridCells(beforeCell, afterCell, state.gridDpi);
  }
  if (movedCells < 0.001) return;

  const toolUndoIndex = movement?.undo === true && movement?.toolDragId
    ? state.path.findIndex((segment) => segment.toolDragId === movement.toolDragId)
    : -1;
  const reverseIndex = toolUndoIndex >= 0 ? toolUndoIndex : reversedPathStart(state.path, sample);
  if (shouldRetreatSpeedMovement(reverseIndex, sample)) {
    const reverted = reverseIndex >= 0 ? state.path.splice(reverseIndex) : [];
    const revertedCells = reverted.length
      ? reverted.reduce((total, segment) => total + Math.max(0, Number(segment.cells) || 0), 0)
      : movedCells;
    Object.assign(state, retreatSpeedCycle(state, revertedCells, state.speedMeters));
    state.lastCell = afterCell;
    notifyMovementState();
    if (sample.undo === true) await persistMovementState(state);
    return;
  }

  const chargedCells = conditionMovementCostCells(movedCells, state.movementCostMultiplier);
  const beforeSnapshot = buildSpeedCheckSnapshot(state, true, movementLimitEnabled);
  const rejection = limitedMovementRejection(beforeSnapshot, chargedCells);
  if (rejection) {
    const rollbackPosition = { ...rawBefore };
    rejectedMovementRollbacks.set(state.itemId, {
      position: rollbackPosition,
      until: Date.now() + 2500,
    });
    suppressMovementHistory(state.itemId, rollbackPosition, 2500);
    await OBR.scene.items.updateItems([state.itemId], (drafts) => {
      for (const item of drafts) item.position = { ...rollbackPosition };
    });
    notifyMovementState();
    if (rejection.blocked) state.blockedWarningSent = true;
    void OBR.broadcast.sendMessage(SPEED_WARNING_CHANNEL, {
      type: "show-speed-warning",
      blocked: rejection.blocked,
      reason: rejection.blocked ? state.conditionSummary : "",
      name: state.name,
      portrait: state.portrait,
      speedMeters: rejection.blocked ? 0 : state.speedMeters,
      limitMeters: beforeSnapshot.allowanceMeters,
      cycle: beforeSnapshot.cycle,
      cyclesCrossed: 1,
      createdAt: Date.now(),
    }, { destination: "ALL" }).catch(() => {});
    return;
  }
  const next = advanceSpeedCycle(state, chargedCells, state.speedMeters);
  Object.assign(state, next);
  state.path.push({
    beforeCell: { ...beforeCell },
    afterCell: { ...afterCell },
    cells: chargedCells,
    toolDragId: movement?.toolDragId || "",
  });
  state.lastCell = afterCell;
  if (state.path.length > MAX_MOVEMENT_SEGMENTS) {
    state.path.splice(0, state.path.length - MAX_MOVEMENT_SEGMENTS);
  }
  const afterSnapshot = buildSpeedCheckSnapshot(state, true, movementLimitEnabled);
  if (state.blocked && state.speedMeters <= 0) {
    notifyMovementState();
    const persistTask = sample.toolSynthetic ? null : persistMovementState(state);
    if (!state.blockedWarningSent) {
      state.blockedWarningSent = true;
      void OBR.broadcast.sendMessage(SPEED_WARNING_CHANNEL, {
        type: "show-speed-warning",
        blocked: true,
        reason: state.conditionSummary,
        name: state.name,
        portrait: state.portrait,
        speedMeters: 0,
        limitMeters: 0,
        cycle: 0,
        cyclesCrossed: 1,
        createdAt: Date.now(),
      }, { destination: "ALL" }).catch(() => {});
    }
    if (persistTask) await persistTask;
    return;
  }
  const limitCrossings = countSpeedLimitCrossings(
    beforeSnapshot.totalMeters,
    afterSnapshot.totalMeters,
    afterSnapshot.allowanceMeters,
    state.speedMeters,
  );
  notifyMovementState();
  const persistTask = sample.toolSynthetic ? null : persistMovementState(state);
  if (limitCrossings <= 0) {
    if (persistTask) await persistTask;
    return;
  }

  void OBR.broadcast.sendMessage(SPEED_WARNING_CHANNEL, {
    type: "show-speed-warning",
    name: state.name,
    portrait: state.portrait,
    speedMeters: state.speedMeters,
    limitMeters: afterSnapshot.allowanceMeters,
    cycle: next.cycle,
    cyclesCrossed: limitCrossings,
    createdAt: Date.now(),
  }, { destination: "ALL" }).catch(() => {});
  if (persistTask) await persistTask;
}

export function queueSpeedCheckMovements(changes) {
  if (!processorEnabled || !speedCheckEnabled) return movementQueue;
  for (const movement of Array.isArray(changes) ? changes : []) {
    const rejectedRollback = rejectedMovementRollbacks.get(movement?.id);
    if (rejectedRollback) {
      if (rejectedRollback.until < Date.now()) {
        rejectedMovementRollbacks.delete(movement.id);
      } else if (movement?.undo === true && samePosition(movement?.afterPosition, rejectedRollback.position)) {
        rejectedMovementRollbacks.delete(movement.id);
        continue;
      }
    }
    if (!movement?.toolSynthetic) {
      const tracked = trackedDragFor(movement?.id);
      if (tracked && !passiveMovementIsUndo(tracked, movement)) continue;
    }
    const turnPromise = currentTurn?.turnKey
      ? Promise.resolve({ ...currentTurn })
      : readSpeedCheckTurn();
    const samplePromise = prepareMovementSample(movement);
    const run = async () => processSpeedCheckMovement(await samplePromise, await turnPromise);
    movementQueue = movementQueue.then(run, run);
  }
  return movementQueue;
}

export function adjustSpeedCheckDash(delta) {
  if (!movementState || movementState.disabled) return;
  const amount = Math.trunc(Number(delta) || 0);
  movementState.dashCount = Math.max(0, Math.min(9, (Number(movementState.dashCount) || 0) + amount));
  notifyMovementState();
}

export function adjustSpeedCheckBonus(deltaMeters) {
  if (!movementState || movementState.disabled) return;
  const next = (Number(movementState.bonusMeters) || 0) + (Number(deltaMeters) || 0);
  movementState.bonusMeters = Math.max(0, Math.min(999, Math.round(next * 10) / 10));
  notifyMovementState();
}

export function resetSpeedCheckMovement() {
  movementStatePromise = null;
  trackedDrags.clear();
  if (movementState && !movementState.disabled) {
    movementState.cycle = 0;
    movementState.cycleMeters = 0;
    movementState.dashCount = 0;
    movementState.bonusMeters = 0;
    movementState.path = [];
    notifyMovementState();
    void persistMovementState(movementState).catch(() => {});
    return;
  }

  movementState = null;
  notifyMovementState();
  if (processorEnabled && speedCheckEnabled && currentTurn) {
    void ensureMovementState({ ...currentTurn }).catch(() => {});
  }
}

export function mountSpeedWarningBroadcast() {
  if (warningLayerPromise) return warningLayerPromise;
  warningLayerPromise = (async () => {
    try { await OBR.modal.close(SPEED_WARNING_MODAL_ID); } catch {}
    await OBR.modal.open({
      id: SPEED_WARNING_MODAL_ID,
      url: "/speed-warning.html",
      fullScreen: true,
      hideBackdrop: true,
      hidePaper: true,
      disablePointerEvents: true,
    });
  })().catch((error) => {
    warningLayerPromise = null;
    throw error;
  });
  return warningLayerPromise;
}
