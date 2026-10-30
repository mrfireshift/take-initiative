import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Audit online, ON-09: a player opening a character's sheet saw the quick actions as clickable buttons, but their
// commands go to the Effects coordinator that only the GM's browser runs (two 8 s waits, then an error). Players keep
// the list to read; the buttons are off and the launcher refuses before doing anything.
const source = readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `sezione assente: ${startMarker}`);
  return source.slice(start, end);
}

test("il lancio di un'azione rapida si ferma subito per chi non è GM", () => {
  const launcher = section("async function launchQuickAction(", "const operation = sceneLifecycle.capture(");
  assert.match(launcher, /if \(!isGM\) return;/);
});

test("i pulsanti delle azioni rapide sono spenti per i giocatori, anche dopo un'esecuzione", () => {
  const list = section("function renderQuickActionList(", "actionEntry.appendChild(button);");
  assert.match(list, /else if \(!isGM\) \{\s*button\.disabled = true;\s*button\.dataset\.gmOnly = "1";/);
  assert.match(list, /Le azioni rapide le usa il GM/);
  assert.match(source, /button\.dataset\.unsupportedFeature === "1" \|\| button\.dataset\.gmOnly === "1"/);
});
