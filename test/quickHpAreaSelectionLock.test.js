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

test("la console manuale mantiene selezione, filtri e condizioni", () => {
  assert.match(markup, /id="targetList"/);
  assert.match(markup, /id="targetNameFilter"/);
  assert.match(markup, /data-hp-faction="enemy"/);
  assert.match(markup, /id="conditionSelect"/);
  assert.match(source, /function setSelectedFromScene\(/);
  assert.match(source, /OBR\.player\.select/);
  assert.match(source, /OBR\.player\.deselect/);
});

test("Quick HP non conserva elementi DOM o controller spell/area orfani", () => {
  assert.doesNotMatch(source, /spell|area|zone|placement|chain|board|quickAction/i);
  assert.doesNotMatch(markup, /spell|area|zone|placement|chain|board|quickAction/i);
  assert.match(source, /conditionMutationOperations/);
  assert.match(source, /getHistoryEntries/);
});

test("le modifiche manuali usano merge del metadato HP canonico", () => {
  assert.match(source, /type: "hp:set"/);
  assert.match(source, /hp:\s*change\.afterHP/);
  assert.match(source, /hpMax:\s*change\.hpMax/);
  const writer = readFileSync(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
  assert.match(writer, /item\.metadata = \{ \.\.\.\(item\.metadata \|\| \{\}\), \[META_KEY\]: meta \}/);
  assert.match(source, /syncHPBatchToMemory/);
});
