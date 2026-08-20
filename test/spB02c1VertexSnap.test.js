import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArea,
} from "../src/aoeGeometryCore.js";
import {
  getSpellAreaRuleById,
} from "../src/spellAreaRules.js";
import {
  nearestGridCorner,
  constrainedSpellAreaEnd,
} from "../src/spellAreaPlacementCore.js";

const DPI = 150;
const GRID_ORIGIN = { x: 0, y: 0 };
const VERTEX_00 = { x: 0, y: 0 };

// ============================================================================
// SP-B02C.1A TESTS: VERTEX ORIGIN + FREE CONTINUOUS ROTATION
// ============================================================================

test("SP-B02C.1A T1: Start Vertex - raw start vicino a un vertice produce vertice esatto", () => {
  const rule = getSpellAreaRuleById("xanathar-onda-di-marea:cast");
  assert.ok(rule);

  const rawStartNearCenter = { x: 60, y: 60 }; // Closer to center (75, 75) than corner (0, 0)
  const corner = { x: 0, y: 0 };

  const snappedCorner = nearestGridCorner(rawStartNearCenter, corner, DPI);
  assert.deepEqual(snappedCorner.position, { x: 0, y: 0 }, "Must snap start to grid corner");
});

test("SP-B02C.1A T2: Free Angle - raw pointer (900, 137) produce direzione continua non quantizzata", () => {
  const rawPointer = { x: 900, y: 137 };
  const finalEnd = constrainedSpellAreaEnd({
    shape: "line",
    start: VERTEX_00,
    pointer: rawPointer,
    dpi: DPI,
    sizeCells: 6,
  });

  // Angle from (0,0) to rawPointer vs finalEnd must match exactly
  const expectedAngle = Math.atan2(137, 900);
  const actualAngle = Math.atan2(finalEnd.y, finalEnd.x);
  assert.ok(Math.abs(expectedAngle - actualAngle) < 1e-6, "Angle must be continuous and match raw pointer direction");
  
  // Endpoint must NOT be clamped to integer grid vertex
  assert.notEqual(finalEnd.y % DPI, 0, "Endpoint Y must be continuous, not snapped to grid line");
});

test("SP-B02C.1A T3: Small Angle Difference - pointer A(900, 120) e B(900, 130) producono angoli distinti", () => {
  const endA = constrainedSpellAreaEnd({
    shape: "line",
    start: VERTEX_00,
    pointer: { x: 900, y: 120 },
    dpi: DPI,
    sizeCells: 6,
  });

  const endB = constrainedSpellAreaEnd({
    shape: "line",
    start: VERTEX_00,
    pointer: { x: 900, y: 130 },
    dpi: DPI,
    sizeCells: 6,
  });

  assert.notEqual(endA.y, endB.y, "Endpoints must differ for slightly different pointer angles");
  const angleA = Math.atan2(endA.y, endA.x);
  const angleB = Math.atan2(endB.y, endB.x);
  assert.ok(angleB > angleA, "Angle B must be strictly greater than Angle A");
});

test("SP-B02C.1A T4: Arbitrary Rotation - angoli arbitrari (10°, 23°, 37°, 61°) producono direzioni valide", () => {
  const anglesDeg = [10, 23, 37, 61];
  for (const deg of anglesDeg) {
    const rad = (deg * Math.PI) / 180;
    const rawPointer = { x: Math.cos(rad) * 1000, y: Math.sin(rad) * 1000 };
    const end = constrainedSpellAreaEnd({
      shape: "line",
      start: VERTEX_00,
      pointer: rawPointer,
      dpi: DPI,
      sizeCells: 6,
    });

    const resultingAngleDeg = (Math.atan2(end.y, end.x) * 180) / Math.PI;
    assert.ok(
      Math.abs(resultingAngleDeg - deg) < 1e-4,
      `Angle ${deg}° must be preserved, got ${resultingAngleDeg}°`,
    );

    const area = buildArea("line", VERTEX_00, end, DPI, GRID_ORIGIN, { widthSquares: 2 });
    assert.equal(area.type, "line");
    assert.ok(area.points.length === 4, "Must generate valid polygon points");
    assert.ok(area.cells.length > 0, "Must rasterize cells");
  }
});

test("SP-B02C.1A T5: Length Invariant - per ogni angolo la lunghezza start -> end e esattamente 900px (9m)", () => {
  const anglesDeg = [0, 15, 30, 45, 60, 75, 90, 135, 180, 225, 270];
  for (const deg of anglesDeg) {
    const rad = (deg * Math.PI) / 180;
    const rawPointer = { x: Math.cos(rad) * 800, y: Math.sin(rad) * 800 };
    const end = constrainedSpellAreaEnd({
      shape: "line",
      start: VERTEX_00,
      pointer: rawPointer,
      dpi: DPI,
      sizeCells: 6,
    });

    const lengthPx = Math.hypot(end.x - VERTEX_00.x, end.y - VERTEX_00.y);
    assert.equal(Math.round(lengthPx), 900, `Length for angle ${deg}° must be exactly 900px (9m)`);
  }
});

test("SP-B02C.1A T6: Width Invariant - per ogni angolo widthSquares = 2 produce 300px (3m) di larghezza", () => {
  const anglesDeg = [0, 25, 45, 70, 90];
  for (const deg of anglesDeg) {
    const rad = (deg * Math.PI) / 180;
    const rawPointer = { x: Math.cos(rad) * 900, y: Math.sin(rad) * 900 };
    const end = constrainedSpellAreaEnd({
      shape: "line",
      start: VERTEX_00,
      pointer: rawPointer,
      dpi: DPI,
      sizeCells: 6,
    });

    const area = buildArea("line", VERTEX_00, end, DPI, GRID_ORIGIN, { widthSquares: 2 });
    assert.equal(area.widthSquares, 2);
    // Perpendicular edge width between points[0] and points[3]
    const widthPx = Math.hypot(
      area.points[0].x - area.points[3].x,
      area.points[0].y - area.points[3].y,
    );
    assert.equal(Math.round(widthPx), 300, `Width for angle ${deg}° must be exactly 300px (3m)`);
  }
});

test("SP-B02C.1A T7: Horizontal / Vertical Stability - linee ortogonali restano esatte e stabili", () => {
  // Horizontal (900, 0)
  const horizEnd = constrainedSpellAreaEnd({
    shape: "line",
    start: VERTEX_00,
    pointer: { x: 900, y: 0 },
    dpi: DPI,
    sizeCells: 6,
  });
  assert.equal(horizEnd.x, 900);
  assert.equal(horizEnd.y, 0);

  const horizArea = buildArea("line", VERTEX_00, horizEnd, DPI, GRID_ORIGIN, { widthSquares: 2 });
  assert.equal(horizArea.squares, 6);
  assert.equal(horizArea.widthSquares, 2);
  const uniqueRows = [...new Set(horizArea.cells.map((c) => c.row))].sort((a, b) => a - b);
  assert.deepEqual(uniqueRows, [-1, 0]);

  // Vertical (0, 900)
  const vertEnd = constrainedSpellAreaEnd({
    shape: "line",
    start: VERTEX_00,
    pointer: { x: 0, y: 900 },
    dpi: DPI,
    sizeCells: 6,
  });
  assert.equal(vertEnd.x, 0);
  assert.equal(vertEnd.y, 900);

  const vertArea = buildArea("line", VERTEX_00, vertEnd, DPI, GRID_ORIGIN, { widthSquares: 2 });
  assert.equal(vertArea.squares, 6);
  assert.equal(vertArea.widthSquares, 2);
  const uniqueCols = [...new Set(vertArea.cells.map((c) => c.column))].sort((a, b) => a - b);
  assert.deepEqual(uniqueCols, [-1, 0]);
});

test("SP-B02C.1A T8: Standard Line Regression - Fulmine e Vampa di Aganazzar mantengono larghezza standard", () => {
  const area = buildArea(
    "line",
    VERTEX_00,
    { x: 900, y: 0 },
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
