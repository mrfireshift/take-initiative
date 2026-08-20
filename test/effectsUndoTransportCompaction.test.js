import test from "node:test";
import assert from "node:assert/strict";
import { compactBackgroundUndoTransportResult } from "../src/effectsUndoTransportCore.js";

test("Undo cross-frame non trasporta snapshot completi degli item", () => {
  const huge = "x".repeat(250_000);
  const change = {
    id: "token-1",
    fields: { conditions: true },
    before: { conditions: [] },
    after: { conditions: [{ id: "a" }] },
  };
  const result = {
    status: "applied",
    committed: true,
    changedIds: ["token-1"],
    changes: [change],
    plan: {
      historyUndo: true,
      changes: [change],
      changedIds: ["token-1"],
      initialItems: [{ id: "token-1", item: { id: "token-1", image: huge } }],
      finalItems: [{ id: "token-1", item: { id: "token-1", image: huge } }],
      states: [{ id: "token-1", metadata: { huge } }],
      lifecycle: [{ id: "token-1", before: { huge }, after: { huge } }],
      undoSideEffects: [],
      sideEffectsPending: [],
      operations: [],
      metadataKey: "com.thebigpicture.initiative/meta",
      effectKeys: { conditions: "conditions", spells: "spells", concentrations: "concentrations" },
    },
    commitResult: { committed: true, changedIds: ["token-1"], readBack: true },
  };

  const compact = compactBackgroundUndoTransportResult(result);

  assert.equal(compact.status, "applied");
  assert.equal(compact.committed, true);
  assert.deepEqual(compact.changedIds, ["token-1"]);
  assert.deepEqual(compact.plan.changes, result.plan.changes);
  assert.deepEqual(compact.plan.changedIds, ["token-1"]);
  assert.equal(compact.plan.historyUndo, true);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "initialItems"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "finalItems"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "states"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "lifecycle"), false);
  assert.ok(JSON.stringify(compact).length < 20_000, "il payload Undo deve restare piccolo");
});

test("un risultato senza plan resta semanticamente invariato", () => {
  const result = {
    status: "conflict",
    committed: false,
    conflicts: [{ itemId: "token-1", reason: "current-value-mismatch" }],
    changedIds: [],
  };
  assert.deepEqual(compactBackgroundUndoTransportResult(result), result);
});

test("il broker background usa il payload compatto per le risposte Undo", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
  assert.match(source, /data\.kind === "undo"[\s\S]{0,160}compactBackgroundUndoTransportResult\(result\)/u);
  assert.match(source, /EFFECTS_MUTATION_RESULT_CHANNEL,[\s\S]{0,120}result: transportResult/u);
});


test("il coordinatore non aggiunge dipendenze startup per la compattazione Undo", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /effectsUndoTransportCore\.js/u);
  assert.match(source, /function compactBackgroundUndoTransportResult\(result\)/u);
});
