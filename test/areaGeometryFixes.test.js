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


// MP-09: on a "5 ft" scene the farthest Fireball (150 ft = 30 cells, stored as 45 m) was refused. The owner's decision of
// 4/11 replaces D-C: a range is the radius of a circle, so a diagonal is measured as the crow flies, not in cells.
test("L25: la gittata è il raggio di un cerchio, piedi da 1,5 m ogni 5", async () => {
  const { spellAreaOriginWithinRange } = await import("../src/spellAreaPlacementCore.js");
  const fireball = { value: 45, unit: "m", measure: "range" };
  const at = (cellsX, cellsY, scale) => spellAreaOriginWithinRange({ origin: { x: 50 + cellsX * 100, y: 50 + cellsY * 100 },
    casterOrigin: { x: 50, y: 50 }, range: fireball, dpi: 100, scale });
  const feet = { multiplier: 5, unit: "ft" };
  const metres = { multiplier: 1.5, unit: "m" };
  assert.equal(at(30, 0, feet), true, "30 cells on a 5 ft scene");
  assert.equal(at(31, 0, feet), false);
  assert.equal(at(30, 0, metres), true, "the radius, straight");
  assert.equal(at(0, 30, metres), true);
  assert.equal(at(31, 0, metres), false);
  assert.equal(at(21, 21, metres), true, "inside the circle: 29,7 cells");
  assert.equal(at(22, 22, metres), false, "outside the circle: 31,1 cells");
  assert.equal(at(30, 30, metres), false, "the corner of the old square");
});

// A touch and the 1,5 m melee attacks of the active actions (Spiritual Weapon, Arcane Sword) are not circles: the diagonal
// neighbour stays in reach. Only an area written "within 1,5 m" leaves the diagonal out.
test("L25: a 1,5 m una casella vicina resta raggiungibile, anche in diagonale", async () => {
  const { spellAreaOriginWithinRange } = await import("../src/spellAreaPlacementCore.js");
  const at = (cellsX, cellsY) => spellAreaOriginWithinRange({ origin: { x: 50 + cellsX * 100, y: 50 + cellsY * 100 },
    casterOrigin: { x: 50, y: 50 }, range: { value: 1.5, unit: "m" }, dpi: 100, scale: { multiplier: 1.5, unit: "m" } });
  assert.equal(at(1, 0), true);
  assert.equal(at(-1, 1), true, "the diagonal");
  assert.equal(at(2, 0), false);
  assert.equal(at(2, 1), false);
});

// MP-09 reached only the area tool on 29/10: the other measures of a range still took a "5 ft" square for 1,524 m.
test("L25: ogni misura di una gittata conta 5 ft come 1,5 m", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["spellAreaPlacementCore.js", "spellUnifiedPanelSceneProvider.js", "spellActiveResolutionValidation.js",
    "spell-active-resolution.js", "spellZoneMovementCore.js"]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(source, /\bft: 0\.3,/, file);
    assert.doesNotMatch(source, /\bft: 0\.3048/, file);
  }
});

test("L25: l'anteprima della gittata è il cerchio di quel raggio", async () => {
  const { readFileSync } = await import("node:fs");
  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const preview = tool.slice(tool.indexOf("function spellRangePreviewPath("), tool.indexOf("function radiusLabel("));
  assert.match(preview, /type: "circle"/);
  assert.doesNotMatch(preview, /Command\.LINE/);
});

// MP-07 (decision D-B, changed by the owner on 4/11): an area written "each creature within N feet of you" is a circle of
// that radius from the caster's space, as the attack console proposes it. Only an area written as a cube is a square.
test("L25: le aree «entro N metri» sono cerchi di quel raggio attorno al token, come la proposta della console", async () => {
  const { buildArea } = await import("../src/aoeGeometryCore.js");
  const { pcAttackNearbyIds } = await import("../src/pcAttackCore.js");
  const within = (footprint, centre, cells) => buildArea("circle", centre, { x: centre.x + cells * 100, y: centre.y }, 100, { x: 0, y: 0 },
    { metric: "grid", footprint });
  const one = { widthCells: 1, heightCells: 1 };
  const two = { widthCells: 2, heightCells: 2 };
  // Medium caster on cell (0,0): within 5 ft = its cell and the 4 next to it, the same cells as any circle of that radius.
  const medium = within(one, { x: 50, y: 50 }, 1);
  assert.equal(medium.cells.length, 5);
  assert.equal(medium.cells.some((cell) => cell.x === 100 && cell.y === 100), false, "the diagonal cell is out");
  assert.deepEqual(medium.cells, buildArea("circle", { x: 50, y: 50 }, { x: 150, y: 50 }, 100, { x: 0, y: 0 }).cells);
  assert.equal(medium.points, undefined, "no square to draw");
  // Large caster on cells (0..1, 0..1): within 5 ft = 4 × 4 without the corners.
  const large = within(two, { x: 100, y: 100 }, 1);
  assert.equal(large.cells.length, 12);
  assert.equal(large.cells.some((cell) => cell.x === 200 && cell.y === 200), false, "the corner is out");
  // Same answer as the console's proposal for a creature anywhere around a Large monster, 10 ft.
  const monster = { id: "monster", bounds: { min: { x: 0, y: 0 }, max: { x: 200, y: 200 } } };
  const area = within(two, { x: 100, y: 100 }, 2);
  const inArea = new Set(area.cells.map((cell) => `${cell.x / 100},${cell.y / 100}`));
  for (let column = -4; column <= 5; column += 1) {
    for (let row = -4; row <= 5; row += 1) {
      if (column >= 0 && column <= 1 && row >= 0 && row <= 1) continue;
      const creature = { id: "creature", bounds: { min: { x: column * 100, y: row * 100 }, max: { x: column * 100 + 100, y: row * 100 + 100 } } };
      const proposed = pcAttackNearbyIds({ centerId: "monster", rows: [monster, creature], dpi: 100, feetPerCell: 5, radiusFeet: 10 });
      assert.equal(inArea.has(`${column},${row}`), proposed.length === 1, `cell ${column},${row}`);
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

test("L25: lo strumento porta la metrica «entro» nelle opzioni, nell'area salvata e nella riselezione, e la disegna come un cerchio", async () => {
  const { readFileSync } = await import("node:fs");
  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const section = (from, to) => tool.slice(tool.indexOf(from), tool.indexOf(to, tool.indexOf(from)));
  assert.match(section("function spellAreaGeometryOptions(", "function previewPath("), /\.\.\.areaMetricFields\(rule, state\),/);
  assert.match(section("function persistentAreaMetadata(", "async function persistArea("), /\.\.\.areaMetricFields\(state\.rule, state\),/);
  assert.match(section("function translatedAreaFromItem(", "\n}\n"), /metadata\.metric === "grid" \? \{ metric: "grid", footprint: metadata\.footprint \}/);
  assert.doesNotMatch(section("function geometryCommands(", "function isBossEmanation("), /area\.metric === "grid"/);
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
