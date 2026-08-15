import assert from "node:assert/strict";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const listeners = new Map();
const sceneState = {
  metadata: {},
  items: [{
    id: "token-1",
    name: "Token",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { hp: 10, hpMax: 10 } },
  }],
  failHistoryWrite: false,
};

const clone = (value) => structuredClone(value);
const sdkStub = {
  onReady: () => {},
  room: { id: "room-1", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  broadcast: {
    onMessage(channel, callback) {
      const channelListeners = listeners.get(channel) || new Set();
      channelListeners.add(callback);
      listeners.set(channel, channelListeners);
      return () => channelListeners.delete(callback);
    },
    async sendMessage(channel, data) {
      for (const callback of listeners.get(channel) || []) callback({ data: clone(data) });
    },
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      if (sceneState.failHistoryWrite && Object.prototype.hasOwnProperty.call(update, HISTORY_KEY)) {
        throw new Error("history write unavailable");
      }
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      onChange: () => () => {},
      getItems: async (ids) => {
        if (typeof ids === "function") return sceneState.items.filter(ids).map(clone);
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        return sceneState.items
          .filter((item) => !wanted || wanted.has(item.id))
          .map(clone);
      },
    },
    grid: { getDpi: async () => 1 },
    history: { canRedo: async () => false },
  },
};

mock.module("@owlbear-rodeo/sdk", { exports: { default: sdkStub } });

const { mountHistoryOwner, unmountHistoryOwner } = await import("../src/historyOwner.js");
const { withItemMetaHistory } = await import("../src/history.js");

test.before(async () => {
  await mountHistoryOwner();
});

test.after(() => {
  unmountHistoryOwner();
});

test("withItemMetaHistory restituisce il risultato canonico anche se l'owner fallisce dopo l'azione", async () => {
  sceneState.failHistoryWrite = true;
  let pendingStatus = null;
  const result = await withItemMetaHistory({
    itemIds: ["token-1"],
    fields: ["hp"],
    label: "HP",
    onHistoryStatus: (status) => { pendingStatus = status; },
  }, async () => {
    sceneState.items[0].metadata[META_KEY].hp = 5;
    return { canonical: true };
  });

  assert.deepEqual(result, { canonical: true });
  assert.equal(pendingStatus.status, "pending");
  assert.equal(pendingStatus.entry.id.length > 0, true);
  sceneState.failHistoryWrite = false;
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(
    sceneState.metadata[HISTORY_KEY].entries.some((entry) => entry.id === pendingStatus.entry.id),
    true,
  );
  sceneState.metadata[HISTORY_KEY] = { version: 1, roomId: sdkStub.room.id, entries: [] };
});

test("un append riuscito passa dal medesimo owner e persiste la History", async () => {
  const result = await withItemMetaHistory({
    itemIds: ["token-1"],
    fields: ["hp"],
    label: "HP",
  }, async () => {
    sceneState.items[0].metadata[META_KEY].hp = 4;
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(Array.isArray(sceneState.metadata[HISTORY_KEY]?.entries), true);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});

test("un lifecycle locale stale non registra History dopo il commit canonico", async () => {
  const entriesBefore = sceneState.metadata[HISTORY_KEY].entries.length;
  let sceneReady = true;
  const result = await withItemMetaHistory({
    itemIds: ["token-1"],
    fields: ["hp"],
    label: "HP stale",
    sceneEpoch: 41,
    isCurrent: () => sceneReady,
  }, async () => {
    sceneState.items[0].metadata[META_KEY].hp = 3;
    sceneReady = false;
    return { canonical: true };
  });

  assert.deepEqual(result, { canonical: true });
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, entriesBefore);
});
