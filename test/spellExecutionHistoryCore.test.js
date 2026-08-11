import assert from "node:assert/strict";
import test from "node:test";
import {
  attachSpellExecutionHistory,
  spellExecutionHistoryDetails,
} from "../src/spellExecutionHistoryCore.js";

test("normalizza la History da array di changedIds e da mutation annidata", () => {
  const changedIds = ["target-1"];
  const result = attachSpellExecutionHistory(changedIds, {
    historyEntry: { id: "history-1" },
    historyPending: false,
  });

  assert.deepEqual(result, ["target-1"]);
  assert.equal(result.historyEntryId, "history-1");
  assert.equal(result.undoAvailable, true);
  assert.equal(result.historyPending, false);
});

test("una History ancora pendente non abilita Undo anche se ha un identificativo", () => {
  assert.deepEqual(
    spellExecutionHistoryDetails({
      historyEntryId: "history-pending",
      historyPending: true,
      undoAvailable: true,
    }),
    {
      historyEntryId: "history-pending",
      historyPending: true,
      undoAvailable: false,
    },
  );
});
