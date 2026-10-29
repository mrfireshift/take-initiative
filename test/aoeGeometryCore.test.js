import test from "node:test";
import assert from "node:assert/strict";
import {
  areaContainsBounds,
  areaIntersectsSegment,
  areaHitsBounds,
  buildArea,
  buildCircleArea,
  buildCellBoundaryLoops,
  buildConeArea,
  buildLineArea,
  buildRectangleArea,
  buildSquareArea,
  nearestGridSnap,
  snappedAreaLength,
} from "../src/aoeGeometryCore.js";

test("aggancia la dimensione dell'area a caselle intere", () => {
  assert.equal(snappedAreaLength({ x: 0, y: 0 }, { x: 460, y: 0 }, 150), 3);
});

test("il cerchio da quattro caselle include il centro e non supera il raggio", () => {
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 600, y: 0 }, 150);
  assert.equal(area.squares, 4);
  assert.ok(area.cells.some((cell) => cell.column === 0 && cell.row === 0));
  assert.ok(!area.cells.some((cell) => cell.column === 4 && cell.row === 0));
});

test("il cono colpisce davanti all'origine ma non alle sue spalle", () => {
  const area = buildConeArea({ x: 0, y: 0 }, { x: 600, y: 0 }, 150);
  assert.ok(area.cells.some((cell) => cell.column === 2 && cell.row === 0));
  assert.ok(!area.cells.some((cell) => cell.column === -1 && cell.row === 0));
});

test("il cono template include ogni casella con sovrapposizione reale", () => {
  const area = buildConeArea(
    { x: 0, y: 0 },
    { x: 450, y: 0 },
    150,
    { x: 0, y: 0 },
  );
  assert.equal(area.squares, 3);
  assert.equal(area.cells.length, 8);
  assert.ok(area.cells.some((cell) => cell.column === 2 && cell.row === 1));
  assert.ok(!area.cells.some((cell) => cell.column === 1 && cell.row === 1));
});

test("il cono scarta le caselle sfiorate da una deviazione infinitesimale", () => {
  const area = buildConeArea(
    { x: 328.5, y: 110 },
    { x: 329, y: 575 },
    155,
    { x: 96, y: 110 },
  );
  assert.deepEqual(
    area.cells.map((cell) => `${cell.column}:${cell.row}`).sort(),
    ["0:1", "0:2", "1:0", "1:1", "1:2", "2:1", "2:2"],
  );
});

test("il cono template applica la soglia anche alle basi dispari", () => {
  const origin = { x: 75, y: 75 };
  const gridOrigin = { x: 0, y: 0 };
  const counts = [1, 2, 3, 4].map((squares) => buildConeArea(
    origin,
    { x: 75, y: 75 - squares * 150 },
    150,
    gridOrigin,
  ).cells.length);
  assert.deepEqual(counts, [1, 4, 7, 12]);
});

test("il cono parte dalla mediana del lato e non include la cella alle spalle", () => {
  const area = buildConeArea(
    { x: 225, y: 150 },
    { x: 225, y: 600 },
    150,
    { x: 0, y: 0 },
  );
  assert.equal(area.squares, 3);
  assert.ok(!area.cells.some((cell) => cell.row === 0));
  assert.ok(area.cells.some((cell) => cell.row === 1));
});

test("il bordo delle celle adiacenti diventa un unico contorno senza linee interne", () => {
  const loops = buildCellBoundaryLoops([
    { x: 0, y: 0, width: 150, height: 150, column: 0, row: 0 },
    { x: 150, y: 0, width: 150, height: 150, column: 1, row: 0 },
  ]);
  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0], [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 150 },
    { x: 0, y: 150 },
  ]);
});

test("il cono template ignora le caselle che toccano soltanto il perimetro", () => {
  const area = buildConeArea(
    { x: 0, y: 0 },
    { x: 450, y: 0 },
    150,
    { x: 0, y: 0 },
  );
  assert.ok(!area.cells.some((cell) => cell.column === 3));
  assert.ok(!area.cells.some((cell) => cell.column < 0));
});

test("la sagoma del cono resta simmetrica senza aggiungere celle marginali", () => {
  const area = buildConeArea(
    { x: 0, y: 0 },
    { x: 450, y: 0 },
    150,
    { x: 0, y: 0 },
  );
  const baseCenter = {
    x: (area.points[1].x + area.points[2].x) / 2,
    y: (area.points[1].y + area.points[2].y) / 2,
  };
  assert.deepEqual(baseCenter, { x: 450, y: 0 });
  assert.equal(
    Math.hypot(area.points[1].x - baseCenter.x, area.points[1].y - baseCenter.y),
    Math.hypot(area.points[2].x - baseCenter.x, area.points[2].y - baseCenter.y),
  );
  const cells = new Set(area.cells.map((cell) => `${cell.column}:${cell.row}`));
  const unmatched = area.cells.filter((cell) => !cells.has(`${cell.column}:${-cell.row - 1}`));
  assert.equal(unmatched.length, 0);
});

test("il cono segue una direzione libera senza quantizzarla a 45 gradi", () => {
  const area = buildConeArea(
    { x: 75, y: 75 },
    { x: 525, y: 225 },
    150,
    { x: 0, y: 0 },
  );
  const baseCenter = {
    x: (area.points[1].x + area.points[2].x) / 2,
    y: (area.points[1].y + area.points[2].y) / 2,
  };
  const renderedSlope = (baseCenter.y - area.origin.y) / (baseCenter.x - area.origin.x);
  assert.ok(Math.abs(renderedSlope - (150 / 450)) < 1e-6);
  assert.ok(area.cells.some((cell) => cell.column === 2 && cell.row === 2));
});

test("la linea e larga una casella e segue la direzione", () => {
  const area = buildLineArea({ x: 0, y: 0 }, { x: 600, y: 0 }, 150);
  assert.ok(area.cells.some((cell) => cell.column === 3 && cell.row === 0));
  assert.ok(!area.cells.some((cell) => cell.column === 3 && cell.row === 1));
});

test("il rettangolo 12x2 occupa esattamente ventiquattro caselle cardinali", () => {
  const area = buildRectangleArea(
    { x: 75, y: 75 },
    { x: 1875, y: 75 },
    150,
    { x: 0, y: 0 },
    2,
  );
  assert.equal(area.squares, 12);
  assert.equal(area.widthSquares, 2);
  assert.equal(area.cells.length, 24);
  assert.deepEqual(
    [...new Set(area.cells.map((cell) => cell.row))],
    [0, 1],
  );
  assert.equal(Math.min(...area.cells.map((cell) => cell.column)), 0);
  assert.equal(Math.max(...area.cells.map((cell) => cell.column)), 11);
});

test("il rettangolo ignora le caselle marginali coperte per meno della metà", () => {
  const area = buildRectangleArea(
    { x: 75, y: 75 },
    { x: 50, y: 1875 },
    150,
    { x: 0, y: 0 },
    2,
  );
  assert.equal(area.cells.length, 24);
  assert.deepEqual(
    [...new Set(area.cells.map((cell) => cell.column))],
    [-1, 0],
  );
  assert.equal(Math.min(...area.cells.map((cell) => cell.row)), 0);
  assert.equal(Math.max(...area.cells.map((cell) => cell.row)), 11);
});

test("un'origine al centro usa comunque celle allineate alla griglia", () => {
  const area = buildCircleArea(
    { x: 75, y: 75 },
    { x: 375, y: 75 },
    150,
    { x: 0, y: 0 },
  );
  assert.ok(area.cells.every((cell) => cell.x % 150 === 0 && cell.y % 150 === 0));
  assert.ok(area.cells.some((cell) => cell.column === 2 && cell.row === 0));
  assert.ok(area.cells.some((cell) => cell.column === -2 && cell.row === 0));
});

test("lo snap tratta allo stesso modo tutti i vertici e il centro della casella", () => {
  const bottomRight = nearestGridSnap(
    { x: 145, y: 145 },
    { x: 0, y: 0 },
    150,
  );
  assert.deepEqual(bottomRight.position, { x: 150, y: 150 });
  assert.equal(bottomRight.kind, "corner");

  const center = nearestGridSnap(
    { x: 72, y: 78 },
    { x: 0, y: 0 },
    150,
  );
  assert.deepEqual(center.position, { x: 75, y: 75 });
  assert.equal(center.kind, "center");
});

test("un cono può mantenere un'origine agganciata a uno spigolo della griglia", () => {
  const snap = nearestGridSnap(
    { x: 145, y: 145 },
    { x: 0, y: 0 },
    150,
  );
  const area = buildConeArea(
    snap.position,
    { x: 595, y: 145 },
    150,
    { x: 0, y: 0 },
  );
  assert.equal(snap.kind, "corner");
  assert.deepEqual(area.points[0], snap.position);
});

test("il quadrato usa il lato maggiore del trascinamento come spigolo", () => {
  const area = buildSquareArea({ x: 0, y: 0 }, { x: 290, y: 120 }, 150);
  assert.equal(area.squares, 2);
  assert.equal(area.side, 300);
  assert.equal(area.cells.length, 4);
  const centered = buildSquareArea(
    { x: 75, y: 75 },
    { x: 365, y: 195 },
    150,
    { x: 0, y: 0 },
  );
  assert.equal(centered.cells.length, 4);
});

test("un token grande viene colpito se una delle sue caselle interseca l'area", () => {
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 300, y: 0 }, 150);
  assert.equal(areaHitsBounds(area, {
    min: { x: 225, y: -75 },
    max: { x: 525, y: 225 },
  }), true);
  assert.equal(areaHitsBounds(area, {
    min: { x: 600, y: 600 },
    max: { x: 750, y: 750 },
  }), false);
});

test("il contenimento completo richiede tutti gli angoli del token nell'area", () => {
  const area = {
    cells: [{ x: 0, y: 0, width: 600, height: 600 }],
  };
  assert.equal(areaContainsBounds(area, {
    min: { x: 150, y: 150 },
    max: { x: 300, y: 300 },
  }), true);
  assert.equal(areaContainsBounds(area, {
    min: { x: 550, y: 150 },
    max: { x: 650, y: 250 },
  }), false);
  assert.equal(areaContainsBounds(area, null), false);
});

test("un anello circolare mantiene il vuoto centrale e un contorno renderizzabile", () => {
  const area = buildCircleArea(
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    150,
    { x: 0, y: 0 },
    { ring: true, ringInnerSquares: 1 },
  );
  assert.equal(area.ring, true);
  assert.ok(area.cells.length > 0);
  assert.ok(!area.cells.some((cell) => cell.column === 0 && cell.row === 0));
  assert.ok(buildCellBoundaryLoops(area.cells).length >= 1);
});

test("la fascia laterale di una linea resta distinta dal corpo", () => {
  const body = buildArea(
    "line",
    { x: 0, y: 0 },
    { x: 900, y: 0 },
    150,
    { x: 0, y: 0 },
    { widthSquares: 1 },
  );
  const band = buildArea(
    "line",
    { x: 0, y: 0 },
    { x: 900, y: 0 },
    150,
    { x: 0, y: 0 },
    { widthSquares: 1, band: { side: "left", bandSquares: 2 } },
  );
  assert.equal(band.areaRole, "side-band");
  assert.ok(band.cells.length > 0);
  assert.ok(band.cells.some((cell) => cell.row > 0));
  assert.ok(!band.cells.some((cell) => cell.row < 0));
  assert.ok(band.cells.length > body.cells.length);
});

test("le fasce laterali di una linea seguono la direzione del tracciamento", () => {
  const left = buildArea(
    "line",
    { x: 75, y: 75 },
    { x: 75, y: 675 },
    150,
    { x: 0, y: 0 },
    { widthSquares: 1, band: { side: "left", bandSquares: 1 } },
  );
  const right = buildArea(
    "line",
    { x: 75, y: 75 },
    { x: 75, y: 675 },
    150,
    { x: 0, y: 0 },
    { widthSquares: 1, band: { side: "right", bandSquares: 1 } },
  );
  assert.ok(left.cells.some((cell) => cell.column < 0));
  assert.ok(right.cells.some((cell) => cell.column > 0));
  assert.notDeepEqual(
    left.cells.map((cell) => `${cell.column}:${cell.row}`).sort(),
    right.cells.map((cell) => `${cell.column}:${cell.row}`).sort(),
  );
});

test("le fasce circolari distinguono il lato caldo interno da quello esterno", () => {
  const inside = buildArea(
    "circle",
    { x: 75, y: 75 },
    { x: 375, y: 75 },
    150,
    { x: 0, y: 0 },
    { ringInnerSquares: 2, band: { side: "inside", bandSquares: 1 } },
  );
  const outside = buildArea(
    "circle",
    { x: 75, y: 75 },
    { x: 375, y: 75 },
    150,
    { x: 0, y: 0 },
    { ringInnerSquares: 2, band: { side: "outside", bandSquares: 1 } },
  );
  const insideCells = new Set(inside.cells.map((cell) => `${cell.column}:${cell.row}`));
  const outsideCells = new Set(outside.cells.map((cell) => `${cell.column}:${cell.row}`));
  assert.equal(insideCells.has("1:1"), true);
  assert.equal(outsideCells.has("1:1"), false);
  assert.equal(insideCells.has("2:1"), false);
  assert.equal(outsideCells.has("2:1"), true);
});

test("l'attraversamento su segmento rileva entrata e uscita anche fuori dalla sagoma", () => {
  const area = buildLineArea(
    { x: 0, y: 0 },
    { x: 900, y: 0 },
    150,
    { x: 0, y: 0 },
  );
  const bounds = {
    min: { x: 0, y: 0 },
    max: { x: 150, y: 150 },
  };
  assert.equal(
    areaIntersectsSegment(area, { x: -300, y: 75 }, { x: 1200, y: 75 }, bounds),
    true,
  );
});

test("l'attraversamento ignora il semplice contatto tangenziale con il bordo", () => {
  const line = buildLineArea(
    { x: 0, y: 0 },
    { x: 0, y: 900 },
    150,
    { x: 0, y: 0 },
    1,
    "edge",
  );
  const adjacentBounds = {
    min: { x: -300, y: 0 },
    max: { x: -150, y: 150 },
  };
  assert.equal(
    areaIntersectsSegment(
      line,
      { x: -225, y: 75 },
      { x: -225, y: 225 },
      adjacentBounds,
    ),
    false,
  );
  assert.equal(
    areaIntersectsSegment(
      line,
      { x: -225, y: 75 },
      { x: -75, y: 75 },
      { min: { x: -150, y: 0 }, max: { x: 0, y: 150 } },
    ),
    true,
  );
});

test("il movimento nella fascia adiacente a un anello non conta come attraversamento", () => {
  const ring = buildArea(
    "circle",
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    150,
    { x: 0, y: 0 },
    { widthSquares: 1, ring: true, ringInnerSquares: 1 },
  );
  assert.equal(
    areaIntersectsSegment(
      ring,
      { x: 375, y: 75 },
      { x: 375, y: 225 },
      { min: { x: 300, y: 0 }, max: { x: 450, y: 150 } },
    ),
    false,
  );
});

// ---- emanations from a token's space (custom auras) ----
const geometry = await import("../src/aoeGeometryCore.js");
const reach = (area, dpi, row = 0) => {
  const columns = area.cells.filter((cell) => cell.row === row).map((cell) => cell.column);
  return [Math.min(...columns), Math.max(...columns)];
};

test("un token 1x1 emana esattamente come il cerchio dal suo centro", () => {
  const dpi = 100;
  const center = { x: 50, y: 50 };
  const footprint = geometry.gridFootprintCells({ min: { x: 0, y: 0 }, max: { x: 100, y: 100 } }, dpi);
  assert.deepEqual(footprint, { widthCells: 1, heightCells: 1 });
  const emanation = geometry.buildFootprintEmanationArea(center, footprint, 2, dpi, { x: 0, y: 0 });
  const circle = geometry.buildCircleArea(center, { x: 250, y: 50 }, dpi, { x: 0, y: 0 });
  assert.deepEqual(emanation, circle);
});

test("un token più grande emana dalle caselle del bordo: stessa portata oltre il bordo per 2x2 e 3x3", () => {
  const dpi = 100;
  // 2x2 on columns 0..1: two cells beyond each side for a 10 ft (2-cell) aura.
  const large = geometry.gridFootprintCells({ min: { x: 0, y: 0 }, max: { x: 200, y: 200 } }, dpi);
  assert.deepEqual(large, { widthCells: 2, heightCells: 2 });
  const two = geometry.buildFootprintEmanationArea({ x: 100, y: 100 }, large, 2, dpi, { x: 0, y: 0 });
  assert.deepEqual(reach(two, dpi, 0), [-2, 3]);
  assert.deepEqual(reach(two, dpi, 1), [-2, 3]);
  assert.deepEqual(reach(two, dpi, -2), [0, 1], "straight above the token: only over its own columns");
  assert.equal(two.cells.some((cell) => cell.column === 2 && cell.row === -1), true, "a diagonal cell within reach of the corner cell");
  assert.equal(two.cells.some((cell) => cell.column === 3 && cell.row === -1), false, "the corner keeps the circular reach of a 1x1 token");
  assert.deepEqual(two.footprint, { widthCells: 2, heightCells: 2, halfWidth: 50, halfHeight: 50 });
  // The old centre-based circle reached less beyond a large token's edge.
  const centred = geometry.buildCircleArea({ x: 100, y: 100 }, { x: 300, y: 100 }, dpi, { x: 0, y: 0 });
  assert.ok(reach(centred, dpi, 0)[1] < 3);
  // 3x3 on columns 0..2: the same two cells beyond each edge.
  const huge = geometry.buildFootprintEmanationArea({ x: 150, y: 150 }, { widthCells: 3, heightCells: 3 }, 2, dpi, { x: 0, y: 0 });
  assert.deepEqual(reach(huge, dpi, 1), [-2, 4]);
  // A hit test sees a creature two cells from the edge, not three.
  assert.equal(geometry.areaHitsBounds(two, { min: { x: 300, y: 0 }, max: { x: 400, y: 100 } }), true);
  assert.equal(geometry.areaHitsBounds(two, { min: { x: 400, y: 0 }, max: { x: 500, y: 100 } }), false);
});

test("l'emanazione da un token grande non dipende da dove sta l'origine della griglia", () => {
  const dpi = 70;
  const near = geometry.buildFootprintEmanationArea({ x: 770, y: 280 }, { widthCells: 2, heightCells: 2 }, 6, dpi, { x: 700, y: 210 });
  const far = geometry.buildFootprintEmanationArea({ x: 770, y: 280 }, { widthCells: 2, heightCells: 2 }, 6, dpi, { x: 0, y: 0 });
  const key = (cell) => `${cell.x},${cell.y}`;
  assert.deepEqual(far.cells.map(key).sort(), near.cells.map(key).sort());
  assert.ok(far.cells.length > geometry.buildCircleArea({ x: 770, y: 280 }, { x: 770 + 6 * dpi, y: 280 }, dpi).cells.length, "a 2x2 token reaches more cells than its centre circle");
});

// Lot L25 of the bugfix pass (MP-03): a line one cell wide took a cell too many along it (Lightning Bolt 21×1 from a
// cell centre) or, from a vertex or across an edge, two rows (Wall of Fire 12×2).
test("L25: linee e muri larghi una casella: 20 caselle in lunghezza, una sola riga da un vertice o da un bordo", () => {
  const rows = (area) => new Set(area.cells.map((cell) => Math.round(cell.y / 100)));
  const columns = (area) => new Set(area.cells.map((cell) => Math.round(cell.x / 100)));
  // Lightning Bolt (100 ft = 20 cells) starts from the centre of the cell next to the caster (cell 0): columns 1 to 20,
  // no gap next to the caster and no 21st cell (docs/AREE_SU_GRIGLIA.md).
  const bolt = buildLineArea({ x: 150, y: 50 }, { x: 2150, y: 50 }, 100, { x: 0, y: 0 }, 1);
  assert.deepEqual(bolt.cells.map((cell) => cell.x / 100).sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(rows(bolt).size, 1);
  // A wall drawn from a vertex, horizontally and vertically: one row, one column.
  const wall = buildLineArea({ x: 0, y: 0 }, { x: 1200, y: 0 }, 100, { x: 0, y: 0 }, 1);
  assert.equal(rows(wall).size, 1);
  assert.equal(wall.cells.length, 12);
  const upright = buildLineArea({ x: 0, y: 0 }, { x: 0, y: 1200 }, 100, { x: 0, y: 0 }, 1);
  assert.equal(columns(upright).size, 1);
  assert.equal(upright.cells.length, 12);
  // From the middle of a vertical edge, going down along that edge.
  const down = buildLineArea({ x: 0, y: 50 }, { x: 0, y: 1250 }, 100, { x: 0, y: 0 }, 1);
  assert.equal(columns(down).size, 1);
  // A line two cells wide still runs on a grid line: two rows.
  const wide = buildLineArea({ x: 0, y: 0 }, { x: 1200, y: 0 }, 100, { x: 0, y: 0 }, 2);
  assert.equal(rows(wide).size, 2);
});
