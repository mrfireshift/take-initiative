import assert from "node:assert/strict";
import test from "node:test";
import { METADATA_OWNERSHIP } from "../src/metadataKeyScoped.js";
import {
  LEGACY_LOCAL_OPTIONS_KEYS,
  LOCAL_OPTIONS_KEY,
  ROOM_OPTIONS_KEY,
  SCENE_OPTIONS_KEY,
} from "../src/options/optionsDefaults.js";
import { createLocalOptionsStore } from "../src/options/localOptionsStore.js";
import { createOptionsService } from "../src/options/optionsService.js";
import { createRoomOptionsStore } from "../src/options/roomOptionsStore.js";
import { createSceneOptionsStore } from "../src/options/sceneOptionsStore.js";
import {
  selectClocksCompact,
  selectFollowActiveTurn,
  selectMapHpBarsEnabled,
  selectPlayerHpVisibility,
  selectTrackerLayout,
  selectTurnPopupEnabled,
} from "../src/options/optionsSelectors.js";
import { ROOM_METADATA_SAFE_LIMIT_BYTES } from "../src/roomMetadataBudget.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.setCalls = [];
    this.removeCalls = [];
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.setCalls.push({ key, value });
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.removeCalls.push(key);
    this.values.delete(key);
  }
}

class MetadataApi {
  constructor(metadata = {}, { ready = true } = {}) {
    this.metadata = clone(metadata);
    this.ready = ready;
    this.getCalls = 0;
    this.setCalls = [];
    this.metadataListeners = new Set();
    this.readyListeners = new Set();
  }

  async getMetadata() {
    this.getCalls += 1;
    return clone(this.metadata);
  }

  async setMetadata(update) {
    const cloned = clone(update);
    this.setCalls.push(cloned);
    this.metadata = { ...this.metadata, ...cloned };
    for (const listener of this.metadataListeners) listener(clone(this.metadata));
  }

  onMetadataChange(listener) {
    this.metadataListeners.add(listener);
    return () => this.metadataListeners.delete(listener);
  }

  async isReady() {
    return this.ready;
  }

  onReadyChange(listener) {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  replaceMetadata(metadata) {
    this.metadata = clone(metadata);
    for (const listener of this.metadataListeners) listener(clone(this.metadata));
  }

  setReady(ready) {
    this.ready = ready === true;
    for (const listener of this.readyListeners) listener(this.ready);
  }
}

async function flushAsyncEvents() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("OPTIONS-001: le letture locali, Room e scena non scrivono", async () => {
  const storage = new MemoryStorage({
    [LEGACY_LOCAL_OPTIONS_KEYS.trackerLayout]: "compact",
    [LEGACY_LOCAL_OPTIONS_KEYS.clocksCompact]: "1",
    [LOCAL_OPTIONS_KEY]: "{json-corrotto",
  });
  const roomApi = new MetadataApi({ "other/room": { keep: true } });
  const sceneApi = new MetadataApi({
    [METADATA_OWNERSHIP.INITIATIVE_STATE.key]: { ui: { autoFocus: false } },
    "other/scene": { keep: true },
  });
  const localStore = createLocalOptionsStore({ storage });
  const roomStore = createRoomOptionsStore({ api: roomApi });
  const sceneStore = createSceneOptionsStore({ api: sceneApi });

  assert.equal(localStore.read().tracker.layout, "compact");
  assert.equal(localStore.read().windows.clocksCompact, true);
  await roomStore.start();
  await roomStore.read();
  await sceneStore.start();
  await sceneStore.read();

  assert.equal(storage.setCalls.length, 0);
  assert.equal(storage.removeCalls.length, 0);
  assert.equal(roomApi.setCalls.length, 0);
  assert.equal(sceneApi.setCalls.length, 0);
  assert.equal(sceneStore.getLegacyLocalOptions().tracker.followActiveTurn, false);
  roomStore.stop();
  sceneStore.stop();
});

test("OPTIONS-001: fallback legacy locale e Follow scena alimentano soltanto i selector", async () => {
  const storage = new MemoryStorage({
    [LEGACY_LOCAL_OPTIONS_KEYS.trackerLayout]: "compact",
    [LEGACY_LOCAL_OPTIONS_KEYS.clocksCompact]: "1",
  });
  const roomApi = new MetadataApi();
  const sceneApi = new MetadataApi({
    [METADATA_OWNERSHIP.INITIATIVE_STATE.key]: { ui: { autoFocus: false } },
  });
  const service = createOptionsService({
    localStore: createLocalOptionsStore({ storage }),
    roomStore: createRoomOptionsStore({ api: roomApi }),
    sceneStore: createSceneOptionsStore({ api: sceneApi }),
  });

  await service.start();
  assert.equal(service.get(selectTrackerLayout), "compact");
  assert.equal(service.get(selectClocksCompact), true);
  assert.equal(service.get(selectFollowActiveTurn), false);
  assert.equal(storage.setCalls.length, 0);
  assert.equal(roomApi.setCalls.length, 0);
  assert.equal(sceneApi.setCalls.length, 0);
  service.stop();
});

test("OPTIONS-001: update e subscription applicano Room e override scena", async () => {
  const storage = new MemoryStorage();
  const roomApi = new MetadataApi();
  const sceneApi = new MetadataApi();
  const service = createOptionsService({
    localStore: createLocalOptionsStore({ storage, now: () => 10 }),
    roomStore: createRoomOptionsStore({ api: roomApi, now: () => 20 }),
    sceneStore: createSceneOptionsStore({ api: sceneApi, now: () => 30 }),
  });
  const popupValues = [];
  const layoutValues = [];
  service.subscribe(selectTurnPopupEnabled, (value) => popupValues.push(value));
  service.subscribe(selectTrackerLayout, (value) => layoutValues.push(value));
  await service.start();

  await service.updateRoom((current) => ({
    ...current,
    turn: { ...current.turn, popup: false },
  }));
  assert.equal(popupValues.at(-1), false);

  await service.updateScene((current) => ({
    ...current,
    overrides: {
      ...current.overrides,
      "turn.popup": { mode: "override", value: true },
    },
  }));
  assert.equal(popupValues.at(-1), true);

  await service.updateLocal((current) => ({
    ...current,
    tracker: { ...current.tracker, layout: "compact" },
  }));
  assert.equal(layoutValues.at(-1), "compact");
  assert.ok(popupValues.includes(false));
  assert.ok(popupValues.includes(true));
  service.stop();
});

test("OPTIONS-001: il cambio scena invalida lo snapshot precedente e ricarica override e Follow", async () => {
  const roomApi = new MetadataApi({
    [ROOM_OPTIONS_KEY]: { turn: { popup: false }, map: { hpBars: false } },
  });
  const sceneApi = new MetadataApi({
    [METADATA_OWNERSHIP.INITIATIVE_STATE.key]: { ui: { autoFocus: false } },
    [SCENE_OPTIONS_KEY]: {
      overrides: {
        "turn.popup": { mode: "override", value: true },
        "map.hpBars": { mode: "override", value: true },
      },
    },
  });
  const service = createOptionsService({
    localStore: createLocalOptionsStore({ storage: new MemoryStorage() }),
    roomStore: createRoomOptionsStore({ api: roomApi }),
    sceneStore: createSceneOptionsStore({ api: sceneApi }),
  });
  const popupValues = [];
  service.subscribe(selectTurnPopupEnabled, (value) => popupValues.push(value));
  await service.start();
  assert.equal(service.get(selectTurnPopupEnabled), true);
  assert.equal(service.get(selectMapHpBarsEnabled), true);
  assert.equal(service.get(selectFollowActiveTurn), false);

  sceneApi.setReady(false);
  sceneApi.replaceMetadata({
    [METADATA_OWNERSHIP.INITIATIVE_STATE.key]: { ui: { autoFocus: true } },
    [SCENE_OPTIONS_KEY]: {
      overrides: {
        "turn.popup": { mode: "inherit" },
        "map.hpBars": { mode: "inherit" },
      },
    },
  });
  sceneApi.setReady(true);
  await flushAsyncEvents();

  assert.equal(service.get(selectTurnPopupEnabled), false);
  assert.equal(service.get(selectMapHpBarsEnabled), false);
  assert.equal(service.get(selectFollowActiveTurn), true);
  assert.equal(popupValues.at(-1), false);
  service.stop();
});

test("OPTIONS-004: scene-ready forza il lifecycle anche quando il valore risolto non cambia", async () => {
  const sceneApi = new MetadataApi();
  const service = createOptionsService({
    localStore: createLocalOptionsStore({ storage: new MemoryStorage() }),
    roomStore: createRoomOptionsStore({ api: new MetadataApi() }),
    sceneStore: createSceneOptionsStore({ api: sceneApi }),
  });
  const values = [];
  service.subscribe(selectMapHpBarsEnabled, (value, event) => {
    values.push({ value, reason: event?.reason });
  });
  await service.start();
  const beforeSceneChange = values.length;

  sceneApi.setReady(false);
  sceneApi.replaceMetadata({});
  sceneApi.setReady(true);
  await flushAsyncEvents();

  assert.ok(values.length > beforeSceneChange);
  assert.deepEqual(values.at(-1), { value: true, reason: "scene-ready" });
  service.stop();
});

test("OPTIONS-001: clear della chiave torna ai default senza alterare metadata estranei", async () => {
  const roomApi = new MetadataApi({
    [ROOM_OPTIONS_KEY]: {
      futureTop: { keep: true },
      map: { hpBars: false, futureMap: "keep" },
    },
    "other/room": { keep: true },
  });
  const sceneApi = new MetadataApi({
    [METADATA_OWNERSHIP.INITIATIVE_STATE.key]: { ui: { autoFocus: false } },
    [SCENE_OPTIONS_KEY]: {
      futureTop: { keep: true },
      overrides: { "map.hpBars": { mode: "override", value: false } },
    },
    "other/scene": { keep: true },
  });
  const roomStore = createRoomOptionsStore({ api: roomApi, now: () => 100 });
  const sceneStore = createSceneOptionsStore({ api: sceneApi, now: () => 200 });
  await roomStore.start();
  await sceneStore.start();

  await roomStore.write({ turn: { popup: false } });
  assert.deepEqual(Object.keys(roomApi.setCalls[0]), [ROOM_OPTIONS_KEY]);
  assert.deepEqual(roomApi.metadata["other/room"], { keep: true });
  assert.deepEqual(roomApi.metadata[ROOM_OPTIONS_KEY].futureTop, { keep: true });
  assert.equal(roomApi.metadata[ROOM_OPTIONS_KEY].map.futureMap, "keep");

  await sceneStore.write({
    overrides: { "turn.popup": { mode: "override", value: false } },
  });
  assert.deepEqual(Object.keys(sceneApi.setCalls[0]), [SCENE_OPTIONS_KEY]);
  assert.deepEqual(sceneApi.metadata["other/scene"], { keep: true });
  assert.deepEqual(sceneApi.metadata[SCENE_OPTIONS_KEY].futureTop, { keep: true });

  await roomStore.clear();
  await sceneStore.clear();
  assert.equal(roomApi.metadata[ROOM_OPTIONS_KEY], null);
  assert.equal(sceneApi.metadata[SCENE_OPTIONS_KEY], null);
  assert.equal(roomStore.getSnapshot().map.hpBars, true);
  assert.equal(sceneStore.getSnapshot().overrides["map.hpBars"].mode, "inherit");
  assert.equal(sceneStore.getLegacyLocalOptions().tracker.followActiveTurn, false);
  assert.deepEqual(roomApi.metadata["other/room"], { keep: true });
  assert.deepEqual(sceneApi.metadata["other/scene"], { keep: true });
  assert.deepEqual(roomApi.setCalls.map((update) => Object.keys(update)), [
    [ROOM_OPTIONS_KEY], [ROOM_OPTIONS_KEY],
  ]);
  assert.deepEqual(sceneApi.setCalls.map((update) => Object.keys(update)), [
    [SCENE_OPTIONS_KEY], [SCENE_OPTIONS_KEY],
  ]);
  roomStore.stop();
  sceneStore.stop();
});

test("OPTIONS-001: rimozione esterna della chiave notifica il ritorno ai default", async () => {
  const roomApi = new MetadataApi({ [ROOM_OPTIONS_KEY]: { map: { hpBars: false } } });
  const roomStore = createRoomOptionsStore({ api: roomApi });
  const values = [];
  roomStore.subscribe((options) => values.push(options.map.hpBars));
  await roomStore.start();
  assert.equal(roomStore.getSnapshot().map.hpBars, false);

  roomApi.replaceMetadata({ "other/room": { keep: true } });
  assert.equal(roomStore.getSnapshot().map.hpBars, true);
  assert.equal(values.at(-1), true);
  assert.equal(roomApi.setCalls.length, 0);
  roomStore.stop();
});

test("OPTIONS-003: una invalidazione cross-client forza la rilettura delle policy Player", async () => {
  const roomApi = new MetadataApi();
  const service = createOptionsService({
    localStore: createLocalOptionsStore({ storage: new MemoryStorage() }),
    roomStore: createRoomOptionsStore({ api: roomApi }),
    sceneStore: createSceneOptionsStore({ api: new MetadataApi() }),
  });
  const values = [];
  service.subscribe(
    (options) => selectPlayerHpVisibility(options, {
      surface: "trackerClassic",
      attitude: "enemy",
    }),
    (value, event) => values.push({ value, reason: event?.reason }),
  );
  await service.start();
  assert.equal(values.at(-1).value, "hidden");

  roomApi.metadata = {
    [ROOM_OPTIONS_KEY]: {
      playerView: { hp: { trackerClassic: { enemy: "exact" } } },
    },
  };
  await service.refresh("broadcast-invalidation");

  assert.deepEqual(values.at(-1), {
    value: "exact",
    reason: "broadcast-invalidation",
  });
  service.stop();
});

test("OPTIONS-003: la diagnostica Room riporta solo dimensioni e chiavi del plugin", async () => {
  const roomApi = new MetadataApi({
    [ROOM_OPTIONS_KEY]: { turn: { popup: false } },
    [METADATA_OWNERSHIP.ROOM_MEMORY.key]: { actor: { hp: 10, hpMax: 20 } },
    "other.extension/private": { secret: "non esporre" },
  });
  const store = createRoomOptionsStore({ api: roomApi });
  const diagnostics = await store.inspectStorage();

  assert.ok(diagnostics.totalBytes > 0);
  assert.equal(diagnostics.limitBytes, ROOM_METADATA_SAFE_LIMIT_BYTES);
  assert.equal(diagnostics.optionKeyPresent, true);
  assert.ok(diagnostics.ownedEntries.some((entry) => entry.key === "options-room"));
  assert.ok(diagnostics.ownedEntries.some((entry) => entry.key === "hpMemory"));
  assert.equal(diagnostics.ownedEntries.some((entry) => entry.key.includes("other.extension")), false);
  assert.equal(JSON.stringify(diagnostics).includes("non esporre"), false);
});
