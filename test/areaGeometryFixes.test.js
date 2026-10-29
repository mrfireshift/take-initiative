import assert from "node:assert/strict";
import test from "node:test";
import { buildRectangleArea } from "../src/aoeGeometryCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";

// Lot L25 of the bugfix pass: the geometry of the areas.

// MP-04: Thunderwave's cube was centred on a vertex of the caster: towards the left or up it took the caster in.
test("L25: Onda tonante è un cubo di 4,5 m con una faccia sul caster, come il cubo dei mostri", () => {
  const rule = getSpellAreaRuleById("thunderwave:cast");
  assert.equal(rule.geometry.shape, "rectangle");
  assert.deepEqual([rule.geometry.size.value, rule.geometry.width.value], [4.5, 4.5]);
  assert.deepEqual(rule.placement, { ...rule.placement, origin: "caster-adjacent", direction: "pointer", anchor: "caster" });
  // From the centre of the cell next to the caster (cell 0,0), in the four directions: 3 × 3 cells, never the caster.
  for (const [start, end] of [
    [{ x: -50, y: 50 }, { x: -350, y: 50 }],
    [{ x: 50, y: -50 }, { x: 50, y: -350 }],
    [{ x: 150, y: 50 }, { x: 450, y: 50 }],
    [{ x: 50, y: 150 }, { x: 50, y: 450 }],
  ]) {
    const area = buildRectangleArea(start, end, 100, { x: 0, y: 0 }, 3);
    assert.equal(area.cells.length, 9);
    assert.equal(area.cells.some((cell) => cell.x === 0 && cell.y === 0), false);
  }
});


// MP-09: on a "5 ft" scene the farthest Fireball (150 ft = 30 cells, stored as 45 m) was refused, and a diagonal was
// measured as the crow flies instead of in cells as the grid variant of the PHB counts it.
test("L25: gittata in caselle come nella variante su griglia del PHB, piedi da 1,5 m ogni 5", async () => {
  const { spellAreaOriginWithinRange } = await import("../src/spellAreaPlacementCore.js");
  const fireball = { value: 45, unit: "m", measure: "range" };
  const at = (cellsX, cellsY, scale) => spellAreaOriginWithinRange({ origin: { x: 50 + cellsX * 100, y: 50 + cellsY * 100 },
    casterOrigin: { x: 50, y: 50 }, range: fireball, dpi: 100, scale });
  const feet = { multiplier: 5, unit: "ft" };
  const metres = { multiplier: 1.5, unit: "m" };
  assert.equal(at(30, 0, feet), true, "30 cells on a 5 ft scene");
  assert.equal(at(31, 0, feet), false);
  assert.equal(at(30, 30, metres), true, "30 cells in diagonal: 30 cells");
  assert.equal(at(30, 31, metres), false);
});

test("L25: l'anteprima della gittata è il quadrato che il conteggio in caselle raggiunge", async () => {
  const { readFileSync } = await import("node:fs");
  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const preview = tool.slice(tool.indexOf("function spellRangePreviewPath("), tool.indexOf("function radiusLabel("));
  assert.match(preview, /\[Command\.MOVE, origin\.x - radius, origin\.y - radius\]/);
  assert.match(preview, /\[Command\.LINE, origin\.x \+ radius, origin\.y \+ radius\]/);
  assert.doesNotMatch(preview, /type: "circle"/);
});

// MP-07 (decision D-B): an area written "each creature within N feet of you" is a range, counted in cells from the
// caster's space with diagonals in, as the attack console proposes it; an area written as a radius stays a circle.
test("L25: le aree «entro N metri» contano le caselle dal token, diagonali comprese, come la proposta della console", async () => {
  const { buildArea, buildWithinDistanceArea } = await import("../src/aoeGeometryCore.js");
  const { bossReachFeet } = await import("../src/bossActionsViewCore.js");
  // Medium caster on cell (0,0): within 5 ft = the 8 cells around it and its own.
  const medium = buildArea("circle", { x: 50, y: 50 }, { x: 150, y: 50 }, 100, { x: 0, y: 0 }, { metric: "grid", footprint: { widthCells: 1, heightCells: 1 } });
  assert.equal(medium.cells.length, 9);
  assert.ok(medium.cells.some((cell) => cell.x === 100 && cell.y === 100), "the diagonal cell is in");
  // The plain circle (a radius) leaves the diagonals out.
  assert.equal(buildArea("circle", { x: 50, y: 50 }, { x: 150, y: 50 }, 100, { x: 0, y: 0 }).cells.length, 5);
  // Large caster on cells (0..1, 0..1): within 5 ft = 4 × 4.
  const large = buildWithinDistanceArea({ x: 100, y: 100 }, { widthCells: 2, heightCells: 2 }, 1, 100, { x: 0, y: 0 });
  assert.equal(large.cells.length, 16);
  // Same answer as the console's proposal for a creature anywhere around a Large monster, 10 ft.
  const monster = { min: { x: 0, y: 0 }, max: { x: 200, y: 200 } };
  const area = buildWithinDistanceArea({ x: 100, y: 100 }, { widthCells: 2, heightCells: 2 }, 2, 100, { x: 0, y: 0 });
  const inArea = new Set(area.cells.map((cell) => `${cell.x / 100},${cell.y / 100}`));
  for (let column = -4; column <= 5; column += 1) {
    for (let row = -4; row <= 5; row += 1) {
      if (column >= 0 && column <= 1 && row >= 0 && row <= 1) continue;
      const bounds = { min: { x: column * 100, y: row * 100 }, max: { x: column * 100 + 100, y: row * 100 + 100 } };
      assert.equal(inArea.has(`${column},${row}`), bossReachFeet(monster, bounds, 100, 5) <= 10, `cell ${column},${row}`);
    }
  }
});

test("L25: le regole «entro» sono segnate, quelle a raggio no; il segno arriva all'anteprima del pannello", async () => {
  const { getSpellAreaRuleById, getPcMonsterAreaRuleById } = await import("../src/spellAreaRules.js");
  for (const id of ["divine-word:cast", "phb2014-braccia-di-hadar:cast", "phb2014-onda-distruttiva:cast", "xanathar-parola-radiosa:cast",
    "xanathar-rombo-di-tuono:cast", "xanathar-passo-del-tuono:cast", "tasha-turbine-di-spade:cast"]) {
    assert.equal(getSpellAreaRuleById(id).geometry.metric, "grid", id);
  }
  for (const id of ["spirit-guardians:aura", "antilife-shell:cast", "phb2014-aura-di-vita:cast", "globe-of-invulnerability:cast"]) {
    assert.equal(getSpellAreaRuleById(id).geometry.metric, undefined, id);
  }
  assert.equal(getPcMonsterAreaRuleById("pc-monster-area:emanation:10ft:fire").geometry.metric, "grid");
  const { createSpellAreaPlacementSession, reviewSpellAreaPlacement } = await import("../src/spellAreaPlacementCore.js");
  const session = createSpellAreaPlacementSession({ requestId: "r1", rule: getSpellAreaRuleById("tasha-turbine-di-spade:cast"), casterId: "aria" });
  const reviewed = reviewSpellAreaPlacement(session, { type: "circle", start: { x: 50, y: 50 }, end: { x: 150, y: 50 }, gridOrigin: { x: 0, y: 0 },
    dpi: 100, radius: 100, metric: "grid", footprint: { widthCells: 2, heightCells: 2 }, targetIds: [] });
  assert.deepEqual([reviewed.preview.metric, reviewed.preview.footprint], ["grid", { widthCells: 2, heightCells: 2 }]);
});

test("L25: lo strumento porta la metrica «entro» nelle opzioni, nell'area salvata, nella riselezione e la disegna quadrata", async () => {
  const { readFileSync } = await import("node:fs");
  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const section = (from, to) => tool.slice(tool.indexOf(from), tool.indexOf(to, tool.indexOf(from)));
  assert.match(section("function spellAreaGeometryOptions(", "function previewPath("), /\.\.\.areaMetricFields\(rule, state\),/);
  assert.match(section("function persistentAreaMetadata(", "async function persistArea("), /\.\.\.areaMetricFields\(state\.rule, state\),/);
  assert.match(section("function translatedAreaFromItem(", "\n}\n"), /metadata\.metric === "grid" \? \{ metric: "grid", footprint: metadata\.footprint \}/);
  assert.match(section("function geometryCommands(", "function isBossEmanation("), /area\.metric === "grid" && Array\.isArray\(area\.points\)/);
});

// MP-10: «Aspetto area» recoloured the spells' zones already on the map too (Moonbeam and Wall of Fire lost their theme).
test("L25: «Aspetto area» non ricolora le zone degli incantesimi", async () => {
  const { readFileSync } = await import("node:fs");
  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const restyle = tool.slice(tool.indexOf("async function applyStyleToExistingAreas("), tool.indexOf("async function openStyleSettings("));
  const filter = new Function("AREA_META_KEY", "SPELL_STATIC_ZONE_META_KEY",
    `return ${restyle.slice(restyle.indexOf("(item) => {"), restyle.indexOf("},\n    (items) =>") + 1)};`)("area", "zone");
  assert.equal(filter({ metadata: { area: { type: "circle" } } }), true, "an area drawn by hand");
  assert.equal(filter({ metadata: { area: { type: "circle" }, zone: { spellId: "moonbeam" } } }), false, "a spell's zone");
  assert.equal(filter({ metadata: { area: { parentId: "fill" }, zone: { spellId: "wall-of-fire" } } }), false, "its geometry");
  assert.equal(filter({ metadata: { area: { type: "circle", fixedStyle: true } } }), false);
});
