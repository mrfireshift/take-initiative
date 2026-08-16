import assert from "node:assert/strict";
import test from "node:test";

import {
  partitionHistoryUndoRows,
  shouldHandleHistoryUndoShortcut,
} from "../src/historyUndoUiCore.js";

test("Ctrl/Cmd+Z globale usa solo la combinazione Undo sicura", () => {
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true }), true);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "Z", metaKey: true }), true);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true, shiftKey: true }), false);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true, altKey: true }), false);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true, editableTarget: true }), false);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true, busy: true }), false);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true, repeat: true }), false);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "z", ctrlKey: true, enabled: false }), false);
  assert.equal(shouldHandleHistoryUndoShortcut({ key: "y", ctrlKey: true }), false);
});

test("la cronologia Undo separa azioni operative e storico non annullabile senza cancellarlo", () => {
  const rows = [
    { id: "new", undoable: true, status: "undoable" },
    { id: "old-conflict", undoable: false, status: "conflict" },
    { id: "old-invalid", undoable: false, status: "invalid" },
  ];
  const result = partitionHistoryUndoRows(rows);
  assert.deepEqual(result.undoable.map((row) => row.id), ["new"]);
  assert.deepEqual(result.nonUndoable.map((row) => row.id), ["old-conflict", "old-invalid"]);
  assert.equal(result.conflictCount, 1);
  assert.equal(result.invalidCount, 1);
  assert.equal(rows.length, 3, "la proiezione UI non deve eliminare History");
});
