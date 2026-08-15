import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHistoryUndoReadiness,
  findNonUndoableHistoryIds,
  historyEntryHasUndoPayload,
  HISTORY_UNDO_READINESS_STATUS,
  malformedHistoryEntryIds,
} from "../src/historyUndoCleanupCore.js";

const entry = (id, value = 1) => ({
  id,
  changes: [{ id: `token-${id}`, before: { hp: value }, after: { hp: value + 1 } }],
});

test("riconosce e rimuove entry senza payload Undo", async () => {
  const invalid = { id: "empty", changes: [] };
  assert.equal(historyEntryHasUndoPayload(invalid), false);
  assert.deepEqual(
    await findNonUndoableHistoryIds([invalid, entry("valid")], async (suffix) => suffix.length === 1),
    ["empty"],
  );
});

test("non cancella entry valide anche quando il suffisso live è in conflitto", async () => {
  const result = await findNonUndoableHistoryIds(
    [entry("stale"), entry("valid-a"), entry("valid-b")],
    async (suffix) => suffix.at(-1)?.id === "valid-b" && suffix[0]?.id === "valid-a",
  );
  assert.deepEqual(result, []);
});

test("non pulisce quando la validazione della scena è indeterminata", async () => {
  assert.deepEqual(
    await findNonUndoableHistoryIds([entry("maybe")], async () => null),
    [],
  );
});

test("la proiezione Undo valuta ogni suffisso senza cancellare le entry in conflitto", async () => {
  const entries = [entry("old"), entry("latest")];
  const rows = await evaluateHistoryUndoReadiness(entries, async (suffix) => (
    suffix.length === 1
      ? { changes: [{ fields: { hp: true } }], changedIds: ["token-latest"] }
      : { status: "conflict", conflicts: [{ itemId: "token-old", field: "hp" }] }
  ));

  assert.deepEqual(rows.map((row) => ({
    id: row.id,
    depth: row.depth,
    status: row.status,
    undoable: row.undoable,
  })), [
    { id: "latest", depth: 1, status: HISTORY_UNDO_READINESS_STATUS.UNDOABLE, undoable: true },
    { id: "old", depth: 2, status: HISTORY_UNDO_READINESS_STATUS.CONFLICT, undoable: false },
  ]);
  assert.deepEqual(malformedHistoryEntryIds(entries), []);
});

test("una entry priva di payload blocca il suffisso ma viene identificata separatamente", async () => {
  const invalid = { id: "invalid", label: "Solo descrizione", changes: [] };
  const rows = await evaluateHistoryUndoReadiness(
    [entry("old"), invalid],
    async () => ({ changes: [{ fields: { hp: true } }] }),
  );

  assert.deepEqual(malformedHistoryEntryIds([entry("old"), invalid]), ["invalid"]);
  assert.equal(rows[0].status, HISTORY_UNDO_READINESS_STATUS.INVALID);
  assert.equal(rows[1].status, HISTORY_UNDO_READINESS_STATUS.INVALID);
  assert.equal(rows.every((row) => row.undoable === false), true);
});

test("errore o lettura indeterminata disabilitano Undo senza trasformarsi in cleanup", async () => {
  const unavailable = await evaluateHistoryUndoReadiness([entry("a")], async () => null);
  const failed = await evaluateHistoryUndoReadiness([entry("a")], async () => {
    throw new Error("scene read failed");
  });

  assert.equal(unavailable[0].status, HISTORY_UNDO_READINESS_STATUS.UNAVAILABLE);
  assert.equal(failed[0].status, HISTORY_UNDO_READINESS_STATUS.UNAVAILABLE);
  assert.match(failed[0].error.message, /scene read failed/u);
});
