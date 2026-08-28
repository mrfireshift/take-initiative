import OBR, { buildImage, buildPath, Command } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  emitFireballVisual as emitEmbersFireballVisual,
  getCasterCenter,
} from "./embersBridge.js";
import { isEmbersFireballItem } from "./embersFireballCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch, subscribeSceneEpoch } from "./sceneEpoch.js";
import {
  FIREBALL_LOCAL_ANIMATION_MS,
  FIREBALL_WEBM_ANIMATION_MS,
  FIREBALL_WEBM_EFFECT_DPI,
  FIREBALL_VISUAL_CHANNEL,
  FIREBALL_VISUAL_EVENT_TYPE,
  buildFireballVisualEvent,
  fireballVideoPlan,
  fireballLocalVisualLayers,
} from "./fireballVisualCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectEmbersAnimationsEnabled } from "./options/optionsSelectors.js";

const FIREBALL_LOCAL_META = `${ID}/fireballVisual`;
const FIREBALL_LOCAL_NAME = "Effetto locale: Palla di Fuoco";
const FIREBALL_LOCAL_WEBM_NAME = "Effetto locale: Palla di Fuoco (JB2A)";
const FIREBALL_EMBERS_PROBE_DELAY_MS = 120;
const MAX_RENDERED_EVENTS = 256;
const TRANSIENT_CLEANUP_MARGIN_MS = 120;
const TRANSIENT_SWEEP_INTERVAL_MS = 1000;
const renderedEvents = new Set();
const pendingRenderTimers = new Set();
const activeLocalVideoIds = new Set();
const activeLocalPathIds = new Set();
const transientVisualExpiries = new Map();
const cleanupInFlight = new Set();
let unsubscribe = null;
let epochUnsubscribe = null;
let transientSweepTimer = null;
let rendererGeneration = 0;
let rendererMounted = false;

function resetFireballStateForSceneUnload({ preserveTransientCleanup = false } = {}) {
  rendererGeneration += 1;
  for (const timer of pendingRenderTimers) clearTimeout(timer);
  pendingRenderTimers.clear();
  activeLocalVideoIds.clear();
  activeLocalPathIds.clear();
  if (!preserveTransientCleanup) transientVisualExpiries.clear();
  renderedEvents.clear();
}

function setupFireballSceneEpochSubscription() {
  if (epochUnsubscribe) return;
  epochUnsubscribe = subscribeSceneEpoch((event) => {
    if (event?.phase === "unload") {
      resetFireballStateForSceneUnload();
    }
  });
}

async function animationsEnabled() {
  try {
    await startRuntimeOptions();
    return runtimeOptionsService.get(selectEmbersAnimationsEnabled) !== false;
  } catch {
    return true;
  }
}

function circleCommands(radius) {
  const handle = radius * 0.5522847498;
  return [
    [Command.MOVE, radius, 0],
    [Command.CUBIC, radius, handle, handle, radius, 0, radius],
    [Command.CUBIC, -handle, radius, -radius, handle, -radius, 0],
    [Command.CUBIC, -radius, -handle, -handle, -radius, 0, -radius],
    [Command.CUBIC, handle, -radius, radius, -handle, radius, 0],
    [Command.CLOSE],
  ];
}

function blobCommands(radius) {
  const pointCount = 14;
  const commands = [];
  for (let index = 0; index < pointCount; index += 1) {
    const angle = (Math.PI * 2 * index) / pointCount;
    const variation = 1
      + 0.1 * Math.sin(index * 2.3)
      + 0.06 * Math.cos(index * 4.1);
    const point = [
      Math.cos(angle) * radius * variation,
      Math.sin(angle) * radius * variation,
    ];
    commands.push(index === 0
      ? [Command.MOVE, point[0], point[1]]
      : [Command.LINE, point[0], point[1]]);
  }
  commands.push([Command.CLOSE]);
  return commands;
}

function rayCommands(radius) {
  const rayCount = 12;
  const commands = [];
  for (let index = 0; index < rayCount; index += 1) {
    const angle = (Math.PI * 2 * index) / rayCount;
    const innerRadius = radius * (0.56 + (index % 3) * 0.035);
    const outerRadius = radius * (0.88 + (index % 2) * 0.08);
    commands.push(
      [Command.MOVE, Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius],
      [Command.LINE, Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius],
    );
  }
  return commands;
}

function commandsForLayer(layer) {
  if (layer.shape === "blob") return blobCommands(layer.radius);
  if (layer.shape === "rays") return rayCommands(layer.radius);
  return circleCommands(layer.radius);
}

function eventKey(eventId) {
  const normalized = String(eventId || "").trim();
  return normalized ? `fireball:${normalized}` : "";
}

function markEvent(eventId) {
  const key = eventKey(eventId);
  if (!key) return true;
  if (renderedEvents.has(key)) return false;
  renderedEvents.add(key);
  if (renderedEvents.size > MAX_RENDERED_EVENTS) {
    renderedEvents.delete(renderedEvents.values().next().value);
  }
  return true;
}

function startTransientVisualSweeper() {
  if (transientSweepTimer != null) return;
  transientSweepTimer = setInterval(() => {
    void sweepExpiredTransientVisuals();
  }, TRANSIENT_SWEEP_INTERVAL_MS);
}

function stopTransientVisualSweeper() {
  if (transientSweepTimer == null) return;
  clearInterval(transientSweepTimer);
  transientSweepTimer = null;
}

function maybeStopTransientVisualSweeper() {
  if (rendererMounted || transientVisualExpiries.size > 0) return;
  stopTransientVisualSweeper();
}

function clearTrackedVideo(itemId) {
  const normalizedId = String(itemId || "").trim();
  if (!normalizedId) return;
  const record = transientVisualExpiries.get(normalizedId);
  if (record?.timer) {
    clearTimeout(record.timer);
    pendingRenderTimers.delete(record.timer);
  }
  transientVisualExpiries.delete(normalizedId);
  activeLocalVideoIds.delete(normalizedId);
}

function trackTransientVideo(item, duration, sceneEpoch = null) {
  const cleanupDelay = Math.max(250, Number(duration) || FIREBALL_WEBM_ANIMATION_MS);
  const effectiveDelay = Math.max(
    0,
    cleanupDelay - Math.min(TRANSIENT_CLEANUP_MARGIN_MS, cleanupDelay / 4),
  );
  const record = {
    expiresAt: Date.now() + effectiveDelay,
    sceneEpoch,
    timer: null,
  };
  transientVisualExpiries.set(item.id, record);
  startTransientVisualSweeper();
  record.timer = scheduleTracked(
    () => deleteLocalVideoItem(item.id, sceneEpoch),
    effectiveDelay,
  );
}

function buildLocalLayer(event, layer) {
  return buildPath()
    .commands(commandsForLayer(layer))
    .fillRule("evenodd")
    .fillColor(layer.fillColor)
    .fillOpacity(layer.fillOpacity)
    .strokeColor(layer.strokeColor)
    .strokeOpacity(layer.strokeOpacity)
    .strokeWidth(layer.strokeWidth)
    .position(event.center)
    .scale({ x: 0.35, y: 0.35 })
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .visible(true)
    .zIndex(900000 + layer.zIndex)
    .metadata({
      [FIREBALL_LOCAL_META]: {
        version: 1,
        eventId: String(event.eventId || ""),
        layer: layer.id,
      },
    })
    .name(FIREBALL_LOCAL_NAME)
    .build();
}

function buildLocalVideoItem(event, spec, layer) {
  return buildImage(
    {
      width: spec.width,
      height: spec.height,
      url: spec.url,
      mime: "video/webm",
    },
    {
      dpi: FIREBALL_WEBM_EFFECT_DPI,
      offset: {
        x: spec.height * spec.offset.x,
        y: spec.height * spec.offset.y,
      },
    },
  )
    .scale({ x: spec.scale, y: spec.scale })
    .position(spec.position)
    .rotation(spec.rotation)
    .disableHit(true)
    .locked(true)
    .layer("ATTACHMENT")
    .disableAutoZIndex(true)
    .visible(true)
    .zIndex(900000 + (layer === "beam" ? 0 : 1))
    .metadata({
      [FIREBALL_LOCAL_META]: {
        version: 2,
        eventId: String(event.eventId || ""),
        layer,
        renderer: "jb2a-webm",
      },
    })
    .name(FIREBALL_LOCAL_WEBM_NAME)
    .build();
}

function scheduleTracked(callback, delay) {
  let timer = null;
  timer = setTimeout(() => {
    pendingRenderTimers.delete(timer);
    void callback();
  }, delay);
  pendingRenderTimers.add(timer);
  return timer;
}

async function readEmbersFireballItemIds() {
  try {
    const items = await OBR.scene.local.getItems(isEmbersFireballItem);
    return items
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function hasFreshEmbersFireballItem(event) {
  const previousIds = new Set(
    (Array.isArray(event?.embersExistingItemIds) ? event.embersExistingItemIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const currentIds = await readEmbersFireballItemIds();
  return currentIds.some((id) => !previousIds.has(id));
}

function scheduleLocalFireballRender(event) {
  scheduleTracked(
    () => renderLocalFireball(event),
    FIREBALL_EMBERS_PROBE_DELAY_MS,
  );
}

async function updateLocalLayers(items, layers, scale, opacity) {
  await OBR.scene.local.updateItems(items, (draftItems) => {
    for (const draft of draftItems) {
      const layer = layers.find((entry) => entry.id === draft.metadata?.[FIREBALL_LOCAL_META]?.layer);
      if (!layer) continue;
      draft.scale = { x: scale, y: scale };
      draft.style.fillOpacity = layer.fillOpacity * opacity;
      draft.style.strokeOpacity = layer.strokeOpacity * opacity;
    }
  });
}

async function deleteLocalVideoItem(itemId, sceneEpoch = null) {
  const normalizedId = String(itemId || "").trim();
  if (!normalizedId) return true;
  const record = transientVisualExpiries.get(normalizedId);
  const targetEpoch = sceneEpoch ?? record?.sceneEpoch ?? null;
  if (targetEpoch != null && !isCurrentSceneEpoch(targetEpoch)) {
    clearTrackedVideo(normalizedId);
    return true;
  }
  if (cleanupInFlight.has(normalizedId)) return false;
  cleanupInFlight.add(normalizedId);
  try {
    await OBR.scene.local.deleteItems([normalizedId]);
  } catch (error) {
    cleanupInFlight.delete(normalizedId);
    if (targetEpoch != null && !isCurrentSceneEpoch(targetEpoch)) {
      clearTrackedVideo(normalizedId);
      return false;
    }
    const retryEpoch = targetEpoch ?? currentSceneEpoch();
    const retryRecord = transientVisualExpiries.get(normalizedId) || {};
    transientVisualExpiries.set(normalizedId, {
      ...retryRecord,
      expiresAt: Date.now() + TRANSIENT_SWEEP_INTERVAL_MS,
      sceneEpoch: retryEpoch,
    });
    startTransientVisualSweeper();
    console.warn("[fireball] local WebM cleanup:", error?.message || error);
    return false;
  }
  cleanupInFlight.delete(normalizedId);
  clearTrackedVideo(normalizedId);
  maybeStopTransientVisualSweeper();
  return true;
}

async function deleteLocalPathItems(itemIds, sceneEpoch = null) {
  const ids = (Array.isArray(itemIds) ? itemIds : [])
    .map((itemId) => String(itemId || "").trim())
    .filter(Boolean);
  for (const id of ids) activeLocalPathIds.delete(id);
  if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) return;
  if (ids.length) await OBR.scene.local.deleteItems(ids).catch(() => {});
}

async function addLocalVideoItem(
  item,
  duration,
  sceneEpoch = null,
  generation = rendererGeneration,
) {
  if (generation !== rendererGeneration) return false;
  if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) return false;
  await OBR.scene.local.addItems([item]);
  if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) return false;
  activeLocalVideoIds.add(item.id);
  trackTransientVideo(item, duration, sceneEpoch);
  if (generation !== rendererGeneration) {
    await deleteLocalVideoItem(item.id, sceneEpoch);
    return false;
  }
  return true;
}

async function renderLocalWebmFireball(event, plan, generation = rendererGeneration) {
  if (event?.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
  if (generation !== rendererGeneration) return false;
  const insertedItems = [];
  try {
    if (plan.beam) {
      const beam = buildLocalVideoItem(event, plan.beam, "beam");
      if (event?.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
      const added = await addLocalVideoItem(
        beam,
        plan.duration || FIREBALL_WEBM_ANIMATION_MS,
        event.sceneEpoch,
        generation,
      );
      if (!added || generation !== rendererGeneration) return false;
      if (event?.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
      insertedItems.push(beam);
    }

    const addExplosion = async () => {
      if (event?.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return;
      if (generation !== rendererGeneration) return;
      if (!await animationsEnabled()) return;
      if (event?.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return;
      if (generation !== rendererGeneration) return;
      const explosion = buildLocalVideoItem(event, plan.explosion, "explosion");
      try {
        await addLocalVideoItem(
          explosion,
          plan.duration || FIREBALL_WEBM_ANIMATION_MS,
          event.sceneEpoch,
          generation,
        );
      } catch (error) {
        console.warn("[fireball] local WebM explosion:", error?.message || error);
      }
    };

    if (plan.explosionDelay > 0) {
      scheduleTracked(addExplosion, plan.explosionDelay);
    } else {
      await addExplosion();
    }
    return true;
  } catch (error) {
    await Promise.all(insertedItems.map((item) => deleteLocalVideoItem(item.id, event?.sceneEpoch)));
    console.warn("[fireball] local WebM visual:", error?.message || error);
    return false;
  }
}

async function resolveLocalFireballSource(event) {
  if (event?.source) return event;
  const source = await getCasterCenter(event?.casterId);
  return source ? { ...event, source } : event;
}

async function hasValidFireballSceneAnchors(event) {
  const casterId = String(event?.casterId || "").trim();
  if (!casterId) return true;
  const items = await OBR.scene.items.getItems([casterId]).catch(() => []);
  return items.length > 0;
}

async function renderLocalFireball(event) {
  if (!event || event.type !== FIREBALL_VISUAL_EVENT_TYPE) return false;
  if (event.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
  const generation = rendererGeneration;
  if (!await animationsEnabled()) return false;
  if (event.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
  if (!markEvent(event.eventId)) return false;
  if (await hasFreshEmbersFireballItem(event)) return false;
  if (event.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
  if (!await hasValidFireballSceneAnchors(event)) return false;
  if (event.sceneEpoch != null && !isCurrentSceneEpoch(event.sceneEpoch)) return false;
  const localEvent = await resolveLocalFireballSource(event);
  if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) return false;
  const videoPlan = fireballVideoPlan(localEvent);
  if (videoPlan && await renderLocalWebmFireball(localEvent, videoPlan, generation)) return true;
  if (generation !== rendererGeneration) return false;

  const layers = fireballLocalVisualLayers(localEvent);
  if (!layers || !localEvent.center) return false;

  const items = layers.map((layer) => buildLocalLayer(localEvent, layer));
  const ids = items.map((item) => item.id);
  try {
    if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) return false;
    await OBR.scene.local.addItems(items);
    if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) return false;
    for (const id of ids) activeLocalPathIds.add(id);
    scheduleTracked(() => {
      if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) {
        for (const id of ids) activeLocalPathIds.delete(id);
        return;
      }
      void updateLocalLayers(items, layers, 1, 1).catch(() => {});
    }, 70);
    scheduleTracked(() => {
      if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) {
        for (const id of ids) activeLocalPathIds.delete(id);
        return;
      }
      void updateLocalLayers(items, layers, 1.08, 0.62).catch(() => {});
    }, Math.round(FIREBALL_LOCAL_ANIMATION_MS * 0.58));
    scheduleTracked(() => {
      void (async () => {
        if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) {
          for (const id of ids) activeLocalPathIds.delete(id);
          return;
        }
        await updateLocalLayers(items, layers, 1.12, 0).catch(() => {});
        if (localEvent?.sceneEpoch != null && !isCurrentSceneEpoch(localEvent.sceneEpoch)) {
          for (const id of ids) activeLocalPathIds.delete(id);
          return;
        }
        await deleteLocalPathItems(ids, localEvent.sceneEpoch);
      })();
    }, FIREBALL_LOCAL_ANIMATION_MS);
    return true;
  } catch (error) {
    await deleteLocalPathItems(ids, localEvent?.sceneEpoch);
    console.warn("[fireball] local visual:", error?.message || error);
    return false;
  }
}

export async function emitFireballVisual({
  preview = null,
  casterId = "",
  eventId = "",
  sceneEpoch = null,
} = {}) {
  const originEpoch = Number.isInteger(sceneEpoch) ? sceneEpoch : currentSceneEpoch();
  if (!await animationsEnabled()) {
    return { sent: false, reason: "disabled" };
  }
  if (!isCurrentSceneEpoch(originEpoch)) {
    return { sent: false, reason: "stale-scene-epoch" };
  }
  const [source, embersExistingItemIds] = await Promise.all([
    getCasterCenter(casterId),
    readEmbersFireballItemIds(),
  ]);
  if (!isCurrentSceneEpoch(originEpoch)) {
    return { sent: false, reason: "stale-scene-epoch" };
  }
  const event = buildFireballVisualEvent({
    preview,
    casterId,
    eventId,
    source,
    sceneEpoch: originEpoch,
  });
  if (!event) return { sent: false, reason: "invalid-preview" };

  // Embers resta un renderer opzionale: il suo broadcast parte in parallelo;
  // l'evento locale non deve aspettarlo per iniziare il raggio.
  void emitEmbersFireballVisual({
    preview,
    casterId,
    eventId,
    sceneEpoch: originEpoch,
  }).catch((error) => {
    console.warn("[fireball] optional Embers visual:", error?.message || error);
  });

  if (!isCurrentSceneEpoch(originEpoch)) {
    return { sent: false, reason: "stale-scene-epoch" };
  }

  try {
    const visualEvent = { ...event, embersExistingItemIds, sceneEpoch: originEpoch };
    await OBR.broadcast.sendMessage(
      FIREBALL_VISUAL_CHANNEL,
      visualEvent,
      { destination: "ALL" },
    );
    // ALL normalmente include il mittente, ma il render locale esplicito evita
    // di dipendere da questa semantica quando OBR consegna solo ai remoti.
    scheduleLocalFireballRender(visualEvent);
    return { sent: true, renderer: "embers-or-local", sceneEpoch: originEpoch };
  } catch (error) {
    scheduleLocalFireballRender({ ...event, embersExistingItemIds, sceneEpoch: originEpoch });
    console.warn("[fireball] local visual broadcast:", error?.message || error);
    return { sent: false, reason: "broadcast-failed", error, sceneEpoch: originEpoch };
  }
}

export function mountFireballVisualRenderer() {
  if (unsubscribe) return true;
  rendererMounted = true;
  startTransientVisualSweeper();
  setupFireballSceneEpochSubscription();
  unsubscribe = OBR.broadcast.onMessage(FIREBALL_VISUAL_CHANNEL, (event) => {
    const data = event?.data;
    if (!data) return;
    const localEpoch = currentSceneEpoch();
    if (!isCurrentSceneEpoch(localEpoch)) return;
    scheduleLocalFireballRender({ ...data, sceneEpoch: localEpoch });
  });
  return true;
}

export async function unmountFireballVisualRenderer() {
  const cleanupEpoch = currentSceneEpoch();
  const trackedVideoIds = [...activeLocalVideoIds];
  const trackedPathIds = [...activeLocalPathIds];
  unsubscribe?.();
  unsubscribe = null;
  epochUnsubscribe?.();
  epochUnsubscribe = null;
  rendererMounted = false;
  resetFireballStateForSceneUnload({ preserveTransientCleanup: true });
  const ownedItems = await OBR.scene.local.getItems(
    (item) => !!item?.metadata?.[FIREBALL_LOCAL_META],
  ).catch(() => []);
  const cleanupIds = [...new Set([
    ...trackedVideoIds,
    ...trackedPathIds,
    ...ownedItems.map((item) => String(item?.id || "").trim()).filter(Boolean),
  ])];
  for (const itemId of cleanupIds) {
    await deleteLocalVideoItem(itemId, cleanupEpoch);
  }
  maybeStopTransientVisualSweeper();
}

async function sweepExpiredTransientVisuals() {
  const now = Date.now();
  const expiredIds = [...transientVisualExpiries.entries()]
    .filter(([, record]) => Number(record?.expiresAt) <= now)
    .map(([itemId]) => itemId);
  for (const itemId of expiredIds) {
    await deleteLocalVideoItem(itemId);
  }
  maybeStopTransientVisualSweeper();
}
