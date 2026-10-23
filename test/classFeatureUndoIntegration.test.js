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
const TIDES_ID = "stregone-magia-selvaggia-onde-di-caos";
const TIDES_POOL_ID = "stregone-magia-selvaggia-onde-di-caos-usi";
const STROKE_OF_LUCK_ID = "ladro-colpo-di-fortuna";
const STROKE_OF_LUCK_POOL_ID = "ladro-colpo-di-fortuna-usi";

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
  player: { getRole: async () => "GM", getId: async () => "class-feature-undo-gm" },
  room: { id: "class-feature-undo-room", getMetadata: async () => ({}), setMetadata: async () => {} },
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
      getItemBounds: async (ids) => Object.fromEntries(itemsFor(ids).map((item) => [item.id, {
        min: clone(item.position || { x: 0, y: 0 }),
        max: { x: Number(item.position?.x || 0) + 100, y: Number(item.position?.y || 0) + 100 },
      }])),
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

const wildMagicBuild = [{
  classId: "stregone",
  level: 1,
  subclassId: "stregone-magia-selvaggia",
}];

const rogueBuild = [{
  classId: "ladro",
  level: 20,
  subclassId: "",
}];

function tidesToken() {
  return {
    id: "sorcerer",
    name: "Stregone",
    layer: "CHARACTER",
    position: { x: 0, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 12,
        hpMax: 12,
        conditions: { version: 2, instances: [] },
        initiativeCard: {
          classFeaturesConfigured: true,
          enabledClassFeatureIds: [TIDES_ID],
          characterBuild: wildMagicBuild,
        },
        classFeatureState: {
          version: 1,
          resources: { [TIDES_POOL_ID]: { current: 1, maximum: 1, unlimited: false } },
          instances: [],
        },
      },
    },
  };
}

function rogueToken() {
  return {
    id: "rogue",
    name: "Ladro",
    layer: "CHARACTER",
    position: { x: 200, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 12,
        hpMax: 12,
        conditions: { version: 2, instances: [] },
        initiativeCard: {
          classFeaturesConfigured: true,
          enabledClassFeatureIds: [STROKE_OF_LUCK_ID],
          characterBuild: rogueBuild,
        },
        classFeatureState: {
          version: 1,
          resources: { [STROKE_OF_LUCK_POOL_ID]: { current: 1, maximum: 1, unlimited: false } },
          instances: [],
        },
      },
    },
  };
}

function currentToken() {
  return scene.items.find((item) => item.id === "sorcerer");
}

function currentRogueToken() {
  return scene.items.find((item) => item.id === "rogue");
}

function resetScene() {
  scene.ready = true;
  scene.metadata = { [STATE_KEY]: { order: ["sorcerer", "rogue"], current: 0, round: 2 } };
  scene.items = [tidesToken(), rogueToken()];
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

function classFeatureAfter(entry) {
  return entry.changes.find((change) => change.id === "sorcerer")?.afterMetadata?.classFeatureState;
}

test.beforeEach(async () => { await mountRuntime(); });

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  globalThis.location = previousLocation;
});

test("ARCH-A: Onde di Caos registra l'after canonico e l'Undo immediato riesce", async () => {
  await classFeatureRuntime.activateClassFeature({ sourceId: "sorcerer", featureId: TIDES_ID });
  const [entry] = await waitForHistoryCount(1);
  const currentBeforeUndo = clone(currentToken().metadata[META_KEY]);

  assert.deepEqual(classFeatureAfter(entry), {
    present: true,
    value: currentBeforeUndo.classFeatureState,
  });
  assert.equal(currentBeforeUndo.classFeatureState.resources[TIDES_POOL_ID].current, 0);
  assert.equal(currentBeforeUndo.conditions.instances.length, 1);

  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone[0]?.id, entry.id);
  assert.equal(currentToken().metadata[META_KEY].classFeatureState.resources[TIDES_POOL_ID].current, 1);
  assert.equal(currentToken().metadata[META_KEY].conditions?.instances?.length || 0, 0);
});

test("ARCH-A: il call-site resource-only conserva lo stesso contratto di Undo", async () => {
  await classFeatureRuntime.activateClassFeature({ sourceId: "rogue", featureId: STROKE_OF_LUCK_ID });
  const [entry] = await waitForHistoryCount(1);
  const currentBeforeUndo = clone(currentRogueToken().metadata[META_KEY]);

  assert.deepEqual(entry.changes.find((change) => change.id === "rogue")?.afterMetadata?.classFeatureState, {
    present: true,
    value: currentBeforeUndo.classFeatureState,
  });
  assert.equal(currentBeforeUndo.classFeatureState.resources[STROKE_OF_LUCK_POOL_ID].current, 0);

  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone[0]?.id, entry.id);
  assert.equal(currentRogueToken().metadata[META_KEY].classFeatureState.resources[STROKE_OF_LUCK_POOL_ID].current, 1);
});

test("ARCH-A: una mutazione canonica successiva sul pool resta un conflitto Undo", async () => {
  await classFeatureRuntime.activateClassFeature({ sourceId: "sorcerer", featureId: TIDES_ID });
  const [entry] = await waitForHistoryCount(1);
  const before = currentToken().metadata[META_KEY].classFeatureState;
  await sdkStub.scene.items.updateItems(["sorcerer"], (drafts) => {
    const token = drafts[0];
    token.metadata[META_KEY].classFeatureState = {
      ...before,
      resources: {
        ...before.resources,
        [TIDES_POOL_ID]: { ...before.resources[TIDES_POOL_ID], current: 1 },
      },
    };
  });

  const blocked = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(blocked, []);
  assert.equal(currentToken().metadata[META_KEY].classFeatureState.resources[TIDES_POOL_ID].current, 1);
});

const BEND_LUCK_ID = "stregone-magia-selvaggia-piegare-la-fortuna";
const SORCERY_POINTS_ID = "stregone-punti-stregoneria";
const reactionNames = () => (currentToken().metadata[META_KEY].conditions?.instances || [])
  .filter((instance) => instance.condition === "Reazione usata");
function bendLuckSorcerer() {
  scene.items = scene.items.map((item) => item.id !== "sorcerer" ? item : produce(item, (draft) => {
    draft.metadata[META_KEY].initiativeCard.enabledClassFeatureIds = [BEND_LUCK_ID];
    draft.metadata[META_KEY].initiativeCard.characterBuild = [{ ...wildMagicBuild[0], level: 6 }];
    draft.metadata[META_KEY].classFeatureState.resources = { [SORCERY_POINTS_ID]: { current: 6, maximum: 6, unlimited: false } };
  }));
}

test("a feature used with a reaction marks the reaction in its own command: one Undo gives both back", async () => {
  bendLuckSorcerer();
  const result = await classFeatureRuntime.activateClassFeature({ sourceId: "sorcerer", featureId: BEND_LUCK_ID });
  assert.deepEqual(result.reaction, { spent: true, alreadyUsed: false });
  const [entry] = await waitForHistoryCount(1);
  assert.equal(currentToken().metadata[META_KEY].classFeatureState.resources[SORCERY_POINTS_ID].current, 4);
  assert.equal(reactionNames().length, 1);
  assert.equal(reactionNames()[0].expiry?.mode, "turn-start", "back at the start of the sorcerer's next turn");

  const again = await classFeatureRuntime.activateClassFeature({ sourceId: "sorcerer", featureId: BEND_LUCK_ID });
  assert.deepEqual(again.reaction, { spent: false, alreadyUsed: true });
  assert.equal(reactionNames().length, 1, "never marked twice");

  await waitForHistoryCount(2);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(currentToken().metadata[META_KEY].classFeatureState.resources[SORCERY_POINTS_ID].current, 6);
  assert.equal(reactionNames().length, 0);
});

test("out of combat a reaction feature spends its resource only; a feature used otherwise never marks the reaction", async () => {
  bendLuckSorcerer();
  scene.metadata = { [STATE_KEY]: { order: [], current: 0, round: 1 } };
  const result = await classFeatureRuntime.activateClassFeature({ sourceId: "sorcerer", featureId: BEND_LUCK_ID });
  assert.equal(result.reaction, undefined);
  assert.equal(currentToken().metadata[META_KEY].classFeatureState.resources[SORCERY_POINTS_ID].current, 4);
  assert.equal(reactionNames().length, 0);
  await mountRuntime();
  await classFeatureRuntime.activateClassFeature({ sourceId: "sorcerer", featureId: TIDES_ID });
  assert.equal(reactionNames().length, 0, "Tides of Chaos takes no reaction");
});

test("Spendi for a reaction feature marks the reaction with the resource; without the feature it spends the resource only", async () => {
  bendLuckSorcerer();
  const result = await classFeatureRuntime.adjustClassFeatureResource("sorcerer", SORCERY_POINTS_ID, { delta: -2 }, { featureId: BEND_LUCK_ID });
  assert.deepEqual(result.reaction, { spent: true, alreadyUsed: false });
  assert.equal(currentToken().metadata[META_KEY].classFeatureState.resources[SORCERY_POINTS_ID].current, 4);
  assert.equal(reactionNames().length, 1);
  await mountRuntime();
  bendLuckSorcerer();
  const plain = await classFeatureRuntime.adjustClassFeatureResource("sorcerer", SORCERY_POINTS_ID, { delta: -1 });
  assert.equal(plain.reaction, undefined);
  assert.equal(reactionNames().length, 0);
});

const UNCANNY_DODGE_ID = "ladro-schivata-prodigiosa";
const rogueReactions = () => (currentRogueToken().metadata[META_KEY].conditions?.instances || [])
  .filter((instance) => instance.condition === "Reazione usata");
function uncannyRogue() {
  scene.items = scene.items.map((item) => item.id !== "rogue" ? item : produce(item, (draft) => {
    draft.metadata[META_KEY].initiativeCard.enabledClassFeatureIds = [STROKE_OF_LUCK_ID, UNCANNY_DODGE_ID];
  }));
}

test("Usa reazione: a reaction feature with nothing to spend marks only the reaction, undoable; never twice, never out of combat", async () => {
  uncannyRogue();
  const result = await classFeatureRuntime.useClassFeatureReaction({ sourceId: "rogue", featureId: UNCANNY_DODGE_ID });
  assert.deepEqual(result.reaction, { spent: true, alreadyUsed: false });
  assert.equal(rogueReactions().length, 1);
  const [entry] = await waitForHistoryCount(1);
  assert.match(entry.label, /Reazione: Schivata Prodigiosa/);
  await assert.rejects(classFeatureRuntime.useClassFeatureReaction({ sourceId: "rogue", featureId: UNCANNY_DODGE_ID }), /già usato la reazione/);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(rogueReactions().length, 0);
  await assert.rejects(classFeatureRuntime.useClassFeatureReaction({ sourceId: "rogue", featureId: STROKE_OF_LUCK_ID }), /non usa la reazione/);
  scene.metadata = { [STATE_KEY]: { order: [], current: 0, round: 1 } };
  await assert.rejects(classFeatureRuntime.useClassFeatureReaction({ sourceId: "rogue", featureId: UNCANNY_DODGE_ID }), /Fuori dal combattimento/);
});
