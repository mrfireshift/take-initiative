export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeElevation(value) {
  return Math.round(finiteNumber(value, 0) * 100) / 100;
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
  const sourceWidth = finiteNumber(item?.image?.width, finiteNumber(item?.width, safeDpi));
  const sourceHeight = finiteNumber(item?.image?.height, finiteNumber(item?.height, safeDpi));
  const scaleX = Math.abs(finiteNumber(item?.scale?.x, 1)) || 1;
  const scaleY = Math.abs(finiteNumber(item?.scale?.y, 1)) || 1;
  const widthCells = Math.max(1, Math.round(sourceWidth * scaleX / safeDpi));
  const heightCells = Math.max(1, Math.round(sourceHeight * scaleY / safeDpi));
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
