import test from "node:test";
import assert from "node:assert/strict";
import { createEffectsMutationBackgroundBroker } from "../src/effectsMutationBroker.js";
import {
  createEffectsMutationCoordinator,
  EFFECTS_MUTATION_STATUS,
} from "../src/effectsMutationCoordinator.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

const clone = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function createSharedRuntime() {
  const store = new Map(["token-1", "token-2", "token-3"].map((id) => [id, {
    id,
    name: id,
    conditions: [],
    spells: [],
    concentrations: {},
    foreign: { preserved: true },
  }]));
  const history = [];
  const trace = [];
  let activeSceneIdentity = "scene-A";
  let failNextCommit = false;
  let commitGate = null;

  const coordinator = createEffectsMutationCoordinator({
    prepare: async (operations) => {
      trace.push(`prepare:${operations.map((operation) => operation.type).join(",")}`);
      return buildEffectsMutationPlan([...store.values()].map(clone), operations);
    },
    prepareUndo: async (entryOrEntries) => {
      const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
      const simulated = new Map([...store].map(([id, state]) => [id, clone(state)]));
      const touched = new Map();
      const conflicts = [];
      for (const entry of entries) {
        for (const change of entry?.effectsMutation?.changes || []) {
          const current = simulated.get(change.id);
          if (!current) {
            conflicts.push({ itemId: change.id, reason: "missing-item" });
            continue;
          }
          const fields = touched.get(change.id) || new Set();
          for (const field of Object.keys(change.fields || {}).filter((key) => change.fields[key])) {
            if (!same(current[field], change.after[field])) {
              conflicts.push({ itemId: change.id, field, reason: "current-value-mismatch" });
              continue;
            }
            fields.add(field);
            current[field] = clone(change.before[field]);
          }
          touched.set(change.id, fields);
        }
      }
      if (conflicts.length) return { status: EFFECTS_MUTATION_STATUS.CONFLICT, conflicts };
      const changes = [...touched].map(([id, fields]) => ({
        id,
        fields: Object.fromEntries([...fields].map((field) => [field, true])),
        before: Object.fromEntries([...fields].map((field) => [field, clone(store.get(id)[field])])),
        after: Object.fromEntries([...fields].map((field) => [field, clone(simulated.get(id)[field])])),
      }));
      return { changedIds: changes.map((change) => change.id), changes };
    },
    commit: async (plan, { isCurrent }) => {
      if (commitGate) await commitGate;
      if (!isCurrent()) {
        return {
          status: EFFECTS_MUTATION_STATUS.REJECTED,
          reason: "stale-before-shared-store-write",
          committed: false,
          changedIds: [],
        };
      }
      if (failNextCommit) {
        failNextCommit = false;
        throw new Error("shared SDK failure");
      }
      trace.push(`commit:${plan.changedIds.join(",")}`);
      for (const change of plan.changes || []) {
        const current = store.get(change.id);
        for (const field of Object.keys(change.fields || {}).filter((key) => change.fields[key])) {
          current[field] = clone(change.after[field]);
        }
      }
      return { changedIds: [...(plan.changedIds || [])] };
    },
    recordHistory: async ({ command, plan }) => {
      const changes = plan.changes.map((change) => {
        const fields = Object.fromEntries(
          Object.entries(change.fields || {}).filter(([, touched]) => touched)
        );
        return {
          id: change.id,
          fields,
          before: Object.fromEntries(Object.keys(fields).map((field) => [field, clone(change.before[field])])),
          after: Object.fromEntries(Object.keys(fields).map((field) => [field, clone(change.after[field])])),
        };
      });
      const entry = {
        id: `history:${command.commandId}`,
        effectsMutation: { commandId: command.commandId, changes },
      };
      history.push(entry);
      return entry;
    },
    isCurrent: (sceneIdentity) => sceneIdentity === activeSceneIdentity,
  });

  const broker = createEffectsMutationBackgroundBroker({
    executeApply: (operations, command) => coordinator.enqueue({ ...command, operations }),
    executeUndo: (entry, command) => coordinator.enqueueUndo(entry, command),
  });
  broker.setSceneIdentity(activeSceneIdentity);

  function client(name) {
    let sequence = 0;
    return {
      async context() {
        return (await broker.handle({ kind: "context", requestId: `${name}:context:${++sequence}` })).result;
      },
      async apply(operations, options = {}) {
        const context = await this.context();
        return (await broker.handle({
          kind: "apply",
          requestId: `${name}:apply:${++sequence}`,
          command: {
            commandId: options.commandId || `${name}:command:${sequence}`,
            sceneIdentity: options.sceneIdentity || context.sceneIdentity,
            operations: clone(operations),
            history: options.history,
          },
        })).result;
      },
      async undo(entries, options = {}) {
        const context = await this.context();
        return (await broker.handle({
          kind: "undo",
          requestId: `${name}:undo:${++sequence}`,
          entry: clone(entries),
          options: {
            commandId: options.commandId || `${name}:undo-command:${sequence}`,
            sceneIdentity: options.sceneIdentity || context.sceneIdentity,
          },
        })).result;
      },
    };
  }

  return {
    broker,
    clientA: client("iframe-A"),
    clientB: client("iframe-B"),
    coordinator,
    history,
    store,
    trace,
    failNext: () => { failNextCommit = true; },
    gateCommits: (promise) => { commitGate = promise; },
    rotateScene: (identity) => {
      activeSceneIdentity = identity;
      broker.setSceneIdentity(identity);
    },
  };
}

function condition(id, targetId) {
  return {
    id,
    condition: id,
    active: true,
    targetId,
    expiry: { mode: "manual" },
  };
}

test("due iframe condividono una sola lane background per condition + condition", async () => {
  const runtime = createSharedRuntime();
  const [first, second] = await Promise.all([
    runtime.clientA.apply([{
      type: "condition:add-instances",
      instancesByTarget: { "token-1": [condition("A", "token-1")] },
    }]),
    runtime.clientB.apply([{
      type: "condition:add-instances",
      instancesByTarget: { "token-1": [condition("B", "token-1")] },
    }]),
  ]);
  assert.equal(first.status, "applied");
  assert.equal(second.status, "applied");
  assert.deepEqual(runtime.store.get("token-1").conditions.map((entry) => entry.id), ["A", "B"]);
  assert.deepEqual(runtime.trace.slice(0, 4).map((entry) => entry.split(":")[0]), [
    "prepare", "commit", "prepare", "commit",
  ]);
  assert.equal(runtime.history.length, 2);
  assert.deepEqual(Object.keys(runtime.history[0].effectsMutation.changes[0].before), ["conditions"]);
});

test("spell e concentration provenienti da iframe distinti osservano lo store condiviso aggiornato", async () => {
  const runtime = createSharedRuntime();
  const [spell, concentration] = await Promise.all([
    runtime.clientA.apply([{
      type: "spell:upsert",
      targetIds: ["token-1"],
      name: "Web",
      turns: 3,
      instanceId: "spell-1",
      entryIds: { "token-1": "spell-entry-1" },
    }]),
    runtime.clientB.apply([{
      type: "concentration:register",
      casterId: "token-1",
      targetIds: ["token-1"],
      name: "Web",
      instanceId: "spell-1",
    }]),
  ]);
  assert.equal(spell.status, "applied");
  assert.equal(concentration.status, "applied");
  assert.equal(runtime.store.get("token-1").spells[0].instanceId, "spell-1");
  assert.equal(runtime.store.get("token-1").concentrations.web.instanceId, "spell-1");
});

test("un comando composito produce una sola History field-scoped", async () => {
  const runtime = createSharedRuntime();
  const result = await runtime.clientA.apply([
    {
      type: "condition:add-instances",
      instancesByTarget: { "token-1": [condition("restrained", "token-1")] },
    },
    {
      type: "spell:upsert",
      targetIds: ["token-1"],
      name: "Web",
      turns: 3,
      instanceId: "spell-composite",
      entryIds: { "token-1": "spell-entry-composite" },
    },
    {
      type: "concentration:register",
      casterId: "token-1",
      targetIds: ["token-1"],
      name: "Web",
      instanceId: "spell-composite",
    },
  ], { commandId: "composite-command" });
  assert.equal(result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(runtime.history.length, 1);
  const [change] = runtime.history[0].effectsMutation.changes;
  assert.deepEqual(Object.keys(change.fields).sort(), [
    "concentrations",
    "conditions",
    "spells",
  ]);
  assert.deepEqual(Object.keys(change.before).sort(), Object.keys(change.fields).sort());
  assert.equal(Object.prototype.hasOwnProperty.call(change.before, "foreign"), false);
});

test("target sovrapposti vengono riletti alla testa della lane", async () => {
  const runtime = createSharedRuntime();
  await Promise.all([
    runtime.clientA.apply([{
      type: "condition:add-instances",
      instancesByTarget: {
        "token-1": [condition("A1", "token-1")],
        "token-2": [condition("A2", "token-2")],
      },
    }]),
    runtime.clientB.apply([{
      type: "condition:add-instances",
      instancesByTarget: {
        "token-2": [condition("B2", "token-2")],
        "token-3": [condition("B3", "token-3")],
      },
    }]),
  ]);
  assert.deepEqual(runtime.store.get("token-2").conditions.map((entry) => entry.id), ["A2", "B2"]);
});

test("un comando accodato con identita scena obsoleta non scrive e non crea History", async () => {
  const runtime = createSharedRuntime();
  const oldContext = await runtime.clientB.context();
  let release;
  runtime.gateCommits(new Promise((resolve) => { release = resolve; }));
  const running = runtime.clientA.apply([{
    type: "condition:add-instances",
    instancesByTarget: { "token-1": [condition("A", "token-1")] },
  }]);
  await tick();
  const stale = runtime.clientB.apply([{
    type: "condition:add-instances",
    instancesByTarget: { "token-2": [condition("B", "token-2")] },
  }], { sceneIdentity: oldContext.sceneIdentity });
  runtime.rotateScene("scene-B");
  release();
  const [runningResult, staleResult] = await Promise.all([running, stale]);
  assert.equal(runningResult.status, "rejected");
  assert.equal(staleResult.status, "rejected");
  assert.equal(runtime.store.get("token-1").conditions.length, 0);
  assert.equal(runtime.store.get("token-2").conditions.length, 0);
  assert.equal(runtime.history.length, 0);
});

test("la deduplicazione background applica una sola volta lo stesso commandId", async () => {
  const runtime = createSharedRuntime();
  const operation = [{
    type: "condition:add-instances",
    instancesByTarget: { "token-1": [condition("once", "token-1")] },
  }];
  const [first, duplicate] = await Promise.all([
    runtime.clientA.apply(operation, { commandId: "same-command" }),
    runtime.clientB.apply(operation, { commandId: "same-command" }),
  ]);
  assert.equal(first.status, "applied");
  assert.equal(duplicate.status, "applied");
  assert.equal(runtime.store.get("token-1").conditions.length, 1);
  assert.equal(runtime.history.length, 1);
});

test("una risoluzione reminder duplicata crea una sola History ed è annullabile interamente", async () => {
  const runtime = createSharedRuntime();
  const operation = [{
    type: "condition:add-instances",
    instancesByTarget: { "token-1": [condition("reminder-condition", "token-1")] },
  }];
  const [first, duplicate] = await Promise.all([
    runtime.clientA.apply(operation, {
      commandId: "reminder-resolution:zone-activation",
      history: {
        kind: "reminder-resolution",
        label: "Reminder: Ragnatela · Fallito",
      },
    }),
    runtime.clientB.apply(operation, {
      commandId: "reminder-resolution:zone-activation",
      history: {
        kind: "reminder-resolution",
        label: "Reminder: Ragnatela · Fallito",
      },
    }),
  ]);

  assert.equal(first.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(duplicate.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(runtime.history.length, 1);
  assert.equal(runtime.store.get("token-1").conditions.length, 1);

  const undone = await runtime.clientB.undo(runtime.history[0]);
  assert.equal(undone.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.deepEqual(runtime.store.get("token-1").conditions, []);
});

test("Undo background e atomicamente prevalidato e preserva campi estranei", async () => {
  const runtime = createSharedRuntime();
  await runtime.clientA.apply([{
    type: "condition:add-instances",
    instancesByTarget: {
      "token-1": [condition("A", "token-1")],
      "token-2": [condition("B", "token-2")],
    },
  }], { commandId: "multi-target" });
  const entry = runtime.history[0];
  runtime.store.get("token-1").foreign = { preserved: "changed-after" };
  const applied = await runtime.clientB.undo(entry);
  assert.equal(applied.status, "applied");
  assert.deepEqual(runtime.store.get("token-1").conditions, []);
  assert.deepEqual(runtime.store.get("token-1").foreign, { preserved: "changed-after" });

  await runtime.clientA.apply([{
    type: "condition:add-instances",
    instancesByTarget: {
      "token-1": [condition("C", "token-1")],
      "token-2": [condition("D", "token-2")],
    },
  }], { commandId: "conflicting-multi-target" });
  const conflictingEntry = runtime.history.at(-1);
  runtime.store.get("token-2").conditions.push(condition("later", "token-2"));
  const conflict = await runtime.clientB.undo(conflictingEntry);
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(runtime.store.get("token-1").conditions.map((entryValue) => entryValue.id), ["C"]);
  assert.deepEqual(runtime.store.get("token-2").conditions.map((entryValue) => entryValue.id), ["D", "later"]);
});

test("un errore SDK non blocca la lane e non produce History falsa", async () => {
  const runtime = createSharedRuntime();
  runtime.failNext();
  const [failed, applied] = await Promise.all([
    runtime.clientA.apply([{
      type: "condition:add-instances",
      instancesByTarget: { "token-1": [condition("fail", "token-1")] },
    }]),
    runtime.clientB.apply([{
      type: "condition:add-instances",
      instancesByTarget: { "token-1": [condition("next", "token-1")] },
    }]),
  ]);
  assert.equal(failed.status, "failed");
  assert.equal(applied.status, "applied");
  assert.deepEqual(runtime.store.get("token-1").conditions.map((entry) => entry.id), ["next"]);
  assert.equal(runtime.history.length, 1);
});
