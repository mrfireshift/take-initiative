// Lot F2-3 of docs/STUDIO_TALENTI.md (decision M4): Maneuvering Attack. On a hit the fighter picks an ally in the attack
// console; the attack's command puts «No AdO: <target>» on the ally until the end of the turn and spends its reaction, so
// the ally's move draws no opportunity attack from the target (opportunityAttackCore.js). How far it moves stays the
// table's. Martial Adept's copy of the maneuver does the same.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { buildPcAttackMutation, pcAttackActivationOptions, pcAttackAllyCandidates, pcAttackPreview } = await import("../src/pcAttackCore.js");
const { movementReactionEvents } = await import("../src/opportunityAttackCore.js");
const { REACTION_USED_CONDITION } = await import("../src/reactionTrackerCore.js");

const META = "com.thebigpicture.initiative/meta";
const MANEUVER = "guerriero-maestro-di-battaglia-manovre-attacco-con-manovra";
const ADEPT = "talento-adepto-marziale-attacco-con-manovra";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const creature = (id, name, x, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const fighter = (card = {}) => creature("pc", "Pg", 3, { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "guerriero", level: 3,
  subclassId: "guerriero-maestro-di-battaglia" }], classFeaturesConfigured: true, enabledClassFeatureIds: [MANEUVER, "guerriero-maestro-di-battaglia-superiorita-in-combattimento"],
  abilityModifiers: { str: 3, dex: 2 }, quickActions: [sword], ...card } });
const adept = () => fighter({ characterBuild: [{ classId: "ladro", level: 4 }], classFeaturesConfigured: true, enabledClassFeatureIds: [],
  feats: [{ id: "adepto-marziale", choice: { optionIds: ["attacco-con-manovra", "attacco-preciso"] } }] });
const goblin = creature("goblin", "Goblin", 1, { attitude: "enemy" });
const mira = (meta = {}) => creature("mira", "Mira", 0, { attitude: "pc", ...meta });
const orc = creature("orc", "Orco", 5, { attitude: "enemy" });
const ownTurn = { round: 2, order: ["pc", "goblin", "mira"], current: 0 };
const items = (ally = mira()) => [fighter(), goblin, ally, orc];
const attack = (overrides = {}, activation = {}) => buildPcAttackMutation({ action: sword, sourceItem: fighter(), targetItem: goblin, outcome: "hit",
  componentAmounts: { c1: 8 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {}, tempHpItems: items(),
  activations: [{ id: MANEUVER, type: "slashing", amount: 5, allyId: "mira", ...activation }], ...overrides });
const pillsOn = (result, id) => result.operations.filter((operation) => operation.type === "condition:add" && operation.targetIds.includes(id));

test("the maneuver asks for an ally, Martial Adept's copy too; the allies are the fighter's side, not the attacker or the target", () => {
  const option = pcAttackActivationOptions({ action: sword, sourceItem: fighter(), targetItem: goblin, turnState: ownTurn, outcome: "hit" })
    .find((entry) => entry.id === MANEUVER);
  assert.equal(option.ally, true);
  assert.equal(pcAttackActivationOptions({ action: sword, sourceItem: adept(), targetItem: goblin, turnState: ownTurn, outcome: "hit" })
    .find((entry) => entry.id === ADEPT).ally, true);
  assert.deepEqual(pcAttackAllyCandidates({ sourceItem: fighter(), targetItem: goblin, items: items() }).map((item) => item.id), ["mira"]);
});

test("on a hit the ally gets «No AdO: <target>» until the end of the turn and its reaction is spent, in the attack's command", () => {
  const result = attack();
  const [pill, reaction] = pillsOn(result, "mira");
  assert.equal(pill.conditionName, "No AdO: Goblin");
  assert.deepEqual(pill.options.mechanics, { noOpportunityFrom: ["goblin"] });
  assert.deepEqual(pill.options.expiry, { mode: "turn-end", actor: "source", actorId: "pc", remaining: 1 });
  assert.equal(pill.options.sourceId, "pc");
  assert.equal(pill.options.mapVisible, false);
  assert.match(pill.options.effectDetail, /^Attacco con Manovra: Goblin non fa attacchi di opportunità a Mira fino alla fine del turno\.$/u);
  assert.equal(reaction.conditionName, REACTION_USED_CONDITION);
  assert.deepEqual([result.causality.allyNoOpportunity.allyId, result.causality.allyNoOpportunity.reaction], ["mira", true]);
  assert.ok(result.options.targetIds.includes("mira") && result.labelTargetIds.includes("mira"));
  assert.equal(result.change.requested, 13, "the superiority die still adds to the damage");
  // The ally's move: the goblin makes no opportunity attack, the orc still does.
  const moved = { ...mira(), metadata: { [META]: { ...mira().metadata[META], conditions: { instances: [{ id: pill.instanceIds.mira,
    condition: pill.conditionName, active: true, ...pill.options }] } } } };
  const others = [goblin, creature("orc", "Orco", -1, { attitude: "enemy" })];
  const distance = (a, b) => Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y)) * 1.5;
  assert.deepEqual(movementReactionEvents({ mover: moved, path: [{ x: 0, y: 0 }, { x: 0, y: 4 }], others, distance }),
    [{ trigger: "move-leave", moverId: "mira", reactorIds: ["orc"] }]);
});

test("Martial Adept's copy does the same with its d6", () => {
  const result = attack({ sourceItem: adept() }, { id: ADEPT, amount: 4 });
  assert.equal(pillsOn(result, "mira")[0].conditionName, "No AdO: Goblin");
  assert.match(pillsOn(result, "mira")[0].options.effectDetail, /^Adepto Marziale: Attacco con Manovra: /u);
});

test("no ally, out of combat, or a miss: nothing on the ally; a used reaction or an enemy as ally stops the attack", () => {
  assert.deepEqual(pillsOn(attack({}, { allyId: "" }), "mira"), [], "no ally: only the die and the note");
  assert.deepEqual(pillsOn(attack({ turnState: null }), "mira"), [], "out of combat");
  const used = mira({ conditions: { instances: [{ id: "r1", condition: REACTION_USED_CONDITION, active: true }] } });
  assert.throws(() => attack({ tempHpItems: items(used) }), /Attacco con Manovra: Mira ha già usato la reazione in questo round\./u);
  assert.throws(() => attack({}, { allyId: "orc" }), /scegli come alleato un'altra creatura dalla parte dell'attaccante/u);
  const preview = pcAttackPreview({ action: sword, sourceItem: fighter(), targetItem: goblin, outcome: "hit", amounts: { c1: 8 }, turnState: ownTurn,
    tempHpItems: items(used), activations: [{ id: MANEUVER, type: "slashing", amount: 5, allyId: "mira" }] });
  assert.equal(preview.blocker, "Attacco con Manovra: Mira ha già usato la reazione in questo round.", "said before the commit");
});
