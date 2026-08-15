import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitiativeStateGateway,
  INITIATIVE_STATE_STATUS,
} from "../src/initiativeStateGatewayCore.js";

const clone = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createHarness({ state = {}, role = "GM", onRead = null, onWrite = null } = {}) {
  let liveState = clone(state);
  let scene = { ready: true, identity: "scene-A", epoch: 1 };
  const writes = [];
  const reads = [];
  const gateway = createInitiativeStateGateway({
    readState: async (context) => {
      reads.push({ phase: context.phase || "head", commandId: context.command.commandId });
      await onRead?.({ ...context, phase: context.phase || "head" });
      return clone(liveState);
    },
    writeState: async (next, context) => {
      writes.push({ value: clone(next), commandId: context.command.commandId, fields: [...context.fields] });
      await onWrite?.(next, context);
      if (scene.identity === context.scene.identity && scene.epoch === context.scene.epoch) {
        liveState = clone(next);
      }
    },
    getRole: async () => role,
    getSceneContext: () => scene,
    isSceneCurrent: (captured) => scene.ready
      && scene.identity === captured.identity
      && scene.epoch === captured.epoch,
  });
  return {
    gateway,
    writes,
    reads,
    get state() { return clone(liveState); },
    setScene(next) { scene = { ...scene, ...next }; },
  };
}

function patch(harness, commandId, patch, ownedFields, extra = {}) {
  return harness.gateway.enqueue({
    commandId,
    kind: "test-patch",
    patch,
    ownedFields,
    ...extra,
  });
}

test("due patch concorrenti vengono serializzate e preservano i campi posseduti da altri", async () => {
  const harness = createHarness({
    state: {
      order: ["a", "b"], current: 0, round: 4, collapsed: {},
      seededGroups: { goblin: { initiative: true } },
      paragonInits: { boss: [18, 12] },
      unknownFuture: { keep: true },
    },
  });
  const [turn, paragon] = await Promise.all([
    patch(harness, "turn-1", { order: ["b", "a"], current: 1, round: 4 }, ["order", "current", "round"]),
    patch(harness, "paragon-1", { paragonInits: {} }, ["paragonInits"]),
  ]);

  assert.equal(turn.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(paragon.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.deepEqual(harness.state.order, ["b", "a"]);
  assert.equal(harness.state.current, 1);
  assert.deepEqual(harness.state.paragonInits, {});
  assert.deepEqual(harness.state.seededGroups, { goblin: { initiative: true } });
  assert.deepEqual(harness.state.unknownFuture, { keep: true });
  assert.deepEqual(harness.reads.filter((entry) => entry.phase === "head").map((entry) => entry.commandId), [
    "turn-1",
    "paragon-1",
  ]);
});

test("cleanup Paragon e Advance Turn preservano entrambi i domini in entrambi gli ordini", async () => {
  for (const paragonFirst of [true, false]) {
    const harness = createHarness({
      state: {
        order: ["a", "b", "boss"],
        current: 0,
        round: 3,
        paragonInits: { boss: [18, 12], other: [9] },
        futureField: { keep: true },
      },
    });
    const paragon = () => patch(
      harness,
      `paragon-${paragonFirst ? "first" : "second"}`,
      { paragonInits: { other: [9] } },
      ["paragonInits"],
    );
    const advance = () => patch(
      harness,
      `advance-${paragonFirst ? "second" : "first"}`,
      { order: ["b", "boss", "a"], current: 1, round: 3 },
      ["order", "current", "round"],
    );
    const [paragonResult, advanceResult] = paragonFirst
      ? await Promise.all([paragon(), advance()])
      : await Promise.all([advance(), paragon()]).then(([turn, cleanup]) => [cleanup, turn]);

    assert.equal(paragonResult.status, INITIATIVE_STATE_STATUS.APPLIED);
    assert.equal(advanceResult.status, INITIATIVE_STATE_STATUS.APPLIED);
    assert.deepEqual(harness.state.order, ["b", "boss", "a"]);
    assert.equal(harness.state.current, 1);
    assert.equal(harness.state.round, 3);
    assert.deepEqual(harness.state.paragonInits, { other: [9] });
    assert.deepEqual(harness.state.futureField, { keep: true });
  }
});

test("collapsed e seededGroups sopravvivono a una transizione del turno", async () => {
  const harness = createHarness({
    state: { order: ["a"], current: 0, round: 1, collapsed: {}, seededGroups: {} },
  });
  await Promise.all([
    patch(harness, "collapse", { collapsed: { enemies: true } }, ["collapsed"]),
    patch(harness, "seed", { seededGroups: { enemies: { initiative: true } } }, ["seededGroups"]),
    patch(harness, "advance", { current: 0, round: 2 }, ["current", "round"]),
  ]);
  assert.deepEqual(harness.state.collapsed, { enemies: true });
  assert.deepEqual(harness.state.seededGroups, { enemies: { initiative: true } });
  assert.equal(harness.state.round, 2);
});

test("il reset azzera soltanto i campi posseduti e conserva gli unknown", async () => {
  const harness = createHarness({
    state: {
      order: ["a"], current: 1, round: 5, seededGroups: { x: true },
      collapsed: { x: true }, paragonInits: { boss: [10] },
      futureField: { untouched: 1 },
    },
  });
  const result = await patch(
    harness,
    "hard-reset",
    { order: [], current: 0, round: 1, seededGroups: {} },
    ["order", "current", "round", "seededGroups"],
  );
  assert.equal(result.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.deepEqual(harness.state.order, []);
  assert.equal(harness.state.current, 0);
  assert.equal(harness.state.round, 1);
  assert.deepEqual(harness.state.collapsed, { x: true });
  assert.deepEqual(harness.state.paragonInits, { boss: [10] });
  assert.deepEqual(harness.state.futureField, { untouched: 1 });
});

test("failure di un comando non blocca il successivo", async () => {
  let fail = true;
  const harness = createHarness({
    state: { order: ["a"], current: 0, round: 1 },
    onWrite: async () => {
      if (fail) {
        fail = false;
        throw new Error("write failed");
      }
    },
  });
  const [failed, applied] = await Promise.all([
    patch(harness, "failed", { current: 1 }, ["current"]),
    patch(harness, "next", { round: 2 }, ["round"]),
  ]);
  assert.equal(failed.status, INITIATIVE_STATE_STATUS.FAILED);
  assert.equal(applied.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(harness.state.current, 0);
  assert.equal(harness.state.round, 2);
});

test("command ID è idempotente e payload diverso produce conflict", async () => {
  const harness = createHarness({ state: { current: 0, round: 1 } });
  const first = await patch(harness, "same", { current: 1 }, ["current"]);
  const writes = harness.writes.length;
  const duplicate = await patch(harness, "same", { current: 1 }, ["current"]);
  const conflict = await patch(harness, "same", { current: 2 }, ["current"]);
  assert.equal(first.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(duplicate.status, INITIATIVE_STATE_STATUS.DUPLICATE);
  assert.equal(conflict.status, INITIATIVE_STATE_STATUS.CONFLICT);
  assert.equal(harness.writes.length, writes);
  assert.equal(harness.state.current, 1);
});

test("Player viene rifiutato prima della read/write della chiave", async () => {
  const harness = createHarness({ role: "PLAYER", state: { current: 0 } });
  const result = await patch(harness, "player", { current: 1 }, ["current"]);
  assert.equal(result.status, INITIATIVE_STATE_STATUS.REJECTED);
  assert.equal(result.reason, "player-not-authorized");
  assert.equal(harness.reads.length, 0);
  assert.equal(harness.writes.length, 0);
});

test("scene switch durante getMetadata non arriva alla write", async () => {
  let releaseRead;
  const gate = new Promise((resolve) => { releaseRead = resolve; });
  const harness = createHarness({
    state: { current: 0 },
    onRead: async ({ phase }) => {
      if (phase === "head") await gate;
    },
  });
  const pending = patch(harness, "stale-read", { current: 1 }, ["current"]);
  await tick();
  harness.setScene({ identity: "scene-B", epoch: 2 });
  releaseRead();
  const result = await pending;
  assert.equal(result.status, INITIATIVE_STATE_STATUS.REJECTED);
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.state.current, 0);
});

test("scene switch durante read-back produce applied post-commit senza write nella scena nuova", async () => {
  let readBack = false;
  const harness = createHarness({
    state: { current: 0, round: 1 },
    onRead: async ({ phase }) => {
      if (phase === "read-back" && !readBack) {
        readBack = true;
        harness.setScene({ identity: "scene-B", epoch: 2 });
      }
    },
  });
  const result = await patch(harness, "stale-read-back", { current: 1 }, ["current"]);
  assert.equal(result.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(result.committed, true);
  assert.equal(result.stale, true);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.state.current, 1);
});

test("scene switch durante l'attesa della queue scarta anche il comando successivo", async () => {
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const harness = createHarness({
    state: { current: 0, round: 1 },
    onWrite: async () => writeGate,
  });
  const first = patch(harness, "queued-A", { current: 1 }, ["current"]);
  await tick();
  const second = patch(harness, "queued-B", { round: 2 }, ["round"]);
  await tick();
  harness.setScene({ identity: "scene-B", epoch: 2 });
  releaseWrite();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(firstResult.stale, true);
  assert.equal(secondResult.status, INITIATIVE_STATE_STATUS.REJECTED);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.state.current, 0);
  assert.equal(harness.state.round, 1);
});

test("scene identity nuova con epoch invariato invalida il comando", async () => {
  const harness = createHarness({ state: { current: 0 } });
  const pending = patch(harness, "identity-A", { current: 1 }, ["current"]);
  harness.setScene({ identity: "scene-B", epoch: 1 });
  const result = await pending;
  assert.equal(result.status, INITIATIVE_STATE_STATUS.REJECTED);
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.state.current, 0);
});

test("due Advance Turn rapidi restano transizioni seriali e l'ultima conserva round/order", async () => {
  const harness = createHarness({
    state: { order: ["a", "b"], current: 0, round: 1, collapsed: {} },
  });
  const [first, second] = await Promise.all([
    patch(harness, "advance-1", { order: ["a", "b"], current: 1, round: 1 }, ["order", "current", "round"]),
    patch(harness, "advance-2", { order: ["a", "b"], current: 0, round: 2 }, ["order", "current", "round"]),
  ]);
  assert.equal(first.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(second.status, INITIATIVE_STATE_STATUS.APPLIED);
  assert.equal(harness.writes.length, 2);
  assert.deepEqual(harness.state.order, ["a", "b"]);
  assert.equal(harness.state.current, 0);
  assert.equal(harness.state.round, 2);
});

test("patch con expected limitato ai propri campi restituisce conflict senza write", async () => {
  const harness = createHarness({ state: { current: 2, round: 3, unknown: true } });
  const result = await patch(harness, "baseline", { current: 1 }, ["current"], {
    expected: { current: 0 },
  });
  assert.equal(result.status, INITIATIVE_STATE_STATUS.CONFLICT);
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.state.round, 3);
  assert.equal(harness.state.unknown, true);
});

test("un full snapshot stale senza ownership esplicita viene rifiutato", async () => {
  const harness = createHarness({ state: { order: ["a"], current: 0, round: 1, unknown: true } });
  const result = await harness.gateway.enqueue({
    commandId: "stale-replacement",
    patch: { order: ["b"], current: 1, round: 9, unknown: false },
  });
  assert.equal(result.status, INITIATIVE_STATE_STATUS.REJECTED);
  assert.equal(result.reason, "owned-fields-required-for-patch");
  assert.equal(harness.writes.length, 0);
  assert.deepEqual(harness.state.order, ["a"]);
  assert.equal(harness.state.unknown, true);
});
