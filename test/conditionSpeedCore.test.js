import test from "node:test";
import assert from "node:assert/strict";
import {
  conditionMovementCostCells,
  proneStandingCostMeters,
  resolveConditionSpeed,
} from "../src/conditionSpeedCore.js";
import { getSpellEffects } from "../src/spells-srd.js";

const condition = (name, extra = {}) => ({ condition: name, active: true, ...extra });
const effectCondition = (effect) => condition(effect.label, {
  effectId: effect.id,
  mechanics: effect.mechanics,
});

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

test("il dimezzamento arrotonda sempre per difetto le caselle decimali", () => {
  const result = resolveConditionSpeed(10.5, [condition("Indebolimento", { level: 2 })]);
  assert.equal(result.speedMeters, 4.5);
  assert.equal(result.speedMeters / 1.5, 3);
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

test("gli incantesimi SRD modificano la velocità (Passo Veloce, Raggio di Gelo, Velocità, Lentezza)", () => {
  // Passo Veloce (+3m)
  assert.equal(resolveConditionSpeed(9, [], [{ name: "Passo Veloce" }]).speedMeters, 12);
  assert.equal(resolveConditionSpeed(9, [], [{ name: "Longstrider" }]).speedMeters, 12);

  // Raggio di Gelo (-3m)
  assert.equal(resolveConditionSpeed(9, [], [{ name: "Raggio di Gelo" }]).speedMeters, 6);

  // Velocità (x2)
  assert.equal(resolveConditionSpeed(9, [], [{ name: "Velocità" }]).speedMeters, 18);
  assert.equal(resolveConditionSpeed(9, [], [{ name: "Haste" }]).speedMeters, 18);

  // Lentezza (dimezzata)
  assert.equal(resolveConditionSpeed(9, [], [{ name: "Lentezza" }]).speedMeters, 4.5);

  // Combinazione Passo Veloce + Velocità
  const combo = resolveConditionSpeed(9, [], [{ name: "Passo Veloce" }, { name: "Velocità" }]);
  assert.equal(combo.speedMeters, 24); // (9 + 3) * 2 = 24m
  assert.ok(combo.summary.includes("Passo Veloce (+3m)"));
  assert.ok(combo.summary.includes("Velocità (×2)"));
});

test("Trama Ipnotica imposta a 0 la velocità dei bersagli affetti", () => {
  const result = resolveConditionSpeed(9, [], [{ name: "Trama Ipnotica" }]);
  assert.equal(result.speedMeters, 0);
  assert.equal(result.blocked, true);
  assert.ok(result.reasons.includes("Trama Ipnotica"));
});

test("gli effetti numerici del catalogo modificano la velocità tramite mechanics", () => {
  const primalBeast = effectCondition(
    getSpellEffects("Guardiano della Natura", "primal-beast")[0]
  );
  const powerWordPain = effectCondition(
    getSpellEffects("Parola del Potere Dolore")[0]
  );
  const feignDeath = effectCondition(
    getSpellEffects("Morte Apparente")[0]
  );

  assert.equal(resolveConditionSpeed(9, [primalBeast]).speedMeters, 12);
  assert.equal(resolveConditionSpeed(9, [powerWordPain]).speedMeters, 3);
  assert.equal(resolveConditionSpeed(9, [powerWordPain], [{ spellId: "haste" }]).speedMeters, 3);
  assert.equal(resolveConditionSpeed(9, [feignDeath]).speedMeters, 0);
  assert.equal(resolveConditionSpeed(9, [feignDeath]).blocksSpeedBonuses, true);
});

test("gli spellId persistiti sono riconosciuti senza dipendere dal nome localizzato", () => {
  assert.equal(resolveConditionSpeed(9, [], [{ spellId: "longstrider" }]).speedMeters, 12);
  assert.equal(resolveConditionSpeed(9, [], [{ spellId: "ray-of-frost" }]).speedMeters, 6);
  assert.equal(resolveConditionSpeed(9, [], [{ spellId: "haste" }]).speedMeters, 18);
  assert.equal(resolveConditionSpeed(9, [], [{ spellId: "slow" }]).speedMeters, 4.5);
  assert.equal(resolveConditionSpeed(9, [], [{ spellId: "hypnotic-pattern" }]).speedMeters, 0);
});
