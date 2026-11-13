// CAP-CARRIAGE (Xanathar): where a creature goes when it leaves the Watery Sphere. The owner's decisions SA-D1 and SA-D2
// of 12/11/2026: the nearest unoccupied space outside the sphere, within 1.5 m for one that falls out.
import test from "node:test";
import assert from "node:assert/strict";

import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { planZoneEjections, zoneEjectionDestination } from "../src/zoneEjectionCore.js";

const DPI = 100;
// The sphere: a 1.5 m radius on a grid vertex, the four squares (0,0)-(1,1).
const SPHERE = buildCircleArea({ x: 100, y: 100 }, { x: 200, y: 100 }, DPI, { x: 100, y: 100 });
const square = (column, row, cells = 1) => ({
  min: { x: column * DPI, y: row * DPI },
  max: { x: (column + cells) * DPI, y: (row + cells) * DPI },
});
const at = (column, row, cells = 1) => ({
  position: { x: (column + cells / 2) * DPI, y: (row + cells / 2) * DPI },
  bounds: square(column, row, cells),
});
// The twelve squares around the sphere.
const RING = [-1, 0, 1, 2].flatMap((column) => [-1, 0, 1, 2].map((row) => [column, row]))
  .filter(([column, row]) => column < 0 || column > 1 || row < 0 || row > 1)
  .map(([column, row], index) => ({ id: `ring-${index}`, bounds: square(column, row) }));

test("la sfera di prova: quattro caselle attorno al vertice", () => {
  assert.deepEqual(SPHERE.cells.map((cell) => [cell.column, cell.row]).sort(), [[-1, -1], [-1, 0], [0, -1], [0, 0]]);
  assert.deepEqual(SPHERE.cells.map((cell) => [cell.x, cell.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    [[0, 0], [0, 100], [100, 0], [100, 100]]);
});

test("SA-D1: chi supera esce nello spazio libero più vicino, dalla parte in cui si trova", () => {
  const destination = zoneEjectionDestination({ area: SPHERE, subject: at(0, 0) });
  assert.deepEqual(destination.position, { x: -50, y: -50 }, "dalla casella a nord-ovest, l'angolo a nord-ovest");
  assert.equal(destination.squares, 1);
  const east = zoneEjectionDestination({ area: SPHERE, subject: at(1, 1) });
  assert.deepEqual(east.position, { x: 250, y: 250 }, "dalla casella a sud-est, l'angolo a sud-est");
});

test("uno spazio occupato si salta: a pari distanza il passo più corto, poi un ordine fisso", () => {
  const destination = zoneEjectionDestination({
    area: SPHERE,
    subject: at(0, 0),
    obstacles: [square(-1, -1)],
  });
  assert.deepEqual(destination.position, { x: 50, y: -50 }, "a nord: stessa parte di ovest, prima nell'ordine");
});

test("un token che sborda un poco dalla sua casella non occupa quella accanto", () => {
  const spilling = { min: { x: -205, y: -105 }, max: { x: -95, y: 5 } };
  const destination = zoneEjectionDestination({ area: SPHERE, subject: at(0, 0), obstacles: [spilling] });
  assert.deepEqual(destination.position, { x: -50, y: -50 });
});

test("una creatura Grande cerca 2×2 caselle libere fuori dalla sfera", () => {
  const destination = zoneEjectionDestination({ area: SPHERE, subject: at(1, 1, 2) });
  assert.deepEqual(destination.space, { x: 200, y: 200, width: 200, height: 200 });
  assert.deepEqual(destination.position, { x: 300, y: 300 });
});

test("la posizione mantiene lo scarto del token dalle sue caselle; un token storto finisce sulla griglia", () => {
  const offset = zoneEjectionDestination({
    area: SPHERE,
    subject: { position: { x: 60, y: 40 }, bounds: square(0, 0) },
  });
  assert.deepEqual(offset.position, { x: -40, y: -60 });
  const unaligned = zoneEjectionDestination({
    area: SPHERE,
    subject: { position: { x: 60, y: 60 }, bounds: { min: { x: 10, y: 10 }, max: { x: 110, y: 110 } } },
  });
  assert.deepEqual(unaligned.position, { x: -50, y: -50 });
});

test("SA-D2: chi cade fuori atterra entro 1,5 m dalla sfera, o più lontano se non c'è posto", () => {
  const close = zoneEjectionDestination({
    area: SPHERE,
    subject: at(0, 0),
    obstacles: [square(-1, -1), square(0, -1), square(-1, 0)],
    withinSquares: 1,
  });
  assert.deepEqual(close.space, { x: 100, y: -100, width: 100, height: 100 },
    "il primo spazio libero a una casella dalla sfera");
  assert.equal(zoneEjectionDestination({
    area: SPHERE,
    subject: at(0, 0),
    obstacles: RING.map((entry) => entry.bounds),
    withinSquares: 1,
  }), null, "tutto attorno è occupato");
  const [fallen] = planZoneEjections({
    requests: [{ id: "a", ...at(0, 0), area: SPHERE, withinSquares: 1 }],
    obstacles: RING,
  });
  assert.equal(fallen.beyond, true);
  assert.deepEqual(fallen.position, { x: -150, y: -150 }, "oltre l'anello, dalla sua parte");
});

test("nello stesso comando due creature non finiscono nello stesso spazio; chi cade fuori sceglie per primo", () => {
  const results = planZoneEjections({
    requests: [
      { id: "a", ...at(0, 0), area: SPHERE },
      { id: "b", ...at(0, 0), area: SPHERE, withinSquares: 1 },
    ],
  });
  assert.deepEqual(results.map((result) => result.id), ["b", "a"]);
  assert.deepEqual(results[0].position, { x: -50, y: -50 });
  assert.deepEqual(results[1].position, { x: 50, y: -50 });
});

test("le creature che escono non si fanno da ostacolo; senza spazio la creatura resta e lo si dice", () => {
  const [moved] = planZoneEjections({
    requests: [{ id: "a", ...at(0, 0), area: SPHERE }],
    obstacles: [{ id: "a", bounds: square(-1, -1) }],
  });
  assert.deepEqual(moved.position, { x: -50, y: -50 }, "il proprio vecchio ingombro non conta");
  const [stuck] = planZoneEjections({
    requests: [{ id: "a", ...at(0, 0), area: SPHERE }],
    obstacles: RING,
    maxSquares: 1,
  });
  assert.deepEqual(stuck, { id: "a", position: null });
});

test("senza caselle della zona o senza ingombro del token non c'è destinazione", () => {
  assert.equal(zoneEjectionDestination({ area: { cells: [] }, subject: at(0, 0) }), null);
  assert.equal(zoneEjectionDestination({ area: SPHERE, subject: { position: { x: 0, y: 0 } } }), null);
});
