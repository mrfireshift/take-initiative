// Il Corpo Non Era Qui (v21): the boss's teleport with the spells' engine; production coordinator, History and Undo.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: {
    id: "boss-teleport-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => { roomMetadata = { ...roomMetadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
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
const { createBossActionRuntime } = await import("../src/bossActionExecution.js");
const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
const { createBossActionProfileStore } = await import("../src/bossActionProfileStore.js");
const { readFile } = await import("node:fs/promises");

const p2 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const p3 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const ps = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/shothragoth.html", import.meta.url), "utf8"));
const named2 = (name) => p2.abilities.find((entry) => entry.name === name);
const markAction = named2("Mark of the Frostmaiden");
const icekiss = named2("Icekiss +2");
const kiss = named2("Frostmaiden's Kiss");
const breath = named2("Breath of the Long Night");
const detonation = p3.abilities.find((entry) => entry.name === "Detonation of the Mark");
const MARK_EFFECT = "monster-mark:auril:mark-of-the-frostmaiden";
const memory = new Map();
const store = createBossActionProfileStore({ storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } });
let runtime;
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const instances = (id) => meta(id).conditions?.instances || [];
const named = (id, name) => instances(id).filter((entry) => entry.condition === name);
const marks = (id) => instances(id).filter((entry) => entry.effectId === MARK_EFFECT);
const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const defenses = (list) => ({ initiativeCard: { damageDefenses: { immunities: [], resistances: [], vulnerabilities: [], ...list } } });
const marked = { conditions: { version: 2, instances: [{ id: "mark-seed", condition: "Mark of the Frostmaiden", active: true, effectId: MARK_EFFECT,
  effectKind: "debuff", sourceId: "auril", sourceName: "Auril", parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] } };
const ORDER = ["auril", "dars", "__EPIC__:auril:1", "mira", "__EPIC__:auril:2", "sera", "__EPIC__:auril:3"];

async function setup(profile, extra = {}, { bossHp = 580 } = {}) {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `boss-teleport-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3); store.put(ps);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneItems[0].metadata[META_KEY].hp = bossHp;
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-teleport-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [] });
  await runtime.bindBossActionProfile("auril", profile);
}
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });
const setRound = (round) => { sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], round }; };

async function resolve(profile, action, request) {
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.executeBossAction({ sourceId: "auril", actionId: action.id, profileId: profile.profileId,
    profileRevision: profile.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity, ...request });
}
const namedS = (name) => ps.abilities.find((entry) => entry.name === name);
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");
const undoLast = async () => { const entries = await monsterEntries(); return history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() }); };
const active = (id) => instances(id).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The movement watcher (history.js in the background) acknowledges that an Undo moving a token is not a movement.
sdk.broadcast.onMessage("com.thebigpicture.initiative/history-control", ({ data }) => {
  if (data?.type === "suppress-history-undo" && data.requestId)
    void sdk.broadcast.sendMessage("com.thebigpicture.initiative/history-control-ack", { type: "suppress-history-undo-ack", requestId: data.requestId });
});
const position = (id) => sceneItems.find((item) => item.id === id).position;

test("Il Corpo Non Era Qui: the save, Prono and the boss's teleport in one History entry; Undo restores HP, condition and position", async () => {
  await setup(ps);
  sceneItems[0].position = { x: 300, y: 300 };
  const result = await resolve(ps, namedS("Il Corpo Non Era Qui"), { targetId: "mira", outcome: "failed", componentAmounts: { force: 10 }, teleport: { x: 750, y: 300 } });
  assert.deepEqual(result.teleport, { range: 60, from: { x: 300, y: 300 }, to: { x: 750, y: 300 } });
  assert.equal(meta("mira").hp, 35);
  assert.deepEqual(active("mira"), ["Prono"]);
  await sleep(1700); // the spells' fade: hidden, moved at 1.5 s, shown again
  assert.deepEqual(position("auril"), { x: 750, y: 300 });
  const entries = await monsterEntries();
  assert.equal(entries.length, 1);
  const teleport = (entries[0].effectsMutation?.sideEffects || []).find((change) => change?.type === "token:teleport");
  assert.deepEqual([teleport?.id, teleport?.beforePosition, teleport?.afterPosition], ["auril", { x: 300, y: 300 }, { x: 750, y: 300 }],
    "the teleport is recorded with the command");
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone).slice(0, 1500));
  assert.equal(meta("mira").hp, 45);
  assert.deepEqual(active("mira"), []);
  await sleep(50);
  assert.deepEqual(position("auril"), { x: 300, y: 300 });
  await sleep(1500); // the fade timers end
});

test("without a destination nothing happens", async () => {
  await setup(ps);
  await assert.rejects(resolve(ps, namedS("Il Corpo Non Era Qui"), { targetId: "mira", outcome: "failed", componentAmounts: { force: 10 } }),
    /Scegli sulla mappa dove si teletrasporta il boss/);
  assert.equal(meta("mira").hp, 45);
  assert.equal((await monsterEntries()).length, 0);
});
