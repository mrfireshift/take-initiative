import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  normalizeElevation,
  gridFootprintSize,
  gridGeometryFromBounds,
  gridPlanarDistance,
  spatialDistance,
} from "./distance3dCore.js";

export const DISTANCE_3D_POPOVER_ID = `${ID}/distance-3d-popover`;
export const DISTANCE_3D_CHANNEL = `${ID}/distance-3d-events`;
export const TOKEN_META_KEY = `${ID}/meta`;
export const ELEVATION_FIELD = "elevation";
export const CLIMBING_FIELD = "climbing";

export function readElevation(item) {
  return normalizeElevation(item?.metadata?.[TOKEN_META_KEY]?.[ELEVATION_FIELD]);
}

export function readClimbing(item) {
  return item?.metadata?.[TOKEN_META_KEY]?.[CLIMBING_FIELD] === true;
}

export async function writeElevation(itemId, elevation) {
  const value = normalizeElevation(elevation);
  await OBR.scene.items.updateItems([itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const tokenMeta = { ...(item.metadata?.[TOKEN_META_KEY] || {}) };
    tokenMeta[ELEVATION_FIELD] = value;
    item.metadata = {
      ...(item.metadata || {}),
      [TOKEN_META_KEY]: tokenMeta,
    };
  });
  return value;
}

export async function writeElevationForItems(itemIds, elevation, climbing) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  const value = normalizeElevation(elevation);
  if (!ids.length) return value;
  await OBR.scene.items.updateItems(ids, (items) => {
    for (const item of items) {
      const tokenMeta = { ...(item.metadata?.[TOKEN_META_KEY] || {}) };
      tokenMeta[ELEVATION_FIELD] = value;
      if (typeof climbing === "boolean") tokenMeta[CLIMBING_FIELD] = climbing;
      item.metadata = {
        ...(item.metadata || {}),
        [TOKEN_META_KEY]: tokenMeta,
      };
    }
  });
  return value;
}

export async function loadDistanceContext() {
  const [selection, dpi, scale] = await Promise.all([
    OBR.player.getSelection().catch(() => []),
    OBR.scene.grid.getDpi().catch(() => 1),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1, unit: "" } })),
  ]);
  const selectedIds = Array.isArray(selection) ? selection : [];
  const selectedSet = new Set(selectedIds);
  const items = selectedIds.length
    ? await OBR.scene.items.getItems((item) => selectedSet.has(item.id))
    : [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const orderedItems = selectedIds
    .map((id) => byId.get(id))
    .filter((item) => item?.layer === "CHARACTER" && !item.attachedTo);
  const boundsEntries = await Promise.all(orderedItems.map(async (item) => {
    try {
      return [item.id, await OBR.scene.items.getItemBounds([item.id])];
    } catch {
      return [item.id, null];
    }
  }));
  return {
    items: orderedItems,
    boundsById: new Map(boundsEntries),
    dpi: Math.max(1, Number(dpi) || 1),
    multiplier: Math.max(0, Number(scale?.parsed?.multiplier) || 1),
    unit: String(scale?.parsed?.unit || "").trim(),
    digits: Math.max(0, Math.min(3, Number(scale?.parsed?.digits) || 0)),
  };
}

export function measureItems(origin, target, context) {
  const geometry = (item) => {
    const bounds = context?.boundsById?.get?.(item?.id);
    if (bounds) return gridGeometryFromBounds(bounds, context?.dpi);
    return {
      position: item?.position,
      size: gridFootprintSize(item, context?.dpi),
    };
  };
  const originGeometry = geometry(origin);
  const targetGeometry = geometry(target);
  const planar = gridPlanarDistance(
    originGeometry.position,
    targetGeometry.position,
    context?.dpi,
    context?.multiplier,
    originGeometry.size,
    targetGeometry.size
  );
  return {
    ...spatialDistance(planar.distance, readElevation(origin), readElevation(target)),
    squares: planar.squares,
  };
}
