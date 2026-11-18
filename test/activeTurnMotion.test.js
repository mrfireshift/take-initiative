// Lot M1 of the animations study (docs/STUDIO_ANIMAZIONI.md, 18/11): the turn change without steps. The new active card
// grows in 380ms with the "ease" curve in both views, two frames after the render (past its long frame); the card that
// loses the turn leaves the active look with the same timing, through a still copy laid over it; and the cards on a
// group's stage stand on an opaque base, the active one too.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const compact = readFileSync(new URL("../src/initiativeCardCompact.js", import.meta.url), "utf8");

test("the active card's timing: 380ms, ease, in both views", () => {
  assert.match(source, /const ZOOM_CFG = \{\n\s+scale: 1\.035,[^\n]*\n\s+dur:\s+380,[^\n]*\n\s+ease:\s+"cubic-bezier\(\.25,\.1,\.25,1\)"/);
  // The durations are the shared ones since lot M4 (move 380ms, fast 120ms).
  assert.match(compact, /transition: "scale var\(--obrt-motion-move, 380ms\) cubic-bezier\(\.25,\.1,\.25,1\), filter var\(--obrt-motion-fast, 120ms\) ease, box-shadow var\(--obrt-motion-move, 380ms\) cubic-bezier\(\.25,\.1,\.25,1\)/);
});

test("the growth starts two frames after the render", () => {
  const entrance = source.slice(source.indexOf("function __animateActiveCardEntrance("), source.indexOf("function __capturePreviousActiveCard("));
  assert.match(entrance, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{\n\s+if \(!card\.isConnected \|\| card\.dataset\.active !== "1"\) return;/);
});

test("the card that loses the turn fades through a still copy, out of every tracker query", () => {
  const fade = source.slice(source.indexOf("function __fadeOutPreviousActiveCard("), source.indexOf("// A member between its place in the open group"));
  for (const attribute of ["data-tracker-card", "data-item-id", "data-active"]) assert.ok(fade.includes(`"${attribute}"`), attribute);
  assert.match(fade, /ghost\.inert = true;/);
  assert.match(fade, /\{ opacity: 1, scale: from \},\n\s+\{ opacity: 0, scale: "1" \},/);
  assert.match(fade, /animation\.pause\(\);\n\s+requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => animation\.play\(\)\)\);/);
  // Only a card that is a direct child of the list: one inside a group's stage is the old card itself.
  assert.match(fade, /Array\.from\(track\.children\)\.find/);
  // Both views capture it before the cards are replaced and lay it after.
  assert.match(source, /const previousActive = animateActive && activeChanged \? __capturePreviousActiveCard\(\) : null;/);
  assert.match(source, /const previousActive = animateActive && currentActiveId !== __lastRenderedActiveId \? __capturePreviousActiveCard\(\) : null;/);
  assert.equal(source.split("__fadeOutPreviousActiveCard(previousActive);").length - 1, 2);
});

test("on a group's stage the active card stands on the opaque base too", () => {
  assert.match(source, /const baseColor = getComputedStyle\(card\)\.backgroundColor;/);
  assert.match(source, /visual\.style\.backgroundColor = GROUP_STAGE_OPAQUE_BASE;/);
});
