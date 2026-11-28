// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A0: the working copy in the GM's browser, in IndexedDB.
// A database of its own, as the History's (historyLocalStore.js), so their versions never depend on each other.
// Every write is one read-write transaction that reads the record, changes it and puts it back: IndexedDB runs such
// transactions on a store one after the other, also across the plugin's pages (they share the database), so two pages
// writing at once do not cancel each other (P3 of docs/STUDIO_ARCHIVIO_ATTORI.md). A0: nothing uses it yet.
import { ID } from "./constants.js";
import {
  actorArchiveKey,
  emptyActorArchiveRecord,
  normalizeActorArchiveRecord,
  pendingActorArchiveSections,
  withLocalActorArchiveSection,
} from "./actorArchiveCore.js";

export const ACTOR_ARCHIVE_DB_NAME = `${ID}.actor-archive`;
// Version 2 (lot A3) adds the rooms store: per room, the point up to which the server's changes were read.
const ACTOR_ARCHIVE_DB_VERSION = 2;
const RECORDS = "records";
const ROOM_INDEX = "roomId";
const ROOMS = "rooms";

// Decision E9: off until the archive is proved in a room; "1" in this browser turns it on. Without a usable
// localStorage (site storage blocked, and IndexedDB with it) it stays off.
export const ACTOR_ARCHIVE_FLAG_KEY = `${ID}/actor-archive`;
export function actorArchiveEnabled() {
  try {
    const storage = globalThis.localStorage;
    return !!storage && typeof storage.getItem === "function" && storage.getItem(ACTOR_ARCHIVE_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("actor-archive-request-failed"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("actor-archive-transaction-failed"));
    tx.onabort = () => reject(tx.error || new Error("actor-archive-transaction-aborted"));
  });
}

export function createActorArchiveStore({ indexedDB = globalThis.indexedDB } = {}) {
  let dbPromise = null;
  // The writes of this page, one after the other; across pages the transactions do it.
  let writeQueue = Promise.resolve();

  function open() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB?.open !== "function") return Promise.reject(new Error("actor-archive-unavailable"));
    const promise = new Promise((resolve, reject) => {
      const request = indexedDB.open(ACTOR_ARCHIVE_DB_NAME, ACTOR_ARCHIVE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORDS)) {
          db.createObjectStore(RECORDS, { keyPath: "key" }).createIndex(ROOM_INDEX, "roomId");
        }
        if (!db.objectStoreNames.contains(ROOMS)) db.createObjectStore(ROOMS, { keyPath: "roomId" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch {}
          if (dbPromise === promise) dbPromise = null;
        };
        // Closed by the browser (site data cleared, storage pressure): the next call opens a new connection.
        db.onclose = () => {
          if (dbPromise === promise) dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("actor-archive-open-failed"));
      request.onblocked = () => reject(new Error("actor-archive-blocked"));
    });
    dbPromise = promise;
    promise.catch(() => {
      if (dbPromise === promise) dbPromise = null;
    });
    return promise;
  }

  // A connection closed under us throws InvalidStateError on transaction(): forgotten, and asked once more.
  async function transaction(mode, storeName = RECORDS) {
    for (let attempt = 0; ; attempt += 1) {
      const pending = open();
      const db = await pending;
      try {
        return db.transaction([storeName], mode);
      } catch (error) {
        if (attempt > 0 || error?.name !== "InvalidStateError") throw error;
        if (dbPromise === pending) dbPromise = null;
      }
    }
  }

  async function get(roomId, kind, id) {
    const key = actorArchiveKey(roomId, kind, id);
    if (!key) return null;
    const tx = await transaction("readonly");
    return normalizeActorArchiveRecord(await requestResult(tx.objectStore(RECORDS).get(key)));
  }

  // The records of one room, actors and cards by key.
  async function list(roomId) {
    const room = String(roomId ?? "").trim();
    if (!room) return [];
    const tx = await transaction("readonly");
    const records = await requestResult(tx.objectStore(RECORDS).index(ROOM_INDEX).getAll(room));
    return (records || []).map(normalizeActorArchiveRecord).filter(Boolean);
  }

  // Reads the record, gives it to `updater` (an empty one when it is new) and stores what comes back, in one
  // transaction. `updater` is synchronous (the transaction ends at the first await) and returns the next record, the
  // same one to write nothing, or null to delete it. Returns the record the store holds afterwards, or null when it
  // holds none.
  function update(roomId, kind, id, updater) {
    const key = actorArchiveKey(roomId, kind, id);
    if (!key) return Promise.reject(new Error("actor-archive-invalid-key"));
    const run = async () => {
      const tx = await transaction("readwrite");
      const done = transactionDone(tx);
      const store = tx.objectStore(RECORDS);
      let result = null;
      let failure = null;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          const stored = normalizeActorArchiveRecord(request.result);
          const current = stored || emptyActorArchiveRecord({ roomId, kind, id });
          const next = updater(current);
          if (next === current) {
            result = stored;
            return;
          }
          if (next === null) {
            if (stored) store.delete(key);
            return;
          }
          const normalized = normalizeActorArchiveRecord(next);
          if (!normalized || normalized.key !== key) throw new Error("actor-archive-invalid-record");
          result = normalized;
          store.put(normalized);
        } catch (error) {
          // An updater that throws writes nothing: the transaction is undone and its error is the caller's.
          failure = error;
          try { tx.abort(); } catch {}
        }
      };
      try {
        await done;
      } catch (error) {
        throw failure || error;
      }
      return result;
    };
    const queued = writeQueue.then(run, run);
    writeQueue = queued.catch(() => {});
    return queued;
  }

  // A write of this copy to one section; the same value again writes nothing. Returns { record, changed }.
  async function writeSection(roomId, kind, id, section, value, { name = undefined, now = Date.now } = {}) {
    let changed = false;
    const record = await update(roomId, kind, id, (current) => {
      const written = withLocalActorArchiveSection(current, section, value, { name, now });
      changed = written.changed;
      return written.changed ? written.record : current;
    });
    return { record, changed };
  }

  function remove(roomId, kind, id) {
    return update(roomId, kind, id, () => null);
  }

  // The outbox of a room: [{ record, pending: [{ section, baseRev, at, value }] }] for the records with unsent sections.
  async function listPending(roomId) {
    return (await list(roomId))
      .map((record) => ({ record, pending: pendingActorArchiveSections(record) }))
      .filter((entry) => entry.pending.length > 0);
  }

  // Lot A3: the room's counter on the server up to which its changes were read (0: never).
  async function getCursor(roomId) {
    const room = String(roomId ?? "").trim();
    if (!room) return 0;
    const tx = await transaction("readonly", ROOMS);
    const cursor = Math.floor(Number((await requestResult(tx.objectStore(ROOMS).get(room)))?.cursor));
    return Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
  }

  async function setCursor(roomId, cursor) {
    const room = String(roomId ?? "").trim();
    if (!room) return;
    const tx = await transaction("readwrite", ROOMS);
    const done = transactionDone(tx);
    tx.objectStore(ROOMS).put({ roomId: room, cursor: Math.max(0, Math.floor(Number(cursor) || 0)) });
    await done;
  }

  return Object.freeze({ get, list, update, writeSection, remove, listPending, getCursor, setCursor });
}

// Lot A3: a page that wrote to the archive tells the GM's background, which sends the outbox to the server. A native
// BroadcastChannel (same origin, no Owlbear broadcast, no network); without one the background finds the outbox at its
// next round anyway.
export const ACTOR_ARCHIVE_CHANNEL = `${ID}/actor-archive`;
let actorArchiveChannel = null;

export function openActorArchiveChannel() {
  if (typeof globalThis.BroadcastChannel !== "function") return null;
  try {
    const channel = new globalThis.BroadcastChannel(ACTOR_ARCHIVE_CHANNEL);
    // Node (the tests): an open channel must not keep the process alive.
    channel.unref?.();
    return channel;
  } catch {
    return null;
  }
}

export function notifyActorArchiveDirty(type = "dirty") {
  try {
    actorArchiveChannel ||= openActorArchiveChannel();
    actorArchiveChannel?.postMessage({ type });
  } catch {}
}
