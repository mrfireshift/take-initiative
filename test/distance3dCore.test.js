import test from "node:test";
import assert from "node:assert/strict";
import {
  gridFootprintSize,
  gridGeometryFromBounds,
  gridPlanarDistance,
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
