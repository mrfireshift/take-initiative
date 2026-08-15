import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const HISTORY_CONTROL_CHANNEL = "com.thebigpicture.initiative/history-control";
const clone = (value) => structuredClone(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sceneState = {
  ready: true,
  metadata: {},
  items: [{
    id: "token-movement",
    name: "Token movimento",
    layer: "CHARACTER",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 10, hpMax: 10 } },
  }],
};
const itemListeners = new Set();
const readyListeners = new Set();
const broadcastListeners = new Map();
const readyCallbacks = [];
let droppedHistoryUndoSuppressions = 0;
let gridDpi = 1;
let gridDistanceAvailable = true;

function currentItems(selector) {
  if (typeof selector === "function") return sceneState.items.filter(selector).map(clone);
  const wanted = Array.isArray(selector) ? new Set(selector) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item.id))
    .map(clone);
}

async function emitItems(source = null) {
  const snapshot = currentItems();
  for (const listener of [...itemListeners]) await listener(snapshot, source);
}

const sdkStub = {
  onReady(callback) {
    readyCallbacks.push(callback);
  },
  player: { getRole: async () => "GM" },
  room: { id: "history-movement-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      onChange(listener) {
        itemListeners.add(listener);
        return () => itemListeners.delete(listener);
      },
      getItems: async (selector) => currentItems(selector),
      updateItems: async (ids, updater) => {
        const wanted = new Set(ids || []);
        const drafts = sceneState.items.filter((item) => wanted.has(item.id)).map(clone);
        await updater(drafts);
        const replacements = new Map(drafts.map((item) => [item.id, clone(item)]));
        sceneState.items = sceneState.items.map((item) => replacements.get(item.id) || item);
        await emitItems();
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
        await emitItems();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        await emitItems();
      },
    },
    grid: {
      getDpi: async () => gridDpi,
      getScale: async () => ({ parsed: { multiplier: 1, unit: "m" } }),
      getDistance: async (from, to) => {
        if (!gridDistanceAvailable) throw new Error("grid-distance-unavailable");
        return Math.hypot(to.x - from.x, to.y - from.y) / gridDpi;
      },
    },
    history: { canRedo: async () => false },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      const dispatch = async () => {
        for (const listener of [...(broadcastListeners.get(channel) || [])]) {
          await listener({ data: clone(data) });
        }
      };
      if (channel === HISTORY_CONTROL_CHANNEL && data?.type === "suppress-history-undo") {
        if (droppedHistoryUndoSuppressions > 0) {
          droppedHistoryUndoSuppressions -= 1;
          return;
        }
        setTimeout(() => { void dispatch(); }, 25);
        return;
      }
      await dispatch();
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const combatLog = await import("../src/combatLog.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
  for (const callback of readyCallbacks) callback();
  await wait(0);
  await history.mountMovementHistoryWatcher();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

test("Undo di movimenti arbitrari ripristina la posizione senza registrare il ritorno come nuovo movimento", async () => {
  const destinations = [
    { x: 3, y: 4 },
    { x: 2.5, y: 0 },
    { x: -4, y: 1.5 },
  ];

  for (const destination of destinations) {
    const origin = clone(sceneState.items[0].position);
    await sdkStub.scene.items.updateItems(["token-movement"], (drafts) => {
      drafts[0].position = clone(destination);
    });
    await wait(450);

    const recorded = await history.getHistoryEntries();
    assert.equal(recorded.length, 1, `movimento verso ${JSON.stringify(destination)}`);
    assert.equal(recorded[0].kind, "move");
    assert.deepEqual(recorded[0].changes[0].beforePosition, origin);
    assert.deepEqual(recorded[0].changes[0].afterPosition, destination);
    const expectedCells = Math.round(Math.hypot(
      destination.x - origin.x,
      destination.y - origin.y,
    ) * 100) / 100;
    assert.equal(recorded[0].changes[0].movement.cells, expectedCells);

    const undone = await history.undoHistoryThrough(recorded[0].id, {
      sceneEpoch: currentSceneEpoch(),
    });
    assert.equal(undone.status, "applied");
    assert.deepEqual(sceneState.items[0].position, origin);

    // The movement watcher settles after the canonical Undo. If suppression is
    // installed too late, this is where the inverse movement re-enters History.
    await wait(450);
    assert.deepEqual(await history.getHistoryEntries(), []);
  }
});

test("un ACK anti-race perso non scrive e lo stesso Undo resta ripetibile", async () => {
  const origin = clone(sceneState.items[0].position);
  const destination = { x: 1.25, y: -2.75 };
  await sdkStub.scene.items.updateItems(["token-movement"], (drafts) => {
    drafts[0].position = clone(destination);
  });
  await wait(450);

  const [entry] = await history.getHistoryEntries();
  assert.ok(entry);
  droppedHistoryUndoSuppressions = 1;
  const first = await history.undoHistoryThrough(entry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(first.status, "failed");
  assert.deepEqual(sceneState.items[0].position, destination);
  assert.deepEqual((await history.getHistoryEntries()).map((value) => value.id), [entry.id]);

  const retried = await history.undoHistoryThrough(entry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(retried.status, "applied");
  assert.deepEqual(sceneState.items[0].position, origin);
  await wait(450);
  assert.deepEqual(await history.getHistoryEntries(), []);
});

test("una entry movimento legacy usa il DPI reale senza assumere una distanza fissa", async () => {
  const origin = clone(sceneState.items[0].position);
  const destination = { x: 15, y: 20 };
  gridDpi = 10;
  gridDistanceAvailable = false;
  await sdkStub.scene.items.updateItems(["token-movement"], (drafts) => {
    drafts[0].position = clone(destination);
  });
  await wait(450);

  const [entry] = await history.getHistoryEntries();
  assert.equal(entry?.changes?.[0]?.movement?.cells, 2.5);
  delete sceneState.metadata[HISTORY_KEY].entries[0].changes[0].movement;

  const undone = await history.undoHistoryThrough(entry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undone.status, "applied");
  assert.deepEqual(sceneState.items[0].position, origin);
  await wait(450);
  assert.deepEqual(await history.getHistoryEntries(), []);

  const data = await combatLog.getActiveCombatLogData({ sceneEpoch: currentSceneEpoch() });
  const correction = [...data.events].reverse().find((event) => (
    event?.action === "move-undo"
    && event?.payload?.undoSource === "history"
    && event?.targets?.some((target) => target?.undoOfHistoryEntryId === entry.id)
  ));
  assert.ok(correction);
  assert.equal(correction.targets[0].cells, -2.5);

  gridDpi = 1;
  gridDistanceAvailable = true;
});
