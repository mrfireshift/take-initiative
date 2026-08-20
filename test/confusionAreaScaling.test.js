import test from "node:test";
import assert from "node:assert/strict";

import { getSpellAreaRuleForPlacement } from "../src/spellAreaRules.js";

test("SP-B05G — Confusione scala il raggio di 1,5 m per slot sopra il 4°", () => {
  const base = getSpellAreaRuleForPlacement("confusion:cast", "", { slotLevel: 4 });
  const fifth = getSpellAreaRuleForPlacement("confusion:cast", "", { slotLevel: 5 });
  const sixth = getSpellAreaRuleForPlacement("confusion:cast", "", { slotLevel: 6 });

  assert.equal(base.geometry.size.value, 3);
  assert.equal(fifth.geometry.size.value, 4.5);
  assert.equal(sixth.geometry.size.value, 6);
  assert.equal(base.geometry.size.measure, "radius");
  assert.equal(sixth.placement.range.value, 27);
});
