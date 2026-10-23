// Species traits that change hit points, through the runtime and the effects coordinator: the HP write and the
// use in one command, the 0 HP automation, the history read by Stone's Endurance, Shifting's temporary hit points.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { produce } from "immer";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const HISTORY_KEY = `${ID}/history`;

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const previousLocation = globalThis.location;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const scene = { ready: true, metadata: {}, items: [] };
const readyListeners = new Set();
const metadataListeners = new Set();
const broadcastListeners = new Map();

function itemsFor(ids) {
  if (typeof ids === "function") return scene.items.filter(ids).map(clone);
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return scene.items.filter((item) => !wanted || wanted.has(item.id)).map(clone);
}

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM", getId: async () => "species-hp-gm" },
  room: { id: "species-hp-room", getMetadata: async () => ({}), setMetadata: async () => {} },
  scene: {
    isReady: async () => scene.ready,
    onReadyChange(listener) { readyListeners.add(listener); return () => readyListeners.delete(listener); },
    onMetadataChange(listener) { metadataListeners.add(listener); return () => metadataListeners.delete(listener); },
    getMetadata: async () => clone(scene.metadata),
    setMetadata: async (update) => {
      scene.metadata = { ...scene.metadata, ...clone(update) };
      for (const listener of [...metadataListeners]) listener(clone(scene.metadata));
    },
    items: {
      getItems: async (ids) => itemsFor(ids),
      // One bounding box around the items, as the SDK returns it (tokens of one 150 px cell).
      getItemBounds: async (ids) => {
        const boxes = itemsFor(ids).map((item) => ({ x: Number(item.position?.x || 0), y: Number(item.position?.y || 0) }));
        const min = { x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)) };
        const max = { x: Math.max(...boxes.map((box) => box.x)) + 150, y: Math.max(...boxes.map((box) => box.y)) + 150 };
        return { min, max, width: max.x - min.x, height: max.y - min.y, center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 } };
      },
      updateItems: async (ids, updater) => {
        const drafts = produce(itemsFor(ids), updater);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        scene.items = scene.items.map((item) => byId.get(item.id) || item);
      },
      addItems: async (items) => { scene.items.push(...clone(items || [])); },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        scene.items = scene.items.filter((item) => !wanted.has(item.id));
      },
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
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
      for (const listener of [...(broadcastListeners.get(channel) || [])]) listener({ data: clone(data) });
    },
  },
  notification: { show: async () => {} },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildImage: () => ({ build: () => ({ id: "image" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
    buildPath: () => ({ build: () => ({ id: "path" }) }),
    Command: class Command {},
  },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const classFeatureRuntime = await import("../src/classFeatureRuntime.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

const PC = (id, name, x, hp, hpMax, species, extra = {}) => ({
  id, name, layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, attitude: "pc", conditions: { version: 2, instances: [] },
    initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { str: 3, dex: 1, con: 2, int: 0, wis: 0, cha: 1 }, species },
    ...extra } },
});

function resetScene() {
  scene.ready = true;
  scene.metadata = { [STATE_KEY]: { order: ["grom", "zar", "kael", "tek", "ssa"], current: 0, round: 2 } };
  scene.items = [
    PC("grom", "Grom", 0, 5, 40, { id: "mezzorco" }),
    PC("zar", "Zar", 150, 30, 40, { id: "aasimar", ancestryId: "protettore" }),
    PC("kael", "Kael", 1000, 40, 44, { id: "goliath" }),
    PC("tek", "Tek", 2000, 40, 40, { id: "shifter", ancestryId: "pelle-bestiale" }),
    PC("ssa", "Ssa", 3000, 40, 40, { id: "lucertoloide" }),
  ];
}

async function mountRuntime() {
  historyOwner.unmountHistoryOwner();
  effects.unmountEffectsMutationCoordinatorService();
  resetScene();
  assert.equal(await historyOwner.mountHistoryOwner(), true);
  assert.equal(await effects.mountEffectsMutationCoordinatorService(), true);
}

async function waitForHistoryCount(count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entries = await history.getHistoryEntries();
    if (entries.length >= count) return entries;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`History did not reach ${count} entries`);
}

const metaOf = (id) => scene.items.find((item) => item.id === id).metadata[META_KEY];
const uses = (id, poolId) => metaOf(id).classFeatureState?.resources?.[poolId]?.current;
const conditionNames = (id) => (metaOf(id).conditions?.instances || []).map((instance) => instance.condition);

async function damage(id, amount) {
  const meta = metaOf(id);
  const mutation = await effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: id, hp: Math.max(0, meta.hp - amount), hpMax: meta.hpMax,
    hpIntent: { mode: "damage", amount, eventId: `hit-${id}-${amount}` } }] }], { kind: "hp", label: `Danno a ${id}`, targetIds: [id] });
  effects.requireAppliedEffectsMutation(mutation);
}

test.beforeEach(async () => { await mountRuntime(); });

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  globalThis.location = previousLocation;
});

test("Relentless Endurance: down to 0 HP, back to 1 with the use spent; one Undo restores both", async () => {
  await damage("grom", 9);
  assert.equal(metaOf("grom").hp, 0);
  assert.ok(conditionNames("grom").length > 0, "the 0 HP automation marked the PC");
  await waitForHistoryCount(1);
  await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "grom", featureId: "specie-mezzorco-tenacia-implacabile" });
  const [, entry] = await waitForHistoryCount(2);
  assert.equal(metaOf("grom").hp, 1);
  assert.equal(uses("grom", "specie-mezzorco-tenacia-implacabile-usi"), 0);
  assert.ok(!conditionNames("grom").includes("Privo di sensi"), "back above 0 HP: no Unconscious");
  assert.deepEqual(conditionNames("grom"), ["Prono"], "still prone: standing up is the PC's own move");
  assert.equal(entry.kind, "hp-species-trait");
  assert.match(entry.label, /Grom: Tenacia implacabile/);
  await assert.rejects(classFeatureRuntime.applySpeciesHpTrait({ sourceId: "grom", featureId: "specie-mezzorco-tenacia-implacabile" }), /solo a 0 PF/);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(metaOf("grom").hp, 0);
  assert.equal(metaOf("grom").classFeatureState, undefined, "the use is back: no state, as before the first use (pool full)");
});

test("Healing Hands: the creature touched regains the aasimar's level; one farther away is refused", async () => {
  await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "zar", featureId: "specie-aasimar-mani-guaritrici", targetIds: ["grom"] });
  assert.equal(metaOf("grom").hp, 10, "5 + level 5");
  assert.equal(uses("zar", "specie-aasimar-mani-guaritrici-usi"), 0);
  await mountRuntime();
  await assert.rejects(classFeatureRuntime.applySpeciesHpTrait({ sourceId: "zar", featureId: "specie-aasimar-mani-guaritrici", targetIds: ["kael"] }));
  assert.equal(metaOf("kael").hp, 40);
});

test("Stone's Endurance: the damage just taken is read from the history, and the reduction comes back", async () => {
  await damage("kael", 18);
  await waitForHistoryCount(1);
  assert.equal(metaOf("kael").hp, 22);
  const preview = await classFeatureRuntime.previewSpeciesHpTrait({ sourceId: "kael", featureId: "specie-goliath-resistenza-della-pietra" });
  assert.equal(preview.lastDamage.amount, 18);
  const result = await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "kael", featureId: "specie-goliath-resistenza-della-pietra", value: "9" });
  assert.equal(metaOf("kael").hp, 31);
  assert.equal(result.lastDamage.amount, 18);
  const [, entry] = await waitForHistoryCount(2);
  assert.match(entry.payload.speciesTrait.detail, /Riduzione 9 su 18 danni: 9 PF restituiti/);
  assert.equal(entry.payload.speciesTrait.damageFrom, "history");
});

test("Shifting: the pill and the temporary hit points of Beasthide (level + Con + d6) in one command", async () => {
  await assert.rejects(classFeatureRuntime.activateClassFeature({ sourceId: "tek", featureId: "specie-shifter-mutazione-pelle-bestiale" }), /1d6 tirato/);
  await classFeatureRuntime.activateClassFeature({ sourceId: "tek", featureId: "specie-shifter-mutazione-pelle-bestiale", value: "4" });
  assert.equal(metaOf("tek").hp, 51, "40 + 5 + 2 + 4 temporary");
  assert.equal(uses("tek", "specie-shifter-mutazione-usi"), 0);
  assert.ok(conditionNames("tek").some((name) => /Pelle bestiale/.test(name)), conditionNames("tek").join(","));
});

test("Hungry Jaws: a missed bite spends the use and leaves the hit points", async () => {
  await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "ssa", featureId: "specie-lucertoloide-fauci-fameliche", hit: false });
  assert.equal(metaOf("ssa").hp, 40);
  assert.equal(uses("ssa", "specie-lucertoloide-fauci-fameliche-usi"), 0);
  const [entry] = await waitForHistoryCount(1);
  assert.equal(entry.kind, "class-feature");
});

test("Stone's Endurance takes the goliath's reaction: marked with the reduction, given back by the same Undo", async () => {
  await damage("kael", 18);
  await waitForHistoryCount(1);
  const result = await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "kael", featureId: "specie-goliath-resistenza-della-pietra", value: "9" });
  assert.deepEqual(result.reaction, { spent: true, alreadyUsed: false });
  assert.ok(conditionNames("kael").includes("Reazione usata"), conditionNames("kael").join(","));
  const [, entry] = await waitForHistoryCount(2);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(metaOf("kael").hp, 22);
  assert.ok(!conditionNames("kael").includes("Reazione usata"));
});
