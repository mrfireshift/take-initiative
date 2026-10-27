// The last species effects: a species immune to the poisoned condition, the natural weapons added to the attacks, the
// dhampir's Vampiric Bite (the piercing damage dealt heals it, or becomes a bonus pill).
import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES_FEATURES } from "../src/speciesTraitCore.js";
import { speciesConditionImmunities } from "../src/speciesConditionImmunityCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { speciesNaturalWeaponAction, speciesNaturalWeaponState } from "../src/speciesNaturalWeaponCore.js";
import { buildPcAttackMutation, pcAttackActivationOptions } from "../src/pcAttackCore.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";

const META = "com.thebigpicture.initiative/meta";
const feature = (id) => SPECIES_FEATURES.find((entry) => entry.id === id);

test("Volo's yuan-ti and the grung are never poisoned: the engine leaves the condition out", () => {
  assert.deepEqual(speciesConditionImmunities({ id: "yuan-ti" }), ["Avvelenato"]);
  assert.deepEqual(speciesConditionImmunities({ id: "grung" }), ["Avvelenato"]);
  assert.deepEqual(speciesConditionImmunities({ id: "yuan-ti-multiverso" }), [], "Mostri del Multiverso: advantage only");
  const plan = buildEffectsMutationPlan([{ id: "yt", name: "Yt", conditions: [], conditionImmunities: ["Avvelenato"] }, { id: "orc", name: "Orco", conditions: [] }],
    [{ type: "condition:add", targetIds: ["yt", "orc"], conditionName: "Avvelenato", instanceIds: { yt: "p1", orc: "p2" }, options: {} },
      { type: "condition:add", targetIds: ["yt"], conditionName: "Prono", instanceIds: { yt: "p3" }, options: {} }]);
  assert.deepEqual(plan.states.map((state) => [state.id, state.conditions.map((entry) => entry.condition)]), [["yt", ["Prono"]], ["orc", ["Avvelenato"]]]);
});

test("the natural weapons: 19 traits; the attack filled from the trait with the card's modifier, added once", () => {
  assert.equal(SPECIES_FEATURES.filter((entry) => entry.naturalWeapon).length, 19);
  const claws = feature("specie-tabaxi-multiverso-artigli-felini");
  assert.deepEqual(speciesNaturalWeaponAction(claws, { abilityModifiers: { str: 3 } }), { version: 2, id: "species-weapon-specie-tabaxi-multiverso-artigli-felini",
    label: "Artigli", kind: "attack", targetMode: "selection", range: "melee", components: [{ id: "c1", type: "slashing", formula: "1d6+3" }] });
  assert.equal(speciesNaturalWeaponAction(feature("specie-dhampir-morso-vampirico"), { abilityModifiers: { str: 3, con: -1 } }).components[0].formula, "1d4-1",
    "the dhampir's bite adds Constitution");
  assert.equal(speciesNaturalWeaponAction(claws, {}).components[0].formula, "1d6", "no modifier on the card");
  const added = { quickActions: [speciesNaturalWeaponAction(claws, {})] };
  assert.deepEqual(speciesNaturalWeaponState(claws, added), { present: true, full: false });
  const full = { quickActions: Array.from({ length: 8 }, (_, index) => ({ id: `a${index}`, label: "A", kind: "attack", components: [{ type: "slashing" }] })) };
  assert.equal(speciesNaturalWeaponState(claws, full).full, true);
});

test("Vampiric Bite: the piercing damage dealt heals the dhampir, or becomes its bonus pill; the use is spent", () => {
  const bite = speciesNaturalWeaponAction(feature("specie-dhampir-morso-vampirico"), { abilityModifiers: { con: 2 } });
  const dhampir = { id: "dh", name: "Mira", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 40, inInitiative: true,
    initiativeCard: { characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { con: 2 }, species: { id: "dhampir" }, quickActions: [bite] } } } };
  const orc = (defenses = null) => ({ id: "orc", name: "Orco", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true,
    ...(defenses ? { initiativeCard: { damageDefenses: defenses } } : {}) } } });
  const option = pcAttackActivationOptions({ action: bite, sourceItem: dhampir, targetItem: orc(), outcome: "hit" })
    .find((entry) => entry.id === "specie-dhampir-morso-vampirico-potenziamento");
  assert.deepEqual([option.available, option.choices.map((choice) => choice.effect.kind)], [true, ["caster-heal", "self-bonus"]]);
  const attack = (choice, target = orc(), expectedDefenses = {}) => buildPcAttackMutation({ action: bite, sourceItem: dhampir, targetItem: target, outcome: "hit",
    componentAmounts: { c1: 6 }, attackInstanceId: `bite-${choice}`, turnState: null, expectedDefenses,
    activations: [{ id: "specie-dhampir-morso-vampirico-potenziamento", choice }] });
  const heal = attack("cura");
  assert.deepEqual([heal.casterHealChange.change.hp, heal.casterHealChange.change.afterHP], [20, 26]);
  assert.equal(heal.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value.resources["specie-dhampir-morso-vampirico-usi"].current, 2);
  const resistant = { resistances: ["piercing"], immunities: [], vulnerabilities: [] };
  const halved = attack("cura", orc(resistant), resistant);
  assert.equal(halved.casterHealChange.change.afterHP, 23, "the damage dealt after the resistance: 3");
  const bonus = attack("bonus");
  assert.equal(bonus.casterHealChange, undefined);
  const pill = bonus.operations.find((operation) => operation.type === "condition:add" && operation.targetIds[0] === "dh");
  assert.equal(pill.options.displayLabel, "Bonus del morso +6");
  assert.ok(bonus.labelTargetIds.includes("dh"));
});
