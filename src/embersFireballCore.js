import { fireballRadiusFromPreview } from "./fireballVisualCore.js";

export { fireballRadiusFromPreview } from "./fireballVisualCore.js";

export const EMBERS_EFFECT_CHANNEL = "eu.armindo.embers/effects";
export const EMBERS_EFFECT_METADATA_KEY = "eu.armindo.embers/effect-id";
export const FIREBALL_BEAM_EFFECT_ID = "fireball.beam";
export const FIREBALL_EXPLOSION_EFFECT_ID = "fireball.explosion";
export const FIREBALL_LOOP_EFFECT_ID = "fireball.loop";
export const FIREBALL_LOOP_NO_DEBRIS_EFFECT_ID = "fireball.loop_no_debris";
export const FIREBALL_EXPLOSION_DELAY_MS = 3000;

const EMBERS_FIREBALL_EFFECT_IDS = new Set([
  FIREBALL_BEAM_EFFECT_ID,
  FIREBALL_EXPLOSION_EFFECT_ID,
  FIREBALL_LOOP_EFFECT_ID,
  FIREBALL_LOOP_NO_DEBRIS_EFFECT_ID,
]);

export function isEmbersFireballItem(item) {
  return EMBERS_FIREBALL_EFFECT_IDS.has(
    String(item?.metadata?.[EMBERS_EFFECT_METADATA_KEY] || "").trim(),
  );
}

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function distanceBetween(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function fireballEmbersRadiusFromPreview(preview) {
  const radius = fireballRadiusFromPreview(preview);
  const dpi = Number(preview?.dpi);
  if (radius == null || !Number.isFinite(dpi) || dpi <= 0) return null;
  const radiusInGridUnits = radius / dpi;
  return Number.isFinite(radiusInGridUnits) && radiusInGridUnits > 0
    ? radiusInGridUnits
    : null;
}

export function fireballEmbersSizeFromPreview(preview) {
  const radius = fireballEmbersRadiusFromPreview(preview);
  return radius == null ? null : radius * 2;
}

export function buildFireballEmbersMessage({
  preview = null,
  source = null,
} = {}) {
  const center = finitePoint(preview?.start);
  const size = fireballEmbersSizeFromPreview(preview);
  if (!center || size == null) return null;

  const beamSource = finitePoint(source);
  const hasBeam = beamSource && distanceBetween(beamSource, center) > 0;
  const instructions = [];
  if (hasBeam) {
    instructions.push({
      type: "effect",
      id: FIREBALL_BEAM_EFFECT_ID,
      effectProperties: {
        copies: 1,
        source: beamSource,
        destination: center,
      },
    });
  }
  instructions.push({
    type: "effect",
    id: FIREBALL_EXPLOSION_EFFECT_ID,
    ...(hasBeam ? { delay: FIREBALL_EXPLOSION_DELAY_MS } : {}),
    effectProperties: {
      source: center,
      // Embers CIRCLE.size is the rendered diameter; the source radius is
      // kept in grid units and doubled only at this protocol boundary.
      size,
    },
  });

  // Questo è un protocollo one-shot: gli ID espliciti sopra descrivono già
  // interamente raggio ed esplosione. Non allegare `spellData`, che Embers può
  // interpretare come una spell attiva e proiettare nel proprio loop
  // persistente, fuori dal lifecycle posseduto da Take Initiative.
  return { instructions };
}
