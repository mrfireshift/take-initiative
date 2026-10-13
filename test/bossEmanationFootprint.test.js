// Source contract: a Boss Action emanation radiates from the cells the boss token occupies (like the
// custom auras); spell areas and the boss's other shapes are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8");

test("only Boss Action emanations centred on the boss use the footprint", () => {
  assert.match(tool, /return state\?\.rule\?\.spellId === BOSS_ACTION_AREA_SPELL_ID\n    && state\.rule\.placement\?\.origin === "caster"\n    && state\.type === "circle"\n    && !!state\.casterBounds;/);
  assert.match(tool, /if \(isBossEmanation\(state\)\) \{\n    area = buildFootprintEmanationArea\(state\.start, gridFootprintCells\(state\.casterBounds, state\.dpi\), state\.sizeCells, state\.dpi, state\.gridOrigin\);/);
  const render = tool.slice(tool.indexOf("function renderDrag(state)"), tool.indexOf("function boardTokenGridVertex("));
  assert.ok(render.indexOf("isBossEmanation(state)") > render.indexOf("let area = buildArea("), "replaces the centre circle after it is built");
  assert.ok(render.indexOf("isBossEmanation(state)") < render.indexOf("state.area = area;"), "the hit test and the confirmation use the footprint area");
});

test("the outline of a large boss follows its footprint; a 1x1 circle keeps its geometry", () => {
  assert.match(tool, /if \(area\?\.type === "circle" && \(area\.footprint\?\.halfWidth > 0 \|\| area\.footprint\?\.halfHeight > 0\)\) \{\n    return footprintEmanationCommands\(area\);/);
});
