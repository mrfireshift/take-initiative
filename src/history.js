import OBR from "@owlbear-rodeo/sdk";
import { ID, REMINDER_HISTORY_REARM_CHANNEL } from "./constants.js";
import {
  readSceneItemsSnapshot,
  subscribeSceneItemChanges,
} from "./sceneItemEvents.js";
import { recordCombatUndo, recordNativeMovementUndo } from "./combatLog.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  runSceneEpochSteps,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import {
  requestHistoryOwnerAppend,
  requestHistoryOwnerRemove,
} from "./historyOwner.js";
import {
  evaluateHistoryUndoReadiness,
  malformedHistoryEntryIds,
} from "./historyUndoCleanupCore.js";
import { historyEntryMatchesUndoBefore } from "./historyUndoCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;
const HISTORY_KEY = `${ID}/history`;
const HISTORY_CONTROL_CHANNEL = `${ID}/history-control`;
const HISTORY_CONTROL_ACK_CHANNEL = `${ID}/history-control-ack`;
const CONCENTRATION_WARNING_CHANNEL = `${ID}/concentration-warning`;
const HISTORY_VERSION = 1;
const MAX_HISTORY_ENTRIES = 30;
const MOVEMENT_SETTLE_MS = 350;
const SCENE_HISTORY_SUPPRESS_MS = 2000;
const HISTORY_PENDING_UNDO_WAIT_MS = 1500;
const HISTORY_PENDING_UNDO_RECHECK_MS = 100;
const INITIATIVE_HISTORY_FIELDS = ["inInitiative", "initiative", "attitude"];
const EFFECTS_HISTORY_FIELDS = ["conditions", "spells", "concentrations"];

let __historyActionQueue = Promise.resolve();
let __historyAppendRetryTimer = null;
let __historyAppendRetryQueue = Promise.resolve();
let __historyRemovalRetryTimer = null;
let __historyRemovalRetryQueue = Promise.resolve();
let __movementWatcherMounted = false;
let __sceneHistoryWatcherMounted = false;
let __movementFlushTimer = null;
let __historyRestoreSuppressedUntil = 0;
const __movementPositions = new Map();
const __pendingMovements = new Map();
const __suppressedMovements = new Map();
const __sceneHistorySnapshot = new Map();
const __historyRestoreSuppressedIds = new Map();
const __pendingHistoryAppends = new Map();
const __pendingHistoryRemovals = new Map();
const __undoCombatLogCommands = new Set();
const __movementSegmentListeners = new Set();
let __sceneHistoryBaselineEpoch = null;
let __sceneEpochUnsubscribe = null;
let __movementFlushEpoch = null;

// Stateless high-resolution action time. `performance.timeOrigin + now()` is
// comparable across the plugin's browser realms and survives retry because it
// is stored on the immutable History entry. There is deliberately no realm-
// local monotonic counter here.
export function createActionTimestamp() {
  try {
    const origin = Number(globalThis.performance?.timeOrigin);
    const now = Number(globalThis.performance?.now?.());
    if (Number.isFinite(origin) && Number.isFinite(now)) return origin + now;
  } catch {}
  return Date.now();
}

// Legacy test/API compatibility only; production ordering never reads `seq`.
export function nextHistorySequence() {
  return createActionTimestamp();
}

export async function flushPendingHistoryRemovals(sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch) || !__pendingHistoryRemovals.size) return;
  for (const [commandId, pending] of [...__pendingHistoryRemovals]) {
    if (!isCurrentSceneEpoch(pending.sceneEpoch)) {
      __pendingHistoryRemovals.delete(commandId);
      continue;
    }
    try {
      await requestHistoryOwnerRemove(pending.ids, {
        sceneEpoch: pending.sceneEpoch,
        commandId,
        correlationId: pending.correlationId,
      });
      __pendingHistoryRemovals.delete(commandId);
    } catch (error) {
      pending.attempts = (pending.attempts || 0) + 1;
    }
  }
}

function pendingHistoryRemovalRecords(sceneEpoch = currentSceneEpoch()) {
  return [...__pendingHistoryRemovals.entries()].filter(([, pending]) => (
    pending?.sceneEpoch === sceneEpoch
    && isCurrentSceneEpoch(pending.sceneEpoch)
  ));
}

function pendingHistoryRemovalIds(sceneEpoch = currentSceneEpoch()) {
  return [...new Set(
    pendingHistoryRemovalRecords(sceneEpoch)
      .flatMap(([, pending]) => Array.isArray(pending?.ids) ? pending.ids : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  )];
}

async function convergePendingHistoryRemovals(sceneEpoch = currentSceneEpoch()) {
  const pending = pendingHistoryRemovalRecords(sceneEpoch);
  if (!pending.length) return { converged: true, pendingIds: [] };

  const pendingIds = pendingHistoryRemovalIds(sceneEpoch);
  await flushPendingHistoryRemovals(sceneEpoch);
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return { converged: false, pendingIds };
  }

  let removed = false;
  try {
    removed = await waitForHistoryEntriesRemoved(pendingIds, { sceneEpoch });
  } catch {}
  if (removed) {
    for (const [commandId, record] of pendingHistoryRemovalRecords(sceneEpoch)) {
      const recordIds = Array.isArray(record?.ids) ? record.ids : [];
      if (recordIds.every((id) => pendingIds.includes(id))) {
        __pendingHistoryRemovals.delete(commandId);
      }
    }
    return { converged: true, pendingIds: [] };
  }

  // An owner acknowledgement can race with the read-back. Keep a durable
  // barrier record in that case; a later Undo must never treat the visible
  // entry as a fresh target until the owner state is confirmed.
  for (const [commandId, record] of pending) {
    if (!__pendingHistoryRemovals.has(commandId) && isCurrentSceneEpoch(sceneEpoch)) {
      __pendingHistoryRemovals.set(commandId, {
        ...record,
        ids: Array.isArray(record?.ids) ? [...record.ids] : [],
      });
    }
  }
  scheduleHistoryRemovalRetry();
  return {
    converged: false,
    pendingIds: pendingHistoryRemovalIds(sceneEpoch),
  };
}

export async function flushPendingHistoryAppends(sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch) || !__pendingHistoryAppends.size) return;
  for (const [entryId, pending] of [...__pendingHistoryAppends]) {
    if (!isCurrentSceneEpoch(pending.sceneEpoch)) {
      __pendingHistoryAppends.delete(entryId);
      continue;
    }
    try {
      await requestHistoryOwnerAppend(pending.entry, {
        sceneEpoch: pending.sceneEpoch,
        commandId: pending.commandId,
        correlationId: pending.correlationId,
      });
      __pendingHistoryAppends.delete(entryId);
    } catch (error) {
      pending.attempts = (pending.attempts || 0) + 1;
      pending.lastError = error;
      if (!retryableHistoryOwnerError(error)) {
        __pendingHistoryAppends.delete(entryId);
      }
    }
  }
}

export function hasPendingHistoryAppends(sceneEpoch = currentSceneEpoch()) {
  if (!__pendingHistoryAppends.size) return false;
  return [...__pendingHistoryAppends.values()].some((p) => (
    !sceneEpoch || isCurrentSceneEpoch(p.sceneEpoch)
  ));
}

async function waitForHistoryPendingUndoConvergence(
  sceneEpoch,
  {
    flushPendingEffectsHistory,
    hasPendingEffectsHistory,
    hasPendingEffectsHistoryAuthoritative,
  } = {},
) {
  const deadline = Date.now() + HISTORY_PENDING_UNDO_WAIT_MS;
  while (isCurrentSceneEpoch(sceneEpoch)) {
    const localPending = hasPendingHistoryAppends(sceneEpoch)
      || hasPendingEffectsHistory(sceneEpoch);
    if (localPending) {
      void flushPendingHistoryAppends(sceneEpoch).catch(() => {});
      try {
        flushPendingEffectsHistory(sceneEpoch);
      } catch {}
    }

    let authoritativePending = localPending;
    if (!localPending) {
      try {
        authoritativePending = await hasPendingEffectsHistoryAuthoritative(sceneEpoch);
      } catch {
        authoritativePending = true;
      }
    }
    const stillLocalPending = hasPendingHistoryAppends(sceneEpoch)
      || hasPendingEffectsHistory(sceneEpoch);
    if (!stillLocalPending && !authoritativePending) return true;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(HISTORY_PENDING_UNDO_RECHECK_MS, remaining));
    });
  }
  return false;
}

function replaceSceneHistorySnapshot(items = []) {
  __sceneHistorySnapshot.clear();
  for (const item of items || []) {
    if (item?.id) __sceneHistorySnapshot.set(item.id, cloneValue(item));
  }
}

function resetSceneHistoryRuntime(epoch) {
  if (__movementFlushTimer) clearTimeout(__movementFlushTimer);
  if (__historyAppendRetryTimer) clearTimeout(__historyAppendRetryTimer);
  if (__historyRemovalRetryTimer) clearTimeout(__historyRemovalRetryTimer);
  __movementFlushTimer = null;
  __historyAppendRetryTimer = null;
  __historyRemovalRetryTimer = null;
  __historyAppendRetryQueue = Promise.resolve();
  __historyRemovalRetryQueue = Promise.resolve();
  __movementFlushEpoch = null;
  __historyActionQueue = Promise.resolve();
  __movementPositions.clear();
  __pendingMovements.clear();
  __suppressedMovements.clear();
  __sceneHistorySnapshot.clear();
  __historyRestoreSuppressedIds.clear();
  __pendingHistoryAppends.clear();
  __pendingHistoryRemovals.clear();
  __undoCombatLogCommands.clear();
  __historyRestoreSuppressedUntil = 0;
  __sceneHistoryBaselineEpoch = epoch;
}

async function acquireSceneHistoryBaseline(epoch) {
  if (!isCurrentSceneEpoch(epoch) || __sceneHistoryBaselineEpoch !== epoch) return;
  const items = await OBR.scene.items.getItems();
  if (!isCurrentSceneEpoch(epoch) || __sceneHistoryBaselineEpoch !== epoch) return;
  replaceSceneHistorySnapshot(items);
  __sceneHistoryBaselineEpoch = null;
}

function mountSceneEpochHistoryLifecycle() {
  if (__sceneEpochUnsubscribe) return;
  __sceneEpochUnsubscribe = subscribeSceneEpoch(({ phase, epoch }) => {
    if (phase === "unload") {
      resetSceneHistoryRuntime(epoch);
      return;
    }
    void acquireSceneHistoryBaseline(epoch).catch((error) => {
      console.warn("[history] scene baseline:", error?.message || error);
    });
  });
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createEntryId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentRoomId() {
  return String(OBR.room?.id || "").trim();
}

function normalizeHistory(value) {
  const root = value && typeof value === "object" ? value : {};
  const roomId = currentRoomId();
  const storedRoomId = String(root.roomId || "").trim();
  const entries = roomId && storedRoomId !== roomId
    ? []
    : (Array.isArray(root.entries) ? root.entries.filter(Boolean) : []);
  return {
    ...root,
    version: HISTORY_VERSION,
    ...(roomId ? { roomId } : {}),
    entries: entries.slice(-MAX_HISTORY_ENTRIES),
  };
}

function snapshotFields(meta, fields) {
  const values = {};
  for (const field of fields) {
    const present = Object.prototype.hasOwnProperty.call(meta, field);
    values[field] = present
      ? { present: true, value: cloneValue(meta[field]) }
      : { present: false };
  }
  return values;
}

async function captureItems(itemIds, fields) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  if (!ids.length) return [];

  const items = await OBR.scene.items.getItems(ids);
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) return null;
    const meta = item.metadata?.[META_KEY] || {};
    return {
      id,
      name: String(item.name || "").trim() || "Token",
      values: snapshotFields(meta, fields),
    };
  }).filter(Boolean);
}

async function captureSceneItems(itemIds) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  if (!ids.length) return [];
  const items = await OBR.scene.items.getItems(ids);
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => ({
    id,
    item: byId.has(id) ? cloneValue(byId.get(id)) : null,
  }));
}

function sameValues(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function itemPosition(item) {
  const x = Number(item?.position?.x);
  const y = Number(item?.position?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function samePosition(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function markHistoryRestoreSuppressed(ids, requestedUntil = 0) {
  const until = Math.max(Date.now() + SCENE_HISTORY_SUPPRESS_MS, Number(requestedUntil) || 0);
  __historyRestoreSuppressedUntil = Math.max(__historyRestoreSuppressedUntil, until);
  for (const id of ids || []) {
    if (id) __historyRestoreSuppressedIds.set(id, until);
  }
}

function consumeHistoryRestoreSuppression(id) {
  if (!id) return false;
  const until = __historyRestoreSuppressedIds.get(id);
  if (!until) return false;
  if (until < Date.now()) {
    __historyRestoreSuppressedIds.delete(id);
    return false;
  }
  __historyRestoreSuppressedIds.delete(id);
  return true;
}

function isTrackableSceneToken(item) {
  return item?.layer === "CHARACTER" && !item?.attachedTo;
}

function sceneTokenHistoryChange(previous, next) {
  if (!previous && !isTrackableSceneToken(next)) return null;
  if (!next && !isTrackableSceneToken(previous)) return null;

  const item = next || previous;
  const name = String(item?.name || "Token").trim() || "Token";
  if (!previous) {
    return {
      id: item.id,
      name,
      kind: "scene-add",
      label: `Token aggiunto: ${name}`,
      change: {
        id: item.id,
        name,
        sceneBefore: null,
        sceneAfter: cloneValue(next),
      },
    };
  }
  if (!next) {
    return {
      id: item.id,
      name,
      kind: "scene-remove",
      label: `Token rimosso: ${name}`,
      change: {
        id: item.id,
        name,
        sceneBefore: cloneValue(previous),
        sceneAfter: null,
      },
    };
  }

  const previousMeta = previous.metadata?.[META_KEY] || {};
  const nextMeta = next.metadata?.[META_KEY] || {};
  const previousInInitiative = previousMeta.inInitiative === true;
  const nextInInitiative = nextMeta.inInitiative === true;
  if (previousInInitiative === nextInInitiative) return null;

  const fields = INITIATIVE_HISTORY_FIELDS.filter((field) =>
    !sameValues(
      snapshotFields(previousMeta, [field]),
      snapshotFields(nextMeta, [field])
    )
  );
  if (!fields.length) return null;
  return {
    id: item.id,
    name,
    kind: nextInInitiative ? "initiative-add" : "initiative-remove",
    label: nextInInitiative
      ? `Aggiunto all'iniziativa: ${name}`
      : `Rimosso dall'iniziativa: ${name}`,
    change: {
      id: item.id,
      name,
      before: snapshotFields(previousMeta, fields),
      after: snapshotFields(nextMeta, fields),
    },
  };
}

async function appendSceneHistoryChanges(changes, sceneEpoch = currentSceneEpoch()) {
  if (!changes.length || !isCurrentSceneEpoch(sceneEpoch)) return;
  const labels = changes.map((change) => change.label);
  const kinds = new Set(changes.map((change) => change.kind));
  const label = labels.length === 1
    ? labels[0]
    : `${labels[0]} (+${labels.length - 1} eventi)`;
  const entry = {
    id: createEntryId(),
    version: HISTORY_VERSION,
    at: createActionTimestamp(),
    kind: kinds.size === 1 ? [...kinds][0] : "scene",
    label,
    changes: changes.map((change) => change.change),
  };
  const task = __historyActionQueue.then(
    () => appendEntry(entry, { sceneEpoch }),
    () => appendEntry(entry, { sceneEpoch }),
  );
  __historyActionQueue = task.catch(() => {});
  await task;
}

export async function mountSceneHistoryWatcher() {
  if (__sceneHistoryWatcherMounted) return;
  if (await OBR.player.getRole() !== "GM") return;
  __sceneHistoryWatcherMounted = true;
  mountSceneEpochHistoryLifecycle();
  const initialEpoch = currentSceneEpoch();
  __sceneHistoryBaselineEpoch = initialEpoch;

  subscribeSceneItemChanges(async (event) => {
    const eventEpoch = event?.sceneEpoch ?? currentSceneEpoch();
    if (!isCurrentSceneEpoch(eventEpoch)) return;
    const currentItems = Array.isArray(event?.allItems) ? event.allItems : [];
    if (__sceneHistoryBaselineEpoch === eventEpoch) {
      replaceSceneHistorySnapshot(currentItems);
      __sceneHistoryBaselineEpoch = null;
      return;
    }
    const currentById = new Map(currentItems.filter((item) => item?.id).map((item) => [item.id, item]));
    const pending = [];

    if (Date.now() >= __historyRestoreSuppressedUntil) {
      for (const item of event?.items || []) {
        if (consumeHistoryRestoreSuppression(item?.id)) continue;
        const change = sceneTokenHistoryChange(__sceneHistorySnapshot.get(item?.id), item);
        if (change) pending.push(change);
      }
      for (const item of event?.removedItems || []) {
        if (consumeHistoryRestoreSuppression(item?.id)) continue;
        const change = sceneTokenHistoryChange(__sceneHistorySnapshot.get(item?.id) || item, null);
        if (change) pending.push(change);
      }
    }

    replaceSceneHistorySnapshot(currentById.values());
    if (pending.length) await appendSceneHistoryChanges(pending, eventEpoch);
  }, {
    filter: (event) => event.flags.added || event.flags.removed || event.flags.tracker,
  });

  void acquireSceneHistoryBaseline(initialEpoch).catch((error) => {
    console.warn("[history] initial scene baseline:", error?.message || error);
  });
}

function retryableHistoryOwnerError(error) {
  const code = String(error?.code || error?.result?.reason || "").trim();
  return ![
    "stale-scene",
    "stale-scene-identity",
    "history-entry-conflict",
    "entry-id-payload-mismatch",
  ].includes(code);
}

function scheduleHistoryAppendRetry(delayMs = 250) {
  if (__historyAppendRetryTimer || !__pendingHistoryAppends.size) return;
  __historyAppendRetryTimer = setTimeout(() => {
    __historyAppendRetryTimer = null;
    const run = async () => {
      for (const [entryId, pending] of [...__pendingHistoryAppends]) {
        if (!isCurrentSceneEpoch(pending.sceneEpoch)) {
          __pendingHistoryAppends.delete(entryId);
          continue;
        }
        try {
          await requestHistoryOwnerAppend(pending.entry, {
            sceneEpoch: pending.sceneEpoch,
            commandId: pending.commandId,
            correlationId: pending.correlationId,
          });
          __pendingHistoryAppends.delete(entryId);
        } catch (error) {
          pending.attempts += 1;
          pending.lastError = error;
          if (!retryableHistoryOwnerError(error)) {
            __pendingHistoryAppends.delete(entryId);
            console.warn("[history] append retry stopped:", error?.message || error);
          }
        }
      }
    };
    __historyAppendRetryQueue = __historyAppendRetryQueue.then(run, run);
    __historyAppendRetryQueue.catch(() => {}).finally(() => {
      if (__pendingHistoryAppends.size) scheduleHistoryAppendRetry(750);
    });
  }, Math.max(50, Number(delayMs) || 0));
}

function queueHistoryAppendRetry(entry, {
  sceneEpoch,
  commandId,
  correlationId,
  error,
} = {}) {
  const entryId = String(entry?.id || "").trim();
  if (!entryId || !isCurrentSceneEpoch(sceneEpoch)) return false;
  const existing = __pendingHistoryAppends.get(entryId);
  __pendingHistoryAppends.set(entryId, {
    entry: cloneValue(entry),
    sceneEpoch,
    commandId,
    correlationId,
    attempts: Number(existing?.attempts) || 0,
    lastError: error || existing?.lastError || null,
  });
  scheduleHistoryAppendRetry();
  return true;
}

async function appendEntryNow(
  entry,
  sceneEpoch,
  {
    commandId = undefined,
    correlationId = undefined,
    ownerSceneEpoch = currentSceneEpoch(),
    isCurrent = (candidateEpoch) => isCurrentSceneEpoch(candidateEpoch),
    retryOnFailure = true,
  } = {},
) {
  if (!isCurrent(sceneEpoch)) return false;
  const stableCommandId = commandId
    || `history-append:${ownerSceneEpoch}:${String(entry?.id || "missing")}`;
  const stableCorrelationId = correlationId || stableCommandId;
  try {
    const result = await requestHistoryOwnerAppend(entry, {
      sceneEpoch: ownerSceneEpoch,
      commandId: stableCommandId,
      correlationId: stableCorrelationId,
    });
    __pendingHistoryAppends.delete(String(entry?.id || ""));
    return result;
  } catch (error) {
    const retryEntry = error?.historyEntry || entry;
    const queued = retryOnFailure
      && retryableHistoryOwnerError(error)
      && queueHistoryAppendRetry(retryEntry, {
        sceneEpoch: ownerSceneEpoch,
        commandId: stableCommandId,
        correlationId: stableCorrelationId,
        error,
      });
    if (queued && error && typeof error === "object") error.historyRetryPending = true;
    throw error;
  }
}

function appendEntry(
  entry,
  {
    sceneEpoch = currentSceneEpoch(),
    commandId = undefined,
    correlationId = undefined,
    ownerSceneEpoch = currentSceneEpoch(),
    isCurrent = (candidateEpoch) => isCurrentSceneEpoch(candidateEpoch),
    retryOnFailure = true,
  } = {},
) {
  return appendEntryNow(entry, sceneEpoch, {
    commandId,
    correlationId,
    ownerSceneEpoch,
    isCurrent,
    retryOnFailure,
  });
}

function effectHistoryFieldSnapshot(value) {
  return cloneValue(value);
}

function effectHistoryChange(change, namesById = new Map()) {
  const fields = {};
  const before = {};
  const after = {};
  for (const field of EFFECTS_HISTORY_FIELDS) {
    if (!change?.fields?.[field]) continue;
    fields[field] = true;
    before[field] = effectHistoryFieldSnapshot(change.before?.[field]);
    after[field] = effectHistoryFieldSnapshot(change.after?.[field]);
  }
  if (!Object.keys(fields).length) return null;
  const output = {
    id: change.id,
    fields,
    before,
    after,
  };
  const name = String(change?.name || namesById.get(String(change?.id || "")) || "").trim();
  if (name) output.name = name;
  const metadataFields = Object.fromEntries(
    Object.entries(change?.metadataFields || {}).filter(([, touched]) => touched)
  );
  if (Object.keys(metadataFields).length) {
    output.metadataFields = metadataFields;
    output.beforeMetadata = cloneValue(change.beforeMetadata || {});
    output.afterMetadata = cloneValue({
      ...(change.afterMetadata || {}),
      ...(change.historyAfterMetadata || {}),
    });
  }
  return output;
}

export function buildEffectsMutationHistoryChanges(plan = null) {
  const namesById = new Map();
  for (const state of Array.isArray(plan?.states) ? plan.states : []) {
    const id = String(state?.id || "").trim();
    const name = String(state?.name || "").trim();
    if (id && name) namesById.set(id, name);
  }
  const changes = (Array.isArray(plan?.changes) ? plan.changes : [])
    .map((change) => {
      const namedChange = {
        ...change,
        ...(namesById.has(String(change?.id || "")) && !change?.name
          ? { name: namesById.get(String(change.id)) }
          : {}),
      };
      const effectChange = effectHistoryChange(namedChange, namesById);
      if (effectChange) return effectChange;
      const metadataFields = Object.fromEntries(
        Object.entries(change?.metadataFields || {}).filter(([, touched]) => touched)
      );
      if (!Object.keys(metadataFields).length) return null;
      return {
        id: change.id,
        ...(String(change?.name || namesById.get(String(change?.id || "")) || "").trim()
          ? { name: String(change?.name || namesById.get(String(change?.id || ""))).trim() }
          : {}),
        fields: {},
        before: {},
        after: {},
        metadataFields,
        beforeMetadata: cloneValue(change.beforeMetadata || {}),
        afterMetadata: cloneValue({
          ...(change.afterMetadata || {}),
          ...(change.historyAfterMetadata || {}),
        }),
      };
    })
    .filter(Boolean);
  return { changes, namesById };
}

export function buildEffectsMutationHistoryEntry({
  command = {},
  plan = null,
  commitResult = null,
  sceneEpoch = currentSceneEpoch(),
} = {}) {
  const { changes, namesById } = buildEffectsMutationHistoryChanges(plan);
  const sideEffectChanges = Array.isArray(commitResult?.sideEffectChanges)
    ? commitResult.sideEffectChanges
    : [];
  if (!changes.length && !sideEffectChanges.length) return null;

  const historyOptions = command.history && typeof command.history === "object"
    ? command.history
    : {};
  const fields = Array.from(new Set(changes.flatMap((change) =>
    [
      ...Object.keys(change.fields || {}).filter((field) => change.fields[field]),
      ...Object.keys(change.metadataFields || {}).filter((field) => change.metadataFields[field]),
    ]
  )));
  const targetIds = Array.from(new Set([
    ...(Array.isArray(command.targetIds) ? command.targetIds : []),
    ...changes.map((change) => change.id),
  ].filter(Boolean)));
  const historyPayload = historyOptions.payload && typeof historyOptions.payload === "object"
    ? cloneValue(historyOptions.payload)
    : null;
  const entry = {
    id: command.commandId ? `effects-history:${command.commandId}` : createEntryId(),
    version: HISTORY_VERSION,
    at: createActionTimestamp(),
    kind: String(historyOptions.kind || command.kind || "effects").trim() || "effects",
    label: String(historyOptions.label || command.label || "Modifica effetti").trim() || "Modifica effetti",
    changes,
    ...(historyPayload ? { payload: historyPayload } : {}),
    effectsMutation: {
      version: 1,
      commandId: command.commandId || null,
      correlationId: command.correlationId || command.commandId || null,
      commandType: command.kind || "effects",
      sceneEpoch,
      sceneIdentity: command.sceneIdentity || null,
      targetIds,
      fields,
      changes,
      sideEffects: cloneValue(sideEffectChanges),
    },
  };
  for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    const name = String(change?.name || namesById.get(String(change?.id || "")) || "").trim();
    if (change && name && !change.name) change.name = name;
  }
  if (entry?.effectsMutation && typeof entry.effectsMutation === "object") {
    entry.effectsMutation = {
      ...entry.effectsMutation,
      commandId: entry.effectsMutation.commandId || command.commandId || null,
      correlationId: entry.effectsMutation.correlationId
        || command.correlationId
        || command.commandId
        || null,
      changes: Array.isArray(entry.effectsMutation.changes)
        ? entry.effectsMutation.changes.map((change) => ({
          ...change,
          ...(String(change?.name || namesById.get(String(change?.id || "")) || "").trim()
            ? { name: String(change?.name || namesById.get(String(change?.id || ""))).trim() }
            : {}),
        }))
        : entry.effectsMutation.changes,
    };
  }
  return entry;
}

/**
 * Records the coordinator's logical effects operation.  The entry contains
 * only the fields changed by the plan; the scene metadata writer still owns
 * only the history key, so this cannot overwrite tracker or token metadata.
 */
export async function recordEffectsMutationHistory({
  command = {},
  plan = null,
  commitResult = null,
  sceneEpoch = currentSceneEpoch(),
  historyEntry = null,
} = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return null;
  const entry = historyEntry && typeof historyEntry === "object"
    ? cloneValue(historyEntry)
    : buildEffectsMutationHistoryEntry({ command, plan, commitResult, sceneEpoch });
  if (!entry) return null;

  try {
    await appendEntry(entry, {
      sceneEpoch,
      commandId: command.commandId || `history-command:${entry.id}`,
      correlationId: command.correlationId || command.commandId || `history-correlation:${entry.id}`,
      // The effects coordinator already owns its durable retry lane and must
      // keep the same historyEntry payload across ambiguous responses.
      retryOnFailure: false,
    });
  } catch (error) {
    if (error && typeof error === "object") error.historyEntry = cloneValue(entry);
    throw error;
  }
  return entry;
}

export async function withItemMetaHistory(options, action) {
  const itemIds = Array.from(new Set((options?.itemIds || []).filter(Boolean)));
  const fields = Array.from(new Set((options?.fields || []).filter(Boolean)));
  const sceneItemIds = Array.from(new Set((options?.sceneItemIds || []).filter(Boolean)));
  const sceneEpoch = options?.sceneEpoch ?? currentSceneEpoch();
  const ownerSceneEpoch = options?.ownerSceneEpoch ?? currentSceneEpoch();
  const isCurrent = typeof options?.isCurrent === "function"
    ? options.isCurrent
    : (candidateEpoch) => isCurrentSceneEpoch(candidateEpoch);
  const isOperationCurrent = () => {
    try {
      return isCurrent(sceneEpoch);
    } catch {
      return false;
    }
  };
  const captureMetadata = itemIds.length > 0 && fields.length > 0;
  const hasSideEffects = Array.isArray(options?.sideEffects) && options.sideEffects.length > 0;
  if ((!captureMetadata && !sceneItemIds.length && !hasSideEffects) || typeof action !== "function") {
    return typeof action === "function" && isOperationCurrent()
      ? action()
      : undefined;
  }

  const run = async () => {
    if (!isOperationCurrent()) return undefined;
    let before = [];
    let sceneBefore = [];
    try {
      [before, sceneBefore] = await Promise.all([
        captureMetadata ? captureItems(itemIds, fields) : [],
        captureSceneItems(sceneItemIds),
      ]);
    } catch (err) {
      console.warn("[history] capture before:", err?.message || err);
      if (!isOperationCurrent()) return undefined;
      return action();
    }

    if (!isOperationCurrent()) return undefined;
    const result = await action();
    if (!isOperationCurrent()) return result;
    try {
      const [after, sceneAfter] = await Promise.all([
        captureMetadata ? captureItems(itemIds, fields) : [],
        captureSceneItems(sceneItemIds),
      ]);
      const afterById = new Map(after.map((item) => [item.id, item]));

      const changes = before.map((item) => {
        const next = afterById.get(item.id);
        if (!next || sameValues(item.values, next.values)) return null;
        return {
          id: item.id,
          name: next.name || item.name,
          before: item.values,
          after: next.values,
        };
      }).filter(Boolean);
      const sceneAfterById = new Map(sceneAfter.map((entry) => [entry.id, entry.item]));
      for (const entry of sceneBefore) {
        const previous = entry.item;
        const next = sceneAfterById.get(entry.id) ?? null;
        if ((!previous && !next) || (previous && next)) continue;
        changes.push({
          id: entry.id,
          name: String(next?.name || previous?.name || "Elemento scena").trim() || "Elemento scena",
          sceneBefore: previous,
          sceneAfter: next,
        });
      }

      let entry = {
        id: createEntryId(),
        version: HISTORY_VERSION,
        at: createActionTimestamp(),
        kind: String(options?.kind || "change"),
        label: String(options?.label || "Modifica"),
        changes,
      };
      if (Array.isArray(options?.sideEffects) && options.sideEffects.length > 0) {
        entry.effectsMutation = {
          version: 1,
          commandId: createEntryId(),
          correlationId: createEntryId(),
          commandType: String(options?.kind || "change"),
          sceneEpoch,
          sceneIdentity: null,
          targetIds: Array.from(new Set([
            ...itemIds,
            ...sceneItemIds,
            ...options.sideEffects.map((se) => se?.targetId || se?.id).filter(Boolean),
          ])),
          fields,
          changes: [],
          sideEffects: cloneValue(options.sideEffects),
        };
      }
      if (typeof options?.decorateEntry === "function") {
        const decorated = await options.decorateEntry(entry);
        if (decorated && typeof decorated === "object") entry = decorated;
      }
      const hasMeaningfulChanges = (Array.isArray(entry.changes) && entry.changes.length > 0)
        || (Array.isArray(entry.effectsMutation?.changes) && entry.effectsMutation.changes.length > 0)
        || (Array.isArray(entry.effectsMutation?.sideEffects) && entry.effectsMutation.sideEffects.length > 0)
        || (entry.payload?.causality?.teleport === true);

      if (hasMeaningfulChanges && isOperationCurrent()) {
        const historyCommandId = `history-command:${createEntryId()}`;
        try {
          const ownerResult = await appendEntry(entry, {
            sceneEpoch,
            ownerSceneEpoch,
            isCurrent,
            commandId: historyCommandId,
            correlationId: options?.correlationId || historyCommandId,
          });
          if (!isOperationCurrent()) return result;
          if (typeof options?.onHistoryStatus === "function") {
            try {
              await options.onHistoryStatus({
                status: "committed",
                entry,
                result: ownerResult,
                commandId: historyCommandId,
              });
            } catch (err) {
              console.warn("[history] onHistoryStatus:", err?.message || err);
            }
          }
          if (typeof options?.onRecorded === "function") {
            try { options.onRecorded(entry); }
            catch (err) { console.warn("[history] onRecorded:", err?.message || err); }
          }
        } catch (err) {
          if (typeof options?.onHistoryStatus === "function") {
            try {
              await options.onHistoryStatus({
                status: "pending",
                entry,
                commandId: historyCommandId,
                error: {
                  name: String(err?.name || "Error"),
                  message: String(err?.message || err),
                  code: err?.code || null,
                },
              });
            } catch (statusError) {
              console.warn("[history] onHistoryStatus:", statusError?.message || statusError);
            }
          }
          throw err;
        }
      }
    } catch (err) {
      console.warn("[history] record:", err?.message || err);
    }

    return result;
  };

  // Snapshot, azione e snapshot finale devono essere atomici rispetto alle
  // altre operazioni del plugin: serializzare solo appendEntry consentiva a
  // due azioni ravvicinate di catturare lo stesso stato iniziale.
  if (options?.inline === true) return run();
  const task = __historyActionQueue.then(run, run);
  __historyActionQueue = task.catch(() => {});
  return task;
}

export async function getHistoryEntries() {
  const md = await OBR.scene.getMetadata();
  return normalizeHistory(md?.[HISTORY_KEY]).entries.slice();
}

function historyChainToken(entries) {
  return JSON.stringify((Array.isArray(entries) ? entries : []).map((entry) => ({
    id: entry?.id || null,
    version: entry?.version || null,
    at: entry?.at || null,
    kind: entry?.kind || null,
    changes: entry?.changes || [],
    effectsMutation: entry?.effectsMutation || null,
  })));
}

export async function getHistoryUndoReadiness({
  sceneEpoch = currentSceneEpoch(),
  attempts = 2,
} = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return { status: "unavailable", reason: "stale-scene", entries: [], rows: [], chainToken: "" };
  }
  try {
    if (await OBR.player.getRole() !== "GM") {
      return { status: "unavailable", reason: "gm-required", entries: [], rows: [], chainToken: "" };
    }
  } catch {
    return { status: "unavailable", reason: "role-unavailable", entries: [], rows: [], chainToken: "" };
  }

  const maxAttempts = Math.max(1, Math.floor(Number(attempts) || 1));
  const {
    flushPendingEffectsHistory,
    hasPendingEffectsHistory,
    hasPendingEffectsHistoryAuthoritative,
  } = await import("./effectsMutations.js");
  const localEffectsHistoryPending = hasPendingHistoryAppends(sceneEpoch)
    || hasPendingEffectsHistory(sceneEpoch);
  if (localEffectsHistoryPending) {
    // Pending History is a causal barrier. Kick retries in the background, but
    // never make readiness wait for the 8s owner transport timeout.
    void flushPendingHistoryAppends(sceneEpoch);
    flushPendingEffectsHistory(sceneEpoch);
    return { status: "blocked", reason: "history-pending", entries: [], rows: [], chainToken: "" };
  }
  let authoritativeEffectsHistoryPending = true;
  try {
    authoritativeEffectsHistoryPending = await hasPendingEffectsHistoryAuthoritative(sceneEpoch);
  } catch {
    // The background realm is authoritative; an unavailable answer is a
    // barrier, not permission to race an append against Undo.
    authoritativeEffectsHistoryPending = true;
  }
  if (authoritativeEffectsHistoryPending) {
    if (!isCurrentSceneEpoch(sceneEpoch)) {
      return { status: "unavailable", reason: "stale-scene", entries: [], rows: [], chainToken: "" };
    }
    return { status: "blocked", reason: "history-pending", entries: [], rows: [], chainToken: "" };
  }
  const removalBarrier = await convergePendingHistoryRemovals(sceneEpoch);
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return { status: "unavailable", reason: "stale-scene", entries: [], rows: [], chainToken: "" };
  }
  if (!removalBarrier.converged) {
    return {
      status: "blocked",
      reason: "history-removal-pending",
      entries: [],
      rows: [],
      chainToken: "",
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const entries = await getHistoryEntries();
    if (!isCurrentSceneEpoch(sceneEpoch)) {
      return { status: "unavailable", reason: "stale-scene", entries: [], rows: [], chainToken: "" };
    }
    const beforeToken = historyChainToken(entries);
    // Readiness must validate against the same authoritative scene state used
    // by the real Undo coordinator. The scene-item dispatcher is intentionally
    // debounced and can lag behind fast spell/reminder reconciliation events,
    // so its cached items are unsuitable as the source of truth here. Keep its
    // generation only as a stability guard around the live OBR read.
    const dispatcherSnapshot = readSceneItemsSnapshot(sceneEpoch);
    const snapshotGeneration = dispatcherSnapshot.complete === true
      ? Number(dispatcherSnapshot.generation) || 0
      : null;
    const sceneItems = await OBR.scene.items.getItems();
    if (!isCurrentSceneEpoch(sceneEpoch)) {
      return { status: "unavailable", reason: "stale-scene", entries: [], rows: [], chainToken: "" };
    }

    const { prepareEffectsMutationUndo } = await import("./effectsMutations.js");
    const rows = await evaluateHistoryUndoReadiness(entries, async (suffix) => (
      prepareEffectsMutationUndo([...suffix].reverse(), {
        sceneEpoch,
        sceneItems,
        isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
      })
    ));
    if (!isCurrentSceneEpoch(sceneEpoch)) {
      return { status: "unavailable", reason: "stale-scene", entries: [], rows: [], chainToken: "" };
    }

    const confirmedEntries = await getHistoryEntries();
    const confirmedSnapshot = readSceneItemsSnapshot(sceneEpoch);
    const historyStable = beforeToken === historyChainToken(confirmedEntries);
    const snapshotStable = snapshotGeneration === null
      || (confirmedSnapshot.complete === true
        && Number(confirmedSnapshot.generation) === snapshotGeneration);
    if (historyStable && snapshotStable) {
      return {
        status: "ready",
        reason: null,
        entries,
        rows,
        chainToken: beforeToken,
        snapshotGeneration,
      };
    }
  }

  return {
    status: "unstable",
    reason: "history-or-scene-changed-during-validation",
    entries: [],
    rows: [],
    chainToken: "",
  };
}

/**
 * Removes only structurally malformed entries. A conflict with the current
 * scene is a diagnostic state for the UI, never authorization to erase audit
 * history or expose an older action as if the conflict did not exist.
 */
export async function pruneNonUndoableHistoryEntries({
  sceneEpoch = currentSceneEpoch(),
  ownerAttempts = 1,
  ownerRetryDelayMs = 120,
} = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return { removedIds: [], skipped: "stale-scene" };
  try {
    if (await OBR.player.getRole() !== "GM") return { removedIds: [], skipped: "gm-required" };
  } catch {
    return { removedIds: [], skipped: "role-unavailable" };
  }

  const entries = await getHistoryEntries();
  if (!entries.length || !isCurrentSceneEpoch(sceneEpoch)) {
    return { removedIds: [], skipped: entries.length ? "stale-scene" : "empty" };
  }

  const removedIds = malformedHistoryEntryIds(entries);
  if (!removedIds.length || !isCurrentSceneEpoch(sceneEpoch)) {
    return { removedIds: [], skipped: removedIds.length ? "stale-scene" : "none" };
  }

  const commandId = `history-prune:${sceneEpoch}:${removedIds.join(":")}`;
  const attempts = Math.max(1, Math.floor(Number(ownerAttempts) || 1));
  let error = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isCurrentSceneEpoch(sceneEpoch)) {
      return { removedIds: [], pendingIds: removedIds, committed: false, skipped: "stale-scene" };
    }
    try {
      await requestHistoryOwnerRemove(removedIds, {
        sceneEpoch,
        commandId,
        correlationId: commandId,
      });
      return { removedIds, committed: true };
    } catch (requestError) {
      error = requestError;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ownerRetryDelayMs) || 0)));
      }
    }
  }
  return { removedIds: [], pendingIds: removedIds, committed: false, error };
}

export async function waitForHistoryEntriesRemoved(
  ids,
  {
    sceneEpoch = currentSceneEpoch(),
    attempts = 8,
    delayMs = 50,
  } = {},
) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
  if (!wanted.size) return true;
  for (let attempt = 0; attempt < Math.max(1, Number(attempts) || 1); attempt += 1) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    const entries = await getHistoryEntries();
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    if (!entries.some((entry) => wanted.has(entry?.id))) return true;
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
    }
  }
  return false;
}

export function subscribeMovementSegments(handler) {
  if (typeof handler !== "function") throw new TypeError("handler must be a function");
  __movementSegmentListeners.add(handler);
  return () => __movementSegmentListeners.delete(handler);
}

export function suppressMovementHistory(itemId, expectedPosition, durationMs = 5000) {
  const id = String(itemId || "");
  const position = itemPosition({ position: expectedPosition });
  if (!id || !position) return;
  __pendingMovements.delete(id);
  const until = Date.now() + Math.max(500, Number(durationMs) || 0);
  __suppressedMovements.set(id, {
    until,
    positions: [position],
  });
  void OBR.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
    type: "suppress-movement",
    ids: [id],
    positions: { [id]: [position] },
    until,
  }, { destination: "LOCAL" }).catch(() => {});
}

function notifyMovementSegments(changes) {
  for (const handler of __movementSegmentListeners) {
    try {
      const task = handler(changes);
      if (task?.catch) task.catch((err) => console.warn("[history] movement listener:", err?.message || err));
    } catch (err) {
      console.warn("[history] movement listener:", err?.message || err);
    }
  }
}

async function measuredMovementCells(move, dpi) {
  const segments = Array.isArray(move?.segments) && move.segments.length
    ? move.segments
    : [{ beforePosition: move.beforePosition, afterPosition: move.afterPosition }];
  const measured = await Promise.all(segments.map(async (segment) => {
    const fallback = Math.hypot(
      segment.afterPosition.x - segment.beforePosition.x,
      segment.afterPosition.y - segment.beforePosition.y
    ) / dpi;
    try {
      const distance = await OBR.scene.grid.getDistance(segment.beforePosition, segment.afterPosition);
      return Number.isFinite(distance) ? Number(distance) : fallback;
    } catch {
      return fallback;
    }
  }));
  return measured.reduce((total, cells) => total + Math.max(0, Number(cells) || 0), 0);
}

async function buildMovementUndoCorrections(entries, sceneEpoch) {
  const candidates = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.kind !== "move") continue;
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const beforePosition = itemPosition({ position: change?.beforePosition });
      const afterPosition = itemPosition({ position: change?.afterPosition });
      const recordedCells = Number(change?.movement?.cells);
      const hasRecordedMovement = Number.isFinite(recordedCells);
      if (!change?.id || (!hasRecordedMovement && (!beforePosition || !afterPosition))) continue;
      candidates.push({
        entryId: String(entry?.id || "").trim(),
        id: String(change.id),
        name: String(change?.name || "Token").trim() || "Token",
        beforePosition,
        afterPosition,
        recordedCells,
      });
    }
  }
  if (!candidates.length || !isCurrentSceneEpoch(sceneEpoch)) return [];

  let dpi = 1;
  if (candidates.some((candidate) => (
    !Number.isFinite(candidate.recordedCells)
    || Math.abs(candidate.recordedCells) < 0.01
  ) && candidate.beforePosition && candidate.afterPosition)) {
    try {
      dpi = Math.max(1, Number(await OBR.scene.grid.getDpi()) || 1);
    } catch {}
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];

  const corrections = [];
  for (const candidate of candidates) {
    let cells = Number.isFinite(candidate.recordedCells)
      ? Math.abs(candidate.recordedCells)
      : 0;
    if (cells < 0.01 && candidate.beforePosition && candidate.afterPosition) {
      cells = await measuredMovementCells({
        beforePosition: candidate.afterPosition,
        afterPosition: candidate.beforePosition,
      }, dpi);
    }
    if (!isCurrentSceneEpoch(sceneEpoch)) return [];
    if (cells < 0.01) continue;
    corrections.push({
      id: candidate.id,
      name: candidate.name,
      cells,
      // The correction travels from the recorded destination back to its origin.
      beforePosition: candidate.afterPosition,
      afterPosition: candidate.beforePosition,
      ...(candidate.entryId ? { historyEntryId: candidate.entryId } : {}),
    });
  }
  return corrections;
}

async function flushPendingMovements(sceneEpoch = __movementFlushEpoch ?? currentSceneEpoch()) {
  __movementFlushTimer = null;
  __movementFlushEpoch = null;
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    __pendingMovements.clear();
    return;
  }
  const pending = Array.from(__pendingMovements.values());
  __pendingMovements.clear();
  if (!pending.length) return;

  let dpi = 1;
  try {
    const gridDpi = await OBR.scene.grid.getDpi();
    dpi = Math.max(1, Number(gridDpi) || 1);
  } catch {}
  if (!isCurrentSceneEpoch(sceneEpoch)) return;

  const changes = [];
  for (const move of pending) {
    const hasSegments = Array.isArray(move.segments) && move.segments.length > 0;
    if (!hasSegments && samePosition(move.beforePosition, move.afterPosition)) continue;

    const cells = await measuredMovementCells(move, dpi);
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    if (cells < 0.01) continue;

    changes.push({
      id: move.id,
      name: move.name,
      beforePosition: move.beforePosition,
      afterPosition: move.afterPosition,
      movement: {
        cells: Math.round(cells * 100) / 100,
        dxCells: Math.round(((move.afterPosition.x - move.beforePosition.x) / dpi) * 100) / 100,
        dyCells: Math.round(((move.afterPosition.y - move.beforePosition.y) / dpi) * 100) / 100,
      },
    });
  }
  if (!changes.length) return;

  await appendEntry({
    id: createEntryId(),
    version: HISTORY_VERSION,
    at: createActionTimestamp(),
    kind: "move",
    label: changes.length === 1
      ? `Movimento: ${changes[0].name}`
      : `Movimento: ${changes.length} token`,
    changes,
  }, { sceneEpoch });
}

function scheduleMovementFlush(sceneEpoch = currentSceneEpoch()) {
  if (__movementFlushTimer) clearTimeout(__movementFlushTimer);
  __movementFlushEpoch = sceneEpoch;
  __movementFlushTimer = setTimeout(() => {
    void flushPendingMovements(sceneEpoch).catch((err) => {
      console.warn("[history] movement record:", err?.message || err);
    });
  }, MOVEMENT_SETTLE_MS);
}

export async function mountMovementHistoryWatcher() {
  if (__movementWatcherMounted) return;
  if (await OBR.player.getRole() !== "GM") return;
  __movementWatcherMounted = true;

  await mountSceneHistoryWatcher();
  mountSceneEpochHistoryLifecycle();

  OBR.broadcast.onMessage(HISTORY_CONTROL_CHANNEL, (event) => {
    const data = event?.data;
    if (!Array.isArray(data?.ids)) return;
    if (data.type === "suppress-history-undo") {
      markHistoryRestoreSuppressed(data.ids, data.until);
      installMovementSuppressions(data.ids, data.positions, data.until);
      if (data.requestId) {
        void OBR.broadcast.sendMessage(HISTORY_CONTROL_ACK_CHANNEL, {
          type: "suppress-history-undo-ack",
          requestId: data.requestId,
        }, { destination: "LOCAL" }).catch((error) => {
          console.warn("[history] movement suppression ack:", error?.message || error);
        });
      }
      return;
    }
    if (data.type === "suppress-scene-history") {
      markHistoryRestoreSuppressed(data.ids, data.until);
      return;
    }
    if (data.type !== "suppress-movement") return;
    installMovementSuppressions(data.ids, data.positions, data.until);
  });

  const initialEpoch = currentSceneEpoch();
  const initial = await OBR.scene.items.getItems((item) =>
    !!item.metadata?.[META_KEY] && !!itemPosition(item)
  );
  if (isCurrentSceneEpoch(initialEpoch)) {
    for (const item of initial) __movementPositions.set(item.id, itemPosition(item));
  }

  subscribeSceneItemChanges(async ({ items: changes, sceneEpoch }) => {
    const eventEpoch = sceneEpoch ?? currentSceneEpoch();
    if (!isCurrentSceneEpoch(eventEpoch)) return;
    const now = Date.now();
    let movementChanged = false;
    let nativeUndoAvailable = false;
    try {
      nativeUndoAvailable = await OBR.scene.history.canRedo();
    } catch {}
    if (!isCurrentSceneEpoch(eventEpoch)) return;
    const nativeUndoCorrections = [];

    for (const item of changes) {
      if (!item?.metadata?.[META_KEY]) continue;
      const next = itemPosition(item);
      if (!next) continue;

      const previous = __movementPositions.get(item.id);
      __movementPositions.set(item.id, next);

      const suppression = __suppressedMovements.get(item.id);
      if (suppression?.until > now) {
        const expectedIndex = suppression.positions.findIndex((position) => samePosition(position, next));
        if (expectedIndex >= 0) {
          if (previous && !samePosition(previous, next)) {
            notifyMovementSegments([{
              id: item.id,
              name: String(item.name || "").trim() || "Token",
              beforePosition: previous,
              afterPosition: next,
              undo: true,
            }]);
          }
          suppression.positions.splice(0, expectedIndex + 1);
          if (!suppression.positions.length) __suppressedMovements.delete(item.id);
          __pendingMovements.delete(item.id);
          continue;
        }
        if (previous && samePosition(previous, next)) {
          continue;
        }
        __suppressedMovements.delete(item.id);
      } else if (suppression) {
        __suppressedMovements.delete(item.id);
      }
      if (!previous || samePosition(previous, next)) continue;

      if (nativeUndoAvailable) {
        notifyMovementSegments([{
          id: item.id,
          name: String(item.name || "").trim() || "Token",
          beforePosition: previous,
          afterPosition: next,
          undo: true,
        }]);
        const wasPending = __pendingMovements.delete(item.id);
        if (!wasPending) {
          nativeUndoCorrections.push({
            id: item.id,
            name: String(item.name || "").trim() || "Token",
            beforePosition: previous,
            afterPosition: next,
          });
        }
        continue;
      }

      notifyMovementSegments([{
        id: item.id,
        name: String(item.name || "").trim() || "Token",
        beforePosition: previous,
        afterPosition: next,
      }]);

      const pending = __pendingMovements.get(item.id) || {
        id: item.id,
        name: String(item.name || "").trim() || "Token",
        beforePosition: previous,
        afterPosition: next,
        segments: [],
      };
      pending.name = String(item.name || "").trim() || pending.name;
      pending.afterPosition = next;
      pending.segments.push({ beforePosition: previous, afterPosition: next });
      __pendingMovements.set(item.id, pending);
      movementChanged = true;
    }

    if (movementChanged) scheduleMovementFlush(eventEpoch);
    if (nativeUndoCorrections.length) {
      let dpi = 1;
      try {
        dpi = Math.max(1, Number(await OBR.scene.grid.getDpi()) || 1);
      } catch {}
      const corrections = [];
      for (const correction of nativeUndoCorrections) {
        const cells = await measuredMovementCells(correction, dpi);
        if (cells >= 0.01) corrections.push({ ...correction, cells });
      }
      try {
        if (!isCurrentSceneEpoch(eventEpoch)) return;
        await recordNativeMovementUndo(corrections, { sceneEpoch: eventEpoch });
      } catch (err) {
        console.warn("[combat-log] native movement undo:", err?.message || err);
      }
    }
  }, { immediate: true, filter: (event) => event.flags.movement });
}

async function syncRestoredEntry(entry, sceneEpoch) {
  const postCommitErrors = arguments[2] || null;
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const ids = Array.from(new Set(changes.map((change) => change?.id).filter(Boolean)));
  if (!ids.length) return true;

  const restoredHP = changes.some((change) =>
    Object.prototype.hasOwnProperty.call(change?.before || {}, "hp") ||
    Object.prototype.hasOwnProperty.call(change?.before || {}, "hpMax")
  );
  const restoredConditions = changes.some((change) =>
    Object.prototype.hasOwnProperty.call(change?.before || {}, "conditions")
  );
  const restoredInitiativeCards = changes.some((change) =>
    Object.prototype.hasOwnProperty.call(change?.before || {}, "initiativeCard")
  );

  if (restoredHP) {
    try {
      const [items, bars, memory] = await Promise.all([
        OBR.scene.items.getItems(ids),
        import("./hpbar-items.js"),
        import("./hpMemory.js"),
      ]);
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      const textUpdates = [];
      const removedWidgetIds = [];
      const memoryUpdates = [];
      for (const item of items) {
        if (!isCurrentSceneEpoch(sceneEpoch)) return false;
        const meta = item.metadata?.[META_KEY] || {};
        const hasHP =
          Object.prototype.hasOwnProperty.call(meta, "hp") ||
          Object.prototype.hasOwnProperty.call(meta, "hpMax");
        if (!hasHP) {
          removedWidgetIds.push(item.id);
          memoryUpdates.push({ itemId: item.id, remove: true });
          continue;
        }
        const hp = Math.floor(Number(meta.hp) || 0);
        const hpMax = Math.floor(Number(meta.hpMax) || 0);
        bars.syncHPBarNow(item.id, hp, hpMax);
        textUpdates.push({ tokenId: item.id, hp, hpMax });
        memoryUpdates.push({ itemId: item.id, hp, hpMax });
      }
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      const results = await Promise.allSettled([
        ...(textUpdates.length ? [bars.syncHPTextBatchNow(textUpdates)] : []),
        ...(removedWidgetIds.length
          ? [bars.removeHPWidgetsBatchNow(removedWidgetIds)]
          : []),
        ...(memoryUpdates.length
          ? [memory.syncHPBatchToMemory(memoryUpdates, { sceneEpoch, items })]
          : []),
      ]);
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      const failed = results.find((result) => result.status === "rejected");
      if (failed) {
        throw failed.reason;
      }
    } catch (err) {
      postCommitErrors?.push({
        phase: "hp-output-sync",
        message: String(err?.message || err),
      });
      console.warn("[history] HP sync after undo:", err?.message || err);
    }
  }

  if (restoredConditions) {
    try {
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      const { refreshConditionLabels } = await import("./conditions.js");
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      await refreshConditionLabels(ids);
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    } catch (err) {
      postCommitErrors?.push({
        phase: "condition-output-sync",
        message: String(err?.message || err),
      });
      console.warn("[history] condition sync after undo:", err?.message || err);
    }
  }

  if (restoredInitiativeCards) {
    try {
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      const { syncInitiativeCardRegistryFromItems } = await import("./initiativeCards.js");
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
      await syncInitiativeCardRegistryFromItems(ids);
      if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    } catch (err) {
      postCommitErrors?.push({
        phase: "initiative-card-output-sync",
        message: String(err?.message || err),
      });
      console.warn("[history] initiative card sync after undo:", err?.message || err);
    }
  }
  return isCurrentSceneEpoch(sceneEpoch);
}

// Kept as a domain predicate for diagnostics and compatibility with the
// existing History contracts; every branch still uses the same coordinator.
function entryTouchesEffects(entry) {
  if (Array.isArray(entry?.effectsMutation?.changes)) return true;
  return (entry?.changes || []).some((change) => [
    "conditions",
    SPELLS_META_KEY,
    CONC_META_KEY,
  ].some((field) => Object.prototype.hasOwnProperty.call(change?.before || {}, field)));
}

function decorateUndoResult(entries, result = {}) {
  const output = Array.isArray(entries) ? [...entries] : [];
  const status = result.status || (result.committed === true ? "applied" : "noop");
  const normalized = {
    ...result,
    status,
    committed: status === "applied" && result.committed === true,
  };
  Object.defineProperty(output, "status", {
    value: status,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(output, "result", {
    value: normalized,
    enumerable: false,
    configurable: true,
  });
  return output;
}

function undoResult(status, reason, extra = {}) {
  return {
    status,
    reason,
    committed: false,
    changedIds: [],
    changes: [],
    ...extra,
  };
}

function pendingHistoryRemovalUndoResult(pendingIds = []) {
  return decorateUndoResult([], undoResult("rejected", "history-removal-pending", {
    historyRemovalPending: true,
    pendingRemoval: true,
    pendingRemovalIds: [...new Set(
      (Array.isArray(pendingIds) ? pendingIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    )],
  }));
}

function undoCommandIdFor(entries, sceneEpoch) {
  return `history-undo:${sceneEpoch}:${(Array.isArray(entries) ? entries : [])
    .map((entry) => String(entry?.id || ""))
    .join(":")}`;
}

function syncEntryFromUndoPlan(plan) {
  return {
    changes: (Array.isArray(plan?.changes) ? plan.changes : []).map((change) => ({
      id: change.id,
      before: {
        ...(change.after || {}),
        ...(change.afterMetadata || {}),
      },
    })),
  };
}

function scheduleHistoryRemovalRetry() {
  if (__historyRemovalRetryTimer || !__pendingHistoryRemovals.size) return;
  __historyRemovalRetryTimer = setTimeout(() => {
    __historyRemovalRetryTimer = null;
    __historyRemovalRetryQueue = __historyRemovalRetryQueue
      .then(async () => {
        for (const [commandId, pending] of [...__pendingHistoryRemovals]) {
          if (!isCurrentSceneEpoch(pending.sceneEpoch)) {
            __pendingHistoryRemovals.delete(commandId);
            continue;
          }
          try {
            await requestHistoryOwnerRemove(pending.ids, {
              sceneEpoch: pending.sceneEpoch,
              commandId,
              correlationId: pending.correlationId,
            });
            __pendingHistoryRemovals.delete(commandId);
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (__pendingHistoryRemovals.size) scheduleHistoryRemovalRetry();
      });
  }, 750);
}

async function removeUndoHistoryEntries(ids, {
  sceneEpoch,
  commandId,
  correlationId,
} = {}) {
  const selectedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
  if (!selectedIds.length) return { pending: false, error: null };
  try {
    await requestHistoryOwnerRemove(selectedIds, {
      sceneEpoch,
      commandId,
      correlationId,
    });
    __pendingHistoryRemovals.delete(commandId);
    return { pending: false, error: null };
  } catch (error) {
    __pendingHistoryRemovals.set(commandId, {
      ids: selectedIds,
      sceneEpoch,
      correlationId,
    });
    scheduleHistoryRemovalRetry();
    return { pending: true, error };
  }
}

async function recordUndoCombatLogOnce(entries, { sceneEpoch, commandId } = {}) {
  if (!commandId || __undoCombatLogCommands.has(commandId)) return null;
  try {
    const result = await recordCombatUndo(entries, { sceneEpoch, commandId });
    __undoCombatLogCommands.add(commandId);
    return result;
  } catch (error) {
    throw error;
  }
}

function historyUndoDebugItemIds(entries = []) {
  const ids = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const change of Array.isArray(entry?.effectsMutation?.changes) ? entry.effectsMutation.changes : []) {
      if (change?.id) ids.add(String(change.id));
    }
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.id) ids.add(String(change.id));
    }
    for (const sideEffect of Array.isArray(entry?.effectsMutation?.sideEffects)
      ? entry.effectsMutation.sideEffects
      : []) {
      const id = String(sideEffect?.id || sideEffect?.itemId || sideEffect?.targetId || "").trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function historyUndoDebugState(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const meta = item?.metadata?.[META_KEY] || {};
    return {
      id: item?.id || "",
      name: item?.name || "",
      hp: meta?.hp ?? null,
      conditions: cloneValue(meta?.conditions || null),
      spells: cloneValue(meta?.[SPELLS_META_KEY] || null),
      concentrations: cloneValue(meta?.[CONC_META_KEY] || null),
      reminderResolutions: cloneValue(meta?.reminderResolutions || null),
    };
  });
}

async function logHistoryUndoLiveState(tag, itemIds = []) {
  try {
    const ids = [...new Set((Array.isArray(itemIds) ? itemIds : []).filter(Boolean))];
    if (!ids.length) return;
    const items = await OBR.scene.items.getItems(ids);
    console.warn(`[history][undo-debug][${tag}]`, historyUndoDebugState(items));
  } catch (error) {
    console.warn(`[history][undo-debug][${tag}-read-error]`, error?.message || error);
  }
}

async function concentrationWarningRuntimeScopeForEntries(entries = []) {
  try {
    const { getEffectsMutationSceneContext } = await import("./effectsMutations.js");
    const context = await getEffectsMutationSceneContext({
      commandId: "history-concentration-warning",
    });
    return String(context?.sceneIdentity || "").trim();
  } catch {
    return "";
  }
}

async function dismissConcentrationWarningsCausedByEntries(entries = [], sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const historyEntryIds = [...new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean),
  )];
  if (!historyEntryIds.length) return [];
  const warningRuntimeScope = await concentrationWarningRuntimeScopeForEntries(entries);
  await OBR.broadcast.sendMessage(
    CONCENTRATION_WARNING_CHANNEL,
    {
      type: "dismiss-concentration-warnings-by-history",
      historyEntryIds,
      sceneEpoch,
      ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
    },
    { destination: "ALL" },
  );
  return historyEntryIds;
}

async function reannounceHistoryReminderEntries(entries = [], sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const undoEntryIds = new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean),
  );
  let defaultWarningRuntimeScope = "";
  const rearmSent = new Set();
  const replayed = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (String(entry?.kind || "") !== "reminder-resolution") continue;
    const replay = entry?.payload?.replay;
    if (!replay || typeof replay !== "object") continue;
    if (replay.type === "reminder") {
      const owner = replay.owner === "effect-save"
        || replay.owner === "static-zone"
        || replay.owner === "spell-aura"
        ? replay.owner
        : "";
      const activationId = String(replay.activationId || "").trim();
      const descriptor = replay.descriptor && typeof replay.descriptor === "object"
        ? cloneValue(replay.descriptor)
        : null;
      const replayKey = `${owner}:${activationId}`;
      if (!owner || !activationId || !descriptor || rearmSent.has(replayKey)) continue;
      await OBR.broadcast.sendMessage(
        REMINDER_HISTORY_REARM_CHANNEL,
        {
          type: "restore-reminder-activation",
          owner,
          activationId,
          descriptor,
          historyEntryId: String(entry?.id || "").trim(),
          sceneEpoch,
        },
        { destination: "ALL" },
      );
      rearmSent.add(replayKey);
      replayed.push(activationId);
      continue;
    }
    if (replay.type === "concentration-warning" && replay.warning) {
      const replaySceneEpoch = Number(entry?.effectsMutation?.sceneEpoch);
      if (!defaultWarningRuntimeScope) {
        defaultWarningRuntimeScope = await concentrationWarningRuntimeScopeForEntries([entry]);
      }
      const warningRuntimeScope = defaultWarningRuntimeScope;
      const storedWarning = cloneValue(replay.warning) || {};
      const warningWithoutHistoricalScope = { ...storedWarning };
      delete warningWithoutHistoricalScope.warningRuntimeScope;
      const replayWarning = {
        ...warningWithoutHistoricalScope,
        ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
      };
      if (
        !Number.isSafeInteger(replaySceneEpoch)
        || replaySceneEpoch < 0
        || replaySceneEpoch !== sceneEpoch
      ) {
        continue;
      }
      const causeHistoryEntryId = String(
        replay.warning?.notice?.causeHistoryEntryId || "",
      ).trim();
      // If the same Undo batch also rewinds the action that generated this
      // concentration save, the reminder is no longer causally valid and
      // must not be replayed.
      if (causeHistoryEntryId && undoEntryIds.has(causeHistoryEntryId)) {
        continue;
      }
      await OBR.broadcast.sendMessage(
        CONCENTRATION_WARNING_CHANNEL,
        {
          type: "show-concentration-warning",
          warnings: [replayWarning],
          createdAt: Date.now(),
          sceneEpoch: replaySceneEpoch,
          ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
        },
        { destination: "ALL" },
      );
      replayed.push(String(entry?.payload?.activationId || ""));
    }
  }
  return replayed.filter(Boolean);
}

async function recoverAlreadyUndoneReminderEntry(entry, sceneEpoch) {
  if (!entry || String(entry?.kind || "") !== "reminder-resolution") return null;
  if (!isCurrentSceneEpoch(sceneEpoch)) return null;
  const ids = historyUndoDebugItemIds([entry]);
  const sceneItems = ids.length ? await OBR.scene.items.getItems(ids) : [];
  if (!isCurrentSceneEpoch(sceneEpoch)) return null;
  const matchesBefore = historyEntryMatchesUndoBefore({
    sceneItems,
    entry,
    metadataKey: META_KEY,
    effectKeys: {
      conditions: "conditions",
      spells: SPELLS_META_KEY,
      concentrations: CONC_META_KEY,
    },
    normalizeConditions: (value) => Array.isArray(value?.instances)
      ? cloneValue(value.instances)
      : Array.isArray(value) ? cloneValue(value) : [],
  });
  if (!matchesBefore) return null;

  const entryId = String(entry?.id || "").trim();
  const undoCommandId = `history-already-undone:${sceneEpoch}:${entryId}`;
  const removal = await removeUndoHistoryEntries([entryId], {
    sceneEpoch,
    commandId: undoCommandId,
    correlationId: undoCommandId,
  });
  const postCommitErrors = [];
  try {
    await reannounceHistoryReminderEntries([entry], sceneEpoch);
  } catch (error) {
    postCommitErrors.push({
      phase: "history-reminder-reannounce",
      message: String(error?.message || error),
    });
  }
  return decorateUndoResult([entry], {
    status: "applied",
    reason: removal.pending ? "history-removal-pending" : "history-entry-already-undone",
    committed: true,
    pendingRemoval: removal.pending,
    changedIds: [],
    postCommitErrors,
  });
}

async function undoHistoryThroughNow(entryId, sceneEpoch) {
  const through = arguments[2]?.through !== false;
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return decorateUndoResult([], undoResult("rejected", "stale-scene-epoch"));
  }
  if (await OBR.player.getRole() !== "GM") {
    return decorateUndoResult([], undoResult("rejected", "gm-required"));
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return decorateUndoResult([], undoResult("rejected", "stale-after-role-read"));
  }

  const {
    flushPendingEffectsHistory,
    hasPendingEffectsHistory,
    hasPendingEffectsHistoryAuthoritative,
  } = await import("./effectsMutations.js");
  const localEffectsHistoryPending = hasPendingHistoryAppends(sceneEpoch)
    || hasPendingEffectsHistory(sceneEpoch);
  if (localEffectsHistoryPending) {
    // A reminder may close after its canonical Effects commit while its
    // deferred History entry is still materializing. Give the already-owned
    // retry lane a bounded chance to converge before rejecting Alt+Z; the
    // barrier remains fail-closed when the owner does not settle.
    const converged = await waitForHistoryPendingUndoConvergence(sceneEpoch, {
      flushPendingEffectsHistory,
      hasPendingEffectsHistory,
      hasPendingEffectsHistoryAuthoritative,
    });
    if (!converged) {
      return decorateUndoResult([], undoResult("rejected", "history-pending"));
    }
  }
  let authoritativeEffectsHistoryPending = true;
  try {
    authoritativeEffectsHistoryPending = await hasPendingEffectsHistoryAuthoritative(sceneEpoch);
  } catch {
    // Fail closed if the cross-realm context cannot answer.
    authoritativeEffectsHistoryPending = true;
  }
  if (authoritativeEffectsHistoryPending) {
    const converged = await waitForHistoryPendingUndoConvergence(sceneEpoch, {
      flushPendingEffectsHistory,
      hasPendingEffectsHistory,
      hasPendingEffectsHistoryAuthoritative,
    });
    if (!converged) {
      if (!isCurrentSceneEpoch(sceneEpoch)) {
        return decorateUndoResult([], undoResult("rejected", "stale-after-history-pending-check"));
      }
      return decorateUndoResult([], undoResult("rejected", "history-pending"));
    }
  }
  const removalBarrier = await convergePendingHistoryRemovals(sceneEpoch);
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return decorateUndoResult([], undoResult("rejected", "stale-after-history-removal"));
  }
  if (!removalBarrier.converged) {
    return pendingHistoryRemovalUndoResult(removalBarrier.pendingIds);
  }

  const md = await OBR.scene.getMetadata();
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return decorateUndoResult([], undoResult("rejected", "stale-after-history-read"));
  }
  const history = normalizeHistory(md?.[HISTORY_KEY]);
  if (!history.entries.length) {
    return decorateUndoResult([], undoResult("noop", "history-empty"));
  }

  const targetIndex = entryId
    ? history.entries.findIndex((entry) => entry?.id === entryId)
    : history.entries.length - 1;
  if (targetIndex < 0) {
    return decorateUndoResult([], undoResult("rejected", "history-entry-not-found"));
  }

  const selected = through
    ? history.entries.slice(targetIndex)
    : [history.entries[targetIndex]];
  const undoOrder = [...selected].reverse();
  const coordinatedBatch = undoOrder.some(entryTouchesEffects);
  void coordinatedBatch;

  const undoCommandId = undoCommandIdFor(undoOrder, sceneEpoch);
  const selectedIds = selected.map((entry) => entry?.id).filter(Boolean);
  const alreadyCommitted = selectedIds.length > 0 && selectedIds.every((id) => (
    [...__pendingHistoryRemovals.values()].some((pending) => (
      isCurrentSceneEpoch(pending?.sceneEpoch) && Array.isArray(pending?.ids) && pending.ids.includes(id)
    ))
  ));
  if (alreadyCommitted) {
    // A pending removal means that this entry was already undone locally.
    // Never expose it as a second successful Undo: converge the owner state
    // and reload the canonical History before selecting another target.
    const retryBarrier = await convergePendingHistoryRemovals(sceneEpoch);
    if (!isCurrentSceneEpoch(sceneEpoch)) {
      return decorateUndoResult([], undoResult("rejected", "stale-after-history-removal"));
    }
    if (!retryBarrier.converged) {
      return pendingHistoryRemovalUndoResult(retryBarrier.pendingIds);
    }
    return undoHistoryThroughNow(entryId, sceneEpoch, { through });
  }

  if (undoOrder.length === 1) {
    const recovered = await recoverAlreadyUndoneReminderEntry(undoOrder[0], sceneEpoch);
    if (recovered) return recovered;
  }

  const { undoEffectsMutation } = await import("./effectsMutations.js");
  const debugItemIds = historyUndoDebugItemIds(undoOrder);
  console.warn("[history][undo-debug][history-request]", {
    sceneEpoch,
    entryId: entryId || null,
    through,
    undoCommandId,
    entries: undoOrder.map((entry) => ({
      id: entry?.id || "",
      label: entry?.label || "",
      kind: entry?.kind || "",
    })),
    itemIds: debugItemIds,
  });
  await logHistoryUndoLiveState("before-undo", debugItemIds);
  const mutation = await undoEffectsMutation(undoOrder, {
    sceneEpoch,
    kind: "history:undo",
    label: "Annulla modifica",
    commandId: undoCommandId,
    correlationId: undoCommandId,
  });
  const debugMutationResult = {
    status: mutation?.status || null,
    committed: mutation?.committed === true,
    reason: mutation?.reason || null,
    conflicts: mutation?.conflicts || mutation?.plan?.conflicts || [],
    errorName: mutation?.error?.name || null,
    errorMessage: mutation?.error?.message || null,
    errorPhase: mutation?.error?.phase || null,
    errorStack: mutation?.error?.stack || null,
    changedIds: mutation?.changedIds || [],
    commitStatus: mutation?.commitResult?.status || null,
    commitReason: mutation?.commitResult?.reason || null,
    commitFailureName: mutation?.commitResult?.failure?.name || null,
    commitFailureMessage: mutation?.commitResult?.failure?.message || null,
    historyErrorName: mutation?.historyError?.name || null,
    historyErrorMessage: mutation?.historyError?.message || null,
    postCommitErrors: mutation?.postCommitErrors || mutation?.commitResult?.postCommitErrors || [],
  };
  console.warn("[history][undo-debug][mutation-result]", debugMutationResult);
  console.warn(
    "[history][undo-debug][mutation-result-flat]",
    JSON.stringify(debugMutationResult),
  );
  if (mutation.status !== "applied") {
    await logHistoryUndoLiveState("failed-undo-live", debugItemIds);
    return decorateUndoResult([], mutation);
  }

  const postCommitErrors = [
    ...(Array.isArray(mutation?.commitResult?.postCommitErrors)
      ? mutation.commitResult.postCommitErrors
      : []),
  ];
  try {
    await dismissConcentrationWarningsCausedByEntries(undoOrder, sceneEpoch);
  } catch (error) {
    postCommitErrors.push({
      phase: "history-concentration-reminder-dismiss",
      message: String(error?.message || error),
    });
  }
  try {
    await reannounceHistoryReminderEntries(undoOrder, sceneEpoch);
  } catch (error) {
    postCommitErrors.push({
      phase: "history-reminder-reannounce",
      message: String(error?.message || error),
    });
  }
  // restoreEntry(entry, epoch) is coordinator-owned now; only the derived
  // output reconciliation remains local: syncRestoredEntry(entry, epoch).
  // Contract marker: syncRestoredEntry({ ... }) is the single derived-output
  // entry point for Undo, now fed from the coordinator-owned plan below.
  const synchronized = await runSceneEpochSteps({
    sceneEpoch,
    isCurrent: isCurrentSceneEpoch,
    steps: [(epoch) => syncRestoredEntry(
      syncEntryFromUndoPlan(mutation.plan),
      epoch,
      postCommitErrors,
    )],
  });
  if (!synchronized) {
    postCommitErrors.push({
      phase: "undo-derived-state-sync",
      message: "scene-changed-during-post-commit-sync",
    });
  }

  await logHistoryUndoLiveState("after-undo-immediate", debugItemIds);

  const cleanupCommandId = `history-remove:${sceneEpoch}:${selectedIds.join(":")}`;
  const cleanup = isCurrentSceneEpoch(sceneEpoch)
    ? await removeUndoHistoryEntries(selectedIds, {
      sceneEpoch,
      commandId: cleanupCommandId,
      correlationId: undoCommandId,
    })
    : { pending: true, error: new Error("stale-before-history-cleanup") };
  if (cleanup.pending) {
    postCommitErrors.push({
      phase: "undo-history-cleanup",
      message: String(cleanup.error?.message || cleanup.error || "history-removal-pending"),
    });
  }
  // recordCombatUndo(undoOrder, { sceneEpoch }) remains best-effort after commit.
  try {
    await recordUndoCombatLogOnce(undoOrder, { sceneEpoch, commandId: undoCommandId });
  } catch (err) {
    postCommitErrors.push({
      phase: "combat-log-undo",
      message: String(err?.message || err),
    });
    console.warn("[combat-log] undo event:", err?.message || err);
  }
  try {
    const movementCorrections = await buildMovementUndoCorrections(undoOrder, sceneEpoch);
    if (movementCorrections.length && isCurrentSceneEpoch(sceneEpoch)) {
      await recordNativeMovementUndo(movementCorrections, {
        sceneEpoch,
        commandId: undoCommandId,
        correlationId: undoCommandId,
        dedupeKey: `movement-undo:${undoCommandId}`,
        undoSource: "history",
      });
    }
  } catch (err) {
    postCommitErrors.push({
      phase: "combat-log-movement-undo",
      message: String(err?.message || err),
    });
    console.warn("[combat-log] movement undo:", err?.message || err);
  }
  return decorateUndoResult(undoOrder, {
    ...mutation,
    postCommitErrors,
    historyRemovalPending: cleanup.pending,
  });
}

function installMovementSuppressions(ids, positionsById, requestedUntil = 0) {
  const until = Math.max(Date.now() + 500, Number(requestedUntil) || 0);
  for (const id of Array.isArray(ids) ? ids : []) {
    const positions = Array.isArray(positionsById?.[id])
      ? positionsById[id]
        .map((position) => itemPosition({ position }))
        .filter(Boolean)
      : [];
    if (id && positions.length) __suppressedMovements.set(id, { until, positions });
  }
}

function enqueueHistoryUndo(
  entryId,
  { through = true, sceneEpoch: requestedSceneEpoch } = {},
) {
  const sceneEpoch = currentSceneEpoch();
  const effectiveSceneEpoch = requestedSceneEpoch ?? sceneEpoch;
  return enqueueHistoryUndoAtEpoch(entryId, effectiveSceneEpoch, through);
}

function enqueueHistoryUndoAtEpoch(entryId, sceneEpoch, through = true) {
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return Promise.resolve(
      decorateUndoResult([], undoResult("rejected", "stale-scene-epoch")),
    );
  }
  // Anche Undo deve attendere un'eventuale operazione metadata in corso:
  // altrimenti il suo ripristino può essere seguito dallo snapshot finale
  // dell'azione e sembrare inefficace fino a un secondo tentativo.
  const task = (through
    ? __historyActionQueue.then(
      () => undoHistoryThroughNow(entryId, sceneEpoch),
      () => undoHistoryThroughNow(entryId, sceneEpoch),
    )
    : __historyActionQueue.then(
      () => undoHistoryThroughNow(entryId, sceneEpoch, { through: false }),
      () => undoHistoryThroughNow(entryId, sceneEpoch, { through: false }),
    )).catch((error) => decorateUndoResult([], undoResult("failed", "undo-request-failed", {
      error: {
        name: String(error?.name || "Error"),
        message: String(error?.message || error || "Undo fallito."),
      },
    })));
  __historyActionQueue = task.catch(() => {});
  return task;
}

export async function undoHistoryThrough(entryId, options = {}) {
  return enqueueHistoryUndo(entryId, { ...options, through: true });
}

export async function undoHistoryEntry(entryId, options = {}) {
  return enqueueHistoryUndo(entryId, { ...options, through: false });
}

export async function undoLastHistoryEntry() {
  const options = arguments[0] || {};
  const entries = await undoHistoryThrough(undefined, options);
  return entries[0] || null;
}
