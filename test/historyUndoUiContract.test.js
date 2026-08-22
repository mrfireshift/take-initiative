import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldAutoRefreshHistoryUndoReadiness } from "../src/historyUndoUiCore.js";

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


test("pannello Undo espone un reset completo GM-only tramite History Owner", () => {
  assert.match(modalSource, /import \{ requestHistoryOwnerClear \} from "\.\/historyOwner\.js";/u);
  assert.match(modalSource, /button\("Azzera Undo", "danger"\)/u);
  assert.match(modalSource, /Azzerare tutta la cronologia Undo\?/u);
  assert.match(modalSource, /non modifica la scena né il Combat Log/u);
  assert.match(modalSource, /requestHistoryOwnerClear\(\{[\s\S]*?sceneEpoch: operation\.epoch,[\s\S]*?\}\)/u);
  assert.match(modalSource, /Cronologia Undo azzerata\. La scena e il Combat Log non sono stati modificati\./u);
});

test("History pending si rivaluta live senza richiedere reload del modal", () => {
  assert.equal(shouldAutoRefreshHistoryUndoReadiness({ status: "blocked", reason: "history-pending" }), true);
  assert.equal(shouldAutoRefreshHistoryUndoReadiness({ status: "blocked", reason: "history-removal-pending" }), true);
  assert.equal(shouldAutoRefreshHistoryUndoReadiness({ status: "ready", reason: null }), false);
  assert.equal(shouldAutoRefreshHistoryUndoReadiness({ status: "blocked", reason: "stale-scene" }), false);
  const uiCoreSource = readFileSync(new URL("../src/historyUndoUiCore.js", import.meta.url), "utf8");
  assert.match(uiCoreSource, /export function shouldAutoRefreshHistoryUndoReadiness/u);
  assert.match(modalSource, /HISTORY_PENDING_READINESS_RECHECK_MS/u);
  assert.match(modalSource, /shouldAutoRefreshHistoryUndoReadiness\(undoState\)/u);
  assert.match(modalSource, /historyPendingReadinessTimer = window\.setTimeout/u);
  assert.match(modalSource, /void scheduleRender\(\)\.catch/u);
});
