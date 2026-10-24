import { ID } from "./constants.js";
import {
  HISTORY_LOCAL_STORE_FLAG_KEY,
  buildLocalHistoryHead,
  buildLocalHistoryRecord,
  chooseHistoryWriteMode,
  hasLegacyHistoryEntries,
  isLocalHistoryHead,
  resolveLocalHistory,
} from "./historyLocalStoreCore.js";

// ARCH-009: the IndexedDB side of the History (step 2) and of the recovery journal (step 4), and the storage that
// picks scene or local. Separate database from the Combat Log, so their versions never depend on each other.
// Version 2 adds the journal store.
export const HISTORY_LOCAL_DB_NAME = `${ID}.history-store`;
const HISTORY_LOCAL_DB_VERSION = 2;
const HISTORY_STORES = "historyStores";
const RECOVERY_STORES = "recoveryStores";

// The GM-local flag of ARCH-009 (D4), shared by the History owner and the recovery journal. On by default since step
// 6: "0" turns it off (the History and the journal go back whole to the scene at their next write). Without a usable
// localStorage (not a browser, or site storage blocked, and IndexedDB with it) it stays off: the scene, as before.
export function localStoreFlagEnabled() {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== "function") return false;
    return storage.getItem(HISTORY_LOCAL_STORE_FLAG_KEY) !== "0";
  } catch {
    return false;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("history-local-store-request-failed"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("history-local-store-transaction-failed"));
    tx.onabort = () => reject(tx.error || new Error("history-local-store-transaction-aborted"));
  });
}

function createLocalStoreConnection(indexedDB) {
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB?.open !== "function") {
      return Promise.reject(new Error("history-local-store-unavailable"));
    }
    const promise = new Promise((resolve, reject) => {
      const request = indexedDB.open(HISTORY_LOCAL_DB_NAME, HISTORY_LOCAL_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HISTORY_STORES)) {
          db.createObjectStore(HISTORY_STORES, { keyPath: "storeId" });
        }
        if (!db.objectStoreNames.contains(RECOVERY_STORES)) {
          db.createObjectStore(RECOVERY_STORES, { keyPath: "scopeId" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch {}
          if (dbPromise === promise) dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("history-local-store-open-failed"));
      request.onblocked = () => reject(new Error("history-local-store-blocked"));
    });
    dbPromise = promise;
    promise.catch(() => {
      if (dbPromise === promise) dbPromise = null;
    });
    return promise;
  }

  return Object.freeze({
    async get(storeName, key) {
      const db = await open();
      const tx = db.transaction([storeName], "readonly");
      return requestResult(tx.objectStore(storeName).get(key));
    },
    async put(storeName, record, options = undefined) {
      const db = await open();
      const tx = options ? db.transaction([storeName], "readwrite", options) : db.transaction([storeName], "readwrite");
      const done = transactionDone(tx);
      tx.objectStore(storeName).put(record);
      await done;
    },
  });
}

export function createLocalHistoryDatabase({ indexedDB = globalThis.indexedDB } = {}) {
  const connection = createLocalStoreConnection(indexedDB);
  return Object.freeze({
    get: (storeId) => connection.get(HISTORY_STORES, storeId),
    put: (record) => connection.put(HISTORY_STORES, record),
  });
}

// The journal is what recovers a command after a crash: its writes ask for strict durability.
export function createLocalRecoveryDatabase({ indexedDB = globalThis.indexedDB } = {}) {
  const connection = createLocalStoreConnection(indexedDB);
  return Object.freeze({
    get: (scopeId) => connection.get(RECOVERY_STORES, scopeId),
    put: (record) => connection.put(RECOVERY_STORES, record, { durability: "strict" }),
  });
}

// The History storage used by the owner and the readers, around the scene read and write of historyOwner.js.
// Without a local head and with the flag off both steps stay synchronous, so the owner keeps exactly the timing
// it had before ARCH-009; only a local head or a local write adds the IndexedDB round trip.
// - resolveRead(sceneValue): a local head is read from IndexedDB; any other value is returned as it is. Readers
//   need no flag.
// - prepareWrite(history): the value the owner then writes to the scene key, the History itself or a local head.
//   The owner's broker always reads before it writes, one command at a time: the write reuses what that read saw.
export function createHistoryStorage({
  database,
  readSceneValue,
  isEnabled = () => false,
  currentRoomId = () => "",
  createId = () => globalThis.crypto.randomUUID(),
  now = () => Date.now(),
  onLocalHistoryUnavailable = () => {},
  onLocalStoreFailed = () => {},
}) {
  let ownerView = null;

  async function resolveLocal(sceneValue) {
    const record = await database.get(sceneValue.storeId);
    const resolved = resolveLocalHistory(sceneValue, record, { roomId: currentRoomId() });
    return { sceneValue, history: resolved.history, local: { head: sceneValue, status: resolved.status } };
  }

  function resolveRead(sceneValue, { owner = false } = {}) {
    if (!isLocalHistoryHead(sceneValue)) {
      if (owner) ownerView = { sceneValue, history: sceneValue, local: null };
      return sceneValue;
    }
    return resolveLocal(sceneValue).then((view) => {
      if (owner) ownerView = view;
      return view.history;
    });
  }

  async function writeLocal(history, view) {
    const status = view.local?.status || null;
    if (status === "missing" || status === "behind") {
      onLocalHistoryUnavailable({ status, storeId: view.local.head.storeId });
    }
    // A duplicated scene (ahead) or a lost store continues in a store of its own.
    const keepStore = status === "current";
    const storeId = keepStore ? view.local.head.storeId : createId();
    const rev = keepStore ? (Number(view.local.head.rev) || 0) + 1 : 1;
    const roomId = currentRoomId();
    // IndexedDB first, then the head: a reader between the two sees the record one write ahead and keeps the
    // History its head had seen.
    try {
      await database.put(buildLocalHistoryRecord({ storeId, rev, history, roomId, now: now() }));
    } catch (error) {
      // D3: no usable IndexedDB while the History is still in the scene: keep it there. Once the scene holds a
      // local head, the error stands and the command stays pending, as any failed History write today.
      if (view.local) throw error;
      onLocalStoreFailed(error);
      return history;
    }
    return buildLocalHistoryHead({ storeId, rev, history, roomId });
  }

  function prepareWithView(history, view) {
    if (chooseHistoryWriteMode({ enabled: isEnabled(), sceneValue: view.sceneValue }) === "scene") return history;
    return writeLocal(history, view);
  }

  function prepareWrite(history) {
    const view = ownerView;
    ownerView = null;
    if (view) return prepareWithView(history, view);
    return Promise.resolve(readSceneValue())
      .then((sceneValue) => (isLocalHistoryHead(sceneValue)
        ? resolveLocal(sceneValue)
        : { sceneValue, history: sceneValue, local: null }))
      .then((resolved) => prepareWithView(history, resolved));
  }

  return Object.freeze({ resolveRead, prepareWrite });
}

// ARCH-009 step 3: when the owner's scene becomes ready, a History still whole in the scene moves to IndexedDB
// through one "migrate" command on the owner's own queue, so no append can interleave with it. Only with the flag
// on. A failure leaves the History where it is; the next write or the next start tries again.
export async function migrateLegacyHistory({
  isEnabled,
  readSceneValue,
  handle,
  sceneIdentity,
  isCurrent = () => true,
  createId,
}) {
  if (!isEnabled() || !sceneIdentity) return { status: "skipped", reason: "disabled" };
  const sceneValue = await readSceneValue();
  if (!isCurrent()) return { status: "skipped", reason: "stale" };
  if (!hasLegacyHistoryEntries(sceneValue)) return { status: "skipped", reason: "nothing-to-migrate" };
  const requestId = createId();
  return handle({
    kind: "migrate",
    requestId,
    commandId: requestId,
    correlationId: requestId,
    sceneIdentity,
  });
}
