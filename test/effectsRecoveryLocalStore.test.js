import test from "node:test";
import assert from "node:assert/strict";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import {
  EFFECTS_RECOVERY_KEY,
  createEffectsRecovery,
  createLocalEffectsRecoveryStorage,
} from "../src/effectsRecovery.js";
import { HISTORY_LOCAL_DB_NAME, createLocalRecoveryDatabase } from "../src/historyLocalStore.js";
import { isLocalRecoveryAnchor } from "../src/historyLocalStoreCore.js";

const ROOM_ID = "room-1";

function fakeObr(initialJournal) {
  const state = { metadata: initialJournal === undefined ? {} : { [EFFECTS_RECOVERY_KEY]: structuredClone(initialJournal) }, updates: [] };
  return {
    state,
    room: { id: ROOM_ID },
    scene: {
      getMetadata: async () => structuredClone(state.metadata),
      setMetadata: async (update) => {
        state.updates.push(structuredClone(update));
        state.metadata = { ...state.metadata, ...structuredClone(update) };
      },
    },
  };
}

function journalIn(obr) {
  return obr.state.metadata[EFFECTS_RECOVERY_KEY];
}

function recoveryFor(obr, { enabled = true, database, appended = [], ...callbacks } = {}) {
  return createEffectsRecovery({
    obr,
    storage: createLocalEffectsRecoveryStorage({ obr, database, isEnabled: () => enabled, now: () => 1000, ...callbacks }),
    buildHistory: async (command) => ({
      id: `effects-history:${command.commandId}`,
      changes: [{ id: "token-a" }],
      effectsMutation: { commandId: command.commandId, changes: [{ id: "token-a" }], sideEffects: [] },
    }),
    appendHistory: async (entry, commandId) => { appended.push(commandId); },
    inspectCanonical: async () => "after",
    applySideEffect: async () => {},
  });
}

async function runCommand(recovery, commandId) {
  const isCurrent = () => true;
  const record = await recovery.prepare({ commandId, correlationId: commandId, kind: "token:teleport" }, { changes: [{ id: "token-a" }] }, [], isCurrent);
  return recovery.resume(record, isCurrent, { canonicalCommitted: true });
}

function localRecords(indexedDB) {
  return indexedDB.inspect(HISTORY_LOCAL_DB_NAME)?.stores?.recoveryStores?.records || [];
}

test("flag spento: il journal resta in scena e IndexedDB non viene aperto", async () => {
  const indexedDB = createVersionedIndexedDB();
  const obr = fakeObr();
  const recovery = recoveryFor(obr, { enabled: false, database: createLocalRecoveryDatabase({ indexedDB }) });
  await recovery.load(() => true);
  await runCommand(recovery, "cmd-1");
  assert.equal(obr.state.updates.length, 3);
  assert.equal(journalIn(obr).schemaVersion, 1);
  assert.deepEqual(journalIn(obr).receipts.map((receipt) => receipt.commandId), ["cmd-1"]);
  assert.equal(indexedDB.inspect(HISTORY_LOCAL_DB_NAME), null);
});

test("flag acceso: il journal va in IndexedDB e la scena riceve solo l'ancora, una volta", async () => {
  const indexedDB = createVersionedIndexedDB();
  const obr = fakeObr();
  const appended = [];
  const recovery = recoveryFor(obr, { database: createLocalRecoveryDatabase({ indexedDB }), appended });
  await recovery.load(() => true);
  await runCommand(recovery, "cmd-1");
  await runCommand(recovery, "cmd-2");

  assert.deepEqual(appended, ["cmd-1", "cmd-2"]);
  assert.equal(obr.state.updates.length, 1, "un solo aggiornamento di scena: l'ancora");
  const anchor = journalIn(obr);
  assert.equal(isLocalRecoveryAnchor(anchor), true);
  assert.ok(JSON.stringify(anchor).length < 120);
  const [record] = localRecords(indexedDB);
  assert.equal(record.scopeId, anchor.scopeId);
  assert.equal(record.roomId, ROOM_ID);
  assert.equal(record.store.scopeId, anchor.scopeId);
  assert.deepEqual(record.store.records, {});
  assert.deepEqual(record.store.receipts.map((receipt) => receipt.commandId), ["cmd-1", "cmd-2"]);
});

test("un record pendente in IndexedDB viene ripreso dopo il riavvio del background", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalRecoveryDatabase({ indexedDB });
  const obr = fakeObr();
  const first = recoveryFor(obr, { database });
  await first.load(() => true);
  await first.prepare({ commandId: "cmd-pending", correlationId: "cmd-pending", kind: "token:teleport" }, { changes: [{ id: "token-a" }] }, [], () => true);

  const appended = [];
  const restarted = recoveryFor(obr, { database, appended });
  await restarted.load(() => true);
  assert.equal(restarted.pending(), true);
  await restarted.recover(() => true);
  assert.equal(restarted.pending(), false);
  assert.deepEqual(appended, ["cmd-pending"]);
});

test("migrazione: un journal ancora in scena passa in IndexedDB con scopeId, record pendenti e receipt", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalRecoveryDatabase({ indexedDB });
  const legacyObr = fakeObr();
  const legacy = recoveryFor(legacyObr, { enabled: false, database });
  await legacy.load(() => true);
  await runCommand(legacy, "done-before");
  await legacy.prepare({ commandId: "pending-before", correlationId: "pending-before", kind: "token:teleport" }, { changes: [{ id: "token-a" }] }, [], () => true);
  const scopeId = journalIn(legacyObr).scopeId;

  const appended = [];
  const migrated = recoveryFor(legacyObr, { database, appended });
  await migrated.load(() => true);
  await migrated.recover(() => true);

  assert.deepEqual(appended, ["pending-before"]);
  assert.deepEqual(journalIn(legacyObr), { schemaVersion: 2, storage: "local", scopeId });
  const [record] = localRecords(indexedDB);
  assert.equal(record.scopeId, scopeId);
  assert.deepEqual(record.store.receipts.map((receipt) => receipt.commandId), ["done-before", "pending-before"]);
  assert.deepEqual(record.store.records, {});
});

test("journal di un altro browser: vuoto con lo stesso scopeId, avviso una volta", async () => {
  const indexedDB = createVersionedIndexedDB();
  const obr = fakeObr({ schemaVersion: 2, storage: "local", scopeId: "scope-elsewhere" });
  const warnings = [];
  const recovery = recoveryFor(obr, {
    database: createLocalRecoveryDatabase({ indexedDB }),
    onLocalJournalUnavailable: (detail) => warnings.push(detail),
  });
  await recovery.load(() => true);
  assert.equal(recovery.pending(), false);
  await runCommand(recovery, "cmd-1");
  assert.deepEqual(warnings, [{ scopeId: "scope-elsewhere" }]);
  assert.equal(journalIn(obr).scopeId, "scope-elsewhere", "lo scopeId della scena non cambia");
  assert.equal(obr.state.updates.length, 0, "l'ancora c'era già");
  assert.equal(localRecords(indexedDB)[0].scopeId, "scope-elsewhere");
});

test("flag rispento: la scrittura successiva riporta il journal intero in scena", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalRecoveryDatabase({ indexedDB });
  const obr = fakeObr();
  const on = recoveryFor(obr, { database });
  await on.load(() => true);
  await runCommand(on, "cmd-1");
  assert.equal(isLocalRecoveryAnchor(journalIn(obr)), true);

  const off = recoveryFor(obr, { enabled: false, database });
  await off.load(() => true);
  await runCommand(off, "cmd-2");
  assert.equal(journalIn(obr).schemaVersion, 1);
  assert.deepEqual(journalIn(obr).receipts.map((receipt) => receipt.commandId), ["cmd-1", "cmd-2"]);
});

test("D3: senza IndexedDB il journal resta in scena, con avviso", async () => {
  const failures = [];
  const obr = fakeObr();
  const recovery = recoveryFor(obr, {
    database: createLocalRecoveryDatabase({ indexedDB: null }),
    onLocalStoreFailed: (error) => failures.push(error.message),
  });
  await recovery.load(() => true);
  await runCommand(recovery, "cmd-1");
  assert.equal(journalIn(obr).schemaVersion, 1);
  assert.deepEqual(journalIn(obr).receipts.map((receipt) => receipt.commandId), ["cmd-1"]);
  assert.deepEqual([...new Set(failures)], ["history-local-store-unavailable"]);
});

test("un database creato dal passo 2 (versione 1) riceve lo store del journal senza perdere la History", async () => {
  const indexedDB = createVersionedIndexedDB();
  indexedDB.seed(HISTORY_LOCAL_DB_NAME, {
    version: 1,
    stores: { historyStores: { keyPath: "storeId", records: [{ storeId: "store-1", rev: 1, history: { entries: [] } }] } },
  });
  const obr = fakeObr();
  const recovery = recoveryFor(obr, { database: createLocalRecoveryDatabase({ indexedDB }) });
  await recovery.load(() => true);
  await runCommand(recovery, "cmd-1");
  const inspected = indexedDB.inspect(HISTORY_LOCAL_DB_NAME);
  assert.equal(inspected.version, 2);
  assert.deepEqual(inspected.stores.historyStores.records.map((record) => record.storeId), ["store-1"]);
  assert.equal(inspected.stores.recoveryStores.records.length, 1);
});

test("un'ancora sostituita in scena da fuori viene riscritta al comando successivo", async () => {
  const indexedDB = createVersionedIndexedDB();
  const obr = fakeObr();
  const recovery = recoveryFor(obr, { database: createLocalRecoveryDatabase({ indexedDB }) });
  await recovery.load(() => true);
  await runCommand(recovery, "cmd-1");
  const scopeId = journalIn(obr).scopeId;

  // Another plugin version or GM window rewrites the key while this background keeps running.
  obr.state.metadata = {};
  await runCommand(recovery, "cmd-2");
  assert.deepEqual(journalIn(obr), { schemaVersion: 2, storage: "local", scopeId }, "the anchor is back, same scopeId");

  const updatesBefore = obr.state.updates.length;
  await runCommand(recovery, "cmd-3");
  assert.equal(obr.state.updates.length, updatesBefore, "an anchor in place costs no scene write");
});
