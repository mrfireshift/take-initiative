import {
  LEGACY_LOCAL_OPTIONS_KEYS,
  LOCAL_OPTIONS_KEY,
} from "./optionsDefaults.js";
import {
  cloneOptionsValue,
  isPlainObject,
  mergeOptionsDocuments,
  normalizeLocalOptions,
} from "./optionsNormalize.js";

function safeGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function parseStoredOptions(storage) {
  const serialized = safeGet(storage, LOCAL_OPTIONS_KEY);
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readLegacyLocalOptions(storage = globalThis.localStorage) {
  const legacy = {};
  const layout = safeGet(storage, LEGACY_LOCAL_OPTIONS_KEYS.trackerLayout);
  if (layout === "classic" || layout === "compact") {
    legacy.tracker = { layout };
  }
  const clocksCompact = safeGet(storage, LEGACY_LOCAL_OPTIONS_KEYS.clocksCompact);
  if (clocksCompact === "1" || clocksCompact === "0") {
    legacy.windows = { clocksCompact: clocksCompact === "1" };
  }
  return legacy;
}

export function createLocalOptionsStore({
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  now = () => Date.now(),
} = {}) {
  let dynamicLegacy = {};
  let snapshot = normalizeLocalOptions(null, { legacy: readLegacyLocalOptions(storage) });
  let serializedSnapshot = JSON.stringify(snapshot);
  let writeQueue = Promise.resolve();
  let started = false;
  let removeStorageListener = null;
  const listeners = new Set();

  function legacyOptions() {
    return mergeOptionsDocuments(readLegacyLocalOptions(storage), dynamicLegacy);
  }

  function notify(reason) {
    const event = { scope: "local", reason };
    for (const listener of listeners) {
      try {
        listener(cloneOptionsValue(snapshot), event);
      } catch (error) {
        console.warn("[options:local] listener:", error?.message || error);
      }
    }
  }

  function accept(value, reason, { force = false } = {}) {
    const next = normalizeLocalOptions(value, { legacy: legacyOptions() });
    const serialized = JSON.stringify(next);
    if (!force && serialized === serializedSnapshot) return cloneOptionsValue(snapshot);
    snapshot = next;
    serializedSnapshot = serialized;
    notify(reason);
    return cloneOptionsValue(snapshot);
  }

  function read({ emit = false, reason = "read" } = {}) {
    return accept(parseStoredOptions(storage), reason, { force: emit });
  }

  function readPersisted() {
    return normalizeLocalOptions(parseStoredOptions(storage), { legacy: legacyOptions() });
  }

  function requireStorage(method) {
    if (!storage || typeof storage[method] !== "function") {
      throw new TypeError(`options local storage requires ${method}`);
    }
  }

  function write(patch) {
    const run = async () => {
      requireStorage("setItem");
      const previous = parseStoredOptions(storage);
      const merged = mergeOptionsDocuments(previous, patch);
      const next = normalizeLocalOptions({
        ...merged,
        updatedAt: Math.max(0, Math.round(Number(now()) || 0)),
      }, { legacy: legacyOptions() });
      storage.setItem(LOCAL_OPTIONS_KEY, JSON.stringify(next));
      return accept(next, "write");
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  function update(updater) {
    if (typeof updater !== "function") throw new TypeError("local options updater must be a function");
    const current = read();
    return write(updater(cloneOptionsValue(current)) ?? current);
  }

  function clear() {
    const run = async () => {
      requireStorage("removeItem");
      storage.removeItem(LOCAL_OPTIONS_KEY);
      return accept(null, "clear", { force: true });
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  function setLegacyFallback(value) {
    dynamicLegacy = isPlainObject(value) ? cloneOptionsValue(value) : {};
    return read({ reason: "legacy-fallback" });
  }

  async function start() {
    if (started) return cloneOptionsValue(snapshot);
    started = true;
    if (typeof eventTarget?.addEventListener === "function") {
      const handler = (event) => {
        if (event?.storageArea && storage && event.storageArea !== storage) return;
        if (event?.key !== null
          && event?.key !== LOCAL_OPTIONS_KEY
          && !Object.values(LEGACY_LOCAL_OPTIONS_KEYS).includes(event?.key)) return;
        read({ reason: "storage-change" });
      };
      eventTarget.addEventListener("storage", handler);
      removeStorageListener = () => eventTarget.removeEventListener?.("storage", handler);
    }
    return read();
  }

  function stop() {
    removeStorageListener?.();
    removeStorageListener = null;
    started = false;
  }

  return {
    key: LOCAL_OPTIONS_KEY,
    start,
    stop,
    read,
    readPersisted,
    write,
    update,
    clear,
    setLegacyFallback,
    getSnapshot: () => cloneOptionsValue(snapshot),
    subscribe(listener, { emitCurrent = false } = {}) {
      if (typeof listener !== "function") throw new TypeError("local options listener must be a function");
      listeners.add(listener);
      if (emitCurrent) listener(cloneOptionsValue(snapshot), { scope: "local", reason: "subscribe" });
      return () => listeners.delete(listener);
    },
  };
}
