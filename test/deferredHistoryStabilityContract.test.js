import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createEffectsMutationCoordinator,
  EFFECTS_MUTATION_STATUS,
} from "../src/effectsMutationCoordinator.js";

const effects = readFileSync(new URL("../src/effectsMutations.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `marker iniziale assente: ${start}`);
  assert.ok(to > from, `marker finale assente: ${end}`);
  return source.slice(from, to);
}

test("il background costruisce una History entry stabile prima di rinviare la scrittura", () => {
  const backgroundCoordinator = section(
    effects,
    "function createBackgroundEffectsMutationCoordinator()",
    "async function retryPendingEffectsSideEffects()",
  );
  assert.match(backgroundCoordinator, /buildHistoryEntry\s*:/);
  assert.match(backgroundCoordinator, /buildEffectsMutationHistoryEntry/);
});

test("un errore ambiguo del History owner conserva la stessa entry per il retry successivo", () => {
  const retry = section(
    effects,
    "async function retryPendingEffectsHistory()",
    "function enqueuePendingEffectsSideEffectRetry()",
  );
  assert.match(retry, /catch \(error\)/);
  assert.match(retry, /error\?\.historyEntry/);
  assert.match(retry, /pending\.historyEntry\s*=\s*clone\(error\.historyEntry\)/);
});

test("deferHistory restituisce al retry lane la entry costruita una sola volta", async () => {
  const stableEntry = {
    id: "effects-history:reminder-resolution:stable",
    at: 123456,
    kind: "reminder-resolution",
    changes: [{ id: "token-1", before: {}, after: {} }],
  };
  let historyWrites = 0;
  let builds = 0;
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({
      changedIds: ["token-1"],
      changes: stableEntry.changes,
    }),
    commit: async () => ({ committed: true, changedIds: ["token-1"] }),
    buildHistoryEntry: async () => {
      builds += 1;
      return structuredClone(stableEntry);
    },
    recordHistory: async () => {
      historyWrites += 1;
      return null;
    },
  });

  const result = await coordinator.enqueue({
    commandId: "reminder-resolution:stable",
    deferHistory: true,
    operations: [{ type: "condition:add" }],
  });

  assert.equal(result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(result.committed, true);
  assert.equal(result.historyPending, true);
  assert.equal(builds, 1);
  assert.equal(historyWrites, 0);
  assert.deepEqual(result.historyEntry, stableEntry);
});
