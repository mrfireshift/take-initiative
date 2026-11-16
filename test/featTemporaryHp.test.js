// Lot F5-1 of docs/STUDIO_TALENTI.md (decisions H1–H4, H7): Inspiring Leader's speech and the Chef's treats give
// temporary hit points through the features' own path (activateClassFeature, effectPlan.temporaryHp), with amounts
// counted on the whole character; one command, one History entry, one Undo.
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
  player: { getRole: async () => "GM", getId: async () => "feat-temp-gm", getSelection: async () => [] },
  room: { id: "feat-temp-room", getMetadata: async () => ({}), setMetadata: async () => {} },
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
const { FEAT_FEATURES, FEAT_RESOURCE_POOLS, featPluginLine } = await import("../src/featCatalog.js");
const { classFeatureEffectProjection, classFeatureRuntimeSupport, classFeatureTargeting, classFeatureTemporaryHpAmount,
  classFeatureTemporaryHpSheetBlocker } = await import("../src/classFeatureCore.js");

const SPEECH = "talento-condottiero-ispiratore-discorso";
const TREAT = "talento-cuoco-delizia";
const TREATS = "talento-cuoco-delizie-usi";
const record = (id) => FEAT_FEATURES.find((feature) => feature.id === id);
const PC = (id, x, extra = {}, card = {}) => ({
  id, name: id, layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META_KEY]: { hp: 30, hpMax: 40, attitude: "pc", conditions: { version: 2, instances: [] },
    initiativeCard: { characterBuild: [{ classId: "paladino", level: 5 }], abilityModifiers: { str: 2, con: 1, cha: 3 }, ...card },
    ...extra } },
});

function resetScene() {
  scene.ready = true;
  scene.metadata = { [STATE_KEY]: { order: ["lea"], current: 0, round: 1 } };
  // The leader and six friends within 9 m (six cells of 150 px), one farther; the chef without a class has no level.
  scene.items = [
    PC("lea", 0, {}, { feats: [{ id: "condottiero-ispiratore" }] }),
    ...[1, 2, 3, 4, 5, 6].map((index) => PC(`a${index}`, index * 120)),
    PC("far", 3000),
    PC("tom", 150, { tempHp: 12 }),
    PC("chef", 300, {}, { feats: [{ id: "cuoco" }] }),
    PC("cook", 450, {}, { characterBuild: [], feats: [{ id: "cuoco" }] }),
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
const tempOf = (ids) => ids.map((id) => metaOf(id).tempHp ?? 0);

test.beforeEach(async () => { await mountRuntime(); });
test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  globalThis.location = previousLocation;
});

test("the amounts counted on the whole character, and the class amounts as they were", () => {
  const sheet = { characterBuild: [{ classId: "guerriero", level: 3 }, { classId: "paladino", level: 4 }], abilityModifiers: { cha: 2 } };
  assert.equal(classFeatureTemporaryHpAmount({}, { characterLevel: true, plusAbility: "cha" }, sheet), 9, "7 levels + 2");
  assert.equal(classFeatureTemporaryHpAmount({}, { proficiency: true }, sheet), 3);
  assert.equal(classFeatureTemporaryHpAmount({}, { characterLevel: true, plusAbility: "cha" }, { characterBuild: sheet.characterBuild }), null,
    "no modifier on the sheet");
  assert.equal(classFeatureTemporaryHpAmount({}, { proficiency: true }, { characterBuild: [] }), null, "no level");
  // The amounts of the classes, counted on the class's level.
  const druid = { classId: "druido" };
  const build = { characterBuild: [{ classId: "druido", level: 6 }, { classId: "mago", level: 2 }] };
  assert.deepEqual([
    classFeatureTemporaryHpAmount(druid, { perClassLevel: 4 }, build),
    classFeatureTemporaryHpAmount(druid, { base: 5, plusClassLevel: true }, build),
    classFeatureTemporaryHpAmount(druid, { byClassLevel: { 3: 2, 5: 3, 10: 4 } }, build),
    classFeatureTemporaryHpAmount(druid, { die: "1d12" }, { ...build, value: 7 }),
    classFeatureTemporaryHpAmount(druid, 5, build),
  ], [24, 11, 3, 7, 5]);
});

test("the speech and the treats are cards of their feats: no pill, the selected creatures, the Chef's pool", () => {
  const speech = record(SPEECH);
  assert.deepEqual([speech.activation.primary, classFeatureRuntimeSupport(speech).adapter, classFeatureEffectProjection(speech).kind,
    speech.effectPlan.temporaryHp], ["speciale", "resource-only", "none", { amount: { characterLevel: true, plusAbility: "cha" }, applyTo: "targets" }]);
  assert.deepEqual(classFeatureTargeting(speech), { mode: "single-target", rangeMeters: 9, maxTargets: 6, excludeSource: false });
  const treat = record(TREAT);
  assert.deepEqual([treat.activation.primary, treat.trackedResourcePoolIds, treat.resourceCosts],
    ["azione_bonus", [TREATS], [{ poolId: TREATS, amount: 1 }]]);
  assert.deepEqual(classFeatureTargeting(treat), { mode: "single-target", rangeMeters: null, maxTargets: 1, excludeSource: false });
  // The pool is the treat card's, the proficiency bonus, back with a long rest; the feat's card spends nothing.
  assert.deepEqual(record("talento-cuoco").trackedResourcePoolIds, []);
  const pool = FEAT_RESOURCE_POOLS.find((entry) => entry.id === TREATS);
  assert.deepEqual([pool.capacity, pool.refresh.map((entry) => entry.event)], [{ type: "formula", expression: "bonus_competenza" }, ["riposo_lungo"]]);
});

test("the card's line says the number the command gives, on every sheet", () => {
  for (const level of [1, 4, 5, 11, 17, 20]) {
    for (const cha of [-1, 0, 3, 5]) {
      const sheet = { characterBuild: [{ classId: "bardo", level }], abilityModifiers: { cha } };
      for (const id of [SPEECH, TREAT]) {
        const feature = record(id);
        const amount = classFeatureTemporaryHpAmount(feature, feature.effectPlan.temporaryHp.amount, sheet);
        assert.match(featPluginLine(feature, sheet), new RegExp(`^${amount} PF temporanei`, "u"), `${id} ${level} ${cha}`);
      }
    }
  }
  assert.equal(featPluginLine(record(SPEECH), { characterBuild: [{ classId: "bardo", level: 5 }], abilityModifiers: { cha: 3 } }),
    "8 PF temporanei (livello 5 + Carisma 3) a fino a 6 creature selezionate entro 9 m, tu compreso se selezionato; non si sommano a quelli che hanno già.");
  assert.equal(featPluginLine(record(TREAT), { characterBuild: [{ classId: "bardo", level: 5 }] }),
    "3 PF temporanei (bonus di competenza) alla creatura selezionata (nessuna: tu); non si sommano a quelli che ha già.");
  assert.match(featPluginLine(record(SPEECH), {}), /per il numero servono il livello e i modificatori nella scheda/u);
  assert.equal(classFeatureTemporaryHpSheetBlocker(record(SPEECH), "", {}), "Condottiero Ispiratore: discorso: mancano il livello o il modificatore sulla scheda.");
  assert.equal(classFeatureTemporaryHpSheetBlocker(record(TREAT), "", { characterBuild: [{ classId: "bardo", level: 5 }] }), "");
});

test("the speech gives level + Charisma to the creatures selected within 9 m, the leader included; one Undo takes it back", async () => {
  await classFeatureRuntime.activateClassFeature({ sourceId: "lea", featureId: SPEECH, targetIds: ["lea", "a1", "a2", "tom"] });
  assert.deepEqual(tempOf(["lea", "a1", "a2", "tom", "a3"]), [8, 8, 8, 12, 0], "5 + 3; Tom keeps his 12, the higher");
  assert.deepEqual([metaOf("a1").hp, metaOf("a1").hpMax], [30, 40], "the hit points stay");
  const [entry] = await waitForHistoryCount(1);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(tempOf(["lea", "a1", "a2", "tom"]), [0, 0, 0, 12]);
});

test("more than six creatures, or one beyond 9 m, stop the speech: nothing is written", async () => {
  await assert.rejects(classFeatureRuntime.activateClassFeature({ sourceId: "lea", featureId: SPEECH,
    targetIds: ["lea", "a1", "a2", "a3", "a4", "a5", "a6"] }), /Al massimo 6 bersagli/u);
  await assert.rejects(classFeatureRuntime.activateClassFeature({ sourceId: "lea", featureId: SPEECH, targetIds: ["a1", "far"] }),
    /fuori portata/u);
  assert.deepEqual(tempOf(["lea", "a1", "a2", "a3", "a4", "a5", "a6", "far"]), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal((await history.getHistoryEntries()).length, 0);
});

test("a treat spends one of the Chef's and gives the Chef's proficiency bonus to who eats it, to the Chef with none selected", async () => {
  await classFeatureRuntime.activateClassFeature({ sourceId: "chef", featureId: TREAT, targetIds: ["a1"] });
  assert.deepEqual([tempOf(["a1", "chef"]), metaOf("chef").classFeatureState.resources[TREATS].current], [[3, 0], 2]);
  await classFeatureRuntime.activateClassFeature({ sourceId: "chef", featureId: TREAT, targetIds: [] });
  assert.deepEqual([tempOf(["chef"]), metaOf("chef").classFeatureState.resources[TREATS].current], [[3], 1]);
  // Without a level on the sheet there is nothing to count: nothing is written.
  await assert.rejects(classFeatureRuntime.activateClassFeature({ sourceId: "cook", featureId: TREAT, targetIds: ["a2"] }));
  assert.deepEqual(tempOf(["a2"]), [0]);
});
