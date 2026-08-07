import {
  clearRoomMetadataKey,
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "../metadataKeyScoped.js";
import { ROOM_OPTIONS_KEY } from "./optionsDefaults.js";
import {
  cloneOptionsValue,
  compactRoomOptionsForStorage,
  mergeOptionsDocuments,
  normalizeRoomOptions,
} from "./optionsNormalize.js";

// Il limite documentato da Owlbear è 16 kB: usiamo l'interpretazione
// conservativa decimale per non sovrastimare lo spazio realmente disponibile.
const ROOM_METADATA_LIMIT_BYTES = 16_000;

function jsonBytes(value) {
  const serialized = JSON.stringify(value ?? null);
  return new TextEncoder().encode(serialized).byteLength;
}

export function createRoomOptionsStore({
  api = null,
  now = () => Date.now(),
  runtime = "optionsService",
} = {}) {
  let snapshot = normalizeRoomOptions(null);
  let serializedSnapshot = JSON.stringify(snapshot);
  let writeQueue = Promise.resolve();
  let revision = 0;
  let started = false;
  let unsubscribeMetadata = null;
  const listeners = new Set();

  function notify(reason) {
    const event = { scope: "room", reason };
    for (const listener of listeners) {
      try {
        listener(cloneOptionsValue(snapshot), event);
      } catch (error) {
        console.warn("[options:room] listener:", error?.message || error);
      }
    }
  }

  function accept(value, reason, { force = false } = {}) {
    const next = normalizeRoomOptions(value);
    const serialized = JSON.stringify(next);
    if (!force && serialized === serializedSnapshot) return cloneOptionsValue(snapshot);
    snapshot = next;
    serializedSnapshot = serialized;
    notify(reason);
    return cloneOptionsValue(snapshot);
  }

  function acceptMetadata(metadata, reason, options) {
    return accept(metadata?.[ROOM_OPTIONS_KEY], reason, options);
  }

  async function read({ emit = false, reason = "read" } = {}) {
    if (!api || typeof api.getMetadata !== "function") {
      return accept(null, reason, { force: emit });
    }
    const readRevision = revision;
    const metadata = await api.getMetadata().catch(() => ({}));
    if (readRevision !== revision) return cloneOptionsValue(snapshot);
    return acceptMetadata(metadata, reason, { force: emit });
  }

  async function readPersisted() {
    if (!api || typeof api.getMetadata !== "function") {
      return normalizeRoomOptions(null);
    }
    const metadata = await api.getMetadata();
    return normalizeRoomOptions(metadata?.[ROOM_OPTIONS_KEY]);
  }

  async function inspectStorage() {
    if (!api || typeof api.getMetadata !== "function") {
      return { totalBytes: 0, limitBytes: ROOM_METADATA_LIMIT_BYTES, ownedEntries: [] };
    }
    const metadata = await api.getMetadata();
    const ownedPrefix = ROOM_OPTIONS_KEY.slice(0, ROOM_OPTIONS_KEY.lastIndexOf("/") + 1);
    const ownedEntries = Object.entries(metadata || {})
      .filter(([key]) => key.startsWith(ownedPrefix))
      .map(([key, value]) => ({
        key: key.slice(ownedPrefix.length),
        bytes: jsonBytes({ [key]: value }),
      }))
      .sort((left, right) => right.bytes - left.bytes);
    const totalBytes = jsonBytes(metadata || {});
    return {
      totalBytes,
      limitBytes: ROOM_METADATA_LIMIT_BYTES,
      availableBytes: Math.max(0, ROOM_METADATA_LIMIT_BYTES - totalBytes),
      optionKeyPresent: Object.hasOwn(metadata || {}, ROOM_OPTIONS_KEY),
      ownedEntries,
    };
  }

  function enqueueMutation(mutator, reason) {
    const run = async () => {
      if (!api || typeof api.getMetadata !== "function") {
        throw new TypeError("room options store requires getMetadata");
      }
      const metadata = await api.getMetadata().catch(() => ({}));
      const currentRaw = metadata?.[ROOM_OPTIONS_KEY];
      const current = normalizeRoomOptions(currentRaw);
      const candidate = mutator(cloneOptionsValue(current));
      const merged = mergeOptionsDocuments(currentRaw, candidate ?? current);
      const next = normalizeRoomOptions({
        ...merged,
        updatedAt: Math.max(0, Math.round(Number(now()) || 0)),
      });
      const persisted = compactRoomOptionsForStorage(next);
      await writeRoomMetadataKey(
        api,
        METADATA_OWNERSHIP.ROOM_OPTIONS,
        persisted,
        { runtime },
      );
      revision += 1;
      return accept(next, reason);
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  function write(patch) {
    return enqueueMutation((current) => mergeOptionsDocuments(current, patch), "write");
  }

  function update(updater) {
    if (typeof updater !== "function") throw new TypeError("room options updater must be a function");
    return enqueueMutation(updater, "update");
  }

  function clear() {
    const run = async () => {
      await clearRoomMetadataKey(
        api,
        METADATA_OWNERSHIP.ROOM_OPTIONS,
        { runtime },
      );
      revision += 1;
      return accept(null, "clear", { force: true });
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  async function start() {
    if (started) return cloneOptionsValue(snapshot);
    started = true;
    if (typeof api?.onMetadataChange === "function") {
      unsubscribeMetadata = api.onMetadataChange((metadata) => {
        revision += 1;
        acceptMetadata(metadata, "metadata-change");
      });
    }
    return read();
  }

  function stop() {
    unsubscribeMetadata?.();
    unsubscribeMetadata = null;
    started = false;
  }

  return {
    key: ROOM_OPTIONS_KEY,
    start,
    stop,
    read,
    readPersisted,
    inspectStorage,
    write,
    update,
    clear,
    getSnapshot: () => cloneOptionsValue(snapshot),
    subscribe(listener, { emitCurrent = false } = {}) {
      if (typeof listener !== "function") throw new TypeError("room options listener must be a function");
      listeners.add(listener);
      if (emitCurrent) listener(cloneOptionsValue(snapshot), { scope: "room", reason: "subscribe" });
      return () => listeners.delete(listener);
    },
  };
}
