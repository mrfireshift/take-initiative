import assert from "node:assert/strict";
import test, { after, mock } from "node:test";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createFakeIndexedDB() {
  const stores = new Map();

  function completeWhenIdle(tx) {
    if (tx.pending || tx.completed || tx.aborted) return;
    queueMicrotask(() => {
      if (!tx.pending && !tx.completed && !tx.aborted) {
        tx.completed = true;
        tx.oncomplete?.();
      }
    });
  }

  function requestIn(tx, executor) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    tx.pending += 1;
    queueMicrotask(() => {
      if (tx.aborted) {
        tx.pending -= 1;
        completeWhenIdle(tx);
        return;
      }
      try {
        request.result = executor();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        let prevented = false;
        request.onerror?.({
          target: request,
          preventDefault() { prevented = true; },
        });
        if (!prevented) {
          tx.error = error;
          tx.abort();
        }
      } finally {
        tx.pending -= 1;
        completeWhenIdle(tx);
      }
    });
    return request;
  }

  function storeFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  function makeStore(name, tx) {
    const map = storeFor(name);
    return {
      get(key) {
        return requestIn(tx, () => clone(map.get(key)));
      },
      getAll() {
        return requestIn(tx, () => [...map.values()].map(clone));
      },
      put(value) {
        return requestIn(tx, () => {
          map.set(value.id, clone(value));
          return value;
        });
      },
      add(value) {
        return requestIn(tx, () => {
          if (map.has(value.id)) {
            const error = new Error("duplicate-key");
            error.name = "ConstraintError";
            throw error;
          }
          map.set(value.id, clone(value));
          return value;
        });
      },
      delete(key) {
        return requestIn(tx, () => map.delete(key));
      },
      index() {
        return {
          getAll(value) {
            return requestIn(tx, () => [...map.values()]
              .filter((entry) => entry.sessionId === value)
              .map(clone));
          },
          openCursor(range) {
            const wanted = range?.value ?? range;
            const keys = [...map.entries()]
              .filter(([, entry]) => entry.sessionId === wanted)
              .map(([key]) => key);
            let position = 0;
            const request = { result: null, error: null, onsuccess: null, onerror: null };
            const emit = () => {
              tx.pending += 1;
              queueMicrotask(() => {
                if (tx.aborted) {
                  tx.pending -= 1;
                  completeWhenIdle(tx);
                  return;
                }
                if (position >= keys.length) {
                  request.result = null;
                  request.onsuccess?.({ target: request });
                } else {
                  const key = keys[position];
                  request.result = {
                    value: clone(map.get(key)),
                    delete() { map.delete(key); },
                    continue() { position += 1; emit(); },
                  };
                  request.onsuccess?.({ target: request });
                }
                tx.pending -= 1;
                completeWhenIdle(tx);
              });
            };
            emit();
            return request;
          },
        };
      },
    };
  }

  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) {
      storeFor(name);
      return { createIndex() {} };
    },
    transaction(names) {
      const tx = {
        pending: 0,
        completed: false,
        aborted: false,
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore(name) { return makeStore(name, tx); },
        abort() {
          if (tx.aborted || tx.completed) return;
          tx.aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
      };
      void names;
      return tx;
    },
  };

  return {
    open() {
      const request = { result: database, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    },
    inspect(name) {
      return [...(stores.get(name)?.values() || [])].map(clone);
    },
  };
}

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const fakeIndexedDB = createFakeIndexedDB();
globalThis.indexedDB = fakeIndexedDB;
globalThis.IDBKeyRange = { only: (value) => ({ value }) };

const metadata = {
  "com.thebigpicture.initiative/state": {
    round: 3,
    current: 0,
    order: ["target-1"],
  },
};
const sdkCalls = { metadataReads: 0, itemReads: 0, notifications: 0 };
const obr = {
  room: { id: "room-runtime" },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => {
      sdkCalls.metadataReads += 1;
      return clone(metadata);
    },
    setMetadata: async (patch) => Object.assign(metadata, clone(patch)),
    items: {
      getItems: async () => {
        sdkCalls.itemReads += 1;
        return [{ id: "target-1", name: "Goblin" }];
      },
    },
  },
  broadcast: {
    sendMessage: async () => { sdkCalls.notifications += 1; },
    onMessage: () => () => {},
  },
};

mock.module("@owlbear-rodeo/sdk", { exports: { default: obr } });

const {
  addCombatLogNote,
  getCombatLogEvents,
  listCombatLogSessions,
  peekActiveCombatLogData,
  recordCombatTurn,
  recordHistoryInCombatLog,
  unmountCombatLogEventSink,
} = await import("../src/combatLog.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

function hpEntry(payload = { source: "first" }, id = "history-runtime-1") {
  return {
    id,
    at: 1000,
    kind: "hp",
    label: "Danno runtime",
    payload,
    changes: [{
      id: "target-1",
      name: "Goblin",
      before: {
        hp: { present: true, value: 10 },
        hpMax: { present: true, value: 10 },
      },
      after: {
        hp: { present: true, value: 4 },
        hpMax: { present: true, value: 10 },
      },
    }],
  };
}

test("peek vuoto non crea sessione, mentre il primo evento la crea", async () => {
  const empty = await peekActiveCombatLogData({ sceneEpoch: currentSceneEpoch() });
  assert.equal(empty.session, null);
  assert.equal((await listCombatLogSessions()).length, 0);

  const created = await recordHistoryInCombatLog(hpEntry(), { sceneEpoch: currentSceneEpoch() });
  assert.equal(created.length, 1);
  assert.equal((await listCombatLogSessions()).length, 1);
});

test("History idrata il contesto una sola volta e il retry è append-if-absent", async () => {
  sdkCalls.metadataReads = 0;
  sdkCalls.itemReads = 0;
  const first = await recordHistoryInCombatLog(
    hpEntry({ source: "second" }, "history-runtime-2"),
    { sceneEpoch: currentSceneEpoch() },
  );
  const metadataAfterFirst = sdkCalls.metadataReads;
  const itemsAfterFirst = sdkCalls.itemReads;
  const notificationsAfterFirst = sdkCalls.notifications;
  const second = await recordHistoryInCombatLog(
    hpEntry({ source: "second" }, "history-runtime-2"),
    { sceneEpoch: currentSceneEpoch() },
  );
  const session = (await listCombatLogSessions())[0];
  const events = await getCombatLogEvents(session.id);

  assert.equal(itemsAfterFirst, 1, "il contesto viene idratato una sola volta");
  assert.equal(sdkCalls.itemReads, 2, "il retry idrata il proprio contesto una volta");
  assert.ok(metadataAfterFirst >= 1, "la lettura del puntatore sessione resta distinta dal contesto");
  assert.equal(second.length, 0);
  assert.equal(second.duplicates.length, 1);
  const retriedEvents = events.filter((event) => event.historyEntryId === "history-runtime-2");
  assert.equal(retriedEvents.length, 1);
  assert.equal(retriedEvents[0].sequence, 2);
  assert.equal(sdkCalls.notifications, notificationsAfterFirst);
});

test("duplicate incompatibile conserva il primo payload e le note manuali restano uniche", async () => {
  const conflict = await recordHistoryInCombatLog(hpEntry({ source: "different" }), {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(conflict.length, 0);
  assert.equal(conflict.conflicts.length, 1);

  const session = (await listCombatLogSessions())[0];
  const before = await getCombatLogEvents(session.id);
  assert.deepEqual(before[0].payload, { source: "first" });

  await addCombatLogNote("Nota identica", { sceneEpoch: currentSceneEpoch() });
  await addCombatLogNote("Nota identica", { sceneEpoch: currentSceneEpoch() });
  const after = await getCombatLogEvents(session.id);
  assert.equal(after.filter((event) => event.kind === "note").length, 2);
});

test("History observer eredita la revisione corrente dal session writer", async () => {
  await recordCombatTurn({ order: ["target-1"], current: 0, round: 3 });
  const created = await recordHistoryInCombatLog(
    hpEntry({ source: "order-revision" }, "history-runtime-order-revision"),
    { sceneEpoch: currentSceneEpoch() },
  );
  assert.equal(created.length, 1);
  assert.equal(created[0].turnContext.orderRevision, 1);
});

test("Combat Log disabilitato non esegue scritture", async () => {
  const beforeSessions = (await listCombatLogSessions()).length;
  const beforeNotifications = sdkCalls.notifications;
  unmountCombatLogEventSink();
  assert.deepEqual(await addCombatLogNote("non registrare"), []);
  assert.equal((await listCombatLogSessions()).length, beforeSessions);
  assert.equal(sdkCalls.notifications, beforeNotifications);
});

after(() => {
  if (previousIndexedDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = previousIndexedDB;
  if (previousKeyRange === undefined) delete globalThis.IDBKeyRange;
  else globalThis.IDBKeyRange = previousKeyRange;
});
