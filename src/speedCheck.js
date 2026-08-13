import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getInitiativeCard, loadInitiativeCard } from "./initiativeCards.js";
import { getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { classFeaturePassiveMovementMechanics } from "./classFeatureCore.js";
import { getConditionInstances } from "./conditions.js";
import {
  proneStandingCostMeters,
  resolveConditionSpeed,
} from "./conditionSpeedCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { suppressMovementHistory } from "./history.js";
import {
  advanceSpeedCycle,
  buildSpeedCheckSnapshot,
  countSpeedLimitCrossings,
  climbingMovementCostMultiplier,
  elevationMovementCells,
  measureSquareGridCells,
  limitedMovementRejection,
  SPEED_CHECK_METERS_PER_CELL,
  movementCostForSegment,
  resolveSpeedCheckTurn,
  retreatSpeedCycle,
  reversedPathStart,
  shouldRetreatSpeedMovement,
} from "./speedCheckCore.js";
import { normalizeElevation } from "./distance3dCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  translatedZoneArea,
} from "./spellStaticZoneCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectMovementReminderEnabled } from "./options/optionsSelectors.js";

const META_KEY = ID + "/meta";
const SPELLS_META_KEY = ID + "/spells";
const STATE_KEY = ID + "/state";
const SPEED_WARNING_CHANNEL = ID + "/speed-warning";
const SPEED_WARNING_MODAL_ID = ID + "/speed-warning-modal";
const SPEED_DRAG_CHANNEL = ID + "/speed-drag";
const SPEED_STATE_CHANNEL = ID + "/speed-state";
const SPEED_CHECK_META_FIELD = "speedCheckMovement";
const ELEVATION_META_FIELD = "elevation";
const CLIMBING_META_FIELD = "climbing";
const SPEED_CHECK_META_VERSION = 2;
const MAX_MOVEMENT_SEGMENTS = 500;

function isMovementReminderEnabled() {
  try {
    return runtimeOptionsService.get(selectMovementReminderEnabled) !== false;
  } catch {
    return true;
  }
}


let movementState = null;
let movementStatePromise = null;
let movementStatePrefetch = null;
let currentTurn = null;
let movementQueue = Promise.resolve();
let processorEnabled = false;
let speedCheckEnabled = false;
let movementLimitEnabled = false;
let warningLayerPromise = null;
let speedWarningBroadcastQueue = Promise.resolve();
let speedWarningSequence = 0;
let speedDragListenerMounted = false;
let speedStateListenerMounted = false;
let speedMetadataListenerMounted = false;
let remoteMovementSnapshot = null;
let movementPersistQueue = Promise.resolve();
const trackedDrags = new Map();
const rejectedMovementRollbacks = new Map();
const rejectedElevationRollbacks = new Map();
const suppressedElevationResets = new Map();
const movementStateListeners = new Set();

function broadcastSpeedWarning(payload) {
  if (!isMovementReminderEnabled()) return Promise.resolve();
  const warning = {
    type: "show-speed-warning",
    ...payload,
    warningId: `${String(payload?.turnKey || currentTurn?.turnKey || "movement")}:${++speedWarningSequence}`,
    createdAt: Date.now(),
  };
  const send = () => OBR.broadcast.sendMessage(
    SPEED_WARNING_CHANNEL,
    warning,
    { destination: "ALL" },
  );
  speedWarningBroadcastQueue = speedWarningBroadcastQueue.then(send, send);
  return speedWarningBroadcastQueue.catch(() => {});
}

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
  const snapshot = buildSpeedCheckSnapshot(
    movementState || currentTurn,
    speedCheckEnabled,
    movementLimitEnabled,
  );
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

function parseSpeedMeters(rawSpeed) {
  const num = Number(rawSpeed);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 10) / 10;
}

function conditionSpeedForItem(item, baseSpeedMeters, preferredMode = "walk") {
  const meta = item?.metadata?.[META_KEY] || {};
  const conditions = meta.conditions || {};
  const spells = meta[SPELLS_META_KEY] || [];
  const passiveFeatureInstances = getEnabledClassFeatures(getInitiativeCard(item))
    .map((feature) => {
      const movement = classFeaturePassiveMovementMechanics(feature);
      if (!movement) return null;
      return {
        id: `class-feature-passive:${feature.id}`,
        effectId: feature.id,
        condition: feature.name,
        active: true,
        mechanics: { movement },
      };
    })
    .filter(Boolean);
  return resolveConditionSpeed(
    baseSpeedMeters,
    [...passiveFeatureInstances, ...getConditionInstances(conditions)],
    spells,
    preferredMode,
  );
}

async function liveDirectionalMovementModifiers(state) {
  const declared = Array.isArray(state?.directionalCostModifiers)
    ? state.directionalCostModifiers
    : [];
  if (!declared.length) return [];
  const items = await OBR.scene.items.getItems().catch(() => []);
  const byId = new Map(items.map((item) => [String(item?.id || ""), item]));
  const zones = items.filter((item) => (
    item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root"
  ));
  return declared.map((modifier) => {
    const sourceId = String(modifier?.sourceId || "").trim();
    const source = sourceId ? byId.get(sourceId) : null;
    const sourcePosition = validPoint(source?.position);
    if (!sourcePosition) return null;

    const zoneId = String(modifier?.zoneId || "").trim();
    const instanceId = String(modifier?.instanceId || "").trim();
    const zone = zoneId
      ? byId.get(zoneId)
      : instanceId
        ? zones.find((candidate) => {
          const metadata = candidate?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
          return String(metadata?.instanceId || "").trim() === instanceId
            && (!sourceId || String(metadata?.casterId || "").trim() === sourceId);
        })
        : null;
    if ((zoneId || instanceId) && !zone) return null;
    const area = zone ? translatedZoneArea(zone) : undefined;
    if ((zoneId || instanceId) && !area) return null;
    return {
      ...modifier,
      sourcePosition,
      ...(area ? { area } : {}),
    };
  }).filter(Boolean);
}

function movementResolutionSignature(source) {
  return JSON.stringify({
    activeMode: source?.activeMode,
    climbing: source?.climbing === true,
    speedMeters: source?.speedMeters,
    blocked: source?.blocked,
    conditionSummary: source?.conditionSummary ?? source?.summary,
    prone: source?.prone,
    movementImmunities: source?.movementImmunities || [],
    directionalCostModifiers: source?.directionalCostModifiers || [],
    movementModes: (source?.movementModes || []).map((entry) => [
      entry.id,
      entry.baseSpeedMeters,
      entry.speedMeters,
      entry.blocked,
      entry.summary,
    ]),
  });
}

function applyResolvedMovementState(state, resolved, totalMeters) {
  Object.assign(state, {
    activeMode: resolved.activeMode,
    activeModeLabel: resolved.activeModeLabel,
    movementModes: resolved.movementModes,
    hasMovementModes: resolved.hasMovementModes,
    modeBaseSpeedMeters: resolved.modeBaseSpeedMeters,
    speedMeters: resolved.speedMeters,
    blocked: resolved.blocked,
    blocksSpeedBonuses: resolved.blocksSpeedBonuses,
    conditionSummary: resolved.summary,
    conditionReasons: resolved.reasons,
    prone: resolved.prone,
    movementCostMultiplier: resolved.movementCostMultiplier,
    movementImmunities: resolved.movementImmunities || [],
    directionalCostModifiers: resolved.directionalCostModifiers || [],
    blockedWarningSent: false,
  });
  state.cycle = resolved.speedMeters > 0
    ? Math.floor((totalMeters + 1e-9) / resolved.speedMeters)
    : 0;
  state.cycleMeters = resolved.speedMeters > 0
    ? Math.max(0, totalMeters - (state.cycle * resolved.speedMeters))
    : totalMeters;
}

async function applyConditionSpeedItem(item) {
  if (!movementState || item?.id !== movementState.itemId || movementState.disabled) return;
  const totalMeters = movementTotalMeters(movementState);
  const wasProne = movementState.prone === true;
  const previousMode = movementState.activeMode;
  const climbing = item?.metadata?.[META_KEY]?.[CLIMBING_META_FIELD] === true;
  const resolved = conditionSpeedForItem(
    item,
    movementState.baseSpeedMeters,
    movementState.activeMode,
  );
  const previousSignature = movementResolutionSignature(movementState);
  const nextSignature = movementResolutionSignature({ ...resolved, climbing });
  if (previousSignature === nextSignature) return;

  applyResolvedMovementState(movementState, resolved, totalMeters);
  movementState.climbing = climbing;

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
  if (standingCostMeters > 0 || previousMode !== resolved.activeMode) {
    await persistMovementState(movementState);
  }
}

function persistedMovementPayload(state) {
  return {
    version: SPEED_CHECK_META_VERSION,
    turnKey: String(state?.turnKey || ""),
    totalMeters: Math.round(movementTotalMeters(state) * 1000) / 1000,
    activeMode: String(state?.activeMode || "walk"),
    lastCell: validPoint(state?.lastCell),
    startPosition: validPoint(state?.startPosition),
    startCell: validPoint(state?.startCell),
    startElevation: normalizeElevation(state?.startElevation),
  };
}

function persistedStartElevation(payload) {
  const value = Number(payload?.startElevation);
  return Number.isFinite(value) ? normalizeElevation(value) : null;
}

function persistedMovementSignature(payload) {
  const lastCell = validPoint(payload?.lastCell);
  const startElevation = persistedStartElevation(payload);
  return [
    String(payload?.turnKey || ""),
    Math.round(Math.max(0, Number(payload?.totalMeters) || 0) * 1000) / 1000,
    String(payload?.activeMode || "walk"),
    lastCell?.x ?? "",
    lastCell?.y ?? "",
    validPoint(payload?.startPosition)?.x ?? "",
    validPoint(payload?.startPosition)?.y ?? "",
    validPoint(payload?.startCell)?.x ?? "",
    validPoint(payload?.startCell)?.y ?? "",
    startElevation ?? "",
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
  const resolved = conditionSpeedForItem(
    item,
    movementState.baseSpeedMeters,
    payload.activeMode || movementState.activeMode,
  );
  applyResolvedMovementState(movementState, resolved, totalMeters);
  movementState.climbing = item?.metadata?.[META_KEY]?.[CLIMBING_META_FIELD] === true;
  const storedStartElevation = persistedStartElevation(payload);
  if (storedStartElevation !== null) movementState.startElevation = storedStartElevation;
  movementState.lastCell = validPoint(payload.lastCell) || movementState.lastCell;
  movementState.startPosition = validPoint(payload.startPosition) || movementState.startPosition;
  movementState.startCell = validPoint(payload.startCell) || movementState.startCell;
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

function snapshotElevation(snapshot) {
  return normalizeElevation(snapshot?.item?.metadata?.[META_KEY]?.[ELEVATION_META_FIELD]);
}

function mountSpeedMetadataListener() {
  if (speedMetadataListenerMounted) return;
  speedMetadataListenerMounted = true;
  subscribeSceneItemChanges((event) => {
    if (!movementState?.itemId) return;
    const item = event.items.find((candidate) => candidate?.id === movementState.itemId);
    if (!item) return;
    if (event.flags.speedCheck) applyPersistedMovementItem(item);
    if (event.flags.conditions || event.flags.concentration || event.flags.tracker) {
      void applyConditionSpeedItem(item).catch(() => {});
    }
    for (const record of event.changedRecords || []) {
      const itemId = record?.after?.id || record?.before?.id;
      if (itemId !== movementState.itemId || !record?.before || !record?.after) continue;
      const beforeElevation = snapshotElevation(record.before);
      const afterElevation = snapshotElevation(record.after);
      if (Math.abs(afterElevation - beforeElevation) < 0.001) continue;

      const reset = suppressedElevationResets.get(itemId);
      if (reset?.until <= Date.now()) {
        suppressedElevationResets.delete(itemId);
      } else if (reset && Math.abs(afterElevation - reset.elevation) < 0.001) {
        suppressedElevationResets.delete(itemId);
        continue;
      }

      const rollback = rejectedElevationRollbacks.get(itemId);
      if (rollback?.until <= Date.now()) {
        rejectedElevationRollbacks.delete(itemId);
      } else if (rollback && Math.abs(afterElevation - rollback.elevation) < 0.001) {
        rejectedElevationRollbacks.delete(itemId);
        continue;
      }
      const climbing = record.after.item?.metadata?.[META_KEY]?.[CLIMBING_META_FIELD] === true;
      const verticalMode = movementState.activeMode === "fly"
        ? "fly"
        : climbing ? "climb" : "";
      if (!verticalMode) continue;
      queueSpeedCheckElevationChange({
        id: itemId,
        name: String(record.after.item?.name || movementState.name || "Personaggio"),
        position: validPoint(record.after.item?.position) || validPoint(movementState.lastCell),
        beforeElevation,
        afterElevation,
        activeMode: movementState.activeMode,
        verticalMode,
        climbing,
      });
    }
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
  const persisted = meta?.[SPEED_CHECK_META_FIELD];
  const persistedMatches = String(persisted?.turnKey || "") === turnKey;
  const resolvedSpeed = conditionSpeedForItem(
    item,
    baseSpeedMeters,
    persistedMatches ? persisted.activeMode : "walk",
  );
  if (!resolvedSpeed.hasMovementModes) {
    return { turnKey, itemId: actorId, disabled: true, path: [] };
  }
  const speedMeters = resolvedSpeed.speedMeters;
  const initialPosition = validPoint(item.position);
  const persistedStartPosition = persistedMatches ? validPoint(persisted.startPosition) : null;
  const startPosition = persistedStartPosition || initialPosition;
  const startCell = persistedMatches
    ? validPoint(persisted.startCell) || (persistedStartPosition ? await snapToGridCell(startPosition) : lastCell)
    : lastCell;
  const currentElevation = normalizeElevation(meta?.[ELEVATION_META_FIELD]);
  const storedStartElevation = persistedMatches ? persistedStartElevation(persisted) : null;
  const startElevation = storedStartElevation ?? currentElevation;
  const totalMeters = persistedMatches ? Math.max(0, Number(persisted.totalMeters) || 0) : 0;
  const cycle = speedMeters > 0 ? Math.floor((totalMeters + 1e-9) / speedMeters) : 0;
  return {
    turnKey,
    itemId: actorId,
    disabled: false,
    baseSpeedMeters,
    modeBaseSpeedMeters: resolvedSpeed.modeBaseSpeedMeters,
    speedMeters,
    activeMode: resolvedSpeed.activeMode,
    activeModeLabel: resolvedSpeed.activeModeLabel,
    movementModes: resolvedSpeed.movementModes,
    hasMovementModes: resolvedSpeed.hasMovementModes,
    blocked: resolvedSpeed.blocked,
    blocksSpeedBonuses: resolvedSpeed.blocksSpeedBonuses,
    conditionSummary: resolvedSpeed.summary,
    conditionReasons: resolvedSpeed.reasons,
    prone: resolvedSpeed.prone,
    movementCostMultiplier: resolvedSpeed.movementCostMultiplier,
    movementImmunities: resolvedSpeed.movementImmunities || [],
    directionalCostModifiers: resolvedSpeed.directionalCostModifiers || [],
    climbing: meta?.[CLIMBING_META_FIELD] === true,
    blockedWarningSent: false,
    gridDpi: Math.max(1, Number(gridDpi) || 150),
    cycle,
    cycleMeters: Math.max(0, totalMeters - (cycle * speedMeters)),
    dashCount: 0,
    bonusMeters: 0,
    name: String(item.name || "Personaggio").trim() || "Personaggio",
    portrait: portraitUrl(item),
    startPosition,
    startCell,
    startElevation,
    lastCell: persistedMatches ? validPoint(persisted.lastCell) || lastCell : lastCell,
    path: [],
    persistedSignature: persistedMatches ? persistedMovementSignature(persisted) : "",
    needsBaselinePersist: !persistedMatches
      || !persistedStartPosition
      || !validPoint(persisted.startCell)
      || storedStartElevation === null,
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

export function prewarmSpeedCheckTurn(state) {
  const next = resolveSpeedCheckTurn(state);
  if (!processorEnabled || !speedCheckEnabled || !next.turnKey) return;
  if (next.turnKey === currentTurn?.turnKey) {
    movementStatePrefetch = null;
    return;
  }
  if (movementStatePrefetch?.turnKey === next.turnKey) return;
  const promise = loadMovementState(next).catch((error) => {
    console.warn("[speed-check] turn prefetch:", error?.message || error);
    return null;
  });
  movementStatePrefetch = { turnKey: next.turnKey, promise };
}

export function syncSpeedCheckTurn(state) {
  const next = resolveSpeedCheckTurn(state);
  const changed = !next.turnKey || next.turnKey !== currentTurn?.turnKey;
  if (changed) {
    const prefetched = movementStatePrefetch?.turnKey === next.turnKey
      ? movementStatePrefetch
      : null;
    movementState = null;
    movementStatePromise = prefetched
      ? { turnKey: prefetched.turnKey, promise: prefetched.promise }
      : null;
    movementStatePrefetch = null;
  }
  currentTurn = next.turnKey ? next : null;
  if (changed && processorEnabled) {
    notifyMovementState();
    if (speedCheckEnabled && currentTurn) {
      void ensureMovementState({ ...currentTurn }).catch(() => {});
    }
  } else if (changed) {
    remoteMovementSnapshot = null;
    emitMovementSnapshot(buildSpeedCheckSnapshot(currentTurn, true, movementLimitEnabled));
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
  if (speedCheckEnabled) {
    void ensureSpeedCheckMovementState().catch((error) => {
      console.warn("[speed-check] initial state:", error?.message || error);
    });
  }
}

export function setSpeedCheckEnabled(enabled) {
  const next = !!enabled;
  if (speedCheckEnabled === next) return;
  speedCheckEnabled = next;
  movementState = null;
  movementStatePromise = null;
  movementStatePrefetch = null;
  trackedDrags.clear();
  notifyMovementState();
  if (next) {
    void ensureSpeedCheckMovementState().catch((error) => {
      console.warn("[speed-check] state activation:", error?.message || error);
    });
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

async function ensureSpeedCheckMovementState() {
  if (!speedCheckEnabled) return null;
  const turn = await readSpeedCheckTurn();
  if (!turn || !speedCheckEnabled) return null;
  return ensureMovementState({ ...turn });
}


async function processSpeedCheckMovement(movement, turn) {
  if (!speedCheckEnabled) return;
  const { actorId, turnKey } = turn || {};
  if (!actorId || !turnKey) return;
  if (currentTurn?.turnKey !== turnKey || movement?.id !== actorId) return;

  const state = await ensureMovementState(turn);
  if (!state || state.disabled || currentTurn?.turnKey !== turnKey) return;

  const verticalMode = String(
    movement?.verticalMode
      || (movement?.activeMode === "fly" ? "fly" : ""),
  ).trim().toLocaleLowerCase("it");
  const verticalMovement = movement?.kind === "elevation"
    && Number(movement?.verticalCells) > 0
    && (verticalMode === "fly" || verticalMode === "climb");
  if (verticalMovement && verticalMode === "fly" && state.activeMode !== "fly") return;
  if (verticalMovement && verticalMode === "climb" && state.climbing !== true) return;
  const beforeCell = state.lastCell || movement?.beforeCell;
  const afterCell = verticalMovement ? beforeCell : movement?.afterCell;
  const rawBefore = validPoint(movement?.beforePosition);
  const rawAfter = verticalMovement ? rawBefore : validPoint(movement?.afterPosition);
  if (!beforeCell || !afterCell || !rawBefore || !rawAfter) return;

  const sample = { ...movement, beforeCell, afterCell };
  let movedCells;
  if (verticalMovement) {
    movedCells = Math.max(0, Number(movement.verticalCells) || 0);
  } else {
    try {
      const measured = await OBR.scene.grid.getDistance(beforeCell, afterCell);
      movedCells = Number.isFinite(measured) && measured >= 0
        ? Number(measured)
        : measureSquareGridCells(beforeCell, afterCell, state.gridDpi);
    } catch {
      movedCells = measureSquareGridCells(beforeCell, afterCell, state.gridDpi);
    }
  }
  if (movedCells < 0.001) return;

  const toolUndoIndex = movement?.undo === true && movement?.toolDragId
    ? state.path.findIndex((segment) => segment.toolDragId === movement.toolDragId)
    : -1;
  const reverseIndex = verticalMovement
    ? -1
    : toolUndoIndex >= 0 ? toolUndoIndex : reversedPathStart(state.path, sample);
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

  const directionalModifiers = verticalMovement
    ? []
    : await liveDirectionalMovementModifiers(state);
  const climbingMovement = verticalMovement
    ? verticalMode === "climb"
    : state.climbing === true;
  const movementCost = movementCostForSegment({
    movedCells,
    beforePosition: rawBefore,
    afterPosition: rawAfter,
    baseMultiplier: Math.max(1, Number(state.movementCostMultiplier) || 1)
      * (climbingMovement
        ? climbingMovementCostMultiplier(state.climbing, state.movementModes)
        : 1),
    directionalModifiers,
  });
  const chargedCells = movementCost.chargedCells;
  const beforeSnapshot = buildSpeedCheckSnapshot(state, true, movementLimitEnabled);
  const rejection = limitedMovementRejection(beforeSnapshot, chargedCells);
  if (rejection) {
    if (verticalMovement) {
      const rollbackElevation = normalizeElevation(movement.beforeElevation);
      rejectedElevationRollbacks.set(state.itemId, {
        elevation: rollbackElevation,
        until: Date.now() + 2500,
      });
      await OBR.scene.items.updateItems([state.itemId], (drafts) => {
        for (const item of drafts) {
          const previous = { ...(item.metadata?.[META_KEY] || {}) };
          item.metadata = {
            ...(item.metadata || {}),
            [META_KEY]: { ...previous, [ELEVATION_META_FIELD]: rollbackElevation },
          };
        }
      });
    } else {
      const rollbackPosition = { ...rawBefore };
      rejectedMovementRollbacks.set(state.itemId, {
        position: rollbackPosition,
        until: Date.now() + 2500,
      });
      suppressMovementHistory(state.itemId, rollbackPosition, 2500);
      await OBR.scene.items.updateItems([state.itemId], (drafts) => {
        for (const item of drafts) item.position = { ...rollbackPosition };
      });
    }
    notifyMovementState();
    if (rejection.blocked) state.blockedWarningSent = true;
    await broadcastSpeedWarning({
      blocked: rejection.blocked,
      reason: rejection.blocked ? state.conditionSummary : "",
      name: state.name,
      portrait: state.portrait,
      speedMeters: rejection.blocked ? 0 : state.speedMeters,
      limitMeters: beforeSnapshot.allowanceMeters,
      cycle: beforeSnapshot.cycle,
      cyclesCrossed: 1,
      turnKey,
    });
    return;
  }
  const next = advanceSpeedCycle(state, chargedCells, state.speedMeters);
  Object.assign(state, next);
  if (!verticalMovement) {
    state.path.push({
      beforeCell: { ...beforeCell },
      afterCell: { ...afterCell },
      cells: chargedCells,
      baseCells: movementCost.baseCells,
      directionalCells: movementCost.directionalCells,
      toolDragId: movement?.toolDragId || "",
    });
    state.lastCell = afterCell;
  }
  if (state.path.length > MAX_MOVEMENT_SEGMENTS) {
    state.path.splice(0, state.path.length - MAX_MOVEMENT_SEGMENTS);
  }
  const afterSnapshot = buildSpeedCheckSnapshot(state, true, movementLimitEnabled);
  if (state.blocked && state.speedMeters <= 0) {
    notifyMovementState();
    const persistTask = sample.toolSynthetic ? null : persistMovementState(state);
    state.blockedWarningSent = true;
    await broadcastSpeedWarning({
      blocked: true,
      reason: state.conditionSummary,
      name: state.name,
      portrait: state.portrait,
      speedMeters: 0,
      limitMeters: 0,
      cycle: 0,
      cyclesCrossed: 1,
      turnKey,
    });
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
  const overAllowance = afterSnapshot.totalMeters > afterSnapshot.allowanceMeters + 1e-9;
  if (!overAllowance) {
    if (persistTask) await persistTask;
    return;
  }

  await broadcastSpeedWarning({
    name: state.name,
    portrait: state.portrait,
    speedMeters: state.speedMeters,
    limitMeters: afterSnapshot.allowanceMeters,
    cycle: next.cycle,
    cyclesCrossed: Math.max(1, limitCrossings),
    turnKey,
  });
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

function queueSpeedCheckElevationChange(change) {
  if (!processorEnabled || !speedCheckEnabled) return movementQueue;
  const turnPromise = currentTurn?.turnKey
    ? Promise.resolve({ ...currentTurn })
    : readSpeedCheckTurn();
  const run = async () => {
    const turn = await turnPromise;
    const state = await ensureMovementState(turn);
    if (!state || state.disabled) return;
    const verticalMode = state.activeMode === "fly"
      ? "fly"
      : state.climbing === true ? "climb" : "";
    if (!verticalMode) return;
    const scale = await OBR.scene.grid.getScale()
      .catch(() => ({ parsed: { multiplier: SPEED_CHECK_METERS_PER_CELL } }));
    const verticalCells = elevationMovementCells(
      change.beforeElevation,
      change.afterElevation,
      scale?.parsed?.multiplier,
      verticalMode,
    );
    if (verticalCells < 0.001) return;
    const position = validPoint(change.position) || validPoint(state.lastCell);
    if (!position) return;
    await processSpeedCheckMovement({
      id: change.id,
      name: change.name,
      kind: "elevation",
      activeMode: change.activeMode,
      verticalMode,
      climbing: verticalMode === "climb",
      verticalCells,
      beforeElevation: change.beforeElevation,
      afterElevation: change.afterElevation,
      beforePosition: position,
      afterPosition: position,
      beforeCell: state.lastCell || position,
      afterCell: state.lastCell || position,
    }, turn);
  };
  movementQueue = movementQueue.then(run, run);
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

export function setSpeedCheckMovementMode(mode) {
  const requestedMode = String(mode || "").trim().toLocaleLowerCase("it");
  const changeMode = async () => {
    const state = movementState;
    if (!state || state.disabled || state.activeMode === requestedMode) return;
    const selected = state.movementModes?.find((entry) => entry.id === requestedMode);
    if (!selected) return;

    const totalMeters = movementTotalMeters(state);
    Object.assign(state, {
      activeMode: selected.id,
      activeModeLabel: selected.label,
      modeBaseSpeedMeters: selected.baseSpeedMeters,
      speedMeters: selected.speedMeters,
      blocked: selected.blocked,
      blocksSpeedBonuses: selected.blocksSpeedBonuses,
      conditionSummary: selected.summary,
      conditionReasons: selected.reasons,
      movementImmunities: selected.movementImmunities || [],
      directionalCostModifiers: selected.directionalCostModifiers || [],
      blockedWarningSent: false,
    });
    state.cycle = selected.speedMeters > 0
      ? Math.floor((totalMeters + 1e-9) / selected.speedMeters)
      : 0;
    state.cycleMeters = selected.speedMeters > 0
      ? Math.max(0, totalMeters - (state.cycle * selected.speedMeters))
      : totalMeters;
    notifyMovementState();
    await persistMovementState(state);
  };
  movementQueue = movementQueue.then(changeMode, changeMode);
  void movementQueue.catch((error) =>
    console.warn("[speed-check] movement mode:", error?.message || error)
  );
}

export function resetSpeedCheckMovement() {
  movementStatePromise = null;
  movementStatePrefetch = null;
  trackedDrags.clear();
  const reset = async () => {
    if (movementState && !movementState.disabled) {
      const state = movementState;
      state.cycle = 0;
      state.cycleMeters = 0;
      state.dashCount = 0;
      state.bonusMeters = 0;
      state.path = [];
      state.lastCell = validPoint(state.startCell) || state.lastCell;

      const startPosition = validPoint(state.startPosition);
      const startElevation = normalizeElevation(state.startElevation);
      if (startPosition) suppressMovementHistory(state.itemId, startPosition);
      rejectedElevationRollbacks.delete(state.itemId);
      suppressedElevationResets.set(state.itemId, {
        elevation: startElevation,
        until: Date.now() + 2500,
      });
      await OBR.scene.items.updateItems([state.itemId], (drafts) => {
        for (const item of drafts) {
          if (startPosition) item.position = { ...startPosition };
          const previous = { ...(item.metadata?.[META_KEY] || {}) };
          item.metadata = {
            ...(item.metadata || {}),
            [META_KEY]: { ...previous, [ELEVATION_META_FIELD]: startElevation },
          };
        }
      });
      notifyMovementState();
      await persistMovementState(state);
      return;
    }

    movementState = null;
    notifyMovementState();
    if (processorEnabled && speedCheckEnabled && currentTurn) {
      await ensureMovementState({ ...currentTurn });
    }
  };
  movementQueue = movementQueue.then(reset, reset);
  void movementQueue.catch((error) => console.warn("[speed-check] reset movement:", error?.message || error));
}

export function mountSpeedWarningBroadcast() {
  if (warningLayerPromise) return warningLayerPromise;
  warningLayerPromise = (async () => {
    await startRuntimeOptions().catch(() => {});
    await Promise.all([
      OBR.modal.close(SPEED_WARNING_MODAL_ID).catch(() => {}),
      OBR.popover.close(SPEED_WARNING_MODAL_ID).catch(() => {}),
    ]);
    let warningPumpRunning = false;
    let warningPumpRequested = false;
    let pendingWarning = null;
    let renderRevision = 0;
    let movementReminderEnabled = isMovementReminderEnabled();
    runtimeOptionsService.subscribe(
      selectMovementReminderEnabled,
      (enabled) => {
        movementReminderEnabled = enabled !== false;
        if (movementReminderEnabled) return;
        pendingWarning = null;
        warningPumpRequested = false;
        renderRevision += 1;
        void OBR.popover.close(SPEED_WARNING_MODAL_ID).catch(() => {});
      },
      { emitCurrent: false },
    );

    const openWarning = async (warning) => {
      const revision = ++renderRevision;
      let viewportWidth = 1200;
      let viewportHeight = 800;
      const [reportedWidth, reportedHeight] = await Promise.all([
        OBR.viewport.getWidth().catch(() => viewportWidth),
        OBR.viewport.getHeight().catch(() => viewportHeight),
      ]);
      if (!movementReminderEnabled || revision !== renderRevision) return;
      viewportWidth = Number(reportedWidth) || viewportWidth;
      viewportHeight = Number(reportedHeight) || viewportHeight;
      const cardWidth = Math.min(500, Math.max(312, viewportWidth - 40));
      const width = cardWidth + 8;
      const top = Math.max(12, Math.round(viewportHeight * 0.09));
      const payload = encodeURIComponent(JSON.stringify(warning));
      await OBR.popover.close(SPEED_WARNING_MODAL_ID).catch(() => {});
      if (!movementReminderEnabled || revision !== renderRevision) return;
      await OBR.popover.open({
        id: SPEED_WARNING_MODAL_ID,
        url: `/speed-warning.html?payload=${payload}`,
        width,
        height: 122,
        anchorReference: "POSITION",
        anchorPosition: { left: viewportWidth / 2, top: Math.max(8, top - 4) },
        anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
        transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
        hidePaper: true,
        disableClickAway: true,
        marginThreshold: 12,
      });
    };

    const requestWarningPump = () => {
      warningPumpRequested = true;
      if (warningPumpRunning) return;
      warningPumpRunning = true;
      const run = async () => {
        try {
          while (warningPumpRequested) {
            warningPumpRequested = false;
            const warning = pendingWarning;
            pendingWarning = null;
            if (movementReminderEnabled && warning) await openWarning(warning);
          }
        } catch (error) {
          console.warn("[speed-check] warning popover:", error?.message || error);
        } finally {
          warningPumpRunning = false;
          if (warningPumpRequested) requestWarningPump();
        }
      };
      void run();
    };

    OBR.broadcast.onMessage(SPEED_WARNING_CHANNEL, (event) => {
      if (event?.data?.type !== "show-speed-warning") return;
      if (!movementReminderEnabled) return;
      pendingWarning = { ...event.data };
      requestWarningPump();
    });
  })().catch((error) => {
    warningLayerPromise = null;
    throw error;
  });
  return warningLayerPromise;
}
