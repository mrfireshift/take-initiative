// Shothragoth S3: the Epic Action sequence, Cucitura del Non-Luogo and Strappare la Cucitura; production coordinator, History and Undo.
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
    id: "boss-s3-room",
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
  sdk.room.id = `boss-s3-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3); store.put(ps);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneItems[0].metadata[META_KEY].hp = bossHp;
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-s3-test");
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

const PC = { attitude: "pc" };
const SEAM_KEY = "com.thebigpicture.initiative/bossSeam";
const seamDrawing = (id, sourceId = "auril") => [
  { id, type: "PATH", layer: "DRAWING", metadata: { [SEAM_KEY]: { sourceId, actionInstanceId: "boss-action:cucitura" } } },
  { id: `${id}-geometry`, type: "PATH", layer: "DRAWING", attachedTo: id, metadata: { [SEAM_KEY]: { sourceId, actionInstanceId: "boss-action:cucitura" } } },
];
const SEAM = { start: { x: 0, y: 0 }, end: { x: 450, y: 0 }, lengthFeet: 45, itemIds: ["boss-seam-a", "boss-seam-a-geometry"] };
const tear = (overrides = {}) => resolve(ps, namedS("Strappare la Cucitura"), { targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "passed" },
  componentAmounts: { force: 18, psychic: 18 }, areaPlacement: { ruleId: "boss-action-area:seam:20ft", start: SEAM.start, end: SEAM.end, areaTargetIds: ["dars", "mira"] }, ...overrides });
const setCurrent = (current) => { sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], current }; };

test("the console reads the slot of the round and the blocks of the sequence; Cucitura is only the first Epic Action", async () => {
  await setup(ps, { dars: PC, mira: PC, sera: PC });
  let presentation = await runtime.getBossActionPresentation("auril");
  assert.deepEqual(presentation.sequence.slot, { total: 3, index: 1, last: false, after: "Dars", remaining: ["Mira", "Sera"] });
  assert.deepEqual(presentation.sequence.log, []);
  assert.equal(presentation.availability[namedS("Cucitura del Non-Luogo").id].available, true);
  assert.match(presentation.availability[namedS("Strappare la Cucitura").id].reason, /richiede Cucitura del Non-Luogo/);
  assert.match(presentation.sequence.warnings[namedS("Strappare la Cucitura").id], /devono ancora agire Mira, Sera/);
  await resolve(ps, namedS("Fauce Impossibile"), { targetId: "dars", mode: "melee", outcome: "hit", componentAmounts: { force: 23 } });
  presentation = await runtime.getBossActionPresentation("auril");
  assert.deepEqual(presentation.sequence.log, [namedS("Fauce Impossibile").id]);
  const blocked = presentation.availability[namedS("Cucitura del Non-Luogo").id];
  assert.deepEqual([blocked.available, blocked.sequenceBlocked], [false, true]);
  assert.match(blocked.reason, /prima Azione Epica del round: nel round 1 Auril ha già usato Fauce Impossibile/);
  await assert.rejects(resolve(ps, namedS("Cucitura del Non-Luogo"), { seam: SEAM }), /prima Azione Epica del round/);
  assert.equal((await undoLast()).status, "applied");
  presentation = await runtime.getBossActionPresentation("auril");
  assert.deepEqual(presentation.sequence.log, [], "Undo takes the use out of the round log");
  assert.equal(presentation.availability[namedS("Cucitura del Non-Luogo").id].available, true);
});

test("Cucitura blocks Il Corpo Non Era Qui; Strappare in the last slot hits the line, tears the seam and removes its drawing; Undo restores", async () => {
  await setup(ps, { dars: PC, mira: PC, sera: PC });
  sceneItems.push(...seamDrawing("boss-seam-a"));
  const seamResult = await resolve(ps, namedS("Cucitura del Non-Luogo"), { seam: SEAM });
  assert.deepEqual(seamResult.seam, { lengthFeet: 45 });
  let presentation = await runtime.getBossActionPresentation("auril");
  assert.deepEqual([presentation.sequence.seam.lengthFeet, presentation.sequence.seam.itemIds], [45, SEAM.itemIds]);
  assert.deepEqual(presentation.sequence.staleSeamItemIds, []);
  assert.match(presentation.availability[namedS("Il Corpo Non Era Qui").id].reason, /Finché la cucitura esiste, Auril non può usare Il Corpo Non Era Qui/);
  await assert.rejects(resolve(ps, namedS("Il Corpo Non Era Qui"), { targetId: "mira", outcome: "failed", componentAmounts: { force: 10 }, teleport: { x: 300, y: 0 } }), /Finché la cucitura esiste/);
  assert.equal(presentation.availability[namedS("Strappare la Cucitura").id].available, true);
  // Mira and Sera still act this round: the GM confirms, or the tear waits.
  await assert.rejects(tear(), /Conferma che è l’ultima Azione Epica del round/);
  await assert.rejects(tear({ areaPlacement: { ruleId: "boss-action-area:seam:20ft", start: { x: 150, y: 0 }, end: SEAM.end, areaTargetIds: ["dars"] },
    sequenceConfirmed: true, actionInstanceId: "boss-action:off-seam" }), /non segue la cucitura/);
  setCurrent(5);
  const torn = await tear();
  assert.equal(torn.seamTorn, true);
  assert.deepEqual([meta("dars").hp, meta("mira").hp], [24, 27]);
  assert.deepEqual(active("dars"), ["Prono"]);
  assert.deepEqual(active("mira"), []);
  assert.equal(sceneItems.some((item) => item.id.startsWith("boss-seam-a")), false, "the seam drawing goes with the tear");
  presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.sequence.seam, null);
  assert.equal(presentation.availability[namedS("Il Corpo Non Era Qui").id].available, true);
  assert.match(presentation.availability[namedS("Strappare la Cucitura").id].reason, /non c’è più/);
  assert.equal((await undoLast()).status, "applied");
  assert.deepEqual([meta("dars").hp, meta("mira").hp], [60, 45]);
  presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.sequence.seam.lengthFeet, 45, "Undo brings the seam back (its drawing stays removed)");
});

test("a seam not torn collapses at the end of the round; its drawing is offered for removal, other bosses' drawings are never touched", async () => {
  await setup(ps, { dars: PC, mira: PC, sera: PC });
  sceneItems.push(...seamDrawing("boss-seam-a"), ...seamDrawing("boss-seam-other", "someone-else"));
  await resolve(ps, namedS("Cucitura del Non-Luogo"), { seam: SEAM });
  setRound(2);
  const presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.sequence.seam, null);
  assert.deepEqual(presentation.sequence.log, [], "round 2 starts empty");
  assert.deepEqual(presentation.sequence.staleSeamItemIds, ["boss-seam-a", "boss-seam-a-geometry"]);
  assert.equal(presentation.availability[namedS("Il Corpo Non Era Qui").id].available, true);
  assert.equal(presentation.availability[namedS("Cucitura del Non-Luogo").id].available, true);
  const removed = await runtime.removeStaleBossSeams({ sourceId: "auril", profileId: ps.profileId, profileRevision: ps.profileRevision, bossInstanceId: presentation.bossInstanceId });
  assert.deepEqual(removed.removed, ["boss-seam-a", "boss-seam-a-geometry"]);
  assert.deepEqual(sceneItems.filter((item) => item.id.startsWith("boss-seam")).map((item) => item.id), ["boss-seam-other", "boss-seam-other-geometry"]);
});

test("Auril's phase 3 has no sequence: no round log and no slot", async () => {
  await setup(p3, { dars: PC, mira: PC, sera: PC });
  const presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.sequence, undefined);
  const polar = p3.abilities.find((entry) => entry.name === "Polar Ray");
  await resolve(p3, polar, { targetId: "dars", mode: "ranged", outcome: "hit", componentAmounts: { cold: 5, necrotic: 5 } });
  assert.equal(meta("auril").bossActionState.epicLog, undefined);
});
