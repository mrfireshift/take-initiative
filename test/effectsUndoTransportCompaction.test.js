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
  assert.deepEqual(compact.plan.changes, [{
    id: "token-1",
    before: { conditions: null },
    after: { conditions: null },
  }]);
  assert.deepEqual(compact.plan.changedIds, ["token-1"]);
  assert.equal(compact.plan.historyUndo, true);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "initialItems"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "finalItems"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "states"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(compact.plan, "lifecycle"), false);
  assert.ok(new TextEncoder().encode(JSON.stringify(compact)).length < 20_000, "il payload Undo deve restare piccolo");
});

test("Undo conserva solo i delta necessari al reconcile e alle visual lifecycle", () => {
  const change = {
    id: "token-1",
    before: {
      spells: [{ instanceId: "spell-1", spellId: "cloudkill", casterId: "caster-1", details: "x".repeat(100_000) }],
      concentrations: {
        cloudkill: { instanceId: "spell-1", spellId: "cloudkill", targets: ["token-1"], details: "y".repeat(100_000) },
      },
      conditions: [{ id: "old", details: "z".repeat(100_000) }],
    },
    after: {
      spells: [],
      concentrations: {},
      conditions: [],
    },
    beforeMetadata: {
      hp: { present: true, value: 8 },
      classFeatureState: {
        present: true,
        value: {
          instances: [{ instanceId: "feature-1", featureId: "guardians", targetIds: ["token-1"], details: "q".repeat(100_000) }],
        },
      },
    },
    afterMetadata: {
      hp: { present: true, value: 20 },
      classFeatureState: { present: true, value: { instances: [] } },
    },
  };
  const compact = compactBackgroundUndoTransportResult({
    status: "applied",
    commandId: "undo-1",
    correlationId: "undo-1",
    sceneEpoch: 0,
    sceneIdentity: "scene-1",
    committed: true,
    changedIds: ["token-1"],
    changes: [change],
    plan: {
      historyUndo: true,
      changes: [change],
      changedIds: ["token-1"],
      states: [{ id: "token-1", details: "s".repeat(100_000) }],
      operations: [{ details: "o".repeat(100_000) }],
    },
    commitResult: {
      status: "applied",
      sideEffectChanges: [{ details: "c".repeat(100_000) }],
      postCommitErrors: [],
    },
  });
  const payloadBytes = new TextEncoder().encode(JSON.stringify(compact)).length;

  assert.ok(payloadBytes < 64 * 1024, `payload Undo troppo grande: ${payloadBytes}`);
  assert.deepEqual(compact.plan.changes[0].before.spells, [{
    instanceId: "spell-1",
    spellId: "cloudkill",
    casterId: "caster-1",
  }]);
  assert.deepEqual(compact.plan.changes[0].before.concentrations, {
    cloudkill: { instanceId: "spell-1", spellId: "cloudkill", targets: ["token-1"] },
  });
  assert.deepEqual(compact.plan.changes[0].before.conditions, null);
  assert.deepEqual(compact.plan.changes[0].beforeMetadata.hp, null);
  assert.deepEqual(compact.plan.changes[0].beforeMetadata.classFeatureState, {
    present: true,
    value: { instances: [{ instanceId: "feature-1", featureId: "guardians", targetIds: ["token-1"] }] },
  });
  assert.equal("states" in compact.plan, false);
  assert.equal("operations" in compact.plan, false);
  assert.equal("sideEffectChanges" in compact.commitResult, false);
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
  assert.match(source, /const responsePayload = \{ requestId: data\.requestId, result: transportResult \}/u);
  assert.match(source, /EFFECTS_MUTATION_RESULT_CHANNEL,[\s\S]{0,120}responsePayload/u);
});


test("il coordinatore non aggiunge dipendenze startup per la compattazione Undo", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/effectsMutations.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /effectsUndoTransportCore\.js/u);
  assert.match(source, /function compactBackgroundUndoTransportResult\(result\)/u);
});
