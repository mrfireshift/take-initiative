// Group expand/collapse made seamless (18/11), measured frame by frame on the bench: the stage counts the deck's room
// (no 8px snap), the cards stand on an opaque base while they move (A), the group's card and its first member swap
// their texts one at a time over a still frame (B), the movement starts within the first frames with a soft first step
// (C), and the animations wait one frame after the stage is built (the long frame of the rebuilt cards).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const transition = source.slice(source.indexOf("function __replaceTrackCardsMagnetic("), source.indexOf("function __replaceTrackCardsAnimated("));

test("timing: 380ms, the ease curve, the swap in two halves of 90ms", () => {
  assert.match(source, /const GROUP_LAYOUT_ANIMATION_MS = 380;/);
  assert.match(source, /const GROUP_LAYOUT_EASING = "cubic-bezier\(\.25,\.1,\.25,1\)";/);
  assert.match(source, /const GROUP_CARD_SWAP_HALF_MS = 90;/);
  assert.match(source, /const GROUP_CARD_SWAP_FADE_MS = GROUP_CARD_SWAP_HALF_MS \* 2;/);
});

test("the stage counts the room the collapsed card keeps for its deck", () => {
  assert.match(transition, /const deckRoom = motherCard\.dataset\.groupDeck === "1"/);
  assert.match(transition, /const motherSize = deckRoom \+ \(compact/);
});

test("A: an opaque base on the moving cards, back to their own colour at the end", () => {
  // The active card too since lot M1 of the animations study (the members showed through it when the turn opened the group).
  assert.match(transition, /const baseColor = getComputedStyle\(card\)\.backgroundColor;/);
  assert.match(transition, /\{ backgroundColor: GROUP_STAGE_OPAQUE_BASE, offset: 0\.8 \},\n\s+\{ backgroundColor: moving\.baseColor \},/);
});

test("B: whole blocks swap, never the portrait, the initiative, the frame's layers or the halo", () => {
  assert.match(transition, /const STILL = '\[data-badge="init"\], \[title\*="niziativa"\], \[data-active-turn-halo="1"\]';/);
  assert.match(transition, /if \(holdsStill\(child\) \|\| rect\.width > cardWidth \* 0\.97\) \{\n\s+walk\(child\);/);
  assert.match(transition, /delay: GROUP_CARD_SWAP_HALF_MS,/);
  assert.match(transition, /delay: fadeDelay \+ GROUP_CARD_SWAP_HALF_MS,/);
  // The card coming in (closing) and the one going out (opening) stand on the opaque base too, so the crossfade between
  // two cards with the same frame never draws the gradient twice; the member's card no longer leaves at the end.
  assert.match(transition, /finalLead\.style\.backgroundColor = GROUP_STAGE_OPAQUE_BASE;/);
  assert.match(transition, /swapVisual\.style\.backgroundColor = GROUP_STAGE_OPAQUE_BASE;/);
  // Once the group's card is in, the member's card goes at once (unseen under it), and the group's card turns from the
  // opaque base to its own colour over the panel in a short ramp, not a step.
  assert.match(transition, /finalLeadColor = getComputedStyle\(finalLead\)\.backgroundColor;\n\s+finalLead\.replaceWith\(stage\);/);
  assert.match(transition, /play\(record\.swapVisual, \[\{ opacity: 0 \}\], \{\n\s+duration: 1,\n\s+delay: fadeDelay \+ GROUP_CARD_SWAP_FADE_MS,/);
  assert.match(transition, /\{ backgroundColor: GROUP_STAGE_OPAQUE_BASE \},\n\s+\{ backgroundColor: record\.finalLeadColor \},\n\s+\], \{\n\s+duration: 60,\n\s+delay: fadeDelay \+ GROUP_CARD_SWAP_FADE_MS,/);
});

test("the members pile into the deck's edges, and leave from them", () => {
  assert.match(source, /function __groupDeckStackFrames\(offset, deckShift = 0, baseTransform = "none"\) \{/);
  assert.match(transition, /deckStep: deckRoom \/ 2,/);
  assert.match(transition, /__groupDeckStackFrames\(moving\.offset, record\.deckStep \* Math\.min\(moving\.index \+ 1, 2\), moving\.baseTransform\)\n\s+\.reverse\(\)/);
  assert.match(transition, /__groupDeckStackFrames\(moving\.offset, record\.deckStep \* Math\.min\(moving\.index, 2\), moving\.baseTransform\)/);
  assert.doesNotMatch(source, /function __groupAccordionFrames\(/);
});

test("C: the closing runs its frames backwards with the same easing, and every animation starts one frame later", () => {
  assert.doesNotMatch(transition, /direction: "reverse"/);
  assert.match(transition, /moving\.baseTransform\)\n\s+\.reverse\(\), \{/);
  assert.match(transition, /for \(const animation of animations\) animation\.pause\?\.\(\);\n\s+requestAnimationFrame\(\(\) => \{\n\s+if \(finished\) return;\n\s+for \(const animation of animations\) animation\.play\?\.\(\);/);
});
