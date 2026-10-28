import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L12 of the bugfix pass: the sheet's exhaustion writes move the stored base, never the effective level.
const source = readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const section = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} not found`);
  return source.slice(start, end);
};

test("L12 (EF-06): − e + dell'Indebolimento spostano di un livello la base salvata", () => {
  const adjust = section("async function adjustExhaustion(delta) {", "function buildSaveInputs() {");
  assert.match(adjust, /const base = initiativeCardBaseExhaustion\(item\);/);
  assert.match(adjust, /const nextBase = Math\.max\(0, Math\.min\(5, base \+ delta\)\);/);
  assert.match(adjust, /baseExhaustion: nextBase,/);
});

test("L12 (SC-08): lo statblock condiviso con gli omonimi non tocca la loro base dell'Indebolimento", () => {
  const share = section("async function shareMonsterStatblock(", "function setSheetImportStatus(");
  assert.match(share, /saveInitiativeCard\(target\.id, target\.name, statblock, \{ isCurrent, sceneIdentity, preserveExhaustion: true \}\)/);
});
