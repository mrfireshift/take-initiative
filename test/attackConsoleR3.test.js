import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L20 of the bugfix pass, polish R3: the attack console's live render (selection, scene, an Undo) redrew all but
// the header, where a monster's recharge and uses left are read from the actor's resources: after an Undo they stayed
// as before it.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L20: l'aggiornamento live della console attacchi ridisegna anche l'intestazione", () => {
  const console = read("../src/pc-attack.js");
  const live = console.slice(console.indexOf("function renderLive() {"), console.indexOf("function renderHitEffect() {"));
  assert.match(live, /if\(launching\(\)\)\{renderLaunch\(\);return;\}\n(\s+\/\/.*\n)+\s+renderHeader\(\);\n\s+renderTarget\(\);/);
  const header = console.slice(console.indexOf("function renderHeader() {"), console.indexOf("function renderMirrorImage() {"));
  assert.match(header, /pcAttackMonsterTags\(attack,presentation\?\.item\?\.metadata\?\.\[META_KEY\]\?\.classFeatureState\?\.resources \|\| \{\}\)/,
    "the header reads the uses and recharge from the live resources");
  assert.doesNotMatch(header, /\.value\s*=|replaceChildren/, "it writes text only: no field the GM is typing in");
});
