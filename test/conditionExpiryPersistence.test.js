import test from "node:test";
import assert from "node:assert/strict";

import { preserveConditionTimingMetadata } from "../src/conditionTimingCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

test("la lettura dei metadata conserva l'ancoraggio al turno successivo", () => {
  const instance = preserveConditionTimingMetadata({
    id: "mind-sliver",
    condition: "-1d4 prossimo TS",
    active: true,
    expiry: {
      mode: "turn-end",
      remaining: 1,
      actor: "source",
      actorId: "caster",
    },
    appliedAt: {
      round: 1,
      actorId: "caster",
      phase: "turn",
    },
  }, {
    endsParentOnRemoval: true,
    expiry: {
      mode: "turn-end",
      actor: "source",
      actorId: "caster",
      remaining: 1,
      anchor: "next-turn",
    },
    appliedAt: {
      round: 1,
      actorId: "caster",
      phase: "turn",
      turnKey: "1:0:caster",
    },
  });

  assert.deepEqual(instance.expiry, {
    mode: "turn-end",
    remaining: 1,
    actor: "source",
    actorId: "caster",
    anchor: "next-turn",
  });
  assert.deepEqual(instance.appliedAt, {
    round: 1,
    actorId: "caster",
    phase: "turn",
    turnKey: "1:0:caster",
  });
  assert.equal(instance.endsParentOnRemoval, true);
});

test("una pill riletta dai metadata ignora la fine del turno di lancio", () => {
  const condition = preserveConditionTimingMetadata({
    id: "charged-hit",
    condition: "+1d6 fuoco in mischia",
    active: true,
    targetId: "caster",
    sourceId: "caster",
    expiry: {
      mode: "turn-end",
      remaining: 1,
      actor: "source",
      actorId: "caster",
    },
    appliedAt: {
      round: 1,
      actorId: "caster",
      phase: "turn",
    },
  }, {
    expiry: { anchor: "next-turn" },
    appliedAt: { turnKey: "1:0:caster" },
  });

  const currentEnd = buildEffectsMutationPlan([{
    id: "caster",
    name: "caster",
    spells: [],
    concentrations: {},
    conditions: [condition],
  }], [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "1:0:caster" }],
  }]);

  assert.equal(currentEnd.states[0].conditions.length, 1);
});

test("la riscrittura della durata conserva il reminder ricorrente", () => {
  const saveReminder = {
    ability: "int",
    timing: "turn-end",
    dcSource: "source-spell",
    success: "remove-effect",
    label: "Se supera il TS, termina la penalit\u00e0.",
  };
  const instance = preserveConditionTimingMetadata({
    id: "synaptic-static-penalty",
    condition: "-1d6 Att/prove/TS concentrazione",
    active: true,
    expiry: { mode: "rounds", remaining: 9 },
  }, {
    saveReminder,
  });

  assert.deepEqual(instance.saveReminder, saveReminder);
  assert.notEqual(instance.saveReminder, saveReminder);
});
