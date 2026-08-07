import { createLocalOptionsStore } from "./localOptionsStore.js";
import { resolveOptions } from "./optionsResolve.js";
import { createRoomOptionsStore } from "./roomOptionsStore.js";
import { createSceneOptionsStore } from "./sceneOptionsStore.js";

function serialized(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createOptionsService({
  sdk = null,
  localStore: providedLocalStore = null,
  roomStore: providedRoomStore = null,
  sceneStore: providedSceneStore = null,
} = {}) {
  const localStore = providedLocalStore || createLocalOptionsStore();
  const roomStore = providedRoomStore || createRoomOptionsStore({ api: sdk?.room });
  const sceneStore = providedSceneStore || createSceneOptionsStore({ api: sdk?.scene });
  let snapshot = resolveOptions({
    local: localStore.getSnapshot(),
    room: roomStore.getSnapshot(),
    scene: sceneStore.getSnapshot(),
    legacyLocal: sceneStore.getLegacyLocalOptions(),
  });
  let serializedSnapshot = serialized(snapshot);
  let started = false;
  let startPromise = null;
  const storeUnsubscribers = [];
  const subscriptions = new Set();

  function notify(reason, force = false) {
    for (const subscription of subscriptions) {
      let selected;
      try {
        selected = subscription.selector(snapshot);
      } catch (error) {
        console.warn("[options] selector:", error?.message || error);
        continue;
      }
      const nextSerialized = serialized(selected);
      if (!force && nextSerialized === subscription.serialized) continue;
      subscription.serialized = nextSerialized;
      try {
        subscription.listener(selected, { reason });
      } catch (error) {
        console.warn("[options] listener:", error?.message || error);
      }
    }
  }

  function recompute(reason, { force = false } = {}) {
    const next = resolveOptions({
      local: localStore.getSnapshot(),
      room: roomStore.getSnapshot(),
      scene: sceneStore.getSnapshot(),
      legacyLocal: sceneStore.getLegacyLocalOptions(),
    });
    const nextSerialized = serialized(next);
    if (!force && nextSerialized === serializedSnapshot) return snapshot;
    snapshot = next;
    serializedSnapshot = nextSerialized;
    notify(reason, force);
    return snapshot;
  }

  async function start() {
    if (started) return startPromise;
    started = true;
    storeUnsubscribers.push(
      localStore.subscribe(() => recompute("local-change")),
      roomStore.subscribe(() => recompute("room-change")),
      sceneStore.subscribe((_value, event) => {
        localStore.setLegacyFallback(event?.legacyLocal || sceneStore.getLegacyLocalOptions());
        recompute(event?.reason || "scene-change", {
          force: event?.reason === "scene-ready",
        });
      }),
    );
    localStore.setLegacyFallback(sceneStore.getLegacyLocalOptions());
    startPromise = Promise.all([
      localStore.start(),
      roomStore.start(),
      sceneStore.start(),
    ]).then(() => {
      localStore.setLegacyFallback(sceneStore.getLegacyLocalOptions());
      recompute("start", { force: true });
      return snapshot;
    }).catch((error) => {
      stop();
      throw error;
    });
    return startPromise;
  }

  async function refresh(reason = "external-refresh") {
    await Promise.all([
      localStore.read({ reason }),
      roomStore.read({ reason }),
      sceneStore.read({ reason }),
    ]);
    localStore.setLegacyFallback(sceneStore.getLegacyLocalOptions());
    return recompute(reason, { force: true });
  }

  function stop() {
    while (storeUnsubscribers.length) storeUnsubscribers.pop()?.();
    localStore.stop();
    roomStore.stop();
    sceneStore.stop();
    started = false;
    startPromise = null;
  }

  function get(selector) {
    if (typeof selector !== "function") {
      throw new TypeError("optionsService.get requires a descriptive selector");
    }
    return selector(snapshot);
  }

  async function readPersisted(selector) {
    if (typeof selector !== "function") {
      throw new TypeError("optionsService.readPersisted requires a descriptive selector");
    }
    const [local, room, scene] = await Promise.all([
      localStore.readPersisted(),
      roomStore.readPersisted(),
      sceneStore.readPersisted(),
    ]);
    return selector(resolveOptions({
      local,
      room,
      scene,
      legacyLocal: sceneStore.getLegacyLocalOptions(),
    }));
  }

  function subscribe(selector, listener, { emitCurrent = true } = {}) {
    if (typeof selector !== "function") {
      throw new TypeError("optionsService.subscribe requires a descriptive selector");
    }
    if (typeof listener !== "function") throw new TypeError("options listener must be a function");
    const selected = selector(snapshot);
    const subscription = {
      selector,
      listener,
      serialized: serialized(selected),
    };
    subscriptions.add(subscription);
    if (emitCurrent) listener(selected, { reason: "subscribe" });
    return () => subscriptions.delete(subscription);
  }

  return {
    start,
    stop,
    refresh,
    get,
    readPersisted,
    inspectRoomStorage: () => roomStore.inspectStorage(),
    subscribe,
    updateLocal: (updater) => localStore.update(updater),
    updateRoom: (updater) => roomStore.update(updater),
    updateScene: (updater) => sceneStore.update(updater),
    clearLocal: () => localStore.clear(),
    clearRoom: () => roomStore.clear(),
    clearScene: () => sceneStore.clear(),
  };
}

// Il singleton è intenzionalmente dormiente in OPTIONS-001. Gli entry point
// correnti non lo avviano: OPTIONS-002/003 monteranno il servizio quando i
// primi consumer useranno i selector.
export const optionsService = createOptionsService();
