import test from "node:test";
import assert from "node:assert/strict";
import {
  areaContainsBounds,
  areaHitsBounds,
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
