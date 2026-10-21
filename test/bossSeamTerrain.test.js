// Cucitura: the space of the seam is difficult terrain while the seam exists. The speed check charges double only for
// the part of a step inside the seam; difficult terrain does not stack with the creature's own doubled cost.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activeBossSeamTerrainAreas, bossSeamTerrainSourceItems, BOSS_SEAM_TERRAIN_COST_MULTIPLIER, BOSS_SEAM_TERRAIN_ITEM_KEY } from "../src/bossSeamTerrainCore.js";
import { BOSS_SEAM_ITEM_KEY } from "../src/bossActionExecutionCore.js";
import { movementCostForSegment } from "../src/speedCheckCore.js";

const META = "com.thebigpicture.initiative/meta";
const SEAM = "com.thebigpicture.initiative/bossSeam";
const AREA = "com.thebigpicture.initiative/aoeArea";
// A 5 ft line on a 100 px grid from (0, 50) to (500, 50): the cells of row 0, columns 0..4.
const kept = (id, extra = {}) => ({ id, type: "PATH", layer: "DRAWING", position: { x: 0, y: 0 }, metadata: {
  [SEAM]: { sourceId: "boss", actionInstanceId: "a" },
  [AREA]: { version: 2, type: "line", start: { x: 0, y: 50 }, end: { x: 500, y: 50 }, dpi: 100, gridOrigin: { x: 0, y: 0 }, basePosition: { x: 0, y: 0 }, widthSquares: 1, ...extra } } });
const boss = (seam) => ({ id: "boss", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 100, hpMax: 410, bossActionState: { seam } } } });
const outline = { id: "seam-1-geometry", metadata: { [SEAM]: { sourceId: "boss" }, [AREA]: { parentId: "seam-1", dpi: 100, visual: "geometry" } } };
const portal = { id: "seam-1-portal-start", layer: "PROP", metadata: { [SEAM]: { sourceId: "boss", portal: "start" } } };

test("only the seam of the current round is terrain: its filled areas, rebuilt from the kept drawings", () => {
  assert.equal(BOSS_SEAM_TERRAIN_ITEM_KEY, BOSS_SEAM_ITEM_KEY, "the same marker as the seam drawings");
  const items = [boss({ round: 3, itemIds: ["seam-1", "seam-1-geometry", "seam-1-portal-start"] }), kept("seam-1"), outline, portal, kept("old-seam")];
  const areas = activeBossSeamTerrainAreas(items, 3);
  assert.deepEqual(areas.map((row) => [row.id, row.sourceId, row.costMultiplier]), [["seam-1", "boss", BOSS_SEAM_TERRAIN_COST_MULTIPLIER]],
    "the outline, the portal and a stale drawing are not terrain");
  assert.ok(areas[0].area.cells.length >= 5);
  assert.ok(areas[0].area.cells.every((cell) => cell.y === 0 && cell.height === 100));
  assert.deepEqual(activeBossSeamTerrainAreas(items, 4), [], "the seam collapses at the end of its round");
  // The speed check keeps only these items from each scene item event.
  assert.deepEqual(bossSeamTerrainSourceItems([...items, { id: "hero", metadata: { [META]: { hp: 10 } } }]).map((item) => item.id),
    ["boss", "seam-1", "seam-1-geometry", "old-seam"]);
  assert.deepEqual(activeBossSeamTerrainAreas(bossSeamTerrainSourceItems(items), 3).map((row) => row.id), ["seam-1"]);
  assert.deepEqual(activeBossSeamTerrainAreas([boss(undefined), kept("seam-1")], 3), [], "a torn or undone seam is not terrain");
  assert.deepEqual(activeBossSeamTerrainAreas(items, undefined), [], "no canonical round, no terrain");
  // A moved drawing moves its terrain.
  const moved = activeBossSeamTerrainAreas([boss({ round: 3, itemIds: ["seam-1"] }), { ...kept("seam-1"), position: { x: 0, y: 200 } }], 3);
  assert.ok(moved[0].area.cells.every((cell) => cell.y === 200));
});

test("the speed check charges double only inside the seam; it does not stack with the creature's own doubled cost", () => {
  const terrain = activeBossSeamTerrainAreas([boss({ round: 1, itemIds: ["seam-1"] }), kept("seam-1")], 1);
  // From (250, 350) straight up to (250, -150): 5 cells, the one of row 0 inside the seam.
  const across = movementCostForSegment({ movedCells: 5, beforePosition: { x: 250, y: 350 }, afterPosition: { x: 250, y: -150 }, terrainModifiers: terrain });
  assert.equal(Math.round(across.chargedCells * 1000) / 1000, 6, "4 cells outside + 1 cell inside at double cost");
  assert.equal(Math.round(across.terrainCells * 1000) / 1000, 1);
  // Along the seam: every foot inside.
  const along = movementCostForSegment({ movedCells: 4, beforePosition: { x: 50, y: 50 }, afterPosition: { x: 450, y: 50 }, terrainModifiers: terrain });
  assert.equal(along.chargedCells, 8);
  // Already at double cost (e.g. in Web): the seam adds nothing.
  assert.equal(movementCostForSegment({ movedCells: 4, beforePosition: { x: 50, y: 50 }, afterPosition: { x: 450, y: 50 }, baseMultiplier: 2, terrainModifiers: terrain }).chargedCells, 8);
  // Outside the seam, or without terrain, the cost is unchanged.
  const away = movementCostForSegment({ movedCells: 3, beforePosition: { x: 50, y: 350 }, afterPosition: { x: 350, y: 350 }, terrainModifiers: terrain });
  assert.deepEqual([away.chargedCells, away.terrainCells], [3, undefined]);
  assert.deepEqual(movementCostForSegment({ movedCells: 3, beforePosition: { x: 50, y: 50 }, afterPosition: { x: 350, y: 50 } }),
    { chargedCells: 3, baseCells: 3, directionalCells: 0, appliedModifiers: [] });
});

test("the speed check reads the seams from the last item event on every step, unless the creature ignores difficult terrain", async () => {
  const source = await readFile(new URL("../src/speedCheck.js", import.meta.url), "utf8");
  assert.match(source, /if \(\(Array\.isArray\(state\?\.movementImmunities\) \? state\.movementImmunities : \[\]\)\.includes\("difficult-terrain"\)\) return \[\];/);
  assert.match(source, /return \[\.\.\.activeBossSeamTerrainAreas\(seamTerrainItems, Number\(metadata\?\.\[STATE_KEY\]\?\.round\)\), \.\.\.blizzard\];/);
  assert.match(source, /seamTerrainItems = bossSeamTerrainSourceItems\(event\.items\);/);
  assert.match(source, /    directionalModifiers,\n    terrainModifiers,\n  \}\);/);
});
