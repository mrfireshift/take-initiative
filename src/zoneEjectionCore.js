// CAP-CARRIAGE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md): where a creature goes when it leaves a zone that holds creatures.
// Watery Sphere (Xanathar): a creature that makes its save, or one too large to be held, goes to the nearest unoccupied
// space outside the sphere (decision SA-D1 of 12/11/2026); one that falls out because the sphere is full lands within
// 1.5 m of it, or at the nearest space beyond when there is no room that close (SA-D2). The nearest space is the one with
// the fewest squares to cross; among those as near, the one on the creature's side of the zone, then the shortest step.
// The creature's own choice the GM makes by dragging its token. Pure: the zone's cells, the creatures' bounds and the
// destinations are scene pixels.

const EPSILON = 1e-6;
// Squares searched around the creature: past them the GM places it.
export const ZONE_EJECTION_MAX_SQUARES = 8;
// A token whose picture spills a little over its squares does not take the next ones.
const OBSTACLE_TOLERANCE = 0.1;

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// A rectangle from OBR bounds ({ min, max }) or from a rectangle ({ x, y, width, height }).
export function zoneEjectionRect(value) {
  if (value?.min && value?.max) {
    const min = point(value.min);
    const max = point(value.max);
    if (!min || !max) return null;
    return {
      x: Math.min(min.x, max.x),
      y: Math.min(min.y, max.y),
      width: Math.abs(max.x - min.x),
      height: Math.abs(max.y - min.y),
    };
  }
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const height = Number(value?.height);
  return [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0
    ? { x, y, width, height }
    : null;
}

function overlaps(a, b) {
  return a.x + a.width > b.x + EPSILON
    && b.x + b.width > a.x + EPSILON
    && a.y + a.height > b.y + EPSILON
    && b.y + b.height > a.y + EPSILON;
}

function grown(rect, by) {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

function centre(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// The zone's squares (its own cells, aoeGeometryCore.js) and the grid they lie on: any of its corners is on the grid.
function zoneGrid(area) {
  const cells = (Array.isArray(area?.cells) ? area.cells : [])
    .map(zoneEjectionRect)
    .filter((cell) => cell && cell.width > EPSILON && cell.height > EPSILON);
  if (!cells.length) return null;
  const centres = cells.map(centre);
  return {
    size: cells[0].width,
    origin: { x: cells[0].x, y: cells[0].y },
    cells,
    centre: {
      x: centres.reduce((sum, entry) => sum + entry.x, 0) / centres.length,
      y: centres.reduce((sum, entry) => sum + entry.y, 0) / centres.length,
    },
  };
}

function nearer(candidate, best) {
  if (!best) return true;
  const tolerance = 1e-3;
  if (Math.abs(candidate.squares - best.squares) > tolerance) return candidate.squares < best.squares;
  if (Math.abs(candidate.side - best.side) > tolerance) return candidate.side > best.side;
  if (Math.abs(candidate.length - best.length) > tolerance) return candidate.length < best.length;
  if (candidate.dy !== best.dy) return candidate.dy < best.dy;
  return candidate.dx < best.dx;
}

// Where a creature goes, or null when there is no room within maxSquares. subject: { position, bounds }, the token now;
// obstacles: the bounds of the other creatures; reserved: the spaces given to others in the same command. withinSquares:
// how far from the zone it may land (1 for "within 1.5 m"), null for anywhere outside it. position keeps the token's
// own offset from its squares, so a token with an offset picture lands as it stood.
export function zoneEjectionDestination({
  area = null,
  subject = null,
  obstacles = [],
  reserved = [],
  withinSquares = null,
  maxSquares = ZONE_EJECTION_MAX_SQUARES,
} = {}) {
  const grid = zoneGrid(area);
  const rect = zoneEjectionRect(subject?.bounds);
  const position = point(subject?.position);
  if (!grid || !rect || !position || rect.width <= EPSILON || rect.height <= EPSILON) return null;
  const { size, origin } = grid;
  const across = Math.max(1, Math.round(rect.width / size));
  const down = Math.max(1, Math.round(rect.height / size));
  const from = centre(rect);
  // The squares the token stands on now (an unaligned token: the nearest ones).
  const column = Math.round((from.x - (across * size) / 2 - origin.x) / size);
  const row = Math.round((from.y - (down * size) / 2 - origin.y) / size);
  const shrink = size * OBSTACLE_TOLERANCE;
  const taken = [
    ...(Array.isArray(obstacles) ? obstacles : []).map(zoneEjectionRect)
      .filter((entry) => entry && entry.width > shrink * 2 && entry.height > shrink * 2)
      .map((entry) => grown(entry, -shrink)),
    ...(Array.isArray(reserved) ? reserved : []).map(zoneEjectionRect).filter(Boolean),
  ];
  const outward = { x: from.x - grid.centre.x, y: from.y - grid.centre.y };
  const outwardLength = Math.hypot(outward.x, outward.y);
  const within = withinSquares === null || withinSquares === undefined ? NaN : Number(withinSquares);
  const reach = Number.isFinite(within) && within >= 0 ? within * size : null;
  const limit = Math.max(1, Math.floor(Number(maxSquares) || ZONE_EJECTION_MAX_SQUARES));
  let best = null;
  for (let dy = -limit; dy <= limit; dy += 1) {
    for (let dx = -limit; dx <= limit; dx += 1) {
      const space = {
        x: origin.x + (column + dx) * size,
        y: origin.y + (row + dy) * size,
        width: across * size,
        height: down * size,
      };
      if (grid.cells.some((cell) => overlaps(cell, space))) continue;
      if (reach !== null && !grid.cells.some((cell) => overlaps(cell, grown(space, reach)))) continue;
      if (taken.some((entry) => overlaps(entry, space))) continue;
      const to = centre(space);
      const step = { x: to.x - from.x, y: to.y - from.y };
      const length = Math.hypot(step.x, step.y);
      const candidate = {
        space,
        dx,
        dy,
        squares: Math.max(Math.abs(step.x), Math.abs(step.y)) / size,
        side: outwardLength > EPSILON && length > EPSILON
          ? (step.x * outward.x + step.y * outward.y) / (length * outwardLength)
          : 0,
        length,
      };
      if (nearer(candidate, best)) best = candidate;
    }
  }
  if (!best) return null;
  const to = centre(best.space);
  return {
    position: { x: position.x + to.x - from.x, y: position.y + to.y - from.y },
    space: best.space,
    squares: Math.round(best.squares),
  };
}

// The destinations of several creatures put out in one command, one after the other: a space given is taken for the
// next. requests: [{ id, position, bounds, area, withinSquares }], those that must land close first; obstacles:
// [{ id, bounds }], the requests' own creatures left out (they are leaving). Each result: { id, position, space,
// squares, beyond } with beyond when a creature that should land within withinSquares had to land farther, or
// { id, position: null } when there is no room.
export function planZoneEjections({
  requests = [],
  obstacles = [],
  maxSquares = ZONE_EJECTION_MAX_SQUARES,
} = {}) {
  const list = (Array.isArray(requests) ? requests : []).filter((request) => String(request?.id || "").trim());
  const leaving = new Set(list.map((request) => String(request.id).trim()));
  const others = (Array.isArray(obstacles) ? obstacles : [])
    .filter((entry) => !leaving.has(String(entry?.id || "").trim()))
    .map((entry) => entry?.bounds)
    .filter(Boolean);
  const bounded = (request) => request.withinSquares !== null
    && request.withinSquares !== undefined
    && Number.isFinite(Number(request.withinSquares));
  const ordered = [...list.filter(bounded), ...list.filter((request) => !bounded(request))];
  const reserved = [];
  const results = [];
  for (const request of ordered) {
    const id = String(request.id).trim();
    const subject = { position: request.position, bounds: request.bounds };
    let destination = zoneEjectionDestination({
      area: request.area,
      subject,
      obstacles: others,
      reserved,
      withinSquares: bounded(request) ? Number(request.withinSquares) : null,
      maxSquares,
    });
    let beyond = false;
    if (!destination && bounded(request)) {
      destination = zoneEjectionDestination({ area: request.area, subject, obstacles: others, reserved, maxSquares });
      beyond = !!destination;
    }
    if (!destination) {
      results.push({ id, position: null });
      continue;
    }
    reserved.push(destination.space);
    results.push({ id, position: destination.position, space: destination.space, squares: destination.squares, beyond });
  }
  return results;
}
