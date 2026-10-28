import test from "node:test";
import assert from "node:assert/strict";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import {
  HISTORY_HEAD_VERSION,
  buildLocalHistoryHead,
  chooseHistoryWriteMode,
  hasLegacyHistoryEntries,
  isLocalHistoryHead,
  resolveLocalHistory,
} from "../src/historyLocalStoreCore.js";
import {
  HISTORY_LOCAL_DB_NAME,
  createHistoryStorage,
  createLocalHistoryDatabase,
  localStoreFlagEnabled,
  migrateLegacyHistory,
  pruneLocalStores,
  LOCAL_STORE_MAX_AGE_MS,
} from "../src/historyLocalStore.js";
import { HISTORY_OWNER_STATUS, createHistoryOwnerBroker, rewriteHistoryForStorage } from "../src/historyOwnerCore.js";

const ROOM_ID = "room-1";

function entry(id, storeSeq, extra = {}) {
  return { id, storeSeq, kind: "hp", label: `Voce ${id}`, changes: [{ id: "token-a", before: { hp: 10 }, after: { hp: 5 } }], ...extra };
}

function history(entries, seq = entries.reduce((max, item) => Math.max(max, item.storeSeq || 0), 0)) {
  return { version: 1, roomId: ROOM_ID, seq, entries };
}

function scene(initial) {
  const state = { value: initial === undefined ? undefined : structuredClone(initial), writes: [] };
  return {
    state,
    readScene: async () => (state.value === undefined ? undefined : structuredClone(state.value)),
    writeScene: async (value) => {
      state.writes.push(structuredClone(value));
      state.value = structuredClone(value);
    },
  };
}

// Composed like historyOwner.js: the scene read and write around resolveRead and prepareWrite.
function storageFor(sceneState, { enabled = true, database, ids = ["store-1", "store-2", "store-3"], ...callbacks } = {}) {
  const queue = [...ids];
  const storage = createHistoryStorage({
    database,
    readSceneValue: () => sceneState.readScene(),
    isEnabled: () => enabled,
    currentRoomId: () => ROOM_ID,
    createId: () => queue.shift(),
    now: () => 1000,
    ...callbacks,
  });
  return {
    async read({ owner = false } = {}) {
      return storage.resolveRead(await sceneState.readScene(), { owner });
    },
    write(history) {
      const value = storage.prepareWrite(history);
      return typeof value?.then === "function" ? value.then((next) => sceneState.writeScene(next)) : sceneState.writeScene(value);
    },
  };
}

// The broker reads before every write: the tests do the same.
async function ownerWrite(storage, next) {
  await storage.read({ owner: true });
  await storage.write(next);
}

test("testa v2: pochi byte, entries vuoto per le versioni precedenti, riconoscibile", () => {
  const big = history(Array.from({ length: 30 }, (_, index) => entry(`e${index}`, index + 1, { padding: "x".repeat(4000) })));
  const head = buildLocalHistoryHead({ storeId: "store-1", rev: 3, history: big, roomId: ROOM_ID });
  assert.equal(head.version, HISTORY_HEAD_VERSION);
  assert.deepEqual(head.entries, []);
  assert.equal(head.count, 30);
  assert.equal(head.seq, 30);
  assert.equal(head.lastEntryId, "e29");
  assert.ok(JSON.stringify(head).length < 400, `head ${JSON.stringify(head).length} B`);
  assert.equal(isLocalHistoryHead(head), true);
  assert.equal(isLocalHistoryHead(big), false);
  assert.equal(isLocalHistoryHead(undefined), false);
});

test("risoluzione: corrente, avanti (scena duplicata), indietro e mancante", () => {
  const head = { version: 2, storage: "local", roomId: ROOM_ID, storeId: "s", rev: 2, seq: 2, entries: [] };
  const record = (rev, entries) => ({ storeId: "s", rev, roomId: ROOM_ID, history: history(entries) });

  const current = resolveLocalHistory(head, record(2, [entry("a", 1), entry("b", 2)]));
  assert.equal(current.status, "current");
  assert.deepEqual(current.history.entries.map((item) => item.id), ["a", "b"]);

  const ahead = resolveLocalHistory(head, record(3, [entry("legacy"), entry("a", 1), entry("b", 2), entry("other-scene", 3)]));
  assert.equal(ahead.status, "ahead");
  assert.deepEqual(ahead.history.entries.map((item) => item.id), ["legacy", "a", "b"]);
  assert.equal(ahead.history.seq, 2);

  assert.equal(resolveLocalHistory(head, record(1, [entry("a", 1)])).status, "behind");
  assert.deepEqual(resolveLocalHistory(head, record(1, [entry("a", 1)])).history.entries, []);
  assert.equal(resolveLocalHistory(head, undefined).status, "missing");
  assert.equal(resolveLocalHistory(head, { ...record(2, []), roomId: "other" }, { roomId: ROOM_ID }).status, "missing");
});

test("scelta della scrittura: flag spento sempre scena, acceso sempre locale; voci da migrare riconosciute", () => {
  const head = { version: 2, storage: "local", storeId: "s", rev: 1, seq: 0, entries: [] };
  assert.equal(chooseHistoryWriteMode({ enabled: false, sceneValue: head }), "scene");
  assert.equal(chooseHistoryWriteMode({ enabled: false, sceneValue: history([entry("a", 1)]) }), "scene");
  assert.equal(chooseHistoryWriteMode({ enabled: true, sceneValue: head }), "local");
  assert.equal(chooseHistoryWriteMode({ enabled: true, sceneValue: history([entry("a", 1)]) }), "local");
  assert.equal(hasLegacyHistoryEntries(history([entry("a", 1)])), true);
  assert.equal(hasLegacyHistoryEntries(history([])), false);
  assert.equal(hasLegacyHistoryEntries(undefined), false);
  assert.equal(hasLegacyHistoryEntries(head), false);
});

test("flag spento: la History resta intera nella scena e IndexedDB non viene aperto", async () => {
  const indexedDB = createVersionedIndexedDB();
  const sceneState = scene(history([entry("a", 1)]));
  const storage = storageFor(sceneState, { enabled: false, database: createLocalHistoryDatabase({ indexedDB }) });
  const next = history([entry("a", 1), entry("b", 2)]);
  await ownerWrite(storage, next);
  assert.deepEqual(sceneState.state.value, next);
  assert.equal(indexedDB.inspect(HISTORY_LOCAL_DB_NAME), null);
});

test("flag acceso su scena vuota: voci in IndexedDB, in scena solo la testa", async () => {
  const indexedDB = createVersionedIndexedDB();
  const sceneState = scene(undefined);
  const storage = storageFor(sceneState, { database: createLocalHistoryDatabase({ indexedDB }) });
  const first = history([entry("a", 1, { padding: "x".repeat(5000) })]);
  await ownerWrite(storage, first);

  assert.equal(isLocalHistoryHead(sceneState.state.value), true);
  assert.equal(sceneState.state.value.storeId, "store-1");
  assert.equal(sceneState.state.value.rev, 1);
  assert.ok(JSON.stringify(sceneState.state.value).length < 400);
  const [record] = indexedDB.inspect(HISTORY_LOCAL_DB_NAME).stores.historyStores.records;
  assert.equal(record.storeId, "store-1");
  assert.deepEqual(record.history, first);

  // A reader in another iframe (its own storage instance) sees the full History.
  const reader = storageFor(sceneState, { enabled: false, database: createLocalHistoryDatabase({ indexedDB }) });
  assert.deepEqual(await reader.read(), first);

  const second = history([...first.entries, entry("b", 2)]);
  await ownerWrite(storage, second);
  assert.equal(sceneState.state.value.storeId, "store-1");
  assert.equal(sceneState.state.value.rev, 2);
  assert.deepEqual(await reader.read(), second);
});

test("flag acceso con voci ancora in scena: la prima scrittura le porta tutte in IndexedDB", async () => {
  const indexedDB = createVersionedIndexedDB();
  const sceneState = scene(history([entry("a", 1)]));
  const storage = storageFor(sceneState, { database: createLocalHistoryDatabase({ indexedDB }) });
  const next = history([entry("a", 1), entry("b", 2)]);
  await ownerWrite(storage, next);
  assert.equal(isLocalHistoryHead(sceneState.state.value), true);
  const [record] = indexedDB.inspect(HISTORY_LOCAL_DB_NAME).stores.historyStores.records;
  assert.deepEqual(record.history, next);
});

test("flag spento dopo il locale: la scrittura successiva riporta la History intera in scena", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const sceneState = scene(undefined);
  await ownerWrite(storageFor(sceneState, { database }), history([entry("a", 1)]));
  assert.equal(isLocalHistoryHead(sceneState.state.value), true);

  const off = storageFor(sceneState, { enabled: false, database });
  assert.deepEqual(await off.read({ owner: true }), history([entry("a", 1)]));
  const next = history([entry("a", 1), entry("b", 2)]);
  await off.write(next);
  assert.deepEqual(sceneState.state.value, next);
});

test("scena duplicata: le due scene si separano senza mescolare le voci", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const original = scene(undefined);
  await ownerWrite(storageFor(original, { database, ids: ["shared"] }), history([entry("a", 1)]));
  const copy = scene(original.state.value);

  // The original keeps appending to the shared store.
  await ownerWrite(storageFor(original, { database, ids: [] }), history([entry("a", 1), entry("original-b", 2)]));
  assert.equal(original.state.value.storeId, "shared");

  // The copy's head is behind the store: it sees only what it had, and its next write gets its own store.
  const copyStorage = storageFor(copy, { database, ids: ["copy-store"] });
  const seen = await copyStorage.read({ owner: true });
  assert.deepEqual(seen.entries.map((item) => item.id), ["a"]);
  await copyStorage.write(history([entry("a", 1), entry("copy-b", 2)]));
  assert.equal(copy.state.value.storeId, "copy-store");

  const originalReader = storageFor(original, { enabled: false, database });
  const copyReader = storageFor(copy, { enabled: false, database });
  assert.deepEqual((await originalReader.read()).entries.map((item) => item.id), ["a", "original-b"]);
  assert.deepEqual((await copyReader.read()).entries.map((item) => item.id), ["a", "copy-b"]);
});

test("archivio locale assente (altro browser): History vuota, avviso, nuovo archivio alla scrittura", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const sceneState = scene({ version: 2, storage: "local", roomId: ROOM_ID, storeId: "elsewhere", rev: 4, seq: 7, entries: [] });
  const warnings = [];
  const storage = storageFor(sceneState, {
    database,
    ids: ["fresh"],
    onLocalHistoryUnavailable: (detail) => warnings.push(detail),
  });
  const seen = await storage.read({ owner: true });
  assert.deepEqual(seen.entries, []);
  assert.equal(seen.seq, 7);
  await storage.write(history([entry("x", 8)]));
  assert.deepEqual(warnings, [{ status: "missing", storeId: "elsewhere" }]);
  assert.equal(sceneState.state.value.storeId, "fresh");
});

test("lettura tra la scrittura in IndexedDB e quella della testa: si vede lo stato precedente, completo", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const sceneState = scene(undefined);
  await ownerWrite(storageFor(sceneState, { database }), history([entry("a", 1)]));
  const headBefore = structuredClone(sceneState.state.value);

  const stalled = scene(headBefore);
  stalled.writeScene = async () => { throw new Error("scene write lost"); };
  const stalledStorage = storageFor(stalled, { database });
  await stalledStorage.read({ owner: true });
  await assert.rejects(stalledStorage.write(history([entry("a", 1), entry("b", 2)])), /scene write lost/u);

  const reader = storageFor(scene(headBefore), { enabled: false, database });
  assert.deepEqual((await reader.read()).entries.map((item) => item.id), ["a"]);
});

test("D3: IndexedDB inutilizzabile mentre la History è ancora in scena, resta in scena con avviso", async () => {
  const failures = [];
  const sceneState = scene(undefined);
  const storage = storageFor(sceneState, {
    database: createLocalHistoryDatabase({ indexedDB: null }),
    onLocalStoreFailed: (error) => failures.push(error.message),
  });
  const next = history([entry("a", 1)]);
  await ownerWrite(storage, next);
  assert.deepEqual(sceneState.state.value, next);
  assert.deepEqual(failures, ["history-local-store-unavailable"]);
});

test("il broker dell'owner sullo storage locale: append idempotente, remove e clear con la testa in scena", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const sceneState = scene(undefined);
  const storage = storageFor(sceneState, { database, ids: ["store-1"] });
  const broker = createHistoryOwnerBroker({
    readHistory: () => storage.read({ owner: true }),
    writeHistory: (next) => storage.write(next),
    isSceneCurrent: () => true,
  });
  broker.setSceneContext({ ready: true, sceneIdentity: "scene-A", sceneEpoch: 1 });
  let sequence = 0;
  const command = (kind, payload = {}) => {
    sequence += 1;
    return broker.handle({ requestId: `r${sequence}`, commandId: `c${sequence}`, sceneIdentity: "scene-A", kind, ...payload });
  };
  const reader = storageFor(sceneState, { enabled: false, database });
  const ids = async () => ((await reader.read())?.entries || []).map((item) => item.id);

  assert.equal((await command("append", { entry: { id: "e1", kind: "hp", changes: [] } })).status, "appended");
  assert.equal((await command("append", { entry: { id: "e2", kind: "hp", changes: [] } })).status, "appended");
  const duplicate = await command("append", { entry: { id: "e1", kind: "hp", changes: [] } });
  assert.equal(duplicate.changed, false);
  assert.deepEqual(await ids(), ["e1", "e2"]);
  assert.equal(isLocalHistoryHead(sceneState.state.value), true);
  assert.equal(sceneState.state.value.count, 2);

  assert.equal((await command("remove", { ids: ["e1"] })).changed, true);
  assert.deepEqual(await ids(), ["e2"]);
  assert.equal((await command("clear")).changed, true);
  assert.deepEqual(await ids(), []);
  assert.deepEqual(sceneState.state.writes.map((value) => value.rev), [1, 2, 3, 4]);
  assert.ok(sceneState.state.writes.every((value) => JSON.stringify(value).length < 400));
});

function ownerFor(sceneState, options) {
  const storage = storageFor(sceneState, options);
  const broker = createHistoryOwnerBroker({
    readHistory: () => storage.read({ owner: true }),
    writeHistory: (next) => storage.write(next),
    isSceneCurrent: () => true,
  });
  broker.setSceneContext({ ready: true, sceneIdentity: "scene-A", sceneEpoch: 1 });
  let sequence = 0;
  const command = (kind, payload = {}) => {
    sequence += 1;
    return broker.handle({ requestId: `r${sequence}`, commandId: `c${sequence}`, sceneIdentity: "scene-A", kind, ...payload });
  };
  return { broker, command };
}

test("rewriteHistoryForStorage riscrive la stessa History e non tocca una History vuota", () => {
  const legacy = history([entry("a", 1), entry("b", 2)]);
  const migrated = rewriteHistoryForStorage(legacy);
  assert.equal(migrated.status, HISTORY_OWNER_STATUS.MIGRATED);
  assert.equal(migrated.changed, true);
  assert.deepEqual(migrated.history.entries, legacy.entries);
  assert.equal(migrated.history.seq, 2);
  assert.equal(rewriteHistoryForStorage(history([])).status, HISTORY_OWNER_STATUS.NOOP);
});

test("migrazione: 30 voci in scena passano in IndexedDB identiche, in scena resta l'ancora", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const legacy = history(Array.from({ length: 30 }, (_, index) => entry(`e${index}`, index + 1, { padding: "x".repeat(4000) })));
  const sceneState = scene(legacy);
  const { command } = ownerFor(sceneState, { database, ids: ["migrated"] });

  const result = await command("migrate");
  assert.equal(result.status, HISTORY_OWNER_STATUS.MIGRATED);
  assert.equal(isLocalHistoryHead(sceneState.state.value), true);
  assert.equal(sceneState.state.value.count, 30);
  assert.ok(JSON.stringify(sceneState.state.value).length < 400);

  const reader = storageFor(sceneState, { enabled: false, database });
  const read = await reader.read();
  assert.deepEqual(read.entries, legacy.entries);
  assert.equal(read.seq, 30);

  // The History keeps working on the local store: retention 30, increasing seq.
  assert.equal((await command("append", { entry: { id: "after", kind: "hp", changes: [] } })).status, HISTORY_OWNER_STATUS.APPLIED);
  const afterAppend = await reader.read();
  assert.equal(afterAppend.entries.length, 30);
  assert.equal(afterAppend.entries.at(-1).id, "after");
  assert.equal(afterAppend.entries.at(-1).storeSeq, 31);
  assert.equal(sceneState.state.value.storeId, "migrated");
  assert.equal(sceneState.state.value.rev, 2);
});

test("migrazione di una History vuota: nessuna scrittura", async () => {
  const sceneState = scene(history([]));
  const { command } = ownerFor(sceneState, { database: createLocalHistoryDatabase({ indexedDB: createVersionedIndexedDB() }) });
  assert.equal((await command("migrate")).status, HISTORY_OWNER_STATUS.NOOP);
  assert.deepEqual(sceneState.state.writes, []);
});

test("avvio dell'owner: migra solo a flag acceso e solo una History ancora in scena", async () => {
  const calls = [];
  const run = (overrides) => migrateLegacyHistory({
    isEnabled: () => true,
    readSceneValue: async () => history([entry("a", 1)]),
    handle: async (command) => { calls.push(command); return { status: HISTORY_OWNER_STATUS.MIGRATED }; },
    sceneIdentity: "scene-A",
    createId: () => "history-migrate:1",
    ...overrides,
  });

  assert.equal((await run({ isEnabled: () => false })).reason, "disabled");
  assert.equal((await run({ sceneIdentity: null })).reason, "disabled");
  assert.equal((await run({ readSceneValue: async () => buildLocalHistoryHead({ storeId: "s", rev: 1, history: history([]) }) })).reason, "nothing-to-migrate");
  assert.equal((await run({ readSceneValue: async () => history([]) })).reason, "nothing-to-migrate");
  assert.equal((await run({ isCurrent: () => false })).reason, "stale");
  assert.deepEqual(calls, []);

  assert.equal((await run({})).status, HISTORY_OWNER_STATUS.MIGRATED);
  assert.deepEqual(calls, [{
    kind: "migrate",
    requestId: "history-migrate:1",
    commandId: "history-migrate:1",
    correlationId: "history-migrate:1",
    sceneIdentity: "scene-A",
  }]);
});

test("rollback: una History riscritta in scena da una versione precedente viene migrata di nuovo", async () => {
  const indexedDB = createVersionedIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB });
  const sceneState = scene(history([entry("a", 1)]));
  await ownerFor(sceneState, { database, ids: ["first"] }).command("migrate");
  assert.equal(sceneState.state.value.storeId, "first");

  // The older plugin reads the head as an empty History and writes its own version 1 value over it.
  await sceneState.writeScene(history([entry("old-version", 1)]));
  const { command } = ownerFor(sceneState, { database, ids: ["second"] });
  assert.equal((await command("migrate")).status, HISTORY_OWNER_STATUS.MIGRATED);
  assert.equal(sceneState.state.value.storeId, "second");
  const reader = storageFor(sceneState, { enabled: false, database });
  assert.deepEqual((await reader.read()).entries.map((item) => item.id), ["old-version"]);
  const storeIds = indexedDB.inspect(HISTORY_LOCAL_DB_NAME).stores.historyStores.records.map((record) => record.storeId).sort();
  assert.deepEqual(storeIds, ["first", "second"]);
});

test("ancora non scritta durante la migrazione: la History resta in scena e la migrazione si ripete", async () => {
  const database = createLocalHistoryDatabase({ indexedDB: createVersionedIndexedDB() });
  const legacy = history([entry("a", 1), entry("b", 2)]);
  const sceneState = scene(legacy);
  const realWrite = sceneState.writeScene;
  sceneState.writeScene = async () => { throw new Error("scene write lost"); };
  const failing = ownerFor(sceneState, { database, ids: ["lost"] });
  assert.equal((await failing.command("migrate")).status, HISTORY_OWNER_STATUS.FAILED);
  assert.deepEqual(sceneState.state.value, legacy);

  sceneState.writeScene = realWrite;
  const retry = ownerFor(sceneState, { database, ids: ["kept"] });
  assert.equal((await retry.command("migrate")).status, HISTORY_OWNER_STATUS.MIGRATED);
  assert.equal(sceneState.state.value.storeId, "kept");
  const reader = storageFor(sceneState, { enabled: false, database });
  assert.deepEqual((await reader.read()).entries, legacy.entries);
});

test("D3 durante la migrazione: senza IndexedDB la History resta in scena, con avviso", async () => {
  const failures = [];
  const legacy = history([entry("a", 1)]);
  const sceneState = scene(legacy);
  const { command } = ownerFor(sceneState, {
    database: createLocalHistoryDatabase({ indexedDB: null }),
    onLocalStoreFailed: (error) => failures.push(error.message),
  });
  assert.equal((await command("migrate")).status, HISTORY_OWNER_STATUS.MIGRATED);
  assert.deepEqual(sceneState.state.value, legacy);
  assert.deepEqual(failures, ["history-local-store-unavailable"]);
});

test("flag di ARCH-009: acceso per default nel browser, \"0\" lo spegne, senza localStorage resta spento", () => {
  const key = "com.thebigpicture.initiative/history-local-store";
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const install = (value) => Object.defineProperty(globalThis, "localStorage", { value, configurable: true, writable: true });
  const storageWith = (values) => ({ getItem: (name) => (Object.hasOwn(values, name) ? values[name] : null) });
  try {
    install(undefined);
    assert.equal(localStoreFlagEnabled(), false, "not a browser: the scene, as before");
    install(storageWith({}));
    assert.equal(localStoreFlagEnabled(), true, "no value: on by default");
    install(storageWith({ [key]: "1" }));
    assert.equal(localStoreFlagEnabled(), true);
    install(storageWith({ [key]: "0" }));
    assert.equal(localStoreFlagEnabled(), false, "\"0\" turns it off");
    install({ getItem: () => { throw new Error("blocked"); } });
    assert.equal(localStoreFlagEnabled(), false, "site storage blocked: the scene");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("pulizia (D5): via gli archivi non scritti da 30 giorni; restano quelli della scena attuale e i journal pendenti", async () => {
  const indexedDB = createVersionedIndexedDB();
  const now = Date.UTC(2026, 9, 24);
  const day = 24 * 60 * 60 * 1000;
  indexedDB.seed(HISTORY_LOCAL_DB_NAME, {
    version: 2,
    stores: {
      historyStores: { keyPath: "storeId", records: [
        { storeId: "recent", rev: 1, history: history([]), touchedAt: now - 2 * day },
        { storeId: "old", rev: 4, history: history([entry("a", 1)]), touchedAt: now - 31 * day },
        { storeId: "old-current", rev: 9, history: history([entry("b", 1)]), touchedAt: now - 90 * day },
        { storeId: "no-date", rev: 1, history: history([]) },
      ] },
      recoveryStores: { keyPath: "scopeId", records: [
        { scopeId: "recent-journal", store: { schemaVersion: 1, scopeId: "recent-journal", records: {}, receipts: [] }, touchedAt: now - day },
        { scopeId: "old-journal", store: { schemaVersion: 1, scopeId: "old-journal", records: {}, receipts: [{ commandId: "c" }] }, touchedAt: now - 40 * day },
        { scopeId: "old-pending", store: { schemaVersion: 1, scopeId: "old-pending", records: { c1: { phase: "PREPARED" } }, receipts: [] }, touchedAt: now - 40 * day },
        { scopeId: "old-current-journal", store: { schemaVersion: 1, scopeId: "old-current-journal", records: {}, receipts: [] }, touchedAt: now - 40 * day },
      ] },
    },
  });

  const removed = await pruneLocalStores({
    indexedDB,
    now,
    keepHistoryStoreIds: ["old-current", ""],
    keepRecoveryScopeIds: ["old-current-journal"],
  });
  assert.deepEqual(removed, { historyRemoved: ["old"], recoveryRemoved: ["old-journal"] });
  const stores = indexedDB.inspect(HISTORY_LOCAL_DB_NAME).stores;
  assert.deepEqual(stores.historyStores.records.map((record) => record.storeId).sort(), ["no-date", "old-current", "recent"]);
  assert.deepEqual(stores.recoveryStores.records.map((record) => record.scopeId).sort(), ["old-current-journal", "old-pending", "recent-journal"]);

  assert.equal(LOCAL_STORE_MAX_AGE_MS, 30 * day);
  const again = await pruneLocalStores({ indexedDB, now, keepHistoryStoreIds: ["old-current"], keepRecoveryScopeIds: ["old-current-journal"] });
  assert.deepEqual(again, { historyRemoved: [], recoveryRemoved: [] }, "a second pass removes nothing more");
});

test("pulizia su un database appena creato o senza IndexedDB: nessun errore inatteso", async () => {
  const empty = await pruneLocalStores({ indexedDB: createVersionedIndexedDB(), now: Date.now() });
  assert.deepEqual(empty, { historyRemoved: [], recoveryRemoved: [] });
  await assert.rejects(pruneLocalStores({ indexedDB: null }), /history-local-store-unavailable/u);
});

// Lot L14 of the bugfix pass (HI-05): a connection the browser closes (site data cleared, storage pressure) kept
// failing every History and journal call until the page was reloaded.
function closableIndexedDB() {
  const base = createVersionedIndexedDB();
  const connections = [];
  return {
    connections,
    indexedDB: {
      open(name, version) {
        const request = base.open(name, version);
        let onsuccess = null;
        Object.defineProperty(request, "onsuccess", {
          set(listener) { onsuccess = listener; },
          get() { return onsuccess && ((event) => { connections.push(request.result); return onsuccess(event); }); },
        });
        return request;
      },
    },
  };
}
const closedError = () => Object.assign(new Error("The database connection is closing."), { name: "InvalidStateError" });

test("L14: dopo una chiusura forzata la connessione locale si riapre, con o senza l'evento close", async () => {
  const fake = closableIndexedDB();
  const database = createLocalHistoryDatabase({ indexedDB: fake.indexedDB });
  await database.put({ storeId: "store-1", entries: [] });
  assert.equal(fake.connections.length, 1);

  // Closed under us, the close event not delivered yet: transaction() throws InvalidStateError.
  fake.connections[0].transaction = () => { throw closedError(); };
  assert.deepEqual(await database.get("store-1"), { storeId: "store-1", entries: [] });
  assert.equal(fake.connections.length, 2, "a new connection");

  // Closed with its close event: the next call opens again.
  fake.connections[1].transaction = () => { throw closedError(); };
  fake.connections[1].onclose();
  await database.put({ storeId: "store-2", entries: [] });
  assert.equal(fake.connections.length, 3);
  assert.deepEqual(await database.get("store-2"), { storeId: "store-2", entries: [] });
});
