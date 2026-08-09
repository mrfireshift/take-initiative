function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boundsDiameter(bounds) {
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  if (!min || !max) return 0;
  return Math.max(Math.abs(max.x - min.x), Math.abs(max.y - min.y));
}

function boundsSize(bounds) {
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  if (!min || !max) return { width: 0, height: 0 };
  return {
    width: Math.abs(max.x - min.x),
    height: Math.abs(max.y - min.y),
  };
}

/**
 * Embers resolves token geometry from the scene item's logical position and
 * image/grid/scale data. Bounds are only a compatibility fallback: they are
 * affected by rotation and can therefore change the apparent target size.
 */
export function embersItemGeometry(item, bounds = null, sceneDpi = 1) {
  const safeSceneDpi = Number.isFinite(Number(sceneDpi)) && Number(sceneDpi) > 0
    ? Number(sceneDpi)
    : 1;
  const center = point(item?.position) || point(bounds?.center);
  if (!center) return null;

  const imageWidth = Number(item?.image?.width);
  const imageHeight = Number(item?.image?.height);
  const itemDpi = Number(item?.grid?.dpi);
  const scaleX = Number(item?.scale?.x);
  const scaleY = Number(item?.scale?.y);
  const scale = Math.max(
    Number.isFinite(scaleX) && Math.abs(scaleX) > 0 ? Math.abs(scaleX) : 1,
    Number.isFinite(scaleY) && Math.abs(scaleY) > 0 ? Math.abs(scaleY) : 1,
  );
  const resolvedScaleX = Number.isFinite(scaleX) && Math.abs(scaleX) > 0
    ? Math.abs(scaleX)
    : 1;
  const resolvedScaleY = Number.isFinite(scaleY) && Math.abs(scaleY) > 0
    ? Math.abs(scaleY)
    : 1;
  const fallbackSize = boundsSize(bounds);
  const width = imageWidth > 0 && itemDpi > 0
    ? (imageWidth / itemDpi) * resolvedScaleX * safeSceneDpi
    : fallbackSize.width;
  const height = imageHeight > 0 && itemDpi > 0
    ? (imageHeight / itemDpi) * resolvedScaleY * safeSceneDpi
    : fallbackSize.height;
  const sizeInGridUnits = imageWidth > 0
    && imageHeight > 0
    && itemDpi > 0
    ? (Math.max(imageWidth, imageHeight) / itemDpi) * scale
    : 0;
  const diameter = sizeInGridUnits > 0
    ? sizeInGridUnits * safeSceneDpi
    : boundsDiameter(bounds);

  return {
    id: item?.id,
    center,
    width: width > 0 ? width : diameter,
    height: height > 0 ? height : diameter,
    diameter: diameter > 0 ? diameter : safeSceneDpi,
  };
}
