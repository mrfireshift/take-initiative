import { areaHitsBounds, areaIntersectsSegment } from "./aoeGeometryCore.js";

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizedId(value) {
  return String(value || "").trim();
}

/**
 * The wall is the only spell that currently needs movement crossing to open
 * an explicit GM resolution. Keep the calculation local to this spell while
 * reusing the existing area geometry primitives.
 */
export function prismaticWallCrossingTargetIds({
  area = null,
  candidates = [],
  movementRecords = [],
  exemptCreatureIds = [],
} = {}) {
  if (!area) return [];
  const exempt = new Set(
    (Array.isArray(exemptCreatureIds) ? exemptCreatureIds : [])
      .map(normalizedId)
      .filter(Boolean),
  );
  const candidatesById = new Map(
    (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => [normalizedId(candidate?.item?.id || candidate?.id), candidate])
      .filter(([id]) => id),
  );
  const crossing = [];

  for (const record of Array.isArray(movementRecords) ? movementRecords : []) {
    const id = normalizedId(record?.id);
    if (!id || exempt.has(id)) continue;
    const candidate = candidatesById.get(id);
    if (!candidate?.bounds || !candidate.center) continue;
    const beforePosition = point(record.beforePosition);
    const afterPosition = point(record.afterPosition);
    if (!beforePosition || !afterPosition) continue;

    const delta = {
      x: afterPosition.x - beforePosition.x,
      y: afterPosition.y - beforePosition.y,
    };
    const beforeCenter = {
      x: candidate.center.x - delta.x,
      y: candidate.center.y - delta.y,
    };
    const beforeMin = point(candidate.bounds.min);
    const beforeMax = point(candidate.bounds.max);
    if (!beforeMin || !beforeMax) continue;
    const beforeBounds = {
      min: {
        x: beforeMin.x - delta.x,
        y: beforeMin.y - delta.y,
      },
      max: {
        x: beforeMax.x - delta.x,
        y: beforeMax.y - delta.y,
      },
    };
    if (areaHitsBounds(area, beforeBounds)) continue;
    if (areaIntersectsSegment(area, beforeCenter, candidate.center, candidate.bounds)) {
      crossing.push(id);
    }
  }

  return [...new Set(crossing)];
}
