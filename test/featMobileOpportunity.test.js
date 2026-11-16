// Lot F2-2 of docs/STUDIO_TALENTI.md (decisions M1, M2, M5): Mobile, and Fancy Footwork on the rogue's own turn. A melee
// attack registered from the console, hit or miss, puts on the attacker a pill «No AdO: <target>» until the end of the
// turn; the movement then lets that creature make no opportunity attack (opportunityAttackCore.js), Sentinel included,
// and every other creature as before.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { movementReactionEvents, noOpportunityFromIds, NO_OPPORTUNITY_FROM_PREFIX } = await import("../src/opportunityAttackCore.js");
const { buildPcAttackMutation, pcAttackNoOpportunityPlan } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8+2" }] };
const creature = (id, name, x, y, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x, y },
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const fighter = (feats = [], meta = {}) => creature("pc", "Pg", 1, 0, { attitude: "pc", initiativeCard: {
  characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { str: 3, dex: 2 }, feats: feats.map((id) => ({ id })),
  quickActions: [sword, bow] }, ...meta });
const rogue = () => creature("pc", "Pg", 1, 0, { attitude: "pc", initiativeCard: {
  characterBuild: [{ classId: "ladro", level: 3, subclassId: "ladro-spadaccino" }], abilityModifiers: { dex: 3 }, quickActions: [sword] } });
const goblin = (id = "goblin-a", x = 0, meta = {}) => creature(id, id === "goblin-a" ? "Goblin A" : "Goblin B", x, 0, { attitude: "enemy", ...meta });
const ownTurn = { round: 2, order: ["pc", "goblin-a", "goblin-b"], current: 0 };
const goblinTurn = { ...ownTurn, current: 1 };
const attack = (sourceItem, overrides = {}) => buildPcAttackMutation({ action: sword, sourceItem, targetItem: goblin(), outcome: "hit",
  componentAmounts: { c1: 8 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {}, ...overrides });
const pillOf = (result) => result.operations.find((operation) => operation.type === "condition:add"
  && operation.conditionName.startsWith(NO_OPPORTUNITY_FROM_PREFIX));
// The attacker after the command, with the pill the command put.
const withPill = (item, operation) => ({ ...item, metadata: { [META]: { ...item.metadata[META], conditions: { instances: [
  { id: operation.instanceIds[item.id], condition: operation.conditionName, active: true, ...operation.options }] } } } });
const distance = (a, b) => Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y)) * 1.5;
const path = (...list) => list.map(([x, y]) => ({ x, y }));

test("Mobile: a melee attack, hit or miss, puts «No AdO: <target>» on the attacker until the end of the turn", () => {
  const pc = fighter(["mobilita"]);
  const hit = attack(pc);
  const pill = pillOf(hit);
  assert.equal(pill.conditionName, "No AdO: Goblin A");
  assert.deepEqual(pill.targetIds, ["pc"]);
  assert.deepEqual(pill.options.mechanics, { noOpportunityFrom: ["goblin-a"] });
  assert.deepEqual(pill.options.expiry, { mode: "turn-end", actor: "source", actorId: "pc", remaining: 1 });
  assert.equal(pill.options.mapVisible, false);
  assert.equal(pill.options.effectDetail, "Mobilità: Goblin A non fa attacchi di opportunità a Pg fino alla fine del turno.");
  assert.deepEqual([hit.causality.noOpportunity.featureId, hit.causality.noOpportunity.targetId], ["talento-mobilita", "goblin-a"]);
  assert.ok(hit.options.targetIds.includes("pc") && hit.labelTargetIds.includes("pc"), "the attacker's pill is in the command");
  const miss = attack(pc, { outcome: "miss", componentAmounts: {} });
  assert.equal(pillOf(miss)?.conditionName, "No AdO: Goblin A", "a miss too");
});

test("Mobile: nothing for a ranged attack, out of combat, without the feat, or when a pill already names the target", () => {
  const pc = fighter(["mobilita"]);
  assert.equal(pillOf(attack(pc, { action: bow, componentAmounts: { c1: 6 } })), undefined, "ranged");
  assert.equal(pillOf(attack(pc, { turnState: null })), undefined, "out of combat");
  assert.equal(pillOf(attack(fighter([]))), undefined, "without the feat");
  const again = withPill(pc, pillOf(attack(pc)));
  assert.equal(pillOf(attack(again, { attackInstanceId: "a2" })), undefined, "the same target twice");
  assert.equal(pillOf(attack(again, { attackInstanceId: "a2", targetItem: goblin("goblin-b", 2) })).conditionName, "No AdO: Goblin B");
  // Off its own turn (an opportunity attack of its own): the pill ends with the turn of the creature whose turn it is.
  assert.deepEqual(pillOf(attack(pc, { turnState: goblinTurn })).options.expiry, { mode: "turn-end", actor: "source", actorId: "goblin-a", remaining: 1 });
});

test("Fancy Footwork: the same pill, only on the rogue's own turn", () => {
  const plan = pcAttackNoOpportunityPlan({ attack: { range: "melee" }, sourceItem: rogue(), targetItem: goblin(),
    turn: { round: 2, actorId: "pc", turnKey: "2:0" }, attackInstanceId: "a1" });
  assert.deepEqual([plan.featureId, plan.condition], ["ladro-spadaccino-gioco-di-gambe", "No AdO: Goblin A"]);
  assert.match(plan.operation.options.effectDetail, /^Gioco di Gambe: /u);
  assert.equal(pcAttackNoOpportunityPlan({ attack: { range: "melee" }, sourceItem: rogue(), targetItem: goblin(),
    turn: { round: 2, actorId: "goblin-a", turnKey: "2:1" }, attackInstanceId: "a1" }), null, "off its turn");
  assert.equal(pillOf(attack(rogue())).conditionName, "No AdO: Goblin A");
});

test("the movement: the creature the pill names makes no opportunity attack, the others do; Sentinel does not undo it", () => {
  const pc = fighter(["mobilita"]);
  const mover = withPill(pc, pillOf(attack(pc)));
  assert.deepEqual([...noOpportunityFromIds(mover)], ["goblin-a"]);
  const others = [goblin("goblin-a", 0), goblin("goblin-b", 2)];
  // From (1, 0), next to both, to (1, 3): it leaves both reaches.
  assert.deepEqual(movementReactionEvents({ mover, path: path([1, 0], [1, 3]), others, distance }),
    [{ trigger: "move-leave", moverId: "pc", reactorIds: ["goblin-b"] }]);
  assert.deepEqual(movementReactionEvents({ mover: pc, path: path([1, 0], [1, 3]), others, distance }),
    [{ trigger: "move-leave", moverId: "pc", reactorIds: ["goblin-a", "goblin-b"] }], "without the pill, both");
  const sentinel = goblin("goblin-a", 0, { initiativeCard: { feats: [{ id: "sentinella" }] } });
  assert.deepEqual(movementReactionEvents({ mover, path: path([1, 0], [1, 3]), others: [sentinel], distance }), [], "not a Disengage");
  // Polearm Master's reach entered: an opportunity attack too (move-enter is Halo of Spores's 3 m, not one).
  const opportunity = (events) => events.filter((event) => event.trigger !== "move-enter");
  const polearm = goblin("goblin-a", 0, { initiativeCard: { feats: [{ id: "maestro-delle-armi-su-asta", choice: { reachMeters: 3 } }] } });
  assert.deepEqual(opportunity(movementReactionEvents({ mover, path: path([5, 0], [1, 0]), others: [polearm], distance })), []);
  assert.deepEqual(opportunity(movementReactionEvents({ mover: pc, path: path([5, 0], [1, 0]), others: [polearm], distance }))
    .map((event) => event.trigger), ["move-enter-reach"]);
  // An inactive pill (turned off by hand) spares nobody.
  const off = { ...mover, metadata: { [META]: { ...mover.metadata[META], conditions: { instances: mover.metadata[META].conditions.instances
    .map((entry) => ({ ...entry, active: false })) } } } };
  assert.deepEqual([...noOpportunityFromIds(off)], []);
});
