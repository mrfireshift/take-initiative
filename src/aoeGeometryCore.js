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

function buildCircleAnnulusArea(
  origin,
  cellsOrigin,
  safeDpi,
  outerSquares,
  innerSquares = 0,
  areaRole = "",
) {
  const outer = Math.max(1, Math.round(Number(outerSquares) || 1));
  const inner = Math.max(0, Math.min(outer, Number(innerSquares) || 0));
  const radius = outer * safeDpi;
  const innerRadius = inner * safeDpi;
  const cells = [];
  for (let column = -outer - 2; column <= outer + 2; column += 1) {
    for (let row = -outer - 2; row <= outer + 2; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      const center = cellCenter(cell);
      const distance = Math.hypot(center.x - origin.x, center.y - origin.y);
      if (
        distance <= radius + EPSILON
        && distance >= innerRadius - EPSILON
      ) {
        cells.push(cell);
      }
    }
  }
  return {
    type: "circle",
    origin,
    radius,
    squares: outer,
    cells,
    ...(inner > 0 ? { ring: true, innerRadius, innerSquares: inner } : {}),
    ...(areaRole ? { areaRole } : {}),
  };
}

export function buildCircleArea(start, end, dpi, gridOrigin = start, options = {}) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const squares = snappedAreaLength(start, end, safeDpi);
  return buildCircleAnnulusArea(
    origin,
    cellsOrigin,
    safeDpi,
    squares,
    options?.ring ? options.ringInnerSquares : 0,
    options?.areaRole,
  );
}

export function buildCircleBandArea(
  start,
  end,
  dpi,
  gridOrigin = start,
  options = {},
) {
  const origin = finitePoint(start);
  const cellsOrigin = finitePoint(gridOrigin);
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const bodyOuterSquares = snappedAreaLength(start, end, safeDpi);
  const bandSquares = Math.max(1, Math.round(Number(options?.bandSquares) || 1));
  const side = String(options?.bandSide || options?.side || "outside").trim().toLowerCase();
  const bodyInnerSquares = Math.max(
    0,
    Math.min(bodyOuterSquares, Number(options?.ringInnerSquares) || 0),
  );
  let outerSquares = bodyOuterSquares;
  let innerSquares = bodyOuterSquares;
  if (bodyInnerSquares > 0 && side === "inside") {
    outerSquares = bodyInnerSquares;
    innerSquares = Math.max(0, bodyInnerSquares - bandSquares);
  } else {
    outerSquares = bodyOuterSquares + bandSquares;
    innerSquares = bodyOuterSquares;
  }
  return buildCircleAnnulusArea(
    origin,
    cellsOrigin,
    safeDpi,
    outerSquares,
    innerSquares,
    "side-band",
  );
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

export function buildLineArea(
  start,
  end,
  dpi,
  gridOrigin = start,
  widthSquares = 1,
  widthAnchor = "center",
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
  const relativeOriginX = (origin.x - cellsOrigin.x) / safeDpi;
  const relativeOriginY = (origin.y - cellsOrigin.y) / safeDpi;
  const isCorner = Math.abs(relativeOriginX - Math.round(relativeOriginX)) < EPSILON
    && Math.abs(relativeOriginY - Math.round(relativeOriginY)) < EPSILON;
  const alignmentOffset = safeWidthSquares % 2 === 0
    ? (isCorner ? 0 : safeDpi / 2)
    : 0;
  const halfWidth = safeWidthSquares * safeDpi / 2;
  const edgeOffset = widthAnchor === "edge" ? halfWidth : 0;
  const centerOrigin = {
    x: origin.x + perpendicular.x * (alignmentOffset + edgeOffset),
    y: origin.y + perpendicular.y * (alignmentOffset + edgeOffset),
  };
  const centerEnd = {
    x: centerOrigin.x + direction.x * distance,
    y: centerOrigin.y + direction.y * distance,
  };
  const points = [
    { x: centerOrigin.x + perpendicular.x * halfWidth, y: centerOrigin.y + perpendicular.y * halfWidth },
    { x: centerEnd.x + perpendicular.x * halfWidth, y: centerEnd.y + perpendicular.y * halfWidth },
    { x: centerEnd.x - perpendicular.x * halfWidth, y: centerEnd.y - perpendicular.y * halfWidth },
    { x: centerOrigin.x - perpendicular.x * halfWidth, y: centerOrigin.y - perpendicular.y * halfWidth },
  ];
  const extent = Math.max(squares, safeWidthSquares) + 2;
  const cells = [];
  for (let column = -extent; column <= extent; column += 1) {
    for (let row = -extent; row <= extent; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      const center = cellCenter(cell);
      const relativeOrigin = { x: center.x - origin.x, y: center.y - origin.y };
      const along = relativeOrigin.x * direction.x + relativeOrigin.y * direction.y;
      const relativeCenter = { x: center.x - centerOrigin.x, y: center.y - centerOrigin.y };
      const across = Math.abs(relativeCenter.x * perpendicular.x + relativeCenter.y * perpendicular.y);
      if (along >= -EPSILON && along <= distance + EPSILON && across <= halfWidth + EPSILON) cells.push(cell);
    }
  }
  return {
    type: "line",
    origin,
    squares,
    widthSquares: safeWidthSquares,
    cells,
    points,
    direction,
    perpendicular,
    distance,
    centerOrigin,
    centerEnd,
    halfWidth,
  };
}

export function buildLineSideBandArea(
  start,
  end,
  dpi,
  gridOrigin = start,
  widthSquares = 1,
  widthAnchor = "center",
  options = {},
) {
  const requestedSide = String(
    options?.bandSide || options?.side || "left",
  ).trim().toLowerCase();
  if (requestedSide === "both") {
    const left = buildLineSideBandArea(
      start,
      end,
      dpi,
      gridOrigin,
      widthSquares,
      widthAnchor,
      { ...options, bandSide: "left" },
    );
    const right = buildLineSideBandArea(
      start,
      end,
      dpi,
      gridOrigin,
      widthSquares,
      widthAnchor,
      { ...options, bandSide: "right" },
    );
    const cellsByKey = new Map();
    for (const cell of [...left.cells, ...right.cells]) {
      cellsByKey.set(`${cell.column}:${cell.row}`, cell);
    }
    return {
      ...left,
      bandSide: "both",
      cells: [...cellsByKey.values()],
      points: [...left.points, ...right.points],
    };
  }
  const body = buildLineArea(
    start,
    end,
    dpi,
    gridOrigin,
    widthSquares,
    widthAnchor,
  );
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const bandSquares = Math.max(1, Math.round(Number(options?.bandSquares) || 1));
  const side = String(options?.bandSide || options?.side || "left").trim().toLowerCase() === "right"
    ? -1
    : 1;
  const outerHalfWidth = body.halfWidth + bandSquares * safeDpi;
  const points = [
    {
      x: body.centerOrigin.x + body.perpendicular.x * body.halfWidth * side,
      y: body.centerOrigin.y + body.perpendicular.y * body.halfWidth * side,
    },
    {
      x: body.centerEnd.x + body.perpendicular.x * body.halfWidth * side,
      y: body.centerEnd.y + body.perpendicular.y * body.halfWidth * side,
    },
    {
      x: body.centerEnd.x + body.perpendicular.x * outerHalfWidth * side,
      y: body.centerEnd.y + body.perpendicular.y * outerHalfWidth * side,
    },
    {
      x: body.centerOrigin.x + body.perpendicular.x * outerHalfWidth * side,
      y: body.centerOrigin.y + body.perpendicular.y * outerHalfWidth * side,
    },
  ];
  const extent = Math.max(body.squares, body.widthSquares, bandSquares) + 3;
  const cells = [];
  const cellsOrigin = finitePoint(gridOrigin);
  for (let column = -extent; column <= extent; column += 1) {
    for (let row = -extent; row <= extent; row += 1) {
      const cell = cellRect(cellsOrigin, column, row, safeDpi);
      const center = cellCenter(cell);
      const relativeOrigin = {
        x: center.x - body.origin.x,
        y: center.y - body.origin.y,
      };
      const along = relativeOrigin.x * body.direction.x
        + relativeOrigin.y * body.direction.y;
      const relativeCenter = {
        x: center.x - body.centerOrigin.x,
        y: center.y - body.centerOrigin.y,
      };
      const across = relativeCenter.x * body.perpendicular.x
        + relativeCenter.y * body.perpendicular.y;
      const signedAcross = across * side;
      if (
        along >= -EPSILON
        && along <= body.distance + EPSILON
        && signedAcross >= body.halfWidth - EPSILON
        && signedAcross <= outerHalfWidth + EPSILON
      ) {
        cells.push(cell);
      }
    }
  }
  return {
    type: "line",
    areaRole: "side-band",
    bandSide: side > 0 ? "left" : "right",
    origin: body.origin,
    squares: body.squares,
    widthSquares: bandSquares,
    cells,
    points,
    direction: body.direction,
    perpendicular: body.perpendicular,
    distance: body.distance,
    centerOrigin: body.centerOrigin,
    centerEnd: body.centerEnd,
    halfWidth: body.halfWidth,
  };
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
  if (type === "line") {
    if (options?.band) {
      return buildLineSideBandArea(
        start,
        end,
        dpi,
        gridOrigin,
        options?.widthSquares,
        options?.widthAnchor,
        options.band,
      );
    }
    return buildLineArea(
      start,
      end,
      dpi,
      gridOrigin,
      options?.widthSquares,
      options?.widthAnchor,
    );
  }
  if (type === "rectangle") {
    return buildRectangleArea(
      start,
      end,
      dpi,
      gridOrigin,
      options?.widthSquares,
    );
  }
  if (options?.band) {
    return buildCircleBandArea(start, end, dpi, gridOrigin, {
      ...options.band,
      ringInnerSquares: options?.ringInnerSquares,
    });
  }
  return buildCircleArea(start, end, dpi, gridOrigin, options);
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

function pointInsideRect(point, rect) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const minX = Number(rect?.x);
  const minY = Number(rect?.y);
  const maxX = minX + Number(rect?.width);
  const maxY = minY + Number(rect?.height);
  return [x, y, minX, minY, maxX, maxY].every(Number.isFinite)
    && x >= minX - EPSILON
    && x <= maxX + EPSILON
    && y >= minY - EPSILON
    && y <= maxY + EPSILON;
}

export function areaContainsBounds(area, bounds) {
  const rect = boundsToRect(bounds);
  if (!rect || !Array.isArray(area?.cells) || !area.cells.length) return false;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];
  return corners.every((corner) => area.cells.some((cell) => pointInsideRect(corner, cell)));
}

export function areaHitsBounds(area, bounds) {
  const rect = boundsToRect(bounds);
  return !!rect && Array.isArray(area?.cells) && area.cells.some((cell) => rectsOverlap(cell, rect));
}

function segmentIntersectsRect(start, end, rect) {
  const x1 = Number(start?.x);
  const y1 = Number(start?.y);
  const x2 = Number(end?.x);
  const y2 = Number(end?.y);
  const minX = Number(rect?.x);
  const minY = Number(rect?.y);
  const maxX = minX + Number(rect?.width);
  const maxY = minY + Number(rect?.height);
  if (![x1, y1, x2, y2, minX, minY, maxX, maxY].every(Number.isFinite)) return false;
  const strictlyInside = (x, y) => (
    x > minX + EPSILON
    && x < maxX - EPSILON
    && y > minY + EPSILON
    && y < maxY - EPSILON
  );
  if (strictlyInside(x1, y1) || strictlyInside(x2, y2)) {
    return true;
  }
  let tMin = 0;
  let tMax = 1;
  const deltaX = x2 - x1;
  const deltaY = y2 - y1;
  for (const [origin, delta, minimum, maximum] of [
    [x1, deltaX, minX, maxX],
    [y1, deltaY, minY, maxY],
  ]) {
    if (Math.abs(delta) <= EPSILON) {
      if (origin <= minimum + EPSILON || origin >= maximum - EPSILON) return false;
      continue;
    }
    const entry = (minimum - origin) / delta;
    const exit = (maximum - origin) / delta;
    const low = Math.min(entry, exit);
    const high = Math.max(entry, exit);
    tMin = Math.max(tMin, low);
    tMax = Math.min(tMax, high);
    if (tMin > tMax + EPSILON) return false;
  }
  return tMax >= -EPSILON
    && tMin <= 1 + EPSILON
    && tMax > tMin + EPSILON;
}

export function areaIntersectsSegment(area, start, end, bounds) {
  const tokenRect = boundsToRect(bounds);
  if (!tokenRect || !Array.isArray(area?.cells) || !area.cells.length) return false;
  const halfWidth = tokenRect.width / 2;
  const halfHeight = tokenRect.height / 2;
  return area.cells.some((cell) => segmentIntersectsRect(
    start,
    end,
    {
      x: cell.x - halfWidth,
      y: cell.y - halfHeight,
      width: cell.width + tokenRect.width,
      height: cell.height + tokenRect.height,
    },
  ));
}
