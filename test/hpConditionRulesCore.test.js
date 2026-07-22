import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveZeroHPUnconsciousAction,
  shouldPCBeUnconsciousAtZeroHP,
  ZERO_HP_UNCONSCIOUS_TYPE,
} from "../src/hpConditionRulesCore.js";

const automaticUnconscious = {
  id: "zero-hp",
  condition: "Privo di sensi",
  active: true,
  type: ZERO_HP_UNCONSCIOUS_TYPE,
};

test("solo un Personaggio inizializzato a 0 PF deve diventare Privo di sensi", () => {
  assert.equal(shouldPCBeUnconsciousAtZeroHP({ attitude: "pc", hp: 0, hpMax: 20 }), true);
  assert.equal(shouldPCBeUnconsciousAtZeroHP({ attitude: "ally", hp: 0, hpMax: 20 }), false);
  assert.equal(shouldPCBeUnconsciousAtZeroHP({ attitude: "enemy", hp: 0, hpMax: 20 }), false);
  assert.equal(shouldPCBeUnconsciousAtZeroHP({ attitude: "pc", hp: 0, hpMax: 0 }), false);
  assert.equal(shouldPCBeUnconsciousAtZeroHP({ attitude: "pc", hp: 1, hpMax: 20 }), false);
});

test("la transizione a 0 PF richiede una sola istanza automatica", () => {
  assert.deepEqual(
    resolveZeroHPUnconsciousAction({ attitude: "pc", hp: 0, hpMax: 20 }, []),
    { shouldHave: true, add: true, removeInstanceIds: [] }
  );
  assert.deepEqual(
    resolveZeroHPUnconsciousAction(
      { attitude: "pc", hp: 0, hpMax: 20 },
      [automaticUnconscious]
    ),
    { shouldHave: true, add: false, removeInstanceIds: [] }
  );
});

test("la guarigione rimuove soltanto il Privo di sensi generato dagli 0 PF", () => {
  const manual = {
    id: "manual",
    condition: "Privo di sensi",
    active: true,
    type: "spell",
  };
  assert.deepEqual(
    resolveZeroHPUnconsciousAction(
      { attitude: "pc", hp: 5, hpMax: 20 },
      [manual, automaticUnconscious]
    ),
    { shouldHave: false, add: false, removeInstanceIds: ["zero-hp"] }
  );
});

test("cambiare fazione rimuove una precedente istanza automatica", () => {
  assert.deepEqual(
    resolveZeroHPUnconsciousAction(
      { attitude: "ally", hp: 0, hpMax: 20 },
      [automaticUnconscious]
    ),
    { shouldHave: false, add: false, removeInstanceIds: ["zero-hp"] }
  );
});
