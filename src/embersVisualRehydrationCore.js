// Rehydration of persistent Embers loops (Bless, Moonbeam…). The loops are OBR local items, so they
// vanish when the room closes or the scene changes; the spells stay active in the token metadata.
// Pure planning: which active lifecycles have a loop, and with which anchors and area geometry.
import { ID } from "./constants.js";
import { CLASS_FEATURE_STATE_FIELD, classFeatureRemainingRounds } from "./classFeatureCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONC_KEY = `${ID}/concentration`;
// Stored on the spell zone root at cast: the placement the loop was drawn from. A key of its own,
// so the zone code never rewrites or strips it.
export const EMBERS_ZONE_VISUAL_KEY = `${ID}/embersZoneVisual`;

const text = (value) => String(value || "").trim();
const finitePoint = (value) => (
  Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y))
    ? { x: Number(value.x), y: Number(value.y) }
    : null
);

// Only the geometry the visual core reads (see normalizedPreview), never target lists.
export function storableVisualPreview(preview) {
  const start = finitePoint(preview?.start);
  if (!start) return null;
  const result = { start };
  for (const key of ["end", "origin", "destination", "gridOrigin"]) {
    const point = finitePoint(preview?.[key]);
    if (point) result[key] = point;
  }
  for (const key of ["dpi", "radius", "widthSquares"]) {
    const number = Number(preview?.[key]);
    if (Number.isFinite(number) && number > 0) result[key] = number;
  }
  for (const key of ["type", "widthAnchor"]) {
    if (text(preview?.[key])) result[key] = text(preview[key]);
  }
  return result;
}

export function zoneVisualMetadata({ preview = null, placementChoice = "", zonePosition = null } = {}) {
  const stored = storableVisualPreview(preview);
  if (!stored) return null;
  return {
    version: 1,
    preview: stored,
    ...(text(placementChoice) ? { placementChoice: text(placementChoice) } : {}),
    ...(finitePoint(zonePosition) ? { zonePosition: finitePoint(zonePosition) } : {}),
  };
}

// A moved zone translates its path by its position: the loop follows by the same delta.
export function translatedVisualPreview(preview, delta) {
  const dx = Number(delta?.x) || 0;
  const dy = Number(delta?.y) || 0;
  if (!preview || (!dx && !dy)) return preview || null;
  const result = { ...preview };
  for (const key of ["start", "end", "origin", "destination"]) {
    if (result[key]) result[key] = { x: result[key].x + dx, y: result[key].y + dy };
  }
  return result;
}

function lifecycleEntry(map, lifecycleId, values) {
  const entry = map.get(lifecycleId) || { lifecycleId, spellId: "", featureId: "", casterId: "", targetIds: new Set(), zoneId: "", preview: null, placementChoice: "" };
  if (!entry.spellId && values.spellId) entry.spellId = values.spellId;
  if (!entry.featureId && values.featureId) entry.featureId = values.featureId;
  if (!entry.casterId && values.casterId) entry.casterId = values.casterId;
  for (const id of values.targetIds || []) if (text(id)) entry.targetIds.add(text(id));
  if (values.zoneId && !entry.zoneId) {
    entry.zoneId = values.zoneId;
    entry.preview = values.preview || null;
    entry.placementChoice = values.placementChoice || "";
  }
  map.set(lifecycleId, entry);
}

// Active spell and class-feature lifecycles with a matched visual, read from the scene items.
export function activeMatchedVisualLifecycles(items = [], {
  isSpellVisual = () => false,
  isFeatureVisual = () => false,
  currentRound = null,
  zoneMetaKey = "",
} = {}) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const itemId = text(item?.id);
    if (!itemId) continue;
    const meta = item.metadata?.[META_KEY] || {};
    for (const spell of Array.isArray(meta[SPELLS_KEY]) ? meta[SPELLS_KEY] : []) {
      const lifecycleId = text(spell?.instanceId);
      const spellId = text(spell?.spellId);
      if (!lifecycleId || !isSpellVisual(spellId)) continue;
      lifecycleEntry(map, lifecycleId, { spellId, casterId: text(spell.casterId) || itemId, targetIds: [itemId] });
    }
    const concentrations = meta[CONC_KEY] && typeof meta[CONC_KEY] === "object" ? Object.values(meta[CONC_KEY]) : [];
    for (const entry of concentrations) {
      const lifecycleId = text(entry?.instanceId);
      const spellId = text(entry?.spellId);
      if (!lifecycleId || !isSpellVisual(spellId)) continue;
      lifecycleEntry(map, lifecycleId, { spellId, casterId: itemId, targetIds: Array.isArray(entry.targets) ? entry.targets : [] });
    }
    const features = Array.isArray(meta[CLASS_FEATURE_STATE_FIELD]?.instances) ? meta[CLASS_FEATURE_STATE_FIELD].instances : [];
    for (const instance of features) {
      const lifecycleId = text(instance?.instanceId);
      const featureId = text(instance?.featureId);
      if (!lifecycleId || !isFeatureVisual(featureId)) continue;
      const remaining = currentRound == null ? null : classFeatureRemainingRounds(instance, currentRound);
      if (remaining !== null && remaining <= 0) continue;
      lifecycleEntry(map, lifecycleId, { featureId, casterId: itemId, targetIds: instance.targetIds || [itemId] });
    }
    const zone = zoneMetaKey ? item.metadata?.[zoneMetaKey] : null;
    if (zone && text(zone.role || "root") === "root" && text(zone.instanceId) && isSpellVisual(text(zone.spellId))) {
      const visual = item.metadata?.[EMBERS_ZONE_VISUAL_KEY];
      const stored = visual?.preview || null;
      const origin = finitePoint(visual?.zonePosition) || { x: 0, y: 0 };
      const current = finitePoint(item.position) || origin;
      lifecycleEntry(map, text(zone.instanceId), {
        spellId: text(zone.spellId),
        casterId: text(zone.casterId),
        zoneId: itemId,
        preview: stored ? translatedVisualPreview(stored, { x: current.x - origin.x, y: current.y - origin.y }) : null,
        placementChoice: text(visual?.placementChoice || zone.ruleChoice),
      });
    }
  }
  return [...map.values()].map((entry) => ({ ...entry, targetIds: [...entry.targetIds] }));
}

// Only the loops come back: no intro, no one-shot, no delay. A layer drawn at the placed area
// needs the stored placement; without it the loop would appear in the wrong place, so it is skipped.
export function rehydrationLayers(layers = [], { hasPreview = false } = {}) {
  return (Array.isArray(layers) ? layers : [])
    .filter((layer) => layer?.persistent === true && layer?.oneShot !== true)
    .filter((layer) => {
      const attachedToToken = layer.attachedTo === "caster" || layer.attachedTo === "target"
        || layer.anchor === "caster" || layer.anchor === "target";
      return attachedToToken || hasPreview;
    })
    .map((layer) => ({ ...layer, delay: 0 }));
}
