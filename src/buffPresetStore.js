// Buffs saved by the GM from the Conditions popup. Like the custom aura presets they live in this
// browser's storage: personal to the GM, available in every room and scene.
import { ID } from "./constants.js";
import { createBuffPresetId, normalizeBuffDefinition, normalizeSavedBuffs } from "./buffPresetCore.js";

export const BUFF_PRESETS_STORAGE_KEY = `${ID}/customBuffPresets`;

function read(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(BUFF_PRESETS_STORAGE_KEY) || "[]");
    return normalizeSavedBuffs(parsed);
  } catch {
    return [];
  }
}

function write(storage, buffs) {
  try {
    storage?.setItem?.(BUFF_PRESETS_STORAGE_KEY, JSON.stringify(normalizeSavedBuffs(buffs)));
    return true;
  } catch {
    return false;
  }
}

export function createBuffPresetStore({ storage = globalThis.localStorage } = {}) {
  return {
    list: () => read(storage),
    get: (id) => read(storage).find((entry) => entry.id === String(id || "").trim()) || null,
    // Saves a new buff, or replaces the one with this id. Returns the saved entry, or null.
    save(definition, id = "") {
      const clean = normalizeBuffDefinition(definition);
      if (!clean.name) return null;
      const entry = { id: String(id || "").trim() || createBuffPresetId(), updatedAt: Date.now(), definition: clean };
      const next = [...read(storage).filter((saved) => saved.id !== entry.id), entry];
      return write(storage, next) ? entry : null;
    },
    remove(id) {
      const wanted = String(id || "").trim();
      const current = read(storage);
      if (!current.some((entry) => entry.id === wanted)) return false;
      return write(storage, current.filter((entry) => entry.id !== wanted));
    },
  };
}
