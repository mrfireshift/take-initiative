import assert from "node:assert/strict";
import test from "node:test";
import {
  createParagonToggleExecutor,
  PARAGON_TOGGLE_STATUS,
} from "../src/paragonToggleCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const clone = (value) => structuredClone(value);

function token(id, meta = {}) {
  return { id, metadata: { [META_KEY]: { ...meta } } };
}

function createHarness({ items = [], state = {}, role = "GM", onUpdate = null, onPatch = null } = {}) {
  let liveItems = clone(items);
  let liveState = clone(state);
  let scene = { ready: true, identity: "scene-A", epoch: 1 };
  let updateCount = 0;
  let patchCount = 0;
  const executor = createParagonToggleExecutor({
    readItems: async (ids) => liveItems.filter((item) => ids.includes(item.id)).map(clone),
    updateItems: async (ids, updater) => {
      updateCount += 1;
      const before = clone(liveItems);
      const draft = liveItems.filter((item) => ids.includes(item.id)).map(clone);
      updater(draft);
      liveItems = liveItems.map((item) => draft.find((next) => next.id === item.id) || item);
      try {
        await onUpdate?.({ ids, draft, count: updateCount });
      } catch (error) {
        if (error?.preCommit === true) liveItems = before;
        throw error;
      }
    },
    readBackItems: async (ids) => liveItems.filter((item) => ids.includes(item.id)).map(clone),
    patchParagonInits: async ({ disabledIds }) => {
      patchCount += 1;
      const result = await onPatch?.({ disabledIds, count: patchCount });
      if (result?.status === "failed") return result;
      const next = { ...(liveState.paragonInits || {}) };
      for (const id of disabledIds) delete next[id];
      liveState = { ...liveState, paragonInits: next };
      return { status: "applied", changed: true, committed: true };
    },
    getRole: async () => role,
    getSceneContext: () => scene,
    isSceneCurrent: (captured) => scene.ready
      && scene.identity === captured.identity
      && scene.epoch === captured.epoch,
  });
  return {
    executor,
    get items() { return clone(liveItems); },
    get state() { return clone(liveState); },
    get updateCount() { return updateCount; },
    get patchCount() { return patchCount; },
    setScene(next) { scene = { ...scene, ...next }; },
  };
}

function enabled(harness, id) {
  return !!harness.items.find((item) => item.id === id)?.metadata?.[META_KEY]?.paragon;
}

test("Paragon off rimuove il token e soltanto il suo paragonInits", async () => {
  const harness = createHarness({
    items: [token("boss", { paragon: { actions: 2 } })],
    state: { order: ["boss"], current: 1, round: 3, paragonInits: { boss: [18, 12], other: [9] } },
  });
  const result = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "off-boss" });
  assert.equal(result.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.equal(result.cleanupPending, false);
  assert.equal(enabled(harness, "boss"), false);
  assert.deepEqual(harness.state.paragonInits, { other: [9] });
  assert.equal(harness.state.current, 1);
  assert.equal(harness.state.round, 3);
  assert.deepEqual(harness.state.order, ["boss"]);
});

test("Paragon on è idempotente e non elimina lo state di un altro boss", async () => {
  const harness = createHarness({
    items: [token("boss", {})],
    state: { order: ["boss"], current: 0, round: 2, paragonInits: { other: [9] } },
  });
  const result = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: true, commandId: "on-boss" });
  assert.equal(result.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.equal(enabled(harness, "boss"), true);
  assert.deepEqual(harness.state.paragonInits, { other: [9] });
  assert.equal(harness.state.current, 0);
  assert.equal(harness.state.round, 2);
  assert.equal(harness.patchCount, 0);
});

test("retry enable con lo stesso command ID non ritog­gla il token", async () => {
  const harness = createHarness({ items: [token("boss", {})] });
  const first = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: true, commandId: "retry-enable" });
  const second = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: true, commandId: "retry-enable" });
  assert.equal(first.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.equal(second.status, PARAGON_TOGGLE_STATUS.DUPLICATE);
  assert.equal(harness.updateCount, 1);
  assert.equal(enabled(harness, "boss"), true);
});

test("retry disable conserva il disabled e il cleanup resta idempotente", async () => {
  const harness = createHarness({
    items: [token("boss", { paragon: { actions: 2 } })],
    state: { paragonInits: { boss: [18] } },
  });
  const first = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "retry-disable" });
  const second = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "retry-disable" });
  assert.equal(first.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.equal(second.status, PARAGON_TOGGLE_STATUS.DUPLICATE);
  assert.equal(harness.updateCount, 1);
  assert.equal(harness.patchCount, 1);
  assert.equal(enabled(harness, "boss"), false);
  assert.deepEqual(harness.state.paragonInits, {});
});

test("selezione mista applica ogni intenzione e pulisce soltanto i disattivati reali", async () => {
  const harness = createHarness({
    items: [token("off", { paragon: { actions: 2 } }), token("on", {})],
    state: { paragonInits: { off: [15], on: [11], other: [7] } },
  });
  const result = await harness.executor.enqueue({
    ids: ["off", "on"],
    desiredEnabled: { off: false, on: true },
    commandId: "mixed",
  });
  assert.equal(result.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.deepEqual(result.disabledIds, ["off"]);
  assert.equal(enabled(harness, "off"), false);
  assert.equal(enabled(harness, "on"), true);
  assert.deepEqual(harness.state.paragonInits, { on: [11], other: [7] });
});

test("Legendary/Epic bloccano l'attivazione senza write token o state", async () => {
  const harness = createHarness({
    items: [token("legendary", { legendary: { max: 3, current: 3 } }), token("epic", { epic: { enabled: 1 } })],
    state: { paragonInits: { other: [7] } },
  });
  const result = await harness.executor.enqueue({ ids: ["legendary", "epic"], desiredEnabled: true, commandId: "blocked" });
  assert.equal(result.status, PARAGON_TOGGLE_STATUS.BLOCKED);
  assert.equal(harness.updateCount, 0);
  assert.equal(harness.patchCount, 0);
  assert.deepEqual(harness.state.paragonInits, { other: [7] });
});

test("failure token pre-commit non esegue cleanup e non presenta un successo", async () => {
  const harness = createHarness({
    items: [token("boss", { paragon: { actions: 2 } })],
    state: { paragonInits: { boss: [18] } },
    onUpdate: async () => { throw Object.assign(new Error("pre-commit"), { preCommit: true }); },
  });
  const result = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "precommit-failure" });
  assert.equal(result.status, PARAGON_TOGGLE_STATUS.FAILED);
  assert.equal(result.committed, false);
  assert.equal(harness.patchCount, 0);
  assert.equal(enabled(harness, "boss"), true);
  assert.deepEqual(harness.state.paragonInits, { boss: [18] });
});

test("timeout ambiguo usa il read-back e non effettua un secondo toggle", async () => {
  const harness = createHarness({
    items: [token("boss", { paragon: { actions: 2 } })],
    state: { paragonInits: { boss: [18] } },
    onUpdate: async ({ count }) => {
      if (count === 1) throw Object.assign(new Error("timeout"), { ambiguous: true });
    },
  });
  const first = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "ambiguous-off" });
  const second = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "ambiguous-off" });
  assert.equal(first.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.equal(first.committed, true);
  assert.equal(second.status, PARAGON_TOGGLE_STATUS.DUPLICATE);
  assert.equal(harness.updateCount, 1);
  assert.equal(harness.patchCount, 1);
  assert.equal(enabled(harness, "boss"), false);
  assert.deepEqual(harness.state.paragonInits, {});
});

test("cleanup fallito è pending e il retry esegue solo il cleanup", async () => {
  let failCleanup = true;
  const harness = createHarness({
    items: [token("boss", { paragon: { actions: 2 } })],
    state: { paragonInits: { boss: [18] } },
    onPatch: async () => {
      if (failCleanup) {
        failCleanup = false;
        return { status: "failed", committed: false };
      }
      return null;
    },
  });
  const first = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: false, commandId: "cleanup-failure" });
  assert.equal(first.status, PARAGON_TOGGLE_STATUS.APPLIED);
  assert.equal(first.committed, true);
  assert.equal(first.cleanupPending, true);
  assert.equal(harness.updateCount, 1);
  assert.equal(harness.patchCount, 1);

  const cleanupRetry = await first.retryCleanup();
  assert.equal(cleanupRetry.status, "applied");
  assert.equal(first.cleanupPending, false);
  assert.equal(harness.updateCount, 1);
  assert.equal(harness.patchCount, 2);
  assert.deepEqual(harness.state.paragonInits, {});
});

test("Player non può scrivere token né initiative state", async () => {
  const harness = createHarness({ role: "PLAYER", items: [token("boss", {})] });
  const result = await harness.executor.enqueue({ ids: ["boss"], desiredEnabled: true, commandId: "player" });
  assert.equal(result.status, PARAGON_TOGGLE_STATUS.REJECTED);
  assert.equal(harness.updateCount, 0);
  assert.equal(harness.patchCount, 0);
});
