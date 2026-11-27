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
    id: "grappler-down-room",
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

// Bug of 27/11: a Vine Blight killed while it held a character by its Constrict left it Grappled and Restrained. A
// creature brought to 0 HP is incapacitated (a monster dies): the grapples it holds end, with the Restrained that lasts
// while they hold (same source, no spell behind it). A Restrained of a spell (Entangle) and another's grapple stay. A
// character's grapple already ended with its Privo di sensi, but left the Restrained of the grapple behind.
const pill = (id, condition, extra = {}) => ({ id, condition, active: true, type: "automatic", expiry: { mode: "manual" }, ...extra });
const token = (id, name, attitude, hp, instances = []) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { attitude, hp, hpMax: 30, inInitiative: true, conditions: { version: 2, instances } } } });
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).map((entry) => entry.id).sort();
const setHP = (itemId, hp) => effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId, hp, hpMax: 30 }] }],
  { kind: "hp", label: "Modifica HP", targetIds: [itemId] });

function scene(grapplerAttitude) {
  return [
    token("vine", "Vine Blight", grapplerAttitude, 10),
    token("fighter", "Guerriera", "pc", 25, [
      pill("held", "Afferrato", { sourceId: "vine", sourceName: "Vine Blight", escapeDC: 13 }),
      pill("held-restrained", "Trattenuto", { sourceId: "vine", sourceName: "Vine Blight", parentEffectId: "" }),
      pill("plants", "Trattenuto", { sourceId: "vine", sourceName: "Vine Blight", parentEffectId: "entangle-1" }),
      pill("other-held", "Afferrato", { sourceId: "ogre", sourceName: "Ogre", escapeDC: 14 }),
    ]),
    token("ogre", "Ogre", "enemy", 30),
  ];
}

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  sdk.room.id = `grappler-down-room-${++testSequence}`;
  sceneItems = scene("enemy");
  sceneMetadata = { [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("grappler-down-test");
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
});

test("a monster brought to 0 HP lets go: its Grappled and the Restrained of the grapple end, in the damage's entry", async () => {
  assert.equal((await setHP("vine", 0)).status, "applied");
  assert.deepEqual(pills("fighter"), ["other-held", "plants"]);
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1, JSON.stringify(entries.map((entry) => entry.label)));
  const undo = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undo.status, "applied", JSON.stringify(undo));
  assert.equal(meta("vine").hp, 10);
  assert.deepEqual(pills("fighter"), ["held", "held-restrained", "other-held", "plants"], "Undo gives the grapple back");
});

test("damage that leaves the grappler standing keeps the grapple", async () => {
  assert.equal((await setHP("vine", 3)).status, "applied");
  assert.deepEqual(pills("fighter"), ["held", "held-restrained", "other-held", "plants"]);
});

test("a character grappler at 0 HP: its Privo di sensi ends the grapple and the Restrained of the grapple too", async () => {
  sceneItems = scene("pc");
  assert.equal((await setHP("vine", 0)).status, "applied");
  assert.ok((meta("vine").conditions?.instances || []).some((entry) => entry.condition === "Privo di sensi"));
  assert.deepEqual(pills("fighter"), ["other-held", "plants"]);
});

test("a grappler stunned: the condition's automation ends the Restrained of the grapple with its Grappled", async () => {
  const plan = await effects.runEffectsMutation([
    { type: "condition:add", targetIds: ["vine"], conditionName: "Stordito", options: { expiry: { mode: "manual" } } },
    { type: "condition:automate", subjectIds: ["vine"] },
  ], { kind: "condition", label: "Stordito", targetIds: ["vine", "fighter"] });
  assert.equal(plan.status, "applied", JSON.stringify(plan));
  assert.deepEqual(pills("fighter"), ["other-held", "plants"]);
});
