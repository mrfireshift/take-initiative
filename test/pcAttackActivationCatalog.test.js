import assert from "node:assert/strict";
import test from "node:test";
import {
  PC_ATTACK_ACTIVATIONS, getPcAttackActivation, pcAttackActivationCosts, pcAttackActivationDealsDamage, pcAttackActivationDice,
  pcAttackActivationEffect, pcAttackActivationLabel, pcAttackActivationLimitKey, pcAttackActivationSaveDC, pcAttackActivationsForCard,
} from "../src/pcAttackActivationCatalog.js";
import { getClassFeatureDefinition, getClassFeatureResourcePool } from "../src/classFeatureCatalog.js";
import { PC_ATTACK_RIDERS } from "../src/pcAttackRiderCatalog.js";

const card = (classId, level, abilityModifiers = { str: 4, dex: 2, con: 3, int: 1, wis: 3, cha: 4 }) => ({
  characterBuild: [{ classId, level }], abilityModifiers,
});

test("every activation is a class feature of the catalog, with a pill when its effect is a pill", () => {
  const ids = PC_ATTACK_ACTIVATIONS.map((activation) => activation.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate");
  for (const activation of PC_ATTACK_ACTIVATIONS) {
    const feature = getClassFeatureDefinition(activation.id);
    assert.ok(feature, activation.id);
    assert.equal(PC_ATTACK_RIDERS.some((rider) => rider.id === activation.id), false, `${activation.id} is not also a rider`);
    if (activation.effect?.pill) {
      // A pill comes from the class feature's own activation: a condition adapter with its effect plan.
      assert.equal(feature.runtimeSupport?.adapter, "condition", activation.id);
      assert.ok(feature.effectPlan?.conditionName, activation.id);
    }
    for (const cost of pcAttackActivationCosts(activation)) assert.ok(getClassFeatureResourcePool(cost.poolId), `${activation.id}: ${cost.poolId}`);
    if (activation.requires?.activeFeatureId) assert.ok(getClassFeatureDefinition(activation.requires.activeFeatureId), activation.id);
  }
});

test("the 3A, 3B and 3C scope: every class with an on-hit activation", () => {
  const classes = new Set(PC_ATTACK_ACTIVATIONS.map((activation) => getClassFeatureDefinition(activation.id).classId));
  assert.deepEqual([...classes].sort(), ["barbaro", "bardo", "chierico", "guerriero", "ladro", "monaco", "paladino", "warlock"]);
  assert.equal(PC_ATTACK_ACTIVATIONS.filter((activation) => activation.group === "manovra").length, 12);
  assert.equal(PC_ATTACK_ACTIVATIONS.filter((activation) => activation.group === "tiro-arcano").length, 8);
});

test("dice by level: superiority and bardic dice from their pools, martial arts and psionic dice from the curated tables", () => {
  const minaccioso = getPcAttackActivation("guerriero-maestro-di-battaglia-manovre-attacco-minaccioso");
  assert.deepEqual([3, 10, 18].map((level) => pcAttackActivationDice(minaccioso, card("guerriero", level))), ["1d8", "1d10", "1d12"]);
  const mano = getPcAttackActivation("monaco-via-della-misericordia-mano-del-dolore");
  assert.deepEqual([3, 5, 11, 17].map((level) => pcAttackActivationDice(mano, card("monaco", level))), ["1d4+3", "1d6+3", "1d8+3", "1d10+3"]);
  assert.equal(pcAttackActivationDice(mano, { characterBuild: [{ classId: "monaco", level: 5 }] }), null, "Wisdom missing: no dice shown");
  assert.equal(pcAttackActivationDealsDamage(mano, { characterBuild: [{ classId: "monaco", level: 5 }] }), true, "the damage stays");
  const psionic = getPcAttackActivation("guerriero-guerriero-psionico-potere-psionico-colpo-psionico");
  assert.deepEqual([3, 5, 11, 17].map((level) => pcAttackActivationDice(psionic, card("guerriero", level))), ["1d6+1", "1d8+1", "1d10+1", "1d12+1"]);
  const blades = getPcAttackActivation("bardo-collegio-dei-sussurri-lame-psichiche");
  assert.deepEqual([3, 5, 10, 15].map((level) => pcAttackActivationDice(blades, card("bardo", level))), ["2d6", "3d6", "5d6", "8d6"]);
  const difensivo = getPcAttackActivation("bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo");
  assert.equal(pcAttackActivationDice(difensivo, card("bardo", 5)), "1d8");
  const banishing = getPcAttackActivation("guerriero-arciere-arcano-tiro-arcano-freccia-esiliante");
  assert.deepEqual([pcAttackActivationDealsDamage(banishing, card("guerriero", 10)), pcAttackActivationDice(banishing, card("guerriero", 18))], [false, "2d6"]);
  assert.equal(pcAttackActivationDice(getPcAttackActivation("guerriero-arciere-arcano-tiro-arcano-freccia-ammaliante"), card("guerriero", 18)), "4d6");
});

test("save DCs: maneuvers use the better of Strength and Dexterity; the others their own ability", () => {
  const minaccioso = getPcAttackActivation("guerriero-maestro-di-battaglia-manovre-attacco-minaccioso");
  assert.equal(pcAttackActivationSaveDC(minaccioso, card("guerriero", 10, { str: 1, dex: 5 })), 17);
  assert.equal(pcAttackActivationSaveDC(getPcAttackActivation("monaco-colpo-stordente"), card("monaco", 5)), 14);
  assert.equal(pcAttackActivationSaveDC(getPcAttackActivation("guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-fuoco"), card("guerriero", 3)), 13);
  assert.equal(pcAttackActivationSaveDC(minaccioso, { characterBuild: [{ classId: "guerriero", level: 10 }] }), null, "no modifiers: no DC");
});

test("effects, labels and limit keys", () => {
  assert.deepEqual(pcAttackActivationEffect(getPcAttackActivation("monaco-colpo-stordente")), { kind: "pill", label: "Stordito", self: false });
  assert.deepEqual(pcAttackActivationEffect(getPcAttackActivation("guerriero-maestro-di-battaglia-manovre-attacco-sbilanciante")),
    { kind: "condition", label: "Prono" });
  assert.equal(pcAttackActivationEffect(getPcAttackActivation("bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo")).self, true);
  assert.equal(pcAttackActivationEffect(getPcAttackActivation("warlock-suppliche-occulte-deflagrazione-respingente")).kind, "note");
  assert.equal(pcAttackActivationLabel(getPcAttackActivation("monaco-via-del-kensei-tutt-uno-con-la-lama")), "Colpo Abile");
  // One Arcane Shot per turn whatever the arrow: the arrows share the group's key.
  assert.equal(pcAttackActivationLimitKey(getPcAttackActivation("guerriero-arciere-arcano-tiro-arcano-freccia-afferrante")), "group:tiro-arcano");
  assert.equal(pcAttackActivationLimitKey(getPcAttackActivation("monaco-via-della-misericordia-mano-del-dolore")), "monaco-via-della-misericordia-mano-del-dolore");
});

test("only the activations whose class feature is enabled on the card", () => {
  const enabled = { characterBuild: [{ classId: "monaco", level: 5 }], classFeaturesConfigured: true, enabledClassFeatureIds: ["monaco-colpo-stordente"] };
  assert.deepEqual(pcAttackActivationsForCard(enabled).map((activation) => activation.id), ["monaco-colpo-stordente"]);
});

test("Giant's Might and Foe Slayer are damage riders, not activations", () => {
  const ids = PC_ATTACK_RIDERS.map((rider) => rider.id);
  assert.ok(ids.includes("guerriero-cavaliere-runico-potenza-del-gigante"));
  assert.ok(ids.includes("ranger-revised-sterminatore-di-nemici"));
});

test("3B-1: a second creature's die, half the Sneak Attack dice, bonuses to the attack roll", async () => {
  const { pcAttackActivationRollBonus } = await import("../src/pcAttackActivationCatalog.js");
  const wails = getPcAttackActivation("ladro-fantasma-lamenti-dalla-tomba");
  assert.deepEqual([3, 5, 9, 11].map((level) => pcAttackActivationDice(wails, card("ladro", level))), ["1d6", "2d6", "3d6", "3d6"]);
  assert.equal(getPcAttackActivation("guerriero-maestro-di-battaglia-manovre-attacco-con-spazzata").secondary.targetDamage, false);
  assert.equal(getPcAttackActivation("bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-tagliente").secondary.targetDamage, true);
  const precise = getPcAttackActivation("guerriero-maestro-di-battaglia-manovre-attacco-preciso");
  assert.deepEqual([pcAttackActivationDealsDamage(precise, card("guerriero", 10)), pcAttackActivationRollBonus(precise, card("guerriero", 10))], [false, "+1d10"]);
  assert.equal(pcAttackActivationRollBonus(getPcAttackActivation("paladino-giuramento-di-conquista-incanalare-divinita-colpo-guidato"), card("paladino", 7)), "+10");
  const riders = PC_ATTACK_RIDERS.map((rider) => rider.id);
  assert.ok(riders.includes("ranger-cacciatore-delle-tenebre-imboscata-terrificante"));
  assert.ok(riders.includes("barbaro-cammino-della-bestia-chiamata-alla-caccia"));
});

test("3B-2: Open Hand Technique's three effects, Inspiring Smite's total, Riposte as a reaction", () => {
  const openHand = getPcAttackActivation("monaco-via-della-mano-aperta-tecnica-della-mano-aperta");
  assert.deepEqual(openHand.choices.map((choice) => [choice.id, choice.save || null]), [["prone", "dex"], ["push", "str"], ["no-reactions", null]]);
  assert.deepEqual(pcAttackActivationEffect(openHand, openHand.choices[2].effect),
    { kind: "condition", label: "Niente reazioni", expiry: { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" } });
  const smite = getPcAttackActivation("paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice");
  assert.deepEqual([3, 7, 15].map((level) => pcAttackActivationDice(smite, card("paladino", level))), ["2d8+3", "2d8+7", "2d8+15"]);
  assert.equal(getPcAttackActivation("guerriero-maestro-di-battaglia-manovre-replica").requires.reaction, true);
  assert.equal(getPcAttackActivation("monaco-via-della-mano-aperta-palmo-tremante").effect.pill, true);
});
