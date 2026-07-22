import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConditionAutomationPlan,
  getPotentialConditionAutomationChanges,
} from "../src/conditionAutomationCore.js";

const condition = (name, id, extra = {}) => ({
  id,
  condition: name,
  active: true,
  ...extra,
});

const scene = [
  {
    id: "caster",
    conditions: [condition("Stordito", "stunned")],
    concentrations: {
      velocita: { targets: ["caster", "ally"] },
    },
  },
  {
    id: "grappled",
    conditions: [condition("Afferrato", "grapple", { sourceId: "caster" })],
  },
  {
    id: "unrelated",
    conditions: [condition("Afferrato", "other-grapple", { sourceId: "other" })],
  },
];

test("la cronologia preventiva comprende caster, bersagli e creature afferrate", () => {
  const changes = getPotentialConditionAutomationChanges(scene, ["caster"]);
  assert.deepEqual(new Set(changes.affectedIds), new Set(["caster", "ally", "grappled"]));
  assert.deepEqual(changes.grappleRemovals, [{ itemId: "grappled", instanceId: "grapple" }]);
});

test("una condizione che implica Incapacitato pianifica concentrazione e rilascio della presa", () => {
  const plan = buildConditionAutomationPlan(scene, ["caster"]);
  assert.deepEqual(plan.incapacitatedIds, ["caster"]);
  assert.deepEqual(new Set(plan.concentrationTargetIds), new Set(["caster", "ally"]));
  assert.deepEqual(plan.grappleRemovals, [{ itemId: "grappled", instanceId: "grapple" }]);
});

test("un soggetto non incapacitato non genera mutazioni automatiche", () => {
  const plan = buildConditionAutomationPlan(scene, ["unrelated"]);
  assert.deepEqual(plan.incapacitatedIds, []);
  assert.deepEqual(plan.grappleRemovals, []);
  assert.deepEqual(plan.concentrationTargetIds, []);
});

test("dopo la prima riconciliazione il piano resta idempotente", () => {
  const reconciled = scene.map((item) => ({
    ...item,
    concentrations: item.id === "caster" ? {} : item.concentrations,
    conditions: item.id === "grappled" ? [] : item.conditions,
  }));
  const plan = buildConditionAutomationPlan(reconciled, ["caster"]);
  assert.deepEqual(plan.incapacitatedIds, ["caster"]);
  assert.deepEqual(plan.grappleRemovals, []);
  assert.deepEqual(plan.concentrationTargetIds, []);
});
