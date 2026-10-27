import { ID } from "./constants.js";
import { fiveToolsArchiveErrorText } from "./fiveToolsArchiveStore.js";
import { privatePackSummary, validatePrivatePack } from "./privatePackCore.js";

// The private packs the GM imported (compendio delle regole, fase 2, lotto P1): kept in this browser's IndexedDB,
// never in the scene, the room or on a token, like the books of 5eTools' archive. Two stores: what the panel lists
// (packInfo: title, badge, counts, size, date) and the pack itself (packData), so the list never reads the texts. A
// database of its own, so its version never depends on the History's or the archive's.
// Without a usable IndexedDB (a private window, site storage blocked) or with the disk full, a pack is kept for this
// session only: `persisted: false` says so, and the panel tells the GM.
export const PRIVATE_PACKS_DB_NAME = `${ID}.private-packs`;
const DB_VERSION = 1;
const INFO = "packInfo";
const DATA = "packData";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("private-packs-request-failed"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("private-packs-transaction-failed"));
    tx.onabort = () => reject(tx.error || new Error("private-packs-transaction-aborted"));
  });
}

export function createPrivatePackStore({ indexedDB = globalThis.indexedDB, now = () => Date.now() } = {}) {
  // The packs kept for this session only, by id: those IndexedDB could not take. { info, pack }.
  const session = new Map();
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB?.open !== "function") return Promise.reject(new Error("private-packs-unavailable"));
    const promise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PRIVATE_PACKS_DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(INFO)) db.createObjectStore(INFO, { keyPath: "key" });
        if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch {}
          if (dbPromise === promise) dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("private-packs-open-failed"));
      request.onblocked = () => reject(new Error("private-packs-blocked"));
    });
    dbPromise = promise;
    promise.catch(() => { if (dbPromise === promise) dbPromise = null; });
    return promise;
  }

  async function storedInfo() {
    try {
      const db = await open();
      const tx = db.transaction([INFO], "readonly");
      return (await requestResult(tx.objectStore(INFO).getAll())).map(({ key: _key, ...info }) => ({ ...info, persisted: true }));
    } catch {
      return [];
    }
  }

  return Object.freeze({
    // What the panel lists: one summary per pack (privatePackSummary plus importedAt and persisted), by title.
    async list() {
      const byId = new Map((await storedInfo()).map((info) => [info.id, info]));
      for (const { info } of session.values()) byId.set(info.id, { ...info, persisted: false });
      return [...byId.values()].sort((left, right) => left.title.localeCompare(right.title, "it"));
    },
    // A pack, or null.
    async get(id) {
      if (session.has(id)) return session.get(id).pack;
      try {
        const db = await open();
        const tx = db.transaction([DATA], "readonly");
        return (await requestResult(tx.objectStore(DATA).get(id)))?.pack || null;
      } catch {
        return null;
      }
    },
    // Saves a pack, replacing the one with its id: { persisted, reason, summary }. bytes is the size of the file the
    // GM picked. When IndexedDB refuses it the pack stays for the session and reason says why.
    async put(pack, { bytes = 0 } = {}) {
      const { error } = validatePrivatePack(pack);
      if (error) throw new Error(error);
      const info = { ...privatePackSummary(pack, bytes), importedAt: now() };
      try {
        const db = await open();
        const tx = db.transaction([INFO, DATA], "readwrite");
        const done = transactionDone(tx);
        tx.objectStore(INFO).put({ key: pack.id, ...info });
        tx.objectStore(DATA).put({ key: pack.id, pack });
        await done;
        session.delete(pack.id);
        return { persisted: true, reason: "", summary: info };
      } catch (error) {
        session.set(pack.id, { info, pack });
        return { persisted: false, reason: fiveToolsArchiveErrorText(error), summary: info };
      }
    },
    async remove(id) {
      session.delete(id);
      try {
        const db = await open();
        const tx = db.transaction([INFO, DATA], "readwrite");
        const done = transactionDone(tx);
        tx.objectStore(INFO).delete(id);
        tx.objectStore(DATA).delete(id);
        await done;
      } catch {}
    },
    // Every kept pack, in the order of list().
    async all() {
      const packs = await Promise.all((await this.list()).map((info) => this.get(info.id)));
      return packs.filter(Boolean);
    },
  });
}
