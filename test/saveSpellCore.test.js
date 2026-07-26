import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSaveSpellAutomation,
  partitionSaveSpellTargets,
  resolveSaveSpellResolution,
} from "../src/saveSpellCore.js";

const areaSpell = (overrides = {}) => ({
  id: "area-spell",
  name: "Area Spell",
  displayName: "Incantesimo ad area",
  concentration: false,
  ...overrides,
});

test("divide i bersagli per esito preservando l'ordine e segnala quelli mancanti", () => {
  const result = partitionSaveSpellTargets(
    ["passed", "failed", "immune", "missing", "failed"],
    new Map([
      ["passed", "passed"],
      ["failed", "failed"],
      ["immune", "immune"],
    ]),
  );

  assert.deepEqual(result, {
    passedIds: ["passed"],
    failedIds: ["failed"],
    immuneIds: ["immune"],
    missingIds: ["missing"],
  });
});

test("normalizza regole diverse per superati e falliti", () => {
  const automation = normalizeSaveSpellAutomation({
    failed: [
      { condition: "Accecato", expiry: { mode: "rounds", remaining: 2 } },
      "Prono",
    ],
    passed: [{ conditionName: "Assordato", options: { expiry: { mode: "manual" } } }],
  });

  assert.deepEqual(automation.trackOutcomes, ["passed", "failed"]);
  assert.deepEqual(automation.rulesByOutcome.failed, [
    {
      conditionName: "Accecato",
      options: { expiry: { mode: "rounds", remaining: 2 } },
    },
    { conditionName: "Prono", options: {} },
  ]);
  assert.deepEqual(automation.rulesByOutcome.passed, [
    {
      conditionName: "Assordato",
      options: { expiry: { mode: "manual" } },
    },
  ]);
});

test("produce applicazioni separate per outcome e traccia solo gli outcome configurati", () => {
  const result = resolveSaveSpellResolution({
    spell: areaSpell({
      saveAutomation: {
        failed: [{ condition: "Trattenuto", expiry: { mode: "concentration" } }],
        passed: [],
      },
    }),
    casterId: "caster",
    targetIds: ["failed-a", "passed", "failed-b", "immune"],
    outcomes: {
      "failed-a": "failed",
      passed: "passed",
      "failed-b": "failed",
      immune: "immune",
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.failedIds, ["failed-a", "failed-b"]);
  assert.deepEqual(result.spellTargetIds, ["failed-a", "failed-b"]);
  assert.deepEqual(result.conditionApplications, [{
    outcome: "failed",
    targetIds: ["failed-a", "failed-b"],
    conditionName: "Trattenuto",
    options: { expiry: { mode: "concentration" } },
  }]);
});

test("un incantesimo a concentrazione richiede un caster", () => {
  const result = resolveSaveSpellResolution({
    spell: areaSpell({
      concentration: true,
      saveAutomation: { failed: ["Trattenuto"] },
    }),
    targetIds: ["target"],
    outcomes: { target: "failed" },
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["caster-required"]);
});

test("trackOutcomes esplicito può mantenere lo spell anche sui bersagli che superano", () => {
  const result = resolveSaveSpellResolution({
    spell: areaSpell({
      concentration: true,
      saveAutomation: {
        trackOutcomes: ["passed", "failed"],
        failed: ["Spaventato"],
      },
    }),
    casterId: "caster",
    targetIds: ["passed", "failed", "immune"],
    outcomes: {
      passed: "passed",
      failed: "failed",
      immune: "immune",
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.spellTargetIds, ["passed", "failed"]);
  assert.deepEqual(result.conditionApplications.map((entry) => entry.targetIds), [["failed"]]);
});
