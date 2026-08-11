import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPath = new URL("../quick-hp-modal.html", import.meta.url);
const scriptPath = new URL("../src/quick-hp-modal.js", import.meta.url);

test("la Console manuale conserva condizioni, scadenze e HP senza catalogo spell", async () => {
  const [html, script] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(scriptPath, "utf8"),
  ]);

  assert.doesNotMatch(html, /spell|area|zone|placement|chain|board/i);
  assert.doesNotMatch(script, /spell|area|zone|placement|chain|board/i);
  assert.match(html, /id="conditionSelect"/);
  assert.match(html, /id="conditionExpiry"/);
  assert.match(html, /id="conditionSource"/);
  assert.match(script, /function conditionExpiry\(/);
  assert.match(script, /conditionMutationOperations/);
});

test("la pipeline manuale usa HP canonici, hpMemory, effetti e undo", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /syncHPBatchToMemory/);
  assert.match(script, /withItemMetaHistory/);
  assert.match(script, /runEffectsMutation/);
  assert.match(script, /undoHistoryThrough/);
  assert.match(script, /META_KEY/);
  assert.match(script, /hpMax/);
});
