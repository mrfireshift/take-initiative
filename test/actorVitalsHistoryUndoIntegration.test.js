import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";
import { classifySceneItemChanges } from "../src/sceneItemChangeDispatcherCore.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: {
    id: "actor-vitals-history-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => {
      roomMetadata = { ...roomMetadata, ...clone(update) };
    },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (update) => {
      sceneMetadata = { ...sceneMetadata, ...clone(update) };
    },
    items: {
      getItems: async (ids) => clone(sceneItems.filter((item) => (
        !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))
      ))),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((item) => (
          typeof ids === "function" ? ids(item) : ids.includes(item.id)
        )));
        updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneItems = sceneItems.map((item) => byId.get(item.id) || item);
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); },
      deleteItems: async (ids) => {
        sceneItems = sceneItems.filter((item) => !ids.includes(item.id));
      },
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildLabel() {},
    buildImage() {},
    buildText() {},
    buildPath() {},
    buildShape() {},
    Command: class {},
  },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const {
  ACTOR_VITALS_ROOM_KEY,
  createActorVitalsStore,
} = await import("../src/actorVitalsStore.js");

function token(id) {
  return {
    id,
    name: id,
    type: "IMAGE",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        actorProfileId: "actor-a",
        attitude: "pc",
      },
    },
  };
}

function tokenMeta(id) {
  return sceneItems.find((item) => item.id === id).metadata[META_KEY];
}

function hpPropertiesAreAbsent(id) {
  const meta = tokenMeta(id);
  return !Object.hasOwn(meta, "hp") && !Object.hasOwn(meta, "hpMax");
}

async function assignHPWithHistory(updates) {
  return history.withItemMetaHistory({
    itemIds: updates.map((update) => update.itemId),
    fields: ["hp", "hpMax"],
    kind: "hp",
    label: "Assegna HP",
  }, () => effects.runEffectsMutation([{
    type: "hp:set",
    updates,
  }], { transport: "background", history: false }));
}

async function createStartedActorStore() {
  let itemHandler = null;
  const store = createActorVitalsStore({
    api: sdk.room,
    itemsApi: sdk.scene.items,
    storage: null,
    getSceneEpoch: currentSceneEpoch,
    isSceneEpochCurrent: (epoch) => Number(epoch) === Number(currentSceneEpoch()),
    subscribeItems: (handler) => {
      itemHandler = handler;
      return () => { itemHandler = null; };
    },
    subscribeEpoch: () => () => {},
  });
  await store.start();
  return {
    store,
    deliver: async (before, after, revision, { reverse = false } = {}) => {
      const event = classifySceneItemChanges(before, after);
      if (reverse) event.items.reverse();
      if (reverse) event.allItems.reverse();
      event.sceneEpoch = currentSceneEpoch();
      event.revision = revision;
      await itemHandler(event);
    },
  };
}

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  sdk.room.id = `actor-vitals-history-room-${++testSequence}`;
  sceneItems = [token("a")];
  sceneMetadata = {
    [HISTORY_KEY]: {
      version: 1,
      roomId: sdk.room.id,
      entries: [],
    },
  };
  roomMetadata = {};
  markSceneEpochReady("actor-vitals-history-test");
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
});

test("Undo produttivo a HP assenti resta assente dopo un nuovo bootstrap actorVitals", async () => {
  let runtime = await createStartedActorStore();
  const beforeAssignment = clone(sceneItems);
  const assignment = await assignHPWithHistory([
    { itemId: "a", hp: 7, hpMax: 10 },
  ]);
  assert.equal(assignment.status, "applied");
  const afterAssignment = clone(sceneItems);
  await runtime.deliver(beforeAssignment, afterAssignment, 1);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  assert.equal(runtime.store.getSnapshot().actors["actor-a"].hp, 7);

  const undo = await history.undoHistoryThrough(entries[0].id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undo.status, "applied", JSON.stringify(undo));
  const afterUndo = clone(sceneItems);
  assert.equal(hpPropertiesAreAbsent("a"), true);
  await runtime.deliver(afterAssignment, afterUndo, 2);
  assert.equal(runtime.store.getSnapshot().actors["actor-a"].hpState, "absent");

  runtime.store.stop();
  runtime = await createStartedActorStore();
  assert.equal(hpPropertiesAreAbsent("a"), true);
  assert.equal(runtime.store.getSnapshot().actors["actor-a"].hpState, "absent");
  assert.equal(roomMetadata[ACTOR_VITALS_ROOM_KEY].actors["actor-a"].hpState, "absent");
  runtime.store.stop();
});

test("due duplicati aggiornati e poi annullati convergono sull'assenza del primario", async () => {
  sceneItems = [token("a"), token("b")];
  const runtime = await createStartedActorStore();
  const beforeAssignment = clone(sceneItems);
  const assignment = await assignHPWithHistory([
    { itemId: "a", hp: 7, hpMax: 10 },
    { itemId: "b", hp: 7, hpMax: 10 },
  ]);
  assert.equal(assignment.status, "applied");
  const afterAssignment = clone(sceneItems);
  await runtime.deliver(beforeAssignment, afterAssignment, 1, { reverse: true });
  assert.equal(runtime.store.getSnapshot().actors["actor-a"].hp, 7);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  const undo = await effects.undoEffectsMutation(entries[0], { transport: "background" });
  assert.equal(undo.status, "applied", JSON.stringify(undo));
  const afterUndo = clone(sceneItems);
  await runtime.deliver(afterAssignment, afterUndo, 2, { reverse: true });

  assert.equal(hpPropertiesAreAbsent("a"), true);
  assert.equal(hpPropertiesAreAbsent("b"), true);
  assert.equal(runtime.store.getSnapshot().actors["actor-a"].hpState, "absent");
  await runtime.store.reconcileCurrentScene(currentSceneEpoch());
  assert.equal(hpPropertiesAreAbsent("a"), true);
  assert.equal(hpPropertiesAreAbsent("b"), true);
  runtime.store.stop();
});
