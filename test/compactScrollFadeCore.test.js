import test from "node:test";
import assert from "node:assert/strict";
import { compactScrollFadeEdges } from "../src/compactScrollFadeCore.js";

test("la striscia che sta tutta nella vista non sfuma nessun bordo", () => {
  assert.deepEqual(compactScrollFadeEdges({ scrollLeft: 0, scrollWidth: 500, clientWidth: 500 }), { left: false, right: false });
  // A pixel of rounding on a scaled tracker is not hidden content.
  assert.deepEqual(compactScrollFadeEdges({ scrollLeft: 0, scrollWidth: 500.6, clientWidth: 500 }), { left: false, right: false });
});

test("la striscia sfuma il lato dove ci sono creature fuori vista", () => {
  assert.deepEqual(compactScrollFadeEdges({ scrollLeft: 0, scrollWidth: 1270, clientWidth: 752 }), { left: false, right: true });
  assert.deepEqual(compactScrollFadeEdges({ scrollLeft: 260, scrollWidth: 1270, clientWidth: 752 }), { left: true, right: true });
  assert.deepEqual(compactScrollFadeEdges({ scrollLeft: 518, scrollWidth: 1270, clientWidth: 752 }), { left: true, right: false });
});

test("senza misure la striscia non sfuma", () => {
  assert.deepEqual(compactScrollFadeEdges(), { left: false, right: false });
});
