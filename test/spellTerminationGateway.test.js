import test from "node:test";
import assert from "node:assert/strict";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import {
  buildTerminationResumeOperation,
  buildTerminationRequestOperation,
} from "../src/spellTerminationGatewayCore.js";
import { spellLifecycleOperations } from "../src/spellLifecycleOperationsCore.js";

function token(id, overrides = {}) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function terminalFixture({ targets = ["target"], expiry = null, turns = 3 } = {}) {
  const descriptor = { kind: "synthetic-terminal", version: 1 };
  const concentration = {
    name: "Synthetic Terminal",
    instanceId: "terminal-1",
    targets,
    castContext: { terminalResolution: descriptor },
  };
  const spell = {
    id: "terminal-spell-entry",
    name: "Synthetic Terminal",
    turns,
    conc: true,
    casterId: "caster",
    instanceId: "terminal-1",
    castContext: { terminalResolution: descriptor },
    ...(expiry ? { expiry } : {}),
  };
  return [
    token("caster", { concentrations: { synthetic: concentration } }),
    ...targets.map((id) => token(id, { spells: [{ ...spell, id: `${spell.id}:${id}` }] })),
  ];
}

function pending(plan) {
  assert.equal(plan.pendingTerminations.length, 1);
  return plan.pendingTerminations[0];
}

test("ordinary concentration removal remains unchanged", () => {
  const plan = buildEffectsMutationPlan([
    token("caster", {
      concentrations: {
        ordinary: { name: "Ordinary", instanceId: "ordinary-1", targets: ["target"] },
      },
    }),
    token("target", {
      spells: [{
        id: "ordinary-entry",
        name: "Ordinary",
        turns: 3,
        conc: true,
        casterId: "caster",
        instanceId: "ordinary-1",
      }],
    }),
  ], [buildTerminationRequestOperation({
    casterId: "caster",
    reference: "ordinary-1",
    reason: "manual",
    requestId: "ordinary-request",
  })]);

  assert.deepEqual(state(plan, "caster").concentrations, {});
  assert.deepEqual(state(plan, "target").spells, []);
  assert.deepEqual(plan.pendingTerminations || [], []);
});

test("manual break creates one instance-scoped pending terminal resolution", () => {
  const plan = buildEffectsMutationPlan(terminalFixture(), [
    buildTerminationRequestOperation({
      casterId: "caster",
      reference: "terminal-1",
      reason: "manual",
      requestId: "manual-request",
    }),
    { type: "condition:add", targetIds: ["target"], conditionName: "ShouldWait" },
  ]);

  const event = pending(plan);
  assert.equal(event.pendingTermination.requestId, "manual-request");
  assert.equal(event.pendingTermination.reason, "manual");
  assert.equal(state(plan, "caster").concentrations.synthetic.pendingTermination.instanceId, "terminal-1");
  assert.equal(state(plan, "target").spells.length, 1);
  assert.equal(state(plan, "target").conditions.length, 0, "continuation tail must stay suspended");
});

test("completion commits terminal effects, resumes continuation and cleans once", () => {
  const first = buildEffectsMutationPlan(terminalFixture(), [
    buildTerminationRequestOperation({
      casterId: "caster",
      reference: "terminal-1",
      requestId: "completion-request",
    }),
    {
      type: "spell:upsert",
      targetIds: ["target"],
      name: "Replacement",
      turns: 5,
      source: "caster",
      conc: true,
      instanceId: "replacement-1",
    },
    {
      type: "concentration:register",
      casterId: "caster",
      targetIds: ["target"],
      name: "Replacement",
      instanceId: "replacement-1",
    },
  ]);
  const requestId = pending(first).pendingTermination.requestId;
  const resumed = buildEffectsMutationPlan(first.states, [
    {
      type: "condition:add",
      targetIds: ["target"],
      conditionName: "TerminalCommitted",
      instanceIds: { target: "terminal-commit" },
    },
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "terminal-1",
      requestId,
    }),
  ]);

  assert.deepEqual(state(resumed, "caster").concentrations, {
    replacement: {
      targets: ["target"],
      name: "Replacement",
      instanceId: "replacement-1",
    },
  });
  assert.equal(state(resumed, "target").spells[0].instanceId, "replacement-1");
  assert.equal(state(resumed, "target").conditions[0].condition, "TerminalCommitted");
  assert.equal((resumed.pendingTerminations || []).length, 0);

  const staleRetry = buildEffectsMutationPlan(resumed.states, [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "terminal-1",
      requestId,
    }),
  ]);
  assert.equal(staleRetry.status, "conflict");
});

test("closing the resolver leaves pending state and retry reuses the same request", () => {
  const first = buildEffectsMutationPlan(terminalFixture(), [
    buildTerminationRequestOperation({
      casterId: "caster",
      reference: "terminal-1",
      requestId: "retry-request",
    }),
  ]);
  const reopened = buildEffectsMutationPlan(JSON.parse(JSON.stringify(first.states)), [
    buildTerminationRequestOperation({
      casterId: "caster",
      reference: "terminal-1",
      requestId: "different-click",
    }),
  ]);

  assert.equal(pending(reopened).pendingTermination.requestId, "retry-request");
  assert.equal(pending(reopened).reused, true);
  assert.equal(state(reopened, "target").spells.length, 1);
});

test("failed concentration save and natural expiry both enter the gateway", () => {
  const failedSave = buildEffectsMutationPlan(terminalFixture(), [
    buildTerminationRequestOperation({
      casterId: "caster",
      reference: "terminal-1",
      reason: "concentration-save",
      requestId: "failed-save",
    }),
  ]);
  assert.equal(pending(failedSave).pendingTermination.reason, "concentration-save");
  assert.equal(state(failedSave, "target").spells.length, 1);

  const expiring = terminalFixture({ expiry: { mode: "rounds", remaining: 1 }, turns: 1 });
  const expired = buildEffectsMutationPlan(expiring, [{
    type: "spell:adjust",
    targetIds: ["target"],
    delta: -1,
    operationId: "expiry-request",
  }]);
  assert.equal(pending(expired).pendingTermination.reason, "expiry");
  assert.equal(state(expired, "target").spells.length, 1);
});

test("turn-boundary expiry preserves the parent instead of deleting it", () => {
  const boundary = terminalFixture({ expiry: {
    mode: "turn-end",
    actor: "source",
    actorId: "caster",
    remaining: 1,
  } });
  boundary[1].spells[0].turns = 5;
  const plan = buildEffectsMutationPlan(boundary, [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "2:0:caster" }],
    operationId: "boundary-expiry",
  }]);
  assert.equal(pending(plan).pendingTermination.reason, "expiry");
  assert.equal(state(plan, "target").spells.length, 1);
});

test("replacement suspends the new concentration until the old terminal resolution completes", () => {
  const old = terminalFixture();
  const replacementOperations = spellLifecycleOperations({
    targetIds: ["target"],
    casterId: "caster",
    name: "Replacement",
    turns: 10,
    concentration: true,
    instanceId: "replacement-2",
    spellId: "synthetic-replacement",
  });
  const first = buildEffectsMutationPlan(old, replacementOperations);
  const oldEvent = pending(first);
  assert.equal(state(first, "caster").concentrations.synthetic.pendingTermination.instanceId, "terminal-1");
  assert.equal(state(first, "caster").concentrations.replacement, undefined);
  assert.equal(state(first, "target").spells[0].instanceId, "terminal-1");

  const resumed = buildEffectsMutationPlan(first.states, [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "terminal-1",
      requestId: oldEvent.pendingTermination.requestId,
    }),
  ]);
  assert.equal(state(resumed, "caster").concentrations.replacement.instanceId, "replacement-2");
  assert.equal(state(resumed, "target").spells.length, 1);
  assert.equal(state(resumed, "target").spells[0].instanceId, "replacement-2");
});

test("a direct concentration register cannot activate a second spell beside a pending one", () => {
  const first = buildEffectsMutationPlan(terminalFixture(), [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "terminal-1",
    operationId: "pending-register-guard",
  }]);
  const blocked = buildEffectsMutationPlan(first.states, [{
    type: "concentration:register",
    casterId: "caster",
    targetIds: ["target"],
    name: "Another",
    instanceId: "another-1",
  }]);
  assert.equal((blocked.pendingTerminations || []).length, 1);
  assert.equal(state(blocked, "caster").concentrations.another, undefined);
  assert.equal(state(blocked, "caster").concentrations.synthetic.pendingTermination.instanceId, "terminal-1");
});

test("last-target interaction requests terminal resolution, while partial target removal stays ordinary", () => {
  const partial = buildEffectsMutationPlan(terminalFixture({ targets: ["a", "b"] }), [{
    type: "concentration:break-targets",
    casterIds: ["caster"],
    reference: "terminal-1",
    targetIds: ["a"],
  }]);
  assert.deepEqual(partial.pendingTerminations || [], []);
  assert.deepEqual(state(partial, "caster").concentrations.synthetic.targets, ["b"]);

  const last = buildEffectsMutationPlan(terminalFixture(), [{
    type: "concentration:break-targets",
    casterIds: ["caster"],
    reference: "terminal-1",
    targetIds: ["target"],
    operationId: "last-target",
  }]);
  assert.equal(pending(last).pendingTermination.instanceId, "terminal-1");
  assert.equal(state(last, "target").spells.length, 1);
});

test("stale resume is rejected and instance identity survives JSON reload", () => {
  const first = buildEffectsMutationPlan(terminalFixture(), [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "terminal-1",
    operationId: "stable-request",
  }]);
  const stale = buildEffectsMutationPlan(first.states, [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "terminal-1",
      requestId: "wrong-request",
    }),
  ]);
  assert.equal(stale.status, "conflict");
  assert.equal(state(stale, "caster").concentrations.synthetic.pendingTermination.instanceId, "terminal-1");

  const reloaded = buildEffectsMutationPlan(JSON.parse(JSON.stringify(first.states)), [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "terminal-1",
      requestId: "stable-request",
    }),
  ]);
  assert.deepEqual(state(reloaded, "caster").concentrations, {});
  assert.deepEqual(state(reloaded, "target").spells, []);
});
