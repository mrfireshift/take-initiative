// Avvisi di reazione, lot R5 (docs/STUDIO_AVVISI_REAZIONE.md §6.16, decisions J1-J5): who a movement lets react.
// Leaving a reach (Opportunity Attack, PHB 2014: a hostile creature you can see moves out of your reach), entering 3 m
// (Halo of Spores), the reach of a reach weapon, Zephyr Strike's "no AdO", and the creature whose turn it is.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { activeTurnCreatureId, movementReactionEvents, reactionTurnKey, reactorReachMeters } = await import("../src/opportunityAttackCore.js");
const { reactionCandidates } = await import("../src/reactionCandidatesCore.js");
const { reactionMovePopoverHeight } = await import("../src/reactionMoveWatcher.js");

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const creature = (id, x, y, meta = {}, name = id) => ({ id, name, position: { x, y }, metadata: { [META]: { hp: 20, hpMax: 20, attitude: "pc", ...meta } } });
// One square = 1 unit = 1.5 m, counted in squares (diagonals too), as a melee reach.
const distance = (a, b) => Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y)) * 1.5;
const pts = (...list) => list.map(([x, y]) => ({ x, y }));
const goblin = creature("goblin", 0, 0, { attitude: "enemy" }, "Goblin");
const ogre = creature("ogre", 0, 0, { attitude: "enemy", initiativeCard: { quickActions: [{ id: "club", kind: "attack", range: "melee", reachFeet: 10 }] } }, "Ogre");
const mira = creature("mira", 1, 0, {}, "Mira");

test("the reach: 1.5 m, or the longest melee reach of the sheet (10 ft. is 3 m)", () => {
  assert.equal(reactorReachMeters(goblin), 1.5);
  assert.equal(reactorReachMeters(ogre), 3);
  assert.equal(reactorReachMeters(creature("archer", 0, 0, { initiativeCard: { quickActions: [{ kind: "attack", range: "ranged", reachFeet: 10 }] } })), 1.5,
    "a ranged attack has no reach");
});

test("leaving a reach: from inside to outside; staying adjacent or starting outside does not", () => {
  const leave = movementReactionEvents({ mover: mira, path: pts([1, 0], [3, 0]), others: [goblin], distance });
  assert.deepEqual(leave, [{ trigger: "move-leave", moverId: "mira", reactorIds: ["goblin"] }]);
  assert.deepEqual(movementReactionEvents({ mover: mira, path: pts([1, 0], [1, 1]), others: [goblin], distance }), [], "still adjacent");
  assert.deepEqual(movementReactionEvents({ mover: mira, path: pts([3, 0], [5, 0]), others: [goblin], distance }), [], "never within");
  assert.deepEqual(movementReactionEvents({ mover: mira, path: pts([1, 0], [2, 0]), others: [ogre], distance }), [], "still within 3 m");
  assert.deepEqual(movementReactionEvents({ mover: mira, path: pts([2, 0], [3, 0]), others: [ogre], distance })[0].reactorIds, ["ogre"]);
});

test("J2: with the Movimento tool every square counts: out and back in one drag provokes", () => {
  const events = movementReactionEvents({ mover: mira, path: pts([1, 0], [2, 0], [3, 0], [1, 1]), others: [goblin], distance });
  assert.deepEqual(events.find((event) => event.trigger === "move-leave")?.reactorIds, ["goblin"]);
});

test("entering 3 m (Halo of Spores): within at the end, not at the start", () => {
  const events = movementReactionEvents({ mover: mira, path: pts([5, 0], [2, 0]), others: [goblin], distance });
  assert.deepEqual(events, [{ trigger: "move-enter", moverId: "mira", reactorIds: ["goblin"] }]);
});

test("J3: Zephyr Strike's pill provokes nothing; an unknown distance stops the reading", () => {
  const zephyr = creature("mira", 1, 0, { [SPELLS]: [{ spellId: "xanathar-colpo-dello-zefiro", name: "Colpo dello Zefiro" }] }, "Mira");
  assert.deepEqual(movementReactionEvents({ mover: zephyr, path: pts([1, 0], [3, 0]), others: [goblin], distance }), []);
  assert.deepEqual(movementReactionEvents({ mover: mira, path: pts([1, 0], [3, 0]), others: [goblin], distance: () => null }), []);
});

test("J1: the creature whose turn it is, and the turn's key", () => {
  assert.equal(activeTurnCreatureId({ order: ["goblin", "mira::p2"], current: 1 }), "mira");
  assert.equal(activeTurnCreatureId({ order: [], current: 0 }), "");
  assert.equal(reactionTurnKey({ round: 2, current: 1 }), "2:1");
  assert.ok(reactionMovePopoverHeight(1) < reactionMovePopoverHeight(3));
});

test("the engine: Opportunity Attack for a hostile creature, with the mover as its target; only with the Movimento switch", () => {
  const items = [goblin, { ...mira, position: { x: 3, y: 0 } }];
  const state = { round: 1, current: 1, order: ["goblin", "mira"] };
  const event = { trigger: "move-leave", moverId: "mira", reactorIds: ["goblin"] };
  assert.deepEqual(reactionCandidates(event, { items, state }).candidates, [], "Movimento off by default (D3)");
  const options = { triggers: { move: true }, actors: { pcs: true, npcs: true } };
  const [attack] = reactionCandidates(event, { items, state, options }).candidates;
  assert.equal(attack.reactionId, "opportunity-attack");
  assert.equal(attack.flow, "off-turn-attack");
  assert.deepEqual(attack.targetIds, ["mira"]);
  assert.match(attack.rule, /se non si è disimpegnata/u);
  const ally = creature("ally", 0, 0, {}, "Dars");
  assert.deepEqual(reactionCandidates({ ...event, reactorIds: ["ally"] }, { items: [ally, items[1]], state: { ...state, order: ["ally", "mira"] }, options })
    .candidates, [], "a friend does not attack");
});

test("the prompt shows the movement's lot (R5)", async () => {
  const { REACTION_PROMPT_LOTS } = await import("../src/reactionPromptView.js");
  assert.ok(REACTION_PROMPT_LOTS.includes("R5"));
});

test("Movimento on: a monster's Opportunity Attack on a character, even with the other creatures' switch off", () => {
  const items = [goblin, { ...mira, position: { x: 3, y: 0 } }];
  const state = { round: 1, current: 1, order: ["goblin", "mira"] };
  const event = { trigger: "move-leave", moverId: "mira", reactorIds: ["goblin"] };
  const options = { triggers: { move: true }, actors: { pcs: true, npcs: false } };
  assert.deepEqual(reactionCandidates(event, { items, state, options }).candidates.map((candidate) => candidate.reactionId), ["opportunity-attack"]);
  const hit = { trigger: "hit", attackerId: "mira", targetIds: ["goblin"], range: "melee", attackRoll: true };
  assert.deepEqual(reactionCandidates(hit, { items, state, options }).candidates, [], "the other triggers keep the switch");
});
