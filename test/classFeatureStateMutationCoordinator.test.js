import test, { mock } from "node:test";
import assert from "node:assert/strict";

let currentSceneItems = [];

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "test-room", getMetadata: async () => ({}) },
      player: { getRole: async () => "GM" },
      scene: {
        isReady: async () => true,
        getMetadata: async () => ({}),
        items: {
          getItems: async (ids) => Array.isArray(ids)
            ? currentSceneItems.filter((item) => ids.includes(item.id))
            : currentSceneItems,
          updateItems: async () => {},
        },
      },
      broadcast: {
        onMessage: () => () => {},
        sendMessage: async () => {},
      },
    },
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const { ID } = await import("../src/constants.js");
const { prepareEffectsMutation } = await import("../src/effectsMutations.js");
const {
  createEffectsMutationCoordinator,
  EFFECTS_MUTATION_STATUS,
} = await import("../src/effectsMutationCoordinator.js");
const {
  planClassFeatureStateMutations,
} = await import("../src/classFeatureStateMutationCore.js");

const META_KEY = `${ID}/meta`;

const pool = {
  id: "test-uses",
  name: "Test uses",
  capacity: { type: "fixed", value: 5 },
};
const build = { classes: [] };

function feature(id) {
  return {
    id,
    name: id,
    automationStatus: "ready",
    trackingMode: "active",
    duration: { rounds: 2 },
    resourceCosts: [{ poolId: pool.id, amount: 1 }],
  };
}

function state({ current = 3, instances = [] } = {}) {
  return {
    version: 1,
    resources: {
      [pool.id]: { current, maximum: 5, unlimited: false },
    },
    instances,
  };
}

function token(classFeatureState = state(), hp = 10) {
  return {
    id: "source",
    name: "Source",
    metadata: {
      [META_KEY]: { hp, hpMax: 20, classFeatureState },
    },
  };
}

function activationOperation({ id = "activation", featureId = "test-feature" } = {}) {
  return {
    type: "class-feature:activate-state",
    operationId: id,
    sourceId: "source",
    feature: feature(featureId),
    pools: [pool],
    characterBuild: build,
    targetIds: ["source"],
    currentRound: 1,
    currentTurnKey: "source",
    instanceId: `${id}-instance`,
    createdAt: 100,
  };
}

function applyPlan(plan) {
  const changes = new Map((plan?.changes || []).map((change) => [change.id, change]));
  currentSceneItems = currentSceneItems.map((item) => {
    const change = changes.get(item.id);
    if (!change) return item;
    const next = structuredClone(item);
    const meta = { ...(next.metadata?.[META_KEY] || {}) };
    for (const [field, descriptor] of Object.entries(change.afterMetadata || {})) {
      if (!change.metadataFields?.[field]) continue;
      if (descriptor?.present) meta[field] = structuredClone(descriptor.value);
      else delete meta[field];
    }
    next.metadata = { ...(next.metadata || {}), [META_KEY]: meta };
    return next;
  });
}

function makeCoordinator() {
  const history = [];
  let commits = 0;
  const coordinator = createEffectsMutationCoordinator({
    prepare: (operations, context) => prepareEffectsMutation(operations, context),
    commit: async (plan) => {
      commits += 1;
      applyPlan(plan);
      return { committed: true, changedIds: [...plan.changedIds] };
    },
    recordHistory: async ({ command, plan }) => {
      const entry = {
        commandId: command.commandId,
        changes: structuredClone(plan.changes),
      };
      history.push(entry);
      return entry;
    },
    isCurrent: () => true,
  });
  return { coordinator, history, commitCount: () => commits };
}

function currentState() {
  return currentSceneItems[0].metadata[META_KEY].classFeatureState;
}

test("adjust e activation concorrenti sono serializzati senza lost update e con History coerente", async () => {
  const initial = state({ current: 3 });
  currentSceneItems = [token(initial)];
  const adjust = {
    type: "class-feature:adjust-resource",
    operationId: "adjust",
    sourceId: "source",
    pool,
    characterBuild: build,
    adjustment: { delta: 1 },
  };
  const activation = activationOperation();
  const expected = planClassFeatureStateMutations(
    [token(initial)],
    [adjust, activation],
    { metadataKey: META_KEY },
  ).patches[0].fields.classFeatureState.value;
  const { coordinator, history } = makeCoordinator();

  const [first, second] = await Promise.all([
    coordinator.enqueue({ commandId: "adjust-command", operations: [adjust] }),
    coordinator.enqueue({ commandId: "activation-command", operations: [activation] }),
  ]);

  assert.equal(first.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(second.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.deepEqual(currentState(), expected);
  assert.equal(currentState().resources[pool.id].current, 3);
  assert.deepEqual(currentState().instances.map((entry) => entry.instanceId), ["activation-instance"]);
  assert.equal(history.length, 2);
  assert.ok(history.every((entry) =>
    entry.changes[0].metadataFields.classFeatureState === true
  ));
});

test("activation e aura cleanup concorrenti preservano entrambe le modifiche", async () => {
  const aura = {
    instanceId: "aura-instance",
    featureId: "test-aura",
    sourceId: "source",
    targetIds: ["source"],
    suppressedTargetIds: ["stale-target", "active-target"],
    startedRound: 1,
    startedTurnKey: "source",
    expiresRound: null,
    createdAt: 1,
  };
  currentSceneItems = [token(state({ instances: [aura] }))];
  const cleanup = {
    type: "class-feature:clear-stale-suppressions",
    operationId: "cleanup",
    sourceId: "source",
    removals: [{ instanceId: "aura-instance", targetIds: ["stale-target"] }],
  };
  const { coordinator, history } = makeCoordinator();

  const [activation, cleanupResult] = await Promise.all([
    coordinator.enqueue({ operations: [activationOperation()] }),
    coordinator.enqueue({ operations: [cleanup] }),
  ]);

  assert.equal(activation.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(cleanupResult.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.deepEqual(
    currentState().instances.find((entry) => entry.instanceId === "aura-instance")
      .suppressedTargetIds,
    ["active-target"],
  );
  assert.ok(currentState().instances.some((entry) => entry.instanceId === "activation-instance"));
  assert.equal(history.length, 2);
});

test("una precondizione metadata stale impedisce activation e HP senza partial write o History", async () => {
  const initial = state({ current: 3 });
  currentSceneItems = [token(initial, 10)];
  const { coordinator, history, commitCount } = makeCoordinator();
  const result = await coordinator.enqueue({
    operations: [activationOperation()],
    metadataPatches: [{
      id: "source",
      fields: {
        hp: {
          mode: "set",
          value: 15,
          expected: { present: true, value: 9 },
        },
      },
    }],
  });

  assert.equal(result.status, EFFECTS_MUTATION_STATUS.CONFLICT);
  assert.equal(commitCount(), 0);
  assert.equal(history.length, 0);
  assert.deepEqual(currentState(), initial);
  assert.equal(currentSceneItems[0].metadata[META_KEY].hp, 10);
  assert.equal(result.conflicts[0].reason, "current-value-mismatch");
});

test("una seconda activation concorrente espone il conflitto senza consumi parziali", async () => {
  currentSceneItems = [token(state({ current: 1 }))];
  const { coordinator, history, commitCount } = makeCoordinator();
  const [first, second] = await Promise.all([
    coordinator.enqueue({ operations: [activationOperation({ id: "first", featureId: "first-feature" })] }),
    coordinator.enqueue({ operations: [activationOperation({ id: "second", featureId: "second-feature" })] }),
  ]);

  assert.equal(first.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(second.status, EFFECTS_MUTATION_STATUS.CONFLICT);
  assert.equal(second.conflicts[0].reason, "resource-empty");
  assert.equal(currentState().resources[pool.id].current, 0);
  assert.deepEqual(currentState().instances.map((entry) => entry.instanceId), ["first-instance"]);
  assert.equal(commitCount(), 1);
  assert.equal(history.length, 1);
});

test("la lane rifiuta un writer classFeatureState alternativo nello stesso comando", async () => {
  const initial = state({ current: 3 });
  currentSceneItems = [token(initial)];
  const { coordinator, history, commitCount } = makeCoordinator();
  const result = await coordinator.enqueue({
    operations: [activationOperation()],
    metadataPatches: [{
      id: "source",
      fields: {
        classFeatureState: {
          mode: "set",
          value: state({ current: 5 }),
        },
      },
    }],
  });

  assert.equal(result.status, EFFECTS_MUTATION_STATUS.CONFLICT);
  assert.equal(result.conflicts[0].reason, "duplicate-class-feature-state-writer");
  assert.equal(commitCount(), 0);
  assert.equal(history.length, 0);
  assert.deepEqual(currentState(), initial);
});
