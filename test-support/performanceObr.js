import { ID } from "../src/constants.js";

const META_KEY = `${ID}/meta`;

const METHOD_COSTS = Object.freeze({
  "scene.isReady": 0.05,
  "scene.getMetadata": 0.12,
  "scene.setMetadata": 0.22,
  "scene.items.getItems": 0.18,
  "scene.items.getItemBounds": 0.1,
  "scene.items.updateItems": 0.24,
  "scene.items.addItems": 0.3,
  "scene.items.deleteItems": 0.28,
  "scene.local.getItems": 0.05,
  "scene.local.updateItems": 0.08,
  "scene.local.addItems": 0.1,
  "scene.local.deleteItems": 0.09,
  "room.getMetadata": 0.12,
  "room.setMetadata": 0.22,
  "player.getRole": 0.03,
  "broadcast.sendMessage": 0.04,
});

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function itemId(item) {
  return String(item?.id || "").trim();
}

function realmName(realm) {
  return String(realm?.__performanceRealmId || realm?.id || "unknown");
}

function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => typeof value === "object" ? itemId(value) : String(value || "").trim())
    .filter(Boolean))];
}

function matchesSelector(item, selector) {
  if (selector === undefined || selector === null) return true;
  if (Array.isArray(selector)) return selector.map(String).includes(item.id);
  if (typeof selector === "function") {
    try { return selector(item) === true; } catch { return false; }
  }
  return false;
}

function boundsFor(item) {
  if (!item) return null;
  const position = item?.position || {};
  const scale = item?.scale || {};
  const width = Math.max(0.01, Number(item?.width || item?.image?.width || 1) * Math.abs(Number(scale.x) || 1));
  const height = Math.max(0.01, Number(item?.height || item?.image?.height || 1) * Math.abs(Number(scale.y) || 1));
  const x = Number(position.x) || 0;
  const y = Number(position.y) || 0;
  return {
    min: { x, y },
    max: { x: x + width, y: y + height },
    center: { x: x + width / 2, y: y + height / 2 },
    width,
    height,
  };
}

function aggregateBoundsForIds(map, ids) {
  const boxes = normalizeIds(ids)
    .map((id) => boundsFor(map.get(id)))
    .filter(Boolean);
  if (!boxes.length) return null;
  const min = {
    x: Math.min(...boxes.map((box) => box.min.x)),
    y: Math.min(...boxes.map((box) => box.min.y)),
  };
  const max = {
    x: Math.max(...boxes.map((box) => box.max.x)),
    y: Math.max(...boxes.map((box) => box.max.y)),
  };
  return {
    min,
    max,
    width: max.x - min.x,
    height: max.y - min.y,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
    },
  };
}

function makeScene(scene, fallbackId) {
  const id = String(scene?.id || fallbackId || "scene");
  const items = Array.isArray(scene?.items) ? scene.items : [];
  return {
    id,
    identity: String(scene?.identity || id),
    ready: scene?.ready !== false,
    metadata: clone(scene?.metadata || {}),
    items: new Map(items.filter((item) => itemId(item)).map((item) => [item.id, clone(item)])),
  };
}

function defaultDeliveryPolicy() {
  return { duplicateEvery: 0, delayMs: 0 };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function runWithContext(metrics, context, callback) {
  if (typeof metrics?.withContext === "function") return metrics.withContext(context, callback);
  return callback();
}

/**
 * A stateful OBR transport used by the performance harness and its fast
 * contract tests. It intentionally exposes full scene snapshots on every
 * item event, while keeping each realm's subscriptions and local items
 * private.
 */
export function createPerformanceObr({
  scenes = [],
  roomMetadata = {},
  initialSceneId = null,
  metrics = null,
  clock = null,
  deliveryPolicy = {},
} = {}) {
  const sceneMap = new Map();
  for (const [index, scene] of scenes.entries()) {
    const normalized = makeScene(scene, `scene-${index + 1}`);
    sceneMap.set(normalized.id, normalized);
  }
  if (!sceneMap.size) sceneMap.set("scene-a", makeScene({ id: "scene-a" }, "scene-a"));
  let currentSceneId = String(initialSceneId || sceneMap.keys().next().value);
  if (!sceneMap.has(currentSceneId)) currentSceneId = sceneMap.keys().next().value;

  const realmRecords = new Map();
  const broadcastListeners = new Map();
  const playerViolations = [];
  const crossSceneWrites = [];
  const eventLog = [];
  const gates = new Map();
  let room = clone(roomMetadata || {});
  let eventSequence = 0;
  let currentConcurrency = new Map();
  let delivery = { ...defaultDeliveryPolicy(), ...deliveryPolicy };

  const now = () => (typeof clock?.now === "function" ? clock.now() : Date.now());
  const schedule = (callback, delay = 0) => {
    if (typeof clock?.setTimeout === "function" && delay > 0) {
      return clock.setTimeout(callback, delay);
    }
    if (typeof clock?.queueMicrotask === "function") return clock.queueMicrotask(callback);
    return queueMicrotask(callback);
  };

  function currentScene() {
    return sceneMap.get(currentSceneId);
  }

  function phaseContext(realm, extra = {}) {
    return {
      realm: realmName(realm),
      ...extra,
    };
  }

  function violation(realm, method, sceneId = currentSceneId) {
    const entry = { realm: realmName(realm), role: realm.role, method, sceneId };
    playerViolations.push(entry);
    metrics?.recordLifecycle?.("player-write", {
      realm: realmName(realm),
      controller: "fake-obr",
      phase: extraPhase(realm),
    });
  }

  function extraPhase(realm) {
    return metrics?.context?.()?.phase || "unscoped";
  }

  function crossScene(realm, method, capturedSceneId) {
    const entry = {
      realm: realmName(realm),
      role: realm.role,
      method,
      capturedSceneId,
      currentSceneId,
      blocked: true,
    };
    crossSceneWrites.push(entry);
    metrics?.recordLifecycle?.("cross-scene-write", {
      realm: realmName(realm),
      controller: "fake-obr",
      phase: extraPhase(realm),
    });
  }

  async function sdkCall(realm, method, details, operation) {
    const started = now();
    const concurrency = (currentConcurrency.get(method) || 0) + 1;
    currentConcurrency.set(method, concurrency);
    const cost = () => {
      const base = Number(METHOD_COSTS[method] || 0.05);
      const extra = Math.min(2, Number(details?.requestedIds || 0) * 0.003);
      if (typeof clock?.tick === "function") clock.tick(base + extra);
    };
    try {
      const result = await operation();
      cost();
      metrics?.recordSdk?.(method, {
        ...details,
        realm: realmName(realm),
        concurrency,
        durationMs: Math.max(0, now() - started),
      });
      return result;
    } catch (error) {
      cost();
      metrics?.recordSdk?.(method, {
        ...details,
        realm: realmName(realm),
        concurrency,
        durationMs: Math.max(0, now() - started),
        error: true,
      });
      throw error;
    } finally {
      currentConcurrency.set(method, Math.max(0, (currentConcurrency.get(method) || 1) - 1));
    }
  }

  function selectorItems(map, selector) {
    return [...map.values()].filter((item) => matchesSelector(item, selector));
  }

  function gateFor(method) {
    const gate = gates.get(method);
    if (!gate) return null;
    gates.delete(method);
    gate.blocked.resolve();
    return gate;
  }

  async function awaitGate(method) {
    const gate = gateFor(method);
    if (gate) await gate.promise;
  }

  function notifyMetadata(sceneId, metadata, source) {
    for (const target of realmRecords.values()) {
      for (const listener of [...target.sceneMetadataListeners]) {
        schedule(() => runWithContext(
          metrics,
          phaseContext(target, source),
          () => listener(clone(metadata), clone(source)),
        ));
      }
    }
  }

  function notifyRoomMetadata(metadata, source) {
    for (const target of realmRecords.values()) {
      for (const listener of [...target.roomMetadataListeners]) {
        schedule(() => runWithContext(
          metrics,
          phaseContext(target, source),
          () => listener(clone(metadata), clone(source)),
        ));
      }
    }
  }

  function snapshot(sceneId = currentSceneId) {
    return [...(sceneMap.get(sceneId)?.items.values() || [])].map(clone);
  }

  function emitSceneSnapshot(sceneId, source = {}) {
    if (sceneId !== currentSceneId || !currentScene()?.ready) return;
    const sequence = ++eventSequence;
    const listeners = [...realmRecords.values()]
      .filter((record) => record.sceneItemListeners.size)
      .flatMap((record) => [...record.sceneItemListeners].map((listener) => ({ record, listener })));
    const context = {
      ...clone(source),
      sceneId,
      eventGeneration: sequence,
      source: { realm: source.realm || null, method: source.method || "scene.items" },
    };
    const eventSnapshot = snapshot(sceneId);
    eventLog.push({ sequence, sceneId, fanout: listeners.length, duplicate: false });
    metrics?.recordEvent?.("source", {
      realm: source.realm || "server",
      controller: source.controller || "fake-obr",
      phase: source.phase || extraPhase({ id: source.realm || "server" }),
      fanout: listeners.length,
    });
    const copies = [false];
    if (Number(delivery.duplicateEvery) > 0
      && sequence % Math.floor(Number(delivery.duplicateEvery)) === 0) {
      copies.push(true);
      eventLog.push({ sequence, sceneId, fanout: listeners.length, duplicate: true });
      metrics?.recordEvent?.("duplicate", {
        realm: source.realm || "server",
        controller: source.controller || "fake-obr",
        phase: source.phase || extraPhase({ id: source.realm || "server" }),
      });
    }
    for (const duplicate of copies) {
      for (const { record, listener } of listeners) {
        const invoke = () => {
          const run = () => listener(clone(eventSnapshot), {
            ...clone(context),
            duplicate,
          });
          if (duplicate) metrics?.recordEvent?.("duplicate", phaseContext(record));
          return runWithContext(metrics, phaseContext(record, context), run);
        };
        schedule(invoke, Number(delivery.delayMs) || 0);
      }
    }
  }

  function currentLocalMap(record) {
    if (!record.localByScene.has(currentSceneId)) record.localByScene.set(currentSceneId, new Map());
    return record.localByScene.get(currentSceneId);
  }

  function localSelectorItems(record, selector) {
    return selectorItems(currentLocalMap(record), selector);
  }

  function ensureCurrentScene(realm, method, capturedSceneId) {
    if (capturedSceneId !== currentSceneId || !currentScene()?.ready) {
      crossScene(realm, method, capturedSceneId);
      return null;
    }
    return sceneMap.get(capturedSceneId);
  }

  function makeItemsApi(record, local = false) {
    const realm = record.realm;
    const prefix = local ? "scene.local" : "scene.items";
    const mapFor = () => local ? currentLocalMap(record) : currentScene().items;

    return {
      getItems: (selector) => sdkCall(realm, `${prefix}.getItems`, {
        requestedIds: Array.isArray(selector) ? selector.length : 0,
        full: selector === undefined,
        filtered: typeof selector === "function",
        idScoped: Array.isArray(selector),
        returnedItems: local
          ? localSelectorItems(record, selector).length
          : selectorItems(currentScene().items, selector).length,
        controller: "sdk-read",
      }, async () => local
        ? localSelectorItems(record, selector).map(clone)
        : selectorItems(currentScene().items, selector).map(clone)),
      getItemBounds: local
        ? (ids) => sdkCall(realm, `${prefix}.getItemBounds`, {
          requestedIds: normalizeIds(ids).length,
          returnedItems: normalizeIds(ids).length ? 1 : 0,
          idScoped: true,
          aggregate: true,
          controller: "bounds",
        }, async () => aggregateBoundsForIds(currentLocalMap(record), ids))
        : (ids) => sdkCall(realm, `${prefix}.getItemBounds`, {
          requestedIds: normalizeIds(ids).length,
          returnedItems: normalizeIds(ids).length ? 1 : 0,
          idScoped: true,
          aggregate: true,
          controller: "bounds",
        }, async () => aggregateBoundsForIds(currentScene().items, ids)),
      updateItems: (idsOrItems, updater) => sdkCall(realm, `${prefix}.updateItems`, {
        requestedIds: Array.isArray(idsOrItems) ? idsOrItems.length : 0,
        idScoped: true,
        controller: local ? "local-output" : "scene-mutation",
      }, async () => {
        const capturedSceneId = currentSceneId;
        await awaitGate(`${prefix}.updateItems`);
        if (!local) {
          if (record.role !== "GM") violation(record, `${prefix}.updateItems`, capturedSceneId);
          const scene = ensureCurrentScene(realm, `${prefix}.updateItems`, capturedSceneId);
          if (!scene) return [];
        } else if (capturedSceneId !== currentSceneId) {
          crossScene(realm, `${prefix}.updateItems`, capturedSceneId);
          return [];
        }
        const map = mapFor();
        const selected = Array.isArray(idsOrItems) && idsOrItems.some((value) => typeof value === "object")
          ? idsOrItems.map((item) => map.get(itemId(item))).filter(Boolean)
          : selectorItems(map, idsOrItems);
        const drafts = selected.map(clone);
        if (typeof updater === "function") {
          const returned = updater(drafts);
          if (returned && typeof returned.then === "function") await returned;
        }
        for (const draft of drafts) {
          if (!itemId(draft)) continue;
          map.set(draft.id, clone(draft));
        }
        if (!local) {
          emitSceneSnapshot(capturedSceneId, {
            realm: realmName(realm),
            method: "updateItems",
            controller: "scene-mutation",
            phase: extraPhase(realm),
          });
        }
        return drafts.map(clone);
      }),
      addItems: (items) => sdkCall(realm, `${prefix}.addItems`, {
        requestedIds: Array.isArray(items) ? items.length : 0,
        controller: local ? "local-output" : "scene-mutation",
      }, async () => {
        const capturedSceneId = currentSceneId;
        await awaitGate(`${prefix}.addItems`);
        if (!local) {
          if (record.role !== "GM") violation(record, `${prefix}.addItems`, capturedSceneId);
          const scene = ensureCurrentScene(realm, `${prefix}.addItems`, capturedSceneId);
          if (!scene) return [];
        } else if (capturedSceneId !== currentSceneId) {
          crossScene(realm, `${prefix}.addItems`, capturedSceneId);
          return [];
        }
        const map = mapFor();
        const added = [];
        for (const item of Array.isArray(items) ? items : []) {
          if (!itemId(item)) continue;
          map.set(item.id, clone(item));
          added.push(clone(item));
        }
        if (!local) {
          emitSceneSnapshot(capturedSceneId, {
            realm: realmName(realm),
            method: "addItems",
            controller: "scene-mutation",
            phase: extraPhase(realm),
          });
        }
        return added;
      }),
      deleteItems: (ids) => sdkCall(realm, `${prefix}.deleteItems`, {
        requestedIds: normalizeIds(ids).length,
        idScoped: true,
        controller: local ? "local-output" : "scene-mutation",
      }, async () => {
        const capturedSceneId = currentSceneId;
        await awaitGate(`${prefix}.deleteItems`);
        if (!local) {
          if (record.role !== "GM") violation(record, `${prefix}.deleteItems`, capturedSceneId);
          const scene = ensureCurrentScene(realm, `${prefix}.deleteItems`, capturedSceneId);
          if (!scene) return [];
        } else if (capturedSceneId !== currentSceneId) {
          crossScene(realm, `${prefix}.deleteItems`, capturedSceneId);
          return [];
        }
        const map = mapFor();
        const removed = [];
        for (const id of normalizeIds(ids)) {
          if (!map.has(id)) continue;
          removed.push(clone(map.get(id)));
          map.delete(id);
        }
        if (!local) {
          emitSceneSnapshot(capturedSceneId, {
            realm: realmName(realm),
            method: "deleteItems",
            controller: "scene-mutation",
            phase: extraPhase(realm),
          });
        }
        return removed;
      }),
      onChange: local
        ? (handler) => {
          if (typeof handler !== "function") return () => {};
          record.localListeners.add(handler);
          return () => record.localListeners.delete(handler);
        }
        : (handler) => {
          if (typeof handler !== "function") return () => {};
          record.sceneItemListeners.add(handler);
          return () => record.sceneItemListeners.delete(handler);
        },
      getItemAttachments: async () => [],
    };
  }

  function createRealm({ id, role = "GM", popup = false } = {}) {
    const realmId = String(id || `realm-${realmRecords.size + 1}`);
    if (realmRecords.has(realmId)) throw new Error(`realm-already-exists:${realmId}`);
    const record = {
      id: realmId,
      role: String(role || "PLAYER").toUpperCase() === "GM" ? "GM" : "PLAYER",
      popup: popup === true,
      realm: null,
      readyListeners: new Set(),
      sceneMetadataListeners: new Set(),
      roomMetadataListeners: new Set(),
      sceneItemListeners: new Set(),
      localListeners: new Set(),
      localByScene: new Map(),
      selection: [],
    };
    realmRecords.set(realmId, record);

    const realm = {
      __performanceRealmId: realmId,
      __performanceRole: record.role,
      scene: {
        isReady: () => sdkCall(realm, "scene.isReady", {
          controller: "lifecycle",
        }, async () => currentScene().ready),
        onReadyChange: (handler) => {
          record.readyListeners.add(handler);
          return () => record.readyListeners.delete(handler);
        },
        getMetadata: () => sdkCall(realm, "scene.getMetadata", {
          controller: "metadata-read",
        }, async () => clone(currentScene().metadata)),
        setMetadata: (patch) => sdkCall(realm, "scene.setMetadata", {
          controller: "metadata-write",
        }, async () => {
          const capturedSceneId = currentSceneId;
          if (record.role !== "GM") violation(record, "scene.setMetadata", capturedSceneId);
          const scene = ensureCurrentScene(realm, "scene.setMetadata", capturedSceneId);
          if (!scene) return clone(scene?.metadata || {});
          const input = patch && typeof patch === "object" ? patch : {};
          for (const [key, value] of Object.entries(input)) scene.metadata[key] = clone(value);
          notifyMetadata(capturedSceneId, scene.metadata, {
            realm: realmId,
            controller: "metadata-write",
            phase: extraPhase(record),
          });
          return clone(scene.metadata);
        }),
        onMetadataChange: (handler) => {
          record.sceneMetadataListeners.add(handler);
          return () => record.sceneMetadataListeners.delete(handler);
        },
        items: null,
        local: null,
        grid: {
          getDpi: () => sdkCall(realm, "scene.grid.getDpi", {
            controller: "grid",
          }, async () => 1),
          getScale: () => sdkCall(realm, "scene.grid.getScale", {
            controller: "grid",
          }, async () => 1),
        },
      },
      room: {
        id: "performance-room",
        getMetadata: () => sdkCall(realm, "room.getMetadata", {
          controller: "room-read",
        }, async () => clone(room)),
        setMetadata: (patch) => sdkCall(realm, "room.setMetadata", {
          controller: "room-write",
        }, async () => {
          if (record.role !== "GM") violation(record, "room.setMetadata", currentSceneId);
          const input = patch && typeof patch === "object" ? patch : {};
          for (const [key, value] of Object.entries(input)) room[key] = clone(value);
          notifyRoomMetadata(room, {
            realm: realmId,
            controller: "room-write",
            phase: extraPhase(record),
          });
          return clone(room);
        }),
        onMetadataChange: (handler) => {
          record.roomMetadataListeners.add(handler);
          return () => record.roomMetadataListeners.delete(handler);
        },
      },
      player: {
        getRole: () => sdkCall(realm, "player.getRole", {
          controller: "role",
        }, async () => record.role),
        getSelection: () => Promise.resolve(record.selection.slice()),
        select: (ids) => { record.selection = normalizeIds(ids); },
        deselect: () => { record.selection = []; },
        onChange: (handler) => {
          record.selectionListener = handler;
          return () => { record.selectionListener = null; };
        },
      },
      broadcast: {
        sendMessage: (channel, payload, options = {}) => sdkCall(realm, "broadcast.sendMessage", {
          controller: "broadcast",
        }, async () => {
          const destination = String(options?.destination || "ALL").toUpperCase();
          const listeners = broadcastListeners.get(String(channel || "")) || new Map();
          for (const [targetId, callbacks] of listeners) {
            const target = realmRecords.get(targetId);
            if (!target || targetId === realmId) continue;
            if (destination === "GM" && target.role !== "GM") continue;
            if (destination === "PLAYER" && target.role !== "PLAYER") continue;
            for (const callback of [...callbacks]) {
              metrics?.recordSdk?.("broadcast.receive", {
                realm: targetId,
                controller: "broadcast",
                phase: extraPhase(target),
                durationMs: 0,
              });
              metrics?.recordEvent?.("subscriber", {
                realm: targetId,
                controller: "broadcast",
                phase: extraPhase(target),
              });
              schedule(() => runWithContext(
                metrics,
                phaseContext(target, { correlationId: payload?.correlationId }),
                () => callback({
                  data: clone(payload),
                  senderId: realmId,
                  senderRole: record.role,
                  destination,
                }),
              ));
            }
          }
          return true;
        }),
        onMessage: (channel, callback) => {
          const key = String(channel || "");
          if (!broadcastListeners.has(key)) broadcastListeners.set(key, new Map());
          const listeners = broadcastListeners.get(key);
          if (!listeners.has(realmId)) listeners.set(realmId, new Set());
          listeners.get(realmId).add(callback);
          return () => listeners.get(realmId)?.delete(callback);
        },
      },
    };
    record.realm = realm;
    realm.scene.items = makeItemsApi(record, false);
    realm.scene.local = makeItemsApi(record, true);
    return realm;
  }

  function notifyReady(ready) {
    for (const record of realmRecords.values()) {
      for (const listener of [...record.readyListeners]) {
        try {
          runWithContext(
            metrics,
            phaseContext(record, { controller: "lifecycle" }),
            () => listener(ready === true),
          );
        } catch {}
      }
    }
  }

  function clearLocalForSceneSwitch() {
    for (const record of realmRecords.values()) {
      record.localByScene.clear();
      metrics?.recordCache?.("local-derived-output", {
        realm: record.id,
        controller: "scene-switch",
        size: 0,
      });
    }
  }

  function switchScene(sceneId) {
    const nextId = String(sceneId || "");
    if (!sceneMap.has(nextId)) throw new Error(`unknown-scene:${nextId}`);
    const previousId = currentSceneId;
    const previous = currentScene();
    previous.ready = false;
    notifyReady(false);
    currentSceneId = nextId;
    currentScene().ready = true;
    clearLocalForSceneSwitch();
    metrics?.recordLifecycle?.("scene-change", {
      realm: "server",
      controller: "scene-switch",
      phase: extraPhase({ id: "server" }),
    });
    notifyReady(true);
    return { previousId, currentId: nextId };
  }

  function setSceneReady(ready) {
    currentScene().ready = ready === true;
    notifyReady(currentScene().ready);
  }

  function emitCurrentSnapshot(source = {}) {
    emitSceneSnapshot(currentSceneId, {
      ...source,
      realm: source.realm || "driver",
      controller: source.controller || "fixture",
      phase: source.phase || extraPhase({ id: source.realm || "driver" }),
    });
  }

  function holdNext(method) {
    const blocked = createDeferred();
    const gate = createDeferred();
    const result = {
      method,
      waitUntilBlocked: () => blocked.promise,
      release: () => gate.resolve(),
    };
    gates.set(String(method), {
      promise: gate.promise,
      blocked,
      resolve: gate.resolve,
    });
    return result;
  }

  function setDeliveryPolicy(next = {}) {
    delivery = { ...delivery, ...next };
  }

  function getDiagnostics() {
    return {
      currentSceneId,
      sceneIdentities: Object.fromEntries([...sceneMap.entries()].map(([id, scene]) => [id, scene.identity])),
      playerWriteViolations: clone(playerViolations),
      crossSceneWrites: clone(crossSceneWrites),
      eventLog: clone(eventLog),
      activeListeners: [...realmRecords.values()].reduce((sum, record) => (
        sum + record.readyListeners.size
        + record.sceneMetadataListeners.size
        + record.roomMetadataListeners.size
        + record.sceneItemListeners.size
      ), 0),
      realmIds: [...realmRecords.keys()],
    };
  }

  return {
    createRealm,
    switchScene,
    setSceneReady,
    emitCurrentSnapshot,
    flushEvents: async () => {
      if (typeof clock?.runAll === "function") await clock.runAll();
      else await Promise.resolve();
    },
    holdNext,
    setDeliveryPolicy,
    getCurrentSceneId: () => currentSceneId,
    getCurrentSceneIdentity: () => currentScene().identity,
    getSceneSnapshot: (sceneId = currentSceneId) => ({
      id: sceneMap.get(sceneId)?.id || null,
      identity: sceneMap.get(sceneId)?.identity || null,
      ready: sceneMap.get(sceneId)?.ready === true,
      metadata: clone(sceneMap.get(sceneId)?.metadata || {}),
      items: snapshot(sceneId),
    }),
    getRoomMetadata: () => clone(room),
    getDiagnostics,
    getSceneMap: () => sceneMap,
    getRealmRecord: (realmId) => realmRecords.get(realmId) || null,
    constants: { META_KEY },
  };
}

export { META_KEY as PERFORMANCE_META_KEY };
