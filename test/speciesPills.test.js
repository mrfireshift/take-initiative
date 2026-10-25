// The species traits that put a one-turn pill: Hidden Step (invisible, ended by an attack from the console), Grovel,
// Cower and Beg and Draconic Cry (advantage for the allies), Fey Gift (the Help action and its 3rd-level benefits).
import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES_FEATURES } from "../src/speciesTraitCore.js";
import { classFeatureChoiceOptions, classFeatureConditionInstancesForActivation, classFeatureRequiresActivationChoice } from "../src/classFeatureCore.js";
import { buildPcAttackMutation, pcAttackLinkEnds } from "../src/pcAttackCore.js";

const META = "com.thebigpicture.initiative/meta";
const feature = (id) => SPECIES_FEATURES.find((entry) => entry.id === id);
const pills = (id, targetIds, choiceId = "") => classFeatureConditionInstancesForActivation(feature(id),
  { instanceId: "i1", sourceId: "pc", targetIds, startedRound: 2, ...(choiceId ? { choiceId } : {}) }, "Pg")
  .map((pill) => [pill.targetId, pill.displayLabel || pill.condition, pill.expiry.mode]);

test("Hidden Step and Grovel: a pill on the character itself, until its next turn", () => {
  for (const id of ["specie-firbolg-passo-nascosto", "specie-firbolg-multiverso-passo-nascosto"]) {
    assert.deepEqual([feature(id).runtimeSupport.adapter, feature(id).targetMode, feature(id).endsOnAttack], ["condition", "self", true]);
    assert.deepEqual(pills(id, ["pc"]), [["pc", "Invisibile · Passo nascosto", "turn-start"]]);
  }
  assert.deepEqual(pills("specie-coboldo-strisciare-piagnucolare-implorare", ["pc"]), [["pc", "Strisciare, piagnucolare e implorare", "turn-end"]]);
});

test("Draconic Cry: a pill on the enemies selected within 3 m, until the start of the kobold's next turn", () => {
  const cry = feature("specie-coboldo-multiverso-grido-draconico");
  assert.deepEqual([cry.targetMode, cry.targeting.rangeMeters, cry.targeting.maxTargets, cry.speciesSave], ["selection", 3, null, undefined]);
  assert.deepEqual(pills("specie-coboldo-multiverso-grido-draconico", ["orc", "gob"]), [["orc", "Grido draconico", "turn-start"], ["gob", "Grido draconico", "turn-start"]]);
});

test("Fey Gift: the help, then a benefit chosen at each use", () => {
  const gift = feature("specie-hobgoblin-multiverso-dono-fatato");
  assert.equal(classFeatureRequiresActivationChoice(gift), true);
  assert.deepEqual(classFeatureChoiceOptions(gift).map((option) => option.label),
    ["Aiutare", "Ospitalità (dal 3° livello)", "Passaggio (dal 3° livello)", "Dispetto (dal 3° livello)"]);
  assert.deepEqual(pills("specie-hobgoblin-multiverso-dono-fatato", ["ally"], "aiutare"), [["ally", "Aiutato", "turn-start"]]);
  assert.deepEqual(pills("specie-hobgoblin-multiverso-dono-fatato", ["ally"], "dispetto"), [["ally", "Aiutato · Dispetto", "turn-start"]]);
  assert.deepEqual(pills("specie-hobgoblin-multiverso-dono-fatato", ["ally", "pc"], "passaggio"),
    [["ally", "Passaggio · +3 m", "turn-start"], ["pc", "Passaggio · +3 m", "turn-start"]], "the hobgoblin too (added by the runtime)");
  assert.deepEqual(gift.choiceOptions.find((option) => option.id === "ospitalita").temporaryHp, { amount: "pb", bonusDie: "1d6" });
});

test("Hidden Step ends when the firbolg attacks from the console, as Invisibility does", () => {
  const hidden = { id: "pill-1", condition: "Invisibile", effectId: "specie-firbolg-passo-nascosto", type: "class-feature", active: true, sourceId: "pc" };
  const other = { id: "pill-2", condition: "Invisibile", effectId: "other-effect", active: true };
  const firbolg = { id: "pc", name: "Pg", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true,
    conditions: { version: 2, instances: [hidden, other] }, initiativeCard: { characterBuild: [{ classId: "druido", level: 5 }], species: { id: "firbolg" } } } } };
  const ogre = { id: "ogre", name: "Ogre", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true } } };
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: firbolg, targetItem: ogre }).map((end) => [end.instanceId, end.featureId]),
    [["pill-1", "specie-firbolg-passo-nascosto"]], "only Hidden Step's pill, not another Invisibile");
  const result = buildPcAttackMutation({ action: { id: "staff", label: "Bastone", kind: "attack", range: "melee", components: [{ type: "bludgeoning", formula: "1d6" }] },
    sourceItem: firbolg, targetItem: ogre, outcome: "hit", componentAmounts: { c1: 4 }, attackInstanceId: "a1", turnState: null, expectedDefenses: {} });
  assert.ok(result.operations.some((operation) => operation.type === "condition:remove-instances"
    && operation.removals.some((removal) => removal.instanceId === "pill-1")), JSON.stringify(result.operations.map((operation) => operation.type)));
});
