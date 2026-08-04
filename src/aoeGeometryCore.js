const EPSILON = 1e-6;
const CONE_MINIMUM_OVERLAP_RATIO = 0.15;

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 0, y: 0 };
}

function length(vector) {
  return Math.hypot(vector.x, vector.y);
}

function cellRect(origin, column, row, dpi) {
  return {
    x: origin.x + (column * dpi),
    y: origin.y + (row * dpi),
    width: dpi,
    height: dpi,
    column,
    row,
  };
}

function cellCenter(cell) {
  return { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
}

function clipPolygon(points, inside, intersection) {
  const output = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(intersection(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersection(previous, current));
    }
  }
  return output;
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function polygonCellOverlapArea(points, cell, boundaryEpsilon = EPSILON) {
  const minX = cell.x;
  const maxX = cell.x + cell.width;
  const minY = cell.y;
  const maxY = cell.y + cell.height;
  const verticalIntersection = (x) => (from, to) => {
    const delta = to.x - from.x;
    const ratio = Math.abs(delta) <= EPSILON ? 0 : (x - from.x) / delta;
    return { x, y: from.y + (to.y - from.y) * ratio };
  };
  const horizontalIntersection = (y) => (from, to) => {
    const delta = to.y - from.y;
    const ratio = Math.abs(delta) <= EPSILON ? 0 : (y - from.y) / delta;
    return { x: from.x + (to.x - from.x) * ratio, y };
  };
  let clipped = points;
  clipped = clipPolygon(clipped, (point) => point.x >= minX - boundaryEpsilon, verticalIntersection(minX));
  clipped = clipPolygon(clipped, (point) => point.x <= maxX + boundaryEpsilon, verticalIntersection(maxX));
  clipped = clipPolygon(clipped, (point) => point.y >= minY - boundaryEpsilon, horizontalIntersection(minY));
  clipped = clipPolygon(clipped, (point) => point.y <= maxY + boundaryEpsilon, horizontalIntersection(maxY));
  return polygonArea(clipped);
}

export function nearestGridSnap(rawPosition, cornerAnchor, dpi) {
  const raw = finitePoint(rawPosition);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const anchor = finitePoint(cornerAnchor);
  const candidates = [];
  const appendGrid = (kind, offset) => {
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        candidates.push({
          kind,
          position: {
            x: anchor.x + (x + offset) * safeDpi,
            y: anchor.y + (y + offset) * safeDpi,
          },
        });
      }
    }
  };
  appendGrid("corner", 0);
  appendGrid("center", 0.5);
  const nearest = candidates.reduce((result, candidate) => {
    const distance = (candidate.position.x - raw.x) ** 2 + (candidate.position.y - raw.y) ** 2;
    return !result || distance < result.distance ? { ...candidate, distance } : result;
  }, null);
  return { ...nearest, gridOrigin: anchor };
}

export function snappedAreaLength(start, end, dpi) {
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const a = finitePoint(start);
  const b = finitePoint(end);
  return Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / safeDpi));
}

export function buildCircleArea(start, end, dpi, gridOrigin = start) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const squares = snappedAreaLength(start, end, safeDpi);
  const radius = squares * safeDpi;
  const cells = [];
  for (let column = -squares - 1; column <= squares + 1; column += 1) {
    for (let row = -squares - 1; row <= squares + 1; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      const center = cellCenter(cell);
      if (Math.hypot(center.x - origin.x, center.y - origin.y) <= radius + EPSILON) cells.push(cell);
    }
  }
  return { type: "circle", origin, radius, squares, cells };
}

export function buildSquareArea(start, end, dpi, gridOrigin = start) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const pointer = finitePoint(end);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const delta = { x: pointer.x - origin.x, y: pointer.y - origin.y };
  const squares = Math.max(1, Math.round(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / safeDpi));
  const side = squares * safeDpi;
  const direction = {
    x: delta.x < 0 ? -1 : 1,
    y: delta.y < 0 ? -1 : 1,
  };
  const opposite = { x: origin.x + direction.x * side, y: origin.y + direction.y * side };
  const minX = Math.min(origin.x, opposite.x);
  const maxX = Math.max(origin.x, opposite.x);
  const minY = Math.min(origin.y, opposite.y);
  const maxY = Math.max(origin.y, opposite.y);
  const extent = squares + 2;
  const cells = [];
  for (let column = -extent; column <= extent; column += 1) {
    for (let row = -extent; row <= extent; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      const center = cellCenter(cell);
      const insideX = direction.x > 0
        ? center.x >= origin.x - EPSILON && center.x < opposite.x - EPSILON
        : center.x <= origin.x + EPSILON && center.x > opposite.x + EPSILON;
      const insideY = direction.y > 0
        ? center.y >= origin.y - EPSILON && center.y < opposite.y - EPSILON
        : center.y <= origin.y + EPSILON && center.y > opposite.y + EPSILON;
      if (insideX && insideY) cells.push(cell);
    }
  }
  return {
    type: "square",
    origin,
    squares,
    side,
    cells,
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  };
}

export function buildConeArea(start, end, dpi, gridOrigin = start) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const pointer = finitePoint(end);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const raw = { x: pointer.x - origin.x, y: pointer.y - origin.y };
  const squares = Math.max(1, Math.round(Math.max(Math.abs(raw.x), Math.abs(raw.y)) / safeDpi));
  const distance = squares * safeDpi;
  const rawLength = length(raw) || 1;
  const direction = { x: raw.x / rawLength, y: raw.y / rawLength };
  const perpendicular = { x: -direction.y, y: direction.x };
  const tip = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance };
  const halfWidth = distance / 2;
  const left = { x: tip.x + perpendicular.x * halfWidth, y: tip.y + perpendicular.y * halfWidth };
  const right = { x: tip.x - perpendicular.x * halfWidth, y: tip.y - perpendicular.y * halfWidth };
  const points = [origin, left, right];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const minColumn = Math.floor((minX - cellsOrigin.x) / safeDpi) - 1;
  const maxColumn = Math.ceil((maxX - cellsOrigin.x) / safeDpi) + 1;
  const minRow = Math.floor((minY - cellsOrigin.y) / safeDpi) - 1;
  const maxRow = Math.ceil((maxY - cellsOrigin.y) / safeDpi) + 1;
  const minimumOverlap = safeDpi * safeDpi * CONE_MINIMUM_OVERLAP_RATIO;
  const cells = [];
  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      if (polygonCellOverlapArea(points, cell, 0) > minimumOverlap) cells.push(cell);
    }
  }
  return { type: "cone", origin, squares, cells, points };
}

function directionIndex(from, to) {
  if (to.column > from.column) return 0;
  if (to.row > from.row) return 1;
  if (to.column < from.column) return 2;
  return 3;
}

function simplifyBoundaryLoop(points) {
  if (points.length < 3) return points;
  return points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y)
      !== (point.y - previous.y) * (next.x - point.x);
  });
}

export function buildCellBoundaryLoops(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return [];
  const occupied = new Set(cells.map((cell) => `${cell.column}:${cell.row}`));
  const edges = [];
  const append = (fromColumn, fromRow, toColumn, toRow) => edges.push({
    from: { column: fromColumn, row: fromRow },
    to: { column: toColumn, row: toRow },
    used: false,
  });
  for (const cell of cells) {
    const { column, row } = cell;
    if (!occupied.has(`${column}:${row - 1}`)) append(column, row, column + 1, row);
    if (!occupied.has(`${column + 1}:${row}`)) append(column + 1, row, column + 1, row + 1);
    if (!occupied.has(`${column}:${row + 1}`)) append(column + 1, row + 1, column, row + 1);
    if (!occupied.has(`${column - 1}:${row}`)) append(column, row + 1, column, row);
  }

  const outgoing = new Map();
  edges.forEach((edge, index) => {
    const key = `${edge.from.column}:${edge.from.row}`;
    const entries = outgoing.get(key) || [];
    entries.push(index);
    outgoing.set(key, entries);
  });
  const first = cells[0];
  const gridOrigin = {
    x: first.x - first.column * first.width,
    y: first.y - first.row * first.height,
  };
  const toWorld = (vertex) => ({
    x: gridOrigin.x + vertex.column * first.width,
    y: gridOrigin.y + vertex.row * first.height,
  });
  const loops = [];
  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (edges[startIndex].used) continue;
    const start = edges[startIndex].from;
    const vertices = [start];
    let currentIndex = startIndex;
    for (let guard = 0; guard <= edges.length; guard += 1) {
      const current = edges[currentIndex];
      current.used = true;
      const end = current.to;
      if (end.column === start.column && end.row === start.row) break;
      vertices.push(end);
      const candidates = (outgoing.get(`${end.column}:${end.row}`) || [])
        .filter((index) => !edges[index].used);
      if (!candidates.length) break;
      const incomingDirection = directionIndex(current.from, current.to);
      candidates.sort((a, b) => {
        const turnA = (directionIndex(edges[a].from, edges[a].to) - incomingDirection + 4) % 4;
        const turnB = (directionIndex(edges[b].from, edges[b].to) - incomingDirection + 4) % 4;
        const priority = (turn) => [1, 0, 3, 2].indexOf(turn);
        return priority(turnA) - priority(turnB);
      });
      currentIndex = candidates[0];
    }
    if (vertices.length >= 3) loops.push(simplifyBoundaryLoop(vertices.map(toWorld)));
  }
  return loops;
}

export function buildLineArea(start, end, dpi, gridOrigin = start) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const pointer = finitePoint(end);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const squares = snappedAreaLength(start, end, safeDpi);
  const distance = squares * safeDpi;
  const raw = { x: pointer.x - origin.x, y: pointer.y - origin.y };
  const rawLength = length(raw) || 1;
  const direction = { x: raw.x / rawLength, y: raw.y / rawLength };
  const perpendicular = { x: -direction.y, y: direction.x };
  const endPoint = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance };
  const halfWidth = safeDpi / 2;
  const points = [
    { x: origin.x + perpendicular.x * halfWidth, y: origin.y + perpendicular.y * halfWidth },
    { x: endPoint.x + perpendicular.x * halfWidth, y: endPoint.y + perpendicular.y * halfWidth },
    { x: endPoint.x - perpendicular.x * halfWidth, y: endPoint.y - perpendicular.y * halfWidth },
    { x: origin.x - perpendicular.x * halfWidth, y: origin.y - perpendicular.y * halfWidth },
  ];
  const extent = squares + 2;
  const cells = [];
  for (let column = -extent; column <= extent; column += 1) {
    for (let row = -extent; row <= extent; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      const center = cellCenter(cell);
      const relative = { x: center.x - origin.x, y: center.y - origin.y };
      const along = relative.x * direction.x + relative.y * direction.y;
      const across = Math.abs(relative.x * perpendicular.x + relative.y * perpendicular.y);
      if (along >= -EPSILON && along <= distance + EPSILON && across <= halfWidth + EPSILON) cells.push(cell);
    }
  }
  return { type: "line", origin, squares, cells, points };
}

export function buildRectangleArea(
  start,
  end,
  dpi,
  gridOrigin = start,
  widthSquares = 1,
) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const pointer = finitePoint(end);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const squares = snappedAreaLength(start, end, safeDpi);
  const safeWidthSquares = Math.max(
    1,
    Math.round(Number(widthSquares) || 1),
  );
  const distance = squares * safeDpi;
  const raw = { x: pointer.x - origin.x, y: pointer.y - origin.y };
  const rawLength = length(raw) || 1;
  const direction = { x: raw.x / rawLength, y: raw.y / rawLength };
  const perpendicular = { x: -direction.y, y: direction.x };
  const alignmentOffset = safeWidthSquares % 2 === 0 ? safeDpi / 2 : 0;
  const centerStart = {
    x: origin.x - direction.x * safeDpi / 2
      + perpendicular.x * alignmentOffset,
    y: origin.y - direction.y * safeDpi / 2
      + perpendicular.y * alignmentOffset,
  };
  const centerEnd = {
    x: centerStart.x + direction.x * distance,
    y: centerStart.y + direction.y * distance,
  };
  const halfWidth = safeWidthSquares * safeDpi / 2;
  const points = [
    {
      x: centerStart.x + perpendicular.x * halfWidth,
      y: centerStart.y + perpendicular.y * halfWidth,
    },
    {
      x: centerEnd.x + perpendicular.x * halfWidth,
      y: centerEnd.y + perpendicular.y * halfWidth,
    },
    {
      x: centerEnd.x - perpendicular.x * halfWidth,
      y: centerEnd.y - perpendicular.y * halfWidth,
    },
    {
      x: centerStart.x - perpendicular.x * halfWidth,
      y: centerStart.y - perpendicular.y * halfWidth,
    },
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const minColumn = Math.floor((minX - cellsOrigin.x) / safeDpi) - 1;
  const maxColumn = Math.ceil((maxX - cellsOrigin.x) / safeDpi) + 1;
  const minRow = Math.floor((minY - cellsOrigin.y) / safeDpi) - 1;
  const maxRow = Math.ceil((maxY - cellsOrigin.y) / safeDpi) + 1;
  const cells = [];
  const minimumOverlap = safeDpi * safeDpi * 0.5;
  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      if (
        polygonCellOverlapArea(points, cell)
        >= minimumOverlap - EPSILON
      ) {
        cells.push(cell);
      }
    }
  }
  return {
    type: "rectangle",
    origin,
    squares,
    widthSquares: safeWidthSquares,
    cells,
    points,
  };
}

export function buildArea(
  type,
  start,
  end,
  dpi,
  gridOrigin = start,
  options = {},
) {
  if (type === "square") return buildSquareArea(start, end, dpi, gridOrigin);
  if (type === "cone") return buildConeArea(start, end, dpi, gridOrigin);
  if (type === "line") return buildLineArea(start, end, dpi, gridOrigin);
  if (type === "rectangle") {
    return buildRectangleArea(
      start,
      end,
      dpi,
      gridOrigin,
      options?.widthSquares,
    );
  }
  return buildCircleArea(start, end, dpi, gridOrigin);
}

export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  const aRight = Number(a.x) + Number(a.width);
  const aBottom = Number(a.y) + Number(a.height);
  const bRight = Number(b.x) + Number(b.width);
  const bBottom = Number(b.y) + Number(b.height);
  return aRight > Number(b.x) + EPSILON
    && bRight > Number(a.x) + EPSILON
    && aBottom > Number(b.y) + EPSILON
    && bBottom > Number(a.y) + EPSILON;
}

export function boundsToRect(bounds) {
  if (!bounds?.min || !bounds?.max) return null;
  const x = Number(bounds.min.x);
  const y = Number(bounds.min.y);
  const maxX = Number(bounds.max.x);
  const maxY = Number(bounds.max.y);
  if (![x, y, maxX, maxY].every(Number.isFinite)) return null;
  return { x, y, width: Math.max(0, maxX - x), height: Math.max(0, maxY - y) };
}

export function areaHitsBounds(area, bounds) {
  const rect = boundsToRect(bounds);
  return !!rect && Array.isArray(area?.cells) && area.cells.some((cell) => rectsOverlap(cell, rect));
}
