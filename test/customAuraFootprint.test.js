// Source contract: a custom aura radiates from the cells its source token occupies (not from its centre),
// and the outline follows that footprint; a 1x1 token keeps the circle it always had.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/customAuraController.js", import.meta.url), "utf8");

test("membership uses the source footprint", () => {
  assert.match(controller, /const footprint = gridFootprintCells\(sourceBounds, dpi\);\n    const area = buildFootprintEmanationArea\(center, footprint, sizeCells, dpi, gridOrigin\);/);
  assert.match(controller, /footprint: area\.footprint \|\| null,/);
});

test("the outline follows the footprint and a resized token gets a new outline", () => {
  assert.match(controller, /\.commands\(footprintCommands\(radius, footprint\?\.halfWidth \|\| 0, footprint\?\.halfHeight \|\| 0\)\)/);
  assert.match(controller, /if \(!\(halfWidth > 0\) && !\(halfHeight > 0\)\) return circleCommands\(radius\);/, "1x1: the same circle as before");
  assert.match(controller, /\(Number\(actual\.footprintWidthCells\) \|\| 1\) === expected\.footprintWidthCells/);
  assert.match(controller, /\(Number\(actual\.footprintHeightCells\) \|\| 1\) === expected\.footprintHeightCells/);
});
