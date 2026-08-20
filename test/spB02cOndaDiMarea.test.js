import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArea,
  buildLineArea,
} from "../src/aoeGeometryCore.js";
import {
  getSpellAreaRuleById,
} from "../src/spellAreaRules.js";
import {
  spellAreaGridCells,
} from "../src/spellAreaPlacementCore.js";
import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellAreaResolutionCommand,
} from "../src/spellAreaResolutionCommandCore.js";
import { areaMembershipTargetIds } from "../src/spellAreaMembershipCore.js";

const DPI = 150;
const GRID_ORIGIN = { x: 0, y: 0 };
const CELL_CENTER_00 = { x: 75, y: 75 }; // Center of grid cell at column 0, row 0

// ============================================================================
// GEOMETRY RED TESTS (G1 to G6)
// ============================================================================

test("SP-B02C G1: buildArea('line', ..., { widthSquares: 2 }) propaga widthSquares a buildLineArea", () => {
  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 975, y: 75 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 2 },
  );
  assert.equal(area.type, "line");
  assert.equal(area.widthSquares, 2, "buildArea must forward widthSquares: 2 to buildLineArea");
});

test("SP-B02C G2: Visual width - distanza perpendicolare tra i bordi del poligono e esattamente 300px (3m)", () => {
  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 975, y: 75 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 2 },
  );
  // points: [0: top-left, 1: top-right, 2: bottom-right, 3: bottom-left]
  // Perpendicular width is distance between points[0] and points[3]
  const perpendicularWidth = Math.hypot(
    area.points[0].x - area.points[3].x,
    area.points[0].y - area.points[3].y,
  );
  assert.equal(Math.round(perpendicularWidth), 300, "Visual width must be exactly 300px for widthSquares: 2 at 150 DPI");
});

test("SP-B02C G3: Exact cell width (horizontal) - linea orizzontale produce esattamente 2 fasce perpendicolari di celle", () => {
  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 975, y: 75 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 2 },
  );
  const uniqueRows = [...new Set(area.cells.map((c) => c.row))].sort((a, b) => a - b);
  assert.equal(uniqueRows.length, 2, `Expected exactly 2 cell rows, got ${uniqueRows.length}: [${uniqueRows.join(", ")}]`);
});

test("SP-B02C G4: Exact cell width (vertical) - linea verticale produce esattamente 2 fasce perpendicolari di celle", () => {
  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 75, y: 975 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 2 },
  );
  const uniqueCols = [...new Set(area.cells.map((c) => c.column))].sort((a, b) => a - b);
  assert.equal(uniqueCols.length, 2, `Expected exactly 2 cell columns, got ${uniqueCols.length}: [${uniqueCols.join(", ")}]`);
});

test("SP-B02C G5: Standard line regression - widthSquares = 1 conserva esattamente 1 fascia perpendicolare (150px)", () => {
  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 975, y: 75 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 1 },
  );
  assert.equal(area.widthSquares, 1);
  const uniqueRows = [...new Set(area.cells.map((c) => c.row))];
  assert.equal(uniqueRows.length, 1, `Expected exactly 1 cell row for standard line, got ${uniqueRows.length}`);
  const perpendicularWidth = Math.hypot(
    area.points[0].x - area.points[3].x,
    area.points[0].y - area.points[3].y,
  );
  assert.equal(Math.round(perpendicularWidth), 150);
});

test("SP-B02C G6: Length invariant - la lunghezza longitudinale resta esattamente 6 celle (9m)", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 900, y: 0 };
  const area = buildArea(
    "line",
    start,
    end,
    DPI,
    GRID_ORIGIN,
    { widthSquares: 2 },
  );
  assert.equal(area.squares, 6, "Longitudinal squares must remain 6 (9 meters)");
  // Verify longitudinal projection of polygon points (min X is 0, max X is 900)
  const minX = Math.min(...area.points.map((p) => p.x));
  const maxX = Math.max(...area.points.map((p) => p.x));
  assert.equal(minX, 0, "Polygon must not extend behind start position");
  assert.equal(maxX, 900, "Polygon must reach exactly 900px (9 meters)");
  const uniqueCols = [...new Set(area.cells.map((c) => c.column))].sort((a, b) => a - b);
  assert.equal(uniqueCols.length, 6, `Expected exactly 6 columns along the length, got ${uniqueCols.length}`);
  assert.deepEqual(uniqueCols, [0, 1, 2, 3, 4, 5]);
});

// ============================================================================
// SPELL INTEGRATION TESTS (S1 to S7)
// ============================================================================

test("SP-B02C S1: Onda di Marea rule dichiara shape: line, size: 9m, width: 3m", () => {
  const rule = getSpellAreaRuleById("xanathar-onda-di-marea:cast");
  assert.ok(rule, "xanathar-onda-di-marea:cast must exist");
  assert.equal(rule.geometry.shape, "line");
  assert.equal(rule.geometry.size.value, 9);
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-onda-di-marea" });
  assert.equal(contract.presentation.targeting.selectionMode, "area");
  assert.equal(rule.targeting.selectionMode || "area", "area");

  const lengthCells = spellAreaGridCells(rule.geometry.size, { multiplier: 1.5, unit: "m" });
  const widthCells = spellAreaGridCells(rule.geometry.width, { multiplier: 1.5, unit: "m" });
  assert.equal(lengthCells, 6);
  assert.equal(widthCells, 2);
});

test("SP-B02C S2: Onda di Marea contract espone damage visible e required", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-onda-di-marea" });
  assert.equal(contract.presentation.inputs.damage.visible, true, "Damage input must be visible");
  assert.equal(contract.presentation.inputs.damage.required, true, "Damage input must be required");
});

test("SP-B02C S3: Save factors con danno 20 - failed riceve -20 (full) e passed riceve -10 (half)", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-onda-di-marea" });
  const cmd = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster-1",
    slotLevel: 3,
    targetIds: ["target-failed", "target-passed"],
    outcomes: { "target-failed": "failed", "target-passed": "passed" },
    hpAmount: 20,
    placement: {
      status: "confirmed",
      spellId: "xanathar-onda-di-marea",
      ruleId: "xanathar-onda-di-marea:cast",
      casterId: "caster-1",
      preview: {
        start: CELL_CENTER_00,
        end: { x: 975, y: 75 },
        gridOrigin: GRID_ORIGIN,
        targetIds: ["target-failed", "target-passed"],
      },
    },
  });

  assert.equal(cmd.valid, true, `Command must be valid, got errors: ${cmd.errors?.join(", ")}`);
  assert.equal(cmd.hp.outcomeFactors["target-failed"], "full");
  assert.equal(cmd.hp.outcomeFactors["target-passed"], "half");
});

test("SP-B02C S4 & S5: Secondary effect - failed applica Prono, passed non applica Prono", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-onda-di-marea" });
  const cmd = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster-1",
    slotLevel: 3,
    targetIds: ["target-failed", "target-passed"],
    outcomes: { "target-failed": "failed", "target-passed": "passed" },
    hpAmount: 20,
    placement: {
      status: "confirmed",
      spellId: "xanathar-onda-di-marea",
      ruleId: "xanathar-onda-di-marea:cast",
      casterId: "caster-1",
      preview: {
        start: CELL_CENTER_00,
        end: { x: 975, y: 75 },
        gridOrigin: GRID_ORIGIN,
        targetIds: ["target-failed", "target-passed"],
      },
    },
  });

  assert.equal(cmd.resolution.conditionApplications.length, 1);
  assert.equal(cmd.resolution.conditionApplications[0].conditionName, "Prono");
  assert.deepEqual(cmd.resolution.conditionApplications[0].targetIds, ["target-failed"]);
});

test("SP-B02C S6: Mixed command validity - comando completo con danno e esiti misti e valido", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-onda-di-marea" });
  const cmd = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster-1",
    slotLevel: 3,
    targetIds: ["target-failed", "target-passed"],
    outcomes: { "target-failed": "failed", "target-passed": "passed" },
    hpAmount: 24,
    placement: {
      status: "confirmed",
      spellId: "xanathar-onda-di-marea",
      ruleId: "xanathar-onda-di-marea:cast",
      casterId: "caster-1",
      preview: {
        start: CELL_CENTER_00,
        end: { x: 975, y: 75 },
        gridOrigin: GRID_ORIGIN,
        targetIds: ["target-failed", "target-passed"],
      },
    },
  });

  assert.equal(cmd.valid, true);
  assert.equal(cmd.hp.mode, "damage");
  assert.equal(cmd.hp.amount, 24);
});

test("SP-B02C S7: Target membership - token nella seconda fascia della linea 3m viene incluso nei target", () => {
  const metaKey = "com.thebigpicture.initiative/meta";
  const bounds = (x, y, size = 100) => ({ min: { x, y }, max: { x: x + size, y: y + size } });
  const token = (id) => ({ id, metadata: { [metaKey]: { attitude: "enemy" } } });

  // Line from (75, 75) pointing +X with widthSquares = 2 covers row 0 [0..150] and row 1 [150..300]
  // Token 1 in row 0 at (300, 25)
  // Token 2 in row 1 at (300, 175) -> inside 2nd band of 3m line!
  // Token 3 in row 2 at (300, 325) -> outside 3m line
  const candidates = [
    { item: token("token-row0"), bounds: bounds(300, 25) },
    { item: token("token-row1"), bounds: bounds(300, 175) },
    { item: token("token-outside"), bounds: bounds(300, 325) },
  ];

  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 975, y: 75 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 2 },
  );

  const hits = areaMembershipTargetIds({
    rule: { targeting: { filter: "all", includeCaster: true } },
    area,
    candidates,
    metaKey,
  });

  assert.ok(hits.includes("token-row0"), "Token in row 0 must be included");
  assert.ok(hits.includes("token-row1"), "Token in row 1 (second band) must be included");
  assert.equal(hits.includes("token-outside"), false, "Token outside 3m width must not be included");
});

// ============================================================================
// STANDARD LINE REGRESSION (Lightning Bolt & Aganazzar's Scorcher)
// ============================================================================

test("SP-B02C Regression: Fulmine e Vampa di Aganazzar mantengono larghezza 1,5m (1 casella)", () => {
  const lightningRule = getSpellAreaRuleById("lightning-bolt:cast");
  assert.equal(lightningRule.geometry.width.value, 1.5);
  const aganazzarRule = getSpellAreaRuleById("xanathar-vampa-di-aganazzar:cast");
  assert.equal(aganazzarRule.geometry.width.value, 1.5);

  const area = buildArea(
    "line",
    CELL_CENTER_00,
    { x: 975, y: 75 },
    DPI,
    GRID_ORIGIN,
    { widthSquares: 1 },
  );
  assert.equal(area.widthSquares, 1);
  const perpendicularWidth = Math.hypot(
    area.points[0].x - area.points[3].x,
    area.points[0].y - area.points[3].y,
  );
  assert.equal(Math.round(perpendicularWidth), 150);
});
