import OBR from "@owlbear-rodeo/sdk";
import { isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  EMBERS_EFFECT_CHANNEL,
  buildFireballEmbersMessage,
} from "./embersFireballCore.js";
import { embersItemGeometry } from "./embersGeometryCore.js";

const emittedFireballEvents = new Set();

function fireballEventKey(eventId) {
  const normalized = String(eventId || "").trim();
  return normalized ? `fireball:${normalized}` : "";
}

function markEvent(eventId) {
  const key = fireballEventKey(eventId);
  if (!key) return null;
  if (emittedFireballEvents.has(key)) return false;
  emittedFireballEvents.add(key);
  if (emittedFireballEvents.size > 256) {
    emittedFireballEvents.delete(emittedFireballEvents.values().next().value);
  }
  return true;
}

export async function getCasterCenter(casterId) {
  const normalizedCasterId = String(casterId || "").trim();
  if (!normalizedCasterId) return null;
  try {
    const [items, bounds, sceneDpi] = await Promise.all([
      OBR.scene.items.getItems([normalizedCasterId]).catch(() => []),
      OBR.scene.items.getItemBounds([normalizedCasterId]).catch(() => null),
      typeof OBR.scene.grid?.getDpi === "function"
        ? OBR.scene.grid.getDpi().catch(() => 150)
        : Promise.resolve(150),
    ]);
    return embersItemGeometry(items?.[0], bounds, sceneDpi)?.center || null;
  } catch {
    return null;
  }
}

export async function emitFireballVisual({
  preview = null,
  casterId = "",
  eventId = "",
  sceneEpoch = null,
} = {}) {
  if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) {
    return { sent: false, reason: "stale-scene-epoch" };
  }
  const eventMarked = markEvent(eventId);
  if (eventMarked === false) return { sent: false, reason: "duplicate" };

  try {
    const source = await getCasterCenter(casterId);
    if (sceneEpoch != null && !isCurrentSceneEpoch(sceneEpoch)) {
      if (eventMarked) emittedFireballEvents.delete(fireballEventKey(eventId));
      return { sent: false, reason: "stale-scene-epoch" };
    }
    const message = buildFireballEmbersMessage({
      preview,
      source,
      casterId,
    });
    if (!message) {
      if (eventMarked) emittedFireballEvents.delete(fireballEventKey(eventId));
      return { sent: false, reason: "invalid-preview" };
    }
    await OBR.broadcast.sendMessage(
      EMBERS_EFFECT_CHANNEL,
      message,
      { destination: "ALL" },
    );
    return { sent: true };
  } catch (error) {
    if (eventMarked) emittedFireballEvents.delete(fireballEventKey(eventId));
    console.warn("[embers] Fireball visual effect:", error?.message || error);
    return { sent: false, reason: "broadcast-failed", error };
  }
}
