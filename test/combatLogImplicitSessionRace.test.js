import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

// Lot L14 of the bugfix pass (HI-07): the first event of a scene reached the tracker and the background at once; each
// found no registry and made its own, and the events of one ended in a registry nobody shows.
const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const previousLocalStorage = globalThis.localStorage;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: (key) => { storage.delete(key); },
};
after(() => {
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  globalThis.localStorage = previousLocalStorage;
});

const metadata = {};
const obr = {
  room: { id: "room-implicit-race" },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => structuredClone(metadata),
    setMetadata: async (patch) => Object.assign(metadata, structuredClone(patch)),
  },
  broadcast: { sendMessage: async () => {}, onMessage: () => () => {} },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: obr } });

// Two pages of the same browser: two instances of the module, one IndexedDB, one localStorage, one scene.
const tracker = await import("../src/combatLog.js?page=tracker");
const background = await import("../src/combatLog.js?page=background");

test("L14: tracker e background che aprono insieme il primo registro della scena ne creano uno solo", async () => {
  const [fromTracker, fromBackground] = await Promise.all([
    tracker.ensureCombatLogSession({ sceneEpoch: null }),
    background.ensureCombatLogSession({ sceneEpoch: null }),
  ]);
  assert.ok(fromTracker?.id);
  assert.equal(fromBackground?.id, fromTracker.id);
  const sessions = await tracker.listCombatLogSessions();
  assert.deepEqual(sessions.map((session) => session.id), [fromTracker.id]);
  const state = Object.entries(metadata).find(([key]) => key.includes("combat-log-state"))?.[1];
  assert.equal(state?.sessionId, fromTracker.id);
});

test("L14: un registro aperto dal GM con «Nuovo» resta sempre nuovo", async () => {
  const current = await tracker.ensureCombatLogSession({ sceneEpoch: null });
  const started = await tracker.startCombatLogSession("Secondo", { sceneEpoch: null });
  assert.notEqual(started.id, current.id);
});

// Lot L14 of the bugfix pass (HI-04): deleting the scene's registry attached the scene to another one of this browser
// (an imported archive, another scene's registry); «Conservazione…» could delete another scene's active registry.
test("L14: eliminare il registro attivo lascia la scena senza registro; i registri in uso sono segnati e la conservazione li salta", async () => {
  const sessionState = () => Object.entries(metadata).find(([key]) => key.includes("combat-log-state"))?.[1] || null;
  const first = await tracker.startCombatLogSession("Scena A", { sceneEpoch: null });
  const second = await tracker.startCombatLogSession("Scena B", { sceneEpoch: null });
  const byId = async () => new Map((await tracker.listCombatLogSessions()).map((session) => [session.id, session]));
  let sessions = await byId();
  assert.equal(sessions.get(first.id).attached, false, "the scene moved to another registry");
  assert.equal(sessions.get(second.id).attached, true);

  const { planCombatLogRetention } = await import("../src/combatLogStorageCore.js");
  const plan = planCombatLogRetention([...sessions.values()], { roomId: "room-implicit-race", keepLastN: 0 });
  assert.equal(plan.candidates.some((candidate) => candidate.id === second.id), false, "a registry in use is never pruned");
  assert.ok(plan.candidates.some((candidate) => candidate.id === first.id));

  assert.equal(await tracker.deleteCombatLogSession(second.id, { sceneEpoch: null }), true);
  assert.equal(sessionState()?.sessionId ?? null, null, "the scene is not attached to another registry");
  sessions = await byId();
  assert.ok(sessions.has(first.id), "the other registries stay");
});
