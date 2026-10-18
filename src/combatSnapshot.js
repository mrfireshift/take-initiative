// Combat snapshot runtime: reads the scene once, never writes token or scene metadata.
// The only write is the optional Combat Log entry, local to this GM browser.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { appendCombatLogEvent } from "./combatLog.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  getClassFeatureDefinition,
  getClassFeatureResourcePool,
} from "./classFeatureCatalog.js";
import {
  buildCombatSnapshot,
  buildCombatSnapshotSvg,
  combatSnapshotBoardView,
  combatSnapshotLogEvent,
} from "./combatSnapshotCore.js";

const STATE_KEY = `${ID}/state`;
const MAX_CANVAS_SIDE = 4096;
const IMAGE_TIMEOUT_MS = 15000;

export async function captureCombatSnapshot({ sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return null;
  const [metadata, items, dpi, scale, type] = await Promise.all([
    OBR.scene.getMetadata(),
    OBR.scene.items.getItems(),
    OBR.scene.grid.getDpi().catch(() => null),
    OBR.scene.grid.getScale().catch(() => null),
    OBR.scene.grid.getType().catch(() => null),
  ]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return null;
  return buildCombatSnapshot({
    state: metadata?.[STATE_KEY] || {},
    items,
    grid: { dpi, scale, type },
    capturedAt: Date.now(),
    roomId: String(OBR.room.id || ""),
    featureLookup: getClassFeatureDefinition,
    poolLookup: getClassFeatureResourcePool,
  });
}

// Appends the snapshot to the active Combat Log; a disabled log simply records nothing.
export async function recordCombatSnapshotInLog(snapshot, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!snapshot) return [];
  return appendCombatLogEvent(combatSnapshotLogEvent(snapshot), { sceneEpoch });
}

function loadImage(src, { crossOrigin = false } = {}) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), IMAGE_TIMEOUT_MS);
    if (crossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = src;
  });
}

function canvasBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

/**
 * Rasterizes the schematic board. Map images are read with CORS: a host without
 * Access-Control-Allow-Origin makes the load fail, and the PNG is produced
 * without that background instead of a tainted canvas.
 * Returns { blob, backgrounds: { drawn, blocked } } or null when the canvas cannot export.
 */
export async function renderCombatSnapshotPng(snapshot) {
  if (!snapshot) return null;
  const view = combatSnapshotBoardView(snapshot);
  const pixelScale = Math.min(2, MAX_CANVAS_SIDE / Math.max(view.width, view.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(view.width * pixelScale));
  canvas.height = Math.max(1, Math.round(view.height * pixelScale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#1e293b";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const result = { drawn: 0, blocked: 0 };
  for (const background of snapshot.board?.backgrounds || []) {
    const image = await loadImage(background.url, { crossOrigin: true });
    if (!image) {
      result.blocked += 1;
      continue;
    }
    const k = view.dpi / background.imageDpi;
    context.save();
    context.setTransform(pixelScale, 0, 0, pixelScale, -view.minX * pixelScale, -view.minY * pixelScale);
    context.translate(background.position.x, background.position.y);
    context.rotate((background.rotation * Math.PI) / 180);
    context.scale(background.scale.x, background.scale.y);
    context.drawImage(
      image,
      -background.offset.x * k,
      -background.offset.y * k,
      background.width * k,
      background.height * k,
    );
    context.restore();
    result.drawn += 1;
  }

  const svg = buildCombatSnapshotSvg(snapshot, { includeBackground: false, baseFill: false });
  const overlay = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  if (!overlay) return null;
  context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  const blob = await canvasBlob(canvas);
  return blob ? { blob, backgrounds: result } : null;
}
