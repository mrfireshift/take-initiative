// Preload (node --import) that runs test files as in the GM's browser with ARCH-009 on by default: a localStorage
// without the flag and a fake IndexedDB, installed before any module of the plugin is loaded. A test file that sets
// its own globalThis.indexedDB before its imports keeps it.
import { createVersionedIndexedDB } from "./fakeVersionedIndexedDb.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

if (!globalThis.localStorage) globalThis.localStorage = memoryStorage();
if (!globalThis.indexedDB) globalThis.indexedDB = createVersionedIndexedDB();
globalThis.__TBP_TEST_LOCAL_HISTORY_STORAGE__ = true;
