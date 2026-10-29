import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L20 of the bugfix pass, polish R3 "Menu ⚡ degli incantesimi" (docs/PIANO_BUGFIX_POLISHING.md, section 3).
// The menu is a popup with its own DOM and SDK: these check its wiring in the sources.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const menu = read("../src/spell-pill-actions.js");

test("L20: «Apri nel pannello» torna con l'incantesimo dopo un Annulla della sua fine", () => {
  const render = menu.slice(menu.indexOf("function render() {"), menu.indexOf("async function run("));
  assert.match(render, /if \(!view\) \{[\s\S]{0,300}\$\("panel"\)\.hidden = true;[\s\S]{0,80}return;\n\s+\}\n(\s+\/\/.*\n)+\s+\$\("panel"\)\.hidden = false;/);
});

test("L20: il menu resta aperto mentre si seleziona la creatura sulla mappa, e si chiude con la ×", () => {
  assert.match(read("../src/initiativeList.js"), /url: `\/spell-pill-actions\.html\?\$\{query\.toString\(\)\}`,[\s\S]{0,400}hidePaper: true,\n(\s+\/\/.*\n)+\s+disableClickAway: true,/);
  assert.match(read("../spell-pill-actions.html"), /<button id="close" class="close" type="button" aria-label="Chiudi" title="Chiudi">×<\/button>/);
  assert.match(menu, /\$\("close"\)\.addEventListener\("click", close\);/);
  assert.match(menu, /if \(event\.key === "Escape"\) close\(\);/);
});

test("L20: un doppio clic su un'azione che chiede una creatura la esegue una volta", () => {
  const run = menu.slice(menu.indexOf("async function run("), menu.indexOf("async function undo("));
  const busyAt = run.indexOf("busy = true;");
  const selectionAt = run.indexOf("OBR.player.getSelection()");
  assert.ok(busyAt > 0 && busyAt < selectionAt, "busy before the selection is awaited");
  assert.match(run, /if \(spellPillActionNeedsTargets\(action\) && !selectedTargetIds\.length\) \{\n\s+busy = false;/, "an empty selection frees the menu");
  assert.equal(run.split("busy = true;").length - 1, 1);
});
