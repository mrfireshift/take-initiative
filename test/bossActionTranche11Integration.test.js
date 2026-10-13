// Tranche 11: Hurl and Epic Resistance through the production coordinator, History and Undo.
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
    id: "boss-t11-room",
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
const { bossActionResultSummary: summary } = await import("../src/bossActionsViewCore.js");

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
  sdk.room.id = `boss-t11-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneItems[0].metadata[META_KEY].hp = bossHp;
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-t11-test");
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
const hurl = named2("Hurl");
const resistance = p3.abilities.find((entry) => entry.name === "Epic Resistance");
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");
const undoLast = async () => { const entries = await monsterEntries(); return history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() }); };
const grabbed = { conditions: { version: 2, instances: [
  { id: "grab-1", condition: "Afferrato", active: true, sourceId: "auril", sourceName: "Auril", parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } },
  { id: "hold-1", condition: "Trattenuto", active: true, sourceId: "auril", sourceName: "Auril", parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] } };
const throwIt = (request = {}) => resolve(p2, hurl, { targetId: "dars", distance: 20, damage: 7, landing: "platform", ...request });
const names = (id) => instances(id).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();

test("Hurl on the platform: one command damages, ends the boss's grapple and leaves Prono; Undo restores all", async () => {
  await setup(p2, { dars: grabbed });
  const result = await throwIt();
  assert.equal(meta("dars").hp, 53);
  assert.deepEqual(names("dars"), ["Prono"]);
  assert.equal(result.throw.landing, "platform");
  assert.match(summary(result), /20 ft · Prono · presa terminata/);
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(meta("dars").hp, 60);
  assert.deepEqual(names("dars"), ["Afferrato", "Trattenuto"]);
  await assert.rejects(resolve(p2, hurl, { targetId: "mira", distance: 10, damage: 3, landing: "platform", actionInstanceId: "boss-action:not-held" }), /Afferrato dal boss/);
});

test("Hurl beyond the edge: the pill goes on and the DEX save reminder is sent after the commit", async () => {
  await setup(p2, { dars: grabbed });
  const sent = [];
  runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [], postEdgeSave: async (args) => { sent.push(args); return []; } });
  const result = await throwIt({ landing: "edge", distance: 30, damage: 10 });
  assert.deepEqual(names("dars"), ["Appeso al bordo"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].edge.targetId, "dars");
  assert.deepEqual(sent[0].edge.save, { ability: "dex", dc: 15 });
  assert.match(sent[0].activationId, /:edge$/);
  assert.equal(result.throw.edge.save.dc, 15);
});

test("Epic Resistance ends a spell on the boss (with its conditions) on a pass; Undo restores it", async () => {
  await setup(p3);
  meta("auril")["com.thebigpicture.initiative/spells"] = [{ instanceId: "spell-hold", name: "Blocca mostri", casterId: "mira", casterName: "Mira", conc: false }];
  meta("auril").conditions = { version: 2, instances: [{ id: "para", condition: "Paralizzato", active: true, parentEffectId: "spell-hold", sourceId: "mira",
    sourceName: "Mira", type: "spell", expiry: { mode: "manual" } }] };
  const result = await resolve(p3, resistance, { effect: { kind: "spell", instanceId: "spell-hold" }, roll: 16 });
  assert.equal(result.effectEnd.passed, true);
  assert.deepEqual(meta("auril")["com.thebigpicture.initiative/spells"] || [], []);
  assert.deepEqual(names("auril"), [], "the spell's condition ends with it");
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal((meta("auril")["com.thebigpicture.initiative/spells"] || []).length, 1);
});
