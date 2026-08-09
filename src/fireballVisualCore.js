import { ID } from "./constants.js";

export const FIREBALL_VISUAL_CHANNEL = `${ID}/fireball-visual`;
export const FIREBALL_VISUAL_EVENT_TYPE = "fireball";
export const FIREBALL_LOCAL_ANIMATION_MS = 1200;
export const FIREBALL_WEBM_ANIMATION_MS = 4040;
export const FIREBALL_WEBM_EFFECT_DPI = 200;
export const FIREBALL_ASSET_BASE_URL = "https://jb2a-free.s3.eu-west-3.amazonaws.com";

const FIREBALL_BEAM_VARIANTS = Object.freeze([
  { distance: 200, width: 600, height: 400, suffix: "05ft_600x400" },
  { distance: 600, width: 1000, height: 400, suffix: "15ft_1000x400" },
  { distance: 1200, width: 1600, height: 400, suffix: "30ft_1600x400" },
  { distance: 2400, width: 2800, height: 400, suffix: "60ft_2800x400" },
  { distance: 3600, width: 4000, height: 400, suffix: "90ft_4000x400" },
]);

const FIREBALL_EXPLOSION_VARIANT = Object.freeze({
  distance: 800,
  width: 800,
  height: 800,
  suffix: "800x800",
});

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function distanceBetween(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function fireballAssetUrl(basename, suffix) {
  return `${FIREBALL_ASSET_BASE_URL}/3rd_Level/Fireball/${basename}_${suffix}.webm`;
}

function nearestBeamVariant(distanceInGridUnits) {
  const targetDistance = Math.max(0, Number(distanceInGridUnits) || 0) * FIREBALL_WEBM_EFFECT_DPI;
  return FIREBALL_BEAM_VARIANTS.reduce((closest, variant) => {
    const currentDistance = Math.abs(targetDistance - variant.distance);
    const closestDistance = Math.abs(targetDistance - closest.distance);
    return currentDistance < closestDistance ? variant : closest;
  });
}

export function fireballRadiusFromPreview(preview) {
  const explicitRadius = Number(preview?.radius);
  if (Number.isFinite(explicitRadius) && explicitRadius > 0) return explicitRadius;
  const center = finitePoint(preview?.start);
  const edge = finitePoint(preview?.end);
  if (!center || !edge) return null;
  const radius = distanceBetween(center, edge);
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

export function buildFireballVisualEvent({
  preview = null,
  casterId = "",
  eventId = "",
  source = null,
} = {}) {
  const center = finitePoint(preview?.start);
  const radius = fireballRadiusFromPreview(preview);
  const dpi = Math.max(1, Number(preview?.dpi) || 1);
  if (!center || radius == null) return null;

  const normalizedCasterId = String(casterId || "").trim();
  const normalizedEventId = String(eventId || "").trim();
  const normalizedSource = finitePoint(source);
  return {
    type: FIREBALL_VISUAL_EVENT_TYPE,
    ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
    center,
    radius,
    dpi,
    ...(normalizedCasterId ? { casterId: normalizedCasterId } : {}),
    ...(normalizedSource ? { source: normalizedSource } : {}),
  };
}

export function fireballVideoPlan(event) {
  const center = finitePoint(event?.center);
  const radius = Number(event?.radius);
  const sceneDpi = Number(event?.dpi);
  if (!center || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(sceneDpi) || sceneDpi <= 0) {
    return null;
  }

  const diameterInGridUnits = (radius * 2) / sceneDpi;
  const source = finitePoint(event?.source);
  const beamDistanceInGridUnits = source
    ? distanceBetween(source, center) / sceneDpi
    : 0;
  const beamVariant = beamDistanceInGridUnits > 0
    ? nearestBeamVariant(beamDistanceInGridUnits)
    : null;

  return {
    explosion: {
      url: fireballAssetUrl("FireballExplosion_01_Orange", FIREBALL_EXPLOSION_VARIANT.suffix),
      width: FIREBALL_EXPLOSION_VARIANT.width,
      height: FIREBALL_EXPLOSION_VARIANT.height,
      variantDistance: FIREBALL_EXPLOSION_VARIANT.distance,
      sizeInGridUnits: diameterInGridUnits,
      scale: diameterInGridUnits / (FIREBALL_EXPLOSION_VARIANT.distance / FIREBALL_WEBM_EFFECT_DPI),
      position: center,
      rotation: 0,
      offset: { x: 0.5, y: 0.5 },
    },
    beam: beamVariant
      ? {
        url: fireballAssetUrl("FireballBeam_01_Orange", beamVariant.suffix),
        width: beamVariant.width,
        height: beamVariant.height,
        variantDistance: beamVariant.distance,
        sizeInGridUnits: beamDistanceInGridUnits,
        scale: beamDistanceInGridUnits / (beamVariant.distance / FIREBALL_WEBM_EFFECT_DPI),
        position: source,
        rotation: Math.atan2(center.y - source.y, center.x - source.x) * (180 / Math.PI),
        offset: { x: 0.5, y: 0.5 },
      }
      : null,
    explosionDelay: beamVariant ? 3000 : 0,
    duration: FIREBALL_WEBM_ANIMATION_MS,
  };
}

export function fireballLocalVisualLayers(event) {
  const radius = Number(event?.radius);
  const dpi = Math.max(1, Number(event?.dpi) || 1);
  if (!Number.isFinite(radius) || radius <= 0) return null;

  return [
    {
      id: "shockwave",
      shape: "circle",
      radius: radius,
      fillColor: "#f97316",
      fillOpacity: 0.08,
      strokeColor: "#fb923c",
      strokeOpacity: 0.82,
      strokeWidth: Math.max(3, dpi * 0.06),
      zIndex: 0,
    },
    {
      id: "flame",
      shape: "blob",
      radius: radius * 0.84,
      fillColor: "#f97316",
      fillOpacity: 0.34,
      strokeColor: "#facc15",
      strokeOpacity: 0.9,
      strokeWidth: Math.max(2, dpi * 0.04),
      zIndex: 1,
    },
    {
      id: "core",
      shape: "blob",
      radius: radius * 0.5,
      fillColor: "#fff7ed",
      fillOpacity: 0.84,
      strokeColor: "#ffffff",
      strokeOpacity: 0.95,
      strokeWidth: Math.max(2, dpi * 0.022),
      zIndex: 2,
    },
    {
      id: "rays",
      shape: "rays",
      radius: radius * 0.98,
      fillColor: "#ffffff",
      fillOpacity: 0,
      strokeColor: "#fed7aa",
      strokeOpacity: 0.78,
      strokeWidth: Math.max(2, dpi * 0.032),
      zIndex: 3,
    },
  ];
}
