// Lot F5-2 of docs/STUDIO_TALENTI.md (decisions H3, H5): Healer's cure, as Healing Hands: the d6 written by the GM, 4 and
// the target's maximum Hit Dice (a character's level, an imported monster's from its hit points' formula, else as the GM
// writes them), on the creature touched; one command, one History entry, one Undo.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { produce } from "immer";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
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
const itemListeners = new Set();
const itemsFor = (ids) => {
  if (typeof ids === "function") return scene.items.filter(ids).map(clone);
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return scene.items.filter((item) => !wanted || wanted.has(item.id)).map(clone);
};

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM", getId: async () => "feat-healer-gm", getSelection: async () => [] },
  room: { id: "feat-healer-room", getMetadata: async () => ({}), setMetadata: async () => {} },
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
        for (const listener of [...itemListeners]) listener(scene.items.map(clone));
      },
      onChange(listener) { itemListeners.add(listener); return () => itemListeners.delete(listener); },
      addItems: async (items) => { scene.items.push(...clone(items || [])); },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        scene.items = scene.items.filter((item) => !wanted.has(item.id));
      },
    },
    grid: { getDpi: async () => 150, getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) },
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
const { FEAT_FEATURES, featFeaturesForProfile } = await import("../src/featCatalog.js");
const { planSpeciesHpTrait, speciesHealDice, speciesHpTraitNeedsRoll, speciesTargetHitDice } = await import("../src/speciesHpTraitCore.js");
const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");

const CURE = "talento-guaritore-cura";
const cure = () => FEAT_FEATURES.find((feature) => feature.id === CURE);
const PC = (id, x, extra = {}, card = {}) => ({
  id, name: id, layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META_KEY]: { hp: 20, hpMax: 40, attitude: "pc", conditions: { version: 2, instances: [] },
    initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { con: 2 }, ...card },
    ...extra } },
});

function resetScene() {
  scene.ready = true;
  scene.metadata = { [STATE_KEY]: { order: ["doc"], current: 0, round: 1 } };
  // The healer, a fighter next to it, an imported ogre (7d10 + 21), a commoner without Hit Dice, one farther away.
  scene.items = [
    PC("doc", 0, {}, { feats: [{ id: "guaritore" }] }),
    PC("brute", 150),
    PC("ogre", 150, { hp: 20, hpMax: 59, attitude: "enemy" }, { characterBuild: [], monster: { source: "5etools", hitPoints: { value: 59, formula: "7d10+21" } } }),
    PC("villager", 150, { hp: 1, hpMax: 4, attitude: "neutral" }, { characterBuild: [] }),
    PC("far", 900),
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

test.beforeEach(async () => { await mountRuntime(); });
test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  globalThis.location = previousLocation;
});

test("the cure is a card of the feat, as Healing Hands: the creature touched, a d6 to write, no use to spend", () => {
  const record = cure();
  assert.equal(getClassFeatureDefinition(CURE), record);
  assert.deepEqual([record.activation.primary, record.runtimeSupport.adapter, record.targetMode, record.targeting, record.hpTrait, record.resourceCosts],
    ["azione", "resource-only", "selection", { mode: "single-target", rangeMeters: 1.5, maxTargets: 1, excludeSource: false },
      { kind: "heal", dice: "1d6", plus: 4, plusTargetHitDice: true }, []]);
  assert.deepEqual(featFeaturesForProfile({ feats: [{ id: "guaritore" }] }).map((feature) => feature.id), ["talento-guaritore", CURE]);
  assert.deepEqual(speciesHealDice(record.hpTrait, {}), { count: 1, faces: 6, min: 1, max: 6, label: "1d6" });
  assert.equal(speciesHpTraitNeedsRoll(record.hpTrait), true, "the tracker's menu sends it to the sheet, for the roll");
  // Healing Hands of Mostri del Multiverso keeps its d4s.
  assert.deepEqual(speciesHealDice({ kind: "heal", dice: "pb-d4" }, { characterBuild: [{ classId: "chierico", level: 9 }] }),
    { count: 4, faces: 4, min: 4, max: 16, label: "4d4" });
});

test("the target's Hit Dice: a character's level, an imported monster's formula, else the GM's", () => {
  assert.deepEqual(["brute", "ogre", "villager"].map((id) => speciesTargetHitDice(metaOf(id))), [5, 7, null]);
  const plan = (id, value, hitDice = "") => {
    const result = planSpeciesHpTrait({ feature: cure(), card: {}, targetMeta: metaOf(id), targetName: id, value, hitDice });
    return result.ok ? [result.amount, result.change.afterHP, result.detail] : result.blocker;
  };
  assert.deepEqual(plan("brute", "4"), [13, 33, "1d6: 4 + 4 + 5 Dadi Vita = 13 PF"]);
  assert.deepEqual(plan("ogre", "6"), [17, 37, "1d6: 6 + 4 + 7 Dadi Vita = 17 PF"]);
  assert.equal(plan("villager", "2"), "Guaritore: cura con la borsa: inserisci i Dadi Vita di villager: la sua scheda non li ha.");
  assert.deepEqual(plan("villager", "2", "1"), [7, 4, "1d6: 2 + 4 + 1 Dadi Vita = 7 PF"], "never above the hit point maximum");
  assert.deepEqual(plan("brute", "4", "9"), [13, 33, "1d6: 4 + 4 + 5 Dadi Vita = 13 PF"], "the sheet's Hit Dice come first");
  assert.equal(plan("brute", "7"), "Guaritore: cura con la borsa: inserisci il totale di 1d6 (1–6).");
});

test("the cure heals the creature touched in one command; one Undo takes it back; a farther one is refused", async () => {
  await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "doc", featureId: CURE, targetIds: ["brute"], value: "3" });
  assert.equal(metaOf("brute").hp, 32, "20 + 3 + 4 + 5");
  const [entry] = await waitForHistoryCount(1);
  assert.equal(entry.kind, "hp-species-trait");
  assert.match(entry.label, /doc: Guaritore: cura con la borsa → brute/u);
  assert.match(entry.payload.speciesTrait.detail, /1d6: 3 \+ 4 \+ 5 Dadi Vita = 12 PF/u);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(metaOf("brute").hp, 20);
  await assert.rejects(classFeatureRuntime.applySpeciesHpTrait({ sourceId: "doc", featureId: CURE, targetIds: ["far"], value: "3" }));
  assert.equal(metaOf("far").hp, 20);
});

test("a creature whose sheet has no Hit Dice needs the GM's; the healer with none selected heals itself", async () => {
  await assert.rejects(classFeatureRuntime.applySpeciesHpTrait({ sourceId: "doc", featureId: CURE, targetIds: ["villager"], value: "2" }),
    /inserisci i Dadi Vita/u);
  assert.equal(metaOf("villager").hp, 1);
  await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "doc", featureId: CURE, targetIds: ["villager"], value: "2", hitDice: "1" });
  assert.equal(metaOf("villager").hp, 4);
  await classFeatureRuntime.applySpeciesHpTrait({ sourceId: "doc", featureId: CURE, targetIds: [], value: "1" });
  assert.equal(metaOf("doc").hp, 30, "20 + 1 + 4 + 5");
});
