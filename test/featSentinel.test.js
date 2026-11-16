// Lot F6-2 of docs/STUDIO_TALENTI.md (decisions K1, K2): Sentinel. The Disengage does not keep its opportunity attacks
// out (Zephyr Strike, which is not a Disengage, still does); the speed 0 is an activation of the attack console on a melee
// hit made off the attacker's turn, its pill until the end of the target's turn; the reaction prompt offers the strike
// when a hostile creature within 1.5 m attacks another, hit or missed, unless that one has the feat too. The expectations
// are read from the PHB 2014 text, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { movementReactionEvents } = await import("../src/opportunityAttackCore.js");
const { buildPcAttackMutation, pcAttackActivationOptions } = await import("../src/pcAttackCore.js");
const { CLASS_FEATURE_BY_ID } = await import("../src/classFeatureCatalog.js");
const { classFeatureConditionInstancesForActivation } = await import("../src/classFeatureCore.js");
const { reactionTriggerEntry } = await import("../src/reactionTriggerCatalog.js");
const { reactionPromptCandidates, reactionPromptEffectText } = await import("../src/reactionPromptView.js");
const { FEATS } = await import("../src/featCatalog.js");

const META = "com.thebigpicture.initiative/meta";
// Positions in meters along a line: the distance is their difference.
const creature = (id, name, meta = {}, x = 0) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const distance = (a, b) => Math.abs(a.position.x - b.position.x);
const sheet = (feats) => ({ characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { str: 3, dex: 1 }, feats: feats.map((id) => ({ id })) });
const pills = (...names) => ({ conditions: { version: 2, instances: names.map((condition) => ({ id: condition, condition, active: true })) } });

test("the Disengage does not keep Sentinel's opportunity attack out; Zephyr Strike does", () => {
  const plain = creature("plain", "Bram", { attitude: "pc" });
  const sentinel = creature("guard", "Guardia", { attitude: "pc", initiativeCard: sheet(["sentinella"]) });
  const leaving = (moverMeta) => movementReactionEvents({ mover: creature("orc", "Orco", { attitude: "enemy", ...moverMeta }, 1.5),
    path: [{ x: 1.5, y: 0 }, { x: 6, y: 0 }], others: [plain, sentinel], distance });
  assert.deepEqual(leaving({}), [{ trigger: "move-leave", moverId: "orc", reactorIds: ["plain", "guard"] }]);
  assert.deepEqual(leaving(pills("Disimpegno")), [{ trigger: "move-leave", moverId: "orc", reactorIds: ["guard"] }],
    "only Sentinel reacts to a Disengage");
  assert.deepEqual(leaving(pills("Movimento: no AdO")), [], "Zephyr Strike's movement provokes nothing");
});

const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8+1" }] };
const SPEED = "talento-sentinella-velocita-zero";
// The ogre's turn: the guard attacks with its reaction (an opportunity attack); on its own turn it cannot.
const ogreTurn = { round: 2, order: ["guard", "ogre"], current: 1 };
const guardTurn = { round: 2, order: ["guard", "ogre"], current: 0 };
const option = (sourceItem, overrides = {}) => pcAttackActivationOptions({ action: sword, sourceItem, targetItem: creature("ogre", "Ogre"),
  turnState: ogreTurn, outcome: "hit", ...overrides }).find((entry) => entry.id === SPEED);

test("the speed 0: an activation on a melee hit made off the attacker's turn, which the GM ticks", () => {
  const guard = creature("guard", "Guardia", { attitude: "pc", initiativeCard: { ...sheet(["sentinella"]), quickActions: [sword, bow] } });
  const speed = option(guard);
  assert.deepEqual([speed.label, speed.available, speed.effect, speed.hint],
    ["Sentinella: velocità 0", true, { kind: "pill", label: "Velocità 0", self: false }, "Solo con un attacco di opportunità."]);
  assert.equal(option(guard, { turnState: guardTurn }).reason, "Solo come reazione, fuori dal proprio turno.");
  assert.equal(option(guard, { action: bow }).reason, "Solo per gli attacchi in mischia.");
  assert.equal(option(guard, { outcome: "miss" }).reason, "Solo se l'attacco colpisce.");
  assert.equal(option(creature("pc", "Pg", { attitude: "pc", initiativeCard: sheet([]) })), undefined, "without the feat, none");
  const result = buildPcAttackMutation({ action: sword, sourceItem: guard, targetItem: creature("ogre", "Ogre"), outcome: "hit",
    componentAmounts: { c1: 8 }, attackInstanceId: "a1", turnState: ogreTurn, expectedDefenses: {}, activations: [{ id: SPEED }] });
  assert.ok(result.labelTargetIds.includes("ogre"), "the pill goes on the target, in the attack's command");
});

test("the speed 0's pill: speed set to 0 until the end of the target's turn in progress", () => {
  const record = CLASS_FEATURE_BY_ID.get(SPEED);
  assert.deepEqual([record.effectPlan.mechanics, record.duration.timing], [{ movement: { setMeters: 0 } }, "target-turn-end"]);
  const [pill] = classFeatureConditionInstancesForActivation(record, { instanceId: "i1", sourceId: "guard", targetIds: ["ogre"], startedRound: 2 },
    "Guardia");
  assert.deepEqual([pill.targetId, pill.condition, pill.displayLabel, pill.mechanics], ["ogre", "Velocità 0", "Velocità 0 · Sentinella",
    { movement: { setMeters: 0 } }]);
  // The Boss console's own expiry for a target's turn (actor "target"): the end of the ogre's turn, the one the attack
  // happened in, not the guard's.
  assert.deepEqual(pill.expiry, { mode: "turn-end", actor: "target", actorId: "ogre", remaining: 1 });
});

test("the strike for another: a hostile creature within 1.5 m attacks another, hit or missed", () => {
  const orc = creature("orc", "Orco", { attitude: "enemy" }, 0);
  const guard = creature("guard", "Guardia", { attitude: "pc", initiativeCard: sheet(["sentinella"]) }, 1.5);
  const ally = creature("ally", "Bram", { attitude: "pc" }, 1.5);
  const state = { round: 1, current: 0, order: ["orc", "guard", "ally"] };
  const attack = (trigger, targetId, extra = {}) => ({ trigger, attackerId: "orc", targetIds: [targetId], range: "melee", attackRoll: true,
    damageTypes: ["slashing"], ...extra });
  const offered = (events, items = [orc, guard, ally]) => reactionPromptCandidates({ event: events, items, state, distance }, "after")
    .map((candidate) => [candidate.reactorId, candidate.reactionId, candidate.flow, candidate.targetIds, candidate.protectedId]);
  const strike = ["guard", "sentinel-strike", "off-turn-attack", ["orc"], "ally"];
  assert.deepEqual(offered([attack("hit", "ally"), attack("damage", "ally")]), [strike]);
  // The row says whom the strike goes against: the attacker, not the creature attacked.
  const [row] = reactionPromptCandidates({ event: [attack("miss", "ally")], items: [orc, guard, ally], state, distance }, "after");
  assert.equal(reactionPromptEffectText(row, [orc, guard, ally]), "Attacco in mischia contro Orco");
  assert.deepEqual(offered([attack("miss", "ally")]), [strike]);
  assert.equal(reactionTriggerEntry("sentinel-strike").timing, "after", "after the attack, with Registra");
  assert.deepEqual(offered([attack("hit", "guard")]), [], "not when it is attacked itself");
  assert.deepEqual(offered([attack("damage", "ally", { attackRoll: false })]), [], "not a save");
  assert.deepEqual(offered([attack("hit", "ally")], [orc, creature("guard", "Guardia", { attitude: "pc", initiativeCard: sheet(["sentinella"]) }, 3), ally]),
    [], "beyond 1.5 m");
  const sentinelAlly = creature("ally", "Bram", { attitude: "pc", initiativeCard: sheet(["sentinella"]) }, 1.5);
  assert.deepEqual(offered([attack("hit", "ally")], [orc, guard, sentinelAlly]), [], "the creature attacked has the feat too");
});

test("Sentinel's line says where each part is", () => {
  const line = FEATS.find((entry) => entry.id === "sentinella").plugin;
  assert.match(line, /^Il Disimpegno non ferma i suoi attacchi di opportunità\. Avviso quando una creatura entro 1,5 m attacca un altro\./u);
  assert.match(line, /Nella console, fuori turno, «velocità 0» sul bersaglio colpito\.$/u);
});
