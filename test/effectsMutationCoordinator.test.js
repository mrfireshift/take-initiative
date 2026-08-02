import test from "node:test";
import assert from "node:assert/strict";
import {
  createEffectsMutationCoordinator,
  EFFECTS_MUTATION_STATUS,
} from "../src/effectsMutationCoordinator.js";

const clone = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeCoordinator({ failFirstCommit = false, onHistory = null } = {}) {
  const store = {
    conditions: [],
    spells: [],
    concentrations: {},
  };
  const trace = [];
  let commitCount = 0;

  const prepare = async (operations) => {
    trace.push(`prepare:${operations.map((operation) => operation.type).join(",")}`);
    const before = clone(store);
    const after = clone(store);
    for (const operation of operations) {
      if (operation.type === "condition:add") after.conditions.push(operation.name);
      if (operation.type === "spell:add") after.spells.push(operation.name);
      if (operation.type === "concentration:set") {
        after.concentrations[operation.name] = { instanceId: operation.instanceId };
      }
    }
    const fields = Object.fromEntries(Object.keys(after).map((field) => [
      field,
      JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    ]));
    const changed = Object.keys(fields).filter((field) => fields[field]);
    return {
      operations: clone(operations),
      changedIds: changed.length ? ["token-1"] : [],
      changes: changed.length ? [{
        id: "token-1",
        fields,
        before,
        after,
      }] : [],
    };
  };

  const commit = async (plan) => {
    commitCount += 1;
    trace.push(`commit:${commitCount}`);
    if (failFirstCommit && commitCount === 1) throw new Error("simulated SDK failure");
    Object.assign(store, clone(plan.changes[0]?.after || store));
  };

  const coordinator = createEffectsMutationCoordinator({
    prepare,
    commit,
    recordHistory: async (context) => {
      onHistory?.(context);
      return {
        id: `history-${context.command.commandId}`,
        effectsMutation: { changes: clone(context.plan.changes) },
      };
    },
  });
  return { coordinator, store, trace };
}

test("serializes concurrent same-token condition mutations", async () => {
  const { coordinator, store, trace } = makeCoordinator();
  const [first, second] = await Promise.all([
    coordinator.enqueue({
      kind: "condition",
      operations: [{ type: "condition:add", name: "accecato" }],
    }),
    coordinator.enqueue({
      kind: "condition",
      operations: [{ type: "condition:add", name: "prono" }],
    }),
  ]);

  assert.equal(first.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(second.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.deepEqual(store.conditions, ["accecato", "prono"]);
  assert.deepEqual(trace.slice(0, 4), [
    "prepare:condition:add",
    "commit:1",
    "prepare:condition:add",
    "commit:2",
  ]);
});

test("keeps spell and concentration fields in one serial lane", async () => {
  const { coordinator, store } = makeCoordinator();
  const [spell, concentration] = await Promise.all([
    coordinator.enqueue({
      kind: "spell",
      operations: [{ type: "spell:add", name: "web" }],
    }),
    coordinator.enqueue({
      kind: "concentration",
      operations: [{ type: "concentration:set", name: "web", instanceId: "spell-1" }],
    }),
  ]);

  assert.equal(spell.status, "applied");
  assert.equal(concentration.status, "applied");
  assert.deepEqual(store.spells, ["web"]);
  assert.deepEqual(store.concentrations, { web: { instanceId: "spell-1" } });
});

test("re-reads overlapping target state at each queue head", async () => {
  const { coordinator, store } = makeCoordinator();
  const first = coordinator.enqueue({
    operations: [{ type: "condition:add", name: "A" }],
  });
  const second = coordinator.enqueue({
    operations: [{ type: "condition:add", name: "B" }],
  });
  await Promise.all([first, second]);
  assert.deepEqual(store.conditions, ["A", "B"]);
});

test("does not prepare the second serializable command before the first commit settles", async () => {
  let firstCommit;
  const commitGate = new Promise((resolve) => { firstCommit = resolve; });
  let commits = 0;
  const prepared = [];
  const gated = createEffectsMutationCoordinator({
    prepare: async (operations) => {
      prepared.push(operations[0].type);
      return {
        operations,
        changedIds: ["token-1"],
        changes: [{ id: "token-1", fields: { conditions: true }, before: {}, after: {} }],
      };
    },
    commit: async () => {
      commits += 1;
      if (commits === 1) await commitGate;
    },
  });
  const first = gated.enqueue({ operations: [{ type: "first" }] });
  const second = gated.enqueue({ operations: [{ type: "second" }] });
  await tick();
  assert.deepEqual(prepared, ["first"]);
  firstCommit();
  await Promise.all([first, second]);
  assert.equal(commits, 2);
  assert.deepEqual(prepared, ["first", "second"]);
});

test("post-commit maintenance shares the same serial lane", async () => {
  const trace = [];
  let releaseCommit;
  const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
  const coordinator = createEffectsMutationCoordinator({
    prepare: async (operations) => {
      trace.push(`prepare:${operations[0].type}`);
      return { changedIds: ["token-1"], changes: [] };
    },
    commit: async (plan) => {
      trace.push("commit:start");
      if (!plan.released) {
        plan.released = true;
        await commitGate;
      }
      trace.push("commit:end");
    },
  });
  const first = coordinator.enqueue({ operations: [{ type: "first" }] });
  const maintenance = coordinator.enqueueMaintenance(async () => {
    trace.push("maintenance");
  });
  const second = coordinator.enqueue({ operations: [{ type: "second" }] });
  await tick();
  assert.deepEqual(trace, ["prepare:first", "commit:start"]);
  releaseCommit();
  await Promise.all([first, maintenance, second]);
  assert.deepEqual(trace, [
    "prepare:first",
    "commit:start",
    "commit:end",
    "maintenance",
    "prepare:second",
    "commit:start",
    "commit:end",
  ]);
});

test("rejects operation factories instead of executing non-serializable commands", async () => {
  let commits = 0;
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({ changedIds: [], changes: [] }),
    commit: async () => { commits += 1; },
  });
  const result = await coordinator.enqueue({ operations: () => [{ type: "not-serializable" }] });
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.FAILED);
  assert.equal(result.committed, false);
  assert.equal(commits, 0);
});

test("rejects a plan that becomes stale during preparation", async () => {
  let epoch = 1;
  let releasePrepare;
  const prepareGate = new Promise((resolve) => { releasePrepare = resolve; });
  let committed = false;
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => {
      await prepareGate;
      return { changedIds: ["token-1"], changes: [{ id: "token-1", after: {} }] };
    },
    commit: async () => { committed = true; },
    isCurrent: (commandEpoch) => commandEpoch === epoch,
  });
  const task = coordinator.enqueue({ sceneEpoch: 1, operations: [{ type: "stale" }] });
  await tick();
  epoch = 2;
  releasePrepare();
  const result = await task;
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.REJECTED);
  assert.equal(committed, false);
});

test("returns correlation and touched-field history context", async () => {
  let historyContext;
  const { coordinator } = makeCoordinator({
    onHistory: (context) => { historyContext = context; },
  });
  const result = await coordinator.enqueue({
    commandId: "command-1",
    correlationId: "corr-1",
    kind: "condition",
    sceneEpoch: 4,
    operations: [{ type: "condition:add", name: "accecato" }],
  });
  assert.equal(result.status, "applied");
  assert.equal(result.commandId, "command-1");
  assert.equal(result.correlationId, "corr-1");
  assert.equal(historyContext.command.sceneEpoch, 4);
  assert.deepEqual(historyContext.plan.changes[0].fields, {
    conditions: true,
    spells: false,
    concentrations: false,
  });
});

test("undo applies the inverse when all touched fields still match", async () => {
  const { coordinator, store } = makeCoordinator();
  await coordinator.enqueue({
    operations: [{ type: "condition:add", name: "accecato" }],
  });
  const entry = {
    id: "history-1",
    effectsMutation: {
      changes: [{
        id: "token-1",
        after: { conditions: ["accecato"] },
        before: { conditions: [] },
      }],
    },
  };
  const undo = createEffectsMutationCoordinator({
    prepare: async () => ({ changedIds: [], changes: [] }),
    commit: async (plan) => { store.conditions = clone(plan.changes[0].after.conditions); },
    prepareUndo: async (selected) => ({
      changedIds: ["token-1"],
      changes: [{
        id: "token-1",
        fields: { conditions: true },
        before: { conditions: clone(store.conditions) },
        after: clone(selected.effectsMutation.changes[0].before),
      }],
    }),
  });
  const result = await undo.enqueueUndo(entry);
  assert.equal(result.status, "applied");
  assert.deepEqual(store.conditions, []);
});

test("returns conflict without partial undo when a touched field changed", async () => {
  let commits = 0;
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({ changedIds: ["token-1"], changes: [] }),
    commit: async () => { commits += 1; },
    prepareUndo: async () => ({
      status: EFFECTS_MUTATION_STATUS.CONFLICT,
      conflicts: [{ itemId: "token-1", field: "conditions" }],
    }),
  });
  const result = await coordinator.enqueueUndo({ id: "history-1" });
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.CONFLICT);
  assert.equal(commits, 0);
  assert.equal(result.conflicts[0].field, "conditions");
});

test("continues with the next command after an SDK failure", async () => {
  const { coordinator, store } = makeCoordinator({ failFirstCommit: true });
  const [failed, applied] = await Promise.all([
    coordinator.enqueue({ operations: [{ type: "condition:add", name: "first" }] }),
    coordinator.enqueue({ operations: [{ type: "condition:add", name: "second" }] }),
  ]);
  assert.equal(failed.status, EFFECTS_MUTATION_STATUS.FAILED);
  assert.equal(applied.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.deepEqual(store.conditions, ["second"]);
});

test("reports a History failure as pending after commit, never as an uncommitted failure", async () => {
  const store = { value: 0 };
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({
      changedIds: ["token-1"],
      changes: [{ id: "token-1", fields: { conditions: true }, before: {}, after: {} }],
    }),
    commit: async () => { store.value += 1; },
    recordHistory: async () => { throw new Error("history unavailable"); },
  });
  const result = await coordinator.enqueue({
    commandId: "history-failure",
    operations: [{ type: "condition:add" }],
  });
  assert.equal(store.value, 1);
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(result.committed, true);
  assert.equal(result.historyPending, true);
  assert.equal(result.historyError.message, "history unavailable");
});

test("a scene change after the persistent write never turns an applied command into rejected", async () => {
  let current = true;
  let writes = 0;
  let historyWrites = 0;
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({
      changedIds: ["token-1"],
      changes: [{ id: "token-1", fields: { conditions: true }, before: {}, after: {} }],
    }),
    commit: async () => {
      writes += 1;
      current = false;
      return { changedIds: ["token-1"], committed: true };
    },
    recordHistory: async () => { historyWrites += 1; },
    isCurrent: () => current,
  });
  const result = await coordinator.enqueue({
    sceneIdentity: "scene-A",
    operations: [{ type: "condition:add" }],
  });
  assert.equal(writes, 1);
  assert.equal(historyWrites, 0);
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(result.committed, true);
  assert.equal(result.historySkipped, true);
  assert.equal(result.historyPending, false);
});

test("post-commit side-effect errors stay applied and explicit", async () => {
  const coordinator = createEffectsMutationCoordinator({
    prepare: async () => ({
      changedIds: ["token-1"],
      changes: [{ id: "token-1", fields: { spells: true }, before: {}, after: {} }],
    }),
    commit: async () => ({
      changedIds: ["token-1"],
      committed: true,
      postCommitErrors: [{ phase: "side-effect", message: "zone delete unavailable" }],
      sideEffectsPending: [{ kind: "apply", value: { type: "static-zone:remove-ended" } }],
    }),
    recordHistory: async () => { throw new Error("effects-side-effects-pending"); },
  });
  const result = await coordinator.enqueue({ operations: [{ type: "spell:remove" }] });
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(result.committed, true);
  assert.equal(result.postCommitErrors[0].phase, "side-effect");
  assert.equal(result.sideEffectsPending.length, 1);
  assert.equal(result.historyPending, true);
});

test("supports compatibility operation results and settles without a second queue", async () => {
  const { coordinator } = makeCoordinator();
  const result = await coordinator.enqueue({
    operations: [{ type: "condition:add", name: "compat" }],
  });
  await coordinator.idle();
  assert.equal(result.status, "applied");
  assert.equal(coordinator.getState().running, false);
  assert.equal(coordinator.getState().queued, 1);
  assert.equal(coordinator.getState().completed, 1);
});
