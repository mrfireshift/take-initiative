export const SPEED_CHECK_METERS_PER_CELL = 1.5;

export function elevationMovementCells(
  beforeElevation,
  afterElevation,
  gridScaleMultiplier,
  activeMode,
) {
  const mode = String(activeMode || "").trim().toLocaleLowerCase("it");
  if (mode !== "fly" && mode !== "climb") return 0;
  const before = Number(beforeElevation);
  const after = Number(afterElevation);
  const scale = Math.abs(Number(gridScaleMultiplier));
  if (!Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(scale) || scale <= 0) {
    return 0;
  }
  return Math.abs(after - before) / scale;
}

export function hasClimbingSpeed(movementModes = []) {
  return (Array.isArray(movementModes) ? movementModes : [])
    .some((entry) => entry?.id === "climb" && Number(entry?.speedMeters) > 0);
}

export function climbingMovementCostMultiplier(climbing, movementModes = []) {
  return climbing === true && !hasClimbingSpeed(movementModes) ? 2 : 1;
}

export function buildSpeedCheckSnapshot(state, enabled = true, movementLimited = false) {
  const source = state && typeof state === "object" ? state : {};
  const speedMeters = Math.max(0, Number(source.speedMeters) || 0);
  const baseSpeedMeters = Math.max(0, Number(source.baseSpeedMeters ?? speedMeters) || 0);
  const completedCycles = Math.max(0, Math.floor(Number(source.cycle) || 0));
  const usedMeters = Math.max(0, Number(source.cycleMeters) || 0);
  const dashCount = Math.max(0, Math.floor(Number(source.dashCount) || 0));
  const bonusMeters = Math.max(0, Number(source.bonusMeters) || 0);
  const effectiveBonusMeters = source.blocksSpeedBonuses ? 0 : bonusMeters;
  const movementModes = (Array.isArray(source.movementModes) ? source.movementModes : [])
    .map((entry) => ({
      id: String(entry?.id || ""),
      label: String(entry?.label || ""),
      baseSpeedMeters: Math.max(0, Number(entry?.baseSpeedMeters) || 0),
      speedMeters: Math.max(0, Number(entry?.speedMeters) || 0),
      blocked: entry?.blocked === true,
      blocksSpeedBonuses: entry?.blocksSpeedBonuses === true,
      reasons: Array.isArray(entry?.reasons) ? [...entry.reasons] : [],
      summary: String(entry?.summary || ""),
    }))
    .filter((entry) => entry.id);
  const activeMode = String(source.activeMode || movementModes[0]?.id || "walk");
  const activeModeEntry = movementModes.find((entry) => entry.id === activeMode);
  const climbing = source.climbing === true;
  const hasClimbing = hasClimbingSpeed(movementModes);
  const climbingCostMultiplier = climbingMovementCostMultiplier(climbing, movementModes);
  const modeBaseSpeedMeters = Math.max(
    0,
    Number(source.modeBaseSpeedMeters ?? activeModeEntry?.baseSpeedMeters ?? baseSpeedMeters) || 0
  );
  const hasMovementModes = source.hasMovementModes === true
    || movementModes.some((entry) => entry.baseSpeedMeters > 0)
    || baseSpeedMeters > 0;
  const available = !!enabled && !source.disabled && hasMovementModes;
  const totalMeters = (completedCycles * speedMeters) + usedMeters;
  const allowanceMeters = speedMeters * (1 + dashCount) + effectiveBonusMeters;

  return {
    enabled: !!enabled,
    disabled: source.disabled === true,
    movementLimited: !!movementLimited,
    available,
    turnKey: String(source.turnKey || ""),
    itemId: String(source.itemId || ""),
    name: String(source.name || ""),
    baseSpeedMeters,
    modeBaseSpeedMeters,
    speedMeters,
    activeMode,
    activeModeLabel: String(
      source.activeModeLabel || activeModeEntry?.label || "Camminare"
    ),
    climbing,
    hasClimbingSpeed: hasClimbing,
    climbingCostMultiplier,
    movementModes,
    hasMovementModes,
    usedMeters,
    remainingMeters: available ? Math.max(0, allowanceMeters - totalMeters) : 0,
    totalMeters,
    allowanceMeters,
    usedCells: usedMeters / SPEED_CHECK_METERS_PER_CELL,
    speedCells: speedMeters / SPEED_CHECK_METERS_PER_CELL,
    totalCells: totalMeters / SPEED_CHECK_METERS_PER_CELL,
    allowanceCells: allowanceMeters / SPEED_CHECK_METERS_PER_CELL,
    dashCount,
    bonusMeters,
    effectiveBonusMeters,
    blocked: !!source.blocked,
    blocksSpeedBonuses: !!source.blocksSpeedBonuses,
    prone: !!source.prone,
    movementCostMultiplier: Math.max(1, Number(source.movementCostMultiplier) || 1),
    movementImmunities: Array.isArray(source.movementImmunities)
      ? [...source.movementImmunities]
      : [],
    directionalCostModifiers: Array.isArray(source.directionalCostModifiers)
      ? source.directionalCostModifiers.map((modifier) => ({ ...modifier }))
      : [],
    conditionSummary: String(source.conditionSummary || ""),
    conditionReasons: Array.isArray(source.conditionReasons) ? [...source.conditionReasons] : [],
    completedCycles,
    cycle: completedCycles + 1,
    progress: available && allowanceMeters > 0 ? Math.min(1, totalMeters / allowanceMeters) : 0,
  };
}

export function shouldKeepSpeedReadoutOpen(snapshot, previousSnapshot = null) {
  if (snapshot?.available === true) return true;
  return snapshot?.enabled === true
    && snapshot?.disabled !== true
    && !!snapshot?.turnKey
    && !!snapshot?.itemId
    && previousSnapshot?.available === true;
}

export function limitedMovementRejection(snapshot, movedCells) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const movedMeters = Math.max(0, Number(movedCells) || 0) * SPEED_CHECK_METERS_PER_CELL;
  if (movedMeters <= 0) return null;
  if (source.blocked || Number(source.speedMeters) <= 0) {
    return { blocked: true, movedMeters, remainingMeters: 0 };
  }
  if (!source.movementLimited) return null;
  const remainingMeters = Math.max(0, Number(source.remainingMeters) || 0);
  if (movedMeters <= remainingMeters + 1e-9) return null;
  return { blocked: false, movedMeters, remainingMeters };
}

export function countSpeedLimitCrossings(beforeMeters, afterMeters, allowanceMeters, repeatMeters) {
  const before = Math.max(0, Number(beforeMeters) || 0);
  const after = Math.max(before, Number(afterMeters) || 0);
  const allowance = Math.max(0, Number(allowanceMeters) || 0);
  const repeat = Math.max(0, Number(repeatMeters) || 0);
  if (after <= before || allowance <= 0 || repeat <= 0) return 0;

  const thresholdCount = (total) => {
    if (total + 1e-9 < allowance) return 0;
    return 1 + Math.floor(Math.max(0, total - allowance + 1e-9) / repeat);
  };
  return Math.max(0, thresholdCount(after) - thresholdCount(before));
}

export function normalizeSpeedMeters(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(999, Math.round(number * 10) / 10));
}

export function resolveSpeedCheckTurn(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const current = Math.max(0, Math.floor(Number(state?.current) || 0));
  const rawId = String(order[current] || "");
  return {
    actorId: rawId.replace(/::p[0-9]+$/, ""),
    turnKey: rawId
      ? [Math.max(1, Number(state?.round) || 1), current, rawId].join(":")
      : "",
  };
}

export function advanceSpeedCycle(previous, movedCells, speedMeters) {
  const speed = Math.max(0, Number(speedMeters) || 0);
  const meters = Math.max(0, Number(movedCells) || 0) * SPEED_CHECK_METERS_PER_CELL;
  const prior = previous && typeof previous === "object" ? previous : {};
  const cycle = Math.max(0, Math.floor(Number(prior.cycle) || 0));
  const cycleMeters = Math.max(0, Number(prior.cycleMeters) || 0);
  if (meters <= 0) {
    return { cycle, cycleMeters, movedMeters: meters, cyclesCrossed: 0 };
  }
  if (speed <= 0) {
    return { cycle: 0, cycleMeters: cycleMeters + meters, movedMeters: meters, cyclesCrossed: 0 };
  }

  const combined = cycleMeters + meters;
  const cyclesCrossed = Math.max(0, Math.floor((combined + 1e-9) / speed));
  const remainder = Math.max(0, combined - (cyclesCrossed * speed));
  return {
    cycle: cycle + cyclesCrossed,
    cycleMeters: remainder,
    movedMeters: meters,
    cyclesCrossed,
  };
}

export function retreatSpeedCycle(previous, movedCells, speedMeters) {
  const speed = Math.max(0, Number(speedMeters) || 0);
  const meters = Math.max(0, Number(movedCells) || 0) * SPEED_CHECK_METERS_PER_CELL;
  const prior = previous && typeof previous === "object" ? previous : {};
  const priorCycle = Math.max(0, Math.floor(Number(prior.cycle) || 0));
  const priorRemainder = Math.max(0, Number(prior.cycleMeters) || 0);
  if (meters <= 0) {
    return {
      cycle: priorCycle,
      cycleMeters: priorRemainder,
      movedMeters: -meters,
      cyclesCrossed: 0,
      cyclesReverted: 0,
    };
  }
  if (speed <= 0) {
    return {
      cycle: 0,
      cycleMeters: Math.max(0, priorRemainder - meters),
      movedMeters: -meters,
      cyclesCrossed: 0,
      cyclesReverted: 0,
    };
  }

  const priorTotal = (priorCycle * speed) + priorRemainder;
  const total = Math.max(0, priorTotal - meters);
  const cycle = Math.max(0, Math.floor((total + 1e-9) / speed));
  const cycleMeters = Math.max(0, total - (cycle * speed));
  return {
    cycle,
    cycleMeters,
    movedMeters: -meters,
    cyclesCrossed: 0,
    cyclesReverted: Math.max(0, priorCycle - cycle),
  };
}

function samePoint(a, b) {
  return !!a && !!b
    && Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= 0.1
    && Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) <= 0.1;
}

export function sameGridCell(a, b) {
  return samePoint(a, b);
}

export function measureSquareGridCells(from, to, dpi) {
  const gridDpi = Math.max(1, Number(dpi) || 1);
  if (!from || !to) return 0;
  const dx = Math.abs((Number(to.x) || 0) - (Number(from.x) || 0)) / gridDpi;
  const dy = Math.abs((Number(to.y) || 0) - (Number(from.y) || 0)) / gridDpi;
  return Math.max(dx, dy);
}

function lineRectInterval(from, to, cell) {
  const minX = Number(cell?.x);
  const minY = Number(cell?.y);
  const maxX = minX + Number(cell?.width);
  const maxY = minY + Number(cell?.height);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  let start = 0;
  let end = 1;
  for (const [origin, delta, min, max] of [
    [from.x, dx, minX, maxX],
    [from.y, dy, minY, maxY],
  ]) {
    if (Math.abs(delta) <= 1e-9) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    const axisStart = Math.min(first, second);
    const axisEnd = Math.max(first, second);
    start = Math.max(start, axisStart);
    end = Math.min(end, axisEnd);
    if (start > end + 1e-9) return null;
  }
  return [Math.max(0, start), Math.min(1, end)];
}

function areaIntervals(from, to, area) {
  if (!area) return [[0, 1]];
  const intervals = (Array.isArray(area.cells) ? area.cells : [])
    .map((cell) => lineRectInterval(from, to, cell))
    .filter(Boolean)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1] + 1e-7) {
      previous[1] = Math.max(previous[1], interval[1]);
    } else {
      merged.push([...interval]);
    }
  }
  return merged;
}

function distanceBetweenPoints(left, right) {
  return Math.hypot(
    Number(right?.x) - Number(left?.x),
    Number(right?.y) - Number(left?.y),
  );
}

function towardRatio(from, to, source) {
  const pathLength = distanceBetweenPoints(from, to);
  if (!Number.isFinite(pathLength) || pathLength <= 1e-9) return 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const denominator = (dx * dx) + (dy * dy);
  if (denominator <= 1e-9) return 0;
  const projection = Math.max(0, Math.min(1, (
    ((Number(source?.x) - from.x) * dx)
      + ((Number(source?.y) - from.y) * dy)
  ) / denominator));
  const closest = {
    x: from.x + (dx * projection),
    y: from.y + (dy * projection),
  };
  const startDistance = distanceBetweenPoints(from, source);
  const endDistance = distanceBetweenPoints(to, source);
  const closestDistance = distanceBetweenPoints(closest, source);
  const towardMeters = Math.max(0, startDistance - closestDistance)
    + Math.max(0, closestDistance - endDistance);
  return Math.max(0, Math.min(1, towardMeters / pathLength));
}

export function movementCostForSegment({
  movedCells = 0,
  beforePosition = null,
  afterPosition = null,
  baseMultiplier = 1,
  directionalModifiers = [],
} = {}) {
  const cells = Math.max(0, Number(movedCells) || 0);
  const before = beforePosition && Number.isFinite(Number(beforePosition.x))
    && Number.isFinite(Number(beforePosition.y))
    ? { x: Number(beforePosition.x), y: Number(beforePosition.y) }
    : null;
  const after = afterPosition && Number.isFinite(Number(afterPosition.x))
    && Number.isFinite(Number(afterPosition.y))
    ? { x: Number(afterPosition.x), y: Number(afterPosition.y) }
    : null;
  const baseCost = cells * Math.max(1, Number(baseMultiplier) || 1);
  if (!cells || !before || !after) {
    return {
      chargedCells: baseCost,
      baseCells: cells,
      directionalCells: 0,
      appliedModifiers: [],
    };
  }

  const unique = new Map();
  for (const modifier of Array.isArray(directionalModifiers) ? directionalModifiers : []) {
    if (String(modifier?.direction || "toward-source") !== "toward-source") continue;
    const costMultiplier = Number(modifier?.costMultiplier);
    const source = modifier?.sourcePosition;
    if (!Number.isFinite(costMultiplier) || costMultiplier < 1
      || !Number.isFinite(Number(source?.x)) || !Number.isFinite(Number(source?.y))) {
      continue;
    }
    const key = [
      modifier.sourceId || "",
      modifier.instanceId || "",
      modifier.zoneId || "",
      modifier.direction || "toward-source",
      costMultiplier,
    ].join("|");
    if (!unique.has(key)) unique.set(key, {
      ...modifier,
      costMultiplier,
      sourcePosition: { x: Number(source.x), y: Number(source.y) },
      intervals: areaIntervals(before, after, modifier.area),
    });
  }
  const modifiers = [...unique.values()].filter((modifier) => modifier.intervals.length);
  if (!modifiers.length) {
    return {
      chargedCells: baseCost,
      baseCells: cells,
      directionalCells: 0,
      appliedModifiers: [],
    };
  }

  const breakpoints = new Set([0, 1]);
  for (const modifier of modifiers) {
    for (const [start, end] of modifier.intervals) {
      breakpoints.add(start);
      breakpoints.add(end);
    }
  }
  const sortedBreakpoints = [...breakpoints].sort((left, right) => left - right);
  let chargedCells = 0;
  let directionalCells = 0;
  const appliedModifiers = [];
  for (let index = 1; index < sortedBreakpoints.length; index += 1) {
    const start = sortedBreakpoints[index - 1];
    const end = sortedBreakpoints[index];
    if (end - start <= 1e-9) continue;
    const from = {
      x: before.x + ((after.x - before.x) * start),
      y: before.y + ((after.y - before.y) * start),
    };
    const to = {
      x: before.x + ((after.x - before.x) * end),
      y: before.y + ((after.y - before.y) * end),
    };
    let multiplier = Math.max(1, Number(baseMultiplier) || 1);
    let segmentDirectional = false;
    for (const modifier of modifiers) {
      const inside = modifier.intervals.some(([rangeStart, rangeEnd]) => (
        start >= rangeStart - 1e-7 && end <= rangeEnd + 1e-7
      ));
      if (!inside) continue;
      const ratio = towardRatio(from, to, modifier.sourcePosition);
      if (ratio <= 0) continue;
      multiplier *= 1 + ((modifier.costMultiplier - 1) * ratio);
      directionalCells += cells * (end - start) * ratio;
      segmentDirectional = true;
      if (!appliedModifiers.includes(modifier)) appliedModifiers.push(modifier);
    }
    if (segmentDirectional) {
      chargedCells += cells * (end - start) * multiplier;
    } else {
      chargedCells += cells * (end - start) * Math.max(1, Number(baseMultiplier) || 1);
    }
  }
  return {
    chargedCells,
    baseCells: cells,
    directionalCells,
    appliedModifiers: appliedModifiers.map((modifier) => ({
      sourceId: String(modifier.sourceId || ""),
      instanceId: String(modifier.instanceId || ""),
      zoneId: String(modifier.zoneId || ""),
      label: String(modifier.label || ""),
    })),
  };
}

export function reversedPathStart(path, movement) {
  const segments = Array.isArray(path) ? path : [];
  const movementBefore = movement?.beforeCell || movement?.beforePosition;
  const movementAfter = movement?.afterCell || movement?.afterPosition;
  if (!segments.length || !movementBefore || !movementAfter) return -1;

  const last = segments[segments.length - 1];
  const lastAfter = last?.afterCell || last?.afterPosition;
  if (!samePoint(lastAfter, movementBefore)) return -1;

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segmentBefore = segments[index]?.beforeCell || segments[index]?.beforePosition;
    if (samePoint(segmentBefore, movementAfter)) return index;
  }
  return -1;
}
export function shouldRetreatSpeedMovement(reverseIndex, movement) {
  return movement?.undo === true;
}
