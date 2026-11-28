// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A3: where the archive server is and its key, kept in this
// browser's localStorage (decision D1 of the study: the key never goes into the Room's metadata nor into the
// repository). Each of the GM's computers has its own copy. Also the last synchronization's outcome, which the
// background writes and the Options panel shows.
import { ID } from "./constants.js";

export const ACTOR_ARCHIVE_SERVER_KEY = `${ID}/actor-archive/server`;
export const ACTOR_ARCHIVE_STATUS_KEY = `${ID}/actor-archive/status`;
export const ACTOR_ARCHIVE_MIN_KEY_LENGTH = 32;

function storage() {
  try {
    const candidate = globalThis.localStorage;
    return candidate && typeof candidate.getItem === "function" ? candidate : null;
  } catch {
    return null;
  }
}

// The address as the plugin calls it: https only (plain http on this computer alone, for the development server),
// without credentials or a fragment. "" for anything else.
export function normalizeActorArchiveUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  let url = null;
  try { url = new URL(text); } catch { return ""; }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return "";
  if (url.username || url.password) return "";
  url.hash = "";
  return url.toString();
}

// { url, key } when both are usable, else null.
export function normalizeActorArchiveServer(value) {
  const url = normalizeActorArchiveUrl(value?.url);
  const key = String(value?.key ?? "").trim();
  return url && key.length >= ACTOR_ARCHIVE_MIN_KEY_LENGTH ? { url, key } : null;
}

export function readActorArchiveServer() {
  try {
    return normalizeActorArchiveServer(JSON.parse(storage()?.getItem(ACTOR_ARCHIVE_SERVER_KEY) || "null"));
  } catch {
    return null;
  }
}

// Stores the server, or forgets it with null. false when it is not usable or the browser cannot store it.
export function writeActorArchiveServer(value) {
  const store = storage();
  if (!store) return false;
  try {
    if (value === null) {
      store.removeItem(ACTOR_ARCHIVE_SERVER_KEY);
      return true;
    }
    const server = normalizeActorArchiveServer(value);
    if (!server) return false;
    store.setItem(ACTOR_ARCHIVE_SERVER_KEY, JSON.stringify(server));
    return true;
  } catch {
    return false;
  }
}

// The last synchronization: { at, ok, error, pending, pulled, pushed, roomId }, or null. Never the key.
export function readActorArchiveStatus() {
  try {
    const value = JSON.parse(storage()?.getItem(ACTOR_ARCHIVE_STATUS_KEY) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeActorArchiveStatus(status) {
  try {
    storage()?.setItem(ACTOR_ARCHIVE_STATUS_KEY, JSON.stringify(status));
  } catch {}
}
