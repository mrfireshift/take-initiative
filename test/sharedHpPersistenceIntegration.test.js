import test from "node:test";
import assert from "node:assert/strict";
import { reset, cleanup, sdk, items, group, meta, replaceItems, apply, history, effects, damage } from "../test-support/sharedHpHarness.js";
const { createActorVitalsStore, ACTOR_VITALS_ROOM_KEY } = await import("../src/actorVitalsStore.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const key = "com.thebigpicture.initiative/meta";
test.beforeEach(() => reset());
test.after(cleanup);
const storeFor = () => createActorVitalsStore({ api: sdk.room, itemsApi: sdk.scene.items, storage: null,
  getSceneEpoch: currentSceneEpoch, isSceneEpochCurrent: epoch => epoch === currentSceneEpoch(),
  subscribeItems: () => () => {}, subscribeEpoch: () => () => {} });
test("ActorVitals hydration mirrors the restored principal instead of independent secondary memories", async () => {
  replaceItems(group().map(item => ({ ...item, metadata: { ...item.metadata, [key]: { ...item.metadata[key], actorProfileId: `actor-${item.id}` } } })));
  await sdk.room.setMetadata({ [ACTOR_VITALS_ROOM_KEY]: { schemaVersion: 1, actors: {
    "actor-auril": { hp: 260, hpMax: 400, updatedAt: 5, revision: 1 },
    "actor-hand": { hp: 12, hpMax: 40, updatedAt: 20, revision: 9 },
  } } });
  const store = storeFor();
  try { await store.start(); assert.deepEqual(items.map(item => meta(item.id).hp), [260, 260, 260, 260]);
    assert.equal(meta("hand").actorProfileId, "actor-hand"); assert.equal(meta("hand").hpMax, 400);
  } finally { store.stop(); }
});
test("secondary restore respects a current principal even without a persistent principal identity", async () => {
  replaceItems(group(275).map(item => item.id === "hand" ? { ...item, metadata: { ...item.metadata,
    [key]: { ...item.metadata[key], actorProfileId: "actor-hand" } } } : item));
  await sdk.room.setMetadata({ [ACTOR_VITALS_ROOM_KEY]: { schemaVersion: 1, actors: {
    "actor-hand": { hp: 12, hpMax: 40, updatedAt: 20, revision: 9 },
  } } });
  const store = storeFor();
  try { await store.start(); assert.deepEqual(items.map(item => meta(item.id).hp), [275, 275, 275, 275]); }
  finally { store.stop(); }
});
test("orphaned secondary does not receive an unrelated actor restore", async () => {
  replaceItems(group().slice(1).map(item => ({ ...item, metadata: { ...item.metadata,
    [key]: { ...item.metadata[key], actorProfileId: "actor-hand" } } })));
  await sdk.room.setMetadata({ [ACTOR_VITALS_ROOM_KEY]: { schemaVersion: 1, actors: {
    "actor-hand": { hp: 12, hpMax: 40, updatedAt: 20, revision: 9 },
  } } });
  const store = storeFor();
  try { await store.start(); assert.ok(items.every(item => meta(item.id).hp === 300)); }
  finally { store.stop(); }
});
test("outer tracker-style history and Undo preserve complete group after unlink", async () => {
  const { sharedHpScopeIds } = await import("../src/sharedHpCore.js");
  const { decorateCompositeEffectsHistoryEntry } = await import("../src/effectsMutationCompositeHistoryCore.js");
  let mutation;
  await history.withItemMetaHistory({ kind: "hp", label: "Editor HP", itemIds: sharedHpScopeIds(items, ["auril"]),
    fields: ["hp", "hpMax"], decorateEntry: entry => decorateCompositeEffectsHistoryEntry({ entry, mutation }) },
  async () => { mutation = await apply([damage("auril", 25)], { history: false }); });
  const entries = await history.getHistoryEntries();
  await apply([{ type: "shared-hp:unlink", targetIds: ["hand"] }], { history: false });
  const undone = await effects.undoEffectsMutation(entries[0], { transport: "background" });
  assert.equal(undone.status, "applied");
  assert.deepEqual(items.map(item => meta(item.id).hp), [300, 300, 300, 300]);
  assert.equal(meta("hand").sharedHpSourceId, undefined);
});

test("hydration guards reject a changed source and a secondary unlinked during the write", async () => {
  const { sharedHpHydrationTargets, canApplySharedHpHydration } = await import("../src/sharedHpHydrationCore.js");
  const updates = sharedHpHydrationTargets(items, [{ id: "auril", hp: 260, hpMax: 400 }]);
  const changed = structuredClone(items); changed[0].metadata[key].hp = 275;
  assert.ok(updates.every(update => !canApplySharedHpHydration(update, new Map(changed.map(item => [item.id, item])))));
  const unlinked = structuredClone(items); delete unlinked.find(item => item.id === "hand").metadata[key].sharedHpSourceId;
  assert.equal(canApplySharedHpHydration(updates.find(update => update.id === "hand"), new Map(unlinked.map(item => [item.id, item]))), false);
});

test("legacy HP fallback restores a missing secondary from the principal without requiring its own PC memory", async () => {
  const { applyHPMemoryToSceneForMissingHP } = await import("../src/hpMemory.js");
  replaceItems(group(275).map(item => item.id === "hand" ? { ...item, metadata: { ...item.metadata,
    [key]: { sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true, attitude: "enemy" } } } : item));
  await applyHPMemoryToSceneForMissingHP(currentSceneEpoch(), { items, itemsComplete: true, isCurrent: () => true });
  assert.equal(meta("hand").hp, 275); assert.equal(meta("hand").hpMax, 400);
  assert.equal(meta("hand").attitude, "enemy");
});
