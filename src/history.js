import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { recordCombatUndo, recordHistoryInCombatLog, recordNativeMovementUndo } from "./combatLog.js";

const META_KEY = `${ID}/meta`;
const HISTORY_KEY = `${ID}/history`;
const HISTORY_CONTROL_CHANNEL = `${ID}/history-control`;
const HISTORY_VERSION = 1;
const MAX_HISTORY_ENTRIES = 30;
const MOVEMENT_SETTLE_MS = 350;
const SCENE_HISTORY_SUPPRESS_MS = 2000;
const INITIATIVE_HISTORY_FIELDS = ["inInitiative", "initiative", "attitude"];

let __historyWriteQueue = Promise.resolve();
let __historyActionQueue = Promise.resolve();
let __movementWatcherMounted = false;
let __sceneHistoryWatcherMounted = false;
let __movementFlushTimer = null;
let __historyRestoreSuppressedUntil = 0;
const __movementPositions = new Map();
const __pendingMovements = new Map();
const __suppressedMovements = new Map();
const __sceneHistorySnapshot = new Map();
const __historyRestoreSuppressedIds = new Map();
const __movementSegmentListeners = new Set();

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

function normalizeHistory(value) {
  const root = value && typeof value === "object" ? value : {};
  const entries = Array.isArray(root.entries) ? root.entries.filter(Boolean) : [];
  return { ...root, version: HISTORY_VERSION, entries: entries.slice(-MAX_HISTORY_ENTRIES) };
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

async function appendSceneHistoryChanges(changes) {
  if (!changes.length) return;
  const labels = changes.map((change) => change.label);
  const kinds = new Set(changes.map((change) => change.kind));
  const label = labels.length === 1
    ? labels[0]
    : `${labels[0]} (+${labels.length - 1} eventi)`;
  const entry = {
    id: createEntryId(),
    version: HISTORY_VERSION,
    at: Date.now(),
    kind: kinds.size === 1 ? [...kinds][0] : "scene",
    label,
    changes: changes.map((change) => change.change),
  };
  const task = __historyActionQueue.then(
    () => appendEntry(entry),
    () => appendEntry(entry),
  );
  __historyActionQueue = task.catch(() => {});
  await task;
}

export async function mountSceneHistoryWatcher() {
  if (__sceneHistoryWatcherMounted) return;
  if (await OBR.player.getRole() !== "GM") return;
  const initialItems = await OBR.scene.items.getItems();
  __sceneHistorySnapshot.clear();
  for (const item of initialItems) {
    if (item?.id) __sceneHistorySnapshot.set(item.id, cloneValue(item));
  }
  __sceneHistoryWatcherMounted = true;

  subscribeSceneItemChanges(async (event) => {
    const currentItems = Array.isArray(event?.allItems) ? event.allItems : [];
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

    __sceneHistorySnapshot.clear();
    for (const item of currentById.values()) __sceneHistorySnapshot.set(item.id, cloneValue(item));
    if (pending.length) await appendSceneHistoryChanges(pending);
  }, {
    filter: (event) => event.flags.added || event.flags.removed || event.flags.tracker,
  });
}

async function appendEntryNow(entry) {
  const md = await OBR.scene.getMetadata();
  const history = normalizeHistory(md?.[HISTORY_KEY]);
  const entries = [...history.entries, entry].slice(-MAX_HISTORY_ENTRIES);
  await OBR.scene.setMetadata({
    ...md,
    [HISTORY_KEY]: { ...history, version: HISTORY_VERSION, entries },
  });
  try {
    await recordHistoryInCombatLog(entry);
  } catch (err) {
    console.warn("[combat-log] append:", err?.message || err);
  }
}

function appendEntry(entry) {
  const write = () => appendEntryNow(entry);
  __historyWriteQueue = __historyWriteQueue.then(write, write);
  return __historyWriteQueue;
}

export async function withItemMetaHistory(options, action) {
  const itemIds = Array.from(new Set((options?.itemIds || []).filter(Boolean)));
  const fields = Array.from(new Set((options?.fields || []).filter(Boolean)));
  if (!itemIds.length || !fields.length || typeof action !== "function") {
    return typeof action === "function" ? action() : undefined;
  }

  const run = async () => {
    let before;
    try {
      before = await captureItems(itemIds, fields);
    } catch (err) {
      console.warn("[history] capture before:", err?.message || err);
      return action();
    }

    const result = await action();
    try {
      const after = await captureItems(itemIds, fields);
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

      if (changes.length) {
        const entry = {
          id: createEntryId(),
          version: HISTORY_VERSION,
          at: Date.now(),
          kind: String(options?.kind || "change"),
          label: String(options?.label || "Modifica"),
          changes,
        };
        await appendEntry(entry);
        if (typeof options?.onRecorded === "function") {
          try { options.onRecorded(entry); }
          catch (err) { console.warn("[history] onRecorded:", err?.message || err); }
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
  const task = __historyActionQueue.then(run, run);
  __historyActionQueue = task.catch(() => {});
  return task;
}

export async function getHistoryEntries() {
  const md = await OBR.scene.getMetadata();
  return normalizeHistory(md?.[HISTORY_KEY]).entries.slice();
}

export function subscribeMovementSegments(handler) {
  if (typeof handler !== "function") throw new TypeError("handler must be a function");
  __movementSegmentListeners.add(handler);
  return () => __movementSegmentListeners.delete(handler);
}

export function suppressMovementHistory(itemId, expectedPosition, durationMs = 2000) {
  const id = String(itemId || "");
  const position = itemPosition({ position: expectedPosition });
  if (!id || !position) return;
  __pendingMovements.delete(id);
  __suppressedMovements.set(id, {
    until: Date.now() + Math.max(500, Number(durationMs) || 0),
    positions: [position],
  });
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

async function flushPendingMovements() {
  __movementFlushTimer = null;
  const pending = Array.from(__pendingMovements.values());
  __pendingMovements.clear();
  if (!pending.length) return;

  let dpi = 1;
  try {
    const gridDpi = await OBR.scene.grid.getDpi();
    dpi = Math.max(1, Number(gridDpi) || 1);
  } catch {}

  const changes = [];
  for (const move of pending) {
    const hasSegments = Array.isArray(move.segments) && move.segments.length > 0;
    if (!hasSegments && samePosition(move.beforePosition, move.afterPosition)) continue;

    const cells = await measuredMovementCells(move, dpi);
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
    at: Date.now(),
    kind: "move",
    label: changes.length === 1
      ? `Movimento: ${changes[0].name}`
      : `Movimento: ${changes.length} token`,
    changes,
  });
}

function scheduleMovementFlush() {
  if (__movementFlushTimer) clearTimeout(__movementFlushTimer);
  __movementFlushTimer = setTimeout(() => {
    void flushPendingMovements().catch((err) => {
      console.warn("[history] movement record:", err?.message || err);
    });
  }, MOVEMENT_SETTLE_MS);
}

export async function mountMovementHistoryWatcher() {
  if (__movementWatcherMounted) return;
  if (await OBR.player.getRole() !== "GM") return;
  __movementWatcherMounted = true;

  await mountSceneHistoryWatcher();

  OBR.broadcast.onMessage(HISTORY_CONTROL_CHANNEL, (event) => {
    const data = event?.data;
    if (!Array.isArray(data?.ids)) return;
    if (data.type === "suppress-scene-history") {
      markHistoryRestoreSuppressed(data.ids, data.until);
      return;
    }
    if (data.type !== "suppress-movement") return;
    const until = Math.max(Date.now() + 500, Number(data.until) || 0);
    for (const id of data.ids) {
      const positions = Array.isArray(data.positions?.[id])
        ? data.positions[id].map((position) => ({ x: Number(position.x) || 0, y: Number(position.y) || 0 }))
        : [];
      if (id) __suppressedMovements.set(id, { until, positions });
    }
  });

  const initial = await OBR.scene.items.getItems((item) =>
    !!item.metadata?.[META_KEY] && !!itemPosition(item)
  );
  for (const item of initial) __movementPositions.set(item.id, itemPosition(item));

  subscribeSceneItemChanges(async ({ items: changes }) => {
    const now = Date.now();
    let movementChanged = false;
    let nativeUndoAvailable = false;
    try {
      nativeUndoAvailable = await OBR.scene.history.canRedo();
    } catch {}
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

    if (movementChanged) scheduleMovementFlush();
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
        await recordNativeMovementUndo(corrections);
      } catch (err) {
        console.warn("[combat-log] native movement undo:", err?.message || err);
      }
    }
  }, { immediate: true, filter: (event) => event.flags.movement });
}

async function restoreEntry(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const ids = Array.from(new Set(changes.map((change) => change?.id).filter(Boolean)));
  if (!ids.length) return;

  for (const change of changes) {
    const hasSceneSnapshot = Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore") &&
      Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter");
    if (!hasSceneSnapshot) continue;

    const beforeScene = change.sceneBefore;
    const afterScene = change.sceneAfter;
    const existing = await OBR.scene.items.getItems([change.id]);
    if (beforeScene === null && afterScene) {
      if (existing.length) await OBR.scene.items.deleteItems([change.id]);
      continue;
    }
    if (beforeScene && afterScene === null && !existing.length) {
      await OBR.scene.items.addItems([cloneValue(beforeScene)]);
    }
  }

  const existing = await OBR.scene.items.getItems(ids);
  const existingIds = existing.map((item) => item.id);
  if (!existingIds.length) return;

  const byId = new Map(changes.map((change) => [change.id, change]));
  await OBR.scene.items.updateItems(existingIds, (drafts) => {
    for (const item of drafts) {
      const change = byId.get(item.id);
      if (!change) continue;

      if (change.beforePosition) {
        item.position = {
          x: Number(change.beforePosition.x) || 0,
          y: Number(change.beforePosition.y) || 0,
        };
      }

      const fields = Object.entries(change.before || {});
      if (fields.length) {
        const meta = { ...(item.metadata?.[META_KEY] || {}) };
        for (const [field, snapshot] of fields) {
          if (snapshot?.present) meta[field] = cloneValue(snapshot.value);
          else delete meta[field];
        }
        item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
      }
    }
  });
}

async function syncRestoredEntry(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const ids = Array.from(new Set(changes.map((change) => change?.id).filter(Boolean)));
  if (!ids.length) return;

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
      for (const item of items) {
        const meta = item.metadata?.[META_KEY] || {};
        const hasHP =
          Object.prototype.hasOwnProperty.call(meta, "hp") ||
          Object.prototype.hasOwnProperty.call(meta, "hpMax");
        if (!hasHP) {
          await bars.removeHPWidgetsNow(item.id);
          await memory.removeHPFromMemoryByItemId(item.id);
          continue;
        }
        const hp = Math.floor(Number(meta.hp) || 0);
        const hpMax = Math.floor(Number(meta.hpMax) || 0);
        bars.syncHPBarNow(item.id, hp, hpMax);
        await bars.syncHPTextNow(item.id, hp, hpMax);
        await memory.saveHPToMemoryByItemId(item.id, hp, hpMax);
      }
    } catch (err) {
      console.warn("[history] HP sync after undo:", err?.message || err);
    }
  }

  if (restoredConditions) {
    try {
      const { refreshConditionLabels } = await import("./conditions.js");
      await refreshConditionLabels(ids);
    } catch (err) {
      console.warn("[history] condition sync after undo:", err?.message || err);
    }
  }

  if (restoredInitiativeCards) {
    try {
      const { syncInitiativeCardRegistryFromItems } = await import("./initiativeCards.js");
      await syncInitiativeCardRegistryFromItems(ids);
    } catch (err) {
      console.warn("[history] initiative card sync after undo:", err?.message || err);
    }
  }
}

async function undoHistoryThroughNow(entryId) {
  if (await OBR.player.getRole() !== "GM") {
    throw new Error("Solo il GM puo usare Undo.");
  }

  const md = await OBR.scene.getMetadata();
  const history = normalizeHistory(md?.[HISTORY_KEY]);
  if (!history.entries.length) return [];

  const targetIndex = entryId
    ? history.entries.findIndex((entry) => entry?.id === entryId)
    : history.entries.length - 1;
  if (targetIndex < 0) throw new Error("Voce cronologia non trovata.");

  const selected = history.entries.slice(targetIndex);
  const undoOrder = [...selected].reverse();
  const movementPositions = {};
  for (const entry of undoOrder) {
    for (const change of entry?.changes || []) {
      if (!change?.id || !change?.beforePosition) continue;
      const positions = movementPositions[change.id] || [];
      positions.push(change.beforePosition);
      movementPositions[change.id] = positions;
    }
  }
  const movementIds = Object.keys(movementPositions);
  if (movementIds.length) {
    await OBR.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
      type: "suppress-movement",
      ids: movementIds,
      positions: movementPositions,
      until: Date.now() + 2000,
    }, { destination: "LOCAL" });
  }

  const restoredIds = undoOrder.flatMap((entry) =>
    (entry?.changes || []).map((change) => change?.id).filter(Boolean)
  );
  const sceneHistorySuppressedUntil = Date.now() + SCENE_HISTORY_SUPPRESS_MS;
  markHistoryRestoreSuppressed(restoredIds, sceneHistorySuppressedUntil);
  if (restoredIds.length) {
    await OBR.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
      type: "suppress-scene-history",
      ids: restoredIds,
      until: sceneHistorySuppressedUntil,
    }, { destination: "LOCAL" });
  }
  for (const entry of undoOrder) await restoreEntry(entry);
  for (const entry of undoOrder) await syncRestoredEntry(entry);

  const latestMd = await OBR.scene.getMetadata();
  const latest = normalizeHistory(latestMd?.[HISTORY_KEY]);
  const selectedIds = new Set(selected.map((entry) => entry.id));
  const entries = latest.entries.filter((candidate) => !selectedIds.has(candidate?.id));
  await OBR.scene.setMetadata({
    ...latestMd,
    [HISTORY_KEY]: { ...latest, version: HISTORY_VERSION, entries },
  });
  try {
    await recordCombatUndo(undoOrder);
  } catch (err) {
    console.warn("[combat-log] undo event:", err?.message || err);
  }

  return undoOrder;
}

export async function undoHistoryThrough(entryId) {
  // Anche Undo deve attendere un'eventuale operazione metadata in corso:
  // altrimenti il suo ripristino può essere seguito dallo snapshot finale
  // dell'azione e sembrare inefficace fino a un secondo tentativo.
  const task = __historyActionQueue.then(
    () => undoHistoryThroughNow(entryId),
    () => undoHistoryThroughNow(entryId),
  );
  __historyActionQueue = task.catch(() => {});
  return task;
}

export async function undoLastHistoryEntry() {
  const entries = await undoHistoryThrough();
  return entries[0] || null;
}
