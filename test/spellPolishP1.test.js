// Lotto P1 of docs/PIANO_POLISH_INCANTESIMI.md, on the 2014 texts: spells that did nothing, or asked for what they do not do.
// Through the sweep's real cast (test-support/spellSweepHarness.js), from the panel's contract to the production Undo.
import test from "node:test";
import assert from "node:assert/strict";

const { runSpellSweep, SWEEP_DAMAGE } = await import("../test-support/spellSweepHarness.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { spellSaveDamageFormula } = await import("../src/spellCastResolutionRules.js");

const START_HP = 40;
const runsOf = async (spellId) => {
  const records = await runSpellSweep({ spellIds: [spellId] });
  return { failed: records.find((record) => record.outcome === "failed"), passed: records.find((record) => record.outcome === "passed") };
};

for (const [spellId, onSuccess] of [
  ["xanathar-eruzione-terrestre", SWEEP_DAMAGE / 2],
  ["xanathar-orrido-avvizzimento-di-abi-dalzim", SWEEP_DAMAGE / 2],
  ["xanathar-sfera-al-vetriolo", SWEEP_DAMAGE / 2],
  ["phb2014-evoca-raffica", SWEEP_DAMAGE / 2],
  ["phb2014-evoca-pioggia-di-armi", SWEEP_DAMAGE / 2],
  ["tasha-turbine-di-spade", 0],
]) {
  test(`${spellId}: the cast has its damage field, and the save ${onSuccess ? "halves" : "spares"} the damage`, async () => {
    const { failed, passed } = await runsOf(spellId);
    assert.equal(failed.castHasHP, true);
    assert.equal(failed.status, "applied");
    assert.equal(START_HP - failed.hp.one, SWEEP_DAMAGE);
    assert.equal(START_HP - failed.hp.two, SWEEP_DAMAGE);
    assert.equal(START_HP - passed.hp.one, onSuccess);
    assert.equal(failed.undoRestores, true, "one Undo gives the hit points back");
  });
}

test("the formula of these spells grows with the slot as their texts say", () => {
  assert.equal(spellSaveDamageFormula("xanathar-eruzione-terrestre", "failed", 3), "3d12");
  assert.equal(spellSaveDamageFormula("xanathar-eruzione-terrestre", "failed", 5), "5d12");
  assert.equal(spellSaveDamageFormula("xanathar-sfera-al-vetriolo", "failed", 4), "10d4");
  assert.equal(spellSaveDamageFormula("xanathar-sfera-al-vetriolo", "failed", 6), "14d4");
  assert.equal(spellSaveDamageFormula("xanathar-orrido-avvizzimento-di-abi-dalzim", "failed", 9), "12d8");
  assert.equal(spellSaveDamageFormula("phb2014-evoca-raffica", "failed", 3), "3d8");
  assert.equal(spellSaveDamageFormula("phb2014-evoca-pioggia-di-armi", "failed", 5), "8d8");
});

test("Sfera al Vetriolo: the failed save takes the damage and its delayed acid, the passed one only half the damage", async () => {
  const { failed, passed } = await runsOf("xanathar-sfera-al-vetriolo");
  assert.ok(failed.conditions.some((condition) => condition.item === "target-1" && /Acido ritardato/u.test(condition.name)));
  assert.deepEqual(passed.conditions, []);
});

for (const spellId of ["entangle", "earthquake", "reverse-gravity", "xanathar-sfera-acquea"]) {
  test(`${spellId}: the panel asks for no damage the spell does not deal, and keeps the save`, () => {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: 7 } });
    assert.equal(contract.execution.castHasHP, false);
    assert.equal(contract.presentation.inputs.damage.required, false);
    assert.equal(contract.presentation.inputs.outcomes.required, true);
  });
}

test("Intralciare: who fails is restrained, the zone stays, no hit points change", async () => {
  const { failed, passed } = await runsOf("entangle");
  assert.equal(failed.primaryDisabled, false, "the button is not blocked on a damage");
  assert.ok(failed.conditions.some((condition) => condition.item === "target-1" && condition.name === "Trattenuto"));
  assert.ok(!passed.conditions.some((condition) => condition.name === "Trattenuto"));
  assert.equal(failed.hp.one, START_HP);
  assert.ok(failed.zones > 0);
});

test("Allucinazione di Forza: an Intelligence save at the cast, the failed one takes the illusion with its concentration and its zone", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "phb2014-allucinazione-di-forza", phase: "cast", castContext: { slotLevel: 2 } });
  assert.equal(contract.presentation.outcomes.save.ability, "int");
  assert.equal(contract.presentation.inputs.outcomes.required, true);
  assert.equal(contract.execution.castHasHP, false);
  const { failed, passed } = await runsOf("phb2014-allucinazione-di-forza");
  assert.ok(failed.conditions.some((condition) => condition.item === "target-1" && /Illusione/u.test(condition.name)));
  assert.deepEqual(failed.pills.map((pill) => pill.item), ["target-1"], "the card shows the illusion on the pill of its target");
  assert.deepEqual(failed.concentrating, ["Allucinazione di Forza"]);
  assert.ok(failed.zones > 0);
  assert.equal(failed.undoRestores, true);
  assert.deepEqual(failed.terminated.left, [], "Termina takes everything away");
  assert.deepEqual(passed.conditions, [], "a passed save: the illusion fails");
  assert.deepEqual(passed.concentrating, [], "and the caster does not concentrate on anything");
  assert.equal(passed.zones, 0);
});

for (const spellId of ["faerie-fire", "hypnotic-pattern", "slow", "fear", "confusion", "weird", "tasha-miscela-caustica-di-tasha"]) {
  test(`${spellId}: when every target saves the concentration stays, and one Undo takes it back`, async () => {
    const { passed } = await runsOf(spellId);
    assert.equal(passed.concentrating.length, 1);
    assert.equal(passed.historyAdded, 1, "the cast has its History entry");
    assert.equal(passed.undo, "ok");
    assert.equal(passed.undoRestores, true);
  });
}

test("the caster's History entry does not change a cast that already had one", async () => {
  const { failed } = await runsOf("faerie-fire");
  assert.equal(failed.historyAdded, 1);
  assert.equal(failed.undoRestores, true);
  assert.deepEqual(failed.terminated.left, []);
});
