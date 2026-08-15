import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const historySource = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8");
const quickHpSource = readFileSync(new URL("../src/quick-hp-modal.js", import.meta.url), "utf8");

test("pannello e Ctrl+Z usano il comando canonico con lo stesso epoch catturato", () => {
  assert.match(historySource, /export async function undoHistoryThrough\(entryId, options = \{\}\)/u);
  assert.match(historySource, /sceneEpoch = currentSceneEpoch\(\)/u);
  const panelUndo = modalSource.slice(
    modalSource.indexOf('undo.addEventListener("click"'),
    modalSource.indexOf('cleanup.addEventListener("click"'),
  );
  assert.doesNotMatch(panelUndo, /await pruneNonUndoableHistoryEntries\(/u);
  assert.match(panelUndo, /const currentState = await getHistoryUndoReadiness\(/u);
  assert.match(panelUndo, /currentState\?\.chainToken === undoState\?\.chainToken/u);
  assert.match(panelUndo, /currentRow\?\.id === selectedRow\?\.id/u);
  assert.match(panelUndo, /undoHistoryThrough\(target\.id, \{\s*sceneEpoch: operation\.sceneEpoch,\s*\}\)/su);
  const quickUndo = quickHpSource.slice(
    quickHpSource.indexOf("async function undoLastOperation"),
    quickHpSource.indexOf("function closePopover"),
  );
  assert.match(quickUndo, /undoHistoryThrough\(lastEntryId, \{\s*sceneEpoch: operation\.sceneEpoch,\s*\}\)/su);
});
