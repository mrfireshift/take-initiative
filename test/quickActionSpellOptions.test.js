import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuickActionSpellOptions,
  getSpellDefinition,
  getTrackableSpellOptions,
} from "../src/spells-srd.js";

test("le macro includono gli incantesimi istantanei supportati dalla Console area", () => {
  const fireball = getSpellDefinition("Palla di fuoco");
  assert.ok(fireball);
  assert.equal(fireball.duration, "Instantaneous");
  assert.equal(
    getTrackableSpellOptions().some((option) => option.id === fireball.id),
    false,
  );
  const option = getQuickActionSpellOptions()
    .find((entry) => entry.id === fireball.id);
  assert.ok(option);
  assert.equal(option.label, "Palla di fuoco");
  assert.equal(option.level, 3);
  assert.equal(option.area, true);
});
