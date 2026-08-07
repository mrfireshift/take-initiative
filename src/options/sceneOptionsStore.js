import {
  clearSceneMetadataKey,
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "../metadataKeyScoped.js";
import { SCENE_OPTIONS_KEY } from "./optionsDefaults.js";
import {
  cloneOptionsValue,
  compactSceneOptionsForStorage,
  mergeOptionsDocuments,
  normalizeSceneOptions,
} from "./optionsNormalize.js";

export function legacyLocalOptionsFromSceneMetadata(metadata) {
  const state = metadata?.[METADATA_OWNERSHIP.INITIATIVE_STATE.key];
  return {
    tracker: {
      followActiveTurn: state?.ui?.autoFocus !== false,
    },
  };
}

export function createSceneOptionsStore({
  api = null,
  now = () => Date.now(),
  runtime = "optionsService",
} = {}) {
  let snapshot = normalizeSceneOptions(null);
  let legacyLocal = legacyLocalOptionsFromSceneMetadata(null);
  let serializedState = JSON.stringify({ snapshot, legacyLocal, ready: false });
  let ready = false;
  let generation = 0;
  let writeQueue = Promise.resolve();
  let started = false;
  let unsubscribeMetadata = null;
  let unsubscribeReady = null;
  const listeners = new Set();

  function notify(reason) {
    const event = {
      scope: "scene",
      reason,
      ready,
      generation,
      legacyLocal: cloneOptionsValue(legacyLocal),
    };
    for (const listener of listeners) {
      try {
        listener(cloneOptionsValue(snapshot), event);
      } catch (error) {
        console.warn("[options:scene] listener:", error?.message || error);
      }
    }
  }

  function acceptMetadata(metadata, reason, { force = false, isReady = ready } = {}) {
    const next = normalizeSceneOptions(metadata?.[SCENE_OPTIONS_KEY]);
    const nextLegacy = legacyLocalOptionsFromSceneMetadata(metadata);
    ready = isReady;
    const serialized = JSON.stringify({ snapshot: next, legacyLocal: nextLegacy, ready });
    if (!force && serialized === serializedState) return cloneOptionsValue(snapshot);
    snapshot = next;
    legacyLocal = nextLegacy;
    serializedState = serialized;
    notify(reason);
    return cloneOptionsValue(snapshot);
  }

  async function apiReady() {
    if (typeof api?.isReady !== "function") return true;
    return api.isReady().catch(() => false);
  }

  async function loadGeneration(candidateGeneration, reason, { force = false } = {}) {
    const metadata = await api.getMetadata().catch(() => ({}));
    if (candidateGeneration !== generation || !ready) return cloneOptionsValue(snapshot);
    return acceptMetadata(metadata, reason, { force, isReady: true });
  }

  async function read({ emit = false, reason = "read" } = {}) {
    if (!api || typeof api.getMetadata !== "function") {
      return acceptMetadata({}, reason, { force: emit, isReady: false });
    }
    const isReady = await apiReady();
    generation += 1;
    const candidateGeneration = generation;
    if (!isReady) {
      return acceptMetadata({}, "scene-unavailable", { force: true, isReady: false });
    }
    ready = true;
    return loadGeneration(candidateGeneration, reason, { force: emit });
  }

  async function readPersisted() {
    if (!api || typeof api.getMetadata !== "function") {
      return normalizeSceneOptions(null);
    }
    if (!await apiReady()) throw new Error("scene-options-not-ready");
    const metadata = await api.getMetadata();
    return normalizeSceneOptions(metadata?.[SCENE_OPTIONS_KEY]);
  }

  async function requireReadyGeneration() {
    if (!await apiReady() || !ready) throw new Error("scene-options-not-ready");
    return generation;
  }

  function enqueueMutation(mutator, reason) {
    const run = async () => {
      const writeGeneration = await requireReadyGeneration();
      const metadata = await api.getMetadata().catch(() => ({}));
      if (writeGeneration !== generation || !ready) throw new Error("scene-options-changed-during-write");
      const currentRaw = metadata?.[SCENE_OPTIONS_KEY];
      const current = normalizeSceneOptions(currentRaw);
      const candidate = mutator(cloneOptionsValue(current));
      const merged = mergeOptionsDocuments(currentRaw, candidate ?? current);
      const next = normalizeSceneOptions({
        ...merged,
        updatedAt: Math.max(0, Math.round(Number(now()) || 0)),
      });
      const persisted = compactSceneOptionsForStorage(next);
      if (writeGeneration !== generation || !ready) throw new Error("scene-options-changed-during-write");
      await writeSceneMetadataKey(
        api,
        METADATA_OWNERSHIP.SCENE_OPTIONS,
        persisted,
        { runtime },
      );
      if (writeGeneration === generation && ready) {
        acceptMetadata({ ...metadata, [SCENE_OPTIONS_KEY]: next }, reason, { isReady: true });
      }
      return cloneOptionsValue(snapshot);
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  function write(patch) {
    return enqueueMutation((current) => mergeOptionsDocuments(current, patch), "write");
  }

  function update(updater) {
    if (typeof updater !== "function") throw new TypeError("scene options updater must be a function");
    return enqueueMutation(updater, "update");
  }

  function clear() {
    const run = async () => {
      const writeGeneration = await requireReadyGeneration();
      const metadata = await api.getMetadata().catch(() => ({}));
      if (writeGeneration !== generation || !ready) throw new Error("scene-options-changed-during-write");
      await clearSceneMetadataKey(
        api,
        METADATA_OWNERSHIP.SCENE_OPTIONS,
        { runtime },
      );
      if (writeGeneration === generation && ready) {
        acceptMetadata(
          { ...metadata, [SCENE_OPTIONS_KEY]: null },
          "clear",
          { force: true, isReady: true },
        );
      }
      return cloneOptionsValue(snapshot);
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  async function handleReadyChange(nextReady) {
    generation += 1;
    const candidateGeneration = generation;
    if (nextReady !== true) {
      acceptMetadata({}, "scene-unavailable", { force: true, isReady: false });
      return;
    }
    ready = true;
    await loadGeneration(candidateGeneration, "scene-ready", { force: true });
  }

  async function start() {
    if (started) return cloneOptionsValue(snapshot);
    started = true;
    if (typeof api?.onMetadataChange === "function") {
      unsubscribeMetadata = api.onMetadataChange((metadata) => {
        generation += 1;
        if (!ready) return;
        acceptMetadata(metadata, "metadata-change", { isReady: true });
      });
    }
    if (typeof api?.onReadyChange === "function") {
      unsubscribeReady = api.onReadyChange((nextReady) => {
        void handleReadyChange(nextReady);
      });
    }
    return read();
  }

  function stop() {
    unsubscribeMetadata?.();
    unsubscribeReady?.();
    unsubscribeMetadata = null;
    unsubscribeReady = null;
    started = false;
    generation += 1;
  }

  return {
    key: SCENE_OPTIONS_KEY,
    start,
    stop,
    read,
    readPersisted,
    write,
    update,
    clear,
    isReady: () => ready,
    getSnapshot: () => cloneOptionsValue(snapshot),
    getLegacyLocalOptions: () => cloneOptionsValue(legacyLocal),
    subscribe(listener, { emitCurrent = false } = {}) {
      if (typeof listener !== "function") throw new TypeError("scene options listener must be a function");
      listeners.add(listener);
      if (emitCurrent) {
        listener(cloneOptionsValue(snapshot), {
          scope: "scene",
          reason: "subscribe",
          ready,
          generation,
          legacyLocal: cloneOptionsValue(legacyLocal),
        });
      }
      return () => listeners.delete(listener);
    },
  };
}
