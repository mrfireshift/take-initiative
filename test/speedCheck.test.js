import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceSpeedCycle,
  buildSpeedCheckSnapshot,
  countSpeedLimitCrossings,
  measureSquareGridCells,
  normalizeSpeedMeters,
  resolveSpeedCheckTurn,
  retreatSpeedCycle,
  reversedPathStart,
  sameGridCell,
  shouldRetreatSpeedMovement,
  SPEED_CHECK_METERS_PER_CELL,
} from "../src/speedCheckCore.js";

test("normalizes movement speed to one decimal", () => {
  assert.equal(normalizeSpeedMeters("10,5"), 10.5);
  assert.equal(normalizeSpeedMeters("10.56"), 10.6);
  assert.equal(normalizeSpeedMeters(""), null);
});

test("changes key on turn and round transitions", () => {
  const first = resolveSpeedCheckTurn({ order: ["hero::p2", "ally"], current: 0, round: 1 });
  const next = resolveSpeedCheckTurn({ order: ["hero::p2", "ally"], current: 1, round: 1 });
  const wrapped = resolveSpeedCheckTurn({ order: ["hero::p2", "ally"], current: 0, round: 2 });
  assert.equal(first.actorId, "hero");
  assert.notEqual(first.turnKey, next.turnKey);
  assert.notEqual(first.turnKey, wrapped.turnKey);
});

test("uses 1.5 meters per grid cell", () => {
  assert.equal(SPEED_CHECK_METERS_PER_CELL, 1.5);
  assert.deepEqual(advanceSpeedCycle(null, 6, 9), {
    cycle: 1,
    cycleMeters: 0,
    movedMeters: 9,
    cyclesCrossed: 1,
  });
});

test("builds an explicit movement readout", () => {
  const snapshot = buildSpeedCheckSnapshot({
    turnKey: "4:2:hero",
    itemId: "hero",
    name: "Edelbrand",
    speedMeters: 10.5,
    cycle: 0,
    cycleMeters: 6,
  });
  assert.equal(snapshot.usedMeters, 6);
  assert.equal(snapshot.remainingMeters, 4.5);
  assert.equal(snapshot.usedCells, 4);
  assert.equal(snapshot.speedCells, 7);
  assert.equal(snapshot.cycle, 1);
  assert.equal(snapshot.progress, 6 / 10.5);
  assert.equal(snapshot.turnKey, "4:2:hero");
});

test("readout exposes total movement across cycles", () => {
  const snapshot = buildSpeedCheckSnapshot({ speedMeters: 9, cycle: 2, cycleMeters: 1.5 });
  assert.equal(snapshot.totalMeters, 19.5);
  assert.equal(snapshot.totalCells, 13);
  assert.equal(snapshot.completedCycles, 2);
  assert.equal(snapshot.cycle, 3);
});

test("dash and bonus increase the movement allowance", () => {
  const snapshot = buildSpeedCheckSnapshot({
    speedMeters: 9,
    cycle: 0,
    cycleMeters: 6,
    dashCount: 1,
    bonusMeters: 1.5,
  });
  assert.equal(snapshot.allowanceMeters, 19.5);
  assert.equal(snapshot.allowanceCells, 13);
  assert.equal(snapshot.remainingMeters, 13.5);
  assert.equal(snapshot.progress, 6 / 19.5);
});

test("a blocked actor remains visible with speed 0 and ignores speed bonuses", () => {
  const snapshot = buildSpeedCheckSnapshot({
    baseSpeedMeters: 9,
    speedMeters: 0,
    blocked: true,
    blocksSpeedBonuses: true,
    conditionSummary: "Afferrato",
    bonusMeters: 3,
  });
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.allowanceMeters, 0);
  assert.equal(snapshot.baseSpeedMeters, 9);
  assert.equal(snapshot.conditionSummary, "Afferrato");
});

test("movement at speed 0 is still tracked and can be undone", () => {
  const moved = advanceSpeedCycle(null, 2, 0);
  assert.equal(moved.cycleMeters, 3);
  const undone = retreatSpeedCycle(moved, 1, 0);
  assert.equal(undone.cycleMeters, 1.5);
});

test("movement warnings honor dash and repeat after the allowance", () => {
  assert.equal(countSpeedLimitCrossings(0, 9, 18, 9), 0);
  assert.equal(countSpeedLimitCrossings(9, 18, 18, 9), 1);
  assert.equal(countSpeedLimitCrossings(18, 27, 18, 9), 1);
  assert.equal(countSpeedLimitCrossings(0, 28.5, 18, 9), 2);
});

test("accumulates partial movement across changes", () => {
  const first = advanceSpeedCycle(null, 4, 9);
  assert.equal(first.cyclesCrossed, 0);
  assert.equal(first.cycleMeters, 6);

  const second = advanceSpeedCycle(first, 2, 9);
  assert.equal(second.cyclesCrossed, 1);
  assert.equal(second.cycle, 1);
  assert.equal(second.cycleMeters, 0);
});

test("repeats warnings in reset cycles without blocking movement", () => {
  const result = advanceSpeedCycle(null, 13, 9);
  assert.equal(result.cyclesCrossed, 2);
  assert.equal(result.cycle, 2);
  assert.equal(result.cycleMeters, 1.5);
});

test("seven cells exhaust 10.5 meters", () => {
  const first = advanceSpeedCycle(null, 6, 10.5);
  assert.equal(first.cyclesCrossed, 0);
  const seventh = advanceSpeedCycle(first, 1, 10.5);
  assert.equal(seventh.cyclesCrossed, 1);
  assert.equal(seventh.cycleMeters, 0);
});

test("undo retreats across a movement cycle", () => {
  const exhausted = advanceSpeedCycle(null, 7, 10.5);
  const undone = retreatSpeedCycle(exhausted, 1, 10.5);
  assert.equal(undone.cycle, 0);
  assert.equal(undone.cycleMeters, 9);
  assert.equal(undone.cyclesReverted, 1);
});

test("finds a contiguous reversed movement path", () => {
  const path = [
    { beforePosition: { x: 0, y: 0 }, afterPosition: { x: 150, y: 0 }, cells: 1 },
    { beforePosition: { x: 150, y: 0 }, afterPosition: { x: 300, y: 0 }, cells: 1 },
  ];
  assert.equal(reversedPathStart(path, {
    beforePosition: { x: 300, y: 0 },
    afterPosition: { x: 0, y: 0 },
  }), 0);
});

test("does not classify unrelated backtracking as a reversed path", () => {
  const path = [
    { beforePosition: { x: 0, y: 0 }, afterPosition: { x: 150, y: 0 }, cells: 1 },
  ];
  assert.equal(reversedPathStart(path, {
    beforePosition: { x: 150, y: 0 },
    afterPosition: { x: 75, y: 0 },
  }), -1);
});

test("deduplicates samples inside the same snapped cell", () => {
  assert.equal(sameGridCell({ x: 150, y: 300 }, { x: 150, y: 300 }), true);
  assert.equal(sameGridCell({ x: 150, y: 300 }, { x: 300, y: 300 }), false);
});

test("counts diagonal squares once and sums mixed segments", () => {
  const diagonal = measureSquareGridCells({ x: 0, y: 0 }, { x: 150, y: 150 }, 150);
  const horizontal = measureSquareGridCells({ x: 150, y: 150 }, { x: 450, y: 150 }, 150);
  assert.equal(diagonal, 1);
  assert.equal(horizontal, 2);
  assert.equal(diagonal + horizontal, 3);
});

test("preserves fractional samples across a mixed drag path", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 75, y: 0 },
    { x: 150, y: 0 },
    { x: 150, y: 75 },
    { x: 150, y: 150 },
    { x: 225, y: 225 },
    { x: 300, y: 300 },
  ];
  const cells = points.slice(1).reduce((total, point, index) => (
    total + measureSquareGridCells(points[index], point, 150)
  ), 0);
  assert.equal(cells, 3);
});
test("finds reversed paths using snapped grid cells", () => {
  const path = [
    { beforeCell: { x: 0, y: 0 }, afterCell: { x: 150, y: 0 }, cells: 1 },
    { beforeCell: { x: 150, y: 0 }, afterCell: { x: 150, y: 150 }, cells: 1 },
  ];
  assert.equal(reversedPathStart(path, {
    beforeCell: { x: 150, y: 150 },
    afterCell: { x: 0, y: 0 },
  }), 0);
});
test("requires an explicit undo signal before retreating movement", () => {
  assert.equal(shouldRetreatSpeedMovement(0, {}), false);
  assert.equal(shouldRetreatSpeedMovement(0, { toolSynthetic: true }), false);
  assert.equal(shouldRetreatSpeedMovement(-1, { undo: true }), true);
  assert.equal(shouldRetreatSpeedMovement(0, { undo: true }), true);
  assert.equal(shouldRetreatSpeedMovement(-1, {}), false);
});
