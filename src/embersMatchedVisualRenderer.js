import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { isCurrentSceneEpoch } from "./sceneEpoch.js";
import { getCasterCenter } from "./embersBridge.js";
import { embersItemGeometry } from "./embersGeometryCore.js";
import {
  EMBERS_ASSET_BASE_URL,
  EMBERS_MATCHED_VISUAL_CHANNEL,
  EMBERS_MATCHED_VISUAL_EVENT_TYPE,
  buildMatchedVisualEvent,
  isMatchedClassFeatureVisual,
  isMatchedSpellVisualSpell,
  matchedVisualLayerPlan,
} from "./embersMatchedVisualCore.js";
import { CLASS_FEATURE_STATE_FIELD } from "./classFeatureCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectEmbersAnimationsEnabled } from "./options/optionsSelectors.js";

const LOCAL_META = "com.thebigpicture.initiative/embersMatchedVisual";
const LOCAL_NAME = "Effetto locale: Embers matched";
const MAX_RENDERED_EVENTS = 512;
const OUTRO_CROSSFADE_MS = 180;
const FALLBACK_FADE_OUTRO = Object.freeze({
  width: 400,
  height: 400,
  dpi: 100,
  duration: 4920,
  url: `${EMBERS_ASSET_BASE_URL}/Generic/Marker/MarkerLightOutro_01_Regular_Blue_400x400.webm`,
});
const renderedEvents = new Set();
const pendingTimers = new Set();
const activeLocalVideoIds = new Set();
const pendingLifecycleTimers = new Map();
const activeLifecycleVisuals = new Map();
const startedLifecycles = new Set();
const endedLifecycles = new Set();
const endedLifecycleTargets = new Map();
let unsubscribe = null;

async function animationsEnabled() {
  try {
    await startRuntimeOptions();
    return runtimeOptionsService.get(selectEmbersAnimationsEnabled) !== false;
  } catch {
    return true;
  }
}

function eventKey(eventId) {
  const normalized = String(eventId || "").trim();
  return normalized ? `embers-matched:${normalized}` : "";
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

function schedule(callback, delay = 0, lifecycleId = "") {
  const normalizedLifecycleId = String(lifecycleId || "").trim();
  const timer = setTimeout(() => {
    pendingTimers.delete(timer);
    if (normalizedLifecycleId) {
      const timers = pendingLifecycleTimers.get(normalizedLifecycleId);
      timers?.delete(timer);
      if (timers && !timers.size) pendingLifecycleTimers.delete(normalizedLifecycleId);
    }
    void callback();
  }, Math.max(0, Number(delay) || 0));
  pendingTimers.add(timer);
  if (normalizedLifecycleId) {
    const timers = pendingLifecycleTimers.get(normalizedLifecycleId) || new Set();
    timers.add(timer);
    pendingLifecycleTimers.set(normalizedLifecycleId, timers);
  }
  return timer;
}

function clearLifecycleTimers(lifecycleId) {
  const normalized = String(lifecycleId || "").trim();
  if (!normalized) return;
  const timers = pendingLifecycleTimers.get(normalized);
  if (!timers) return;
  for (const timer of timers) {
    clearTimeout(timer);
    pendingTimers.delete(timer);
  }
  pendingLifecycleTimers.delete(normalized);
}

function markEndedLifecycleTargets(lifecycleId, targetIds) {
  const normalizedLifecycleId = String(lifecycleId || "").trim();
  if (!normalizedLifecycleId) return;
  const normalizedTargets = normalizeIdList(targetIds);
  if (!normalizedTargets.length) {
    endedLifecycles.add(normalizedLifecycleId);
    return;
  }
  const targets = endedLifecycleTargets.get(normalizedLifecycleId) || new Set();
  for (const targetId of normalizedTargets) targets.add(targetId);
  endedLifecycleTargets.set(normalizedLifecycleId, targets);
}

function lifecycleTargetEnded(lifecycleId, layer, casterId) {
  const normalizedLifecycleId = String(lifecycleId || "").trim();
  if (!normalizedLifecycleId) return false;
  if (endedLifecycles.has(normalizedLifecycleId)) return true;
  const endedTargets = endedLifecycleTargets.get(normalizedLifecycleId);
  if (!endedTargets?.size) return false;
  const targetId = String(layer?.targetId || "").trim();
  if (targetId && endedTargets.has(targetId)) return true;
  const attachedTo = layer?.attachedTo === "caster"
    ? String(casterId || "").trim()
    : layer?.attachedTo === "target"
      ? String(layer?.targetId || "").trim()
      : "";
  if (attachedTo) return endedTargets.has(attachedTo);
  return String(layer?.anchor || "") === "caster"
    && endedTargets.has(String(casterId || "").trim());
}

function layerAttachmentId(event, layer) {
  if (event?.mode !== "start") return "";
  if (layer?.attachedTo === "caster") return String(event?.casterId || "").trim();
  if (layer?.attachedTo === "target") return String(layer?.targetId || "").trim();
  if (layer?.attachedTo === "zone") return String(event?.zoneId || "").trim();
  return "";
}

async function refreshAttachedPlan(event, layer, plan) {
  const attachmentId = layerAttachmentId(event, layer);
  if (!attachmentId) return plan;
  // Static spell zones store their geometry in path commands and use the
  // item's position as a translation delta. Keep the preview center as the
  // local item's initial pose; attachedTo then carries it with the zone root.
  if (layer?.attachedTo === "zone") return plan;
  const [geometry] = await readGeometry([attachmentId], event?.dpi || 1);
  return geometry?.center
    ? { ...plan, position: geometry.center }
    : plan;
}

function buildLocalVideoItem(event, layer, plan) {
  const image = buildImage(
    {
      width: plan.width,
      height: plan.height,
      url: plan.url,
      mime: "video/webm",
    },
    {
      dpi: layer.effect?.dpi || event.dpi || 1,
      offset: {
        x: plan.height * (plan.offset?.x || 0),
        y: plan.height * (plan.offset?.y || 0),
      },
    },
  );
  const attachedTo = layerAttachmentId(event, layer);
  const builder = image
    .scale({ x: plan.scale, y: plan.scale })
    .position(plan.position)
    .rotation(plan.rotation || 0)
    .disableHit(true)
    // Embers leaves duration:-1 attached loops unlocked. This is important
    // for OBR to keep the local item following its moving attachment.
    .locked(layer.persistent !== true)
    .layer(layer.layer || "ATTACHMENT")
    .disableAutoZIndex(true)
    .visible(true)
    .zIndex(900000 + (event.mode === "end" ? 1 : 0))
    .metadata({
      [LOCAL_META]: {
        version: 1,
        eventId: String(event.eventId || ""),
        lifecycleId: String(event.lifecycleId || ""),
        mode: String(event.mode || "start"),
        spellId: String(event.spellId || ""),
        effectId: String(layer.effectId || ""),
        targetId: String(layer.targetId || ""),
        anchor: String(layer.anchor || ""),
        casterId: String(event.casterId || ""),
        attachmentId: attachedTo,
      },
    })
    .name(LOCAL_NAME);
  // Embers applies attachedTo after position/scale/rotation. Keeping that
  // order lets OBR register the final pose and then bind it to the target.
  if (attachedTo) builder.attachedTo(attachedTo);
  return builder.build();
}

async function deleteLocalItem(itemId) {
  const normalized = String(itemId || "").trim();
  if (!normalized) return;
  activeLocalVideoIds.delete(normalized);
  for (const [lifecycleId, entries] of activeLifecycleVisuals) {
    const remaining = entries.filter((entry) => entry.itemId !== normalized);
    if (remaining.length) activeLifecycleVisuals.set(lifecycleId, remaining);
    else activeLifecycleVisuals.delete(lifecycleId);
  }
  await OBR.scene.local.deleteItems([normalized]).catch(() => {});
}

function matchesLifecycleStartItem(
  item,
  lifecycleId,
  targetFilter,
  partial,
  casterId,
) {
  const metadata = item?.metadata?.[LOCAL_META];
  if (
    String(metadata?.lifecycleId || "").trim() !== lifecycleId
    || String(metadata?.mode || "start") !== "start"
  ) return false;
  if (!partial || !targetFilter.size) return true;
  return targetFilter.has(String(metadata?.targetId || "").trim())
    || targetFilter.has(String(metadata?.attachmentId || "").trim())
    || targetFilter.has(String(metadata?.casterId || "").trim())
    || (
      String(metadata?.anchor || "") === "caster"
      && targetFilter.has(String(casterId || "").trim())
    );
}

function buildFallbackFadeItem(sourceItem, event, geometry) {
  const sceneDpi = Math.max(1, Number(event?.dpi) || 1);
  const sourceWidth = Math.max(
    sceneDpi,
    Number(geometry?.width) || Number(geometry?.diameter) || sceneDpi,
  );
  const sourceHeight = Math.max(
    sceneDpi,
    Number(geometry?.height) || Number(geometry?.diameter) || sceneDpi,
  );
  const fallbackWidth = FALLBACK_FADE_OUTRO.width / FALLBACK_FADE_OUTRO.dpi * sceneDpi;
  const fallbackHeight = FALLBACK_FADE_OUTRO.height / FALLBACK_FADE_OUTRO.dpi * sceneDpi;
  const scale = {
    x: sourceWidth / fallbackWidth,
    y: sourceHeight / fallbackHeight,
  };
  const sourceImageWidth = Number(sourceItem?.image?.width);
  const sourceImageHeight = Number(sourceItem?.image?.height);
  const sourceOffsetX = Number(sourceItem?.grid?.offset?.x);
  const sourceOffsetY = Number(sourceItem?.grid?.offset?.y);
  const offset = {
    x: Number.isFinite(sourceOffsetX) && sourceImageWidth > 0
      ? FALLBACK_FADE_OUTRO.width * sourceOffsetX / sourceImageWidth
      : FALLBACK_FADE_OUTRO.width / 2,
    y: Number.isFinite(sourceOffsetY) && sourceImageHeight > 0
      ? FALLBACK_FADE_OUTRO.height * sourceOffsetY / sourceImageHeight
      : FALLBACK_FADE_OUTRO.height / 2,
  };
  const sourceId = String(sourceItem?.id || "").trim();
  const attachedTo = String(sourceItem?.attachedTo || "").trim();
  const builder = buildImage(
    {
      width: FALLBACK_FADE_OUTRO.width,
      height: FALLBACK_FADE_OUTRO.height,
      url: FALLBACK_FADE_OUTRO.url,
      mime: "video/webm",
    },
    {
      dpi: FALLBACK_FADE_OUTRO.dpi,
      offset,
    },
  )
    // Keep both axes of the source item. A directional effect such as Gust
    // of Wind must not turn its long side into a circular outro diameter.
    .scale(scale)
    .position(geometry.center)
    .rotation(Number(sourceItem?.rotation) || 0)
    .disableHit(true)
    .locked(true)
    .layer("ATTACHMENT")
    .disableAutoZIndex(true)
    .visible(true)
    .zIndex(Math.max(900001, Number(sourceItem?.zIndex) || 0) + 1)
    .metadata({
      [LOCAL_META]: {
        version: 1,
        eventId: `${String(event?.eventId || "")}:fallback-fade:${sourceId}`,
        lifecycleId: String(event?.lifecycleId || ""),
        mode: "fallback-fade",
        spellId: String(event?.spellId || ""),
        effectId: "fallbackFadeOutro",
        targetId: String(sourceItem?.metadata?.[LOCAL_META]?.targetId || ""),
        anchor: String(sourceItem?.metadata?.[LOCAL_META]?.anchor || ""),
        casterId: String(event?.casterId || ""),
        attachmentId: attachedTo,
        sourceItemId: sourceId,
      },
    })
    .name(LOCAL_NAME);
  if (attachedTo) builder.attachedTo(attachedTo);
  return builder.build();
}

async function fadeLifecycleVisuals(
  lifecycleId,
  targetIds = [],
  partial = false,
  casterId = "",
  event = null,
) {
  const normalizedLifecycleId = String(lifecycleId || "").trim();
  if (!normalizedLifecycleId) return false;
  const targetFilter = new Set(normalizeIdList(targetIds));
  const sourceItems = await OBR.scene.local.getItems((item) => (
    matchesLifecycleStartItem(
      item,
      normalizedLifecycleId,
      targetFilter,
      partial,
      casterId,
    )
  )).catch(() => []);
  if (!sourceItems.length) return false;

  const existingFadeSources = new Set(
    (await OBR.scene.local.getItems((item) => {
      const metadata = item?.metadata?.[LOCAL_META];
      return String(metadata?.lifecycleId || "").trim() === normalizedLifecycleId
        && String(metadata?.mode || "").trim() === "fallback-fade";
    }).catch(() => []))
      .map((item) => String(item?.metadata?.[LOCAL_META]?.sourceItemId || "").trim())
      .filter(Boolean),
  );
  const fadeItems = [];
  for (const sourceItem of sourceItems) {
    if (existingFadeSources.has(String(sourceItem?.id || "").trim())) continue;
    const geometry = itemGeometry(sourceItem, null, event?.dpi || 1);
    if (!geometry?.center) continue;
    fadeItems.push(buildFallbackFadeItem(sourceItem, event, geometry));
  }
  if (!fadeItems.length) return false;

  try {
    await OBR.scene.local.addItems(fadeItems);
  } catch (error) {
    console.warn("[embers-matched] fallback fade:", error?.message || error);
    return false;
  }
  for (const item of fadeItems) {
    activeLocalVideoIds.add(item.id);
    schedule(
      () => deleteLocalItem(item.id),
      FALLBACK_FADE_OUTRO.duration,
      normalizedLifecycleId,
    );
  }
  return true;
}

async function renderLayer(event, layer) {
  if (!await animationsEnabled()) return false;
  const plan = matchedVisualLayerPlan(layer, event.dpi);
  if (!plan?.url || !plan.position) return false;
  const lifecycleId = String(event.lifecycleId || "").trim();
  if (event.mode === "start" && lifecycleId && lifecycleTargetEnded(lifecycleId, layer, event.casterId)) {
    return false;
  }
  const currentPlan = await refreshAttachedPlan(event, layer, plan);
  const item = buildLocalVideoItem(event, layer, currentPlan);
  try {
    await OBR.scene.local.addItems([item]);
    if (event.mode === "start" && lifecycleId && lifecycleTargetEnded(lifecycleId, layer, event.casterId)) {
      await OBR.scene.local.deleteItems([item.id]).catch(() => {});
      return false;
    }
    activeLocalVideoIds.add(item.id);
    if (event.mode === "start" && lifecycleId) {
      const entries = activeLifecycleVisuals.get(lifecycleId) || [];
      const attachmentId = layerAttachmentId(event, layer);
      entries.push({
        itemId: item.id,
        targetId: String(layer.targetId || "").trim(),
        anchor: String(layer.anchor || "").trim(),
        attachmentId,
      });
      activeLifecycleVisuals.set(lifecycleId, entries);
    }
    if (event.mode === "start" && layer.persistent === true && lifecycleId) {
      // Persistent WebM items stay until the lifecycle end event.
    } else {
      const rawDuration = Array.isArray(plan.duration) ? plan.duration[0] : plan.duration;
      schedule(
        () => deleteLocalItem(item.id),
        Math.max(250, Number(rawDuration) || 1000),
        lifecycleId,
      );
    }
    return true;
  } catch (error) {
    console.warn("[embers-matched] local WebM:", error?.message || error);
    return false;
  }
}

async function renderEvent(event) {
  if (!event || event.type !== EMBERS_MATCHED_VISUAL_EVENT_TYPE) return false;
  if (!markEvent(event.eventId)) return false;
  const lifecycleId = String(event.lifecycleId || "").trim();
  const layers = Array.isArray(event.layers) ? event.layers : [];
  if (
    event.mode === "start"
    && event.spellId === "gust-of-wind"
    && lifecycleId
    && layers.length > 0
  ) {
    if (startedLifecycles.has(lifecycleId)) return false;
    startedLifecycles.add(lifecycleId);
  }
  if (event.mode === "end") {
    if (lifecycleId) {
      if (event.partial === true) {
        markEndedLifecycleTargets(lifecycleId, event.targetIds);
      } else {
        endedLifecycles.add(lifecycleId);
        endedLifecycleTargets.delete(lifecycleId);
      }
    }
    clearLifecycleTimers(lifecycleId);
    const clear = () => clearLifecycleVisuals(
      lifecycleId,
      event.targetIds,
      event.partial === true,
      event.casterId,
    );
    if (layers.length > 0) {
      // Keep the outgoing loop and the catalog outro on screen together for
      // the crossfade window. The alpha-backed outro is above the loop;
      // removing the loop afterwards avoids a hard cut without relying on an
      // image opacity property unsupported by OBR's Image API.
      schedule(clear, OUTRO_CROSSFADE_MS, lifecycleId);
    } else {
      const faded = await fadeLifecycleVisuals(
        lifecycleId,
        event.targetIds,
        event.partial === true,
        event.casterId,
        event,
      );
      if (faded) schedule(clear, OUTRO_CROSSFADE_MS, lifecycleId);
      else await clear();
    }
  }
  for (const layer of layers) {
    schedule(() => renderLayer(event, layer), layer.delay, lifecycleId);
  }
  return layers.length > 0 || event.mode === "end";
}

async function clearLifecycleVisuals(
  lifecycleId,
  targetIds = [],
  partial = false,
  casterId = "",
) {
  const normalizedLifecycleId = String(lifecycleId || "").trim();
  if (!normalizedLifecycleId) return;
  const targetFilter = new Set(normalizeIdList(targetIds));
  const entries = activeLifecycleVisuals.get(normalizedLifecycleId) || [];
  const keep = [];
  const remove = [];
  for (const entry of entries) {
    const targetId = String(entry?.targetId || "").trim();
    const attachmentId = String(entry?.attachmentId || "").trim();
    const targetedRemoval = !partial
      || !targetFilter.size
      || (targetId && targetFilter.has(targetId))
      || (attachmentId && targetFilter.has(attachmentId))
      || (!targetId
        && String(entry?.anchor || "") === "caster"
        && targetFilter.has(String(casterId || "").trim()));
    if (targetedRemoval) remove.push(entry.itemId);
    else keep.push(entry);
  }
  if (keep.length) activeLifecycleVisuals.set(normalizedLifecycleId, keep);
  else activeLifecycleVisuals.delete(normalizedLifecycleId);
  if (!partial) startedLifecycles.delete(normalizedLifecycleId);
  const localItems = await OBR.scene.local.getItems((item) => {
    return matchesLifecycleStartItem(
      item,
      normalizedLifecycleId,
      targetFilter,
      partial,
      casterId,
    );
  }).catch(() => []);
  for (const item of localItems) {
    const itemId = String(item?.id || "").trim();
    if (itemId) remove.push(itemId);
  }
  const uniqueRemoveIds = [...new Set(remove)];
  if (uniqueRemoveIds.length) {
    await Promise.all(uniqueRemoveIds.map((itemId) => deleteLocalItem(itemId)));
  }
}

function normalizeIdList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}

function itemGeometry(item, bounds, sceneDpi) {
  return embersItemGeometry(item, bounds, sceneDpi);
}

async function readGeometry(ids, sceneDpi) {
  const normalizedIds = normalizeIdList(ids);
  if (!normalizedIds.length) return [];
  const items = await OBR.scene.items.getItems(normalizedIds).catch(() => []);
  const byId = new Map(items.map((item) => [item.id, item]));
  const entries = [];
  for (const id of normalizedIds) {
    const item = byId.get(id);
    if (!item) continue;
    const bounds = await OBR.scene.items.getItemBounds([id]).catch(() => null);
    const geometry = itemGeometry(item, bounds, sceneDpi);
    if (geometry) entries.push(geometry);
  }
  return entries;
}

function createEventId(spellId, eventId) {
  const normalized = String(eventId || "").trim();
  if (normalized) return normalized;
  return `embers-${String(spellId || "effect").trim()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function emitMatchedSpellVisual({
  spellId = "",
  casterId = "",
  targetIds = [],
  zoneId = "",
  preview = null,
  eventId = "",
  lifecycleId = "",
  mode = "start",
  partial = false,
  sceneEpoch = null,
} = {}) {
  const normalizedSpellId = String(spellId || "").trim();
  if (!isMatchedSpellVisualSpell(normalizedSpellId)) {
    return { sent: false, reason: "not-matched" };
  }
  if (normalizedSpellId === "fireball") {
    return { sent: false, reason: "fireball-owned-by-dedicated-renderer" };
  }
  return emitVisual({
    spellId: normalizedSpellId,
    casterId,
    targetIds,
    zoneId,
    preview,
    eventId,
    lifecycleId,
    mode,
    partial,
    sceneEpoch,
  });
}

export async function emitMatchedSpellVisualEnd({
  spellId = "",
  casterId = "",
  targetIds = [],
  eventId = "",
  lifecycleId = "",
  partial = false,
  sceneEpoch = null,
} = {}) {
  return emitMatchedSpellVisual({
    spellId,
    casterId,
    targetIds,
    eventId,
    lifecycleId,
    mode: "end",
    partial,
    sceneEpoch,
  });
}

export async function emitMatchedClassFeatureVisual({
  featureId = "",
  casterId = "",
  targetIds = [],
  eventId = "",
  lifecycleId = "",
  mode = "start",
  partial = false,
  sceneEpoch = null,
} = {}) {
  const normalizedFeatureId = String(featureId || "").trim();
  if (!isMatchedClassFeatureVisual(normalizedFeatureId)) {
    return { sent: false, reason: "not-matched" };
  }
  return emitVisual({
    spellId: normalizedFeatureId,
    casterId,
    targetIds,
    eventId,
    lifecycleId,
    mode,
    partial,
    sceneEpoch,
  });
}

export async function emitMatchedClassFeatureVisualEnd({
  featureId = "",
  casterId = "",
  targetIds = [],
  eventId = "",
  lifecycleId = "",
  partial = false,
  sceneEpoch = null,
} = {}) {
  return emitMatchedClassFeatureVisual({
    featureId,
    casterId,
    targetIds,
    eventId,
    lifecycleId,
    mode: "end",
    partial,
    sceneEpoch,
  });
}

async function emitVisual({
  spellId,
  casterId,
  targetIds,
  zoneId = "",
  preview,
  eventId,
  lifecycleId = "",
  mode = "start",
  partial = false,
  sceneEpoch,
}) {
  if (!await animationsEnabled()) {
    return { sent: false, reason: "disabled" };
  }
  if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) {
    return { sent: false, reason: "stale-scene-epoch" };
  }
  const resolvedEventId = createEventId(
    spellId,
    mode === "end" && lifecycleId ? `${eventId || lifecycleId}:end` : eventId,
  );
  const resolvedLifecycleId = String(
    lifecycleId || (mode === "start" ? resolvedEventId : ""),
  ).trim();
  const normalizedCasterId = String(casterId || "").trim();
  const normalizedTargetIds = normalizeIdList([
    ...targetIds,
    ...(Array.isArray(preview?.targetIds) ? preview.targetIds : []),
  ]);
  const [gridDpi, gridScaleValue] = await Promise.all([
    preview?.dpi
      ? Promise.resolve(preview.dpi)
      : OBR.scene.grid.getDpi().catch(() => 150),
    typeof OBR.scene.grid?.getScale === "function"
      ? OBR.scene.grid.getScale().catch(() => null)
      : Promise.resolve(null),
  ]);
  const sceneDpi = Math.max(1, Number(preview?.dpi) || Number(gridDpi) || 150);
  const parsedGridScale = gridScaleValue?.parsed || gridScaleValue || {};
  const gridScale = {
    multiplier: Number(parsedGridScale.multiplier) || 1.5,
    unit: String(parsedGridScale.unit || "m"),
  };
  const geometry = await readGeometry(
    normalizeIdList([normalizedCasterId, ...normalizedTargetIds]),
    sceneDpi,
  );
  const casterGeometry = geometry.find((entry) => entry.id === normalizedCasterId) || null;
  const caster = casterGeometry || (
    normalizedCasterId ? await getCasterCenter(normalizedCasterId) : null
  );
  const targetScope = new Set(normalizedTargetIds);
  const targets = geometry.filter((entry) => targetScope.has(entry.id));
  if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) {
    return { sent: false, reason: "stale-scene-epoch" };
  }
  const event = buildMatchedVisualEvent({
    spellId,
    eventId: resolvedEventId,
    casterId: normalizedCasterId,
    targetIds: normalizedTargetIds,
    zoneId,
    caster,
    targets,
    preview,
    sceneDpi,
    gridScale,
    mode,
    lifecycleId: resolvedLifecycleId,
  });
  if (!event) return { sent: false, reason: "invalid-geometry" };
  if (partial) event.partial = true;
  try {
    await OBR.broadcast.sendMessage(
      EMBERS_MATCHED_VISUAL_CHANNEL,
      event,
      { destination: "ALL" },
    );
    schedule(() => renderEvent(event), 0, event.lifecycleId);
    return { sent: true, eventId: event.eventId };
  } catch (error) {
    schedule(() => renderEvent(event), 0, event.lifecycleId);
    console.warn("[embers-matched] broadcast:", error?.message || error);
    return { sent: false, reason: "broadcast-failed", error };
  }
}

function listValue(value) {
  return Array.isArray(value) ? value : [];
}

function metadataValue(snapshot) {
  if (snapshot && typeof snapshot === "object" && snapshot.present === true) {
    return snapshot.value;
  }
  return snapshot;
}

function stateInstances(snapshot) {
  const value = metadataValue(snapshot);
  return listValue(value?.instances);
}

function concentrationEntries(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

function sameInstance(left, right) {
  const wanted = String(left?.instanceId || "").trim();
  return wanted && wanted === String(right?.instanceId || "").trim();
}

function addLifecycleEnd(map, {
  lifecycleId,
  spellId = "",
  featureId = "",
  casterId = "",
  targetIds = [],
  partial = true,
} = {}) {
  const normalizedLifecycleId = String(lifecycleId || "").trim();
  const normalizedSpellId = String(spellId || "").trim();
  const normalizedFeatureId = String(featureId || "").trim();
  if (!normalizedLifecycleId) return;
  if (normalizedSpellId && !isMatchedSpellVisualSpell(normalizedSpellId)) return;
  if (normalizedFeatureId && !isMatchedClassFeatureVisual(normalizedFeatureId)) return;
  if (!normalizedSpellId && !normalizedFeatureId) return;
  const key = `${normalizedFeatureId ? "feature" : "spell"}:${normalizedLifecycleId}`;
  const existing = map.get(key) || {
    lifecycleId: normalizedLifecycleId,
    spellId: normalizedSpellId,
    featureId: normalizedFeatureId,
    casterId: String(casterId || "").trim(),
    targetIds: new Set(),
    partial: true,
  };
  if (!existing.casterId && casterId) existing.casterId = String(casterId).trim();
  if (!existing.spellId && normalizedSpellId) existing.spellId = normalizedSpellId;
  if (!existing.featureId && normalizedFeatureId) existing.featureId = normalizedFeatureId;
  for (const targetId of normalizeIdList(targetIds)) existing.targetIds.add(targetId);
  // A full lifecycle end always wins over a target-scoped end accumulated
  // from another changed item in the same mutation.
  existing.partial = existing.partial && partial === true;
  map.set(key, existing);
}

function removedTargetIds(beforeTargets, afterTargets) {
  const after = new Set(normalizeIdList(afterTargets));
  return normalizeIdList(beforeTargets).filter((id) => !after.has(id));
}

export async function emitMatchedVisualEndsFromMutation(
  mutation,
  { sceneEpoch = null } = {},
) {
  if (String(mutation?.status || "") !== "applied") return { sent: 0 };
  const changes = Array.isArray(mutation?.changes)
    ? mutation.changes
    : Array.isArray(mutation?.plan?.changes)
      ? mutation.plan.changes
      : [];
  if (!changes.length) return { sent: 0 };
  const ends = new Map();
  for (const change of changes) {
    const itemId = String(change?.id || "").trim();
    const beforeSpells = listValue(change?.before?.spells);
    const afterSpells = listValue(change?.after?.spells);
    const afterSpellIds = new Set(
      afterSpells.map((spell) => String(spell?.instanceId || "").trim()).filter(Boolean),
    );
    for (const spell of beforeSpells) {
      const lifecycleId = String(spell?.instanceId || "").trim();
      if (!lifecycleId || afterSpellIds.has(lifecycleId)) continue;
      addLifecycleEnd(ends, {
        lifecycleId,
        spellId: spell?.spellId,
        casterId: spell?.casterId || itemId,
        targetIds: [itemId],
        partial: true,
      });
    }

    const beforeConcentrations = change?.before?.concentrations || {};
    const afterConcentrations = change?.after?.concentrations || {};
    for (const [key, beforeEntry] of concentrationEntries(beforeConcentrations)) {
      const lifecycleId = String(beforeEntry?.instanceId || "").trim();
      if (!lifecycleId) continue;
      const afterEntry = concentrationEntries(afterConcentrations)
        .map(([, value]) => value)
        .find((value) => sameInstance(beforeEntry, value));
      if (afterEntry) {
        const targets = removedTargetIds(beforeEntry?.targets, afterEntry?.targets);
        if (!targets.length) continue;
        addLifecycleEnd(ends, {
          lifecycleId,
          spellId: beforeEntry?.spellId,
          casterId: itemId,
          targetIds: targets,
          partial: true,
        });
        continue;
      }
      addLifecycleEnd(ends, {
        lifecycleId,
        spellId: beforeEntry?.spellId,
        casterId: itemId,
        targetIds: beforeEntry?.targets,
        partial: false,
      });
    }

    const beforeFeatures = stateInstances(change?.beforeMetadata?.[CLASS_FEATURE_STATE_FIELD]);
    const afterFeatures = stateInstances(change?.afterMetadata?.[CLASS_FEATURE_STATE_FIELD]);
    for (const feature of beforeFeatures) {
      const lifecycleId = String(feature?.instanceId || "").trim();
      const featureId = String(feature?.featureId || "").trim();
      if (!lifecycleId || !featureId) continue;
      const afterFeature = afterFeatures.find((entry) => sameInstance(feature, entry));
      if (afterFeature) {
        const targets = removedTargetIds(feature?.targetIds, afterFeature?.targetIds);
        if (!targets.length) continue;
        addLifecycleEnd(ends, {
          lifecycleId,
          featureId,
          casterId: itemId,
          targetIds: targets,
          partial: true,
        });
      } else {
        addLifecycleEnd(ends, {
          lifecycleId,
          featureId,
          casterId: itemId,
          targetIds: feature?.targetIds || [itemId],
          partial: false,
        });
      }
    }
  }

  const commandId = String(mutation?.commandId || "mutation").trim() || "mutation";
  const results = await Promise.all([...ends.values()].map((entry) => {
    const eventId = `${commandId}:visual-end:${entry.lifecycleId}`;
    const args = {
      casterId: entry.casterId,
      targetIds: [...entry.targetIds],
      eventId,
      lifecycleId: entry.lifecycleId,
      partial: entry.partial,
      sceneEpoch,
    };
    return entry.featureId
      ? emitMatchedClassFeatureVisualEnd({ featureId: entry.featureId, ...args })
      : emitMatchedSpellVisualEnd({ spellId: entry.spellId, ...args });
  }));
  return { sent: results.filter((result) => result?.sent).length };
}

export function mountEmbersMatchedVisualRenderer() {
  if (unsubscribe) return true;
  unsubscribe = OBR.broadcast.onMessage(EMBERS_MATCHED_VISUAL_CHANNEL, (event) => {
    const data = event?.data;
    schedule(() => renderEvent(data), 0, data?.lifecycleId);
  });
  return true;
}

export async function unmountEmbersMatchedVisualRenderer() {
  unsubscribe?.();
  unsubscribe = null;
  for (const timer of pendingTimers) clearTimeout(timer);
  pendingTimers.clear();
  pendingLifecycleTimers.clear();
  activeLifecycleVisuals.clear();
  startedLifecycles.clear();
  endedLifecycles.clear();
  endedLifecycleTargets.clear();
  const ids = [...activeLocalVideoIds];
  activeLocalVideoIds.clear();
  const ownedItems = await OBR.scene.local.getItems(
    (item) => !!item?.metadata?.[LOCAL_META],
  ).catch(() => []);
  const ownedIds = [...new Set([
    ...ids,
    ...ownedItems.map((item) => String(item?.id || "").trim()).filter(Boolean),
  ])];
  if (ownedIds.length) await OBR.scene.local.deleteItems(ownedIds).catch(() => {});
  renderedEvents.clear();
}
