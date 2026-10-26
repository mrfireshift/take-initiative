import { ID } from "./constants.js";
import { FIVE_TOOLS_ARCHIVE_RECORD_VERSION } from "./fiveToolsArchiveCore.js";

// The books of 5eTools' archive the GM downloaded (attacchi dei mostri, fase 3, lotto 2): kept in this browser's
// IndexedDB, never in the scene, the room or on a token. Two stores: what the panel lists (bookInfo: date, size,
// monsters) and the file itself (bookData), so the list never reads the files. A database of its own, so its version
// never depends on the History's.
// Without a usable IndexedDB (a private window, site storage blocked) or with the disk full, a book is kept for this
// session only: `persisted: false` says so, and the panel tells the GM.
export const FIVE_TOOLS_ARCHIVE_DB_NAME = `${ID}.fivetools-archive`;
const DB_VERSION = 1;
const INFO = "bookInfo";
const DATA = "bookData";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("fivetools-archive-request-failed"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("fivetools-archive-transaction-failed"));
    tx.onabort = () => reject(tx.error || new Error("fivetools-archive-transaction-aborted"));
  });
}

const infoOf = ({ data: _data, ...info }) => info;
const codeKey = (code) => String(code || "").toLowerCase();

function validRecord(record) {
  return record && typeof record === "object" && record.version === FIVE_TOOLS_ARCHIVE_RECORD_VERSION
    && typeof record.code === "string" && record.code && Array.isArray(record.data?.monster);
}

export function fiveToolsArchiveErrorText(error) {
  const name = String(error?.name || "");
  if (name === "QuotaExceededError" || /quota/i.test(String(error?.message || ""))) return "spazio del browser esaurito";
  if (/unavailable|blocked|SecurityError|InvalidStateError/i.test(`${name} ${error?.message || ""}`)) return "memoria del browser non disponibile";
  return String(error?.message || error || "errore sconosciuto");
}

export function createFiveToolsArchiveStore({ indexedDB = globalThis.indexedDB } = {}) {
  // The books kept for this session only, by code: those IndexedDB could not take.
  const session = new Map();
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB?.open !== "function") return Promise.reject(new Error("fivetools-archive-unavailable"));
    const promise = new Promise((resolve, reject) => {
      const request = indexedDB.open(FIVE_TOOLS_ARCHIVE_DB_NAME, DB_VERSION);
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
      request.onerror = () => reject(request.error || new Error("fivetools-archive-open-failed"));
      request.onblocked = () => reject(new Error("fivetools-archive-blocked"));
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
    // What the panel lists: one entry per book (date, size, monsters), the session's ones too, by title code.
    async list() {
      const byKey = new Map((await storedInfo()).map((info) => [codeKey(info.code), info]));
      for (const record of session.values()) byKey.set(codeKey(record.code), { ...infoOf(record), persisted: false });
      return [...byKey.values()].sort((left, right) => left.code.localeCompare(right.code));
    },
    // A book with its file, or null.
    async get(code) {
      const key = codeKey(code);
      if (session.has(key)) return { ...session.get(key), persisted: false };
      try {
        const db = await open();
        const tx = db.transaction([INFO, DATA], "readonly");
        const [info, data] = await Promise.all([requestResult(tx.objectStore(INFO).get(key)), requestResult(tx.objectStore(DATA).get(key))]);
        if (!info || !data) return null;
        const { key: _key, ...rest } = info;
        return { ...rest, data: data.data, persisted: true };
      } catch {
        return null;
      }
    },
    // Saves a book (a record of fiveToolsArchiveRecord): { persisted, reason }. When IndexedDB refuses it the book stays
    // for the session and reason says why ("spazio del browser esaurito").
    async put(record) {
      if (!validRecord(record)) throw new Error("Libro dell'archivio non valido.");
      const key = codeKey(record.code);
      try {
        const db = await open();
        const tx = db.transaction([INFO, DATA], "readwrite");
        const done = transactionDone(tx);
        tx.objectStore(INFO).put({ key, ...infoOf(record) });
        tx.objectStore(DATA).put({ key, data: record.data });
        await done;
        session.delete(key);
        return { persisted: true, reason: "" };
      } catch (error) {
        session.set(key, record);
        return { persisted: false, reason: fiveToolsArchiveErrorText(error) };
      }
    },
    async remove(code) {
      const key = codeKey(code);
      session.delete(key);
      try {
        const db = await open();
        const tx = db.transaction([INFO, DATA], "readwrite");
        const done = transactionDone(tx);
        tx.objectStore(INFO).delete(key);
        tx.objectStore(DATA).delete(key);
        await done;
      } catch {}
    },
    // Every kept book's file, for the picker and for the bases of the derived monsters.
    async allData() {
      const books = await this.list();
      const records = await Promise.all(books.map((book) => this.get(book.code)));
      return records.filter(Boolean).map((record) => record.data);
    },
  });
}
