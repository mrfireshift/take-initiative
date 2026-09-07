import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };
const META = "com.thebigpicture.initiative/meta";
const HISTORY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);
let items = [], metadata = {}, beforeUpdate = null, readFailures = 0, writeFailure = null;
let writes = 0, metadataFailures = 0;
const listeners = new Map();
const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: { id: "p0-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true, onReadyChange: () => () => {},
    getMetadata: async () => clone(metadata),
    setMetadata: async (update) => {
      if (metadataFailures > 0) { metadataFailures--; throw new Error("injected-history-write"); }
      metadata = { ...metadata, ...clone(update) };
    },
    items: {
      getItems: async (ids) => {
        if (readFailures > 0) { readFailures--; throw new Error("injected-read"); }
        return clone(items.filter((item) => !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))));
      },
      updateItems: async (ids, update) => {
        const hook = beforeUpdate; beforeUpdate = null;
        if (hook) await hook();
        if (writeFailure === "before") { writeFailure = null; throw new Error("injected-write-before"); }
        const drafts = clone(items.filter((item) => typeof ids === "function" ? ids(item) : ids.includes(item.id)));
        update(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        items = items.map((item) => byId.get(item.id) || item);
        writes++;
        if (writeFailure === "after") { writeFailure = null; throw new Error("injected-write-after"); }
      },
      addItems: async (added) => { items.push(...clone(added)); },
      deleteItems: async (ids) => { items = items.filter((item) => !ids.includes(item.id)); },
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const set = listeners.get(channel) || new Set(); set.add(listener); listeners.set(channel, set);
      return () => set.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(listeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: {
  default: sdk, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {},
} });
const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const owner = await import("../src/historyOwner.js");
const { markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { decorateCompositeEffectsHistoryEntry } = await import("../src/effectsMutationCompositeHistoryCore.js");
const condition = { id: "S", condition: "Affascinato", active: true, mechanics: { endsOnDamage: true } };
const hp = (value, options = {}) => ({ type: "hp:set", updates: [{ itemId: "target", hp: value, hpMax: 20 }], ...options });
const add = { type: "condition:add", targetIds: ["target"], conditionName: "Accecato", instanceIds: { target: "T" } };
const meta = () => items.find((item) => item.id === "target").metadata[META];
const ids = () => (meta().conditions?.instances || []).map((instance) => instance.id);

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); owner.unmountHistoryOwner();
  readFailures = 0; writeFailure = null; beforeUpdate = null; writes = 0; metadataFailures = 0;
  items = [{ id: "target", name: "Target", type: "IMAGE", metadata: { [META]: {
    hp: 20, hpMax: 20, attitude: "pc", conditions: { version: 1, instances: [clone(condition)] }, untouched: 7,
  } } }];
  metadata = { [HISTORY]: { version: 1, roomId: "p0-room", entries: [] } };
  markSceneEpochReady("p0-test");
  await owner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); owner.unmountHistoryOwner(); });

async function wrapped(action) {
  let mutation;
  const result = await history.withItemMetaHistory({
    itemIds: ["target"], fields: ["hp", "hpMax", "conditions"], kind: "hp",
    decorateEntry: (entry) => decorateCompositeEffectsHistoryEntry({ entry, mutation, effectMetadataFields: ["conditions"] }),
  }, async () => {
    mutation = await effects.runEffectsMutation([hp(12)], { transport: "background", history: false });
    effects.requireAppliedEffectsMutation(mutation);
    return action?.();
  });
  return result;
}

async function undoLatest() {
  const entries = await history.getHistoryEntries();
  assert.ok(entries.length);
  const result = await effects.undoEffectsMutation(entries[entries.length - 1], { transport: "background" });
  assert.equal(result.status, "applied", JSON.stringify(result));
}

test("P0-1: production HP commit followed by failure retains one History transition and Undo", async () => {
  const result = await wrapped(() => { throw new Error("injected-second-phase"); });
  assert.equal(result.partial, true); assert.equal(result.committed, true);
  assert.equal(meta().hp, 12); assert.ok(!ids().includes("S"));
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1); assert.equal(entries[0].id, result.historyEntryId);
  assert.ok(entries[0].effectsMutation.changes.length);
  assert.equal(entries[0].payload.partialCommit.message, "injected-second-phase");
  await undoLatest();
  assert.equal(meta().hp, 20); assert.ok(ids().includes("S")); assert.equal(meta().untouched, 7);
});

test("P0-1: before capture failure prevents executing canonical mutation", async () => {
  readFailures = 1; let called = false;
  await assert.rejects(history.withItemMetaHistory({ itemIds: ["target"], fields: ["hp"] }, () => { called = true; }), /injected-read/);
  assert.equal(called, false); assert.equal(writes, 0); assert.equal(meta().hp, 20);
});

test("P0-1: decorator failure retains raw canonical snapshots for Undo", async () => {
  const result = await history.withItemMetaHistory({
    itemIds: ["target"], fields: ["hp", "conditions"],
    decorateEntry() { throw new Error("injected-decoration"); },
  }, async () => { effects.requireAppliedEffectsMutation(await effects.runEffectsMutation([hp(12)], { transport: "background", history: false })); });
  assert.equal(result.partial, true); assert.equal((await history.getHistoryEntries()).length, 1);
  await undoLatest(); assert.equal(meta().hp, 20); assert.ok(ids().includes("S"));
});

test("P0-2: zero HP automation and damage removal commit together and Undo restores absence", async () => {
  delete meta().conditions;
  const result = await effects.runEffectsMutation([hp(0)], { transport: "background" });
  assert.equal(result.status, "applied"); assert.equal(writes, 1); assert.equal(meta().hp, 0);
  assert.ok(meta().conditions.instances.some((instance) => instance.type === "hp-zero"));
  await undoLatest(); assert.equal(meta().hp, 20); assert.equal(Object.hasOwn(meta(), "conditions"), false);
});

test("P0-2: stale HP expectation rejects the entire HP/condition action before write", async () => {
  const operation = hp(12);
  operation.updates[0].expectedHP = { present: true, value: 19 };
  const result = await effects.runEffectsMutation([operation, add], { transport: "background" });
  assert.equal(result.status, "conflict"); assert.equal(writes, 0);
  assert.equal(meta().hp, 20); assert.deepEqual(ids(), ["S"]); assert.equal((await history.getHistoryEntries()).length, 0);
});

test("P0-1: canonical rejection before write produces no transition", async () => {
  writeFailure = "before";
  await assert.rejects(wrapped(), /injected-write-before/);
  assert.equal(meta().hp, 20); assert.equal((await history.getHistoryEntries()).length, 0);
});

test("P0-1: after capture failure retries only the read, never the HP action", async () => {
  await wrapped(() => { readFailures = 1; });
  assert.equal(writes, 1); assert.equal((await history.getHistoryEntries()).length, 1);
  await undoLatest(); assert.equal(meta().hp, 20); assert.ok(ids().includes("S"));
});

test("P0-1: rejected SDK response after canonical commit is recovered and recorded", async () => {
  writeFailure = "after";
  const result = await effects.runEffectsMutation([hp(12)], { transport: "background" });
  assert.equal(result.status, "applied"); assert.equal(result.committed, true);
  assert.equal(result.postCommitErrors[0].phase, "canonical-commit-response");
  assert.equal(writes, 1); assert.equal((await history.getHistoryEntries()).length, 1);
  await undoLatest(); assert.equal(meta().hp, 20); assert.ok(ids().includes("S"));
});

test("P0-1: append failure retains immutable entry and converges without replay", async () => {
  await wrapped(() => { metadataFailures = 1; });
  await history.flushPendingHistoryAppends();
  assert.equal((await history.getHistoryEntries()).length, 1); assert.equal(writes, 1);
  await undoLatest(); assert.equal(meta().hp, 20); assert.ok(ids().includes("S"));
});

test("P0-2: queued damage waits for prepared effects plan, preserving both changes and Undo", async () => {
  let entered, release;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const barrier = new Promise((resolve) => { release = resolve; });
  beforeUpdate = async () => { entered(); await barrier; };
  const first = effects.runEffectsMutation([add], { transport: "background" });
  await waiting;
  const damage = effects.runEffectsMutation([hp(12)], { transport: "background" });
  release();
  assert.equal((await first).status, "applied"); assert.equal((await damage).status, "applied");
  assert.deepEqual(ids(), ["T"]); assert.equal(meta().hp, 12);
  assert.equal((await history.getHistoryEntries()).length, 2);
  await undoLatest(); assert.equal(meta().hp, 20); assert.ok(ids().includes("S")); assert.ok(ids().includes("T"));
});

test("P0-2: stale draft is rejected and replanned without resurrecting a removed condition", async () => {
  // A separate background realm models another OBR writer. Both actions use
  // the real production planner/commit/History; only SDK scheduling is fake.
  const otherWriter = await import("../src/effectsMutations.js?p0-concurrent-realm");
  await otherWriter.mountEffectsMutationCoordinatorService();
  try {
    beforeUpdate = async () => {
      const damage = await otherWriter.runEffectsMutation([hp(12)], { transport: "background" });
      assert.equal(damage.status, "applied");
    };
    const result = await effects.runEffectsMutation([add], { transport: "background" });
    assert.equal(result.status, "applied", JSON.stringify(result));
    assert.deepEqual(ids(), ["T"]); assert.equal(meta().hp, 12); assert.equal(writes, 2);
    const entries = await history.getHistoryEntries(); assert.equal(entries.length, 2);
    await undoLatest(); assert.deepEqual(ids(), []); assert.equal(meta().hp, 12);
    assert.equal((await effects.undoEffectsMutation(entries[0], { transport: "background" })).status, "applied");
    assert.equal(meta().hp, 20); assert.ok(ids().includes("S"));
  } finally { otherWriter.unmountEffectsMutationCoordinatorService(); }
});
