import test from "node:test";
import assert from "node:assert/strict";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { getSpellDefinition, getSpellEffects } from "../src/spells-srd.js";

const SPELL_ID = "xanathar-nemici-in-abbondanza";
const INSTANCE_ID = "enemies-abound-1";

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("SP-B05E — il repeat save su danno riuscito termina Nemici in Abbondanza, non solo la pill", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const [effect] = getSpellEffects(spell);

  assert.equal(effect.label, "Tutti considerati nemici");
  assert.equal(effect.saveReminder.ability, "int");
  assert.equal(effect.saveReminder.timing, "damage");
  assert.equal(effect.saveReminder.success, "remove-effect");
  assert.equal(effect.endsParentOnRemoval, true);
  assert.equal(effect.parentRemoval, "spell");

  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], conditions: [], concentrations: {} },
    { id: "target", spells: [], conditions: [], concentrations: {} },
  ], [
    {
      type: "spell:upsert",
      operationId: "spell",
      targetIds: ["target"],
      entryIds: { target: "spell-entry" },
      name: "Nemici in Abbondanza",
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
      instanceIds: { target: "enemies-abound-effect" },
      conditionName: effect.label,
      options: {
        sourceId: "caster",
        sourceName: "Caster",
        parentEffectId: INSTANCE_ID,
        effectId: effect.id,
        effectKind: effect.kind,
        effectDetail: effect.detail,
        saveReminder: effect.saveReminder,
        endsParentOnRemoval: effect.endsParentOnRemoval,
        parentRemoval: effect.parentRemoval,
        type: "spell",
        expiry: { mode: "concentration" },
      },
    },
    {
      type: "concentration:register",
      operationId: "concentration",
      casterId: "caster",
      targetIds: ["target"],
      name: "Nemici in Abbondanza",
      instanceId: INSTANCE_ID,
      appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    },
  ]);

  assert.equal(state(initial, "target").spells.length, 1);
  assert.equal(state(initial, "target").conditions.length, 1);
  assert.equal(Object.keys(state(initial, "caster").concentrations).length, 1);

  const resolved = buildEffectsMutationPlan(initial.states, [{
    type: "condition:remove-instances",
    operationId: "damage-repeat-save-passed",
    removals: [{ itemId: "target", instanceId: "enemies-abound-effect" }],
  }]);

  assert.equal(state(resolved, "target").conditions.length, 0);
  assert.equal(state(resolved, "target").spells.length, 0);
  assert.equal(Object.keys(state(resolved, "caster").concentrations).length, 0);
});
