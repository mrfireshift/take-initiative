import test from "node:test";
import assert from "node:assert/strict";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { getProposedConditions, getSpellDefinition } from "../src/spells-srd.js";

const SPELL_ID = "ray-of-enfeeblement";
const INSTANCE_ID = "ray-enfeeblement-1";

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("SP-B05C — il repeat save riuscito termina Raggio di Affaticamento, non solo la pill", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const [penalty] = getProposedConditions(spell);

  assert.equal(penalty.name, "Danni da Forza dimezzati");
  assert.equal(penalty.options.saveReminder.ability, "con");
  assert.equal(penalty.options.saveReminder.timing, "turn-end");
  assert.equal(penalty.options.endsParentOnRemoval, true);
  assert.equal(penalty.options.parentRemoval, "spell");

  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], conditions: [], concentrations: {} },
    { id: "target", spells: [], conditions: [], concentrations: {} },
  ], [
    {
      type: "spell:upsert",
      operationId: "spell",
      targetIds: ["target"],
      entryIds: { target: "spell-entry" },
      name: "Raggio di Affaticamento",
      turns: 10,
      conc: true,
      source: "caster",
      casterId: "caster",
      instanceId: INSTANCE_ID,
    },
    {
      type: "condition:add",
      operationId: "condition",
      createdAt: 1,
      targetIds: ["target"],
      instanceIds: { target: "ray-penalty" },
      conditionName: penalty.name,
      options: {
        ...penalty.options,
        sourceId: "caster",
        sourceName: "Caster",
        parentEffectId: INSTANCE_ID,
        type: "spell",
        expiry: { mode: "concentration" },
      },
    },
    {
      type: "concentration:register",
      operationId: "concentration",
      casterId: "caster",
      targetIds: ["target"],
      name: "Raggio di Affaticamento",
      instanceId: INSTANCE_ID,
      appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    },
  ]);

  assert.equal(state(initial, "target").spells.length, 1);
  assert.equal(state(initial, "target").conditions.length, 1);
  assert.equal(Object.keys(state(initial, "caster").concentrations).length, 1);

  const resolved = buildEffectsMutationPlan(initial.states, [{
    type: "condition:remove-instances",
    operationId: "repeat-save-passed",
    removals: [{ itemId: "target", instanceId: "ray-penalty" }],
  }]);

  assert.equal(state(resolved, "target").conditions.length, 0);
  assert.equal(state(resolved, "target").spells.length, 0);
  assert.equal(Object.keys(state(resolved, "caster").concentrations).length, 0);
});
