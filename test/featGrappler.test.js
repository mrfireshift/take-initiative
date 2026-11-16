// Lot F8-2 of docs/STUDIO_TALENTI.md (decision P3): Grappler. Advantage on the attacks against the creature it holds, said
// among the notes on the target; «Immobilizza», a new grapple check's success, puts Restrained on both until the grapple
// ends: «Lascia andare» or «Sfugge» takes both away. The expectations are read from the Player's Handbook's text.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { pcAttackTargetNotes } = await import("../src/pcAttackTurnActionCore.js");
const { buildPcGrappleEndMutation, buildPcGrapplePinMutation, pcGrapplePinOffered, pcGrapplePinned } = await import("../src/pcAttackManeuverCore.js");

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "sword", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const grab = { id: "grab-1", condition: "Afferrato", active: true, sourceId: "pc", sourceName: "Pg" };
const pc = (feats = [{ id: "lottatore" }], instances = []) => creature("pc", "Pg", { attitude: "pc",
  initiativeCard: { characterBuild: [{ classId: "guerriero", level: 4 }], feats }, conditions: { instances } });
const ogre = (instances = [grab]) => creature("ogre", "Ogre", { attitude: "enemy", conditions: { instances } });
const turnState = { round: 2, order: ["pc", "ogre"], current: 0 };
const pin = (extra = {}) => buildPcGrapplePinMutation({ sourceItem: pc(), grappledItem: ogre(), instanceId: "grab-1", attackInstanceId: "pin-1",
  turnState, ...extra });
// A creature after an operation that adds its instances.
const withPins = (item, result) => ({ ...item, metadata: { [META]: { ...item.metadata[META], conditions: { instances: [
  ...item.metadata[META].conditions.instances,
  ...result.operations.filter((operation) => operation.type === "condition:add" && operation.targetIds.includes(item.id))
    .map((operation) => ({ id: operation.instanceIds[item.id], condition: operation.conditionName, active: true, ...operation.options })),
] } } } });

test("the advantage: among the notes on the target it holds, not on another, not without the feat", () => {
  assert.ok(pcAttackTargetNotes({ attack: sword, targetItem: ogre(), sourceItem: pc() }).includes("Lottatore: vantaggio all'attacco, lo afferri."));
  assert.equal(pcAttackTargetNotes({ attack: sword, targetItem: ogre([]), sourceItem: pc() }).some((note) => /Lottatore/u.test(note)), false);
  assert.equal(pcAttackTargetNotes({ attack: sword, targetItem: ogre(), sourceItem: pc([]) }).some((note) => /Lottatore/u.test(note)), false);
});

test("Immobilizza: Restrained on both, each naming its grapple; one command, one Undo", () => {
  const result = pin();
  const adds = result.operations.filter((operation) => operation.type === "condition:add");
  assert.deepEqual(adds.map((operation) => [operation.targetIds[0], operation.conditionName]), [["ogre", "Trattenuto"], ["pc", "Trattenuto"]]);
  assert.ok(adds.every((operation) => operation.options.mechanics.pin.grappleInstanceId === "grab-1" && operation.options.sourceId === "pc"));
  assert.deepEqual(result.options.targetIds, ["ogre", "pc"]);
  assert.equal(result.causality.maneuver.kind, "grapple-pin");
  assert.match(result.options.label, /Pg: immobilizza Ogre \(Lottatore\)/u);
});

test("Immobilizza only for the grappler with the feat, once per grapple", () => {
  assert.throws(() => pin({ sourceItem: pc([]) }), /richiede il talento Lottatore/u);
  assert.throws(() => pin({ grappledItem: ogre([]) }), /non afferra più/u);
  const pinnedOgre = withPins(ogre(), pin());
  assert.equal(pcGrapplePinned(pinnedOgre, "grab-1"), true);
  assert.throws(() => pin({ grappledItem: pinnedOgre }), /già immobilizzata/u);
  assert.equal(pcGrapplePinOffered(pc(), ogre(), "grab-1"), true);
  assert.equal(pcGrapplePinOffered(pc(), pinnedOgre, "grab-1"), false);
  assert.equal(pcGrapplePinOffered(pc([]), ogre(), "grab-1"), false);
});

test("the grapple's end takes both Restrained away: the ogre's and the grappler's own", () => {
  const result = pin();
  const ogreAfter = withPins(ogre(), result);
  const pcAfter = withPins(pc(), result);
  const released = buildPcGrappleEndMutation({ sourceItem: pcAfter, grappledItem: ogreAfter, instanceId: "grab-1", outcome: "release",
    items: [pcAfter, ogreAfter], attackInstanceId: "end-1", turnState });
  const [removal] = released.operations;
  assert.deepEqual(removal.removals.map((entry) => entry.itemId).sort(), ["ogre", "ogre", "pc"], "Afferrato and Restrained on the ogre, Restrained on the grappler");
  assert.deepEqual(released.causality.maneuver.releasedPins.map((entry) => entry.condition), ["Trattenuto"]);
  assert.ok(released.options.targetIds.includes("pc"));
  const failed = buildPcGrappleEndMutation({ sourceItem: ogreAfter, grappledItem: ogreAfter, instanceId: "grab-1", outcome: "escape-failed",
    items: [pcAfter, ogreAfter], attackInstanceId: "end-2", turnState });
  assert.deepEqual(failed.operations, [], "a failed escape keeps everything");
});
