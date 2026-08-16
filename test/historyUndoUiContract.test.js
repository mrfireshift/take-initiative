import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const historySource = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8");
const quickHpSource = readFileSync(new URL("../src/quick-hp-modal.js", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");

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
  assert.match(panelUndo, /undoHistoryThrough\(target\.id, \{\s*sceneEpoch: operation\.epoch,\s*\}\)/su);
  const quickUndo = quickHpSource.slice(
    quickHpSource.indexOf("async function undoLastOperation"),
    quickHpSource.indexOf("function closePopover"),
  );
  assert.match(quickUndo, /undoHistoryThrough\(lastEntryId, \{\s*sceneEpoch: operation\.epoch,\s*\}\)/su);
});

test("Alt+Z host-level vive come Tool stateless nella barra principale", () => {
  assert.match(backgroundSource, /const HISTORY_UNDO_TOOL_SHORTCUT = "Alt\+Z"/u);
  assert.match(backgroundSource, /await OBR\.tool\.create\(\{/u);
  assert.doesNotMatch(backgroundSource, /await OBR\.tool\.createAction\(\{/u);
  assert.match(backgroundSource, /shortcut: HISTORY_UNDO_TOOL_SHORTCUT/u);
  assert.match(backgroundSource, /filter: \{ roles: \["GM"\] \}/u);
  assert.match(backgroundSource, /void runHistoryUndoTool\(\);\s*\/\/ Tool stateless:[\s\S]*?return false;/u);
  assert.match(backgroundSource, /undoHistoryThrough\(undefined, \{ sceneEpoch \}\)/u);
  assert.match(backgroundSource, /await mountHistoryUndoTool\(\)/u);
  assert.match(backgroundSource, /await OBR\.tool\.removeAction\(HISTORY_UNDO_TOOL_ID\)/u);
});
