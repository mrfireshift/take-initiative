import test from "node:test";
import assert from "node:assert/strict";
import { summarizeInitiativeDiagnostics } from "../src/initiativeDiagnosticsCore.js";

test("riassume render, tempi e riconciliazioni per motivo", () => {
  const summary = summarizeInitiativeDiagnostics([
    { seq: 1, ms: 10, event: "render:requested", reason: "items" },
    { seq: 2, ms: 20, event: "render:cards-reconciled", preserved: 4, replaced: 1 },
    { seq: 3, ms: 25, event: "render:committed", reason: "items", durationMs: 15 },
    { seq: 4, ms: 30, event: "render:requested", reason: "metadata" },
    { seq: 5, ms: 34, event: "render:committed", reason: "metadata", durationMs: 4 },
    { seq: 6, ms: 36, event: "render:skipped-editor", reason: "items", durationMs: 2 },
    {
      seq: 7,
      ms: 38,
      event: "render:cards-incremental",
      requested: 2,
      replaced: 1,
      skippedEditors: 1,
    },
    {
      seq: 8,
      ms: 40,
      event: "render:incremental-committed",
      reason: "items",
      durationMs: 1.5,
    },
  ]);

  assert.equal(summary.events, 8);
  assert.equal(summary.durationMs, 30);
  assert.equal(summary.render.requested, 2);
  assert.equal(summary.render.committed, 2);
  assert.equal(summary.render.skipped, 1);
  assert.deepEqual(summary.render.timing, { samples: 2, averageMs: 9.5, maxMs: 15 });
  assert.deepEqual(summary.render.byReason.items, {
    count: 1,
    samples: 1,
    averageMs: 15,
    maxMs: 15,
  });
  assert.deepEqual(summary.render.cards, {
    reconciliations: 1,
    preserved: 4,
    replaced: 1,
  });
  assert.deepEqual(summary.render.incremental, {
    committed: 1,
    timing: { samples: 1, averageMs: 1.5, maxMs: 1.5 },
    byReason: {
      items: { count: 1, samples: 1, averageMs: 1.5, maxMs: 1.5 },
    },
    cards: {
      batches: 1,
      requested: 2,
      replaced: 1,
      skippedEditors: 1,
    },
  });
});

test("un report diagnostico vuoto resta stabile", () => {
  const summary = summarizeInitiativeDiagnostics();
  assert.equal(summary.events, 0);
  assert.equal(summary.render.committed, 0);
  assert.deepEqual(summary.render.timing, { samples: 0, averageMs: 0, maxMs: 0 });
  assert.equal(summary.render.incremental.committed, 0);
});
