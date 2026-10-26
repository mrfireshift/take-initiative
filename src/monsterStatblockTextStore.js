import { ID } from "./constants.js";
import { isMonsterStatblockTextRecord, monsterStatblockTextKey } from "./monsterStatblockTextCore.js";
import { fiveToolsArchiveErrorText } from "./fiveToolsArchiveStore.js";

// The monsters' full stat blocks the GM imported (attacchi dei mostri, fase 4, lotto 4b): this browser's IndexedDB, a
// database of its own as the archive's books, never the scene, the room or a token. One record per reference
// ("goblin|mm"), the last import winning. Without a usable IndexedDB (a private window, site storage blocked) or with
// the disk full, a record is kept for this session only: `persisted: false` says so.
export const MONSTER_STATBLOCK_TEXT_DB_NAME = `${ID}.monster-statblocks`;
const DB_VERSION = 1;
const STORE = "statblocks";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("monster-statblocks-request-failed"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("monster-statblocks-transaction-failed"));
    tx.onabort = () => reject(tx.error || new Error("monster-statblocks-transaction-aborted"));
  });
}

export function createMonsterStatblockTextStore({ indexedDB = globalThis.indexedDB } = {}) {
  const session = new Map();
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB?.open !== "function") return Promise.reject(new Error("monster-statblocks-unavailable"));
    const promise = new Promise((resolve, reject) => {
      const request = indexedDB.open(MONSTER_STATBLOCK_TEXT_DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch {}
          if (dbPromise === promise) dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("monster-statblocks-open-failed"));
      request.onblocked = () => reject(new Error("monster-statblocks-blocked"));
    });
    dbPromise = promise;
    promise.catch(() => { if (dbPromise === promise) dbPromise = null; });
    return promise;
  }

  return {
    // The record of a reference, or null.
    async get(ref) {
      const key = monsterStatblockTextKey(ref);
      if (!key) return null;
      if (session.has(key)) return session.get(key);
      try {
        const db = await open();
        const record = await requestResult(db.transaction([STORE], "readonly").objectStore(STORE).get(key));
        return isMonsterStatblockTextRecord(record) ? record : null;
      } catch {
        return null;
      }
    },
    // Keeps a record (monsterStatblockTextRecord): { persisted, reason }.
    async put(record) {
      if (!isMonsterStatblockTextRecord(record)) throw new Error("Testo dello statblock non valido.");
      try {
        const db = await open();
        const tx = db.transaction([STORE], "readwrite");
        const done = transactionDone(tx);
        tx.objectStore(STORE).put(record);
        await done;
        session.delete(record.key);
        return { persisted: true, reason: "" };
      } catch (error) {
        session.set(record.key, record);
        return { persisted: false, reason: fiveToolsArchiveErrorText(error) };
      }
    },
  };
}
