import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {},
    buildLabel: () => ({ }),
  },
});

const { getConditionWidgetLayoutParts } = await import(
  "../src/conditions.js?conditions-compatibility"
);
const { conditionKey } = await import("../src/conditionRulesCore.js");

test("Arma Sacra conserva Accecato come Condition nativa", () => {
  const [part] = getConditionWidgetLayoutParts({
    instances: [{
      id: "holy-condition",
      condition: "Accecato",
      active: true,
      effectId: "holy-weapon-blinded",
      expiry: { mode: "rounds", remaining: 10 },
    }],
  });

  const label = part.name;
  const key = conditionKey(label);
  assert.equal(label, "Accecato");
  assert.equal(key, "accecato");
  assert.match(part.label, /Accecato/u);
  assert.equal(part.kind, "condition");
  assert.equal(part.tone, "");
  assert.equal(part.effectKind, undefined);
});

test("Lentezza proietta sei summary parts su una sola effect instance", () => {
  const [part] = getConditionWidgetLayoutParts({
    instances: [{
      id: "slow-effect",
      condition: "Lentezza: -2 CA/TS Des · no reazioni",
      active: true,
      effectId: "slow-penalty",
      effectKind: "debuff",
      parentEffectId: "slow-cast",
    }],
  });

  assert.equal(part.key, "spell-effect:slow-effect");
  assert.equal(part.parentEffectId, "slow-cast");
  assert.equal(part.summaryParts.length, 6);
  assert.deepEqual(part.summaryParts.map(({ label }) => label), [
    "Vel ½",
    "CA −2 / TS Des −2",
    "No reaz.",
    "Azione o Bonus",
    "Max 1 att.",
    "Spell 1 az.: d20",
  ]);
});

test("una condition canonica puo proiettare il contatore dalla stessa instance", () => {
  const [part] = getConditionWidgetLayoutParts({
    instances: [{
      id: "fts-restrained",
      condition: "Trattenuto",
      active: true,
      effectId: "flesh-to-stone-restrained",
      summaryParts: [{ id: "flesh-to-stone-progress", label: "S 1/3 · F 2/3" }],
    }],
  });

  assert.equal(part.kind, "condition");
  assert.deepEqual(part.summaryParts, [
    { id: "flesh-to-stone-progress", label: "S 1/3 · F 2/3" },
  ]);
});
