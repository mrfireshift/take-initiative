import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { areaHitsBounds, buildArea, transformedAreaPoint } from "../src/aoeGeometryCore.js";

// Lot L20 of the bugfix pass, polish R3 "Aree libere": turning or resizing a drawn area on the map started the
// reselection of its targets, which moved the area only: a cone turned south kept selecting the creatures east of it.
const near = (actual, expected) => assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9,
  `${JSON.stringify(actual)} ≈ ${JSON.stringify(expected)}`);

test("L20: un punto dell'area segue posizione, rotazione e scala dell'oggetto", () => {
  near(transformedAreaPoint({ x: 100, y: 0 }, { position: { x: 0, y: 0 }, rotation: 90 }), { x: 0, y: 100 });
  near(transformedAreaPoint({ x: 100, y: 0 }, { position: { x: 50, y: 20 }, rotation: 0 }), { x: 150, y: 20 }, "a move alone, as before");
  near(transformedAreaPoint({ x: 100, y: 50 }, { position: { x: 0, y: 0 }, scale: { x: 2, y: 2 } }), { x: 200, y: 100 });
  near(transformedAreaPoint({ x: 100, y: 0 }, {}), { x: 100, y: 0 }, "untouched: where it was drawn");
});

test("L20: un cono ruotato sceglie i bersagli nella sua nuova direzione", () => {
  const dpi = 150;
  const start = { x: 0, y: 0 };
  const end = { x: dpi * 3, y: 0 };
  const turned = { position: { x: 0, y: 0 }, rotation: 90 };
  const cone = buildArea("cone", transformedAreaPoint(start, turned), transformedAreaPoint(end, turned), dpi, start);
  const token = (x, y) => ({ min: { x: x - 60, y: y - 60 }, max: { x: x + 60, y: y + 60 }, width: 120, height: 120 });
  assert.equal(areaHitsBounds(cone, token(0, dpi * 2)), true, "south, where it now points");
  assert.equal(areaHitsBounds(cone, token(dpi * 2, 0)), false, "east, where it was drawn");

  const tool = readFileSync(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(tool, /const place = \(entry\) => transformedAreaPoint\(/);
  assert.match(tool, /place\(metadata\.start\),\n\s+place\(metadata\.end\),\n\s+metadata\.dpi,\n\s+transformed \? \{ x: Number\(gridOrigin\.x\), y: Number\(gridOrigin\.y\) \} : translate\(gridOrigin\),/,
    "the cells stay on the world's grid when the area is turned or resized");
});
