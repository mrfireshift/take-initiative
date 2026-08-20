import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition, getSpellEffects } from "../src/spells-srd.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";

const spell = getSpellDefinition("flame-blade");

function effectFor(slotLevel) {
  const effects = getSpellEffects(spell, "", { slotLevel });
  return effects.find((effect) => effect.id === "flame-blade-damage");
}

test("Lama infuocata espone una pill informativa del danno base", () => {
  const effect = effectFor(2);
  assert.ok(effect);
  assert.equal(effect.kind, "buff");
  assert.equal(effect.label, "3d6 danni da fuoco");
  assert.equal(effect.mechanics.damageBonus.dice, "3d6");
});

test("Lama infuocata scala la pill ogni due livelli di slot sopra il 2°", () => {
  const expected = new Map([
    [2, "3d6 danni da fuoco"],
    [3, "3d6 danni da fuoco"],
    [4, "4d6 danni da fuoco"],
    [5, "4d6 danni da fuoco"],
    [6, "5d6 danni da fuoco"],
    [7, "5d6 danni da fuoco"],
    [8, "6d6 danni da fuoco"],
    [9, "6d6 danni da fuoco"],
  ]);

  for (const [slotLevel, label] of expected) {
    assert.equal(effectFor(slotLevel)?.label, label, `slot ${slotLevel}`);
  }
});

test("la pill viene applicata al caster e conserva il lifecycle della concentrazione", () => {
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 100,
    casterId: "caster-1",
    targetIds: ["caster-1"],
    castContext: { slotLevel: 6 },
    requestedConcentration: true,
  });
  const plan = buildSpellApplicationPlan({
    intent,
    instanceId: "flame-blade-instance",
    casterName: "Druido",
  });

  const condition = plan.operations.find((operation) =>
    operation.type === "condition:add"
      && operation.conditionName === "5d6 danni da fuoco"
  );

  assert.ok(condition);
  assert.deepEqual(condition.targetIds, ["caster-1"]);
  assert.equal(condition.options.effectId, "flame-blade-damage");
  assert.equal(condition.options.effectKind, "buff");
  assert.equal(condition.options.parentEffectId, "flame-blade-instance");
  assert.notEqual(condition.options.mapVisible, false);
});
