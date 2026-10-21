import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let role = "GM";
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => role },
  room: {
    id: "pc-attack-room",
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
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");

const sword = { id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] };
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
let runtime;
let posted;
let baselineCount;

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `pc-attack-history-${++testSequence}`;
  role = "GM";
  sceneItems = [
    { id: "aria", name: "Aria", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {
      hp: 40, hpMax: 40, inInitiative: true, initiativeCard: { quickActions: [sword] }, untouched: "actor" } } },
    { id: "ghoul", name: "Ghoul", type: "IMAGE", layer: "CHARACTER", position: { x: 40, y: 20 }, metadata: { [META_KEY]: {
      hp: 30, hpMax: 30, inInitiative: true, untouched: "target" } } },
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["aria", "ghoul"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("pc-attack-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  posted = [];
  runtime = createPcAttackRuntime({ api: sdk, postDamage: async (row) => { posted.push(row.change.requested); return []; } });
  baselineCount = (await history.getHistoryEntries()).length;
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

async function attack(decisions = {}) {
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  return runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 8, c2: 9 }, ...decisions });
}
const attackEntry = async () => (await history.getHistoryEntries()).find((entry) => entry.kind === "pc-attack");

test("presentation lists the attack and the tracked creatures, never the attacker", async () => {
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  assert.equal(presentation.action.label, "Spada sacra");
  assert.deepEqual(presentation.action.components.map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(presentation.targets.map((item) => item.id), ["ghoul"]);
});

test("a hit is one History entry with attack provenance in the Combat Log, and Undo restores everything", async () => {
  const result = await attack();
  assert.equal(meta("ghoul").hp, 13);
  assert.equal(meta("aria").untouched, "actor");
  assert.equal(meta("ghoul").untouched, "target");
  assert.equal(meta("aria").pcAttackState.lastAttack.outcome, "hit");
  assert.deepEqual(result.hpChange, { before: 30, after: 13, hpMax: 30 });
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(posted, [17], "post-damage projections run once");
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  const entry = await attackEntry();
  assert.equal(entry.payload.damageComponents.length, 2);
  const event = combatEventFromHistoryEntryV3(entry);
  assert.equal(event.provenance.actor.id, "aria");
  assert.equal(event.provenance.cause.kind, "pc-attack");
  assert.equal(event.provenance.cause.attackInstanceId, event.correlationId);
  const undone = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(undone.status, "applied", JSON.stringify(undone));
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
});

test("a miss is still one undoable History entry, without damage or projections", async () => {
  await attack({ outcome: "miss", componentAmounts: {} });
  assert.equal(meta("ghoul").hp, 30);
  assert.deepEqual(posted, []);
  assert.equal((await history.getHistoryEntries()).length, baselineCount + 1);
  const entry = await attackEntry();
  assert.equal(entry.payload.causality.action.attackOutcome, "miss");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
});

test("two attacks in a row (Extra Attack) are two entries; undoing the second keeps the first", async () => {
  await attack({ attackInstanceId: "first" });
  await attack({ attackInstanceId: "second", componentAmounts: { c1: 5, c2: 0 } });
  assert.equal(meta("ghoul").hp, 8);
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 2);
  await history.undoHistoryThrough(entries[entries.length - 1].id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 13);
  assert.equal(meta("aria").pcAttackState.lastAttack.attackInstanceId, "first");
});

test("a retry with the same identity returns the stored result; different decisions are rejected", async () => {
  const first = await attack({ attackInstanceId: "retry" });
  const again = await attack({ attackInstanceId: "retry" });
  assert.equal(again.duplicate, true);
  assert.equal(again.historyEntryId, first.historyEntryId);
  assert.equal(meta("ghoul").hp, 13);
  assert.deepEqual(posted, [17]);
  await assert.rejects(() => attack({ attackInstanceId: "retry", componentAmounts: { c1: 1, c2: 1 } }), /decisioni/);
});

test("only the GM records; a changed action or a missing target is rejected before any mutation", async () => {
  role = "PLAYER";
  await assert.rejects(() => runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", outcome: "hit",
    componentAmounts: { c1: 1, c2: 1 } }), /GM/);
  role = "GM";
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  meta("aria").initiativeCard.quickActions = [{ ...sword, components: [{ type: "fire" }] }];
  await assert.rejects(() => runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul",
    expectedAction: presentation.action, outcome: "hit", componentAmounts: { c1: 1, c2: 1 } }), /cambiata/);
  await assert.rejects(() => attack({ targetId: "gone" }), /bersaglio/);
  assert.equal(meta("ghoul").hp, 30);
  assert.equal((await history.getHistoryEntries()).length, baselineCount);
});

const sneak = { id: "ladro-attacco-furtivo", type: "slashing", amount: 10 };
function makeRogue() { meta("aria").initiativeCard.characterBuild = [{ classId: "ladro", level: 5 }]; }

test("Sneak Attack once per turn across Extra Attack; Undo of the first makes it available again", async () => {
  makeRogue();
  const first = await attack({ attackInstanceId: "first", riders: [sneak] });
  assert.equal(meta("ghoul").hp, 3);
  assert.deepEqual(first.riders.map((rider) => rider.name), ["Attacco Furtivo"]);
  assert.equal(meta("aria").pcAttackState.riderUses.length, 1);
  await assert.rejects(() => attack({ attackInstanceId: "second", riders: [sneak], componentAmounts: { c1: 1, c2: 0 } }), /Già usato in questo turno/);
  assert.equal(meta("ghoul").hp, 3);
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  assert.equal(entry.payload.causality.riders[0].featureId, "ladro-attacco-furtivo");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
  await attack({ attackInstanceId: "third", riders: [sneak] });
  assert.equal(meta("ghoul").hp, 3);
});

test("a turn change before the commit refuses a rider counted per turn, and writes nothing", async () => {
  makeRogue();
  const realRuntime = runtime;
  runtime = createPcAttackRuntime({ api: sdk, postDamage: async () => [],
    runMutation: async (operations, options) => {
      // The next turn starts while the command travels to the coordinator.
      sceneMetadata["com.thebigpicture.initiative/state"] = { ...sceneMetadata["com.thebigpicture.initiative/state"], current: 1 };
      return effects.runEffectsMutation(operations, options);
    } });
  await assert.rejects(() => attack({ attackInstanceId: "late", riders: [sneak] }), /turno/);
  runtime = realRuntime;
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(Object.hasOwn(meta("aria"), "pcAttackState"), false);
  assert.equal((await history.getHistoryEntries()).length, baselineCount);
});

test("Eldritch Smite with Prono: one command for damage and pill; Undo removes both", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "warlock", level: 5 }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["warlock-suppliche-occulte-punizione-occulta"] });
  const result = await attack({ attackInstanceId: "eldritch", componentAmounts: { c1: 5, c2: 0 },
    riders: [{ id: "warlock-suppliche-occulte-punizione-occulta", type: "force", amount: 18, slotLevel: 3, onHit: true }] });
  assert.equal(meta("ghoul").hp, 7);
  assert.deepEqual(result.conditions, ["Prono"]);
  assert.match(result.followUps.join(" "), /slot di 3° livello/);
  const conditions = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  assert.ok(conditions(meta("ghoul").conditions).includes("Prono"));
  assert.equal((await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack").length, 1);
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(conditions(meta("ghoul").conditions).includes("Prono"), false);
});

test("a cantrip attack: one History entry, an Attack event in the Combat Log naming the cantrip", async () => {
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "mago", level: 11 }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  const presentation = await runtime.getPcAttackPresentation("aria", "cantrip");
  const result = await runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "ray-of-frost", targetId: "ghoul",
    sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 14 },
    attackInstanceId: "frost" });
  assert.equal(meta("ghoul").hp, 16);
  assert.equal(result.cantrip.name, "Raggio di gelo");
  assert.equal(result.manualRemainder, "");
  assert.deepEqual(result.conditions, ["Velocità −3 m"]);
  const pills = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  assert.ok(pills(meta("ghoul").conditions).includes("Velocità −3 m"), "the pill is on the target");
  // The spell is the large pill on the target; its effect is a mini pill linked to it.
  assert.match(JSON.stringify(meta("ghoul")["com.thebigpicture.initiative/spells"] ?? null), /Raggio di gelo/);
  const frost = (meta("ghoul").conditions?.instances || meta("ghoul").conditions || []).find((instance) => instance.condition === "Velocità −3 m");
  assert.equal(frost.parentEffectId, "frost:spell");
  assert.equal(meta("aria").pcAttackState.lastAttack.spellId, "ray-of-frost");
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  const event = combatEventFromHistoryEntryV3(entry);
  assert.equal(event.category, "attack");
  const details = buildCombatLogPresentation(null, [event]).events[0].details.flatMap((section) => section.lines).join(" | ");
  assert.match(details, /Trucchetto: Raggio di gelo \(3d8\)/);
  await assert.rejects(() => runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "magic-stone", targetId: "ghoul",
    outcome: "hit", componentAmounts: { c1: 1 } }), /Trucchetto non disponibile/);
});

test("a failed save against Frostbite: damage, spell instance and pill in one command; one Undo removes them all", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "druido", level: 5 }], spellSaveDC: 13,
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  const presentation = await runtime.getPcAttackPresentation("aria", "cantrip");
  const result = await runtime.executePcAttack({ sourceId: "aria", actionId: "cantrip", spellId: "xanathar-morsa-del-gelo", targetId: "ghoul",
    sceneIdentity: presentation.sceneIdentity, expectedAction: presentation.action, expectedDefenses: {}, outcome: "failed", componentAmounts: { c1: 8 },
    attackInstanceId: "frostbite" });
  const pills = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  const spells = () => JSON.stringify(meta("ghoul")["com.thebigpicture.initiative/spells"] ?? null);
  assert.equal(meta("ghoul").hp, 22);
  assert.deepEqual(result.conditions, ["Prossimo attacco con arma: svant."]);
  assert.ok(pills(meta("ghoul").conditions).includes("Prossimo attacco con arma: svant."));
  assert.match(spells(), /Morsa del Gelo/);
  assert.equal((await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack").length, 1);
  const entry = (await history.getHistoryEntries()).find((candidate) => candidate.kind === "pc-attack");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("ghoul").hp, 30);
  assert.equal(pills(meta("ghoul").conditions).includes("Prossimo attacco con arma: svant."), false);
  assert.doesNotMatch(spells(), /Morsa del Gelo/);
});

test("Green-Flame Blade: target and second creature in one History entry; one Undo restores both; Booming Blade leaves its pill", async () => {
  Object.assign(meta("aria").initiativeCard, { characterBuild: [{ classId: "ladro", level: 5 }],
    quickActions: [sword, { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["tasha-lama-verdefiamma", "tasha-lama-roboante"] } }] });
  sceneItems.push({ id: "imp", name: "Imp", type: "IMAGE", layer: "CHARACTER", position: { x: 60, y: 20 }, metadata: { [META_KEY]: { hp: 10, hpMax: 10, inInitiative: true } } });
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  const result = await runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 8, c2: 0 }, attackInstanceId: "green",
    weaponCantrip: { spellId: "tasha-lama-verdefiamma", amount: 4, secondary: { targetId: "imp", amount: 7 } }, expectedSecondaryDefenses: {} });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [18, 3]);
  assert.deepEqual(result.secondary, { id: "imp", name: "Imp", before: 10, after: 3 });
  assert.deepEqual(posted, [12, 7], "post-damage projections for both creatures");
  const entries = (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
  assert.equal(entries.length, 1);
  await history.undoHistoryThrough(entries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual([meta("ghoul").hp, meta("imp").hp], [30, 10]);

  await runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId: "ghoul", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: {}, outcome: "hit", componentAmounts: { c1: 8, c2: 0 }, attackInstanceId: "boom",
    weaponCantrip: { spellId: "tasha-lama-roboante", amount: 3 } });
  const pills = (value) => (Array.isArray(value) ? value : value?.instances || []).map((instance) => instance.condition);
  assert.equal(meta("ghoul").hp, 19);
  assert.ok(pills(meta("ghoul").conditions).includes("Movimento: danni tuono"));
  assert.match(JSON.stringify(meta("ghoul")["com.thebigpicture.initiative/spells"] ?? null), /Lama Roboante/);
});
