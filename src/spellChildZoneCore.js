import { ID } from "./constants.js";
import { areaContainsBounds } from "./aoeGeometryCore.js";

export const SPELL_CHILD_ZONE_SCHEMA_VERSION = 1;
export const SPELL_CHILD_ZONE_ROLE = "subzone";

const EPSILON = 1e-6;
const SPELL_STATIC_ZONE_META_KEY = `${ID}/spellStaticZone`;

const text = (value) => String(value || "").trim();

const point = (value) => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => text(value))
    .filter(Boolean),
));

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function areaPoints(area) {
  if (Array.isArray(area?.points) && area.points.length) {
    return area.points.map(point).filter(Boolean);
  }
  if (area?.type === "circle" && point(area.origin)) {
    const radius = Number(area.radius);
    if (Number.isFinite(radius) && radius > 0) {
      return [
        { x: area.origin.x + radius, y: area.origin.y },
        { x: area.origin.x - radius, y: area.origin.y },
        { x: area.origin.x, y: area.origin.y + radius },
        { x: area.origin.x, y: area.origin.y - radius },
      ];
    }
  }
  return [];
}

function segmentEndpoints(area) {
  const explicitStart = point(area?.centerlineStart);
  const explicitEnd = point(area?.centerlineEnd);
  if (explicitStart && explicitEnd) {
    return { start: explicitStart, end: explicitEnd };
  }
  const origin = point(area?.origin);
  const points = areaPoints(area);
  if (!origin || !points.length) return null;
  const farthest = points.reduce((result, candidate) => {
    if (!result || distance(origin, candidate) > result.distance) {
      return { point: candidate, distance: distance(origin, candidate) };
    }
    return result;
  }, null);
  return farthest ? { start: origin, end: farthest.point } : null;
}

function pointInCircle(area, candidate) {
  const origin = point(area?.origin);
  const value = point(candidate);
  const radius = Number(area?.radius);
  return !!origin
    && !!value
    && Number.isFinite(radius)
    && radius > 0
    && distance(origin, value) <= radius + EPSILON;
}

function pointInArea(area, candidate) {
  const value = point(candidate);
  if (!value || !area) return false;
  if (area.type === "circle") return pointInCircle(area, value);
  if (Array.isArray(area.points) && area.points.length >= 3) {
    const points = area.points.map(point).filter(Boolean);
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
      const current = points[index];
      const previousPoint = points[previous];
      const intersects = ((current.y > value.y) !== (previousPoint.y > value.y))
        && value.x < (previousPoint.x - current.x)
          * (value.y - current.y)
          / ((previousPoint.y - current.y) || EPSILON)
          + current.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }
  return Array.isArray(area.cells) && area.cells.some((cell) => {
    const x = Number(cell?.x);
    const y = Number(cell?.y);
    const width = Number(cell?.width);
    const height = Number(cell?.height);
    return [x, y, width, height].every(Number.isFinite)
      && value.x >= x - EPSILON
      && value.x <= x + width + EPSILON
      && value.y >= y - EPSILON
      && value.y <= y + height + EPSILON;
  });
}

function parentRadius(area) {
  const radius = Number(area?.radius);
  if (area?.type === "circle" && Number.isFinite(radius) && radius > 0) return radius;
  const points = areaPoints(area);
  const origin = point(area?.origin);
  if (!origin || !points.length) return 0;
  return Math.max(...points.map((candidate) => distance(origin, candidate)));
}

function segmentLength(segment) {
  return segment ? distance(segment.start, segment.end) : 0;
}

function crossesParentBoundary(parentArea, childArea) {
  const segment = segmentEndpoints(childArea);
  const origin = point(parentArea?.origin);
  const radius = parentRadius(parentArea);
  if (!segment || !origin || radius <= 0) return false;
  const length = segmentLength(segment);
  const tolerance = Math.max(1, Number(childArea?.dpi) || 1) * 1.25;
  const startDistance = distance(origin, segment.start);
  const endDistance = distance(origin, segment.end);
  if (
    startDistance > radius + tolerance
    || endDistance > radius + tolerance
    || startDistance < radius - tolerance
    || endDistance < radius - tolerance
  ) return false;
  if (length < radius * 0.25) return false;
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator > EPSILON
    ? Math.max(0, Math.min(1, ((origin.x - segment.start.x) * dx
      + (origin.y - segment.start.y) * dy) / denominator))
    : 0;
  const closest = {
    x: segment.start.x + t * dx,
    y: segment.start.y + t * dy,
  };
  return distance(origin, closest) < radius - EPSILON;
}

function cellCorners(cell) {
  const x = Number(cell?.x);
  const y = Number(cell?.y);
  const width = Number(cell?.width);
  const height = Number(cell?.height);
  if (![x, y, width, height].every(Number.isFinite)) return [];
  return [
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
  ];
}

function normalizedParentClip(parentArea) {
  const origin = point(parentArea?.origin);
  const radius = Number(parentArea?.radius);
  if (
    parentArea?.type !== "circle"
    || !origin
    || !Number.isFinite(radius)
    || radius <= 0
  ) return null;
  return { type: "circle", origin, radius };
}

export function clipChildZoneAreaToParent({
  parentArea = null,
  childArea = null,
} = {}) {
  const parentClip = normalizedParentClip(parentArea);
  if (!parentClip || !childArea || !Array.isArray(childArea.cells)) {
    return childArea;
  }
  return {
    ...childArea,
    cells: childArea.cells.filter((cell) => {
      const corners = cellCorners(cell);
      return corners.length === 4
        && corners.every((corner) => pointInArea(parentClip, corner));
    }),
    clippedToParent: true,
    parentClip,
  };
}

export function normalizeSpellChildZoneMetadata(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const output = {
    version: SPELL_CHILD_ZONE_SCHEMA_VERSION,
    role: SPELL_CHILD_ZONE_ROLE,
    parentZoneId: text(source.parentZoneId || source.parentId),
    parentInstanceId: text(source.parentInstanceId || source.instanceId),
    casterId: text(source.casterId),
    spellId: text(source.spellId),
    childKind: text(source.childKind),
    childIndex: Math.max(0, Math.floor(Number(source.childIndex) || 0)),
    activationId: text(source.activationId),
    sceneEpoch: Math.max(0, Math.floor(Number(source.sceneEpoch) || 0)),
    ...(text(source.ruleId) ? { ruleId: text(source.ruleId) } : {}),
    ...(text(source.variant) ? { variant: text(source.variant) } : {}),
    ...(text(source.ruleChoice || source.variant)
      ? { ruleChoice: text(source.ruleChoice || source.variant) }
      : {}),
    ...(source.geometry && typeof source.geometry === "object"
      ? { geometry: source.geometry }
      : {}),
    ...(source.style && typeof source.style === "object"
      ? { style: source.style }
      : {}),
    ...(source.depth && typeof source.depth === "object"
      ? { depth: source.depth }
      : {}),
    ...(Array.isArray(source.triggers) ? { triggers: source.triggers } : {}),
    ...(text(source.expiresTurnKey)
      ? { expiresTurnKey: text(source.expiresTurnKey) }
      : {}),
  };
  output.instanceId = output.parentInstanceId;
  output.parentId = output.parentZoneId;
  return output;
}

export function spellChildZoneMetadata({
  parentZoneId = "",
  parentInstanceId = "",
  casterId = "",
  spellId = "",
  childKind = "",
  childIndex = 0,
  activationId = "",
  sceneEpoch = 0,
  ruleId = "",
  variant = "",
  ruleChoice = "",
  geometry = null,
  style = null,
  depth = null,
  triggers = null,
  expiresTurnKey = "",
} = {}) {
  return normalizeSpellChildZoneMetadata({
    parentZoneId,
    parentInstanceId,
    casterId,
    spellId,
    childKind,
    childIndex,
    activationId,
    sceneEpoch,
    ruleId,
    variant,
    ruleChoice,
    geometry,
    style,
    depth,
    triggers,
    expiresTurnKey,
  });
}

export function isSpellChildZoneMetadata(value) {
  const metadata = normalizeSpellChildZoneMetadata(value);
  return metadata.role === SPELL_CHILD_ZONE_ROLE
    && !!metadata.parentZoneId
    && !!metadata.parentInstanceId
    && !!metadata.casterId
    && !!metadata.spellId
    && !!metadata.childKind
    && !!metadata.activationId;
}

export function childZoneItemsForParent(items = [], {
  parentZoneId = "",
  parentInstanceId = "",
  childKind = "",
} = {}) {
  const wantedParent = text(parentZoneId);
  const wantedInstance = text(parentInstanceId);
  const wantedKind = text(childKind);
  return (Array.isArray(items) ? items : []).filter((item) => {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    if (!isSpellChildZoneMetadata(metadata)) return false;
    return (!wantedParent || metadata.parentZoneId === wantedParent)
      && (!wantedInstance || metadata.parentInstanceId === wantedInstance)
      && (!wantedKind || metadata.childKind === wantedKind);
  });
}

export function childZoneActivationKey({
  parentInstanceId = "",
  childKind = "",
  activationId = "",
} = {}) {
  return [text(parentInstanceId), text(childKind), text(activationId)]
    .filter(Boolean)
    .join(":");
}

export function uniqueChildZoneTargetIds(targetIds = []) {
  return uniqueIds(targetIds);
}

export function validateChildZoneContainment({
  parentArea = null,
  childArea = null,
  childKind = "",
} = {}) {
  if (!parentArea || !childArea) return false;
  if (text(childKind) === "fissure") {
    const clipped = clipChildZoneAreaToParent({ parentArea, childArea });
    const cellsInside = Array.isArray(clipped?.cells)
      && clipped.cells.length > 0
      && clipped.cells.every((cell) => {
        const corners = cellCorners(cell);
        return corners.length === 4
          && corners.every((corner) => pointInArea(parentArea, corner));
      });
    return cellsInside && crossesParentBoundary(parentArea, childArea);
  }
  const points = areaPoints(childArea);
  if (childArea.type === "circle" && parentArea.type === "circle") {
    const childOrigin = point(childArea.origin);
    const parentOrigin = point(parentArea.origin);
    const childRadius = Number(childArea.radius);
    const parentRadiusValue = Number(parentArea.radius);
    return !!childOrigin
      && !!parentOrigin
      && Number.isFinite(childRadius)
      && Number.isFinite(parentRadiusValue)
      && distance(childOrigin, parentOrigin) + childRadius
        <= parentRadiusValue + EPSILON;
  }
  return points.length > 0 && points.every((candidate) => pointInArea(parentArea, candidate));
}

export function childZoneBoundsInsideParent({ parentArea, childBounds } = {}) {
  if (!parentArea || !childBounds) return false;
  return areaContainsBounds(parentArea, childBounds);
}
