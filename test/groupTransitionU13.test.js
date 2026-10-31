import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const transition = source.slice(source.indexOf("function __replaceTrackCardsMagnetic("),
  source.indexOf("function __replaceTrackCardsAnimated("));

// Lot U13 of the system UX audit, measured in headless Chrome on the bench: in the expanded view the list jumped about
// 90px as a group transition began (the scroll restored while the rebuilt cards still lacked their chip rows), the
// members' names showed through the group's card as it closed, and a group opening at the end of the list grew out
// of sight.
test("U13: lo scorrimento si ripristina di nuovo nel fotogramma in cui parte la transizione", () => {
  const frame = transition.slice(transition.indexOf("requestAnimationFrame(() => {"));
  assert.match(frame, /^requestAnimationFrame\(\(\) => \{\n\s+if \(finished\) return;[\s\S]*?trackWrap\.scrollTop = Math\.min\(scrollTopBefore,/);
});

test("U13: chiudendo, i membri svaniscono insieme alla vecchia card del gruppo", () => {
  assert.match(transition, /for \(const moving of record\.movingRecords\) \{\n\s+play\(moving\.card, \[\{ opacity: 0 \}\], \{\n\s+duration: GROUP_CARD_SWAP_FADE_MS,\n\s+delay: fadeDelay,/);
});

test("U13: nella vista compatta le posizioni vengono dal layout, non dal rettangolo della card attiva ingrandita", () => {
  assert.match(transition, /\? snapshot\.layoutLeft - firstSnapshot\.layoutLeft\n\s+: snapshot\.layoutTop - firstSnapshot\.layoutTop;/);
  assert.match(transition, /\? lastRecord\.snapshot\.layoutLeft \+ lastRecord\.snapshot\.width - firstSnapshot\.layoutLeft/);
  assert.doesNotMatch(transition, /snapshot\.rect\.left - firstSnapshot\.rect\.left|snapshot\.rect\.right - firstRect\.left/);
});

test("U13: aprendo, la lista segue il bordo del gruppo in entrambe le viste, senza far uscire la card attiva", () => {
  assert.match(transition, /__revealExpandingGroup\(stages, compact, \(\) => finished\);/);
  const reveal = source.slice(source.indexOf("function __revealExpandingGroup("));
  assert.match(reveal, /candidate\.type === "expand"/);
  assert.match(reveal, /stageStart \+ activeOffset - margin/, "the active card never leaves the list");
  assert.match(reveal, /if \(isFinished\(\) \|\| !record\.stage\.isConnected\) return;/);
});
