export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeElevation(value) {
  return Math.round(finiteNumber(value, 0) * 100) / 100;
}

const DISTANCE_UNIT_METERS = Object.freeze({
  m: 1,
  meter: 1,
  meters: 1,
  metro: 1,
  metri: 1,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  centimetro: 0.01,
  centimetri: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  millimetro: 0.001,
  millimetri: 0.001,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  chilometro: 1000,
  chilometri: 1000,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144,
});

const GRID_DISTANCE_UNITS = new Set([
  "grid",
  "cell",
  "cells",
  "square",
  "squares",
  "casella",
  "caselle",
]);

function normalizedScaleSource(scale = {}) {
  return scale?.parsed && typeof scale.parsed === "object"
    ? scale.parsed
    : scale;
}

export function gridScaleParts(scale = {}) {
  const source = normalizedScaleSource(scale);
  const rawMultiplier = Number(source?.multiplier);
  const unit = String(source?.unit || "").trim().toLowerCase();
  return {
    multiplier: Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : null,
    unit,
    unitMeters: DISTANCE_UNIT_METERS[unit] || 1,
  };
}

/**
 * Converts an elevation amount into the numeric unit stored in meta.elevation.
 * A number without a unit is already in that canonical unit. Grid amounts use
 * the live OBR grid multiplier; physical units are converted through the live
 * grid unit without inventing a grid scale.
 */
export function elevationValueToCanonical(value, unit = "", scale = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return NaN;
  const requestedUnit = String(unit || "").trim().toLowerCase();
  if (!requestedUnit || requestedUnit === "native" || requestedUnit === "canonical") {
    return normalizeElevation(amount);
  }

  const { multiplier, unitMeters } = gridScaleParts(scale);
  if (GRID_DISTANCE_UNITS.has(requestedUnit)) {
    return Number.isFinite(multiplier)
      ? normalizeElevation(amount * multiplier)
      : NaN;
  }

  const requestedUnitMeters = DISTANCE_UNIT_METERS[requestedUnit];
  if (!Number.isFinite(requestedUnitMeters)) return NaN;
  return normalizeElevation(amount * requestedUnitMeters / unitMeters);
}

export function elevationInputToCanonical(input, scale = {}) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const value = Object.prototype.hasOwnProperty.call(input, "value")
      ? input.value
      : input.amount;
    if (value === undefined || value === null) return NaN;
    return elevationValueToCanonical(value, input.unit, scale);
  }
  return elevationValueToCanonical(input, "", scale);
}

export function planarDistance(from, to, dpi, gridMultiplier) {
  const safeDpi = Math.max(1, finiteNumber(dpi, 1));
  const scale = Math.max(0, finiteNumber(gridMultiplier, 1));
  const dx = finiteNumber(to?.x) - finiteNumber(from?.x);
  const dy = finiteNumber(to?.y) - finiteNumber(from?.y);
  return Math.hypot(dx, dy) / safeDpi * scale;
}

export function gridFootprintSize(item, dpi) {
  const safeDpi = Math.max(1, finiteNumber(dpi, 1));
  const imageDpi = Math.max(1, finiteNumber(item?.grid?.dpi, safeDpi));
  const sourceWidth = finiteNumber(item?.image?.width, finiteNumber(item?.width, safeDpi));
  const sourceHeight = finiteNumber(item?.image?.height, finiteNumber(item?.height, safeDpi));
  const scaleX = Math.abs(finiteNumber(item?.scale?.x, 1)) || 1;
  const scaleY = Math.abs(finiteNumber(item?.scale?.y, 1)) || 1;
  const widthCells = Math.max(1, Math.round(
    (sourceWidth / imageDpi) * scaleX,
  ));
  const heightCells = Math.max(1, Math.round(
    (sourceHeight / imageDpi) * scaleY,
  ));
  return {
    width: widthCells * safeDpi,
    height: heightCells * safeDpi,
  };
}

export function gridGeometryFromBounds(bounds, dpi) {
  const safeDpi = Math.max(1, finiteNumber(dpi, 1));
  const minX = finiteNumber(bounds?.min?.x);
  const minY = finiteNumber(bounds?.min?.y);
  const maxX = finiteNumber(bounds?.max?.x, minX + safeDpi);
  const maxY = finiteNumber(bounds?.max?.y, minY + safeDpi);
  const widthCells = Math.max(1, Math.round(Math.abs(maxX - minX) / safeDpi));
  const heightCells = Math.max(1, Math.round(Math.abs(maxY - minY) / safeDpi));
  return {
    position: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    },
    size: {
      width: widthCells * safeDpi,
      height: heightCells * safeDpi,
    },
  };
}

export function gridPlanarDistance(from, to, dpi, gridMultiplier, fromSize = {}, toSize = {}) {
  const safeDpi = Math.max(1, finiteNumber(dpi, 1));
  const scale = Math.max(0, finiteNumber(gridMultiplier, 1));
  const fromHalfSpanX = Math.max(0, (finiteNumber(fromSize?.width, safeDpi) / safeDpi - 1) / 2);
  const fromHalfSpanY = Math.max(0, (finiteNumber(fromSize?.height, safeDpi) / safeDpi - 1) / 2);
  const toHalfSpanX = Math.max(0, (finiteNumber(toSize?.width, safeDpi) / safeDpi - 1) / 2);
  const toHalfSpanY = Math.max(0, (finiteNumber(toSize?.height, safeDpi) / safeDpi - 1) / 2);
  const centerDx = Math.abs(finiteNumber(to?.x) - finiteNumber(from?.x)) / safeDpi;
  const centerDy = Math.abs(finiteNumber(to?.y) - finiteNumber(from?.y)) / safeDpi;
  const dxSquares = Math.max(0, centerDx - fromHalfSpanX - toHalfSpanX);
  const dySquares = Math.max(0, centerDy - fromHalfSpanY - toHalfSpanY);
  const squares = Math.max(dxSquares, dySquares);
  return { squares, distance: squares * scale };
}

export function spatialDistance(planar, fromElevation, toElevation) {
  const horizontal = Math.max(0, finiteNumber(planar));
  const vertical = Math.abs(normalizeElevation(toElevation) - normalizeElevation(fromElevation));
  return {
    horizontal,
    vertical,
    spatial: Math.hypot(horizontal, vertical),
  };
}

export function formatDistance(value, digits = 1) {
  const precision = Math.max(0, Math.min(3, Math.floor(finiteNumber(digits, 1))));
  return finiteNumber(value).toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}
