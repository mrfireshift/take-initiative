import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const initiative = read("../src/initiativeList.js");
const quickSource = read("../src/tracker-quick-actions.js");
const contextSource = read("../src/initiative-card-context-menu.js");
const quickHtml = read("../tracker-quick-actions.html");
const contextHtml = read("../initiative-card-context-menu.html");

test("i due menu applicano ingresso e uscita brevi rispettando reduced motion", () => {
  for (const html of [quickHtml, contextHtml]) {
    assert.match(html, /\.glass-shell\.is-open/);
    assert.match(html, /\.glass-shell\.is-closing/);
    assert.match(html, /prefers-reduced-motion:\s*reduce/);
  }
  for (const source of [quickSource, contextSource]) {
    assert.match(source, /function revealMenu\(\)/);
    assert.match(source, /function sendAfterExit\(/);
    assert.match(source, /EXIT_ANIMATION_MS/);
  }
});

test("apertura e posizionamento non serializzano chiusure e letture viewport", () => {
  assert.match(
    initiative,
    /const \[viewportWidthRaw, viewportHeightRaw\] = await Promise\.all\(\[/,
  );
  assert.equal(
    (initiative.match(/const \[, , (?:basePlacement|placement)\] = await Promise\.all\(\[/g) || []).length,
    2,
  );
  assert.doesNotMatch(
    contextSource,
    /requestAnimationFrame\(\(\) => requestAnimationFrame/,
  );
});
