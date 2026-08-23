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
