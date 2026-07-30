import test from "node:test";
import assert from "node:assert/strict";
import { buildSpellCastAutomationPlan } from "../src/spellCastAutomationCore.js";
import {
  getAreaSaveAutomation,
  getProposedConditions,
  getAreaSaveRuleChoices,
  getAreaSaveSpellOptions,
  getSpellDefinition,
  getSpellEffectChoices,
  getSpellEffects,
} from "../src/spells-srd.js";

function planFor(spellId, choice = "") {
  const spell = getSpellDefinition(spellId);
  return buildSpellCastAutomationPlan({
    proposedConditions: getProposedConditions(spell, choice),
    proposedEffects: getSpellEffects(spell, choice),
    saveAutomation: getAreaSaveAutomation(spell, choice),
    applyAutomatedConditions: true,
    hasEffectChoices: getSpellEffectChoices(spell).length > 0,
  });
}

test("il cast da Spells eredita solo le condizioni che si risolvono al lancio", () => {
  const entangle = planFor("entangle");
  const tentacles = planFor("black-tentacles");
  const confusion = planFor("confusion");

  assert.deepEqual(
    entangle.conditions.map((condition) =>
      typeof condition === "string" ? condition : condition.name
    ),
    ["Trattenuto"],
  );
  assert.deepEqual(entangle.conditions[0].options.expiry, { mode: "concentration" });
  assert.deepEqual(tentacles.conditions, []);
  assert.equal(tentacles.usedSaveAutomation, false);
  assert.equal(confusion.conditions[0].options.effectId, "confusion-random-turn");
  assert.equal(confusion.conditions[0].options.effectKind, "debuff");
});

test("gli effetti generali già coperti dalle regole TS producono una sola pill", () => {
  for (const spellId of [
    "faerie-fire",
    "xanathar-scossa-sinaptica",
    "tasha-miscela-caustica-di-tasha",
  ]) {
    const plan = planFor(spellId);
    assert.equal(plan.usedSaveAutomation, true, spellId);
    assert.equal(plan.conditions.length, 1, spellId);
    assert.equal(plan.effects.length, 0, spellId);
  }
});

test("Pirotecnica distingue Fuochi d'Artificio dalla nube di fumo", () => {
  const fireworks = planFor("xanathar-pirotecnica", "fireworks");
  const smoke = planFor("xanathar-pirotecnica", "smoke");

  assert.equal(fireworks.usedSaveAutomation, true);
  assert.equal(fireworks.conditions[0].name, "Accecato");
  assert.equal(fireworks.effects.length, 0);

  assert.equal(smoke.usedSaveAutomation, false);
  assert.equal(smoke.conditions.length, 0);
  assert.equal(smoke.effects[0].id, "heavy-smoke");
});

test("un'attivazione secondaria non sostituisce il normale cast da Spells", () => {
  const holyWeapon = planFor("xanathar-arma-sacra");

  assert.equal(holyWeapon.usedSaveAutomation, false);
  assert.equal(holyWeapon.conditions.length, 0);
  assert.equal(holyWeapon.effects[0].id, "holy-weapon");
});

test("le punizioni risolte sul colpo applicano l'esito e chiudono la concentrazione", () => {
  const thunderous = planFor("phb2014-punizione-tonante");
  const staggering = planFor("phb2014-punizione-demoralizzante");

  assert.equal(thunderous.usedSaveAutomation, true);
  assert.equal(thunderous.concentrationAction, "dismiss");
  assert.equal(thunderous.conditions[0].name, "Prono");
  assert.equal(staggering.usedSaveAutomation, true);
  assert.equal(staggering.concentrationAction, "dismiss");
  assert.equal(
    staggering.conditions[0].options.effectId,
    "staggering-smite-penalty",
  );
});

test("disabilitare le condizioni conserva gli effetti preesistenti del pannello", () => {
  const spell = getSpellDefinition("faerie-fire");
  const plan = buildSpellCastAutomationPlan({
    proposedConditions: getProposedConditions(spell),
    proposedEffects: getSpellEffects(spell),
    saveAutomation: getAreaSaveAutomation(spell),
    applyAutomatedConditions: false,
  });

  assert.equal(plan.conditions.length, 0);
  assert.equal(plan.effects[0].id, "incoming-attack-advantage");
  assert.equal(plan.usedSaveAutomation, false);
});

test("tutto il catalogo ad area espone al pannello Spells le regole persistenti ai falliti", () => {
  for (const option of getAreaSaveSpellOptions()) {
    const spell = getSpellDefinition(option.id);
    const choices = getAreaSaveRuleChoices(spell);
    const choiceValues = choices.length ? choices.map((choice) => choice.value) : [""];

    for (const choice of choiceValues) {
      const automation = getAreaSaveAutomation(spell, choice);
      const failedRules = automation?.failed || [];
      if (!failedRules.length || automation?.concentrationAction === "dismiss") continue;

      const plan = planFor(option.id, choice);
      assert.equal(
        plan.usedSaveAutomation,
        true,
        `${option.id}${choice ? `:${choice}` : ""}`,
      );
    }
  }
});
