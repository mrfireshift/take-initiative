import test from "node:test";
import assert from "node:assert/strict";
import {
  createEffectsMutationCoordinator,
  EFFECTS_MUTATION_STATUS,
} from "../src/effectsMutationCoordinator.js";
import {
  createHistoryOwnerBroker,
  HISTORY_OWNER_STATUS,
} from "../src/historyOwnerCore.js";

const clone = (value) => structuredClone(value);

test("Effects resta applied/historyPending e il retry riusa la stessa entry senza duplicare", async () => {
  const stableEntry = {
    id: "effects-history:command-1",
    version: 1,
    at: 123,
    kind: "effects",
    label: "Modifica effetti",
    changes: [{ id: "token-1", fields: { conditions: true }, before: {}, after: {} }],
  };
  let historyAttempts = 0;
  let historyState = { version: 1, entries: [] };
  const historyWrites = [];
  const recordHistory = async ({ historyEntry = stableEntry } = {}) => {
    historyAttempts += 1;
    if (historyAttempts === 1) {
      const error = new Error("owner timeout");
      error.historyEntry = clone(historyEntry);
      throw error;
    }
    const duplicate = historyState.entries.find((entry) => entry.id === historyEntry.id);
    if (!duplicate) {
      historyState = { ...historyState, entries: [...historyState.entries, clone(historyEntry)] };
      historyWrites.push(clone(historyEntry));
    }
    return clone(historyEntry);
  };

  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({
      changedIds: ["token-1"],
      changes: [{ id: "token-1", fields: { conditions: true }, before: {}, after: {} }],
    }),
    commit: async () => ({ committed: true, changedIds: ["token-1"] }),
    recordHistory,
  });
  const first = await coordinator.enqueue({
    commandId: "command-1",
    operations: [{ type: "condition:add" }],
  });

  assert.equal(first.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(first.historyPending, true);
  assert.deepEqual(first.historyEntry, stableEntry);

  await recordHistory({ historyEntry: first.historyEntry });
  await recordHistory({ historyEntry: first.historyEntry });
  assert.equal(historyWrites.length, 1);
  assert.equal(historyState.entries.length, 1);
  assert.equal(historyState.entries[0].id, stableEntry.id);
});

test("un retry duplicato owner-side non produce un secondo evento Combat Log", async () => {
  const logs = [];
  let state = { entries: [] };
  const broker = createHistoryOwnerBroker({
    readHistory: async () => clone(state),
    writeHistory: async (next) => { state = clone(next); },
    recordCombatLog: async (entry) => logs.push(entry.id),
  });
  broker.setSceneContext({ ready: true, sceneIdentity: "scene-A", sceneEpoch: 1 });
  const command = (requestId) => broker.handle({
    requestId,
    commandId: "command-1",
    correlationId: "corr-1",
    kind: "append",
    sceneIdentity: "scene-A",
    entry: {
      id: "effects-history:command-1",
      version: 1,
      at: 123,
      kind: "effects",
      changes: [],
    },
  });
  assert.equal((await command("first")).status, HISTORY_OWNER_STATUS.APPLIED);
  assert.equal((await command("retry")).status, HISTORY_OWNER_STATUS.DUPLICATE);
  assert.deepEqual(logs, ["effects-history:command-1"]);
});
