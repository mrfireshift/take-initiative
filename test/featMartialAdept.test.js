// Lot F9-3 of docs/STUDIO_TALENTI.md (decision D14): Martial Adept. Two maneuvers chosen on the sheet become cards of the
// feat with its own superiority die, a d6 back with a short or long rest: on a hit in the attack console with the d6 and
// the save DC of Strength or Dexterity, Parry and Riposte in the reaction prompts, the others from their cards. The
// expectations are read from the Player's Handbook's text, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { featBorrowedCandidates, getClassFeatureDefinition, getClassFeatureResourcePool } = await import("../src/classFeatureCatalog.js");
const { buildPcAttackMutation, pcAttackActivationOptions } = await import("../src/pcAttackCore.js");
const { reactionPromptCandidates } = await import("../src/reactionPromptView.js");
const { parseCharacterSheetImport } = await import("../src/characterSheetImportCore.js");
const { FEATS } = await import("../src/featCatalog.js");

const META = "com.thebigpicture.initiative/meta";
const DIE = "talento-adepto-marziale-dado-usi";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const adept = (optionIds, extra = {}) => creature("pc", "Pg", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "ladro", level: 4 }],
  abilityModifiers: { str: 3, dex: 2 }, quickActions: [sword], classFeaturesConfigured: true, enabledClassFeatureIds: [],
  feats: [{ id: "adepto-marziale", choice: { optionIds } }] }, ...extra });
const ogre = creature("ogre", "Ogre", { attitude: "enemy" });
const ownTurn = { round: 2, order: ["pc", "ogre"], current: 0 };
const options = (sourceItem, outcome = "hit") => pcAttackActivationOptions({ action: sword, sourceItem, targetItem: ogre, turnState: ownTurn, outcome })
  .filter((option) => option.id.startsWith("talento-adepto-marziale-"));

test("two of the sixteen maneuvers, with one d6 of the feat, back with a short or long rest", () => {
  assert.equal(featBorrowedCandidates("adepto-marziale").length, 16);
  const pool = getClassFeatureResourcePool(DIE);
  assert.deepEqual([pool.capacity, pool.refresh.map((entry) => entry.event)], [{ type: "fixed", value: 1 }, ["riposo_breve", "riposo_lungo"]]);
  const menacing = getClassFeatureDefinition("talento-adepto-marziale-attacco-minaccioso");
  assert.deepEqual([menacing.resourceCosts, menacing.effectPlan.conditionName, menacing.targetMode], [[{ poolId: DIE, amount: 1 }], "Spaventato", "selection"]);
  assert.equal(getClassFeatureDefinition("talento-adepto-marziale-parata").activation.primary, "reazione");
});

test("on a hit in the console: the chosen maneuvers only, with the d6 and the DC of Strength or Dexterity", () => {
  const listed = options(adept(["attacco-minaccioso", "attacco-preciso"]));
  assert.deepEqual(listed.map((option) => option.id), ["talento-adepto-marziale-attacco-minaccioso", "talento-adepto-marziale-attacco-preciso"]);
  const [menacing, precision] = listed;
  assert.deepEqual([menacing.available, menacing.dice, menacing.save, menacing.effect.label], [true, "1d6", { ability: "wis", label: "Saggezza", dc: 13 }, "Spaventato"]);
  assert.deepEqual([precision.rollBonus, precision.dice], ["+1d6", null]);
  assert.deepEqual(menacing.resources.map((entry) => [entry.poolId, entry.current]), [[DIE, 1]]);
  const spent = adept(["attacco-minaccioso"], { classFeatureState: { resources: { [DIE]: { current: 0 } } } });
  assert.match(options(spent)[0].reason, /nessun uso rimasto/u);
  // The attack with the maneuver: the d6 in the damage, the pill on the target, in one command.
  const result = buildPcAttackMutation({ action: sword, sourceItem: adept(["attacco-minaccioso"]), targetItem: ogre, outcome: "hit",
    componentAmounts: { c1: 8 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {},
    activations: [{ id: "talento-adepto-marziale-attacco-minaccioso", type: "slashing", amount: 4, saveOutcome: "failed" }] });
  assert.equal(result.change.requested, 12);
  assert.ok(result.labelTargetIds.includes("ogre"));
});

test("a Battle Master keeps the class's die on its own maneuvers", () => {
  const master = creature("pc", "Pg", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "guerriero", level: 3, subclassId: "guerriero-maestro-di-battaglia" }],
    abilityModifiers: { str: 3 }, quickActions: [sword], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre", "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso"] } });
  const own = pcAttackActivationOptions({ action: sword, sourceItem: master, targetItem: ogre, turnState: ownTurn, outcome: "hit" })
    .find((option) => option.id === "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso");
  assert.equal(own.dice, "1d8");
});

test("Parry and Riposte in the reaction prompts, with the feat's die", () => {
  const reactor = adept(["parata", "replica"]);
  const attacker = creature("orc", "Orco", { attitude: "enemy" });
  const state = { round: 1, current: 0, order: ["orc", "pc"] };
  const event = (trigger) => ({ trigger, attackerId: "orc", targetIds: ["pc"], range: "melee", attackRoll: true, damageTypes: ["slashing"] });
  assert.deepEqual(reactionPromptCandidates({ event: [event("damage")], items: [attacker, reactor], state }, "before")
    .map((row) => [row.reactionId, row.featureId]), [["parry-maneuver", "talento-adepto-marziale-parata"]]);
  assert.deepEqual(reactionPromptCandidates({ event: [event("miss")], items: [attacker, reactor], state }, "after")
    .map((row) => [row.reactionId, row.featureId]), [["riposte", "talento-adepto-marziale-replica"]]);
});

test("the sheet's import reads the maneuvers by name; the feat's line", () => {
  const result = parseCharacterSheetImport(JSON.stringify({ name: "Pg", feats: [{ name: "Martial Adept", maneuvers: ["Parata", "Attacco Preciso"] }] }));
  assert.deepEqual([result.sections.feats, result.unresolved], [[{ id: "adepto-marziale", choice: { optionIds: ["parata", "attacco-preciso"] } }], []]);
  assert.match(FEATS.find((entry) => entry.id === "adepto-marziale").plugin, /^Le due manovre scelte nei Talenti della scheda sono card di questo talento, con il suo dado d6/u);
});
