import test from "node:test";
import assert from "node:assert/strict";
import {
  moveClock,
  normalizeClock,
  normalizeClocksState,
} from "../src/clocksCore.js";

test("normalizeClock clamps progress and accepts supported segment counts", () => {
  const clock = normalizeClock({ id: "ritual", name: "Rituale", segments: 8, value: 11 });
  assert.equal(clock.segments, 8);
  assert.equal(clock.value, 8);
});

test("normalizeClocksState removes duplicate IDs", () => {
  const state = normalizeClocksState({ clocks: [{ id: "same" }, { id: "same" }] });
  assert.equal(state.clocks.length, 1);
});

test("moveClock reorders without mutating the source array", () => {
  const source = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const result = moveClock(source, "b", -1);
  assert.deepEqual(result.map((clock) => clock.id), ["b", "a", "c"]);
  assert.deepEqual(source.map((clock) => clock.id), ["a", "b", "c"]);
});
