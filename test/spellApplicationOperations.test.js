import test from "node:test";
import assert from "node:assert/strict";

import { spellEffectConditionOptions } from "../src/spellEffectCore.js";

test("le pill di una spell possono avere scadenze diverse dal parent", () => {
  const defaults = {
    sourceId: "caster",
    expiry: { mode: "rounds", remaining: 1 },
  };
  const resistance = spellEffectConditionOptions({
    id: "resistance-fire",
    kind: "buff",
    label: "Res. fuoco",
    expiry: { mode: "turn-start", actor: "source", remaining: 1 },
  }, defaults, "absorb");
  const chargedHit = spellEffectConditionOptions({
    id: "charged-fire",
    kind: "buff",
    label: "+1d6 fuoco in mischia",
    manualRemoval: true,
    endsParentOnRemoval: true,
    expiry: { mode: "turn-end", actor: "source", remaining: 1 },
  }, defaults, "absorb");

  assert.deepEqual(resistance, {
      sourceId: "caster",
      expiry: { mode: "turn-start", actor: "source", remaining: 1 },
      parentEffectId: "absorb",
      type: "spell",
      effectId: "resistance-fire",
      effectKind: "buff",
      effectDetail: "",
      manualRemoval: false,
  });
  assert.deepEqual(chargedHit.expiry, {
    mode: "turn-end",
    actor: "source",
    remaining: 1,
  });
  assert.equal(chargedHit.manualRemoval, true);
  assert.equal(chargedHit.endsParentOnRemoval, true);
});

test("una pill può dichiararsi indipendente dal parent spell", () => {
  const independent = spellEffectConditionOptions({
    id: "banished-home",
    kind: "debuff",
    label: "Esiliato",
    parentEffectId: "",
    expiry: { mode: "manual" },
  }, {
    expiry: { mode: "concentration" },
  }, "banishing-smite");

  assert.equal(independent.parentEffectId, "");
  assert.deepEqual(independent.expiry, { mode: "manual" });
});

test("una pill spell trasferisce il contratto del reminder TS", () => {
  const saveReminder = {
    ability: "con",
    timing: "turn-start",
    dcSource: "source-spell",
    success: "remove-effect",
  };
  const options = spellEffectConditionOptions({
    id: "burning",
    kind: "debuff",
    label: "In fiamme",
    saveReminder,
  }, {
    sourceId: "caster",
  }, "spell-instance");

  assert.equal(options.saveReminder, saveReminder);
  assert.equal(options.sourceId, "caster");
  assert.equal(options.parentEffectId, "spell-instance");
});
