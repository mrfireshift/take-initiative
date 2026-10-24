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
    id: "wild-magic-room",
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
  exports: { default: sdk, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} },
});


const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { CLASS_FEATURE_BY_ID } = await import("../src/classFeatureCatalog.js");
const { planWildMagicSurgeAction, WILD_MAGIC_SURGE_FEATURE_ID, WILD_MAGIC_TIDES_POOL_ID } = await import("../src/wildMagicSurgeCore.js");
const { applyWildMagicSurgePlan } = await import("../src/wildMagicSurgeRuntime.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const rows = CLASS_FEATURE_BY_ID.get(WILD_MAGIC_SURGE_FEATURE_ID).wildMagicTable;
const row = (range) => rows.find((entry) => entry.d100 === range);
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).map((entry) => entry.condition).sort();
const tides = () => meta("sor").classFeatureState?.resources?.[WILD_MAGIC_TIDES_POOL_ID]?.current;

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `wild-magic-history-${++testSequence}`;
  sceneItems = [{ id: "sor", name: "Zefiro", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {
    attitude: "pc", hp: 10, hpMax: 30, inInitiative: true,
    initiativeCard: { characterBuild: [{ classId: "stregone", level: 5, subclassId: "stregone-magia-selvaggia" }] },
    classFeatureState: { version: 1, instances: [], resources: { [WILD_MAGIC_TIDES_POOL_ID]: { current: 0, maximum: 1 } } },
  } } }];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["sor"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("wild-magic-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

test("one surge, one History entry named after it: the pill, Incapacitato and Onde di Caos; one Undo takes it all back", async () => {
  const plan = planWildMagicSurgeAction(row("41-42"), { sorcererId: "sor", sorcererName: "Zefiro" });
  const result = await applyWildMagicSurgePlan(plan, { sorcererId: "sor", sorcererName: "Zefiro", recoverTides: true, row: row("41-42"), roll: "42" });
  assert.equal(result.label, "Impulso di Magia Selvaggia (42): pillola «Pianta in vaso» e Incapacitato · Onde di Caos recuperate");
  assert.deepEqual(pills("sor"), ["Incapacitato", "Pianta in vaso"]);
  assert.equal(tides(), 1);
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1, "a single command");
  assert.equal(entries[0].label, result.label);
  assert.equal(entries[0].payload.wildMagicSurge.roll, 42);
  assert.equal(entries[0].payload.wildMagicSurge.range, "41-42");

  const model = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3(entries[0], { sequence: 1 })]);
  assert.equal(model.events[0].title, result.label);
  const section = model.events[0].details.find((entry) => entry.label === "Impulso di Magia Selvaggia");
  assert.ok(section, "the log names the surge");
  assert.equal(section.lines[0], "Zefiro · d100 42 (41-42)");

  const undone = await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone.status, "applied");
  assert.deepEqual(pills("sor"), []);
  assert.equal(tides(), 0);
});

test("the 2d10 healing is the surge's entry too", async () => {
  const plan = planWildMagicSurgeAction(row("39-40"), { sorcererId: "sor", healTotal: "12" });
  const result = await applyWildMagicSurgePlan(plan, { sorcererId: "sor", row: row("39-40"), roll: "39" });
  assert.equal(meta("sor").hp, 22);
  assert.equal(result.label, "Impulso di Magia Selvaggia (39): +12 PF (2d10)");
  assert.equal((await history.getHistoryEntries())[0].label, result.label);
});

test("a surge resolved at the table writes nothing to the token and no History entry", async () => {
  const plan = planWildMagicSurgeAction(row("05-06"), { sorcererId: "sor" });
  const result = await applyWildMagicSurgePlan(plan, { sorcererId: "sor", row: row("05-06"), roll: "6" });
  assert.equal(result.label, "Impulso di Magia Selvaggia (06): al tavolo");
  assert.deepEqual(await history.getHistoryEntries(), []);
  const model = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3({
    id: "", kind: "class-feature", label: result.label, at: 1, changes: [],
    payload: { wildMagicSurge: { roll: 6, range: "05-06", effect: row("05-06").effect, outcome: "al tavolo", sorcererName: "Zefiro" } },
  }, { sequence: 1 })]);
  assert.equal(model.events[0].summary, "al tavolo");
});
