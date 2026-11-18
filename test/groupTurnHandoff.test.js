// A group that takes or loses the turn (18/11): the group opens or closes while the active card changes, and the frame
// by frame measurements on the bench found five steps there, none of them when the group is opened by hand.
// 1. The stage puts back the cards' styles taken before the turn changed: the selection's glow too (the Focus token moves
//    it during the transition), so the new active card lost its glow at the end and the group's card got back a stale one.
// 2. The cards taken out of the page and put back restart the active halo's pulse (to its lowest point in one frame).
// 3. The copy of the card that loses the turn (lot M1) was placed once, while the rebuilt cards above it were still short
//    of their chip rows: it stayed 21px off its card, a second card in view.
// 4. On the stage the new active card has no transition and grew in one frame.
// 5. The member that had the turn went into the deck large and bright.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const transition = source.slice(source.indexOf("function __replaceTrackCardsMagnetic("), source.indexOf("function __replaceTrackCardsAnimated("));
const finish = transition.slice(transition.indexOf("const finish = () => {"), transition.indexOf("__finishGroupLayoutTransition = finish;"));

test("1: when the stage goes, the cards show the selection of now", () => {
  assert.match(finish, /for \(const card of record\.finalCards\) \{\n\s+if \(card\?\.dataset\?\.trackerCard === "1"\) __applyTrackerSelectionState\(card\);/);
});

test("2: the active halos are put back in phase wherever the cards are moved", () => {
  const sync = source.slice(source.indexOf("function __syncActiveTurnHalos("), source.indexOf("function __capturePreviousActiveCard("));
  assert.match(sync, /root\.querySelectorAll\('\[data-active-turn-halo="1"\]'\)/);
  assert.match(sync, /for \(const animation of halo\.getAnimations\?\.\(\) \|\| \[\]\) animation\.startTime = 0;/);
  assert.match(finish, /__syncActiveTurnHalos\(track\);/);
  assert.match(transition, /\/\/ The cards moved onto the stages restarted their halo's pulse\.\n\s+__syncActiveTurnHalos\(track\);\n\n\s+const animations = \[\];/);
  assert.match(source, /track\.appendChild\(ghost\);\n[\s\S]{0,200}__syncActiveTurnHalos\(ghost\);/);
});

test("3: the copy of the card that loses the turn follows the rebuilt card frame by frame", () => {
  const fade = source.slice(source.indexOf("function __fadeOutPreviousActiveCard("), source.indexOf("// A member between its place in the open group"));
  assert.match(fade, /const place = \(\) => \{\n\s+Object\.assign\(ghost\.style, \{\n\s+left: `\$\{card\.offsetLeft\}px`,\n\s+top: `\$\{card\.offsetTop\}px`,/);
  assert.match(fade, /const follow = \(\) => \{\n\s+if \(!ghost\.isConnected \|\| !card\.isConnected\) return;\n\s+place\(\);\n\s+requestAnimationFrame\(follow\);/);
});

test("4: on a group's stage the new active card grows by an animation of its own, with the same timing", () => {
  const entrance = source.slice(source.indexOf("function __animateActiveCardEntrance("), source.indexOf("function __syncActiveTurnHalos("));
  assert.match(entrance, /const onStage = !!card\.closest\('\[data-group-transition-stage="1"\]'\);/);
  assert.match(entrance, /card\.animate\?\.\(\[\{ scale: "1" \}, \{ scale: targetScale \}\], \{ duration: ZOOM_CFG\.dur, easing: ZOOM_CFG\.ease \}\);/);
});

test("5: closing, the member that had the turn leaves the active look with M1's timing", () => {
  assert.match(transition, /for \(const card of \[record\.swapVisual, \.\.\.record\.movingRecords\.map\(\(moving\) => moving\.card\)\]\) \{\n\s+if \(card\?\.dataset\?\.active !== "1"\) continue;/);
  assert.match(transition, /\{ scale: from, filter: style\.filter \|\| "none" \},\n\s+\{ scale: "1", filter: "none" \},\n\s+\], \{ duration: ZOOM_CFG\.dur, easing: ZOOM_CFG\.ease, fill: "forwards" \}\);/);
  assert.match(transition, /play\(halo, \[\{ opacity: 0 \}\], \{ duration: ZOOM_CFG\.dur, easing: ZOOM_CFG\.ease, fill: "forwards" \}\);/);
});
