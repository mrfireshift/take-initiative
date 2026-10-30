import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Audit online, ON-13: at every turn each player asked every client for the movement state, and the GM answered each
// request to everyone (O(N²) deliveries). The GM already publishes the new turn's state when it changes the turn, and
// that message reaches the players before the turn itself: a player now keeps it and asks only when it never came.
const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const clone = (value) => structuredClone(value);
let env;
let moduleSequence = 0;

const sdk = {
  scene: {
    getMetadata: async () => ({ [STATE_KEY]: clone(env.turn) }),
    items: { getItems: async () => [], updateItems: async () => {} },
    grid: { getDpi: async () => 1, snapPosition: async (position) => clone(position), getDistance: async () => 0 },
  },
  broadcast: {
    onMessage: (channel, listener) => { env.listeners.set(channel, listener); return () => {}; },
    sendMessage: async (channel, data) => { env.broadcasts.push({ channel, data: clone(data) }); },
  },
};
mock.module("@owlbear-rodeo/sdk", { defaultExport: sdk });
function stub(path, namedExports) {
  mock.module(new URL(path, import.meta.url).href, { namedExports });
}
stub("../src/initiativeCards.js", { getInitiativeCard: () => ({}), loadInitiativeCard: async () => ({}) });
stub("../src/classFeatureCatalog.js", { getEnabledClassFeatures: () => [] });
stub("../src/classFeatureCore.js", { classFeaturePassiveMovementMechanics: () => null });
stub("../src/conditions.js", { getConditionInstances: () => [] });
stub("../src/sceneItemEvents.js", {
  readSceneItemsSnapshot: () => ({ items: [], complete: true, sceneEpoch: 0 }),
  subscribeSceneItemChanges: () => () => {},
});
stub("../src/spatialSceneSnapshot.js", { getSpatialSceneSnapshotService: () => ({ mount() {} }) });
stub("../src/sceneEpoch.js", {
  currentSceneEpoch: () => 0,
  isCurrentSceneEpoch: (epoch) => epoch === 0,
  subscribeSceneEpoch: () => () => {},
});
stub("../src/history.js", { suppressMovementHistory: () => {} });
stub("../src/spellStaticZoneCore.js", { SPELL_STATIC_ZONE_META_KEY: "diagnostic/zone", translatedZoneArea: () => null });
stub("../src/options/optionsRuntime.js", { runtimeOptionsService: { get: () => true }, startRuntimeOptions: async () => {} });
stub("../src/options/optionsSelectors.js", { selectMovementReminderEnabled: () => true });
stub("../src/metadataKeyScoped.js", {
  METADATA_OWNERSHIP: { SPEED_CHECK_CONTROL: { key: "diagnostic/control" } },
  writeRoomMetadataKey: async () => {},
});

const turnA = { order: ["hero", "ally"], current: 0, round: 1 };
const turnB = { order: ["hero", "ally"], current: 1, round: 1 };

async function playerRuntime() {
  env = { turn: clone(turnA), listeners: new Map(), broadcasts: [], snapshots: [] };
  const api = await import(new URL(`../src/speedCheck.js?player=${++moduleSequence}`, import.meta.url));
  api.subscribeSpeedCheckState((snapshot) => { env.snapshots.push(clone(snapshot)); });
  api.mountSpeedCheckStateBroadcast();
  api.syncSpeedCheckTurn(turnA);
  return api;
}

const speedChannel = () => [...env.listeners.keys()].find((channel) => channel.endsWith("/speed-state"));
const requests = () => env.broadcasts.filter((entry) => entry.data?.type === "request-speed-state");
const lastSnapshot = () => env.snapshots.at(-1);

async function turnKeyOf(state) {
  const api = await playerRuntime();
  api.syncSpeedCheckTurn(state);
  return lastSnapshot().turnKey;
}

test("il giocatore usa lo stato arrivato prima del turno e non lo chiede a tutti", async () => {
  const keyB = await turnKeyOf(turnB);
  const api = await playerRuntime();
  assert.notEqual(lastSnapshot().turnKey, keyB);

  // The GM's state of the new turn arrives while this player is still on the previous one.
  env.listeners.get(speedChannel())({ data: { type: "speed-state", snapshot: { turnKey: keyB, available: true, marker: "gm" } } });
  assert.notEqual(lastSnapshot().marker, "gm");

  env.broadcasts.length = 0;
  api.syncSpeedCheckTurn(turnB);
  assert.equal(requests().length, 0);
  assert.equal(lastSnapshot().marker, "gm");
  assert.equal(lastSnapshot().turnKey, keyB);
});

test("senza lo stato in anticipo il giocatore lo chiede come prima", async () => {
  const api = await playerRuntime();
  env.broadcasts.length = 0;
  api.syncSpeedCheckTurn(turnB);
  assert.equal(requests().length, 1);
});

test("uno stato in anticipo per un altro turno non viene usato", async () => {
  const api = await playerRuntime();
  env.listeners.get(speedChannel())({ data: { type: "speed-state", snapshot: { turnKey: "another-turn", available: true, marker: "gm" } } });
  env.broadcasts.length = 0;
  api.syncSpeedCheckTurn(turnB);
  assert.equal(requests().length, 1);
  assert.notEqual(lastSnapshot().marker, "gm");
});
