// Lay on Hands on a PC at 0 HP (bug of 21/11): its healing is an hp:set, so the coordinator ends the automatic Privo di
// sensi, as every other healing does; Prono stays (the creature is still on the ground), the death saves and Stabile go.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let role = "GM";
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => role },
  room: {
    id: "lay-on-hands-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => { roomMetadata = { ...roomMetadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    grid: { getDpi: async () => 100, getScale: async () => ({ parsed: { multiplier: 5, unit: "ft" } }) },
    // The Embers renderer: the end of a cantrip's pill (Undo, expiry) removes its loop from the local items.
    local: { getItems: async () => [], addItems: async () => {}, updateItems: async () => {}, deleteItems: async () => {}, onChange: () => () => {} },
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (update) => { sceneMetadata = { ...sceneMetadata, ...clone(update) }; },
    items: {
      getItems: async (ids) => clone(sceneItems.filter((item) => (
        !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))
      ))),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((item) => (typeof ids === "function" ? ids(item) : ids.includes(item.id))));
        updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneItems = sceneItems.map((item) => byId.get(item.id) || item);
      },
      // A token is one 100 px cell from its position (the grid below: 100 dpi, 5 ft per cell).
      getItemBounds: async (ids) => {
        const item = sceneItems.find((candidate) => candidate.id === ids[0]);
        if (!item) throw new Error("missing item");
        const { x, y } = item.position || { x: 0, y: 0 };
        return { min: { x, y }, max: { x: x + 100, y: y + 100 }, width: 100, height: 100, center: { x: x + 50, y: y + 50 } };
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); },
      deleteItems: async (ids) => { sceneItems = sceneItems.filter((item) => !ids.includes(item.id)); },
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
      for (const listener of [...(broadcastListeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdk, buildLabel() {}, buildImage() {}, buildText() {}, buildShape() {}, buildPath() {}, Command: class {} },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { applyLayOnHands } = await import("../src/classFeatureRuntime.js");
const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");

const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false)
  .map((entry) => entry.condition).sort();
const POOL = getClassFeatureDefinition("paladino-imposizione-delle-mani").resourceCosts[0].poolId;

async function downAtZero({ stable = false } = {}) {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `lay-on-hands-${++testSequence}`;
  sceneItems = [
    { id: "pal", name: "Paladino", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {
      hp: 40, hpMax: 40, attitude: "pc", inInitiative: true, initiativeCard: { characterBuild: [{ classId: "paladino", level: 5 }] } } } },
    { id: "aria", name: "Aria", type: "IMAGE", layer: "CHARACTER", position: { x: 100, y: 0 }, metadata: { [META_KEY]: {
      hp: 10, hpMax: 30, attitude: "pc", inInitiative: true } } },
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["pal", "aria"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  markSceneEpochReady("lay-on-hands");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  // Down to 0 HP as the console does it: the automatic Privo di sensi and its Prono.
  effects.requireAppliedEffectsMutation(await effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "aria", hp: 0, hpMax: 30,
    hpIntent: { mode: "damage", amount: 10, eventId: "down" } }] }], { kind: "test", label: "danno", targetIds: ["aria"] }));
  if (stable) {
    meta("aria").deathSaves = { successes: 2, failures: 1 };
    effects.requireAppliedEffectsMutation(await effects.runEffectsMutation([{ type: "condition:add", targetIds: ["aria"],
      conditionName: "Stabile", options: { type: "death-save", expiry: { mode: "manual" } } }], { kind: "test", label: "stabile", targetIds: ["aria"] }));
  }
}

test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

test("Lay on Hands on a PC at 0 HP: it wakes up (Privo di sensi ends), Prono stays, the points are spent; one Undo", async () => {
  await downAtZero();
  assert.deepEqual(pills("aria"), ["Privo di sensi", "Prono"]);
  await applyLayOnHands({ sourceId: "pal", targetIds: ["aria"], value: 5 });
  assert.equal(meta("aria").hp, 5);
  assert.deepEqual(pills("aria"), ["Prono"], "awake, still on the ground");
  assert.equal(meta("pal").classFeatureState.resources[POOL].current, 20, "5 of its 25 points");
  const entry = (await history.getHistoryEntries()).at(-1);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("aria").hp, pills("aria")], [0, ["Privo di sensi", "Prono"]]);
  assert.equal(meta("pal").classFeatureState?.resources?.[POOL]?.current ?? 25, 25, "the points back");
});

test("Lay on Hands on a stable PC: Privo di sensi, Stabile and the death saves all go", async () => {
  await downAtZero({ stable: true });
  assert.deepEqual(pills("aria"), ["Privo di sensi", "Prono", "Stabile"]);
  await applyLayOnHands({ sourceId: "pal", targetIds: ["aria"], value: 1 });
  assert.deepEqual([meta("aria").hp, pills("aria"), meta("aria").deathSaves ?? null], [1, ["Prono"], null]);
});

test("Lay on Hands on a creature above 0 HP heals as before, its temporary hit points untouched", async () => {
  await downAtZero();
  meta("aria").hp = 12; meta("aria").tempHp = 4;
  meta("aria").conditions = { version: 2, instances: [] };
  await applyLayOnHands({ sourceId: "pal", targetIds: ["aria"], value: 20 });
  assert.deepEqual([meta("aria").hp, meta("aria").tempHp], [30, 4], "up to the maximum");
});
