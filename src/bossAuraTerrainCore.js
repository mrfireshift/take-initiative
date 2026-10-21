// Primal Blizzard uses the same grid emanation as its aura membership. Pure read model:
// no movement state, token effects or scene metadata are written here.
import { ID } from "./constants.js";
import { BOSS_AURA_ID_PREFIX } from "./bossAuraCore.js";
import { collectActiveCustomAuras } from "./customAuraCore.js";
import { buildFootprintEmanationArea, gridFootprintCells } from "./aoeGeometryCore.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";

const META_KEY = `${ID}/meta`;

export function primalBlizzardTerrainSources(items = []) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return collectActiveCustomAuras(items, { metaKey: META_KEY })
    .filter((aura) => aura.id.startsWith(BOSS_AURA_ID_PREFIX) && aura.id.endsWith(":primal-blizzard") && aura.radiusMeters > 0)
    .map((aura) => ({ aura, source: byId.get(aura.sourceId) }));
}

export function primalBlizzardTerrainCenter(bounds) {
  const min = bounds?.min, max = bounds?.max;
  if (![min?.x, min?.y, max?.x, max?.y].every((value) => Number.isFinite(Number(value)))) return null;
  return { x: (Number(min.x) + Number(max.x)) / 2, y: (Number(min.y) + Number(max.y)) / 2 };
}

export function activePrimalBlizzardTerrainAreas({
  items = [], target = null, movementImmunities = [], boundsById = new Map(),
  dpi = 150, scale = { multiplier: 1.5, unit: "m" }, gridOrigins = new Map(),
} = {}) {
  const attitude = String(target?.metadata?.[META_KEY]?.attitude || "").toLowerCase();
  if (!["pc", "ally"].includes(attitude) || movementImmunities.includes("difficult-terrain")) return [];
  return primalBlizzardTerrainSources(items).flatMap(({ aura, source }) => {
    if (source.id === target.id) return [];
    const bounds = boundsById.get(source.id);
    const center = primalBlizzardTerrainCenter(bounds);
    const squares = spellAreaGridCells({ value: aura.radiusMeters, unit: "m" }, scale);
    if (!center || !squares) return [];
    const area = buildFootprintEmanationArea(center, gridFootprintCells(bounds, dpi), squares, dpi, gridOrigins.get(source.id) || center);
    return [{ id: aura.instanceId, sourceId: source.id, costMultiplier: 2, label: "Terreno Difficile (Primal Blizzard)", area }];
  });
}
