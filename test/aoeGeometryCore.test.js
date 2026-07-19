import test from "node:test";
import assert from "node:assert/strict";
import {
  areaHitsBounds,
  buildCircleArea,
  buildCellBoundaryLoops,
  buildConeArea,
  buildLineArea,
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

test("il cono template include ogni casella parzialmente coperta", () => {
  const area = buildConeArea(
    { x: 0, y: 0 },
    { x: 450, y: 0 },
    150,
    { x: 0, y: 0 },
  );
  assert.equal(area.squares, 3);
  assert.equal(area.cells.length, 9);
  assert.ok(area.cells.some((cell) => cell.column === 2 && cell.row === 1));
});

test("il cono template risolve le basi dispari senza alterare quelle pari", () => {
  const origin = { x: 75, y: 75 };
  const gridOrigin = { x: 0, y: 0 };
  const counts = [1, 2, 3, 4].map((squares) => buildConeArea(
    origin,
    { x: 75, y: 75 - squares * 150 },
    150,
    gridOrigin,
  ).cells.length);
  assert.deepEqual(counts, [3, 7, 11, 17]);
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

test("la sagoma del cono resta simmetrica e la griglia risolve un solo bordo ambiguo", () => {
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
  assert.equal(unmatched.length, 1);
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
  assert.ok(area.cells.some((cell) => cell.column === 3 && cell.row === 2));
});

test("la linea e larga una casella e segue la direzione", () => {
  const area = buildLineArea({ x: 0, y: 0 }, { x: 600, y: 0 }, 150);
  assert.ok(area.cells.some((cell) => cell.column === 3 && cell.row === 0));
  assert.ok(!area.cells.some((cell) => cell.column === 3 && cell.row === 1));
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
