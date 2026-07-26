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
