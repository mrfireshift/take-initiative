// Tranche 4: Hand Slam and Blinding Gleam through the production coordinator, History, Undo and reminder resolution.
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
    id: "boss-t4-room",
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
const { buildEffectSaveReminderResolution, buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { readFile } = await import("node:fs/promises");

const p2 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const p3 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const handSlam = p2.abilities.find((entry) => entry.name === "Hand Slam");
const gleam = p3.abilities.find((entry) => entry.name === "Blinding Gleam");
const memory = new Map();
const store = createBossActionProfileStore({ storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } });
let runtime;
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const instances = (id) => meta(id).conditions?.instances || [];
const named = (id, name) => instances(id).filter((entry) => entry.condition === name);
const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const ORDER = ["auril", "dars", "__EPIC__:auril:1", "mira", "__EPIC__:auril:2", "sera", "__EPIC__:auril:3"];
const IMMUNE = "Immune · Blinding Gleam";

async function setup(profile) {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `boss-t4-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [creature("auril", "Auril", 580, { epic: true }), creature("dars", "Dars", 60), creature("mira", "Mira", 45), creature("sera", "Sera", 38)];
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 2 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-t4-test");
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
const slam = (request = {}) => resolve(p2, handSlam, { targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "passed" },
  componentAmounts: { bludgeoning: 27, cold: 7 }, areaPlacement: { ruleId: "boss-action-area:circle:20ft", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, areaTargetIds: ["dars", "mira"] }, ...request });
const shine = (request = {}) => resolve(p3, gleam, { targetIds: ["dars", "mira"], outcomes: { dars: "failed", mira: "passed" },
  componentAmounts: { radiant: 27 }, areaPlacement: { ruleId: "boss-action-area:emanation:30ft", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, areaTargetIds: ["dars", "mira", "sera"] },
  expectedImmuneIds: [], ...request });
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");

test("Hand Slam: no confirmation step, typed damage, a standard Prono on failure until removed, 1/Round spent", async () => {
  await setup(p2);
  const result = await slam();
  assert.equal(meta("dars").hp, 26, "27 + 7");
  assert.equal(meta("mira").hp, 29, "13 + 3: half per component");
  const [prono] = named("dars", "Prono");
  assert.equal(prono.sourceId, "auril");
  assert.deepEqual({ ...prono.expiry }, { mode: "manual" });
  assert.equal(Object.hasOwn(prono, "effectKind"), false);
  assert.deepEqual(getConditionWidgetLayoutParts(meta("dars").conditions).map((part) => [part.name, part.kind]), [["Prono", "condition"]]);
  assert.equal(named("mira", "Prono").length, 0);
  assert.equal((await monsterEntries()).length, 1);
  assert.equal(result.undoAvailable, true);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[handSlam.id].remaining, 0);
  const [entry] = await monsterEntries();
  assert.match(entry.payload.causality.manualVerification.steps[0], /cerchio di 20 ft\. disegnato dal GM/);
  assert.match(entry.payload.manualRemainder, /Terreno Difficile/);
  await assert.rejects(slam({ actionInstanceId: "second" }), /esaurit|non disponibile|Risorsa/i, "1/Round");
});

test("Blinding Gleam: Accecato for 1 minute with the repeated CON save on failure, Immune pill on success, one Undo removes both", async () => {
  await setup(p3);
  const result = await shine();
  assert.equal(meta("dars").hp, 33);
  assert.equal(meta("mira").hp, 32, "floor(27 / 2)");
  const [blind] = named("dars", "Accecato");
  assert.deepEqual({ ...blind.expiry }, { mode: "rounds", remaining: 10 });
  assert.equal(blind.saveReminder.ability, "con");
  assert.equal(blind.saveReminder.timing, "turn-end");
  assert.equal(blind.saveReminder.dc, 19);
  assert.equal(blind.saveReminder.actor, "target");
  const [immune] = named("mira", IMMUNE);
  assert.equal(immune.effectId, "monster-action:blinding-gleam:immune");
  assert.equal(immune.effectKind, "buff");
  assert.deepEqual({ ...immune.expiry }, { mode: "manual" });
  assert.deepEqual(getConditionWidgetLayoutParts(meta("dars").conditions).map((part) => [part.name, part.kind]), [["Accecato", "condition"]]);
  assert.deepEqual(getConditionWidgetLayoutParts(meta("mira").conditions).map((part) => [part.name, part.kind]), [[IMMUNE, "spell-effect"]]);
  assert.deepEqual(result.groupTargets.map((target) => [target.id, target.conditions, !!target.immunityApplied]), [["dars", ["Accecato"], false], ["mira", [], true]]);
  const [entry] = await monsterEntries();
  assert.deepEqual(entry.payload.causality.immunity, { condition: "Accecato", duration: "24h", alreadyImmune: [], applied: ["mira"] });
  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  for (const id of ["dars", "mira"]) assert.equal(instances(id).length, 0, id);
  assert.equal(meta("mira").hp, 45);
});

test("an immune creature takes the damage but not Accecato, gets no second pill, and a stale immunity view is refused", async () => {
  await setup(p3);
  await shine();
  sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], round: 2 };
  await assert.rejects(shine({ outcomes: { dars: "failed", mira: "failed" }, expectedImmuneIds: [] }), /immunità di Mira è cambiata/);
  assert.equal(meta("mira").hp, 32, "nothing applied");
  const result = await shine({ outcomes: { dars: "failed", mira: "failed" }, expectedImmuneIds: ["mira"] });
  assert.equal(meta("mira").hp, 5, "full 27 damage");
  assert.equal(named("mira", "Accecato").length, 0);
  assert.equal(named("mira", IMMUNE).length, 1);
  assert.deepEqual(result.groupTargets.find((target) => target.id === "mira"), { id: "mira", name: "Mira", outcome: "failed", damage: 27, hpBefore: 32, hpAfter: 5, conditions: [], immune: true });
});

test("the repeated save reuses the reminder resolution: success removes Accecato and applies the same Immune pill", async () => {
  await setup(p3);
  await shine();
  const [blind] = named("dars", "Accecato");
  const item = sceneItems.find((entry) => entry.id === "dars");
  // The tracker's own planner raises the notice at the end of Dars's next turn.
  const notices = planEffectSaveReminderNotices({ items: clone(sceneItems),
    previousInitiativeState: { round: 2, order: ORDER, current: 1 }, initiativeState: { round: 2, order: ORDER, current: 2 } });
  const notice = notices.find((entry) => entry.target?.id === "dars" && entry.kind === "effect-save");
  assert.ok(notice, JSON.stringify(notices));
  assert.equal(notice.timing, "turn-end");
  assert.equal(notice.dc, 19);
  assert.match(notice.instruction, /termina Accecato e diventa Immune per 24 ore/);
  const resolution = notice.resolution;
  assert.deepEqual(resolution, buildEffectSaveReminderResolution({ item, instance: blind, reminder: blind.saveReminder, dc: 19,
    activationId: notice.activationId, turnKey: notice.turnKey }));
  const passed = resolution.outcomes.passed.actions;
  assert.deepEqual(passed.map((action) => [action.kind, action.action]), [["condition", "apply"], ["condition", "remove-instance"]]);
  const plan = buildReminderResolutionPlan({ notice: { resolution }, items: clone(sceneItems), outcome: "passed", sceneMetadata: clone(sceneMetadata) });
  assert.equal(plan.status, "ready", plan.message);
  const failed = buildReminderResolutionPlan({ notice: { resolution }, items: clone(sceneItems), outcome: "failed", sceneMetadata: clone(sceneMetadata) });
  assert.equal(failed.status, "ready", failed.message);
  assert.equal(failed.operations.some((operation) => operation.type === "condition:add" || operation.type === "condition:remove-instances"), false,
    "a failed repeated save keeps Accecato and adds nothing");
  const mutation = await effects.runEffectsMutation(plan.operations, { kind: "condition", label: "TS Blinding Gleam", targetIds: ["dars"] });
  effects.requireAppliedEffectsMutation(mutation);
  assert.equal(named("dars", "Accecato").length, 0);
  const [immune] = named("dars", IMMUNE);
  assert.equal(immune.effectId, "monster-action:blinding-gleam:immune");
  assert.equal(immune.sourceId, "auril");
});
