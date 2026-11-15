import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "node:test";
import { ID } from "../src/constants.js";

// CAP-MAXHP, lotto X0 (docs/PIANO_CAP_MAXHP.md, decision M0 of 13/11/2026): the PC's memory keeps the creature without
// the bonus or reduction of its pills, and a token gets them back from its own pills.
const META_KEY = `${ID}/meta`;
const HP_MEMORY_KEY = `${ID}/hpMemory`;

const sdkState = { role: "GM", room: {}, items: [], updates: 0 };
const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => sdkState.role },
  room: {
    getMetadata: async () => structuredClone(sdkState.room),
    setMetadata: async (update) => { sdkState.room = { ...sdkState.room, ...structuredClone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    getMetadata: async () => ({}),
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: () => () => {},
    items: {
      onChange: () => () => {},
      getItems: async (ids) => structuredClone(Array.isArray(ids)
        ? sdkState.items.filter((item) => ids.includes(item.id))
        : sdkState.items),
      updateItems: async (ids, updater) => {
        sdkState.updates += 1;
        const drafts = structuredClone(sdkState.items.filter((item) => ids.includes(item.id)));
        updater(drafts);
        sdkState.items = sdkState.items.map((item) => drafts.find((draft) => draft.id === item.id) || item);
      },
    },
  },
  broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
};
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", ...args }),
    buildImage: (...args) => ({ type: "IMAGE", ...args }),
    buildPath: (...args) => ({ type: "PATH", ...args }),
    buildText: (...args) => ({ type: "TEXT", ...args }),
    buildShape: (...args) => ({ type: "SHAPE", ...args }),
    Command: class Command {},
  },
});

// The automatic Privo di sensi after a fill goes through the effects coordinator, which is not here.
mock.module("../src/hpConditionAutomation.js", {
  namedExports: {
    getZeroHPConditionHistoryIds: () => [],
    reconcileZeroHPConditionsForItems: async () => {},
  },
});

const { syncHPBatchToMemory, applyHPMemoryToSceneForMissingHP } = await import("../src/hpMemory.js");
const { createActorVitalsStore, ACTOR_VITALS_ROOM_KEY } = await import("../src/actorVitalsStore.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

const aidPill = (amount = 5) => ({ id: "aid-1", condition: "Aiuto", spellId: "aid",
  mechanics: { maxHp: { amount, raisesCurrent: true } } });
const harmPill = (amount = -49) => ({ id: "harm-1", condition: "Ferire", spellId: "harm",
  mechanics: { maxHp: { amount } } });

// A PC of the legacy memory (no actorProfileId): name and portrait are its key.
function legacyPc(id, { hp = 30, hpMax = 30, conditions = [], name = "Mira" } = {}) {
  const meta = { attitude: "pc", inInitiative: true, conditions };
  if (hp !== null) meta.hp = hp;
  if (hpMax !== null) meta.hpMax = hpMax;
  return { id, name, layer: "CHARACTER", image: { url: `https://assets.test/${name}.png` }, metadata: { [META_KEY]: meta } };
}

const memoryEntry = (name = "Mira") => sdkState.room[HP_MEMORY_KEY]?.[`${name}||https://assets.test/${name}.png`] || null;

function resetSdk(items = [], room = {}) {
  sdkState.items = structuredClone(items);
  sdkState.room = structuredClone(room);
  sdkState.updates = 0;
}

test("X0: la memoria salva il PG senza il bonus di Aiuto", async () => {
  resetSdk([legacyPc("mira", { hp: 32, hpMax: 35, conditions: [aidPill()] })]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 32, hpMax: 35 }],
    { sceneEpoch: currentSceneEpoch(), items: sdkState.items, isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 30, hpMax: 30 });
});

test("X0: valori e pill dello stesso momento: la memoria rilegge il token dopo il comando", async () => {
  // Heal ended Harm's reduction in the command: the caller passes the committed values with the token read before.
  const before = legacyPc("mira", { hp: 40, hpMax: 51, conditions: [harmPill()] });
  resetSdk([legacyPc("mira", { hp: 51, hpMax: 100, conditions: [] })]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 51, hpMax: 100 }],
    { sceneEpoch: currentSceneEpoch(), items: [before], isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 51, hpMax: 100 });
});

test("X0: la memoria tiene i PF che il comando ha scritto, non quelli chiesti", async () => {
  // Death Ward left 1 HP where the caller asked for 0.
  resetSdk([legacyPc("mira", { hp: 1, hpMax: 30 })]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 0, hpMax: 30 }],
    { sceneEpoch: currentSceneEpoch(), items: sdkState.items, isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 1, hpMax: 30 });
});

test("X0: un token che non si rilegge usa i valori passati, come prima", async () => {
  const passed = legacyPc("mira", { hp: 12, hpMax: 24 });
  resetSdk([]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 12, hpMax: 24 }],
    { sceneEpoch: currentSceneEpoch(), items: [passed], isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 12, hpMax: 24 });
});

test("X0: senza pill la memoria resta quella di oggi, anche con i temporanei del vecchio formato", async () => {
  resetSdk([legacyPc("mira", { hp: 35, hpMax: 30 })]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 35, hpMax: 30 }],
    { sceneEpoch: currentSceneEpoch(), items: sdkState.items, isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 35, hpMax: 30 });
});

test("X0: un token senza PF riempito dalla memoria riprende il bonus delle sue pill", async () => {
  resetSdk([legacyPc("mira", { hp: null, hpMax: null, conditions: [aidPill()] })], {
    [HP_MEMORY_KEY]: { "Mira||https://assets.test/Mira.png": { hp: 27, hpMax: 30, attitude: "pc", t: 1 } },
  });
  await applyHPMemoryToSceneForMissingHP(currentSceneEpoch(), { isCurrent: () => true });
  const meta = sdkState.items[0].metadata[META_KEY];
  assert.deepEqual({ hp: meta.hp, hpMax: meta.hpMax }, { hp: 27, hpMax: 35 });
});

// actorVitals: the registry of the PCs with an actorProfileId.
function actorToken(id, { hp, hpMax, conditions = [] }) {
  return { id, layer: "CHARACTER", metadata: { [META_KEY]: { actorProfileId: "actor-a", hp, hpMax, conditions } } };
}

function vitalsHarness({ items, record }) {
  let metadata = { [ACTOR_VITALS_ROOM_KEY]: { schemaVersion: 1, actors: { "actor-a": { ...record, updatedAt: 1, revision: 1 } } } };
  const sets = [];
  let updates = 0;
  let handler = null;
  const store = createActorVitalsStore({
    api: {
      getMetadata: async () => structuredClone(metadata),
      setMetadata: async (update) => { sets.push(structuredClone(update)); metadata = { ...metadata, ...structuredClone(update) }; },
    },
    itemsApi: {
      getItems: async () => items,
      updateItems: async (ids, updater) => { updates += 1; updater(items.filter((item) => ids.includes(item.id))); },
    },
    storage: { getItem: () => null, setItem: () => {} },
    getSceneEpoch: () => 1,
    isSceneEpochCurrent: () => true,
    subscribeItems: (next) => { handler = next; return () => { handler = null; }; },
    subscribeEpoch: () => () => {},
  });
  return {
    store,
    record: () => metadata[ACTOR_VITALS_ROOM_KEY].actors["actor-a"],
    sets: () => sets.length,
    updates: () => updates,
    dispatch: (event) => handler(event),
  };
}

test("X0: ricaricare una scena con Aiuto non riscrive il token", async () => {
  const token = actorToken("t1", { hp: 35, hpMax: 35, conditions: [aidPill()] });
  const harness = vitalsHarness({ items: [token], record: { hp: 30, hpMax: 30 } });
  await harness.store.reconcileCurrentScene(1);
  assert.equal(harness.updates(), 0);
  assert.deepEqual({ hp: token.metadata[META_KEY].hp, hpMax: token.metadata[META_KEY].hpMax }, { hp: 35, hpMax: 35 });
  assert.equal(harness.sets(), 0);
});

test("X0: il ripristino da un'altra scena aggiunge il bonus delle pill del token", async () => {
  const token = actorToken("t1", { hp: 35, hpMax: 35, conditions: [aidPill()] });
  const harness = vitalsHarness({ items: [token], record: { hp: 27, hpMax: 30 } });
  await harness.store.reconcileCurrentScene(1);
  assert.deepEqual({ hp: token.metadata[META_KEY].hp, hpMax: token.metadata[META_KEY].hpMax }, { hp: 27, hpMax: 35 });
  // A reduction: the hit points stay within the reduced maximum.
  const reduced = actorToken("t2", { hp: 40, hpMax: 51, conditions: [harmPill()] });
  const second = vitalsHarness({ items: [reduced], record: { hp: 80, hpMax: 100 } });
  await second.store.reconcileCurrentScene(1);
  assert.deepEqual({ hp: reduced.metadata[META_KEY].hp, hpMax: reduced.metadata[META_KEY].hpMax }, { hp: 51, hpMax: 51 });
});

test("X0: il registro salva dal token primario la creatura senza i suoi effetti", async () => {
  const token = actorToken("t1", { hp: 30, hpMax: 30 });
  const harness = vitalsHarness({ items: [token], record: { hp: 30, hpMax: 30 } });
  await harness.store.start();
  // Aid: 35/35, the base does not change and the registry is not written.
  token.metadata[META_KEY] = { ...token.metadata[META_KEY], hp: 35, hpMax: 35, conditions: [aidPill()] };
  await harness.dispatch({ sceneEpoch: 1, revision: 2, items: [token], allItems: [token], flags: {} });
  assert.equal(harness.sets(), 0);
  // 8 damage: 27/35, the registry keeps 27/30.
  token.metadata[META_KEY] = { ...token.metadata[META_KEY], hp: 27 };
  await harness.dispatch({ sceneEpoch: 1, revision: 3, items: [token], allItems: [token], flags: {} });
  assert.deepEqual({ hp: harness.record().hp, hpMax: harness.record().hpMax }, { hp: 27, hpMax: 30 });
  // Harm's reduction: 40/51 is 40/100 for the registry.
  token.metadata[META_KEY] = { ...token.metadata[META_KEY], hp: 40, hpMax: 51, conditions: [harmPill()] };
  await harness.dispatch({ sceneEpoch: 1, revision: 4, items: [token], allItems: [token], flags: {} });
  assert.deepEqual({ hp: harness.record().hp, hpMax: harness.record().hpMax }, { hp: 40, hpMax: 100 });
  harness.store.stop();
});
