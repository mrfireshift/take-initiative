import test from "node:test";
import assert from "node:assert/strict";
import {
  conditionMovementCostCells,
  proneStandingCostMeters,
  resolveConditionSpeed,
} from "../src/conditionSpeedCore.js";

const condition = (name, extra = {}) => ({ condition: name, active: true, ...extra });

test("le condizioni 2014 che impediscono il movimento portano la velocità a 0", () => {
  for (const name of [
    "Afferrato",
    "Trattenuto",
    "Paralizzato",
    "Pietrificato",
    "Stordito",
    "Privo di sensi",
  ]) {
    const result = resolveConditionSpeed(9, [condition(name)]);
    assert.equal(result.speedMeters, 0, name);
    assert.equal(result.blocked, true, name);
    assert.equal(result.blocksSpeedBonuses, true, name);
  }
});

test("Indebolimento 2-4 dimezza la velocità e il livello 5 la porta a 0", () => {
  assert.equal(resolveConditionSpeed(9, [condition("Indebolimento", { level: 2 })]).speedMeters, 4.5);
  assert.equal(resolveConditionSpeed(9, [condition("Indebolimento", { level: 4 })]).speedMeters, 4.5);
  assert.equal(resolveConditionSpeed(9, [condition("Indebolimento", { level: 5 })]).speedMeters, 0);
});

test("Indebolimento 1 e le condizioni senza effetto sulla velocità non la modificano", () => {
  const result = resolveConditionSpeed(9, [
    condition("Indebolimento", { level: 1 }),
    condition("Incapacitato"),
    condition("Spaventato"),
  ]);
  assert.equal(result.speedMeters, 9);
  assert.equal(result.multiplier, 1);
  assert.equal(result.summary, "");
});

test("Prono raddoppia il costo del movimento senza cambiare la velocità", () => {
  const result = resolveConditionSpeed(9, [condition("Prono")]);
  assert.equal(result.speedMeters, 9);
  assert.equal(result.prone, true);
  assert.equal(result.movementCostMultiplier, 2);
  assert.equal(result.summary, "Prono: movimento ×2");
  assert.equal(proneStandingCostMeters(result.speedMeters), 4.5);
  assert.equal(conditionMovementCostCells(3, result.movementCostMultiplier), 6);
});

test("rialzarsi usa metà della velocità effettiva già modificata da Indebolimento", () => {
  const result = resolveConditionSpeed(9, [condition("Indebolimento", { level: 2 })]);
  assert.equal(proneStandingCostMeters(result.speedMeters), 2.25);
});

test("la velocità 0 prevale sul dimezzamento e le condizioni duplicate non si accumulano", () => {
  const result = resolveConditionSpeed(9, [
    condition("Indebolimento", { level: 3 }),
    condition("Afferrato"),
    condition("Afferrato"),
  ]);
  assert.equal(result.speedMeters, 0);
  assert.deepEqual(result.reasons, ["Afferrato"]);
});
