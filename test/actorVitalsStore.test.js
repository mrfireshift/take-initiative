import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "node:test";

const sdkStub = {
  onReady: () => {},
  room: { getMetadata: async () => ({}) },
  scene: {
    items: {
      getItems: async () => [],
      onChange: () => () => {},
      updateItems: async () => {},
    },
  },
};
mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdkStub },
});

const { createActorVitalsStore, ACTOR_VITALS_ROOM_KEY } =
  await import("../src/actorVitalsStore.js");

class Storage {
  constructor(value = null) {
    this.value = value;
    this.writes = 0;
  }

  getItem() {
    return this.value;
  }

  setItem(_key, value) {
    this.writes += 1;
    this.value = value;
  }
}

class RoomHarness {
  constructor(metadata = {}) {
    this.metadata = structuredClone(metadata);
    this.setCalls = [];
    this.pending = [];
    this.listeners = new Set();
  }

  api() {
    return {
      getMetadata: async () => structuredClone(this.metadata),
      setMetadata: (update) => new Promise((resolve) => {
        const operation = { update: structuredClone(update), resolve };
        this.pending.push(operation);
        this.setCalls.push(operation.update);
      }),
      onMetadataChange: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }

  commitNext() {
    const operation = this.pending.shift();
    if (!operation) throw new Error("no pending operation");
    this.metadata = { ...this.metadata, ...structuredClone(operation.update) };
    operation.resolve();
    for (const listener of this.listeners) listener(structuredClone(this.metadata));
  }
}

function alwaysCurrent() {
  return true;
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

test("una lettura del registry non scrive metadata Room", async () => {
  const room = new RoomHarness({ [ACTOR_VITALS_ROOM_KEY]: { actors: {} } });
  const store = createActorVitalsStore({
    api: room.api(),
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  await store.read();
  assert.equal(room.setCalls.length, 0);
});

test("il writer key-scoped conserva metadata Room estranei", async () => {
  const room = new RoomHarness({ other: { keep: true } });
  const store = createActorVitalsStore({
    api: room.api(),
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  const write = store.write({ schemaVersion: 1, actors: {
    actor: { hp: 8, hpMax: 10, updatedAt: 1, revision: 1 },
  } }, { sceneEpoch: 1 });
  await flush();
  assert.deepEqual(Object.keys(room.setCalls[0]), [ACTOR_VITALS_ROOM_KEY]);
  room.commitNext();
  await write;
  assert.deepEqual(room.metadata.other, { keep: true });
});

test("la coda serializza aggiornamenti concorrenti e conserva entrambi", async () => {
  const room = new RoomHarness();
  const store = createActorVitalsStore({
    api: room.api(),
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  const first = store.saveCanonicalHP("actor-a", 4, 10, { sceneEpoch: 1 });
  const second = store.saveCanonicalHP("actor-b", 7, 12, { sceneEpoch: 1 });
  await flush();
  room.commitNext();
  await flush();
  room.commitNext();
  await Promise.all([first, second]);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.actors["actor-a"].hp, 4);
  assert.equal(snapshot.actors["actor-b"].hp, 7);
});

test("al cambio scena lo stato Room sostituisce HP presenti ma obsoleti", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 12, hpMax: 27, updatedAt: 20, revision: 4 } },
    },
  });
  const item = {
    id: "scene-b-token",
    name: "Aria cambiata",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 3,
        hpMax: 27,
      },
    },
  };
  const itemsApi = {
    getItems: async () => [item],
    updateItems: async (_ids, updater) => updater([item]),
  };
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi,
    storage: new Storage(),
    getSceneEpoch: () => 2,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  await store.reconcileCurrentScene(2);
  assert.equal(item.metadata["com.thebigpicture.initiative/meta"].hp, 12);
  assert.equal(item.metadata["com.thebigpicture.initiative/meta"].hpMax, 27);
});

test("un record actorVitals parziale non blocca l'inizializzazione canonica", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 2, future: "keep" } },
    },
  });
  const item = {
    id: "scene-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 8,
        hpMax: 10,
      },
    },
  };
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi: {
      getItems: async () => [item],
      updateItems: async () => {},
    },
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  const reconcile = store.reconcileCurrentScene(1);
  await flush();
  room.commitNext();
  await reconcile;
  assert.equal(store.getSnapshot().actors["actor-a"].hp, 8);
  assert.equal(store.getSnapshot().actors["actor-a"].future, "keep");
});

test("due token attivi con lo stesso actorProfileId usano il primario deterministico", async () => {
  const room = new RoomHarness();
  const first = {
    id: "a-token",
    metadata: { "com.thebigpicture.initiative/meta": { actorProfileId: "actor-a", hp: 5, hpMax: 10 } },
  };
  const second = {
    id: "b-token",
    metadata: { "com.thebigpicture.initiative/meta": { actorProfileId: "actor-a", hp: 9, hpMax: 10 } },
  };
  const itemsApi = {
    getItems: async () => [first, second],
    updateItems: async (_ids, updater) => updater([first, second]),
  };
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi,
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  const reconcile = store.reconcileSceneItems([second, first], 1);
  await flush();
  room.commitNext();
  await reconcile;
  assert.equal(store.getSnapshot().actors["actor-a"].hp, 5);
  assert.equal(second.metadata["com.thebigpicture.initiative/meta"].hp, 5);
});

test("subscription Room riallinea il token e un evento riflesso non crea un loop", async () => {
  const room = new RoomHarness();
  const item = {
    id: "scene-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 4,
        hpMax: 10,
      },
    },
  };
  let itemHandler = null;
  let sceneItems = [];
  const itemsApi = {
    getItems: async () => sceneItems,
    updateItems: async (_ids, updater) => updater([item]),
  };
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi,
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: (handler) => {
      itemHandler = handler;
      return () => { itemHandler = null; };
    },
    subscribeEpoch: () => () => {},
  });
  await store.start();
  sceneItems = [item];

  const firstEvent = itemHandler({
    sceneEpoch: 1,
    revision: 1,
    items: [item],
    allItems: [item],
    flags: { hpBars: true },
    domains: ["hp"],
  });
  await flush();
  room.commitNext();
  await firstEvent;
  const writesAfterFirstHP = room.setCalls.length;

  await itemHandler({
    sceneEpoch: 1,
    revision: 2,
    items: [item],
    allItems: [item],
    flags: { hpBars: true },
    domains: ["hp"],
  });
  await flush();
  assert.equal(room.setCalls.length, writesAfterFirstHP);
  store.stop();
});

test("un evento di una scena precedente viene scartato dall'epoch guard", async () => {
  const room = new RoomHarness();
  let currentEpoch = 2;
  const store = createActorVitalsStore({
    api: room.api(),
    storage: new Storage(),
    getSceneEpoch: () => currentEpoch,
    isSceneEpochCurrent: (epoch) => Number(epoch) === currentEpoch,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  await store.saveCanonicalHP("actor-old", 2, 10, { sceneEpoch: 1 });
  assert.equal(room.setCalls.length, 0);
  currentEpoch = 1;
  const save = store.saveCanonicalHP("actor-current", 8, 10, { sceneEpoch: 1 });
  await flush();
  room.commitNext();
  await save;
  assert.equal(store.getSnapshot().actors["actor-current"].hp, 8);
});
