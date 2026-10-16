// Cucitura del Non-Luogo / Cucitura Spezzata: the space of the seam is difficult terrain while the seam exists. Pure
// data for the speed check: the areas are rebuilt from the kept drawings that the boss records as the seam of the
// current round (a torn, undone or collapsed seam, or a stale drawing, is not terrain).
import { ID } from "./constants.js";
import { AOE_AREA_META_KEY } from "./aoeStyle.js";
import { buildArea } from "./aoeGeometryCore.js";

const META_KEY = `${ID}/meta`;
// The seam marker (BOSS_SEAM_ITEM_KEY of bossActionExecutionCore), repeated here so the speed check does not load
// the Boss Actions modules.
export const BOSS_SEAM_TERRAIN_ITEM_KEY = `${ID}/bossSeam`;
// Difficult terrain: every foot costs one extra foot.
export const BOSS_SEAM_TERRAIN_COST_MULTIPLIER = 2;

function point(value) {
  const x = Number(value?.x), y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// The kept area as the tool drew it, moved with its item (as the area tool reads it back).
function keptArea(item, metadata) {
  const start = point(metadata?.start), end = point(metadata?.end);
  if (!metadata?.type || !start || !end) return null;
  const position = point(item?.position) || { x: 0, y: 0 };
  const base = point(metadata.basePosition) || { x: 0, y: 0 };
  const translate = (entry) => ({ x: entry.x + position.x - base.x, y: entry.y + position.y - base.y });
  try {
    return buildArea(metadata.type, translate(start), translate(end), metadata.dpi, translate(point(metadata.gridOrigin) || start), {
      widthSquares: metadata.widthSquares, widthAnchor: metadata.widthAnchor });
  } catch {
    return null;
  }
}

// The items the terrain is read from: boss tokens that record a seam and the seam drawings.
export function bossSeamTerrainSourceItems(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => !!item?.metadata?.[META_KEY]?.bossActionState?.seam
    || (!!item?.metadata?.[BOSS_SEAM_TERRAIN_ITEM_KEY] && !!item?.metadata?.[AOE_AREA_META_KEY]));
}

export function activeBossSeamTerrainAreas(items = [], round) {
  if (!Number.isSafeInteger(round)) return [];
  const list = Array.isArray(items) ? items : [];
  const active = new Set();
  for (const item of list) {
    const seam = item?.metadata?.[META_KEY]?.bossActionState?.seam;
    if (!seam || seam.round !== round || !Array.isArray(seam.itemIds)) continue;
    for (const id of seam.itemIds) active.add(`${item.id}\n${id}`);
  }
  if (!active.size) return [];
  return list.flatMap((item) => {
    const marker = item?.metadata?.[BOSS_SEAM_TERRAIN_ITEM_KEY];
    const metadata = item?.metadata?.[AOE_AREA_META_KEY];
    // The filled area only: its outline and the portals carry the marker too, but no area.
    if (!marker || !metadata?.type || metadata.visual === "geometry" || !active.has(`${marker.sourceId}\n${item.id}`)) return [];
    const area = keptArea(item, metadata);
    return area?.cells?.length ? [{ id: item.id, sourceId: String(marker.sourceId), costMultiplier: BOSS_SEAM_TERRAIN_COST_MULTIPLIER,
      label: "Terreno Difficile (cucitura)", area: { cells: area.cells } }] : [];
  });
}
