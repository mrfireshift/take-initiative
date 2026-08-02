export const SPEED_CHECK_METERS_PER_CELL = 1.5;

export function elevationMovementCells(
  beforeElevation,
  afterElevation,
  gridScaleMultiplier,
  activeMode,
) {
  if (String(activeMode || "").trim().toLocaleLowerCase("it") !== "fly") return 0;
  const before = Number(beforeElevation);
  const after = Number(afterElevation);
  const scale = Math.abs(Number(gridScaleMultiplier));
  if (!Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(scale) || scale <= 0) {
    return 0;
  }
  return Math.abs(after - before) / scale;
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
