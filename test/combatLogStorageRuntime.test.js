import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const fakeIndexedDB = createVersionedIndexedDB();
globalThis.indexedDB = fakeIndexedDB;
globalThis.IDBKeyRange = versionedKeyRange;

const DB_NAME = "com.thebigpicture.initiative.combat-log";
const ROOM_ID = "room-storage-runtime";
const session = {
  id: "legacy-session",
  version: 1,
  roomId: ROOM_ID,
  name: "Legacy session",
  startedAt: 1,
  updatedAt: 2,
  nextSequence: 76,
};
const events = Array.from({ length: 75 }, (_, index) => ({
  id: index === 0 ? "legacy-event" : `legacy-event-${index + 1}`,
  sessionId: session.id,
  sequence: index + 1,
  at: index + 1,
  kind: "spell",
  payload: { causality: { instanceId: `instance-${index + 1}` }, custom: "preserve" },
}));

fakeIndexedDB.seed(DB_NAME, {
  version: 1,
  stores: {
    sessions: { keyPath: "id", records: [session] },
    events: { keyPath: "id", indexes: { sessionId: "sessionId" }, records: events },
  },
});

const metadata = {
  "com.thebigpicture.initiative.combat-log-state": {
    version: 1,
    sessionId: session.id,
    name: session.name,
    startedAt: session.startedAt,
  },
};
const obr = {
  room: { id: ROOM_ID },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => structuredClone(metadata),
    setMetadata: async (patch) => Object.assign(metadata, structuredClone(patch)),
  },
  broadcast: {
    sendMessage: async () => {},
    onMessage: () => () => {},
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: obr } });

const {
  COMBAT_LOG_DATABASE_VERSION,
  exportCombatLogJSONFromStorage,
  getCombatLogEventPage,
  getCombatLogEvents,
  getCombatLogStorageStats,
  importCombatLogBundle,
  listCombatLogSessions,
} = await import("../src/combatLog.js");

test("upgrade reale v1 -> v2 preserva record e crea indice composito", async () => {
  assert.equal(COMBAT_LOG_DATABASE_VERSION, 2);
  const stored = await getCombatLogEvents(session.id);
  assert.equal(stored.length, 75);
  assert.equal(stored[0].payload.causality.instanceId, "instance-1");
  assert.deepEqual(fakeIndexedDB.inspect(DB_NAME), {
    version: 2,
    stores: {
      sessions: {
        keyPath: "id",
        indexes: [],
        records: [session],
      },
      events: {
        keyPath: "id",
        indexes: ["sessionId", "sessionSequence"],
        records: events,
      },
    },
  });
});

test("paginazione indexedDB bounded ritorna pagina più recente e cursore precedente", async () => {
  const newest = await getCombatLogEventPage(session.id, { limit: 50 });
  assert.equal(newest.totalCount, 75);
  assert.deepEqual(newest.events.map((event) => event.sequence), Array.from({ length: 50 }, (_, index) => index + 26));
  assert.equal(newest.oldestSequence, 26);
  assert.equal(newest.newestSequence, 75);
  assert.equal(newest.hasOlder, true);
  assert.equal(newest.hasNewer, false);
  assert.match(newest.next, /^clp1:/u);

  const oldest = await getCombatLogEventPage(session.id, { limit: 50, beforeSequence: newest.oldestSequence });
  assert.deepEqual(oldest.events.map((event) => event.sequence), Array.from({ length: 25 }, (_, index) => index + 1));
  assert.equal(oldest.hasOlder, false);
  assert.equal(oldest.hasNewer, true);
});

test("export completo usa bundle v3 e import v3 è atomico/idempotente con collisione deterministica", async () => {
  const exported = JSON.parse(await exportCombatLogJSONFromStorage(session.id));
  assert.equal(exported.format, "take-initiative-combat-log");
  assert.equal(exported.version, 3);
  assert.equal(exported.events.length, 75);
  assert.equal(exported.events.every((event) => event.version === 3), true);

  const first = await importCombatLogBundle(exported);
  assert.equal(first.status, "imported");
  assert.equal(first.importedCount, 75);
  const reused = await importCombatLogBundle({ ...exported, exportedAt: exported.exportedAt + 1 });
  assert.equal(reused.status, "reused");
  assert.equal(reused.importedCount, 0);

  const colliding = structuredClone(exported);
  colliding.session.name = "Legacy session copy";
  colliding.events[0].payload.custom = "different";
  const collision = await importCombatLogBundle(colliding);
  assert.equal(collision.status, "imported");
  assert.equal(collision.remappedEventCount, 75);
  const stats = await getCombatLogStorageStats();
  assert.equal(stats.sessionCount, 3);
  assert.equal(stats.eventCount, 225);
  assert.equal(stats.importedSessionCount, 2);
  const importedRecords = fakeIndexedDB.inspect(DB_NAME).stores.events.records
    .filter((event) => event.sessionId === collision.session.id);
  assert.equal(importedRecords.length, 75);
  assert.equal(importedRecords[0].sourceEventId, "legacy-event");
  assert.equal((await listCombatLogSessions({ includeStats: true })).find((item) => item.id === collision.session.id).eventCount, 75);
});

after(() => {
  if (previousIndexedDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = previousIndexedDB;
  if (previousKeyRange === undefined) delete globalThis.IDBKeyRange;
  else globalThis.IDBKeyRange = previousKeyRange;
});
