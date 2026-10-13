// Tranche 5: Titan's Grasp, Crush and Soul-Numbing Cold through the production coordinator, History and Undo.
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
    id: "boss-t5-room",
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
const { getConditionWidgetLayoutParts } = await import("../src/conditions.js");
const { initiativeTurnKeyAtOrdinal } = await import("../src/turnBoundaryCore.js");
const { isEpicActionId, isLairId, splitParagonId } = await import("../src/initiativeSelectionProjectionCore.js");
const { readFile } = await import("node:fs/promises");

const p2 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const p3 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const grasp = p2.abilities.find((entry) => entry.name === "Titan's Grasp");
const crush = p2.abilities.find((entry) => entry.name === "Crush");
const numbing = p3.abilities.find((entry) => entry.name === "Soul-Numbing Cold");
const memory = new Map();
const store = createBossActionProfileStore({ storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } });
let runtime;
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const instances = (id) => meta(id).conditions?.instances || [];
const named = (id, name) => instances(id).filter((entry) => entry.condition === name);
const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const grabbedBy = (sourceId) => ({ conditions: { version: 2, instances: [{ id: `held-by-${sourceId}`, condition: "Afferrato", active: true, sourceId, expiry: { mode: "manual" } }] } });
const ORDER = ["auril", "dars", "__EPIC__:auril:1", "mira", "__EPIC__:auril:2", "sera", "__EPIC__:auril:3"];

async function setup(profile, extra = {}) {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `boss-t5-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-t5-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [] });
  await runtime.bindBossActionProfile("auril", profile);
}
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

async function resolve(profile, action, request) {
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.executeBossAction({ sourceId: "auril", actionId: action.id, profileId: profile.profileId,
    profileRevision: profile.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity, ...request });
}
const grab = (request = {}) => resolve(p2, grasp, { targetId: "dars", outcome: "failed", componentAmounts: { bludgeoning: 33, cold: 10 }, ...request });
const squeeze = (request = {}) => resolve(p2, crush, { targetId: "dars", outcome: "failed", componentAmounts: { bludgeoning: 33, cold: 10 }, ...request });
const numb = (request = {}) => resolve(p3, numbing, { targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "passed" }, componentAmounts: {}, ...request });
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");
const undoLast = async () => { const entries = await monsterEntries(); return history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() }); };

// Mirrors initiativeList's forward boundary derivation: Lair/Epic slots end no creature's turn.
function boundariesBetween(order, from, to) {
  const actor = (id) => (!id || isLairId(id) || isEpicActionId(id) ? null : splitParagonId(id).baseId || null);
  const boundaries = [];
  const start = ((from.round - 1) * order.length) + from.current;
  const end = ((to.round - 1) * order.length) + to.current;
  for (let ordinal = start; ordinal < end; ordinal += 1) {
    const ending = actor(order[ordinal % order.length]);
    const starting = actor(order[(ordinal + 1) % order.length]);
    if (ending) boundaries.push({ phase: "end", actorId: ending, turnKey: initiativeTurnKeyAtOrdinal(order, ordinal) });
    if (starting) boundaries.push({ phase: "start", actorId: starting, turnKey: initiativeTurnKeyAtOrdinal(order, ordinal + 1) });
  }
  return boundaries;
}
async function advance(from, to) {
  sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], round: to.round, current: to.current };
  await effects.advanceTurnBoundaryEffects(["dars", "mira", "sera"], boundariesBetween(ORDER, from, to));
}

test("Titan's Grasp failed: typed damage plus standard Afferrato and Trattenuto from Auril, one Undo removes everything", async () => {
  await setup(p2);
  const result = await grab();
  assert.equal(meta("dars").hp, 17, "33 + 10");
  for (const name of ["Afferrato", "Trattenuto"]) {
    const [condition] = named("dars", name);
    assert.equal(condition.sourceId, "auril", name);
    assert.deepEqual({ ...condition.expiry }, { mode: "manual" }, name);
    assert.equal(Object.hasOwn(condition, "effectKind"), false, name);
  }
  assert.deepEqual(getConditionWidgetLayoutParts(meta("dars").conditions).map((part) => [part.name, part.kind]), [["Afferrato", "condition"], ["Trattenuto", "condition"]]);
  assert.deepEqual(result.conditions, ["Afferrato", "Trattenuto"]);
  const [entry] = await monsterEntries();
  assert.equal(entry.payload.causality.conditionsApplied.find((row) => row.condition === "Afferrato").escapeDC, 18);
  assert.deepEqual(entry.payload.causality.grapple, { rule: "grab", heldBefore: [] });
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[grasp.id].remaining, 0, "1/Round spent");
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(meta("dars").hp, 60);
  assert.equal(instances("dars").length, 0);
});

test("Titan's Grasp passed: no damage and no grapple, but the 1/Round use is spent", async () => {
  await setup(p2);
  const result = await grab({ outcome: "passed" });
  assert.equal(meta("dars").hp, 60);
  assert.equal(instances("dars").length, 0);
  assert.equal(result.hpChange, null);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[grasp.id].remaining, 0);
});

test("the Titan holds one creature at a time; a grapple from another source does not count", async () => {
  await setup(p2, { mira: grabbedBy("auril") });
  await assert.rejects(grab(), /tiene già una creatura Afferrata/);
  assert.equal(meta("dars").hp, 60, "nothing applied");
  assert.equal((await monsterEntries()).length, 0);
  await setup(p2, { mira: grabbedBy("someone-else") });
  await grab();
  assert.equal(named("dars", "Afferrato").length, 1);
});

test("Crush is refused until Titan's Grasp holds the creature, then works on it", async () => {
  await setup(p2);
  await assert.rejects(squeeze(), /deve essere Afferrato dal boss/);
  assert.equal(meta("dars").hp, 60, "nothing applied");
  await grab();
  await squeeze({ outcome: "passed", actionInstanceId: "crush-after-grab" });
  assert.equal(meta("dars").hp, 0, "17 − (16 + 5), clamped at 0");
});

test("Crush on the held creature: CON 19, half on a success, conditions unchanged, repeatable in the same round", async () => {
  await setup(p2, { dars: grabbedBy("auril") });
  await assert.rejects(squeeze({ targetId: "mira" }), /deve essere Afferrato dal boss/);
  await squeeze({ outcome: "passed" });
  assert.equal(meta("dars").hp, 39, "floor(33 / 2) + floor(10 / 2)");
  await squeeze({ actionInstanceId: "crush-2" });
  assert.equal(meta("dars").hp, 0);
  assert.equal(named("dars", "Afferrato").length, 1, "the grapple stays");
  assert.equal(named("dars", "Trattenuto").length, 0, "Crush adds no condition");
  const entries = await monsterEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].payload.causality.save.dc, 19);
  assert.deepEqual(entries[0].payload.causality.grapple, { rule: "hold", heldBefore: ["dars"] });
});

test("Soul-Numbing Cold: a debuff pill on failures only, no HP change, at most three targets", async () => {
  await setup(p3);
  const result = await numb();
  assert.equal(meta("dars").hp, 60);
  const [pill] = named("dars", "Soul-Numbing Cold");
  assert.equal(pill.effectKind, "debuff");
  assert.equal(pill.effectId, "monster-action:soul-numbing-cold");
  assert.deepEqual(pill.summaryParts.map((part) => part.label), ["Velocità −10 ft", "0 PF dalle cure", "No PF temporanei"]);
  assert.deepEqual({ ...pill.expiry }, { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn", actorId: "dars" });
  assert.equal(pill.appliedAt.turnKey, "1:2:__EPIC__:auril:1");
  assert.equal(named("mira", "Soul-Numbing Cold").length, 0);
  assert.deepEqual(result.groupTargets, [{ id: "dars", name: "Dars", outcome: "failed", conditions: ["Soul-Numbing Cold"] }, { id: "mira", name: "Mira", outcome: "passed", conditions: [] }]);
  sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], round: 2 };
  sceneItems.push(creature("goblin", "Goblin", 7));
  await assert.rejects(numb({ actionInstanceId: "too-many", targetIds: ["dars", "mira", "sera", "goblin"],
    outcomes: { dars: "failed", mira: "failed", sera: "failed", goblin: "failed" } }), /Al massimo 3 bersagli/);
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(instances("dars").length, 0);
});

test("Soul-Numbing Cold lasts until the end of the target's next turn, not the Epic slot", async () => {
  await setup(p3);
  await numb();
  // Applied in the Epic slot after Dars (round 1): Mira's and Sera's turns do not end it.
  await advance({ round: 1, current: 2 }, { round: 1, current: 6 });
  assert.equal(named("dars", "Soul-Numbing Cold").length, 1);
  // Dars's next turn (round 2) ends it.
  await advance({ round: 1, current: 6 }, { round: 2, current: 2 });
  assert.equal(named("dars", "Soul-Numbing Cold").length, 0);
});
