// Cucitura del Non-Luogo: a void portal on the Props layer at each end of the seam. Pure data: the console builds
// the image items from these specs. The portals are attached to the seam drawing and carry its seam marker, so
// every path that removes the seam (redraw, Strappare, stale seams) removes them by the same id list.
import { BOSS_SEAM_ITEM_KEY } from "./bossActionExecutionCore.js";

export const BOSS_SEAM_PORTAL_ASSET = "/boss-seam-portal.webp";
// The asset is square, 1254 px.
export const BOSS_SEAM_PORTAL_PIXELS = 1254;
// Diameter on the map, in grid cells (10 ft).
export const BOSS_SEAM_PORTAL_CELLS = 2;

export function bossSeamPortalIds(itemId) {
  const id = String(itemId || "").trim();
  return id ? [`${id}-portal-start`, `${id}-portal-end`] : [];
}

// Every item of one seam drawing: the kept area, its outline and the two portals (at most 4, as the seam records).
export function bossSeamDrawingIds(itemId) {
  const id = String(itemId || "").trim();
  return id ? [id, `${id}-geometry`, ...bossSeamPortalIds(id)] : [];
}

function finitePoint(value) {
  const x = Number(value?.x), y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function bossSeamPortalSpecs({ itemId, sourceId, actionInstanceId, start, end, name = "Cucitura del Non-Luogo" } = {}) {
  const ids = bossSeamPortalIds(itemId);
  const points = [finitePoint(start), finitePoint(end)];
  if (ids.length !== 2 || !points[0] || !points[1] || !String(sourceId || "").trim()) return [];
  return ["start", "end"].map((side, index) => ({
    id: ids[index],
    attachedTo: String(itemId).trim(),
    position: points[index],
    name: `${String(name || "Cucitura").slice(0, 60)} · portale`,
    metadata: { [BOSS_SEAM_ITEM_KEY]: { sourceId: String(sourceId), actionInstanceId: String(actionInstanceId || ""), portal: side } },
  }));
}
