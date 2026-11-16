import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "node:test";
import { ID } from "../src/constants.js";

// Trasformazioni, lotto W5d: the harness of maxHpMemory.test.js (CAP-MAXHP, decision M0).
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

// actorVitals: the registry of the PCs with an actorProfileId.
function actorToken(id, { hp, hpMax, conditions = [] }) {
  return { id, layer: "CHARACTER", metadata: { [META_KEY]: { actorProfileId: "actor-a", hp, hpMax, conditions } } };
}

function vitalsHarness({ items, record, endTransformations = null }) {
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
    endTransformations,
  });
  return {
    store,
    record: () => metadata[ACTOR_VITALS_ROOM_KEY].actors["actor-a"],
    sets: () => sets.length,
    updates: () => updates,
    dispatch: (event) => handler(event),
  };
}


// Trasformazioni, lotto W5d (docs/PIANO_TRASFORMAZIONI.md §5.8): a creature in a form keeps its own HP in the pill (the
// stash); the memory and the registry keep those, never the form's.
const wolfPill = (stash = { hp: 34, hpMax: 40 }) => ({ id: "ws-1", condition: "Forma Selvatica", active: true,
  type: "class-feature", mechanics: { transformation: { kind: "wild-shape", form: { name: "Wolf", hitPoints: { average: 11 } },
    formHp: 11, stash } } });

test("W5d: la memoria dei PG senza identità salva i PF del druido, non quelli del lupo", async () => {
  resetSdk([legacyPc("mira", { hp: 7, hpMax: 11, conditions: [wolfPill()] })]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 7, hpMax: 11 }],
    { sceneEpoch: currentSceneEpoch(), items: sdkState.items, isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 34, hpMax: 40 });
});

test("W5d, G33: con Aiuto sulla forma la memoria legge i PF messi da parte come se Aiuto finisse (M0)", async () => {
  resetSdk([legacyPc("mira", { hp: 7, hpMax: 11, conditions: [wolfPill({ hp: 39, hpMax: 45 }), aidPill()] })]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 7, hpMax: 11 }],
    { sceneEpoch: currentSceneEpoch(), items: sdkState.items, isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 39, hpMax: 40 });
});

test("W5d: il registro salva dal token in forma i PF del druido", async () => {
  const token = actorToken("t1", { hp: 34, hpMax: 40 });
  const harness = vitalsHarness({ items: [token], record: { hp: 34, hpMax: 40 } });
  await harness.store.start();
  token.metadata[META_KEY] = { ...token.metadata[META_KEY], hp: 11, hpMax: 11, conditions: [wolfPill()] };
  await harness.dispatch({ sceneEpoch: 1, revision: 2, items: [token], allItems: [token], flags: {} });
  assert.equal(harness.sets(), 0, "the form's 11/11 are not the druid's");
  token.metadata[META_KEY] = { ...token.metadata[META_KEY], hp: 4 };
  await harness.dispatch({ sceneEpoch: 1, revision: 3, items: [token], allItems: [token], flags: {} });
  assert.equal(harness.sets(), 0, "the wolf hurt: the druid is not");
});

test("W5d, G41: una mappa vecchia con la pill: se il registro coincide la forma resta, se no finisce dal coordinatore", async () => {
  const same = actorToken("t1", { hp: 11, hpMax: 11, conditions: [wolfPill()] });
  const ended = [];
  const first = vitalsHarness({ items: [same], record: { hp: 34, hpMax: 40 }, endTransformations: async (list) => { ended.push(...list); } });
  await first.store.reconcileCurrentScene(1);
  assert.deepEqual([first.updates(), ended.length, same.metadata[META_KEY].hp], [0, 0, 11]);
  const hurt = actorToken("t2", { hp: 11, hpMax: 11, conditions: [wolfPill(), aidPill()] });
  const second = vitalsHarness({ items: [hurt], record: { hp: 20, hpMax: 40 }, endTransformations: async (list) => { ended.push(...list); } });
  await second.store.reconcileCurrentScene(1);
  assert.deepEqual(hurt.metadata[META_KEY].hp, 11, "no write over the form's HP");
  assert.deepEqual(ended.map(({ itemId, instanceId, hp, hpMax }) => ({ itemId, instanceId, hp, hpMax })),
    [{ itemId: "t2", instanceId: "ws-1", hp: 20, hpMax: 45 }], "the registry's HP with the token's Aid");
  assert.deepEqual(ended[0].expectedFields, { hp: { present: true, value: 11 }, hpMax: { present: true, value: 11 } });
});

test("ritratto: un PG senza identità con il ritratto della forma resta lo stesso nella memoria", async () => {
  const pc = legacyPc("mira", { hp: 7, hpMax: 11, conditions: [wolfPill()] });
  pc.image = { url: "https://images.test/bestiary/tokens/MM/Wolf.webp" };
  pc.metadata[META_KEY].transformationTokenBefore = { scale: { x: 1, y: 1 }, image: { url: "https://assets.test/Mira.png" } };
  resetSdk([pc]);
  await syncHPBatchToMemory([{ itemId: "mira", hp: 7, hpMax: 11 }],
    { sceneEpoch: currentSceneEpoch(), items: sdkState.items, isCurrent: () => true });
  assert.deepEqual({ hp: memoryEntry().hp, hpMax: memoryEntry().hpMax }, { hp: 34, hpMax: 40 }, "under its own key, not the wolf's");
});
