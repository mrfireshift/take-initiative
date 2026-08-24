import { ID } from "./constants.js";
import {
  createPresetTombstone,
  normalizeCustomAuraPreset,
  normalizeCustomAuraPresets,
} from "./customAuraPresetCore.js";

export const CUSTOM_AURA_PRESETS_STORAGE_KEY = `${ID}/customAuraPresets`;
export const CUSTOM_AURA_PRESETS_BROADCAST_CHANNEL = `${ID}/customAuraPresetsBroadcast`;

function safeGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function parseStoredPresets(storage) {
  const serialized = safeGet(storage, CUSTOM_AURA_PRESETS_STORAGE_KEY);
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createCustomAuraPresetStore({
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  broadcast = null,
} = {}) {
  let cachedPresets = normalizeCustomAuraPresets(parseStoredPresets(storage));
  let serializedCache = JSON.stringify(cachedPresets);
  const listeners = new Set();
  let removeStorageListener = null;

  function notify(reason = "change", changedPresetId = null) {
    const catalog = [...cachedPresets];
    for (const listener of listeners) {
      try {
        listener(catalog, { reason, changedPresetId });
      } catch (error) {
        console.warn("[custom-aura-presets] listener error:", error?.message || error);
      }
    }
  }

  function commit(presets, reason = "write", changedPresetId = null) {
    const normalized = normalizeCustomAuraPresets(presets);
    const serialized = JSON.stringify(normalized);
    if (serialized === serializedCache) return [...cachedPresets];
    cachedPresets = normalized;
    serializedCache = serialized;
    safeSet(storage, CUSTOM_AURA_PRESETS_STORAGE_KEY, serialized);
    notify(reason, changedPresetId);
    if (broadcast?.postMessage) {
      try {
        broadcast.postMessage({ type: "presets-changed", reason, changedPresetId });
      } catch {}
    }
    return [...cachedPresets];
  }

  function readPresets({ refresh = false } = {}) {
    if (refresh) {
      const fromStorage = normalizeCustomAuraPresets(parseStoredPresets(storage));
      const serialized = JSON.stringify(fromStorage);
      if (serialized !== serializedCache) {
        cachedPresets = fromStorage;
        serializedCache = serialized;
        notify("refresh");
      }
    }
    return [...cachedPresets];
  }

  function getPreset(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    return readPresets().find((p) => p.id === normalizedId) || null;
  }

  function getActivePresets() {
    return readPresets().filter((p) => !p.deleted);
  }

  function savePreset(preset) {
    const normalized = normalizeCustomAuraPreset(preset);
    if (!normalized) throw new Error("Invalid preset payload");
    const current = readPresets();
    const index = current.findIndex((p) => p.id === normalized.id);
    let next;
    if (index >= 0) {
      next = [...current];
      next[index] = normalized;
    } else {
      next = [...current, normalized];
    }
    commit(next, "save", normalized.id);
    return normalized;
  }

  function deletePreset(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return false;
    const current = readPresets();
    const existing = current.find((p) => p.id === normalizedId);
    if (!existing || existing.deleted) return false;
    const tombstone = createPresetTombstone(existing);
    const next = current.map((p) => p.id === normalizedId ? tombstone : p);
    commit(next, "delete", normalizedId);
    return true;
  }

  function importPresets(presetsJson) {
    try {
      const parsed = typeof presetsJson === "string" ? JSON.parse(presetsJson) : presetsJson;
      if (!Array.isArray(parsed)) throw new Error("Import payload must be an array");
      const incoming = normalizeCustomAuraPresets(parsed);
      const byId = new Map(readPresets().map((p) => [p.id, p]));
      for (const p of incoming) {
        const existing = byId.get(p.id);
        if (!existing || (p.revision > (existing.revision || 0))) {
          byId.set(p.id, p);
        }
      }
      commit([...byId.values()], "import");
      return true;
    } catch (error) {
      console.error("[custom-aura-presets] import failed:", error);
      return false;
    }
  }

  function exportPresets() {
    return JSON.stringify(getActivePresets(), null, 2);
  }

  function clearAll() {
    commit([], "clear");
  }

  function subscribe(listener, { emitCurrent = false } = {}) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    if (emitCurrent) {
      try {
        listener([...cachedPresets], { reason: "initial" });
      } catch {}
    }
    return () => listeners.delete(listener);
  }

  // Mount storage event listener
  if (typeof eventTarget?.addEventListener === "function") {
    const handler = (event) => {
      if (event?.key === CUSTOM_AURA_PRESETS_STORAGE_KEY) {
        readPresets({ refresh: true });
      }
    };
    eventTarget.addEventListener("storage", handler);
    removeStorageListener = () => eventTarget.removeEventListener?.("storage", handler);
  }

  return {
    readPresets,
    getActivePresets,
    getPreset,
    savePreset,
    deletePreset,
    importPresets,
    exportPresets,
    clearAll,
    subscribe,
    dispose() {
      removeStorageListener?.();
      removeStorageListener = null;
      listeners.clear();
    },
  };
}

let defaultStoreInstance = null;

export function getCustomAuraPresetStore() {
  if (!defaultStoreInstance) {
    defaultStoreInstance = createCustomAuraPresetStore();
  }
  return defaultStoreInstance;
}
