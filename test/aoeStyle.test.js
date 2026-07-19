import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AOE_STYLE, normalizeAoEStyle } from "../src/aoeStyle.js";

test("normalizza le opzioni grafiche delle aree entro limiti leggibili", () => {
  assert.deepEqual(normalizeAoEStyle({
    fillColor: "#EF4444",
    strokeColor: "#22C55E",
    fillOpacity: 0.9,
    strokeWidth: 0.1,
  }), {
    fillColor: "#ef4444",
    strokeColor: "#22c55e",
    fillOpacity: 0.45,
    strokeWidth: 0.4,
  });
  assert.equal(normalizeAoEStyle({ fillColor: "not-a-color" }).fillColor, DEFAULT_AOE_STYLE.fillColor);
});
