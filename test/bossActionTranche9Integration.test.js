// Tranche 9: Divine Brilliance through the production coordinator, History and Undo.
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
    id: "boss-t9-room",
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
  sdk.room.id = `boss-t9-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneItems[0].metadata[META_KEY].hp = bossHp;
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-t9-test");
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
const brilliance = p3.abilities.find((entry) => entry.name === "Divine Brilliance");
const EMANATION = { ruleId: "boss-action-area:emanation:120ft", start: { x: 0, y: 0 }, end: { x: 3600, y: 0 }, areaTargetIds: ["dars", "mira", "sera"] };
const brilliant = (request = {}) => resolve(p3, brilliance, { targetIds: ["dars", "mira", "sera"], outcomes: { dars: "hit", mira: "hit", sera: "miss" },
  targetAmounts: { dars: { cold: 12, necrotic: 9 }, mira: { cold: 4, necrotic: 15 } }, manualConfirmed: true, areaPlacement: EMANATION, ...request });
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");
const undoLast = async () => { const entries = await monsterEntries(); return history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() }); };

test("Divine Brilliance: one command damages each hit creature with its own roll; Undo restores HP and the 1/Phase use", async () => {
  await setup(p3, { dars: defenses({ resistances: ["cold"] }) }, { bossHp: 98 });
  const result = await brilliant();
  assert.deepEqual(result.groupTargets.map((target) => [target.id, target.outcome, target.damage, target.hpAfter]),
    [["dars", "hit", 15, 45], ["mira", "hit", 19, 26], ["sera", "miss", 0, 38]]);
  assert.equal(meta("dars").hp, 45);
  assert.equal(meta("mira").hp, 26);
  assert.equal(meta("sera").hp, 38);
  assert.deepEqual(result.resources, [{ actionId: "divine-brilliance", phaseId: "fase3", period: "phase", limit: 1, beforeUsed: 0, afterUsed: 1 }]);
  const entries = await monsterEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].payload.causality.trigger.bossHp, 98);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[brilliance.id].available, false, "used for this phase");
  await assert.rejects(brilliant({ actionInstanceId: "boss-action:again" }), /esaurit|Risorsa|limite|già usat/i);
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(meta("dars").hp, 60);
  assert.equal(meta("mira").hp, 45);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[brilliance.id].available, true, "Undo restores the use");
});

test("Divine Brilliance needs the trigger on the committed boss, conscious targets and the confirmation", async () => {
  await setup(p3, {}, { bossHp: 150 });
  await assert.rejects(brilliant(), /Innesco non avvenuto: Auril deve essere sotto 105 PF \(ora 150\)/);
  await setup(p3, {}, { bossHp: 98 });
  await assert.rejects(brilliant({ manualConfirmed: false }), /Conferma innesco e Reazione/);
  meta("sera").hp = 0;
  await assert.rejects(brilliant({ actionInstanceId: "boss-action:t9-zero" }), /Sera è a 0 PF: non è cosciente/);
  assert.equal(meta("dars").hp, 60, "nothing was applied");
  assert.equal((await monsterEntries()).length, 0);
});
