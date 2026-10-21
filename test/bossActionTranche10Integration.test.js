// Tranche 10: binding a profile turns its trait auras into custom auras on the token; unbinding removes them.
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
    id: "boss-t10-room",
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
  sdk.room.id = `boss-t10-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneItems[0].metadata[META_KEY].hp = bossHp;
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-t10-test");
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
const auras = (id = "auril") => meta(id).customAuras || [];
const restore = async (profile) => {
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.restoreBossAuras({ sourceId: "auril", profileId: profile.profileId, profileRevision: profile.profileRevision,
    bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity });
};

test("binding phase 3 writes its three auras next to the token's own, merging the metadata", async () => {
  await setup(p2);
  // setup() bound phase 2: Aura Gelida from the Proiezione Fatata is already on the token.
  assert.deepEqual(auras().map((aura) => aura.id), ["boss-aura:auril:fase2:aura-gelida"]);
  meta("auril").customAuras = [...auras(), { id: "mine", enabled: true, name: "Mia aura", radiusMeters: 6 }];
  const hp = meta("auril").hp;
  const presentation = await runtime.bindBossActionProfile("auril", p3);
  assert.deepEqual(presentation.auraChange, { added: ["Primal Blizzard", "Primal Blizzard · Vento", "Aura Gelida"], updated: [], removed: ["Aura Gelida"] });
  assert.deepEqual(auras().map((aura) => aura.id), ["mine", "boss-aura:auril:fase3:primal-blizzard", "boss-aura:auril:fase3:primal-blizzard-wind", "boss-aura:auril:fase3:aura-gelida"]);
  assert.equal(meta("auril").hp, hp, "HP and the rest of the token metadata untouched");
  assert.ok(meta("auril").initiativeCard?.bossActionBinding, "the binding is there too");
  assert.deepEqual(presentation.auras.map((aura) => [aura.name, aura.present, aura.enabled]),
    [["Primal Blizzard", true, true], ["Primal Blizzard · Vento", true, true], ["Aura Gelida", true, true]]);
});

test("a rebind keeps the GM's edits; Ripristina aure rewrites them from the profile; unbinding removes only the boss auras", async () => {
  await setup(p3);
  meta("auril").customAuras = [...auras().map((aura) => aura.name === "Primal Blizzard · Vento" ? { ...aura, radiusMeters: 12 } : aura),
    { id: "mine", enabled: true, name: "Mia aura", radiusMeters: 6 }];
  const again = await runtime.bindBossActionProfile("auril", p3);
  assert.deepEqual(again.auraChange, { added: [], updated: [], removed: [] });
  assert.equal(auras().find((aura) => aura.name === "Primal Blizzard · Vento").radiusMeters, 12);
  const restored = await restore(p3);
  assert.equal(restored.changed, true);
  assert.deepEqual(restored.restored, ["Primal Blizzard", "Primal Blizzard · Vento", "Aura Gelida"]);
  assert.equal(auras().find((aura) => aura.name === "Primal Blizzard · Vento").radiusMeters, 9);
  assert.equal((await restore(p3)).changed, false, "nothing to rewrite the second time");
  const unbound = await runtime.unbindBossActionProfile("auril");
  assert.deepEqual(unbound.auraChange.removed, ["Primal Blizzard", "Primal Blizzard · Vento", "Aura Gelida"]);
  assert.deepEqual(auras().map((aura) => aura.id), ["mine"]);
  assert.equal(meta("dars").customAuras, undefined, "other tokens are never written");
});

test("a token linked before the Aura Gelida pill gets it on the next binding, keeping the GM's radius", async () => {
  await setup(p3);
  meta("auril").customAuras = auras().map((aura) => aura.name === "Aura Gelida" ? { ...aura, pills: [], radiusMeters: 4.5 } : aura);
  const bound = await runtime.bindBossActionProfile("auril", p3);
  assert.deepEqual(bound.auraChange, { added: [], updated: ["Aura Gelida"], removed: [] });
  const cold = auras().find((aura) => aura.name === "Aura Gelida");
  assert.deepEqual(cold.pills.map((pill) => [pill.label, pill.kind, pill.enabled]), [["Aura Gelida", "debuff", true]]);
  assert.equal(cold.radiusMeters, 4.5);
});

test("Rimebound Link (v26): binding phase 2 records the link on the boss token, phase 3 and unbinding remove it; a rebind keeps the broken round", async () => {
  await setup(p2);
  const record = { enabled: true, name: "Rimebound Link", holder: "Titano", breaker: "Proiezione Fatata" };
  assert.deepEqual(meta("auril").bossLinkResistance, record);
  const presentation = await runtime.getBossActionPresentation("auril");
  assert.deepEqual(presentation.linkResistance, { name: "Rimebound Link", holder: "Titano", breaker: "Proiezione Fatata", brokenRound: null, active: true, round: 1 });
  meta("auril").bossLinkResistance = { ...record, brokenRound: 1 };
  await runtime.bindBossActionProfile("auril", p2);
  assert.deepEqual(meta("auril").bossLinkResistance, { ...record, brokenRound: 1 }, "the same trait keeps the round it was broken in");
  assert.equal((await runtime.getBossActionPresentation("auril")).linkResistance.active, false);
  await runtime.bindBossActionProfile("auril", p3);
  assert.equal(meta("auril").bossLinkResistance, undefined, "phase 3 has no link");
  assert.equal((await runtime.getBossActionPresentation("auril")).linkResistance, undefined);
  await runtime.bindBossActionProfile("auril", p2);
  await runtime.unbindBossActionProfile("auril");
  assert.equal(meta("auril").bossLinkResistance, undefined);
  assert.ok(meta("auril").hp > 0, "the rest of the token metadata stays");
});
