// Boss Action cones reuse the shared placement tool through a synthesized, validated area rule.
import assert from "node:assert/strict";
import test from "node:test";
import { getSpellAreaRuleById, getSpellAreaRuleForPlacement, validateSpellAreaRule, BOSS_ACTION_AREA_SPELL_ID } from "../src/spellAreaRules.js";
import { createSpellAreaPlacementSession } from "../src/spellAreaPlacementCore.js";
import { bossActionAreaRuleId } from "../src/bossActionExecutionCore.js";
import { buildConeArea, areaHitsBounds } from "../src/aoeGeometryCore.js";

test("the profile cone maps to a valid free-origin cone rule in catalog metres", () => {
  const ruleId = bossActionAreaRuleId({ shape: "cone", size: 60, origin: "Titano" });
  assert.equal(ruleId, "boss-action-area:cone:60ft");
  const rule = getSpellAreaRuleById(ruleId);
  assert.equal(validateSpellAreaRule(rule).valid, true);
  assert.equal(rule.spellId, BOSS_ACTION_AREA_SPELL_ID);
  assert.deepEqual(rule.geometry, { shape: "cone", size: { value: 18, unit: "m", measure: "length" } });
  assert.deepEqual(rule.placement, { origin: "point", direction: "pointer", anchor: "world", range: null });
  assert.equal(rule.targeting.includeCaster, false, "the boss token never hits itself");
  assert.equal(getSpellAreaRuleForPlacement(ruleId), rule);
  assert.equal(getSpellAreaRuleById(ruleId), rule, "generated once and reused");
});

test("unknown sizes or shapes never produce a rule", () => {
  for (const id of ["boss-action-area:cone:62ft", "boss-action-area:cone:0ft", "boss-action-area:sphere:60ft", "boss-action-area:cone:60m", "cone:60ft"]) {
    assert.equal(getSpellAreaRuleById(id), null, id);
  }
  assert.equal(bossActionAreaRuleId({ shape: "sphere", size: 60 }), "");
});

test("a free-origin cone session needs no caster cell and the shared geometry covers the 60 ft cone", () => {
  const rule = getSpellAreaRuleById("boss-action-area:cone:60ft");
  const session = createSpellAreaPlacementSession({ requestId: "r1", rule, casterId: "" });
  assert.equal(session.shape, "cone");
  const dpi = 150, area = buildConeArea({ x: 0, y: 0 }, { x: 12 * dpi, y: 0 }, dpi);
  const token = (x, y) => ({ min: { x: x - 75, y: y - 75 }, max: { x: x + 75, y: y + 75 } });
  assert.equal(area.squares, 12);
  assert.equal(areaHitsBounds(area, token(450, 0)), true, "inside, near the origin");
  assert.equal(areaHitsBounds(area, token(1500, -500)), true, "inside, near the wide end");
  assert.equal(areaHitsBounds(area, token(-900, 0)), false, "behind the origin");
  assert.equal(areaHitsBounds(area, token(2400, 0)), false, "beyond 60 ft");
});
