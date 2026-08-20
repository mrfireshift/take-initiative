import test from "node:test";
import assert from "node:assert/strict";

import {
  getAreaSaveAutomation,
  getSpellDefinition,
} from "../src/spells-srd.js";
import {
  getSpellAttackResolution,
  spellAttackResolutionChoiceOptions,
} from "../src/spellAttackResolutionCore.js";
import {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { spellSaveDamageFactor } from "../src/spellCastResolutionRules.js";

const SPELL_ID = "phb2014-raggio-di-infermita";

function contract(slotLevel = 1) {
  return buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    castContext: { slotLevel },
  });
}

function command({ outcome = "failed", damageAmount = 11, slotLevel = 1, targetIds = ["target"] } = {}) {
  const model = contract(slotLevel);
  return buildSpellAreaResolutionCommand({
    contract: model,
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 7 },
    casterId: "caster",
    slotLevel,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes: Object.fromEntries(targetIds.map((id) => [id, outcome])),
    hp: { mode: "damage", amount: damageAmount },
    sceneEpoch: 7,
    currentSceneEpoch: 7,
    validateSpatial: false,
  });
}

test("Raggio di Infermità tratta Cast come colpo già confermato e non espone Colpito/Mancato", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const model = contract(1);

  assert.equal(getSpellAttackResolution(spell), null);
  assert.deepEqual(spellAttackResolutionChoiceOptions(spell), []);
  assert.equal(model.presentation.outcomes.mode, "save");
  assert.deepEqual(
    model.presentation.outcomes.options.map((entry) => entry.value),
    ["passed", "failed", "immune"],
  );
  assert.equal(model.presentation.controls.includes("attack-outcomes"), false);
  assert.equal(model.presentation.controls.includes("save-outcomes"), true);
});

test("Raggio di Infermità espone caster, danno e un solo bersaglio", () => {
  const model = contract(1);
  assert.equal(model.presentation.inputs.caster.visible, true);
  assert.equal(model.presentation.inputs.caster.required, true);
  assert.equal(model.presentation.inputs.targets.maximum, 1);
  assert.equal(model.presentation.inputs.damage.visible, true);
  assert.equal(model.presentation.inputs.damage.required, true);
  assert.equal(model.execution.lane, "area-transaction");
});

test("Raggio di Infermità richiede TS e danno, senza richiedere un esito d'attacco", () => {
  const model = contract(1);
  const missingOutcome = buildSpellPanelViewModel(model, {
    casterId: "caster",
    slotLevel: 1,
    targetIds: ["target"],
    hpValues: { damage: "11" },
  });
  assert.equal(missingOutcome.validation.valid, false);
  assert.ok(missingOutcome.validation.errors.includes("outcomes-required"));

  const ready = buildSpellPanelViewModel(model, {
    casterId: "caster",
    slotLevel: 1,
    targetIds: ["target"],
    outcomes: { target: "failed" },
    hpValues: { damage: "11" },
  });
  assert.equal(ready.validation.valid, true, ready.validation.errors.join(", "));
});

test("Raggio di Infermità applica danno pieno sia con TS superato sia fallito", () => {
  assert.equal(spellSaveDamageFactor(SPELL_ID, "passed"), "full");

  const passed = command({ outcome: "passed", damageAmount: 11 });
  assert.equal(passed.valid, true, passed.errors?.join(", "));
  assert.equal(passed.hp.outcomeFactors.target, "full");

  const failed = command({ outcome: "failed", damageAmount: 11 });
  assert.equal(failed.valid, true, failed.errors?.join(", "));
  assert.equal(failed.hp.outcomeFactors.target, "full");
});

test("Raggio di Infermità: TS superato non applica Avvelenato", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "passed" },
    automation: getAreaSaveAutomation(spell),
    validateSpatial: false,
  });

  assert.equal(resolution.valid, true, resolution.errors.join(", "));
  assert.equal(resolution.conditionApplications.length, 0);
  assert.deepEqual(resolution.spellTargetIds, []);
});

test("Raggio di Infermità: TS fallito applica Avvelenato fino a fine prossimo turno del caster", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    automation: getAreaSaveAutomation(spell),
    validateSpatial: false,
  });

  assert.equal(resolution.valid, true, resolution.errors.join(", "));
  assert.equal(resolution.conditionApplications.length, 1);
  assert.equal(resolution.conditionApplications[0].conditionName, "Avvelenato");
  assert.deepEqual(resolution.conditionApplications[0].options.expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.deepEqual(resolution.spellTargetIds, ["target"]);
});

test("Raggio di Infermità rifiuta più di un bersaglio", () => {
  const built = command({
    outcome: "failed",
    damageAmount: 11,
    targetIds: ["target-a", "target-b"],
  });
  assert.equal(built.valid, false);
  assert.ok(built.errors.includes("target-limit-exceeded"));
});
