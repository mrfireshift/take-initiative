import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8");

test("SP-B05G — il placement riceve lo slot e lo usa per risolvere la geometria", () => {
  assert.match(panel, /slotLevel:\s*state\.session\.slotLevel/);
  assert.match(tool, /getSpellAreaRuleForPlacement\(ruleId,\s*ruleChoice,\s*placementContext\)/s);
});
