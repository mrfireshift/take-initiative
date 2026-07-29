import { ID } from "./constants.js";

export const SPELL_AREA_PLACEMENT_CHANNEL = `${ID}/spell-area-placement`;

const DEFAULT_METERS_PER_CELL = 1.5;
const UNIT_METERS = Object.freeze({
  m: 1,
  meter: 1,
  meters: 1,
  metro: 1,
  metri: 1,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  cm: 0.01,
  km: 1000,
});

function finitePoint(value, fallback = { x: 0, y: 0 }) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { ...fallback };
}

function gridMetersPerCell(scale = {}) {
  const multiplier = Number(scale?.multiplier);
  const unit = String(scale?.unit || "").trim().toLocaleLowerCase();
  const unitMeters = UNIT_METERS[unit];
  if (!Number.isFinite(multiplier) || multiplier <= 0 || !unitMeters) {
    return DEFAULT_METERS_PER_CELL;
  }
  return multiplier * unitMeters;
}

export function nearestGridCellCenter(rawPosition, cornerAnchor, dpi = 1) {
  const raw = finitePoint(rawPosition);
  const anchor = finitePoint(cornerAnchor);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const candidates = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      const position = {
        x: anchor.x + (x + 0.5) * safeDpi,
        y: anchor.y + (y + 0.5) * safeDpi,
      };
      candidates.push({
        position,
        distance: (position.x - raw.x) ** 2 + (position.y - raw.y) ** 2,
      });
    }
  }
  const nearest = candidates.reduce((best, candidate) =>
    !best || candidate.distance < best.distance ? candidate : best
  , null);
  return {
    position: nearest.position,
    gridOrigin: anchor,
  };
}

export function nearestGridCorner(rawPosition, cornerAnchor, dpi = 1) {
  const raw = finitePoint(rawPosition);
  const anchor = finitePoint(cornerAnchor);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const candidates = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      const position = {
        x: anchor.x + x * safeDpi,
        y: anchor.y + y * safeDpi,
      };
      candidates.push({
        position,
        distance: (position.x - raw.x) ** 2 + (position.y - raw.y) ** 2,
      });
    }
  }
  const nearest = candidates.reduce((best, candidate) =>
    !best || candidate.distance < best.distance ? candidate : best
  , null);
  return {
    position: nearest.position,
    gridOrigin: anchor,
  };
}

export function spellAreaOriginAdjacentToCaster({
  origin = null,
  casterBounds = null,
  dpi = 1,
} = {}) {
  if (!origin || !casterBounds?.min || !casterBounds?.max) return false;
  const point = finitePoint(origin);
  const min = finitePoint(casterBounds.min);
  const max = finitePoint(casterBounds.max);
  if (max.x < min.x || max.y < min.y) return false;

  const distanceX = point.x < min.x
    ? min.x - point.x
    : point.x > max.x
      ? point.x - max.x
      : 0;
  const distanceY = point.y < min.y
    ? min.y - point.y
    : point.y > max.y
      ? point.y - max.y
      : 0;
  const outsideCaster = distanceX > 1e-9 || distanceY > 1e-9;
  const adjacentThreshold = Math.max(1, Number(dpi) || 1) * 0.75;
  return outsideCaster
    && distanceX <= adjacentThreshold + 1e-9
    && distanceY <= adjacentThreshold + 1e-9;
}

export function spellAreaGridCells(measure, scale = {}) {
  const meters = Number(measure?.value);
  if (!Number.isFinite(meters) || meters <= 0 || measure?.unit !== "m") return 0;
  return Math.max(1, Math.round(meters / gridMetersPerCell(scale)));
}

export function constrainedSpellAreaEnd({
  shape = "circle",
  start = null,
  pointer = null,
  dpi = 1,
  sizeCells = 1,
} = {}) {
  const origin = finitePoint(start);
  const cursor = finitePoint(pointer, { x: origin.x + 1, y: origin.y });
  const extent = Math.max(1, Number(dpi) || 1)
    * Math.max(1, Math.round(Number(sizeCells) || 1));
  const raw = {
    x: cursor.x - origin.x,
    y: cursor.y - origin.y,
  };

  if (shape === "square") {
    return {
      x: origin.x + (raw.x < 0 ? -extent : extent),
      y: origin.y + (raw.y < 0 ? -extent : extent),
    };
  }
  if (shape === "cone") {
    const denominator = Math.max(Math.abs(raw.x), Math.abs(raw.y)) || 1;
    if (raw.x === 0 && raw.y === 0) {
      return { x: origin.x + extent, y: origin.y };
    }
    return {
      x: origin.x + raw.x * extent / denominator,
      y: origin.y + raw.y * extent / denominator,
    };
  }
  if (shape === "line") {
    const denominator = Math.hypot(raw.x, raw.y) || 1;
    if (raw.x === 0 && raw.y === 0) {
      return { x: origin.x + extent, y: origin.y };
    }
    return {
      x: origin.x + raw.x * extent / denominator,
      y: origin.y + raw.y * extent / denominator,
    };
  }
  return {
    x: origin.x + extent,
    y: origin.y,
  };
}

export function spellAreaOriginWithinRange({
  origin = null,
  casterOrigin = null,
  range = null,
  dpi = 1,
  scale = {},
} = {}) {
  if (!range) return true;
  const rangeMeters = Number(range?.value);
  if (!Number.isFinite(rangeMeters) || rangeMeters <= 0 || range?.unit !== "m") {
    return false;
  }
  if (!origin || !casterOrigin) return false;
  const point = finitePoint(origin);
  const caster = finitePoint(casterOrigin);
  const distanceCells = Math.hypot(point.x - caster.x, point.y - caster.y)
    / Math.max(1, Number(dpi) || 1);
  return distanceCells * gridMetersPerCell(scale) <= rangeMeters + 1e-9;
}

export function createSpellAreaPlacementSession({
  requestId = "",
  rule = null,
  casterId = "",
  previousToolId = "",
  previousModeId = "",
} = {}) {
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedCasterId = String(casterId || "").trim();
  if (!normalizedRequestId) throw new Error("placement-request-id-required");
  if (!String(rule?.id || "").trim()) throw new Error("placement-rule-required");
  if (!String(rule?.geometry?.shape || "").trim()) throw new Error("placement-shape-required");
  if (
    ["caster", "caster-adjacent"].includes(rule?.placement?.origin)
    && !normalizedCasterId
  ) {
    throw new Error("placement-caster-required");
  }
  return {
    requestId: normalizedRequestId,
    ruleId: rule.id,
    spellId: String(rule.spellId || ""),
    casterId: normalizedCasterId,
    shape: rule.geometry.shape,
    phase: "placing",
    previousTool: {
      id: String(previousToolId || ""),
      modeId: String(previousModeId || ""),
    },
    preview: null,
  };
}

export function reviewSpellAreaPlacement(session, preview) {
  if (!session || !["placing", "review"].includes(session.phase)) {
    throw new Error("placement-session-inactive");
  }
  if (!preview?.start || !preview?.end || !preview?.gridOrigin) {
    throw new Error("placement-preview-required");
  }
  return {
    ...session,
    phase: "review",
    preview: {
      type: String(preview.type || session.shape),
      start: finitePoint(preview.start),
      end: finitePoint(preview.end),
      gridOrigin: finitePoint(preview.gridOrigin),
      dpi: Math.max(1, Number(preview.dpi) || 1),
      targetIds: Array.from(new Set(
        (Array.isArray(preview.targetIds) ? preview.targetIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )),
    },
  };
}

export function completeSpellAreaPlacement(session, status, error = "") {
  if (!session || !["placing", "review"].includes(session.phase)) {
    throw new Error("placement-session-inactive");
  }
  if (!["confirmed", "cancelled", "error"].includes(status)) {
    throw new Error("placement-status-invalid");
  }
  if (status === "confirmed" && !session.preview) {
    throw new Error("placement-preview-required");
  }
  return {
    ...session,
    phase: status,
    ...(error ? { error: String(error) } : {}),
  };
}
