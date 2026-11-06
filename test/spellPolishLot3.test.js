// Lot 3 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the next 40 spells next to the engine has found. The range from the
// caster, added to the same lot, has its own file: test/spellCasterRange.test.js.
import test from "node:test";
import assert from "node:assert/strict";

const { runSpellSweep } = await import("../test-support/spellSweepHarness.js");
const { getAreaSaveAutomation, getSpellDefinition } = await import("../src/spells-srd.js");
const {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  updateSpellPanelSession,
} = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const {
  spellCantripDamageHint,
  spellCastPrimaryHit,
  spellCastPrimaryHitDice,
  spellCastSparesEveryTarget,
  spellSaveDamageFactor,
  spellSaveDamageFormula,
} = await import("../src/spellCastResolutionRules.js");
const { SPELL_ACTIVE_RESOLUTION_ACTIONS } = await import("../src/spellActiveResolutionRules.js");

const records = await runSpellSweep({
  spellIds: ["xanathar-morsa-del-gelo", "xanathar-stretta-della-terra-di-maximilian", "phb2014-dardo-stregato", "ray-of-enfeeblement"],
});
const recordOf = (id, outcome) => records.find((record) => record.id === id && record.outcome === outcome);
const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
const outcomesOf = (contract) => contract.presentation.outcomes.options.map((option) => [option.value, option.label]);

const command = (spellId, slotLevel, outcome, amount) => {
  const contract = contractOf(spellId, slotLevel);
  return buildSpellAreaResolutionCommand({
    contract,
    spellId,
    phase: "cast",
    casterId: "caster",
    slotLevel,
    targetIds: ["target"],
    candidateTargetIds: ["target"],
    outcomes: { target: outcome },
    ...(amount === undefined ? {} : { hp: { mode: "damage", amount } }),
    sceneEpoch: 4,
    currentSceneEpoch: 4,
    casterDistancesMeters: { target: 3 },
  });
};

test("Frostbite asks its save at the cast: who fails takes the damage and the label, who passes nothing", () => {
  const contract = contractOf("xanathar-morsa-del-gelo", 0);
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.presentation.outcomes.save.ability, "con");
  assert.equal(spellSaveDamageFormula("xanathar-morsa-del-gelo", "failed", 0), "1d6");
  assert.match(spellCantripDamageHint("xanathar-morsa-del-gelo"), /2d6/u);

  const failed = recordOf("xanathar-morsa-del-gelo", "failed");
  assert.ok(failed.hp.one < 40, "the damage");
  assert.deepEqual(failed.conditions.map((condition) => condition.name), ["Prossimo attacco con arma: svant."]);
  const passed = recordOf("xanathar-morsa-del-gelo", "passed");
  assert.equal(passed.hp.one, 40);
  assert.deepEqual(passed.conditions, []);
});

test("Earthen Grasp: who passes is neither hurt nor held, and the hand stays under concentration", () => {
  const spellId = "xanathar-stretta-della-terra-di-maximilian";
  assert.equal(contractOf(spellId, 2).presentation.outcomes.save.ability, "str");
  const failed = recordOf(spellId, "failed");
  assert.ok(failed.hp.one < 40);
  assert.deepEqual(failed.conditions.map((condition) => condition.name), ["Trattenuto"]);
  const passed = recordOf(spellId, "passed");
  assert.equal(passed.hp.one, 40, "the initial save spares the damage: only the crush halves it");
  assert.deepEqual(passed.conditions, []);
  assert.ok(passed.zones > 0, "the hand is on the scene");
  assert.deepEqual(passed.concentrating, ["Stretta della Terra di Maximilian"]);
});

test("Witch Bolt asks if it hit: a hit deals its dice and links the target, a miss leaves nothing", () => {
  const spellId = "phb2014-dardo-stregato";
  const contract = contractOf(spellId, 2);
  assert.deepEqual(outcomesOf(contract), [["failed", "Colpito"], ["immune", "Mancato"]]);
  assert.equal(contract.presentation.outcomes.save, undefined, "no save to name");
  assert.equal(contract.presentation.targeting.spatialRules.maxMeters, 9);
  assert.equal(spellSaveDamageFormula(spellId, "failed", 2), "2d12");

  const hit = recordOf(spellId, "failed");
  assert.ok(hit.hp.one < 40);
  assert.deepEqual(hit.conditions.map((condition) => condition.name), ["1d12 fulmine / azione per ripetere"]);
  assert.deepEqual(hit.concentrating, ["Dardo Stregato"]);

  const miss = command(spellId, 1, "immune");
  assert.equal(miss.valid, true, miss.errors?.join(", "));
  assert.equal(miss.hp.required, false, "nothing to roll");
  assert.equal(miss.hp.outcomeFactors.target, "zero");
  assert.equal(miss.resolution.conditionApplications.length, 0);
});

test("Ray of Enfeeblement asks if it hit, with no damage field, and repeats its save at the end of the target's turn", () => {
  const contract = contractOf("ray-of-enfeeblement", 2);
  assert.deepEqual(outcomesOf(contract), [["failed", "Colpito"], ["immune", "Mancato"]]);
  assert.equal(contract.presentation.inputs.damage.required, false);
  const [rule] = getAreaSaveAutomation(getSpellDefinition("ray-of-enfeeblement")).failed;
  assert.equal(rule.condition, "Danni da Forza dimezzati");
  assert.equal(rule.saveReminder.ability, "con");
  assert.equal(rule.saveReminder.timing, "turn-end");
  assert.deepEqual(recordOf("ray-of-enfeeblement", "failed").concentrating, ["Raggio di affaticamento"]);
  const miss = command("ray-of-enfeeblement", 2, "immune");
  assert.equal(miss.valid, true, miss.errors?.join(", "));
  assert.equal(miss.resolution.conditionApplications.length, 0);
});

test("a cast where nobody takes the damage does not ask for it", () => {
  assert.equal(spellSaveDamageFactor("phb2014-raggio-di-infermita", "passed"), "full");
  assert.equal(spellCastSparesEveryTarget("phb2014-raggio-di-infermita", ["a"], { a: "immune" }), true, "a miss");
  assert.equal(spellCastSparesEveryTarget("phb2014-raggio-di-infermita", ["a"], { a: "passed" }), false, "a hit that passes the save");
  assert.equal(spellCastSparesEveryTarget("xanathar-morsa-del-gelo", ["a"], { a: "passed" }), true);
  assert.equal(spellCastSparesEveryTarget("xanathar-morsa-del-gelo", ["a", "b"], { a: "passed", b: "failed" }), false);
  assert.equal(spellCastSparesEveryTarget("fireball", ["a"], { a: "passed" }), false, "half");
  assert.equal(spellCastSparesEveryTarget("xanathar-morsa-del-gelo", [], {}), false, "no targets yet");

  const contract = contractOf("xanathar-morsa-del-gelo", 0);
  const session = createSpellPanelSession({ contract, spellId: "xanathar-morsa-del-gelo", casterId: "caster", slotLevel: 0 });
  const invalidField = (patch) => buildUnifiedPanelViewModel({
    contract,
    session: updateSpellPanelSession(session, { targetIds: ["target"], ...patch }),
    targetCandidates: [{ key: "target", label: "Target" }],
  }).workflow.validation.firstInvalidField;
  assert.equal(invalidField({ outcomes: { target: "passed" } }), null);
  assert.equal(invalidField({ outcomes: { target: "failed" } }), "damage");
});

test("Ice Knife says that its damage field is the explosion, and its hit has a field of its own", () => {
  assert.equal(spellSaveDamageFormula("xanathar-coltello-di-ghiaccio", "failed", 2), "3d6");
  assert.match(spellCantripDamageHint("xanathar-coltello-di-ghiaccio"), /1,5 m/u);
  assert.doesNotMatch(spellCantripDamageHint("xanathar-coltello-di-ghiaccio"), /a parte/u, "the hit is no longer applied elsewhere");
  assert.deepEqual(spellCastPrimaryHitDice(spellCastPrimaryHit("xanathar-coltello-di-ghiaccio")), { dice: "1d10", critical: "2d10" });
});

test("an automatic repeat says no save: Witch Bolt, Enervation, the Mental Prison's break", () => {
  for (const [spellId, actionId] of [
    ["phb2014-dardo-stregato", "witch-bolt-repeat"],
    ["xanathar-debilitazione", "enervation-repeat"],
    ["xanathar-prigione-mentale", "mental-prison-break"],
  ]) {
    const action = SPELL_ACTIVE_RESOLUTION_ACTIONS[spellId].find((entry) => entry.id === actionId);
    assert.equal(action.checkLabel, "", spellId);
  }
});

test("the panel says the range of the targets, with the distance between them where the text has both", () => {
  const label = (spellId, slotLevel) => {
    const contract = contractOf(spellId, slotLevel);
    return buildUnifiedPanelViewModel({
      contract,
      session: createSpellPanelSession({ contract, spellId, casterId: "caster", slotLevel }),
      targetCandidates: [],
    }).targets.spatialLabel;
  };
  assert.equal(label("hold-person", 2), "Bersagli entro 18 m · Distanza massima tra bersagli: 9 m");
  assert.equal(label("cure-wounds", 1), "Bersagli entro 1,5 m");
  assert.equal(label("disintegrate", 6), "Bersagli entro 18 m");
  assert.equal(label("sending", 3), "");
});
