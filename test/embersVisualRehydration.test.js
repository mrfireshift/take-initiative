// A reopened room (or a scene shown again) redraws, locally, the loops of the spells still active.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";
import { ID } from "../src/constants.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const META = `${ID}/meta`;
const local = { items: [], added: [], broadcasts: 0 };
const blessEntry = (casterId) => ({ id: "e", name: "Benedizione", spellId: "bless", casterId, instanceId: "bless-1", turns: 8, conc: true });
const sceneItems = [
  { id: "cleric", name: "Cleric", position: { x: 0, y: 0 }, metadata: { [META]: {
    [`${ID}/concentration`]: { benedizione: { instanceId: "bless-1", spellId: "bless", targets: ["kos"] } } } } },
  { id: "kos", name: "Kos", position: { x: 300, y: 300 }, metadata: { [META]: { [`${ID}/spells`]: [blessEntry("cleric")] } } },
];
const listeners = new Map();

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "PLAYER" },
  room: { id: "rehydration-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => ({ [`${ID}/state`]: { round: 2 } }),
    grid: { getDpi: async () => 150, getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) },
    items: {
      getItems: async (ids) => {
        if (typeof ids === "function") return sceneItems.filter(ids).map(clone);
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        return sceneItems.filter((item) => !wanted || wanted.has(item.id)).map(clone);
      },
      getItemBounds: async ([id]) => {
        const item = sceneItems.find((entry) => entry.id === id);
        const { x, y } = item?.position || { x: 0, y: 0 };
        return { min: { x, y }, max: { x: x + 150, y: y + 150 }, width: 150, height: 150, center: { x: x + 75, y: y + 75 } };
      },
    },
    local: {
      getItems: async (predicate) => (typeof predicate === "function" ? local.items.filter(predicate) : local.items).map(clone),
      addItems: async (items) => {
        local.added.push(...items.map(clone));
        local.items.push(...items.map(clone));
      },
      deleteItems: async (ids) => {
        const remove = new Set(ids);
        local.items = local.items.filter((item) => !remove.has(item.id));
      },
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const set = listeners.get(channel) || new Set();
      set.add(listener);
      listeners.set(channel, set);
      return () => set.delete(listener);
    },
    async sendMessage(channel, data) {
      local.broadcasts += 1;
      for (const listener of [...(listeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};

function imageBuilder(props) {
  const item = { id: `local-${Math.random().toString(36).slice(2, 8)}`, ...props, metadata: {} };
  const builder = new Proxy({}, {
    get(_, key) {
      if (key === "build") return () => item;
      if (key === "metadata") return (value) => { item.metadata = { ...item.metadata, ...value }; return builder; };
      return (value) => { item[key] = value; return builder; };
    },
  });
  return builder;
}

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildImage: (props) => imageBuilder(props),
    buildLabel: () => ({}), buildText: () => ({}), buildShape: () => ({}), buildPath: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  mountEmbersMatchedVisualRenderer,
  unmountEmbersMatchedVisualRenderer,
  rehydratePersistentVisuals,
  emitMatchedSpellVisualEnd,
} = await import("../src/embersMatchedVisualRenderer.js");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LOCAL_META = "com.thebigpicture.initiative/embersMatchedVisual";

test("after a reload Bless's loop comes back on its target, once, without the intro and without a broadcast", async () => {
  mountEmbersMatchedVisualRenderer();
  const result = await rehydratePersistentVisuals();
  assert.equal(result.rendered, 1);
  await sleep(30);
  const loops = local.items.filter((item) => item.metadata?.[LOCAL_META]?.lifecycleId === "bless-1");
  assert.deepEqual(loops.map((item) => item.metadata[LOCAL_META].effectId), ["blessLoop"]);
  assert.equal(loops[0].attachedTo, "kos");
  assert.equal(local.broadcasts, 0, "each client redraws for itself");

  assert.equal((await rehydratePersistentVisuals()).rendered, 0, "already on screen: no duplicate");
  await sleep(30);
  assert.equal(local.items.filter((item) => item.metadata?.[LOCAL_META]?.lifecycleId === "bless-1").length, 1);

  await emitMatchedSpellVisualEnd({ spellId: "bless", casterId: "cleric", targetIds: ["kos"], lifecycleId: "bless-1" });
  await sleep(30);
  assert.equal(local.items.filter((item) => item.metadata?.[LOCAL_META]?.lifecycleId === "bless-1").length, 0,
    "the spell's end still clears the redrawn loop");
  await unmountEmbersMatchedVisualRenderer();
});
