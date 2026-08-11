import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/quick-hp-modal.js", import.meta.url),
  "utf8",
);
const markup = readFileSync(
  new URL("../quick-hp-modal.html", import.meta.url),
  "utf8",
);

test("la Console manuale apre la modalità effetto manuale come primo tab", () => {
  const modeGroupStart = markup.indexOf('<div class="mode-group"');
  const modeGroupEnd = markup.indexOf("</div>", modeGroupStart);
  const modeGroup = markup.slice(modeGroupStart, modeGroupEnd);
  const modes = [...modeGroup.matchAll(/data-mode="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(modes, ["save", "damage", "heal", "temp"]);
  assert.match(modeGroup, /class="mode active" data-mode="save"[^>]*>Effetti/);
  assert.match(markup, /<header class="header" data-drag-handle draggable="true"/);
  assert.doesNotMatch(markup, /Esito e condizione manuale/);
  assert.match(source, /import "\.\/popoverDrag\.js";/);
  assert.match(source, /let mode = QUICK_HP_MODES\.SAVE;/);
});

test("Quick HP non contiene più catalogo spell o percorso area", () => {
  assert.doesNotMatch(markup, /spell|area|zone|placement|chain|board/i);
  assert.doesNotMatch(source, /spell|area|zone|placement|chain|board/i);
  assert.match(markup, /id="conditionDetails"/);
  assert.match(markup, /id="conditionExpiry"/);
  assert.match(markup, /id="targetList"/);
});

test("il workflow manuale conserva le quattro operazioni e la cronologia", () => {
  assert.match(source, /QUICK_HP_MODES\.DAMAGE/);
  assert.match(source, /QUICK_HP_MODES\.HEAL/);
  assert.match(source, /QUICK_HP_MODES\.TEMP/);
  assert.match(source, /async function applyOperation/);
  assert.match(source, /withItemMetaHistory/);
  assert.match(source, /undoHistoryThrough/);
});
