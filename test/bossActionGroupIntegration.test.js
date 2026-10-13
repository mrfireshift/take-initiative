// Breath of the Long Night: multi-target save pipeline through the production coordinator, History and Undo.
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
    id: "boss-group-room",
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
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
const { initiativeTurnKeyAtOrdinal } = await import("../src/turnBoundaryCore.js");
const { isEpicActionId, isLairId, splitParagonId } = await import("../src/initiativeSelectionProjectionCore.js");
const { readFile } = await import("node:fs/promises");

const p2 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const breath = p2.abilities.find((entry) => entry.name === "Breath of the Long Night");
const memory = new Map();
const store = createBossActionProfileStore({ storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } });
let runtime;
let baselineCount;
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const instances = (id) => meta(id).conditions?.instances || [];
const blinded = (id) => instances(id).filter((entry) => entry.condition === "Accecato");
const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
// Round 1: Auril (epic boss) acts at 20; its Epic Actions are virtual slots after each PC.
const ORDER = ["auril", "dars", "__EPIC__:auril:1", "mira", "__EPIC__:auril:2", "sera", "__EPIC__:auril:3"];

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `boss-group-${++testSequence}`;
  memory.clear(); store.put(p2);
  sceneItems = [
    creature("auril", "Auril", 580, { epic: true }),
    creature("dars", "Dars", 60),
    creature("mira", "Mira", 45),
    creature("sera", "Sera", 38),
    { id: "auril-bar", type: "SHAPE", layer: "ATTACHMENT", attachedTo: "auril", metadata: {} },
  ];
  sceneMetadata = { [STATE_KEY]: { round: 1, order: ORDER, current: 6 }, [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("boss-group-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [] });
  await runtime.bindBossActionProfile("auril", p2);
  baselineCount = (await history.getHistoryEntries()).length;
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

async function resolveBreath(decisions = {}) {
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.executeBossAction({
    sourceId: "auril", actionId: breath.id, profileId: p2.profileId, profileRevision: p2.profileRevision,
    bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity, manualConfirmed: true,
    targetIds: ["dars", "mira", "sera"], outcomes: { dars: "failed", mira: "failed", sera: "passed" },
    componentAmounts: { cold: 33, necrotic: 13 },
    areaPlacement: { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, areaTargetIds: ["dars", "mira", "sera"] },
    ...decisions,
  });
}
const monsterEntries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "monster-action");

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

test("three targets with mixed saves: full damage and Accecato on failure, shared half rounding on success, one History", async () => {
  const result = await resolveBreath();
  assert.equal(meta("dars").hp, 14);
  assert.equal(meta("mira").hp, 0);
  assert.equal(meta("sera").hp, 16, "33/2 and 13/2 round down per component: 16 + 6");
  assert.equal(blinded("dars").length, 1);
  assert.equal(blinded("mira").length, 1);
  assert.equal(blinded("sera").length, 0, "success never adds Accecato");
  const condition = blinded("dars")[0];
  assert.equal(condition.sourceId, "auril");
  assert.match(condition.id, /:accecato:dars$/);
  assert.deepEqual({ ...condition.expiry }, { mode: "turn-end", remaining: 1, actor: "source", actorId: "auril", anchor: "next-turn" });
  assert.equal(condition.appliedAt.turnKey, "1:6:__EPIC__:auril:3");
  const entries = await monsterEntries();
  assert.equal(entries.length, 1);
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(result.groupTargets.map((target) => [target.id, target.outcome, target.damage]), [["dars", "failed", 46], ["mira", "failed", 46], ["sera", "passed", 22]]);
});

test("the Breath Accecato is the standard condition, the same one the Conditions popover toggles", async () => {
  const { getConditionWidgetLayoutParts } = await import("../src/conditions.js");
  await resolveBreath();
  const condition = blinded("dars")[0];
  for (const field of ["effectKind", "effectId", "effectDetail"]) assert.equal(Object.hasOwn(condition, field), false, field);
  assert.deepEqual(getConditionWidgetLayoutParts(meta("dars").conditions).map((part) => [part.name, part.kind]), [["Accecato", "condition"]]);
  // The popover's toggle removes it like any other Accecato.
  const context = await effects.getEffectsMutationSceneContext({ commandId: "popover-toggle-test" });
  const toggled = await effects.runEffectsMutation(effects.conditionMutationOperations({ targetIds: ["dars"], conditionName: "Accecato",
    mode: "toggle", commandId: context.commandId, sceneIdentity: context.sceneIdentity }), { kind: "condition", label: "Rimossa: Accecato", targetIds: ["dars"] });
  effects.requireAppliedEffectsMutation(toggled);
  assert.equal(blinded("dars").length, 0);
});

test("one Undo restores every target HP, conditions and boss state", async () => {
  const before = Object.fromEntries(["auril", "dars", "mira", "sera"].map((id) => [id, clone(meta(id))]));
  await resolveBreath();
  const [entry] = await monsterEntries();
  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  for (const id of ["dars", "mira", "sera"]) {
    assert.equal(meta(id).hp, before[id].hp, id);
    assert.equal(blinded(id).length, 0, id);
    assert.equal(instances(id).length, 0, `${id} keeps no zero-HP consequence or Breath condition`);
  }
  assert.equal(Object.hasOwn(meta("auril"), "bossActionState"), false);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[breath.id].remaining, 1, "Undo restores the 1/Round use");
});

test("an Accecato from another source survives the Breath condition and its Undo", async () => {
  sceneItems[1].metadata[META_KEY].conditions = { version: 2, instances: [{ id: "other-blind", condition: "Accecato", active: true,
    sourceId: "sera", sourceName: "Sera", expiry: { mode: "manual" }, targetId: "dars" }] };
  await resolveBreath();
  assert.deepEqual(blinded("dars").map((entry) => entry.id).sort(), ["other-blind", blinded("dars").find((entry) => entry.sourceId === "auril").id].sort());
  const [entry] = await monsterEntries();
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(blinded("dars").map((entry) => entry.id), ["other-blind"]);
});

test("a missing outcome or missing confirmation applies nothing", async () => {
  await assert.rejects(() => resolveBreath({ outcomes: { dars: "failed", mira: "failed" } }), /Manca l’esito.*Sera/);
  await assert.rejects(() => resolveBreath({ actionInstanceId: "unconfirmed", manualConfirmed: false }), /Conferma ricarica/);
  await assert.rejects(() => resolveBreath({ actionInstanceId: "undrawn", areaPlacement: null }), /Disegna l’area/);
  for (const id of ["dars", "mira", "sera"]) assert.equal(instances(id).length, 0);
  assert.equal(meta("dars").hp, 60); assert.equal(meta("sera").hp, 38);
  assert.equal((await history.getHistoryEntries()).length, baselineCount);
});

test("duplicate target ids are applied once and the boss or an attachment is never a target", async () => {
  await resolveBreath({ targetIds: ["dars", "dars", "sera"], outcomes: { dars: "failed", sera: "passed" } });
  assert.equal(meta("dars").hp, 14); assert.equal(blinded("dars").length, 1); assert.equal(meta("sera").hp, 16);
  await assert.rejects(() => resolveBreath({ actionInstanceId: "self", targetIds: ["auril"], outcomes: { auril: "failed" } }), /diverso dal boss/);
  await assert.rejects(() => resolveBreath({ actionInstanceId: "bar", targetIds: ["auril-bar"], outcomes: { "auril-bar": "failed" } }), /creatura reale/);
});

test("a conflict on one target rejects the whole group without partial damage or conditions", async () => {
  const original = sdk.scene.items.updateItems;
  let injected = false;
  sdk.scene.items.updateItems = async (ids, updater) => {
    const list = typeof ids === "function" ? [] : ids;
    if (!injected && list.includes("sera")) { injected = true; sceneItems.find((item) => item.id === "sera").metadata[META_KEY].hp = 30; }
    return original(ids, updater);
  };
  try {
    await assert.rejects(() => resolveBreath(), (error) => error.status === "conflict" || /stato è cambiato|conflict/i.test(error.message));
    assert.equal(injected, true);
    assert.equal(meta("dars").hp, 60); assert.equal(meta("mira").hp, 45); assert.equal(meta("sera").hp, 30);
    for (const id of ["dars", "mira", "sera"]) assert.equal(blinded(id).length, 0, id);
    assert.equal((await history.getHistoryEntries()).length, baselineCount);
  } finally { sdk.scene.items.updateItems = original; }
});

test("a lost ACK retry keeps the same identity and never duplicates damage or conditions", async () => {
  const { createEffectsMutationBackgroundBroker } = await import("../src/effectsMutationBroker.js");
  const presentation = await runtime.getBossActionPresentation("auril");
  let commits = 0, lost = true;
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async (operations, options) => { commits++; return effects.runEffectsMutation(operations, options); },
    executeUndo: async () => {},
  });
  broker.setSceneIdentity(presentation.sceneIdentity);
  runtime = createBossActionRuntime({ api: sdk, store, postDamage: async () => [], runMutation: async (operations, options) => {
    const reply = await broker.handle({ kind: "apply", requestId: options.commandId, command: { operations, ...options } });
    if (lost) { lost = false; throw new Error("ACK lost"); }
    return { ...reply.result, duplicate: reply.duplicate };
  } });
  await assert.rejects(() => resolveBreath({ actionInstanceId: "breath-lost-ack" }), /ACK lost/);
  const recovered = await resolveBreath({ actionInstanceId: "breath-lost-ack" });
  assert.equal(recovered.duplicate, true);
  assert.equal(commits, 1);
  assert.equal(meta("dars").hp, 14); assert.equal(blinded("dars").length, 1); assert.equal(blinded("mira").length, 1);
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  await assert.rejects(() => resolveBreath({ actionInstanceId: "breath-lost-ack", outcomes: { dars: "passed", mira: "failed", sera: "passed" } }), /draft|decision|cambiat/i);
});

test("Combat Log v3: real boss actor, full provenance, per-target saves, components, conditions and manual steps", async () => {
  const result = await resolveBreath({ actionInstanceId: "breath-log" });
  const [entry] = await monsterEntries();
  const event = combatEventFromHistoryEntryV3(entry);
  assert.equal(event.provenance.actor.id, "auril");
  assert.equal(event.provenance.actor.tokenId, "auril");
  assert.deepEqual(
    Object.fromEntries(["profileId", "profileRevision", "phaseId", "bossInstanceId", "actionId", "actionName", "actionInstanceId"].map((key) => [key, event.provenance.cause[key]])),
    { profileId: p2.profileId, profileRevision: p2.profileRevision, phaseId: "fase2", bossInstanceId: "boss-instance:auril:auril",
      actionId: breath.id, actionName: "Breath of the Long Night", actionInstanceId: "breath-log" });
  const causality = entry.payload.causality;
  assert.deepEqual(causality.save, { ability: "con", dc: 19, success: "half" });
  assert.deepEqual(causality.area.areaTargetIds, ["dars", "mira", "sera"]);
  assert.deepEqual([causality.area.addedManually, causality.area.removedManually], [[], []]);
  assert.deepEqual(causality.targets.map((target) => [target.id, target.outcome, target.damageFactor]), [["dars", "failed", "full"], ["mira", "failed", "full"], ["sera", "passed", "half"]]);
  assert.deepEqual(causality.targets[2].damageComponents.map((c) => [c.type, c.formula, c.printedAverage, c.inputAmount, c.amount]), [["cold", "6d10", 33, 33, 16], ["necrotic", "3d8", 13, 13, 6]]);
  assert.deepEqual(causality.conditionsApplied.map((c) => [c.targetId, c.condition, c.expiry.actorId, c.expiry.anchor]), [["dars", "Accecato", "auril", "next-turn"], ["mira", "Accecato", "auril", "next-turn"]]);
  assert.equal(causality.manualVerification.automated, false);
  assert.ok(causality.manualVerification.steps.some((step) => /Special Recharge.*GM/.test(step)));
  assert.ok(causality.manualVerification.steps.some((step) => /ultima Azione Epica che usa nel round/.test(step)));
  assert.equal(causality.area.verification, "placed");
  assert.deepEqual(causality.area.placement, { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 600, y: 0 } });
  assert.deepEqual(causality.resources.map((r) => [r.period, r.round, r.beforeUsed, r.afterUsed]), [["round", 1, 0, 1]]);
  assert.equal(result.resources.length, 1);
});

test("Breath is spent once per round: a second use in the same round is refused before any mutation", async () => {
  await resolveBreath();
  await assert.rejects(() => resolveBreath({ actionInstanceId: "second-breath" }), /esaurit/i);
  assert.equal(meta("dars").hp, 14);
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
});

test("timing: Accecato from the last Epic slot of round 1 ends at the end of Auril's next real turn", async () => {
  await resolveBreath();
  await advance({ round: 1, current: 6 }, { round: 2, current: 0 });
  assert.equal(blinded("dars").length, 1, "start of Auril's turn does not end it");
  await advance({ round: 2, current: 0 }, { round: 2, current: 1 });
  assert.equal(blinded("dars").length, 0, "end of Auril's next turn ends it");
  assert.equal(blinded("mira").length, 0);
});

test("timing: Epic slots never advance the expiry and an application inside Auril's turn waits for her next one", async () => {
  sceneMetadata[STATE_KEY] = { ...sceneMetadata[STATE_KEY], current: 0 };
  await resolveBreath();
  assert.equal(blinded("dars")[0].appliedAt.turnKey, "1:0:auril");
  await advance({ round: 1, current: 0 }, { round: 1, current: 1 });
  assert.equal(blinded("dars").length, 1, "the end of the turn in progress is not the next turn");
  await advance({ round: 1, current: 1 }, { round: 2, current: 0 });
  assert.equal(blinded("dars").length, 1, "Epic slots and PC turns do not tick Auril's expiry");
  await advance({ round: 2, current: 0 }, { round: 2, current: 1 });
  assert.equal(blinded("dars").length, 0);
});

test("defenses from the Actor Profile: saved through the real card store, applied per component, kept by partial saves, undone with the group", async () => {
  const { saveInitiativeCard } = await import("../src/initiativeCards.js");
  await saveInitiativeCard("dars", "Dars", { damageDefenses: { resistances: ["cold"] } }, { preserveExhaustion: true });
  await saveInitiativeCard("dars", "Dars", { armorClass: 17 }, { preserveExhaustion: true });
  assert.deepEqual(meta("dars").initiativeCard.damageDefenses, { immunities: [], resistances: ["cold"], vulnerabilities: [] }, "a partial save keeps the defenses");
  baselineCount = (await history.getHistoryEntries()).length;
  const expectedDefenses = { dars: meta("dars").initiativeCard.damageDefenses, mira: {}, sera: {} };
  const result = await resolveBreath({ expectedDefenses });
  assert.equal(meta("dars").hp, 60 - 29, "cold 33 → 16 (resistance) + necrotic 13");
  assert.equal(meta("sera").hp, 16);
  const [entry] = await monsterEntries();
  const dars = entry.payload.causality.targets.find((target) => target.id === "dars");
  assert.deepEqual(dars.damageComponents.map((c) => [c.type, c.factor, c.defense, c.amount]), [["cold", "full", "resistance", 16], ["necrotic", "full", null, 13]]);
  assert.equal(result.groupTargets.find((target) => target.id === "dars").damage, 29);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("dars").hp, 60);
  assert.deepEqual(meta("dars").initiativeCard.damageDefenses.resistances, ["cold"], "Undo never touches the profile");
});

test("a target profile changed during the commit rejects the whole group", async () => {
  sceneItems.find((item) => item.id === "dars").metadata[META_KEY].initiativeCard = { damageDefenses: { resistances: ["cold"], immunities: [], vulnerabilities: [] } };
  const original = sdk.scene.items.updateItems;
  let injected = false;
  sdk.scene.items.updateItems = async (ids, updater) => {
    const list = typeof ids === "function" ? [] : ids;
    if (!injected && list.includes("dars")) { injected = true; sceneItems.find((item) => item.id === "dars").metadata[META_KEY].initiativeCard = { damageDefenses: { immunities: ["cold"], resistances: [], vulnerabilities: [] } }; }
    return original(ids, updater);
  };
  try {
    await assert.rejects(() => resolveBreath(), (error) => error.status === "conflict" || /stato è cambiato|conflict/i.test(error.message));
    assert.equal(injected, true);
    for (const id of ["dars", "mira", "sera"]) assert.equal(blinded(id).length, 0, id);
    assert.equal(meta("mira").hp, 45);
    assert.equal((await history.getHistoryEntries()).length, baselineCount);
  } finally { sdk.scene.items.updateItems = original; }
});
