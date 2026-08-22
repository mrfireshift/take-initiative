import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  actorProfileIdFromItem,
  normalizeActorProfileId,
} from "./actorIdentityCore.js";
import {
  actorVitalsRecordFor,
  isValidActorVitalsRecord,
  mergeActorVitalsRegistries,
  normalizeActorVitalsRegistry,
  retainActorVitalsRegistryWithinByteBudget,
  upsertActorVitalsRecord,
} from "./actorVitalsCore.js";
import {
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "./metadataKeyScoped.js";
import { ROOM_METADATA_DOMAIN_MAX_BYTES } from "./roomMetadataBudget.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";

export const ACTOR_VITALS_ROOM_KEY = `${ID}/actorVitals`;
export const ACTOR_VITALS_LOCAL_KEY = `${ID}/actorVitals/local`;
export const ACTOR_VITALS_ROOM_MAX_BYTES = ROOM_METADATA_DOMAIN_MAX_BYTES["actor-vitals"];
export const ACTOR_VITALS_AUTHORITIES = Object.freeze({
  GM: "GM",
  PLAYER: "PLAYER",
});

function normalizeAuthority(value) {
  return String(value ?? ACTOR_VITALS_AUTHORITIES.GM).trim().toUpperCase()
    === ACTOR_VITALS_AUTHORITIES.GM
    ? ACTOR_VITALS_AUTHORITIES.GM
    : ACTOR_VITALS_AUTHORITIES.PLAYER;
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function defaultStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function readLocalRegistry(storage, key = ACTOR_VITALS_LOCAL_KEY) {
  try {
    if (!storage) return normalizeActorVitalsRegistry({});
    return normalizeActorVitalsRegistry(JSON.parse(storage.getItem(key) || "{}"));
  } catch {
    return normalizeActorVitalsRegistry({});
  }
}

function writeLocalRegistry(storage, value, key = ACTOR_VITALS_LOCAL_KEY) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(normalizeActorVitalsRegistry(value)));
    return true;
  } catch {
    return false;
  }
}

function normalizeHP(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function normalizeHPMax(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validCanonicalHP(item) {
  const meta = item?.metadata?.[`${ID}/meta`] || {};
  const hp = normalizeHP(meta.hp);
  const hpMax = normalizeHPMax(meta.hpMax);
  if (hp === null || hpMax === null) return null;
  return { hp, hpMax };
}

function itemId(item) {
  return String(item?.id || "").trim();
}

function sortItems(items) {
  return [...(Array.isArray(items) ? items : [])]
    .filter((item) => item?.id)
    .sort((left, right) => itemId(left).localeCompare(itemId(right)));
}

function primaryItemsByActor(items) {
  const byActor = new Map();
  for (const item of sortItems(items)) {
    const actorProfileId = actorProfileIdFromItem(item);
    if (!actorProfileId || !item?.id) continue;
    if (!byActor.has(actorProfileId)) byActor.set(actorProfileId, item);
  }
  return byActor;
}

function metadataWithCanonicalHP(item, hp, hpMax) {
  const metaKey = `${ID}/meta`;
  const previous = item?.metadata?.[metaKey] && typeof item.metadata[metaKey] === "object"
    ? item.metadata[metaKey]
    : {};
  return {
    ...(item?.metadata || {}),
    [metaKey]: {
      ...previous,
      hp,
      hpMax,
    },
  };
}

function sameCanonicalHP(left, right) {
  if (!left || !right) return !left && !right;
  return left.hp === right.hp && left.hpMax === right.hpMax;
}

export function createActorVitalsStore({
  api = OBR.room,
  itemsApi = OBR.scene.items,
  storage = defaultStorage(),
  roomKey = ACTOR_VITALS_ROOM_KEY,
  localKey = ACTOR_VITALS_LOCAL_KEY,
  roomMaxBytes = ACTOR_VITALS_ROOM_MAX_BYTES,
  now = Date.now,
  authority = ACTOR_VITALS_AUTHORITIES.GM,
  getSceneEpoch = currentSceneEpoch,
  isSceneEpochCurrent = isCurrentSceneEpoch,
  subscribeItems = null,
  subscribeEpoch = null,
  logger = console,
} = {}) {
  let runtimeAuthority = normalizeAuthority(authority);
  let stopped = false;
  let started = false;
  let roomUnsubscribe = null;
  let itemUnsubscribe = null;
  let epochUnsubscribe = null;
  let storageUnsubscribe = null;
  let latestRegistry = normalizeActorVitalsRegistry({});
  let currentItems = [];
  let reconcileQueue = Promise.resolve();
  let writeQueue = Promise.resolve();
  let queuedWriteCount = 0;
  let lastAcceptedSourceRevision = new Map();
  let lastReconciledEpoch = null;
  let hydratedEpoch = null;
  let hydratedItems = new Map();

  const canWrite = () => runtimeAuthority === ACTOR_VITALS_AUTHORITIES.GM;

  const getLocal = () => readLocalRegistry(storage, localKey);

  async function readRegistry() {
    const local = getLocal();
    const metadata = await api?.getMetadata?.().catch?.(() => ({})) || {};
    const room = normalizeActorVitalsRegistry(metadata?.[roomKey]);
    latestRegistry = mergeActorVitalsRegistries(local, room);
    return clone(latestRegistry) || normalizeActorVitalsRegistry({});
  }

  function emitChange(reason, registry) {
    latestRegistry = normalizeActorVitalsRegistry(registry);
    for (const listener of listeners) {
      try {
        listener(clone(latestRegistry), { reason });
      } catch (error) {
        logger?.warn?.("[actorVitals] listener:", error?.message || error);
      }
    }
  }

  const listeners = new Set();

  async function writeRegistry(updater, {
    sceneEpoch = getSceneEpoch(),
    reason = "write",
  } = {}) {
    const write = async () => {
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
      const local = getLocal();
      const metadata = await api?.getMetadata?.().catch?.(() => ({})) || {};
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
      const previous = mergeActorVitalsRegistries(local, metadata?.[roomKey]);
      const next = normalizeActorVitalsRegistry(
        typeof updater === "function" ? updater(clone(previous)) : updater,
      );
      if (JSON.stringify(next) === JSON.stringify(previous)) {
        latestRegistry = previous;
        return previous;
      }
      latestRegistry = next;
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
      const localWritten = writeLocalRegistry(storage, next, localKey);
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return next;
      try {
        await writeRoomMetadataKey(
          api,
          { ...METADATA_OWNERSHIP.ACTOR_VITALS, key: roomKey },
          next,
          {
            runtime: "actorVitalsStore",
            roomBudget: {
              domainMaxBytes: roomMaxBytes,
              retain: retainActorVitalsRegistryWithinByteBudget,
            },
          },
        );
      } catch (error) {
        if (!localWritten) throw error;
        logger?.warn?.("[actorVitals] Room unavailable; local fallback:", error?.message || error);
      }
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return next;
      emitChange(reason, next);
      return next;
    };
    queuedWriteCount += 1;
    const result = writeQueue.then(write, write);
    writeQueue = result
      .catch(() => {})
      .finally(() => {
        queuedWriteCount = Math.max(0, queuedWriteCount - 1);
      });
    return result;
  }

  async function refresh(reason = "metadata-change") {
    if (stopped) return latestRegistry;
    const registry = await readRegistry();
    emitChange(reason, registry);
    return registry;
  }

  async function saveCanonicalHP(actorProfileId, hp, hpMax, {
    sceneEpoch = getSceneEpoch(),
    sourceRevision = null,
    force = false,
  } = {}) {
    const id = normalizeActorProfileId(actorProfileId);
    const nextHP = normalizeHP(hp);
    const nextHPMax = normalizeHPMax(hpMax);
    if (!canWrite() || !id || nextHP === null || nextHPMax === null || stopped
      || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;

    const revisionNumber = sourceRevision === null || sourceRevision === undefined
      ? NaN
      : Number(sourceRevision);
    const previousSourceRevision = lastAcceptedSourceRevision.get(id);
    if (!force && Number.isFinite(revisionNumber)
      && previousSourceRevision !== undefined
      && revisionNumber < previousSourceRevision) {
      return latestRegistry;
    }
    if (Number.isFinite(revisionNumber)) lastAcceptedSourceRevision.set(id, revisionNumber);

    return writeRegistry((previous) => {
      const current = actorVitalsRecordFor(previous, id);
      if (!force && current
        && Number(current.hp) === nextHP
        && Number(current.hpMax) === nextHPMax) {
        return previous;
      }
      const next = upsertActorVitalsRecord(previous, id, nextHP, nextHPMax, { now });
      return next;
    }, { sceneEpoch, reason: "canonical-hp" });
  }

  async function reconcileSceneItems(
    items = [],
    sceneEpoch = getSceneEpoch(),
    options = {},
  ) {
    const { itemIds = null, baseline = itemIds === null } = options || {};
    const run = async () => {
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
      const sceneItems = sortItems(items);
      currentItems = sceneItems;
      if (baseline && Number(hydratedEpoch) !== Number(sceneEpoch)) {
        hydratedItems.clear();
      }
      const registry = await readRegistry();
      if (!canWrite() || stopped || !isSceneEpochCurrent(sceneEpoch)) return registry;
      const primaryByActor = primaryItemsByActor(sceneItems);
      const requestedItemIds = itemIds === null
        ? new Set(sceneItems.map((item) => itemId(item)))
        : new Set([...itemIds].map((id) => String(id)));
      const actorsToHydrate = new Set(
        sceneItems
          .filter((item) => requestedItemIds.has(itemId(item)))
          .map((item) => actorProfileIdFromItem(item))
          .filter(Boolean),
      );
      const initializations = [];

      for (const [actorProfileId, primary] of primaryByActor) {
        if (!actorsToHydrate.has(actorProfileId)) continue;
        const stored = actorVitalsRecordFor(registry, actorProfileId);
        if (!isValidActorVitalsRecord(stored)) {
          const hp = validCanonicalHP(primary);
          if (hp) initializations.push({ actorProfileId, ...hp });
        }
      }

      if (initializations.length) {
        const liveBeforeRegistryCommit = sortItems(await itemsApi.getItems());
        if (stopped || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
        currentItems = liveBeforeRegistryCommit;
        const livePrimaryByActor = primaryItemsByActor(liveBeforeRegistryCommit);
        initializations.splice(0, initializations.length, ...initializations.flatMap((initialization) => {
          const primary = livePrimaryByActor.get(initialization.actorProfileId);
          const hp = validCanonicalHP(primary);
          return hp ? [{ ...initialization, ...hp }] : [];
        }));
      }

      let nextRegistry = registry;
      for (const initialization of initializations) {
        nextRegistry = upsertActorVitalsRecord(
          nextRegistry,
          initialization.actorProfileId,
          initialization.hp,
          initialization.hpMax,
          { now },
        );
      }
      const restoreById = new Map();
      // Se più token condividono l'ID, il token primario deterministico è la
      // sola sorgente iniziale; tutti gli altri ricevono lo stesso snapshot.
      // Questo evita che un duplicato appena aggiunto vinca per ultimo e
      // riattivi un ciclo di scritture.
      for (const [actorProfileId] of primaryByActor) {
        if (!actorsToHydrate.has(actorProfileId)) continue;
        const stored = actorVitalsRecordFor(nextRegistry, actorProfileId);
        if (!stored) continue;
        const hp = normalizeHP(stored.hp);
        const hpMax = normalizeHPMax(stored.hpMax);
        if (hp === null || hpMax === null) continue;
        for (const item of sceneItems) {
          if (!requestedItemIds.has(itemId(item))) continue;
          if (actorProfileIdFromItem(item) !== actorProfileId) continue;
          const current = validCanonicalHP(item);
          if (!current || current.hp !== hp || current.hpMax !== hpMax) {
            restoreById.set(item.id, {
              actorProfileId,
              hp,
              hpMax,
              expected: current,
            });
          }
        }
      }
      if (initializations.length) {
        nextRegistry = await writeRegistry(nextRegistry, {
          sceneEpoch,
          reason: "initialize-from-token",
        });
      }
      if (!restoreById.size || stopped || !isSceneEpochCurrent(sceneEpoch)) {
        for (const item of sceneItems) {
          const actorProfileId = actorProfileIdFromItem(item);
          if (actorProfileId && requestedItemIds.has(itemId(item))) {
            hydratedItems.set(itemId(item), actorProfileId);
          }
        }
        if (baseline) hydratedEpoch = sceneEpoch;
        lastReconciledEpoch = sceneEpoch;
        return nextRegistry;
      }

      const liveItems = sortItems(await itemsApi.getItems());
      if (stopped || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
      currentItems = liveItems;
      const livePrimaryByActor = primaryItemsByActor(liveItems);
      const changedCanonicalByActor = new Map();
      const safeRestoreById = new Map();
      for (const [id, update] of restoreById) {
        const liveItem = liveItems.find((item) => itemId(item) === id);
        const liveHP = validCanonicalHP(liveItem);
        if (liveItem && sameCanonicalHP(liveHP, update.expected)) {
          safeRestoreById.set(id, update);
          continue;
        }
        if (liveItem
          && itemId(livePrimaryByActor.get(update.actorProfileId)) === id
          && liveHP) {
          changedCanonicalByActor.set(update.actorProfileId, liveHP);
        }
      }

      if (safeRestoreById.size) {
        await itemsApi.updateItems([...safeRestoreById.keys()], (drafts) => {
          if (stopped || !isSceneEpochCurrent(sceneEpoch)) return;
          for (const item of drafts) {
            const update = safeRestoreById.get(item.id);
            if (!update) continue;
            const current = validCanonicalHP(item);
            if (!sameCanonicalHP(current, update.expected)) {
              if (itemId(livePrimaryByActor.get(update.actorProfileId)) === itemId(item)
                && current) {
                changedCanonicalByActor.set(update.actorProfileId, current);
              }
              continue;
            }
            item.metadata = metadataWithCanonicalHP(item, update.hp, update.hpMax);
          }
        });
      }
      for (const [actorProfileId, hp] of changedCanonicalByActor) {
        await saveCanonicalHP(actorProfileId, hp.hp, hp.hpMax, { sceneEpoch });
      }
      for (const item of sceneItems) {
        const actorProfileId = actorProfileIdFromItem(item);
        if (actorProfileId && requestedItemIds.has(itemId(item))) {
          hydratedItems.set(itemId(item), actorProfileId);
        }
      }
      if (baseline) hydratedEpoch = sceneEpoch;
      lastReconciledEpoch = sceneEpoch;
      return nextRegistry;
    };
    const result = reconcileQueue.then(run, run);
    reconcileQueue = result.catch(() => {});
    return result;
  }

  async function reconcileCurrentScene(sceneEpoch = getSceneEpoch()) {
    if (!canWrite() || !isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
    const items = await itemsApi.getItems();
    if (!isSceneEpochCurrent(sceneEpoch)) return latestRegistry;
    return reconcileSceneItems(items, sceneEpoch, { baseline: true });
  }

  async function handleItemEvent(event) {
    const sceneEpoch = event?.sceneEpoch ?? getSceneEpoch();
    if (stopped || !isSceneEpochCurrent(sceneEpoch)) return;
    const previousItems = currentItems;
    const previousById = new Map(previousItems.map((item) => [itemId(item), item]));
    const allItems = Array.isArray(event?.allItems) && event.allItems.length
      ? event.allItems
      : currentItems;
    currentItems = sortItems(allItems);
    if (!canWrite()) return;
    const primaryByActor = primaryItemsByActor(currentItems);
    const candidates = [
      ...(Array.isArray(event?.items) ? event.items : []),
      ...(Array.isArray(event?.removedItems) ? event.removedItems : []),
    ];
    const beforeById = new Map(
      (Array.isArray(event?.changedRecords) ? event.changedRecords : [])
        .map((record) => [
          itemId(record?.after?.item || record?.before?.item),
          record?.before?.item || null,
        ])
        .filter(([id]) => id),
    );
    const hydrationIds = new Set();
    if (Number(hydratedEpoch) === Number(sceneEpoch)) {
      for (const item of candidates) {
        const id = itemId(item);
        const actorProfileId = actorProfileIdFromItem(item);
        if (!id || !actorProfileId || hydratedItems.get(id) === actorProfileId) continue;
        const before = beforeById.get(id) ?? previousById.get(id) ?? null;
        const wasAdded = event?.flags?.added === true && !before;
        const wasLinked = !!before
          && actorProfileIdFromItem(before) !== actorProfileId;
        if (!wasAdded && !wasLinked) continue;
        hydrationIds.add(id);
        // Claim before the await so duplicate events cannot plan two hydrations.
        hydratedItems.set(id, actorProfileId);
      }
    }
    if (hydrationIds.size) {
      await reconcileSceneItems(currentItems, sceneEpoch, {
        itemIds: hydrationIds,
        baseline: false,
      });
    }
    const hydratedActors = new Set(
      [...hydrationIds]
        .map((id) => actorProfileIdFromItem(currentItems.find((item) => itemId(item) === id)))
        .filter(Boolean),
    );
    const seen = new Set();
    for (const item of candidates) {
      const actorProfileId = actorProfileIdFromItem(item);
      if (!actorProfileId || seen.has(actorProfileId)) continue;
      seen.add(actorProfileId);
      if (hydratedActors.has(actorProfileId)) continue;
      const primary = primaryByActor.get(actorProfileId);
      if (primary && itemId(primary) !== itemId(item)) continue;
      const hp = validCanonicalHP(item);
      if (!hp) continue;
      await saveCanonicalHP(actorProfileId, hp.hp, hp.hpMax, {
        sceneEpoch,
        sourceRevision: event?.revision,
      });
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("actorVitals listener must be a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function start({ authority: requestedAuthority } = {}) {
    if (started) return latestRegistry;
    if (requestedAuthority !== undefined) {
      runtimeAuthority = normalizeAuthority(requestedAuthority);
    }
    started = true;
    stopped = false;
    if (typeof api?.onMetadataChange === "function") {
      roomUnsubscribe = api.onMetadataChange((metadata) => {
        if (stopped) return;
        const incoming = normalizeActorVitalsRegistry(metadata?.[roomKey]);
        const merged = mergeActorVitalsRegistries(getLocal(), incoming);
        latestRegistry = merged;
        emitChange("room-metadata", merged);
      });
    }
    const itemSource = subscribeItems || subscribeSceneItemChanges;
    if (typeof itemSource === "function") {
      itemUnsubscribe = itemSource(handleItemEvent, {
        domains: ["hp", "hp-memory", "hp-memory-autofill", "tracker"],
      });
    }
    const epochSource = subscribeEpoch || subscribeSceneEpoch;
    if (typeof epochSource === "function") {
      epochUnsubscribe = epochSource(({ phase, epoch }) => {
        if (phase === "unload") {
          currentItems = [];
          lastReconciledEpoch = null;
          hydratedEpoch = null;
          hydratedItems.clear();
          return;
        }
        if (!canWrite()) {
          void refresh("scene-ready").catch(() => {});
          return;
        }
        void reconcileCurrentScene(epoch).catch(() => {});
      });
    }
    if (typeof globalThis.addEventListener === "function") {
      const onStorage = (event) => {
        if (event?.key !== localKey || stopped) return;
        void refresh("local-storage").catch(() => {});
      };
      globalThis.addEventListener("storage", onStorage);
      storageUnsubscribe = () => globalThis.removeEventListener("storage", onStorage);
    }
    if (canWrite()) await reconcileCurrentScene(getSceneEpoch());
    else await refresh("player-start");
    return latestRegistry;
  }

  function stop() {
    stopped = true;
    started = false;
    roomUnsubscribe?.();
    itemUnsubscribe?.();
    epochUnsubscribe?.();
    storageUnsubscribe?.();
    roomUnsubscribe = null;
    itemUnsubscribe = null;
    epochUnsubscribe = null;
    storageUnsubscribe = null;
    currentItems = [];
    hydratedEpoch = null;
    hydratedItems.clear();
  }

  return {
    start,
    stop,
    subscribe,
    read: readRegistry,
    refresh,
    write: writeRegistry,
    saveCanonicalHP,
    reconcileSceneItems,
    reconcileCurrentScene,
    getSnapshot: () => clone(latestRegistry) || normalizeActorVitalsRegistry({}),
    getState: () => ({
      started,
      stopped,
      authority: runtimeAuthority,
      canWrite: canWrite(),
      lastReconciledEpoch,
      queuedWrites: queuedWriteCount,
    }),
  };
}

export const actorVitalsStore = createActorVitalsStore();

export async function startActorVitalsRuntime(options = {}) {
  return actorVitalsStore.start(options);
}

export function stopActorVitalsRuntime() {
  actorVitalsStore.stop();
}

export function subscribeActorVitals(listener) {
  return actorVitalsStore.subscribe(listener);
}

export async function saveActorCanonicalHP(actorProfileId, hp, hpMax, options = {}) {
  return actorVitalsStore.saveCanonicalHP(actorProfileId, hp, hpMax, options);
}

export async function reconcileActorVitalsScene(items, sceneEpoch = currentSceneEpoch()) {
  return actorVitalsStore.reconcileSceneItems(items, sceneEpoch);
}

export function actorVitalsFromToken(item) {
  const actorProfileId = actorProfileIdFromItem(item);
  const hp = validCanonicalHP(item);
  return actorProfileId && hp ? {
    actorProfileId,
    ...hp,
  } : null;
}
