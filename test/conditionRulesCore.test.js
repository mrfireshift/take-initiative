import test from "node:test";
import assert from "node:assert/strict";
import {
  getConditionEntryAdditions,
  getEffectiveConditionInstances,
  hasEffectiveCondition,
} from "../src/conditionRulesCore.js";

const condition = (name, id = name, extra = {}) => ({
  id,
  condition: name,
  active: true,
  expiry: { mode: "manual" },
  ...extra,
});

test("le condizioni 2014 previste implicano Incapacitato senza duplicare i metadata espliciti", () => {
  for (const name of ["Paralizzato", "Pietrificato", "Privo di sensi", "Stordito"]) {
    const explicit = [condition(name)];
    const effective = getEffectiveConditionInstances(explicit);
    assert.equal(explicit.length, 1, name);
    assert.equal(hasEffectiveCondition(effective, "Incapacitato"), true, name);
    assert.equal(effective.find((entry) => entry.condition === "Incapacitato")?.derived, true, name);
  }
});

test("un Incapacitato esplicito prevale sulla copia derivata", () => {
  const effective = getEffectiveConditionInstances([
    condition("Stordito", "stunned"),
    condition("Incapacitato", "explicit"),
  ]);
  const incapacitated = effective.filter((entry) => entry.condition === "Incapacitato");
  assert.equal(incapacitated.length, 1);
  assert.equal(incapacitated[0].id, "explicit");
  assert.equal(incapacitated[0].derived, undefined);
});

test("piu condizioni madri producono una sola condizione derivata", () => {
  const effective = getEffectiveConditionInstances([
    condition("Stordito", "stunned"),
    condition("Paralizzato", "paralyzed"),
  ]);
  const incapacitated = effective.filter((entry) => entry.condition === "Incapacitato");
  assert.equal(incapacitated.length, 1);
  assert.deepEqual(incapacitated[0].derivedFromInstanceIds, ["stunned", "paralyzed"]);
});

test("entrare in Privo di sensi applica Prono una sola volta", () => {
  const unconscious = condition("Privo di sensi", "unconscious");
  assert.deepEqual(
    getConditionEntryAdditions([], [unconscious]).map((entry) => entry.condition),
    ["Prono"]
  );
  assert.deepEqual(getConditionEntryAdditions([unconscious], [unconscious]), []);
  assert.deepEqual(getConditionEntryAdditions([], [unconscious, condition("Prono")]), []);
});

test("Prono non e una derivazione continua e resta indipendente da Privo di sensi", () => {
  const effective = getEffectiveConditionInstances([condition("Privo di sensi")]);
  assert.equal(hasEffectiveCondition(effective, "Prono"), false);
});

// Lot L5 of the bugfix pass (EF-08): the derived Incapacitato copied its parent's label and kind.
test("L5: l'Incapacitato derivato ha il proprio nome, non l'etichetta del genitore", () => {
  const stunned = condition("Stordito", "stun", { displayLabel: "Stordito · Colpo Stordente", type: "class-feature", effectKind: "debuff" });
  const derived = getEffectiveConditionInstances([stunned]).find((instance) => instance.derived === true);
  assert.equal(derived.condition, "Incapacitato");
  assert.equal(derived.displayLabel, undefined);
  assert.equal(derived.type, undefined);
});
