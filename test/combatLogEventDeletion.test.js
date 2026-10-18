import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const database = createVersionedIndexedDB();
let connection;
const open = database.open.bind(database);
database.open = (...args) => {
  const request = open(...args);
  let onSuccess;
  Object.defineProperty(request, "onsuccess", {
    set(handler) { onSuccess = handler; },
    get() { return onSuccess && ((event) => { connection = request.result; onSuccess(event); }); },
  });
  return request;
};
globalThis.indexedDB = database;
globalThis.IDBKeyRange = versionedKeyRange;
const metadata = {};
let role = "GM";
let onRoleRead = null;
let notifications = 0;
let sceneWrites = 0;
const obr = {
  room: { id: "event-deletion-room" },
  player: { getRole: async () => { onRoleRead?.(); return role; } },
  scene: {
    getMetadata: async () => structuredClone(metadata),
    setMetadata: async (patch) => { sceneWrites += 1; Object.assign(metadata, structuredClone(patch)); },
    items: { getItems: async () => [] },
  },
  broadcast: { sendMessage: async () => { notifications += 1; }, onMessage: () => () => {} },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: obr } });
const log = await import("../src/combatLog.js");
const { currentSceneEpoch, invalidateSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const input = (id) => ({ id, kind: "note", source: "manual", label: id, payload: { text: id } });
const append = (id) => log.appendCombatLogEvent(input(id), { context: { round: 1 } });
test.beforeEach(() => { role = "GM"; onRoleRead = null; markSceneEpochReady("delete-test"); });

test("delete one event changes only that log, preserves sequence allocation, counts and exports", async () => {
  const session = await log.startCombatLogSession("Pulizia");
  await append("delete-one");
  await append("keep-one");
  const beforeMetadata = structuredClone(metadata);
  const writesBefore = sceneWrites;
  const notificationsBefore = notifications;
  assert.equal(await log.deleteCombatLogEvent(session.id, "delete-one"), true);
  assert.deepEqual((await log.getCombatLogEvents(session.id)).map((event) => [event.id, event.sequence]), [["keep-one", 2]]);
  assert.equal((await log.getCombatLogEventPage(session.id)).totalCount, 1);
  assert.equal((await log.listCombatLogSessions({ includeStats: true })).find((row) => row.id === session.id).eventCount, 1);
  const exported = JSON.parse(await log.exportCombatLogJSONFromStorage(session.id));
  assert.deepEqual(exported.events.map((event) => event.id), ["keep-one"]);
  assert.equal(exported.session.nextSequence, 3);
  assert.deepEqual(metadata, beforeMetadata);
  assert.equal(sceneWrites, writesBefore);
  assert.equal(notifications, notificationsBefore + 1);
  const [next] = await append("next-event");
  assert.equal(next.sequence, 3);
});

test("repeated or cross-session deletion is a no-op and a retry cannot recreate a deleted event", async () => {
  const session = await log.startCombatLogSession("Retry");
  await append("delete-retry");
  const other = await log.startCombatLogSession("Altro");
  const before = notifications;
  assert.equal(await log.deleteCombatLogEvent(other.id, "delete-retry"), false);
  assert.equal(await log.deleteCombatLogEvent(session.id, "delete-retry"), true);
  assert.equal(await log.deleteCombatLogEvent(session.id, "delete-retry"), false);
  assert.equal(notifications, before + 1);
  await log.activateCombatLogSession(session.id);
  const beforeRetry = notifications;
  assert.equal((await append("delete-retry")).length, 0);
  assert.equal((await log.getCombatLogEvents(session.id)).length, 0);
  assert.equal(notifications, beforeRetry);
});

test("only a GM in the current scene may delete, including when the scene changes during the role check", async () => {
  const session = await log.startCombatLogSession("Permessi");
  await append("guarded-event");
  role = "PLAYER";
  await assert.rejects(log.deleteCombatLogEvent(session.id, "guarded-event"), /Solo il GM/);
  role = "GM";
  const epoch = currentSceneEpoch();
  onRoleRead = () => invalidateSceneEpoch("delete-test");
  assert.equal(await log.deleteCombatLogEvent(session.id, "guarded-event", { sceneEpoch: epoch }), false);
  onRoleRead = null;
  markSceneEpochReady("delete-test");
  assert.equal(await log.deleteCombatLogEvent(session.id, "guarded-event", { sceneEpoch: epoch }), false);
  assert.equal((await log.getCombatLogEvents(session.id)).length, 1);
});

test("an aborted deletion rolls back event and session without broadcasting a change", async () => {
  const session = await log.startCombatLogSession("Rollback");
  await append("rollback-event");
  const before = database.inspect(log.COMBAT_LOG_DATABASE_NAME);
  const beforeNotifications = notifications;
  const transaction = connection.transaction;
  connection.transaction = (...args) => {
    const tx = transaction(...args);
    const objectStore = tx.objectStore;
    tx.objectStore = (name) => {
      const store = objectStore(name);
      if (name === "events") {
        const remove = store.delete;
        store.delete = (key) => {
          const request = remove(key);
          request.onsuccess = () => { tx.error = new Error("forced abort"); tx.abort(); };
          return request;
        };
      }
      return store;
    };
    return tx;
  };
  try {
    await assert.rejects(log.deleteCombatLogEvent(session.id, "rollback-event"), /annullata/i);
  } finally {
    connection.transaction = transaction;
  }
  assert.deepEqual(database.inspect(log.COMBAT_LOG_DATABASE_NAME), before);
  assert.equal(notifications, beforeNotifications);
});

test("export recalculates the event count after cleaning an imported session", async () => {
  const source = await log.startCombatLogSession("Da importare");
  await append("import-delete");
  await append("import-keep");
  const imported = await log.importCombatLogBundle(JSON.parse(await log.exportCombatLogJSONFromStorage(source.id)));
  const [event] = await log.getCombatLogEvents(imported.session.id);
  assert.equal(await log.deleteCombatLogEvent(imported.session.id, event.id), true);
  const exported = JSON.parse(await log.exportCombatLogJSONFromStorage(imported.session.id));
  assert.equal(exported.events.length, 1);
  assert.equal(exported.session.eventCount, exported.events.length);
  const direct = JSON.parse(log.exportCombatLogJSON(imported.session, exported.events));
  assert.equal(direct.session.eventCount, 1);
});

test("cleanup remains available with automatic recording disabled", async () => {
  const session = await log.startCombatLogSession("Disabilitato");
  await append("disabled-recording-event");
  log.unmountCombatLogEventSink();
  assert.equal(await log.deleteCombatLogEvent(session.id, "disabled-recording-event"), true);
  assert.equal((await log.getCombatLogEvents(session.id)).length, 0);
});

after(() => {
  if (previousIndexedDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = previousIndexedDB;
  if (previousKeyRange === undefined) delete globalThis.IDBKeyRange;
  else globalThis.IDBKeyRange = previousKeyRange;
});
