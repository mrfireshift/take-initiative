// The active card of the classic tracker: a pulsing halo in both views, the ⚔️ badge in the player view only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync(new URL("../src/initiativeCardClassicBuilder.js", import.meta.url), "utf8");
const trackerPage = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the active card pulses with a halo of its own, which leaves the card's shadow to the selection", () => {
  assert.match(builder, /halo\.dataset\.activeTurnHalo = "1"/);
  assert.match(builder, /animation: "tbp-active-turn-pulse 1\.6s ease-in-out infinite alternate"/);
  assert.match(builder, /pointerEvents: "none"/);
  assert.match(builder, /card\.insertBefore\(halo, card\.firstChild\)/);
  // Stable markup (no clock in the style): the tracker keeps the live active card; a rebuilt one keeps the phase.
  assert.doesNotMatch(builder, /Date\.now\(\)/);
  assert.match(builder, /halo\.addEventListener\("animationstart", \(\) => \{\s*for \(const animation of halo\.getAnimations\?\.\(\) \|\| \[\]\) animation\.startTime = 0;/);
  assert.match(trackerPage, /@keyframes tbp-active-turn-pulse \{\s*from \{ opacity: 0\.35; \}\s*to \{ opacity: 1; \}/);
  assert.match(trackerPage, /prefers-reduced-motion: reduce\) \{\s*\[data-active-turn-halo\] \{ animation: none !important/);
});

test("the active-turn badge is the players' only, with the crossed swords emoji", () => {
  assert.match(builder, /if \(isActive && !IS_GM\) \{/);
  assert.match(builder, /activeBadge\.textContent = "⚔️";/);
  assert.doesNotMatch(builder, /textContent = "⚔";/);
});
