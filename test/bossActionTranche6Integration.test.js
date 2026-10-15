// Tranche 6: Mark of the Frostmaiden, Detonation of the Mark and Frostmaiden's Kiss through the production coordinator, History and Undo.
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
    id: "boss-t6-room",
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
  sdk.room.id = `boss-t6-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60, extra.dars), creature("mira", "Mira", 45, extra.mira), creature("sera", "Sera", 38, extra.sera)];
  sceneItems[0].metadata[META_KEY].hp = bossHp;
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-t6-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [] });
  await runtime.bindBossActionProfile("auril", profile);
}
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });
const setRound = (round) => { sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], round }; };

// A manual registration (Breathe Deep, Gather the Winter Sky) with the bound identity.
async function registerUse(profile, action, id) {
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.registerBossActionUse({ sourceId: "auril", actionId: action.id, manualConfirmed: true, actionInstanceId: id,
    profileId: profile.profileId, profileRevision: profile.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity });
}
async function resolve(profile, action, request) {
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.executeBossAction({ sourceId: "auril", actionId: action.id, profileId: profile.profileId,
    profileRevision: profile.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity, ...request });
}
const mark = (request = {}) => resolve(p2, markAction, { targetIds: ["dars"], outcomes: { dars: "failed" }, componentAmounts: {}, ...request });
const stab = (request = {}) => resolve(p2, icekiss, { targetId: "dars", mode: "melee", outcome: "hit", componentAmounts: { slashing: 18, cold: 7 }, ...request });
const drain = (request = {}) => resolve(p2, kiss, { targetId: "dars", mode: "melee", outcome: "hit", componentAmounts: { necrotic: 18, cold: 7 }, ...request });
const detonate = (request = {}) => resolve(p3, detonation, { targetId: "dars", outcome: "failed", componentAmounts: { cold: 18, radiant: 18 }, ...request });
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");
const undoLast = async () => { const entries = await monsterEntries(); return history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() }); };
const markUses = () => meta("auril").bossActionState?.markUses;

test("Mark of the Frostmaiden: a debuff pill on a failure only, one per creature, a single target", async () => {
  await setup(p2);
  await mark({ outcomes: { dars: "passed" } });
  assert.equal(marks("dars").length, 0);
  setRound(2);
  const result = await mark({ actionInstanceId: "mark-2" });
  const [pill] = marks("dars");
  assert.equal(pill.condition, "Mark of the Frostmaiden");
  assert.equal(pill.effectKind, "debuff");
  assert.equal(pill.sourceId, "auril");
  assert.deepEqual({ ...pill.expiry }, { mode: "manual" });
  assert.deepEqual(result.groupTargets, [{ id: "dars", name: "Dars", outcome: "failed", conditions: ["Mark of the Frostmaiden"] }]);
  setRound(3);
  const again = await mark({ actionInstanceId: "mark-3" });
  assert.equal(marks("dars").length, 1, "an already marked creature keeps one mark");
  assert.deepEqual(again.groupTargets[0].alreadyMarked, true);
  setRound(4);
  await assert.rejects(mark({ actionInstanceId: "mark-4", targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "failed" } }), /Un solo bersaglio/);
});

test("the mark ignores cold resistance on the first cold hit of each round from the boss; the use is undoable", async () => {
  await setup(p2, { dars: { ...defenses({ resistances: ["cold"] }), ...marked } });
  const first = await stab();
  assert.equal(meta("dars").hp, 35, "18 + 7: the resistance is ignored");
  assert.equal(first.markRule, true);
  assert.deepEqual(markUses(), { dars: 1 });
  const [entry] = await monsterEntries();
  assert.deepEqual(entry.payload.causality.mark, { rule: "cold-ward-break", targetIds: ["dars"], round: 1 });
  assert.equal(entry.payload.causality.targets[0].damageComponents[1].mark.profileDefense, "resistance");
  await stab({ actionInstanceId: "stab-2" });
  assert.equal(meta("dars").hp, 14, "second cold hit this round: 18 + 3");
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(meta("dars").hp, 35);
  assert.deepEqual(markUses(), { dars: 1 }, "the first use stays");
  await undoLast();
  assert.equal(meta("dars").hp, 60);
  assert.equal(markUses(), undefined, "undoing the first hit restores the rule");
  setRound(2);
  await stab({ actionInstanceId: "stab-3" });
  assert.equal(meta("dars").hp, 35, "a new round, a new first cold hit");
  assert.deepEqual(markUses(), { dars: 2 }, "only the current round is kept");
});

test("immunity becomes resistance for the marked hit; a miss or a stale preview never spends the rule", async () => {
  await setup(p2, { dars: { ...defenses({ immunities: ["cold"] }), ...marked } });
  await stab({ outcome: "miss" });
  assert.equal(markUses(), undefined);
  await assert.rejects(stab({ actionInstanceId: "stale", expectedMarkedIds: [] }), /marchio di Dars è cambiato/);
  await stab({ actionInstanceId: "hit", expectedMarkedIds: ["dars"] });
  assert.equal(meta("dars").hp, 39, "18 + floor(7 / 2)");
});

test("an area action applies the rule per marked creature (Breath)", async () => {
  await setup(p2, { dars: { ...defenses({ resistances: ["cold"] }), ...marked }, mira: defenses({ resistances: ["cold"] }) });
  // v20: Breathe Deep opens the round; no character is in the order, so the GM confirms the last Epic Action.
  await registerUse(p2, named2("Breathe Deep"), "deep-mark");
  const result = await resolve(p2, breath, { manualConfirmed: true, sequenceConfirmed: true, targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "failed" },
    componentAmounts: { cold: 33, necrotic: 13 }, areaPlacement: { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, areaTargetIds: ["dars", "mira"] } });
  assert.equal(meta("dars").hp, 14, "33 + 13: marked");
  assert.equal(meta("mira").hp, 16, "16 + 13: resisted");
  assert.deepEqual(result.groupTargets.map((target) => [target.id, !!target.markRule]), [["dars", true], ["mira", false]]);
});

test("Detonation of the Mark: only on a marked creature, the mark rule on its cold, Trattenuto until its next turn, mark removed", async () => {
  await setup(p3, { dars: { ...defenses({ resistances: ["cold"] }), ...marked } });
  await assert.rejects(detonate({ targetId: "mira" }), /deve essere marchiato dal boss/);
  assert.equal(meta("mira").hp, 45);
  const result = await detonate();
  assert.equal(meta("dars").hp, 24, "18 cold (mark) + 18 radiant");
  assert.equal(marks("dars").length, 0, "the mark ends");
  const [held] = named("dars", "Trattenuto");
  assert.deepEqual({ ...held.expiry }, { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn", actorId: "dars" });
  assert.equal(result.markConsumed, true);
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(marks("dars").length, 1, "Undo restores the mark");
  assert.equal(named("dars", "Trattenuto").length, 0);
  setRound(2);
  await detonate({ actionInstanceId: "det-pass", outcome: "passed" });
  assert.equal(meta("dars").hp, 42, "9 + 9 on a success");
  assert.equal(marks("dars").length, 0, "the mark ends on a success too");
  assert.equal(named("dars", "Trattenuto").length, 0);
});

test("Frostmaiden's Kiss: the boss regains the necrotic damage taken; maximum HP is a manual step", async () => {
  await setup(p2, {}, { bossHp: 500 });
  const result = await drain();
  assert.equal(meta("dars").hp, 35);
  assert.equal(meta("dars").hpMax, 60, "the canonical maximum HP is never lowered automatically");
  assert.equal(meta("auril").hp, 518);
  assert.deepEqual(result.drain.maxHpReduction, { targetId: "dars", amount: 18, manual: true });
  assert.equal(result.drain.healed, 18);
  const [entry] = await monsterEntries();
  assert.match(entry.payload.manualRemainder, /Riduci a mano il massimo dei Punti Ferita/);
  await undoLast();
  assert.equal(meta("auril").hp, 500);
  assert.equal(meta("dars").hp, 60);
});

test("Frostmaiden's Kiss heals by the necrotic damage after defenses and never above the boss maximum", async () => {
  await setup(p2, { dars: defenses({ resistances: ["necrotic"] }) }, { bossHp: 575 });
  const result = await drain();
  assert.equal(meta("dars").hp, 44, "9 necrotic + 7 cold");
  assert.equal(meta("auril").hp, 580, "+9 capped at 580");
  assert.equal(result.drain.healed, 5);
  assert.equal(result.drain.maxHpReduction.amount, 9);
});

test("Breathe Deep: the manual 1/Round use recharges every round; an old 1/Phase revision never does", async () => {
  const breatheDeep = named2("Breathe Deep");
  const register = async (profile, action, id) => {
    const presentation = await runtime.getBossActionPresentation("auril");
    return runtime.registerBossActionUse({ sourceId: "auril", actionId: action.id, manualConfirmed: true, actionInstanceId: id,
      profileId: profile.profileId, profileRevision: profile.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity });
  };
  const remaining = async (action) => (await runtime.getBossActionPresentation("auril")).availability[action.id];
  await setup(p2);
  await register(p2, breatheDeep, "deep-1");
  assert.equal((await remaining(breatheDeep)).available, false);
  await assert.rejects(register(p2, breatheDeep, "deep-1b"), /esaurit/i);
  setRound(2);
  assert.deepEqual(await remaining(breatheDeep), { tracked: true, available: true, remaining: 1, used: 0, period: "round", limit: 1, round: 2 });
  await register(p2, breatheDeep, "deep-2");
  // The original stat block said (1/Phase): a token still bound to such a revision stays spent for the whole phase.
  // (Round 3: Breathe Deep already opened round 2.)
  setRound(3);
  const original = await importBossActionHTML((await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"))
    .replace("Breathe Deep (1/Round).", "Breathe Deep (1/Phase)."));
  store.put(original);
  await runtime.bindBossActionProfile("auril", original);
  const oldDeep = original.abilities.find((entry) => entry.name === "Breathe Deep");
  assert.deepEqual(oldDeep.usage, { limit: 1, period: "phase" });
  await register(original, oldDeep, "old-1");
  setRound(4);
  assert.equal((await remaining(oldDeep)).available, false, "1/Phase: spent until the phase ends");
});

test("a new combat back at round 1 meets leftover counters: they are flagged, and one undoable reset clears rounds, phase and mark uses", async () => {
  const breatheDeep = named2("Breathe Deep");
  const gather = named2("Gather the Winter Sky");
  const register = async (action, id) => {
    const presentation = await runtime.getBossActionPresentation("auril");
    return runtime.registerBossActionUse({ sourceId: "auril", actionId: action.id, manualConfirmed: true, actionInstanceId: id,
      profileId: p2.profileId, profileRevision: p2.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity });
  };
  await setup(p2, { dars: { ...defenses({ resistances: ["cold"] }), ...marked } });
  setRound(2);
  await register(breatheDeep, "deep-r2");
  // v20: both open a round (the first Epic Action): Gather in the next one.
  setRound(3);
  await register(gather, "gather-r3");
  setRound(2);
  await stab();
  // The GM starts a new combat (or presses ↺): round 1, then round 2 again.
  setRound(1);
  let presentation = await runtime.getBossActionPresentation("auril");
  assert.deepEqual(presentation.usageSummary, { valid: true, rounds: [2], futureRounds: [2], phaseUses: 1, markUses: 1, total: 3 });
  assert.equal(meta("auril").bossActionState.epicLog.round, 2, "the round log of the earlier combat (Icekiss in round 2)");
  setRound(2);
  presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.availability[breatheDeep.id].available, false, "the leftover round-2 use makes it look spent");
  assert.equal(presentation.availability[gather.id].available, false, "1/Phase never recharges by itself");
  const result = await runtime.resetBossActionResources({ sourceId: "auril", profileId: p2.profileId, profileRevision: p2.profileRevision,
    bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity });
  assert.deepEqual({ rounds: result.rounds, phaseUses: result.phaseUses, markUses: result.markUses }, { rounds: [2], phaseUses: 1, markUses: 1 });
  assert.equal(result.undoAvailable, true);
  presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.availability[breatheDeep.id].available, true);
  assert.equal(presentation.availability[gather.id].available, true);
  assert.equal(presentation.usageSummary.total, 0);
  assert.equal(meta("auril").bossActionState.markUses, undefined);
  const [entry] = (await monsterEntries()).filter((row) => /risorse azzerate/.test(row.label || ""));
  assert.ok(entry, "one History entry");
  assert.equal(entry.payload.causality.cause.actionId, "resource-reset");
  await undoLast();
  presentation = await runtime.getBossActionPresentation("auril");
  assert.equal(presentation.availability[gather.id].available, false, "Undo restores the counters");
  await assert.rejects(runtime.resetBossActionResources({ sourceId: "auril", profileId: "other", profileRevision: p2.profileRevision }), /Profilo o binding cambiato/);
});

test("Epic Resistance (v16) has no counter: a failed and a passed roll both reach History; a passive trait cannot be registered", async () => {
  const epicResistance = named2("Epic Resistance");
  const trait = named2("Doppia Manifestazione");
  await setup(p2);
  meta("auril").conditions = { version: 2, instances: [{ id: "blind-1", condition: "Accecato", active: true, sourceId: "dars", sourceName: "Dars",
    parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] };
  const resist = (roll, id) => resolve(p2, epicResistance, { effect: { kind: "condition", instanceId: "blind-1" }, roll, actionInstanceId: id });
  assert.deepEqual(epicResistance.usage, {});
  const failed = await resist(7, "er-1");
  assert.deepEqual(failed.effectEnd, { name: "Accecato", roll: 7, threshold: 11, passed: false });
  assert.equal(instances("auril").length, 1, "a failed roll ends nothing");
  const passed = await resist(14, "er-2");
  assert.equal(passed.effectEnd.passed, true);
  assert.equal(instances("auril").filter((entry) => entry.active !== false).length, 0, "a passed roll ends the effect");
  const entries = (await monsterEntries()).filter((entry) => /Epic Resistance/.test(entry.label || ""));
  assert.deepEqual(entries.map((entry) => entry.payload.causality.effectEnd.outcome), ["failed", "passed"], "both attempts are logged");
  assert.equal((await runtime.getBossActionPresentation("auril")).usageSummary.total, 0, "nothing is counted");
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(instances("auril").filter((entry) => entry.active !== false).length, 1, "Undo restores the effect");
  const register = async (action, id) => {
    const presentation = await runtime.getBossActionPresentation("auril");
    return runtime.registerBossActionUse({ sourceId: "auril", actionId: action.id, manualConfirmed: true, actionInstanceId: id,
      profileId: p2.profileId, profileRevision: p2.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity });
  };
  await assert.rejects(register(trait, "trait-1"), /tratto passivo/);
  await assert.rejects(register(epicResistance, "er-manual"), /Conferma l’uso manuale/, "an automated ability is not registered by hand");
});

test("Meteor Swarm: one command for the union of four explosions, inner bludgeoning, Evasion, 1/Phase spent and undoable", async () => {
  const meteorSwarm = named2("Meteor Swarm");
  const rogue = { initiativeCard: { characterBuild: [{ classId: "ladro", level: 7 }] } };
  await setup(p2, { mira: rogue });
  const circle = (x, areaTargetIds, innerTargetIds) => ({ ruleId: "boss-action-area:circle:40ft", start: { x, y: 0 }, end: { x: x + 600, y: 0 }, areaTargetIds, innerTargetIds });
  const request = { manualConfirmed: true, targetIds: ["dars", "mira", "sera"], outcomes: { dars: "failed", mira: "passed", sera: "failed" },
    componentAmounts: { cold: 49, bludgeoning: 33 }, innerIds: ["dars"], expectedEvasionIds: ["mira"],
    areaPlacements: [circle(0, ["dars", "mira"], ["dars"]), circle(1000, ["mira"], []), circle(2000, ["sera"], []), circle(3000, [], [])] };
  // v20: Gather the Winter Sky opens the round; no character is in the order, so the GM confirms the last Epic Action.
  await registerUse(p2, named2("Gather the Winter Sky"), "gather-meteor");
  const result = await resolve(p2, meteorSwarm, { ...request, sequenceConfirmed: true });
  assert.equal(meta("dars").hp, 0, "49 + 33 on a failure, within 10 ft");
  assert.equal(meta("mira").hp, 45, "Evasion: a success takes nothing");
  assert.equal(meta("sera").hp, 0, "49 cold only (38 HP)");
  assert.deepEqual(result.groupTargets.map((target) => [target.id, target.damage, !!target.inner, !!target.evasion]),
    [["dars", 82, true, false], ["mira", 0, false, true], ["sera", 49, false, false]]);
  assert.equal((await monsterEntries()).length, 2, "Gather and Meteor Swarm");
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[meteorSwarm.id].available, false, "1/Phase");
  setRound(5);
  await assert.rejects(resolve(p2, meteorSwarm, { ...request, actionInstanceId: "meteor-again" }), /esaurit/i);
  setRound(1);
  const undone = await undoLast();
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.deepEqual(["dars", "mira", "sera"].map((id) => meta(id).hp), [60, 45, 38]);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[meteorSwarm.id].available, true);
});
