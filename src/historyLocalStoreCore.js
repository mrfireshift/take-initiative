import { ID } from "./constants.js";

// ARCH-009: the History of a scene in the GM browser's IndexedDB, with a small head left in the scene key.
// Pure rules only: no SDK, no IndexedDB.

export const HISTORY_LOCAL_STORE_FLAG_KEY = `${ID}/history-local-store`;
export const HISTORY_HEAD_VERSION = 2;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function entriesOf(history) {
  return Array.isArray(history?.entries) ? history.entries.filter(Boolean) : [];
}

export function isLocalHistoryHead(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && value.version === HISTORY_HEAD_VERSION
    && value.storage === "local"
    && typeof value.storeId === "string"
    && value.storeId.length > 0;
}

// What the scene key holds in local mode: a few hundred bytes. `entries: []` makes an older plugin version read
// an empty History instead of failing; `rev` counts every write, `seq` is the History's own append sequence.
export function buildLocalHistoryHead({ storeId, rev, history, roomId = "" }) {
  const entries = entriesOf(history);
  return {
    version: HISTORY_HEAD_VERSION,
    storage: "local",
    ...(roomId ? { roomId } : {}),
    storeId,
    rev,
    seq: Number(history?.seq) || 0,
    count: entries.length,
    lastEntryId: String(entries[entries.length - 1]?.id || ""),
    entries: [],
  };
}

export function buildLocalHistoryRecord({ storeId, rev, history, roomId = "", now = Date.now() }) {
  return {
    storeId,
    rev,
    roomId,
    history: clone(history),
    touchedAt: now,
  };
}

function emptyHistory(head) {
  return {
    version: 1,
    ...(head?.roomId ? { roomId: head.roomId } : {}),
    seq: Number(head?.seq) || 0,
    entries: [],
  };
}

// The History of the scene whose head is `head`.
// - current: record and head agree.
// - ahead: the record was written past this head, by a duplicated scene sharing the store or by a write whose head
//   did not land. This scene keeps only the entries its head had seen (appends carry storeSeq; older entries
//   without one are common to both).
// - behind / missing: written by another browser, or local data cleared. Not this browser's History.
export function resolveLocalHistory(head, record, { roomId = "" } = {}) {
  if (!record || record.storeId !== head.storeId || (roomId && record.roomId && record.roomId !== roomId)) {
    return { status: "missing", history: emptyHistory(head) };
  }
  const recordRev = Number(record.rev) || 0;
  const headRev = Number(head.rev) || 0;
  if (recordRev === headRev) return { status: "current", history: clone(record.history) };
  if (recordRev < headRev) return { status: "behind", history: emptyHistory(head) };
  const seq = Number(head.seq) || 0;
  const entries = entriesOf(record.history).filter((entry) => {
    const storeSeq = Number(entry?.storeSeq);
    return !Number.isFinite(storeSeq) || storeSeq <= seq;
  });
  return { status: "ahead", history: { ...clone(record.history), seq, entries: clone(entries) } };
}

// A History still stored whole in the scene key (version 1) with entries to move.
export function hasLegacyHistoryEntries(sceneValue) {
  return !isLocalHistoryHead(sceneValue) && entriesOf(sceneValue).length > 0;
}

// Where the owner writes the next History. Flag off: the scene, whole, as before (also moving a local History
// back). Flag on: local; a History still whole in the scene moves with that write (step 3 migration).
export function chooseHistoryWriteMode({ enabled }) {
  return enabled ? "local" : "scene";
}
