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

// Trasformazioni, lotto W2a (docs/PIANO_TRASFORMAZIONI.md): la forma scelta nella console va sulla pill della Forma
// Selvatica, controllata con i limiti del druido; i PF restano quelli del druido fino a W5.
const WILD_SHAPE_ID = "druido-forma-selvatica";
const WILD_SHAPE_POOL_ID = "druido-forma-selvatica-usi";
function druidToken(level) {
  return {
    id: "druid",
    name: "Druida",
    layer: "CHARACTER",
    position: { x: 400, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 30,
        hpMax: 30,
        conditions: { version: 2, instances: [] },
        initiativeCard: {
          classFeaturesConfigured: true,
          enabledClassFeatureIds: [WILD_SHAPE_ID],
          characterBuild: [{ classId: "druido", level, subclassId: "" }],
        },
        classFeatureState: {
          version: 1,
          resources: { [WILD_SHAPE_POOL_ID]: { current: 2, maximum: 2, unlimited: false } },
          instances: [],
        },
      },
    },
  };
}
const crocodileForm = {
  name: "Crocodile", ref: "Crocodile|MM", source: "5etools", type: "beast", cr: "1/2", size: "large",
  hitPoints: { average: 19, formula: "3d10 + 3" }, armorClass: 12, speeds: { walk: 6, swim: 9 }, actions: [],
};
const druidMeta = () => scene.items.find((item) => item.id === "druid").metadata[META_KEY];
const wildShapePill = () => (druidMeta().conditions?.instances || []).find((instance) => instance.effectId === WILD_SHAPE_ID);

test("W2a, W5b: la forma scelta nella console va sulla pill con i suoi PF, quelli del druido messi da parte; l'Annulla toglie tutto", async () => {
  scene.items.push(druidToken(4));
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: crocodileForm });
  const pill = wildShapePill();
  assert.equal(pill.displayLabel, "Forma Selvatica · Crocodile");
  assert.equal(pill.mechanics.transformation.kind, "wild-shape");
  assert.equal(pill.mechanics.transformation.keepsMind, true);
  assert.equal(pill.mechanics.transformation.form.name, "Crocodile");
  assert.deepEqual(pill.mechanics.transformation.form.speeds, { walk: 6, swim: 9 });
  assert.equal(pill.mechanics.transformation.formHp, 19);
  assert.match(pill.effectDetail, /^Crocodile \(bestia, GS 1\/2\): CA 12 · PF 19 · 6 m, nuoto 9 m\. Il druido prende i PF della forma/);
  assert.deepEqual([druidMeta().hp, druidMeta().hpMax, pill.mechanics.transformation.stash], [19, 19, { hp: 30, hpMax: 30 }]);
  assert.equal(druidMeta().classFeatureState.resources[WILD_SHAPE_POOL_ID].current, 1);
  const [entry] = await waitForHistoryCount(1);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(wildShapePill(), undefined);
  assert.deepEqual([druidMeta().hp, druidMeta().hpMax], [30, 30]);
  assert.equal(druidMeta().classFeatureState.resources[WILD_SHAPE_POOL_ID].current, 2);
});

test("W2a: una forma oltre i limiti del druido non si attiva e non spende l'uso", async () => {
  scene.items.push(druidToken(2));
  await assert.rejects(
    classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: crocodileForm }),
    /Forma non ammessa: GS 1\/2: oltre il limite di GS 1\/4 al 2° livello\. Nuota: le forme che nuotano arrivano al 4° livello\./,
  );
  assert.equal(wildShapePill(), undefined);
  assert.equal(druidMeta().classFeatureState.resources[WILD_SHAPE_POOL_ID].current, 2);
});

test("W2a: senza forma, come dalla scheda, la Forma Selvatica resta la pill di prima", async () => {
  scene.items.push(druidToken(4));
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID });
  const pill = wildShapePill();
  assert.equal(pill.displayLabel, undefined);
  assert.equal(pill.mechanics.transformation.form, undefined);
  assert.match(pill.effectDetail, /La forma si sceglie nella console attacchi/);
});

test("W3b: le difese della forma vanno sulla pill, e il motore le legge con quelle del druido", async () => {
  scene.items.push(druidToken(4));
  const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
  const frostWolf = { ...crocodileForm, name: "Frost Wolf Pup", ref: "Frost Wolf Pup|HB", speeds: { walk: 12 },
    damageDefenses: { resistances: ["cold"], immunities: [], vulnerabilities: ["fire"] } };
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: frostWolf });
  assert.deepEqual(wildShapePill().mechanics.damageDefenses, { resistances: ["cold"], vulnerabilities: ["fire"] });
  const defenses = damageDefensesForItem(scene.items.find((item) => item.id === "druid"), META_KEY);
  assert.ok(defenses.resistances.includes("cold"));
  assert.ok(defenses.vulnerabilities.includes("fire"));
});

test("W4a: la pill porta le velocità della forma, che sostituiscono quelle del druido", async () => {
  scene.items.push(druidToken(4));
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: crocodileForm });
  assert.deepEqual(wildShapePill().mechanics.movement,
    { label: "Forma Selvatica · Crocodile", modes: { walk: { replaceMeters: 6 }, swim: { replaceMeters: 9 } } });
});

// Trasformazioni, lotto W6: la durata della forma e il Circolo della Luna.
const COMBAT_WILD_SHAPE_ID = "druido-circolo-della-luna-forma-selvatica-da-combattimento";
function moonDruidToken(level) {
  const token = druidToken(level);
  const card = token.metadata[META_KEY].initiativeCard;
  card.characterBuild = [{ classId: "druido", level, subclassId: "druido-circolo-della-luna" }];
  card.enabledClassFeatureIds = [WILD_SHAPE_ID, COMBAT_WILD_SHAPE_ID];
  return token;
}

test("W6: la forma dura metà del livello da druido in ore, 600 round l'una", async () => {
  scene.items.push(druidToken(4));
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: crocodileForm });
  const instance = druidMeta().classFeatureState.instances.find((entry) => entry.featureId === WILD_SHAPE_ID);
  assert.equal(instance.expiresRound - instance.startedRound + 1, 1200, "4th level: 2 hours");
});

test("W6: dalla scheda, senza forma, la pill dura lo stesso; i PF non cambiano", async () => {
  scene.items.push(druidToken(6));
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID });
  const instance = druidMeta().classFeatureState.instances.find((entry) => entry.featureId === WILD_SHAPE_ID);
  assert.equal(instance.expiresRound - instance.startedRound + 1, 1800, "6th level: 3 hours");
  assert.deepEqual([druidMeta().hp, druidMeta().hpMax], [30, 30]);
  assert.equal(wildShapePill().mechanics?.transformation?.form, undefined);
});

test("W6: Forma Selvatica da Combattimento: azione bonus; in forma la cura spende uno slot e cura la forma; un Annulla rimette tutto", async () => {
  scene.items.push(moonDruidToken(4));
  const { getEnabledClassFeatures } = await import("../src/classFeatureCatalog.js");
  const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");
  assert.equal(getEnabledClassFeatures(druidMeta().initiativeCard).find((entry) => entry.id === WILD_SHAPE_ID).activation.primary,
    "azione_bonus");
  assert.equal(getClassFeatureDefinition(WILD_SHAPE_ID).activation.primary, "azione", "the catalog's own stays an action");
  await assert.rejects(classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: COMBAT_WILD_SHAPE_ID, slotLevel: 1,
    value: 6 }), /Serve una Forma Selvatica/);
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: crocodileForm });
  const hit = await effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "druid", hp: 5, hpMax: 19,
    hpIntent: { mode: "damage", amount: 14, eventId: "bite" } }] }], { kind: "hp", label: "Danno", targetIds: ["druid"] });
  effects.requireAppliedEffectsMutation(hit);
  await assert.rejects(classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: COMBAT_WILD_SHAPE_ID, slotLevel: 2,
    value: 17 }), /da 2 a 16/);
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: COMBAT_WILD_SHAPE_ID, slotLevel: 2, value: 11 });
  const { spellSlotPoolId } = await import("../src/spellSlotCore.js");
  const slotsLeft = () => druidMeta().classFeatureState.resources?.[spellSlotPoolId(2)]?.current;
  assert.deepEqual([druidMeta().hp, druidMeta().hpMax, slotsLeft(), wildShapePill().mechanics.transformation.stash],
    [16, 19, 2, { hp: 30, hpMax: 30 }]);
  const entries = await waitForHistoryCount(3);
  assert.match(entries.at(-1).label, /Forma Selvatica da Combattimento: \+11 PF, slot di 2°/);
  await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([druidMeta().hp, slotsLeft() ?? 3], [5, 3]);
});

test("ritratto: scelto nella console, la Forma Selvatica lo porta sulla pill per il controllore della taglia", async () => {
  scene.items.push(druidToken(4));
  const portrait = { url: "https://images.test/bestiary/tokens/MM/Crocodile.webp", width: 280, height: 280 };
  await classFeatureRuntime.activateClassFeature({ sourceId: "druid", featureId: WILD_SHAPE_ID, transformationForm: crocodileForm,
    transformationPortrait: portrait });
  assert.deepEqual(wildShapePill().mechanics.transformation.portrait, { ...portrait, mime: "image/webp" });
});
