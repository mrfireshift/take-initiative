import test from "node:test";
import assert from "node:assert/strict";
import { embersItemGeometry } from "../src/embersGeometryCore.js";

test("la geometria Embers usa position e image/grid/scale prima dei bounds", () => {
  const geometry = embersItemGeometry({
    id: "token-1",
    position: { x: 120, y: 240 },
    image: { width: 400, height: 200 },
    grid: { dpi: 100 },
    scale: { x: 2, y: 1 },
  }, {
    center: { x: 999, y: 999 },
    min: { x: 0, y: 0 },
    max: { x: 400, y: 1200 },
  }, 150);

  assert.deepEqual(geometry.center, { x: 120, y: 240 });
  assert.equal(geometry.diameter, 1200);
});

test("la geometria conserva larghezza e altezza per i fallback direzionali", () => {
  const geometry = embersItemGeometry({
    id: "gust-loop",
    position: { x: 120, y: 240 },
    image: { width: 1200, height: 200 },
    grid: { dpi: 200 },
    scale: { x: 2, y: 2 },
  }, null, 150);

  assert.equal(geometry.width, 1800);
  assert.equal(geometry.height, 300);
  assert.equal(geometry.diameter, 1800);
});

test("la geometria Embers usa i bounds solo come fallback per item non sized", () => {
  const geometry = embersItemGeometry({
    id: "shape-1",
    position: { x: 50, y: 75 },
  }, {
    center: { x: 50, y: 75 },
    min: { x: 0, y: 25 },
    max: { x: 100, y: 125 },
  }, 150);

  assert.equal(geometry.diameter, 100);
});
