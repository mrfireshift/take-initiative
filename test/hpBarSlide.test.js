// Lot M5 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): the tracker's HP bars slide to their new width in
// 180ms instead of jumping, also across the card's rebuild ~55ms later. Only the drawing: no writer of the bar changes.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { HP_BAR_SLIDE_MS, hpFillKey, hpFillPercent, hpSlidePlan } from "../src/hpBarSlide.js";

const fill = (itemId, width, groupCollapsed = false) => ({
  dataset: { itemId },
  style: { width },
  closest: () => ({ dataset: groupCollapsed ? { groupCollapsed: "1" } : {} }),
});

test("180ms, and the bar's width read as a percentage", () => {
  assert.equal(HP_BAR_SLIDE_MS, 180);
  assert.equal(hpFillPercent(fill("klos", "45.11%")), 45.11);
  assert.equal(hpFillPercent(fill("klos", "")), null);
});

test("a collapsed group's card has a key of its own, apart from its first member's", () => {
  assert.equal(hpFillKey(fill("gnoll-1", "50%")), "gnoll-1");
  assert.equal(hpFillKey(fill("gnoll-1", "50%", true)), "gnoll-1#group");
  assert.equal(hpFillKey({ dataset: {}, style: {} }), "");
});

test("the first bar seen and a bar that did not change are only remembered", () => {
  assert.deepEqual(hpSlidePlan(null, 50, 1000), { action: "remember" });
  assert.deepEqual(hpSlidePlan({ from: 40, to: 50, start: 0 }, 50, 1000), { action: "remember" });
});

test("a new width slides; a bar rebuilt in the middle of a slide takes it up where it was", () => {
  assert.deepEqual(hpSlidePlan({ from: 100, to: 100, start: -Infinity }, 45, 1000), { action: "slide", to: 45, running: false });
  assert.deepEqual(hpSlidePlan({ from: 100, to: 45, start: 1000 }, 45, 1055), { action: "resume", from: 100, to: 45, elapsed: 55 });
  assert.deepEqual(hpSlidePlan({ from: 100, to: 45, start: 1000 }, 90, 1090), { action: "slide", to: 90, running: true });
});

test("installed once on the tracker's list, the writers of the bar left as they are", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(source, /import \{ installHPBarSlide \} from "\.\/hpBarSlide\.js";/);
  assert.match(source, /trackWrap\.appendChild\(track\);\n\/\/ Lot M5[^\n]*\ninstallHPBarSlide\(track\);/);
  const module = readFileSync(new URL("../src/hpBarSlide.js", import.meta.url), "utf8");
  assert.match(module, /attributeFilter: \["style"\]/);
  assert.match(module, /prefers-reduced-motion: reduce/);
  assert.match(module, /fill\.closest\?\.\("\[data-active-turn-ghost\]"\)/);
});
