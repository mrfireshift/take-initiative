import test from "node:test";
import assert from "node:assert/strict";
import {
  gridFootprintSize,
  gridGeometryFromBounds,
  gridPlanarDistance,
  gridRangeDistance,
  elevationInputToCanonical,
  gridScaleParts,
  normalizeElevation,
  planarDistance,
  spatialDistance,
} from "../src/distance3dCore.js";

test("ricava centro e ingombro dai bounds effettivi di OBR", () => {
  assert.deepEqual(gridGeometryFromBounds({
    min: { x: 150, y: 300 },
    max: { x: 450, y: 750 },
  }, 150), {
    position: { x: 300, y: 525 },
    size: { width: 300, height: 450 },
  });
});

test("legge l'ingombro dei token IMAGE dalla proprietà image", () => {
  assert.deepEqual(gridFootprintSize({
    image: { width: 150, height: 150 },
    scale: { x: 3, y: 2 },
  }, 150), {
    width: 450,
    height: 300,
  });
});

test("normalizza l'ingombro visivo a caselle intere", () => {
  assert.deepEqual(gridFootprintSize({
    image: { width: 512, height: 512 },
    scale: { x: 0.59, y: 0.59 },
  }, 150), {
    width: 300,
    height: 300,
  });
});

test("converte le immagini ad alta risoluzione usando il DPI dell'immagine OBR", () => {
  assert.deepEqual(gridFootprintSize({
    image: { width: 512, height: 512 },
    grid: { dpi: 512 },
    scale: { x: 1, y: 1 },
  }, 150), {
    width: 150,
    height: 150,
  });
});

test("conta la diagonale in caselle D&D", () => {
  const result = gridPlanarDistance({ x: 0, y: 0 }, { x: 300, y: 300 }, 150, 1.5);
  assert.equal(result.squares, 2);
  assert.equal(result.distance, 3);
});

test("misura dalla casella esterna dei token grandi", () => {
  const result = gridPlanarDistance(
    { x: 0, y: 0 },
    { x: 375, y: 0 },
    150,
    1.5,
    { width: 300, height: 300 },
    { width: 150, height: 150 }
  );
  assert.equal(result.squares, 2);
  assert.equal(result.distance, 3);
});

// The owner's decision of 4/11/2026: a range is the radius of a circle. The ruler (gridPlanarDistance) still counts squares.
test("la gittata è in linea d'aria tra le caselle occupate, e una casella vicina vale una", () => {
  const at = (cellsX, cellsY) => gridRangeDistance({ x: 0, y: 0 }, { x: cellsX * 150, y: cellsY * 150 }, 150, 1.5);
  assert.equal(at(1, 0).distance, 1.5);
  assert.equal(at(1, 1).distance, 1.5, "the diagonal neighbour: a touch reaches it");
  assert.equal(at(2, 0).distance, 3);
  assert.ok(Math.abs(at(2, 1).squares - Math.sqrt(5)) < 1e-9);
  assert.ok(Math.abs(at(2, 2).distance - 1.5 * Math.hypot(2, 2)) < 1e-9, "4,24 m, not the 3 m of the squares");
  const large = gridRangeDistance({ x: 0, y: 0 }, { x: 375, y: 375 }, 150, 1.5, { width: 300, height: 300 }, { width: 150, height: 150 });
  assert.ok(Math.abs(large.squares - Math.hypot(2, 2)) < 1e-9, "from the outer cell of a large token");
});

test("converte la distanza in pixel usando DPI e scala della griglia", () => {
  assert.equal(planarDistance({ x: 0, y: 0 }, { x: 300, y: 400 }, 100, 1.5), 7.5);
});

test("calcola l'ipotenusa tra distanza planare e dislivello", () => {
  assert.deepEqual(spatialDistance(6, 2, 10), {
    horizontal: 6,
    vertical: 8,
    spatial: 10,
  });
});

test("normalizza quote non valide e limita la precisione", () => {
  assert.equal(normalizeElevation("3.456"), 3.46);
  assert.equal(normalizeElevation("non valida"), 0);
});

test("converte l'aggiustamento quota in unità native della scala corrente", () => {
  const scale = { parsed: { multiplier: 2.5, unit: "m" } };

  assert.deepEqual(gridScaleParts(scale), {
    multiplier: 2.5,
    unit: "m",
    unitMeters: 1,
  });
  assert.equal(elevationInputToCanonical({ value: 2, unit: "grid" }, scale), 5);
  assert.equal(elevationInputToCanonical({ value: 1.5, unit: "m" }, scale), 1.5);
});

test("converte unità fisiche senza sostituire il moltiplicatore della griglia", () => {
  const scale = { parsed: { multiplier: 5, unit: "ft" } };

  assert.equal(elevationInputToCanonical({ value: 1.5, unit: "m" }, scale), 4.92);
  assert.equal(elevationInputToCanonical({ value: 1, unit: "grid" }, scale), 5);
});
