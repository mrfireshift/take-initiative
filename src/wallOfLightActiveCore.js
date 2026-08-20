import { AOE_AREA_META_KEY } from "./aoeStyle.js";
import {
  spellAreaGridCells,
  spellAreaRangeCells,
} from "./spellAreaPlacementCore.js";

const EPSILON = 1e-9;

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function translatedPoint(value, delta) {
  const source = point(value);
  return source ? { x: source.x + delta.x, y: source.y + delta.y } : null;
}

function translatedAreaMetadata(zoneItem = null) {
  const metadata = zoneItem?.metadata?.[AOE_AREA_META_KEY];
  if (!metadata || metadata.type !== "line") return null;
  const position = point(zoneItem?.position) || { x: 0, y: 0 };
  const base = point(metadata.basePosition) || { x: 0, y: 0 };
  const delta = { x: position.x - base.x, y: position.y - base.y };
  const start = translatedPoint(metadata.start, delta);
  const end = translatedPoint(metadata.end, delta);
  const gridOrigin = translatedPoint(metadata.gridOrigin || metadata.start, delta);
  const dpi = Number(metadata.dpi);
  if (!start || !end || !gridOrigin || !Number.isFinite(dpi) || dpi <= 0) return null;
  return {
    type: "line",
    start,
    end,
    gridOrigin,
    dpi,
    widthSquares: Math.max(1, Math.round(Number(metadata.widthSquares) || 1)),
    ...(metadata.widthAnchor === "edge" ? { widthAnchor: "edge" } : {}),
  };
}

export function planWallOfLightShortening({
  zoneItem = null,
  scale = {},
  meters = 3,
  from = "end",
} = {}) {
  const geometry = translatedAreaMetadata(zoneItem);
  const consumeCells = spellAreaGridCells({ value: Number(meters), unit: "m" }, scale);
  if (!geometry || consumeCells <= 0 || !["start", "end"].includes(from)) {
    return { valid: false, errors: ["wall-of-light-geometry-invalid"] };
  }

  const raw = {
    x: geometry.end.x - geometry.start.x,
    y: geometry.end.y - geometry.start.y,
  };
  const rawLength = Math.hypot(raw.x, raw.y);
  const currentCells = Math.max(1, Math.round(rawLength / geometry.dpi));
  if (rawLength <= EPSILON) {
    return { valid: false, errors: ["wall-of-light-length-invalid"] };
  }
  if (currentCells <= consumeCells) {
    return {
      valid: true,
      endsSpell: true,
      currentCells,
      consumeCells,
      remainingCells: 0,
      preview: null,
    };
  }

  const direction = { x: raw.x / rawLength, y: raw.y / rawLength };
  const remainingCells = currentCells - consumeCells;
  const remainingPixels = remainingCells * geometry.dpi;
  const start = from === "start"
    ? {
      x: geometry.end.x - direction.x * remainingPixels,
      y: geometry.end.y - direction.y * remainingPixels,
    }
    : geometry.start;
  const end = from === "end"
    ? {
      x: geometry.start.x + direction.x * remainingPixels,
      y: geometry.start.y + direction.y * remainingPixels,
    }
    : geometry.end;

  return {
    valid: true,
    endsSpell: false,
    currentCells,
    consumeCells,
    remainingCells,
    preview: {
      type: "line",
      start,
      end,
      gridOrigin: geometry.gridOrigin,
      dpi: geometry.dpi,
      widthSquares: geometry.widthSquares,
      ...(geometry.widthAnchor === "edge" ? { widthAnchor: "edge" } : {}),
    },
  };
}

function rectangleDistancePixels(cell, bounds) {
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  if (!cell || !min || !max) return Infinity;
  const cellMinX = Number(cell.x);
  const cellMinY = Number(cell.y);
  const cellMaxX = cellMinX + Number(cell.width);
  const cellMaxY = cellMinY + Number(cell.height);
  if (![cellMinX, cellMinY, cellMaxX, cellMaxY].every(Number.isFinite)) return Infinity;
  const dx = max.x < cellMinX
    ? cellMinX - max.x
    : min.x > cellMaxX
      ? min.x - cellMaxX
      : 0;
  const dy = max.y < cellMinY
    ? cellMinY - max.y
    : min.y > cellMaxY
      ? min.y - cellMaxY
      : 0;
  return Math.hypot(dx, dy);
}

export function wallOfLightTargetWithinRange({
  area = null,
  targetBounds = null,
  range = { value: 18, unit: "m" },
  dpi = 1,
  scale = {},
} = {}) {
  const cells = Array.isArray(area?.cells) ? area.cells : [];
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const rangeCells = spellAreaRangeCells(range, scale);
  if (!cells.length || !targetBounds || rangeCells <= 0) return false;
  const minimumPixels = cells.reduce(
    (minimum, cell) => Math.min(minimum, rectangleDistancePixels(cell, targetBounds)),
    Infinity,
  );
  return Number.isFinite(minimumPixels)
    && minimumPixels / safeDpi <= rangeCells + EPSILON;
}
