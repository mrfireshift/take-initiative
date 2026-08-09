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

test("la Console Effetti ad Area apre la scheda principale come primo tab", () => {
  const modeGroupStart = markup.indexOf('<div class="mode-group"');
  const modeGroupEnd = markup.indexOf("</div>", modeGroupStart);
  const modeGroup = markup.slice(modeGroupStart, modeGroupEnd);
  const modes = [...modeGroup.matchAll(/data-mode="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(modes, ["save", "damage", "heal", "temp"]);
  assert.match(modeGroup, /class="mode active" data-mode="save"/);
  assert.match(source, /let mode = QUICK_HP_MODES\.SAVE;/);
});
