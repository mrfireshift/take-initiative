// M1 of the class features' defenses (08/11): Purity of Body and Nature's Ward keep the Poisoned condition away, read from
// the catalog with the species' immunities, by the effects engine and by the attack console's monster actions.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { classFeatureConditionImmunities, creatureConditionImmunities } = await import("../src/damageDefensesCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { pcAttackTargetConditionImmune } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const monk = (level, extra = {}) => ({ characterBuild: [{ classId: "monaco", level }], ...extra });
const landDruid = (level) => ({ characterBuild: [{ classId: "druido", level, subclassId: "druido-circolo-della-terra" }] });
const creature = (id, initiativeCard) => ({ id, name: id, metadata: { [META]: { hp: 30, hpMax: 30, initiativeCard } } });

test("Purity of Body and Nature's Ward: Avvelenato from the 10th level, with the species' own", () => {
  assert.deepEqual(classFeatureConditionImmunities(monk(10)), ["Avvelenato"]);
  assert.deepEqual(classFeatureConditionImmunities(monk(9)), []);
  assert.deepEqual(classFeatureConditionImmunities(landDruid(10)), ["Avvelenato"]);
  assert.deepEqual(classFeatureConditionImmunities(monk(10, { classFeaturesConfigured: true, enabledClassFeatureIds: [] })), [],
    "switched off on the sheet");
  assert.deepEqual(creatureConditionImmunities(monk(10, { species: { id: "yuan-ti" } })), ["Avvelenato"], "once");
  assert.deepEqual(creatureConditionImmunities({ species: { id: "grung" } }), ["Avvelenato"]);
  assert.deepEqual(creatureConditionImmunities({}), []);
});

test("the effects engine leaves the condition out for the monk and gives it to the others", () => {
  const plan = buildEffectsMutationPlan([
    { id: "monk", name: "Monaco", conditions: [], conditionImmunities: creatureConditionImmunities(monk(12)) },
    { id: "orc", name: "Orco", conditions: [], conditionImmunities: creatureConditionImmunities({}) },
  ], [{ type: "condition:add", targetIds: ["monk", "orc"], conditionName: "Avvelenato", instanceIds: { monk: "p1", orc: "p2" }, options: {} }]);
  assert.deepEqual(plan.states.map((state) => [state.id, state.conditions.map((entry) => entry.condition)]), [["monk", []], ["orc", ["Avvelenato"]]]);
});

test("the attack console's monster actions see the same immunity, with the monster card's and the species'", () => {
  assert.equal(pcAttackTargetConditionImmune(creature("monk", monk(10)), "Avvelenato"), true);
  assert.equal(pcAttackTargetConditionImmune(creature("monk", monk(10)), "avvelenato"), true, "whatever the case");
  assert.equal(pcAttackTargetConditionImmune(creature("young", monk(9)), "Avvelenato"), false);
  assert.equal(pcAttackTargetConditionImmune(creature("yt", { species: { id: "yuan-ti" } }), "Avvelenato"), true);
  assert.equal(pcAttackTargetConditionImmune(creature("golem", { monster: { source: "manual", conditionImmunities: ["avvelenato", "affascinato"] } }), "Affascinato"), true);
  assert.equal(pcAttackTargetConditionImmune(creature("monk", monk(20)), "Spaventato"), false);
  assert.equal(pcAttackTargetConditionImmune(creature("monk", monk(20)), ""), false);
});
