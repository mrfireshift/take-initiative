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
const { historyUndoDepthWithCauses } = await import("../src/historyUndoUiCore.js");

// A Paladin brought to 0 HP: the aura controller ended two of its features by itself ("Capacità terminata" twice).
// Undone alone, each came back while the Paladin was still unconscious and the controller wrote it again: Undo never
// reached the damage. An automatic consequence is now undone with the entry that caused it.
function paladin(hp) {
  return { id: "paladin", name: "Paladino", type: "IMAGE", layer: "CHARACTER",
    metadata: { [META_KEY]: { attitude: "pc", hp, hpMax: 40 } } };
}
const tokenMeta = () => sceneItems.find((item) => item.id === "paladin").metadata[META_KEY];
const setHP = (hp, extra = {}, hpMax = 40) => effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "paladin", hp, hpMax }] }],
  { kind: "hp", label: "Modifica HP", targetIds: ["paladin"], ...extra });
const automatic = { history: { kind: "class-feature", label: "Capacità terminata", payload: { automaticConsequence: true } } };

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  sdk.room.id = `automatic-consequence-room-${++testSequence}`;
  sceneItems = [paladin(30)];
  sceneMetadata = { [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("automatic-consequence-test");
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
});

test("annullare una conseguenza automatica annulla anche l'azione che l'ha causata", async () => {
  assert.equal((await setHP(0)).status, "applied");
  assert.equal((await setHP(0, { ...automatic, label: "Capacità terminata" }, 41)).status, "applied");
  assert.equal((await setHP(0, { ...automatic, label: "Capacità terminata" }, 42)).status, "applied");
  const entries = await history.getHistoryEntries();
  const automaticEntries = entries.filter((entry) => entry?.payload?.automaticConsequence === true);
  assert.equal(automaticEntries.length, 2, JSON.stringify(entries.map((entry) => entry.label)));
  const newest = entries.at(-1);
  assert.equal(newest.payload?.automaticConsequence, true);

  const undo = await history.undoHistoryThrough(newest.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undo.status, "applied", JSON.stringify(undo));
  assert.equal(tokenMeta().hp, 30, "the damage is undone too");
  assert.equal(tokenMeta().hpMax, 40);
  assert.deepEqual(await history.getHistoryEntries(), [], "the automatic entries and their cause, together");
});

test("un'azione senza segno si annulla da sola come prima", async () => {
  assert.equal((await setHP(20)).status, "applied");
  assert.equal((await setHP(10)).status, "applied");
  const entries = await history.getHistoryEntries();
  const undo = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undo.status, "applied", JSON.stringify(undo));
  assert.equal(tokenMeta().hp, 20);
  assert.equal((await history.getHistoryEntries()).length, 1);
});

test("nel pannello una conseguenza automatica porta con sé la sua causa, e togliere la causa toglie anche lei", () => {
  const rows = [
    { undoable: true, entry: { label: "Capacità terminata", payload: { automaticConsequence: true } } },
    { undoable: true, entry: { label: "Capacità terminata", payload: { automaticConsequence: true } } },
    { undoable: true, entry: { label: "Modifica HP" } },
    { undoable: true, entry: { label: "Attacco" } },
  ];
  assert.equal(historyUndoDepthWithCauses(rows, 1), 3, "the newest selects down to the damage");
  assert.equal(historyUndoDepthWithCauses(rows, 4), 4);
  assert.equal(historyUndoDepthWithCauses(rows, 2, { extend: false }), 0, "unchecking the damage leaves nothing");
  assert.equal(historyUndoDepthWithCauses(rows, 3, { extend: false }), 3);
  assert.equal(historyUndoDepthWithCauses([{ undoable: true, entry: { label: "A" } }], 1), 1);
  const blocked = [rows[0], { undoable: false, entry: { label: "Modifica HP" } }];
  assert.equal(historyUndoDepthWithCauses(blocked, 1), 0, "a cause that cannot be undone: nothing");
  const onlyAutomatic = [rows[0]];
  assert.equal(historyUndoDepthWithCauses(onlyAutomatic, 1), 0, "no cause left in History: nothing");
});

test("la fine automatica di una capacità è segnata come conseguenza", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("../src/classFeatureAuraController.js"), /await deactivateClassFeature\(aura\.sourceId, aura\.instanceId, \{ automatic: true \}\);/);
  assert.match(read("../src/classFeatureRuntime.js"), /history: \{ kind: "class-feature", label: "Capacità terminata", payload: \{ automaticConsequence: true \} \},/);
});

test("anche l'aggiornamento dei membri di un'aura, scritto dopo un movimento, è una conseguenza automatica", async () => {
  const { readFileSync } = await import("node:fs");
  const controller = readFileSync(new URL("../src/classFeatureAuraController.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(controller, /label: "Aggiornata membership aura",\n.*\n\s+history: \{ kind: "class-feature", label: "Aggiornata membership aura", payload: \{ automaticConsequence: true \} \},/);
});
