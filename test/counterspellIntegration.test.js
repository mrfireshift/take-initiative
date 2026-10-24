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
    id: "counterspell-room",
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
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { castCounterspell, counterspellSlotOptions, loadCounterspellScene } = await import("../src/counterspellRuntime.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const slot = (id, level) => meta(id).classFeatureState?.resources?.[`spell-slot-${level}`]?.current;
const pills = (id) => (meta(id).conditions?.instances || []).map((entry) => entry.condition).sort();
const wizard = (level) => ({ characterBuild: [{ classId: "mago", level }] });

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `counterspell-history-${++testSequence}`;
  sceneItems = [
    { id: "mira", name: "Mira", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {
      attitude: "pc", hp: 30, hpMax: 30, inInitiative: true, initiativeCard: wizard(7) } } },
    { id: "sera", name: "Sera", type: "IMAGE", layer: "CHARACTER", position: { x: 400, y: 0 }, metadata: { [META_KEY]: {
      attitude: "enemy", hp: 40, hpMax: 40, inInitiative: true, initiativeCard: wizard(9) } } },
    { id: "ghoul", name: "Ghoul", type: "IMAGE", layer: "CHARACTER", position: { x: 2000, y: 0 }, metadata: { [META_KEY]: {
      attitude: "enemy", hp: 30, hpMax: 30, inInitiative: true } } },
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["sera", "mira", "ghoul"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("counterspell-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

test("the popup's scene: the other creatures nearest first, the ghoul out of Counterspell's 60 ft", async () => {
  const scene = await loadCounterspellScene("mira");
  assert.deepEqual(scene.candidates.map((entry) => [entry.item.id, entry.inRange]), [["sera", true], ["ghoul", false]]);
  assert.equal(scene.rangeLimit, 60, "a grid in feet");
  const options = counterspellSlotOptions(scene.caster);
  assert.deepEqual(options.map((option) => option.value), ["3", "4", "none"], "a 7th-level wizard: 3rd and 4th slots, or none");
  assert.deepEqual(counterspellSlotOptions(sceneItems[2]).map((option) => option.level), [3, 4, 5, 6, 7, 8, 9], "a monster picks its level");
});

test("one command: Mira's slot and reaction, Sera's lost slot, the countered spell named; one Undo gives all back", async () => {
  const result = await castCounterspell({
    casterId: "mira",
    slot: counterspellSlotOptions(sceneItems[0])[0],
    targetId: "sera",
    spell: getSpellDefinition("cone-of-cold"),
    spellLevel: 5,
    checkResult: "passed",
    spendTargetSlot: true,
  });
  assert.equal(result.status, "cast", result.message);
  assert.match(result.message, /Incantesimo annullato · speso: slot di 3° livello, reazione, Sera: slot di 5° livello/u);
  assert.equal(slot("mira", 3), 2);
  assert.equal(slot("sera", 5), 0);
  assert.deepEqual(pills("mira"), ["Reazione usata"]);
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.label, "Controincantesimo (3°) su Sera: Cono di freddo (5°) · annullato");
  assert.deepEqual(entry.payload.counterspell, {
    targetId: "sera", targetName: "Sera", spellId: "cone-of-cold", spellName: "Cono di freddo", spellLevel: 5, slotLevel: 3,
    automatic: false, dc: 15, check: { result: "passed" }, outcome: "countered", targetSlot: "slot di 5° livello",
  });

  const model = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3(entry, { sequence: 1 })]);
  assert.equal(model.events[0].summary, "Contrastato: Sera · Cono di freddo (5°) · Esito: annullato · prova CD 15 riuscita");
  assert.ok(model.events[0].details.some((section) => section.label === "Controincantesimo"
    && section.lines.includes("Sera perde: slot di 5° livello")));

  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone.status, "applied");
  assert.ok([undefined, 3].includes(slot("mira", 3)), "the slot is back (a full pool may have no entry)");
  assert.ok([undefined, 1].includes(slot("sera", 5)));
  assert.deepEqual(pills("mira"), []);
});

test("a failed check: the spell goes off, its caster keeps the slot (it spends it casting)", async () => {
  const result = await castCounterspell({
    casterId: "mira", slot: counterspellSlotOptions(sceneItems[0])[0], targetId: "sera",
    spellName: "Incantesimo di Auril", spellLevel: 6, checkTotal: "14", spendTargetSlot: true,
  });
  assert.equal(result.status, "cast");
  assert.equal(slot("sera", 5), undefined, "nothing spent on Sera");
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.label, "Controincantesimo (3°) su Sera: Incantesimo di Auril (6°) · non annullato");
  assert.deepEqual(entry.payload.counterspell.check, { result: "failed", total: 14 });
});

test("an automatic counter and a missing choice", async () => {
  assert.equal((await castCounterspell({ casterId: "mira", slot: counterspellSlotOptions(sceneItems[0])[1], targetId: "sera",
    spellName: "Palla di fuoco", spellLevel: 3 })).status, "cast");
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.payload.counterspell.automatic, true);
  assert.equal(slot("mira", 4), 0, "the 4th-level slot chosen");
  assert.equal(slot("sera", 3), 2, "Sera loses a 3rd-level slot");
  const missing = await castCounterspell({ casterId: "mira", slot: counterspellSlotOptions(sceneItems[0])[0], spellName: "Palla di fuoco", spellLevel: 3 });
  assert.equal(missing.status, "invalid");
});
