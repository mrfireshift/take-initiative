import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import {
  planClassFeatureStateMutations,
} from "../src/classFeatureStateMutationCore.js";

const META_KEY = `${ID}/meta`;

const pool = {
  id: "test-uses",
  name: "Test uses",
  capacity: { type: "fixed", value: 5 },
};

const build = { classes: [] };

function token(state = undefined) {
  return {
    id: "source",
    metadata: {
      [META_KEY]: state === undefined ? {} : { classFeatureState: state },
    },
  };
}

test("le operazioni classFeatureState sullo stesso token si compongono sullo snapshot corrente", () => {
  const state = {
    version: 1,
    resources: { "test-uses": { current: 3, maximum: 5, unlimited: false } },
    instances: [{
      instanceId: "aura-1",
      featureId: "test-aura",
      sourceId: "source",
      targetIds: ["source"],
      suppressedTargetIds: ["stale", "active"],
      startedRound: 1,
      startedTurnKey: "",
      expiresRound: null,
      createdAt: 1,
    }],
  };
  const planned = planClassFeatureStateMutations([token(state)], [{
    type: "class-feature:adjust-resource",
    operationId: "adjust",
    sourceId: "source",
    pool,
    characterBuild: build,
    adjustment: { delta: -1 },
  }, {
    type: "class-feature:clear-stale-suppressions",
    operationId: "cleanup",
    sourceId: "source",
    removals: [{ instanceId: "aura-1", targetIds: ["stale"] }],
  }], { metadataKey: META_KEY });

  assert.equal(planned.status, undefined);
  assert.equal(planned.patches.length, 1);
  assert.deepEqual(planned.patches[0].fields.classFeatureState.expected, {
    present: true,
    value: state,
  });
  assert.equal(planned.patches[0].fields.classFeatureState.value.resources["test-uses"].current, 2);
  assert.deepEqual(
    planned.patches[0].fields.classFeatureState.value.instances[0].suppressedTargetIds,
    ["active"],
  );
  assert.deepEqual(planned.results.map((entry) => entry.operationId), ["adjust", "cleanup"]);
});

test("un conflitto di attivazione annulla l'intero piano senza partial write", () => {
  const feature = {
    id: "test-feature",
    name: "Test feature",
    automationStatus: "ready",
    trackingMode: "instant",
    resourceCosts: [{ poolId: "test-uses", amount: 2 }],
  };
  const state = {
    version: 1,
    resources: { "test-uses": { current: 1, maximum: 5, unlimited: false } },
    instances: [],
  };
  const planned = planClassFeatureStateMutations([token(state)], [{
    type: "class-feature:activate-state",
    operationId: "activation",
    sourceId: "source",
    feature,
    pools: [pool],
    characterBuild: build,
    targetIds: ["source"],
    currentRound: 1,
    currentTurnKey: "source",
    instanceId: "instance-1",
  }], { metadataKey: META_KEY });

  assert.equal(planned.status, "conflict");
  assert.deepEqual(planned.patches, []);
  assert.deepEqual(planned.results, []);
  assert.equal(planned.conflicts[0].reason, "resource-empty");
  assert.equal(planned.conflicts[0].operationId, "activation");
});
