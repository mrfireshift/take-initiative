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
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: {
    id: "pc-maneuver-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => { roomMetadata = { ...roomMetadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    grid: { getDpi: async () => 100, getScale: async () => ({ parsed: { multiplier: 5, unit: "ft" } }) },
    local: { getItems: async () => [], addItems: async () => {}, updateItems: async () => {}, deleteItems: async () => {}, onChange: () => () => {} },
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
      getItemBounds: async () => ({ min: { x: 0, y: 0 }, max: { x: 100, y: 100 }, width: 100, height: 100, center: { x: 50, y: 50 } }),
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
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
const {
  buildPcManeuverMutation, buildPcGrappleEndMutation, pcManeuverBlocker, pcGrappleHolds, pcGrapplesOn, pcAttackManeuverEntries,
} = await import("../src/pcAttackManeuverCore.js");

const sword = { id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const creature = (id, name, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp: 20, hpMax: 20, inInitiative: true, ...extra } } });
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => {
  const value = meta(id).conditions;
  return (Array.isArray(value) ? value : value?.instances || []).filter((instance) => instance.active !== false);
};
const pillNames = (id) => pills(id).map((instance) => instance.condition);
const entries = async () => (await history.getHistoryEntries()).filter((entry) => entry.kind === "pc-attack");
const logLines = (entry) => {
  const [event] = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3(entry)]).events;
  return event.details.flatMap((section) => section.lines).join(" | ");
};
let runtime;
let labels;

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `pc-maneuver-history-${++testSequence}`;
  sceneItems = [
    creature("aria", "Aria", { attitude: "pc", initiativeCard: { quickActions: [sword] }, pcAttackState: { version: 1, lastAttack: { quickActionId: "sword" } } }),
    creature("ghoul", "Ghoul", { untouched: "target" }),
    creature("yeti", "Yeti"),
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["aria", "ghoul", "yeti"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("pc-maneuver-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  labels = [];
  runtime = createPcAttackRuntime({ api: sdk, postDamage: async () => [], refreshLabels: async (ids) => { labels.push(...ids); } });
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

const maneuver = (decisions) => runtime.executePcManeuver({ sourceId: "aria", targetId: "ghoul", ...decisions });

test("the picker entries: Lotta and Spinta in the Attacchi tab, resolved by the console", () => {
  assert.deepEqual(pcAttackManeuverEntries().map((entry) => [entry.key, entry.tab, entry.mode, entry.label]),
    [["maneuver::grapple", "attacks", "maneuver", "Lotta"], ["maneuver::shove", "attacks", "maneuver", "Spinta"]]);
});

test("blockers: target, outcome, the Shove's effect, an incapacitated attacker, a creature already held", () => {
  const aria = creature("aria", "Aria");
  const ghoul = creature("ghoul", "Ghoul");
  assert.match(pcManeuverBlocker({ kind: "grapple", sourceItem: aria, targetItem: null, outcome: "success" }), /bersaglio/);
  assert.match(pcManeuverBlocker({ kind: "grapple", sourceItem: aria, targetItem: aria, outcome: "success" }), /attaccante/);
  assert.match(pcManeuverBlocker({ kind: "grapple", sourceItem: aria, targetItem: ghoul }), /esito/);
  assert.match(pcManeuverBlocker({ kind: "shove", sourceItem: aria, targetItem: ghoul, outcome: "success" }), /Prono/);
  assert.equal(pcManeuverBlocker({ kind: "shove", sourceItem: aria, targetItem: ghoul, outcome: "failure", effect: "push" }), "");
  const stunned = creature("aria", "Aria", { conditions: [{ id: "s", condition: "Stordito" }] });
  assert.match(pcManeuverBlocker({ kind: "grapple", sourceItem: stunned, targetItem: ghoul, outcome: "success" }), /incapacitato/);
  const held = creature("ghoul", "Ghoul", { conditions: [{ id: "g", condition: "Afferrato", sourceId: "aria" }] });
  assert.match(pcManeuverBlocker({ kind: "grapple", sourceItem: aria, targetItem: held, outcome: "success" }), /già Afferrato/);
  assert.equal(pcManeuverBlocker({ kind: "shove", sourceItem: aria, targetItem: held, outcome: "success", effect: "prone" }), "", "a creature held can be shoved");
  assert.throws(() => buildPcManeuverMutation({ kind: "grapple", sourceItem: aria, targetItem: ghoul, outcome: "success" }), /Identità/);
});

test("who holds whom: the grappler's holds and the grapples on a creature", () => {
  const ghoul = creature("ghoul", "Ghoul", { conditions: [{ id: "g1", condition: "Afferrato", sourceId: "aria" },
    { id: "g2", condition: "Afferrato", sourceId: "", sourceName: "" }, { id: "p", condition: "Prono", sourceId: "aria" }] });
  const aria = creature("aria", "Aria");
  assert.deepEqual(pcGrappleHolds([aria, ghoul], "aria"), [{ targetId: "ghoul", name: "Ghoul", instanceId: "g1" }]);
  assert.deepEqual(pcGrapplesOn(ghoul, [aria]), [{ grapplerId: "aria", name: "Aria", instanceId: "g1" }, { grapplerId: "", name: "", instanceId: "g2" }]);
});

test("a successful Grapple: Afferrato on the target from the grappler, one History entry, a log line, Undo removes it", async () => {
  const result = await maneuver({ kind: "grapple", outcome: "success", attackInstanceId: "grab-1" });
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(pills("ghoul").map((instance) => [instance.condition, instance.sourceId, instance.expiry?.mode]), [["Afferrato", "aria", "manual"]]);
  assert.equal(meta("ghoul").untouched, "target");
  assert.equal(meta("ghoul").hp, 20, "no damage");
  assert.deepEqual(meta("aria").pcAttackState.lastAttack, { quickActionId: "sword" }, "the last attack stays");
  assert.equal(meta("aria").pcAttackState.lastManeuver.outcome, "success");
  assert.deepEqual(labels, ["ghoul"]);
  const [entry] = await entries();
  assert.match(entry.label, /Aria: Lotta → Ghoul \(riuscita\)/);
  assert.match(logLines(entry), /Lotta.*riuscita.*Afferrato/);
  const again = await maneuver({ kind: "grapple", outcome: "success", attackInstanceId: "grab-1" });
  assert.equal(again.duplicate, true, "a retry never applies it twice");
  await assert.rejects(maneuver({ kind: "grapple", outcome: "success", attackInstanceId: "grab-2" }), /già Afferrato/);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(pillNames("ghoul"), []);
  assert.equal(meta("aria").pcAttackState.lastManeuver, undefined);
});

test("a failed Grapple changes nothing on the target but is still recorded, with its Undo", async () => {
  const result = await maneuver({ kind: "grapple", outcome: "failure", attackInstanceId: "grab-miss" });
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(pillNames("ghoul"), []);
  assert.deepEqual(labels, [], "no pill changed");
  const [entry] = await entries();
  assert.match(entry.label, /\(fallita\)/);
  assert.match(logLines(entry), /Lotta.*fallita/);
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("aria").pcAttackState.lastManeuver, undefined);
});

test("Shove: Prono applied; a push only recorded, with the move left to the GM", async () => {
  await maneuver({ kind: "shove", outcome: "success", effect: "prone", attackInstanceId: "shove-prone" });
  assert.deepEqual(pills("ghoul").map((instance) => [instance.condition, instance.sourceId]), [["Prono", "aria"]]);
  const pushed = await runtime.executePcManeuver({ sourceId: "aria", targetId: "yeti", kind: "shove", outcome: "success", effect: "push", attackInstanceId: "shove-push" });
  assert.deepEqual(pillNames("yeti"), []);
  assert.match(pushed.manualText, /Sposta Yeti di 1,5 m/);
  const list = await entries();
  assert.equal(list.length, 2);
  assert.match(logLines(list[0]), /Spinta.*Prono/);
  assert.match(logLines(list[1]), /spinto via di 1,5 m/);
  const before = sceneItems.find((item) => item.id === "yeti").position;
  assert.deepEqual(before, { x: 0, y: 0 }, "the token never moves");
});

test("the grappler lets go: Afferrato (and its grab's Trattenuto, never a spell's) removed; Undo brings it back", async () => {
  await maneuver({ kind: "grapple", outcome: "success", attackInstanceId: "grab-1" });
  const ghoul = sceneItems.find((item) => item.id === "ghoul");
  const instances = meta("ghoul").conditions.instances || meta("ghoul").conditions;
  instances.push({ id: "r-grab", condition: "Trattenuto", sourceId: "aria", active: true },
    { id: "r-spell", condition: "Trattenuto", sourceId: "aria", parentEffectId: "spell:ensnaring", active: true });
  assert.ok(ghoul);
  const [grab] = pcGrappleHolds(sceneItems, "aria");
  const result = await runtime.endPcGrapple({ sourceId: "aria", grappledId: "ghoul", instanceId: grab.instanceId, outcome: "release", attackInstanceId: "let-go" });
  assert.deepEqual(result.maneuver.releasedConditions.map((entry) => entry.condition), ["Afferrato", "Trattenuto"]);
  assert.deepEqual(pills("ghoul").map((instance) => instance.id), ["r-spell"]);
  const list = await entries();
  assert.match(list[1].label, /Aria: lascia andare Ghoul/);
  assert.match(logLines(list[1]), /lascia andare/);
  await history.undoHistoryThrough(list[1].id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(pillNames("ghoul").sort(), ["Afferrato", "Trattenuto", "Trattenuto"]);
  await assert.rejects(runtime.endPcGrapple({ sourceId: "yeti", grappledId: "ghoul", instanceId: grab.instanceId, outcome: "release",
    attackInstanceId: "not-mine" }), /non riguarda/);
});

test("escapes: the held creature's escape from the grappler's console, a PC's own escape (failed, then successful)", async () => {
  await maneuver({ kind: "grapple", outcome: "success", attackInstanceId: "grab-1" });
  const [grab] = pcGrappleHolds(sceneItems, "aria");
  const failed = await runtime.endPcGrapple({ sourceId: "aria", grappledId: "ghoul", instanceId: grab.instanceId, outcome: "escape-failed", attackInstanceId: "try" });
  assert.equal(failed.undoAvailable, true);
  assert.deepEqual(pillNames("ghoul"), ["Afferrato"]);
  await runtime.endPcGrapple({ sourceId: "aria", grappledId: "ghoul", instanceId: grab.instanceId, outcome: "escaped", attackInstanceId: "free" });
  assert.deepEqual(pillNames("ghoul"), []);
  const list = await entries();
  assert.match(list[1].label, /Ghoul: sfuggire alla presa di Aria \(fallita\)/);
  assert.match(list[2].label, /\(riuscita\)/);
  assert.match(logLines(list[2]), /sfugge alla presa di Aria/);
  // A PC held by a boss's grab (escape DC): the escape from its own console.
  meta("aria").conditions = { version: 2, instances: [{ id: "boss-grab", condition: "Afferrato", sourceId: "yeti", sourceName: "Yeti", escapeDC: 15,
    active: true, expiry: { mode: "manual" } }] };
  await assert.rejects(runtime.endPcGrapple({ sourceId: "aria", grappledId: "aria", instanceId: "boss-grab", outcome: "release", attackInstanceId: "x" }),
    /Solo chi afferra/);
  await runtime.endPcGrapple({ sourceId: "aria", grappledId: "aria", instanceId: "boss-grab", outcome: "escaped", attackInstanceId: "pc-free" });
  assert.deepEqual(pillNames("aria"), []);
  await assert.rejects(runtime.endPcGrapple({ sourceId: "aria", grappledId: "aria", instanceId: "boss-grab", outcome: "escaped", attackInstanceId: "pc-free-2" }),
    /già finita/);
});

test("the grapple ends by itself when the grappler is incapacitated (the existing condition automation)", async () => {
  await maneuver({ kind: "grapple", outcome: "success", attackInstanceId: "grab-1" });
  const plan = await effects.runEffectsMutation([{ type: "condition:add", targetIds: ["aria"], conditionName: "Stordito", options: {} },
    { type: "condition:automate", subjectIds: ["aria"] }], { history: false, kind: "test", label: "Stordito", targetIds: ["aria"] });
  effects.requireAppliedEffectsMutation(plan);
  assert.deepEqual(pillNames("ghoul"), []);
});

test("the end-of-grapple builder refuses a grapple already over and an unknown outcome", () => {
  const aria = creature("aria", "Aria");
  const ghoul = creature("ghoul", "Ghoul");
  assert.throws(() => buildPcGrappleEndMutation({ sourceItem: aria, grappledItem: ghoul, instanceId: "g", outcome: "release", attackInstanceId: "x" }), /già finita/);
  assert.throws(() => buildPcGrappleEndMutation({ sourceItem: aria, grappledItem: ghoul, instanceId: "g", outcome: "nope", attackInstanceId: "x" }), /come finisce/);
});
