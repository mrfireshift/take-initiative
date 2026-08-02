import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { recordCombatUndo, recordHistoryInCombatLog, recordNativeMovementUndo } from "./combatLog.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  runSceneEpochSteps,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import {
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "./metadataKeyScoped.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;
const HISTORY_KEY = `${ID}/history`;
const HISTORY_CONTROL_CHANNEL = `${ID}/history-control`;
const HISTORY_VERSION = 1;
const MAX_HISTORY_ENTRIES = 30;
const MOVEMENT_SETTLE_MS = 350;
const SCENE_HISTORY_SUPPRESS_MS = 2000;
const INITIATIVE_HISTORY_FIELDS = ["inInitiative", "initiative", "attitude"];
const EFFECTS_HISTORY_FIELDS = ["conditions", "spells", "concentrations"];

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
let __sceneHistoryBaselineEpoch = null;
let __sceneEpochUnsubscribe = null;
let __movementFlushEpoch = null;

function replaceSceneHistorySnapshot(items = []) {
  __sceneHistorySnapshot.clear();
  for (const item of items || []) {
    if (item?.id) __sceneHistorySnapshot.set(item.id, cloneValue(item));
  }
}

function resetSceneHistoryRuntime(epoch) {
  if (__movementFlushTimer) clearTimeout(__movementFlushTimer);
  __movementFlushTimer = null;
  __movementFlushEpoch = null;
  __movementPositions.clear();
  __pendingMovements.clear();
  __suppressedMovements.clear();
  __sceneHistorySnapshot.clear();
  __historyRestoreSuppressedIds.clear();
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
    at: Date.now(),
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

async function appendEntryNow(entry, sceneEpoch) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  const md = await OBR.scene.getMetadata();
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  const history = normalizeHistory(md?.[HISTORY_KEY]);
  const entries = [
    ...history.entries.filter((candidate) => candidate?.id !== entry?.id),
    entry,
  ].slice(-MAX_HISTORY_ENTRIES);
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  await writeSceneMetadataKey(
    OBR.scene,
    METADATA_OWNERSHIP.HISTORY,
    { ...history, version: HISTORY_VERSION, entries },
    { runtime: "history" },
  );
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  try {
    await recordHistoryInCombatLog(entry, { sceneEpoch });
  } catch (err) {
    console.warn("[combat-log] append:", err?.message || err);
  }
  return true;
}

function appendEntry(entry, { sceneEpoch = currentSceneEpoch() } = {}) {
  const write = () => appendEntryNow(entry, sceneEpoch);
  __historyWriteQueue = __historyWriteQueue.then(write, write);
  return __historyWriteQueue;
}

function effectHistoryFieldSnapshot(value) {
  return cloneValue(value);
}

function effectHistoryChange(change) {
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
  const metadataFields = Object.fromEntries(
    Object.entries(change?.metadataFields || {}).filter(([, touched]) => touched)
  );
  if (Object.keys(metadataFields).length) {
    output.metadataFields = metadataFields;
    output.beforeMetadata = cloneValue(change.beforeMetadata || {});
    output.afterMetadata = cloneValue(change.afterMetadata || {});
  }
  return output;
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
} = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return null;
  const changes = (Array.isArray(plan?.changes) ? plan.changes : [])
    .map((change) => {
      const effectChange = effectHistoryChange(change);
      if (effectChange) return effectChange;
      const metadataFields = Object.fromEntries(
        Object.entries(change?.metadataFields || {}).filter(([, touched]) => touched)
      );
      if (!Object.keys(metadataFields).length) return null;
      return {
        id: change.id,
        fields: {},
        before: {},
        after: {},
        metadataFields,
        beforeMetadata: cloneValue(change.beforeMetadata || {}),
        afterMetadata: cloneValue(change.afterMetadata || {}),
      };
    })
    .filter(Boolean);
  if (!changes.length) return null;

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
  const entry = {
    id: command.commandId ? `effects-history:${command.commandId}` : createEntryId(),
    version: HISTORY_VERSION,
    at: Date.now(),
    kind: String(historyOptions.kind || command.kind || "effects").trim() || "effects",
    label: String(historyOptions.label || command.label || "Modifica effetti").trim() || "Modifica effetti",
    changes,
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
      sideEffects: cloneValue(commitResult?.sideEffectChanges || []),
    },
  };
  await appendEntry(entry, { sceneEpoch });
  return entry;
}

export async function withItemMetaHistory(options, action) {
  const itemIds = Array.from(new Set((options?.itemIds || []).filter(Boolean)));
  const fields = Array.from(new Set((options?.fields || []).filter(Boolean)));
  const sceneItemIds = Array.from(new Set((options?.sceneItemIds || []).filter(Boolean)));
  const sceneEpoch = options?.sceneEpoch ?? currentSceneEpoch();
  const captureMetadata = itemIds.length > 0 && fields.length > 0;
  if ((!captureMetadata && !sceneItemIds.length) || typeof action !== "function") {
    return typeof action === "function" && isCurrentSceneEpoch(sceneEpoch)
      ? action()
      : undefined;
  }

  const run = async () => {
    if (!isCurrentSceneEpoch(sceneEpoch)) return undefined;
    let before = [];
    let sceneBefore = [];
    try {
      [before, sceneBefore] = await Promise.all([
        captureMetadata ? captureItems(itemIds, fields) : [],
        captureSceneItems(sceneItemIds),
      ]);
    } catch (err) {
      console.warn("[history] capture before:", err?.message || err);
      if (!isCurrentSceneEpoch(sceneEpoch)) return undefined;
      return action();
    }

    if (!isCurrentSceneEpoch(sceneEpoch)) return undefined;
    const result = await action();
    if (!isCurrentSceneEpoch(sceneEpoch)) return result;
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

      if (changes.length && isCurrentSceneEpoch(sceneEpoch)) {
        let entry = {
          id: createEntryId(),
          version: HISTORY_VERSION,
          at: Date.now(),
          kind: String(options?.kind || "change"),
          label: String(options?.label || "Modifica"),
          changes,
        };
        if (typeof options?.decorateEntry === "function") {
          const decorated = await options.decorateEntry(entry);
          if (decorated && typeof decorated === "object") entry = decorated;
        }
        await appendEntry(entry, { sceneEpoch });
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
  if (options?.inline === true) return run();
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
    at: Date.now(),
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

async function restoreEntry(entry, sceneEpoch) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  if (entryTouchesEffects(entry)) {
    const { undoEffectsMutation } = await import("./effectsMutations.js");
    const mutation = await undoEffectsMutation(entry, {
      sceneEpoch,
    });
    return mutation.status === "applied" && isCurrentSceneEpoch(sceneEpoch);
  }
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const ids = Array.from(new Set(changes.map((change) => change?.id).filter(Boolean)));
  if (!ids.length) return true;

  const sceneDeleteIds = [];
  const sceneAdditions = [];
  for (const change of changes) {
    const hasSceneSnapshot = Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore") &&
      Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter");
    if (!hasSceneSnapshot) continue;

    const beforeScene = change.sceneBefore;
    const afterScene = change.sceneAfter;
    const existing = await OBR.scene.items.getItems([change.id]);
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    if (beforeScene === null && afterScene) {
      if (existing.length) sceneDeleteIds.push(change.id);
      continue;
    }
    if (beforeScene && afterScene === null && !existing.length) {
      sceneAdditions.push(cloneValue(beforeScene));
    }
  }
  if (sceneDeleteIds.length) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    await OBR.scene.items.deleteItems(sceneDeleteIds);
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  }

  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  const existing = await OBR.scene.items.getItems(ids);
  if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  const existingIds = existing.map((item) => item.id);
  if (existingIds.length) {
    const byId = new Map(changes.map((change) => [change.id, change]));
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    await OBR.scene.items.updateItems(existingIds, (drafts) => {
      if (!isCurrentSceneEpoch(sceneEpoch)) return;
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
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  }
  if (sceneAdditions.length) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
    await OBR.scene.items.addItems(sceneAdditions);
    if (!isCurrentSceneEpoch(sceneEpoch)) return false;
  }
  return true;
}

async function syncRestoredEntry(entry, sceneEpoch) {
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
      console.warn("[history] initiative card sync after undo:", err?.message || err);
    }
  }
  return isCurrentSceneEpoch(sceneEpoch);
}

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
  Object.defineProperty(output, "status", {
    value: result.status || "applied",
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(output, "result", {
    value: result,
    enumerable: false,
    configurable: true,
  });
  return output;
}

async function undoHistoryThroughNow(entryId, sceneEpoch) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  if (await OBR.player.getRole() !== "GM") {
    throw new Error("Solo il GM puo usare Undo.");
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];

  const md = await OBR.scene.getMetadata();
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const history = normalizeHistory(md?.[HISTORY_KEY]);
  if (!history.entries.length) return [];

  const targetIndex = entryId
    ? history.entries.findIndex((entry) => entry?.id === entryId)
    : history.entries.length - 1;
  if (targetIndex < 0) throw new Error("Voce cronologia non trovata.");

  const selected = history.entries.slice(targetIndex);
  const undoOrder = [...selected].reverse();

  // ARCH-003 entries are undone by the effects coordinator.  This validates
  // every touched field against the recorded `after` value at the queue head
  // and never restores an entire token metadata object.
  const coordinatedBatch = undoOrder.some(entryTouchesEffects);
  if (coordinatedBatch) {
    const { undoEffectsMutation } = await import("./effectsMutations.js");
    const undoCommandId = `effects-undo:${sceneEpoch}:${undoOrder
      .map((entry) => String(entry?.id || ""))
      .join(":")}`;
    const mutation = await undoEffectsMutation(undoOrder, {
      sceneEpoch,
      kind: "effects:undo",
      label: "Annulla modifica effetti",
      commandId: undoCommandId,
    });
    if (mutation.status !== "applied") return decorateUndoResult([], mutation);

    const postCommitErrors = [
      ...(Array.isArray(mutation?.commitResult?.postCommitErrors)
        ? mutation.commitResult.postCommitErrors
        : []),
    ];
    const restoredIds = Array.from(new Set(
      (mutation?.plan?.changedIds || []).filter(Boolean)
    ));
    const sceneHistorySuppressedUntil = Date.now() + SCENE_HISTORY_SUPPRESS_MS;
    markHistoryRestoreSuppressed(restoredIds, sceneHistorySuppressedUntil);
    if (restoredIds.length) {
      try {
        await OBR.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
          type: "suppress-scene-history",
          ids: restoredIds,
          until: sceneHistorySuppressedUntil,
        }, { destination: "LOCAL" });
      } catch (error) {
        postCommitErrors.push({
          phase: "history-suppression-broadcast",
          message: String(error?.message || error),
        });
      }
    }
    const synchronized = await runSceneEpochSteps({
      sceneEpoch,
      isCurrent: isCurrentSceneEpoch,
      steps: [(epoch) => syncRestoredEntry({
        changes: (mutation.plan?.changes || []).map((change) => ({
          id: change.id,
          // syncRestoredEntry uses `before` as the restored snapshot.
          before: {
            ...(change.after || {}),
            ...(change.afterMetadata || {}),
          },
        })),
      }, epoch)],
    });
    if (!synchronized) {
      postCommitErrors.push({
        phase: "undo-derived-state-sync",
        message: "scene-changed-during-post-commit-sync",
      });
    }

    if (isCurrentSceneEpoch(sceneEpoch)) {
      try {
        const latestMd = await OBR.scene.getMetadata();
        if (!isCurrentSceneEpoch(sceneEpoch)) {
          postCommitErrors.push({
            phase: "undo-history-cleanup",
            message: "stale-after-history-read",
          });
        } else {
          const latest = normalizeHistory(latestMd?.[HISTORY_KEY]);
          const selectedIds = new Set(selected.map((entry) => entry.id));
          const entries = latest.entries.filter((candidate) => !selectedIds.has(candidate?.id));
          await writeSceneMetadataKey(
            OBR.scene,
            METADATA_OWNERSHIP.HISTORY,
            { ...latest, version: HISTORY_VERSION, entries },
            { runtime: "history" },
          );
        }
      } catch (error) {
        postCommitErrors.push({
          phase: "undo-history-cleanup",
          message: String(error?.message || error),
        });
      }
    } else {
      postCommitErrors.push({
        phase: "undo-history-cleanup",
        message: "stale-before-history-cleanup",
      });
    }
    try {
      await recordCombatUndo(undoOrder, { sceneEpoch });
    } catch (err) {
      postCommitErrors.push({
        phase: "combat-log-undo",
        message: String(err?.message || err),
      });
      console.warn("[combat-log] undo event:", err?.message || err);
    }
    return decorateUndoResult(undoOrder, { ...mutation, postCommitErrors });
  }

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
    if (!isCurrentSceneEpoch(sceneEpoch)) return [];
    await OBR.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
      type: "suppress-movement",
      ids: movementIds,
      positions: movementPositions,
      until: Date.now() + 2000,
    }, { destination: "LOCAL" });
    if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  }

  const restoredIds = undoOrder.flatMap((entry) =>
    (entry?.changes || []).map((change) => change?.id).filter(Boolean)
  );
  const sceneHistorySuppressedUntil = Date.now() + SCENE_HISTORY_SUPPRESS_MS;
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  markHistoryRestoreSuppressed(restoredIds, sceneHistorySuppressedUntil);
  if (restoredIds.length) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return [];
    await OBR.broadcast.sendMessage(HISTORY_CONTROL_CHANNEL, {
      type: "suppress-scene-history",
      ids: restoredIds,
      until: sceneHistorySuppressedUntil,
    }, { destination: "LOCAL" });
    if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  }
  const restored = await runSceneEpochSteps({
    sceneEpoch,
    isCurrent: isCurrentSceneEpoch,
    steps: undoOrder.map((entry) => (epoch) => restoreEntry(entry, epoch)),
  });
  if (!restored) return [];
  const synchronized = await runSceneEpochSteps({
    sceneEpoch,
    isCurrent: isCurrentSceneEpoch,
    steps: undoOrder.map((entry) => (epoch) => syncRestoredEntry(entry, epoch)),
  });
  if (!synchronized) return [];

  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const latestMd = await OBR.scene.getMetadata();
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const latest = normalizeHistory(latestMd?.[HISTORY_KEY]);
  const selectedIds = new Set(selected.map((entry) => entry.id));
  const entries = latest.entries.filter((candidate) => !selectedIds.has(candidate?.id));
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  await writeSceneMetadataKey(
    OBR.scene,
    METADATA_OWNERSHIP.HISTORY,
    { ...latest, version: HISTORY_VERSION, entries },
    { runtime: "history" },
  );
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  try {
    await recordCombatUndo(undoOrder, { sceneEpoch });
    if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  } catch (err) {
    console.warn("[combat-log] undo event:", err?.message || err);
  }

  return decorateUndoResult(undoOrder, { status: "applied" });
}

export async function undoHistoryThrough(entryId) {
  const sceneEpoch = currentSceneEpoch();
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  // Anche Undo deve attendere un'eventuale operazione metadata in corso:
  // altrimenti il suo ripristino può essere seguito dallo snapshot finale
  // dell'azione e sembrare inefficace fino a un secondo tentativo.
  const task = __historyActionQueue.then(
    () => undoHistoryThroughNow(entryId, sceneEpoch),
    () => undoHistoryThroughNow(entryId, sceneEpoch),
  );
  __historyActionQueue = task.catch(() => {});
  return task;
}

export async function undoLastHistoryEntry() {
  const entries = await undoHistoryThrough();
  return entries[0] || null;
}
