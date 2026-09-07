import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "node:test";
import { classifySceneItemChanges } from "../src/sceneItemChangeDispatcherCore.js";

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

  emit(metadata = this.metadata) {
    this.metadata = structuredClone(metadata);
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

function actorToken(id, hp = 10, hpMax = 10, actorProfileId = "actor-a") {
  const actor = {
    id,
    layer: "CHARACTER",
    metadata: {
      "com.thebigpicture.initiative/meta": { actorProfileId },
    },
  };
  if (hp !== null) actor.metadata["com.thebigpicture.initiative/meta"].hp = hp;
  if (hpMax !== null) actor.metadata["com.thebigpicture.initiative/meta"].hpMax = hpMax;
  return actor;
}

function actorRegistry(hp = 10, hpMax = 10, updatedAt = 1, revision = 1) {
  return {
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp, hpMax, updatedAt, revision } },
    },
  };
}

async function settleRoomTask(room, task) {
  await flush();
  if (room.pending.length) room.commitNext();
  return task;
}

async function createEventHarness({
  sceneItems,
  roomMetadata = actorRegistry(),
  storage = new Storage(),
  currentEpoch = () => 1,
  isCurrent = (epoch) => Number(epoch) === Number(currentEpoch()),
  api = null,
  logger = console,
} = {}) {
  const room = api ? null : new RoomHarness(roomMetadata);
  let items = sceneItems;
  let itemHandler = null;
  let updateCalls = 0;
  const store = createActorVitalsStore({
    api: api || room.api(),
    itemsApi: {
      getItems: async () => items,
      updateItems: async (ids, updater) => {
        updateCalls += 1;
        updater(items.filter((item) => ids.includes(item.id)));
      },
    },
    storage,
    getSceneEpoch: currentEpoch,
    isSceneEpochCurrent: isCurrent,
    subscribeItems: (handler) => {
      itemHandler = handler;
      return () => { itemHandler = null; };
    },
    subscribeEpoch: () => () => {},
    logger,
  });
  await store.start();
  return {
    room,
    store,
    getItems: () => items,
    setItems: (next) => { items = next; },
    dispatch: (event) => itemHandler(event),
    updateCalls: () => updateCalls,
  };
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

test("la hydration GM di una nuova scena ripristina HP da un record valido", async () => {
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

test("un evento Room dopo la baseline aggiorna la cache ma non riscrive gli HP", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 12, hpMax: 27, updatedAt: 20, revision: 4 } },
    },
  });
  const item = {
    id: "scene-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 12,
        hpMax: 27,
      },
    },
  };
  let updateCalls = 0;
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi: {
      getItems: async () => [item],
      updateItems: async () => { updateCalls += 1; },
    },
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  await store.start();
  item.metadata["com.thebigpicture.initiative/meta"].hp = 5;

  room.emit({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 7, hpMax: 27, updatedAt: 30, revision: 5 } },
    },
  });
  await flush();

  assert.equal(item.metadata["com.thebigpicture.initiative/meta"].hp, 5);
  assert.equal(store.getSnapshot().actors["actor-a"].hp, 7);
  assert.equal(updateCalls, 0);
  store.stop();
});

test("un evento Room di altro attore o metadata estranei non ripristina HP obsoleti", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 12, hpMax: 27, updatedAt: 20, revision: 4 } },
    },
  });
  const item = {
    id: "scene-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 12,
        hpMax: 27,
      },
    },
  };
  let updateCalls = 0;
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi: {
      getItems: async () => [item],
      updateItems: async () => { updateCalls += 1; },
    },
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  await store.start();
  item.metadata["com.thebigpicture.initiative/meta"].hp = 5;

  room.emit({
    otherRoomState: { keep: true },
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: {
        "actor-a": { hp: 12, hpMax: 27, updatedAt: 20, revision: 4 },
        "actor-b": { hp: 3, hpMax: 9, updatedAt: 31, revision: 1 },
      },
    },
  });
  await flush();

  assert.equal(item.metadata["com.thebigpicture.initiative/meta"].hp, 5);
  assert.equal(store.getSnapshot().actors["actor-b"].hp, 3);
  assert.equal(updateCalls, 0);
  store.stop();
});

test("una modifica token piÃ¹ recente dello snapshot di hydration vince", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 12, hpMax: 27, updatedAt: 20, revision: 4 } },
    },
  });
  const item = {
    id: "scene-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 5,
        hpMax: 27,
      },
    },
  };
  let reads = 0;
  let updateCalls = 0;
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi: {
      getItems: async () => {
        reads += 1;
        if (reads === 2) item.metadata["com.thebigpicture.initiative/meta"].hp = 3;
        return [item];
      },
      updateItems: async () => { updateCalls += 1; },
    },
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });
  const hydration = store.reconcileCurrentScene(1);
  await flush();
  room.commitNext();
  await hydration;

  assert.equal(item.metadata["com.thebigpicture.initiative/meta"].hp, 3);
  assert.equal(store.getSnapshot().actors["actor-a"].hp, 3);
  assert.equal(updateCalls, 0);
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

test("il Player legge la cache ma non scrive nÃ© token nÃ© Room", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 8, hpMax: 10, updatedAt: 1, revision: 1 } },
    },
  });
  let updateCalls = 0;
  const store = createActorVitalsStore({
    authority: "PLAYER",
    api: room.api(),
    itemsApi: {
      getItems: async () => [{
        id: "player-token",
        metadata: {
          "com.thebigpicture.initiative/meta": {
            actorProfileId: "actor-a",
            hp: 2,
            hpMax: 10,
          },
        },
      }],
      updateItems: async () => { updateCalls += 1; },
    },
    storage: new Storage(),
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: alwaysCurrent,
    subscribeItems: () => () => {},
    subscribeEpoch: () => () => {},
  });

  await store.start();
  await store.saveCanonicalHP("actor-a", 2, 10, { sceneEpoch: 1 });
  await store.write({
    schemaVersion: 1,
    actors: { "actor-a": { hp: 2, hpMax: 10 } },
  }, { sceneEpoch: 1 });

  assert.equal(store.getState().authority, "PLAYER");
  assert.equal(store.getState().canWrite, false);
  assert.equal(updateCalls, 0);
  assert.equal(room.setCalls.length, 0);
  assert.equal(store.getSnapshot().actors["actor-a"].hp, 8);
  store.stop();
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

test("il batch actor è invariabile per permutazioni di due o tre duplicati", async () => {
  async function persistedFor(order, hpById = { a: 7, b: 7, c: 7 }) {
    const baseline = [actorToken("a"), actorToken("b"), actorToken("c")];
    const harness = await createEventHarness({ sceneItems: baseline });
    const current = [
      actorToken("a", hpById.a),
      actorToken("b", hpById.b),
      actorToken("c", hpById.c),
    ];
    const byId = new Map(current.map((item) => [item.id, item]));
    harness.setItems(current);
    const task = harness.dispatch({
      sceneEpoch: 1,
      revision: 2,
      items: order.map((id) => byId.get(id)),
      allItems: [...current].reverse(),
      flags: { hpBars: true },
    });
    await settleRoomTask(harness.room, task);
    const hp = harness.store.getSnapshot().actors["actor-a"].hp;
    harness.store.stop();
    return hp;
  }

  assert.equal(await persistedFor(["a", "b"]), 7);
  assert.equal(await persistedFor(["b", "a"]), 7);
  assert.equal(await persistedFor(["c", "b", "a"]), 7);
  assert.equal(await persistedFor(["b", "a", "c"]), 7);
  assert.equal(await persistedFor(["c", "b", "a"], { a: 6, b: 9, c: 3 }), 6);
});

test("evento solo primario persiste; evento solo duplicato legge sempre il primario", async () => {
  const primaryHarness = await createEventHarness({
    sceneItems: [actorToken("a"), actorToken("b")],
  });
  let current = [actorToken("a", 7), actorToken("b", 7)];
  primaryHarness.setItems(current);
  await settleRoomTask(primaryHarness.room, primaryHarness.dispatch({
    sceneEpoch: 1,
    revision: 2,
    items: [current[0]],
    allItems: current,
    flags: { hpBars: true },
  }));
  assert.equal(primaryHarness.store.getSnapshot().actors["actor-a"].hp, 7);
  primaryHarness.store.stop();

  const duplicateHarness = await createEventHarness({
    sceneItems: [actorToken("a"), actorToken("b")],
  });
  current = [actorToken("a", 10), actorToken("b", 4)];
  duplicateHarness.setItems(current);
  await duplicateHarness.dispatch({
    sceneEpoch: 1,
    revision: 2,
    items: [current[1]],
    allItems: current,
    flags: { hpBars: true },
  });
  assert.equal(duplicateHarness.store.getSnapshot().actors["actor-a"].hp, 10);
  assert.equal(duplicateHarness.room.setCalls.length, 0);
  duplicateHarness.store.stop();
});

test("aggiunta e rimozione di duplicati mantengono il primario deterministico", async () => {
  const addedHarness = await createEventHarness({
    sceneItems: [actorToken("a", 8)],
    roomMetadata: actorRegistry(8),
  });
  let current = [actorToken("b", 3), actorToken("a", 8)];
  addedHarness.setItems(current);
  await addedHarness.dispatch({
    sceneEpoch: 1,
    revision: 2,
    items: [current[0]],
    allItems: current,
    flags: { added: true, hpBars: true },
  });
  assert.equal(current[0].metadata["com.thebigpicture.initiative/meta"].hp, 8);
  assert.equal(addedHarness.store.getSnapshot().actors["actor-a"].hp, 8);
  addedHarness.store.stop();

  const removedPrimary = actorToken("a", 5);
  const removalHarness = await createEventHarness({
    sceneItems: [removedPrimary, actorToken("b", 9)],
    roomMetadata: actorRegistry(5),
  });
  current = [actorToken("b", 9)];
  removalHarness.setItems(current);
  await settleRoomTask(removalHarness.room, removalHarness.dispatch({
    sceneEpoch: 1,
    revision: 2,
    items: [],
    removedItems: [removedPrimary],
    allItems: current,
    flags: { removed: true, hpBars: true },
  }));
  assert.equal(removalHarness.store.getSnapshot().actors["actor-a"].hp, 9);
  removalHarness.store.stop();
});

test("assenza esplicita del primario invalida e resta stabile al reconcile", async () => {
  const before = actorToken("a", 7);
  const harness = await createEventHarness({
    sceneItems: [before],
    roomMetadata: actorRegistry(7),
  });
  const after = actorToken("a", null, null);
  harness.setItems([after]);
  const event = classifySceneItemChanges([before], [after]);
  Object.assign(event, { sceneEpoch: 1, revision: 2 });
  await settleRoomTask(harness.room, harness.dispatch(event));

  const absentRecord = harness.store.getSnapshot().actors["actor-a"];
  assert.equal(absentRecord.hpState, "absent");
  assert.equal(absentRecord.revision, 2);
  assert.ok(absentRecord.updatedAt > 1);
  assert.equal(Object.hasOwn(absentRecord, "hp"), false);
  assert.equal(Object.hasOwn(absentRecord, "hpMax"), false);
  await harness.store.reconcileCurrentScene(1);
  assert.equal(Object.hasOwn(after.metadata["com.thebigpicture.initiative/meta"], "hp"), false);
  assert.equal(Object.hasOwn(after.metadata["com.thebigpicture.initiative/meta"], "hpMax"), false);
  assert.equal(harness.updateCalls(), 0);
  harness.store.stop();
});

test("un'assenza versionata rimuove HP obsoleti durante la hydration di un'altra scena", async () => {
  const stale = actorToken("new-scene", 7, 10);
  const harness = await createEventHarness({
    sceneItems: [stale],
    roomMetadata: {
      [ACTOR_VITALS_ROOM_KEY]: {
        schemaVersion: 1,
        actors: {
          "actor-a": { hpState: "absent", updatedAt: 20, revision: 4 },
        },
      },
    },
  });
  assert.equal(Object.hasOwn(stale.metadata["com.thebigpicture.initiative/meta"], "hp"), false);
  assert.equal(Object.hasOwn(stale.metadata["com.thebigpicture.initiative/meta"], "hpMax"), false);
  assert.equal(harness.updateCalls(), 1);
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hpState, "absent");
  assert.equal(harness.room.setCalls.length, 0);
  harness.store.stop();
});

test("la memoria inter-scena valida idrata HP mancanti e zero resta assegnabile", async () => {
  const missing = actorToken("new-scene", null, null);
  const harness = await createEventHarness({
    sceneItems: [missing],
    roomMetadata: actorRegistry(6, 10, 5, 3),
  });
  assert.equal(missing.metadata["com.thebigpicture.initiative/meta"].hp, 6);
  assert.equal(missing.metadata["com.thebigpicture.initiative/meta"].hpMax, 10);

  const before = structuredClone(missing);
  const zero = actorToken("new-scene", 0, 10);
  harness.setItems([zero]);
  const event = classifySceneItemChanges([before], [zero]);
  Object.assign(event, { sceneEpoch: 1, revision: 4 });
  await settleRoomTask(harness.room, harness.dispatch(event));
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hp, 0);
  harness.store.stop();
});

test("revision ed epoch stale non possono invalidare actorVitals", async () => {
  let epoch = 1;
  const before = actorToken("a", 7);
  const harness = await createEventHarness({
    sceneItems: [before],
    roomMetadata: actorRegistry(7),
    currentEpoch: () => epoch,
  });
  const newer = actorToken("a", 8);
  harness.setItems([newer]);
  await settleRoomTask(harness.room, harness.dispatch({
    ...classifySceneItemChanges([before], [newer]),
    sceneEpoch: 1,
    revision: 5,
  }));
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hp, 8);

  const absent = actorToken("a", null, null);
  harness.setItems([absent]);
  await harness.dispatch({
    ...classifySceneItemChanges([newer], [absent]),
    sceneEpoch: 1,
    revision: 4,
  });
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hp, 8);

  epoch = 2;
  await harness.dispatch({
    ...classifySceneItemChanges([newer], [absent]),
    sceneEpoch: 1,
    revision: 6,
  });
  await harness.store.reconcileSceneItems([absent], 1);
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hp, 8);
  assert.equal(Object.hasOwn(absent.metadata["com.thebigpicture.initiative/meta"], "hp"), false);
  harness.store.stop();
});

test("fallback locale conserva l'invalidazione contro write Room fallita ed evento ritardato", async () => {
  const storage = new Storage();
  let listener = null;
  const oldRoom = actorRegistry(7, 10, 1, 1);
  const api = {
    getMetadata: async () => structuredClone(oldRoom),
    setMetadata: async () => { throw new Error("room-write-failed"); },
    onMetadataChange: (next) => { listener = next; return () => { listener = null; }; },
  };
  const before = actorToken("a", 7);
  const harness = await createEventHarness({
    sceneItems: [before],
    storage,
    api,
    logger: { warn() {} },
  });
  const absent = actorToken("a", null, null);
  harness.setItems([absent]);
  await harness.dispatch({
    ...classifySceneItemChanges([before], [absent]),
    sceneEpoch: 1,
    revision: 2,
  });
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hpState, "absent");

  listener(structuredClone(oldRoom));
  assert.equal(harness.store.getSnapshot().actors["actor-a"].hpState, "absent");
  await harness.store.reconcileCurrentScene(1);
  assert.equal(Object.hasOwn(absent.metadata["com.thebigpicture.initiative/meta"], "hp"), false);
  harness.store.stop();
});

test("un token aggiunto dopo la baseline viene idratato una sola volta", async () => {
  const room = new RoomHarness({
    [ACTOR_VITALS_ROOM_KEY]: {
      schemaVersion: 1,
      actors: { "actor-a": { hp: 12, hpMax: 27, updatedAt: 20, revision: 4 } },
    },
  });
  const item = {
    id: "added-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        actorProfileId: "actor-a",
        hp: 4,
        hpMax: 27,
      },
    },
  };
  let sceneItems = [];
  let itemHandler = null;
  let updateCalls = 0;
  const store = createActorVitalsStore({
    api: room.api(),
    itemsApi: {
      getItems: async () => sceneItems,
      updateItems: async (_ids, updater) => {
        updateCalls += 1;
        updater([item]);
      },
    },
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
  const addedEvent = {
    sceneEpoch: 1,
    revision: 1,
    items: [item],
    allItems: [item],
    flags: { added: true },
    domains: ["tracker"],
  };
  await itemHandler(addedEvent);
  await itemHandler(addedEvent);

  assert.equal(item.metadata["com.thebigpicture.initiative/meta"].hp, 12);
  assert.equal(updateCalls, 1);
  assert.equal(room.setCalls.length, 0);
  store.stop();
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
