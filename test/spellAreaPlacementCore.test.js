import test from "node:test";
import assert from "node:assert/strict";

import {
  completeSpellAreaPlacement,
  constrainedSpellAreaEnd,
  createSpellAreaPlacementSession,
  nearestGridCellCenter,
  nearestGridCellSideCenter,
  nearestGridCorner,
  reviewSpellAreaPlacement,
  spellAreaPlacementParentUnavailable,
  spellAreaGridCells,
  spellAreaRangeCells,
  spellAreaOriginAdjacentToCaster,
  spellAreaOriginWithinRange,
} from "../src/spellAreaPlacementCore.js";
import {
  getSpellAreaPlacementChoices,
  getSpellAreaRuleById,
  getSpellAreaRuleForPlacement,
} from "../src/spellAreaRules.js";

test("il contesto di un cast normale non richiede una zona parent", () => {
  assert.equal(spellAreaPlacementParentUnavailable({
    phase: "cast",
    spellId: "fireball",
  }), false);
  assert.equal(spellAreaPlacementParentUnavailable({
    phase: "cast",
    spellId: "call-lightning",
    parentZoneId: "root-zone",
  }), true);
  assert.equal(spellAreaPlacementParentUnavailable({
    parentZoneId: "root-zone",
  }, { id: "root-zone" }, { type: "circle" }), false);
});

test("converte le misure delle spell nelle scale metriche e imperiali della griglia", () => {
  const radius = { value: 6, unit: "m", measure: "radius" };
  assert.equal(spellAreaGridCells(radius, { multiplier: 1.5, unit: "m" }), 4);
  assert.equal(spellAreaGridCells(radius, { multiplier: 5, unit: "ft" }), 4);
  assert.equal(spellAreaGridCells(null, { multiplier: 1.5, unit: "m" }), 0);
});

test("converte la portata massima in celle senza arrotondarla", () => {
  const range = { value: 18, unit: "m", measure: "range" };
  assert.equal(spellAreaRangeCells(range, { multiplier: 1.5, unit: "m" }), 12);
  assert.ok(Math.abs(
    spellAreaRangeCells(range, { multiplier: 5, unit: "ft" }) - 18 / 1.524,
  ) < 1e-9);
  assert.equal(spellAreaRangeCells({ value: 2, unit: "m" }, { multiplier: 1.5, unit: "m" }), 2 / 1.5);
  assert.equal(spellAreaRangeCells(null, { multiplier: 1.5, unit: "m" }), 0);
});

test("cerchio e quadrato mantengono la dimensione indipendentemente dal trascinamento", () => {
  assert.deepEqual(constrainedSpellAreaEnd({
    shape: "circle",
    start: { x: 100, y: 100 },
    pointer: { x: 101, y: 500 },
    dpi: 150,
    sizeCells: 4,
  }), { x: 700, y: 100 });
  assert.deepEqual(constrainedSpellAreaEnd({
    shape: "square",
    start: { x: 100, y: 100 },
    pointer: { x: 20, y: 300 },
    dpi: 150,
    sizeCells: 4,
  }), { x: -500, y: 700 });
});

test("coni, linee e rettangoli conservano direzione libera e lunghezza vincolata", () => {
  const cone = constrainedSpellAreaEnd({
    shape: "cone",
    start: { x: 0, y: 0 },
    pointer: { x: 300, y: 100 },
    dpi: 150,
    sizeCells: 3,
  });
  assert.deepEqual(cone, { x: 450, y: 150 });

  const line = constrainedSpellAreaEnd({
    shape: "line",
    start: { x: 0, y: 0 },
    pointer: { x: 3, y: 4 },
    dpi: 10,
    sizeCells: 5,
  });
  assert.deepEqual(line, { x: 30, y: 40 });

  const rectangle = constrainedSpellAreaEnd({
    shape: "rectangle",
    start: { x: 0, y: 0 },
    pointer: { x: 3, y: 4 },
    dpi: 10,
    sizeCells: 12,
  });
  assert.deepEqual(rectangle, { x: 72, y: 96 });

  assert.deepEqual(constrainedSpellAreaEnd({
    shape: "cone",
    start: { x: 20, y: 20 },
    pointer: { x: 20, y: -100 },
    dpi: 10,
    sizeCells: 3,
  }), { x: 20, y: -10 });
});

test("la portata usa la scala reale della griglia", () => {
  const common = {
    casterOrigin: { x: 0, y: 0 },
    range: { value: 18, unit: "m", measure: "range" },
    dpi: 150,
    scale: { multiplier: 1.5, unit: "m" },
  };
  assert.equal(spellAreaOriginWithinRange({
    ...common,
    origin: { x: 1800, y: 0 },
  }), true);
  assert.equal(spellAreaOriginWithinRange({
    ...common,
    origin: { x: 1950, y: 0 },
  }), false);
});

test("l'origine di linee e coni può agganciarsi alla mediana del lato", () => {
  assert.deepEqual(nearestGridCellCenter(
    { x: 200, y: 181 },
    { x: 150, y: 150 },
    150,
  ), {
    position: { x: 225, y: 225 },
    gridOrigin: { x: 150, y: 150 },
  });
  assert.deepEqual(nearestGridCellSideCenter(
    { x: 200, y: 181 },
    { x: 150, y: 150 },
    150,
    { x: -1, y: 0 },
  ), {
    position: { x: 150, y: 225 },
    gridOrigin: { x: 150, y: 150 },
    cellCenter: { x: 225, y: 225 },
  });
});

test("l'origine di un'area quadrata scatta soltanto agli angoli della griglia", () => {
  assert.deepEqual(nearestGridCorner(
    { x: 224, y: 226 },
    { x: 150, y: 150 },
    150,
  ), {
    position: { x: 150, y: 300 },
    gridOrigin: { x: 150, y: 150 },
  });
});

test("accetta soltanto la corona di caselle immediatamente attorno al caster", () => {
  const casterBounds = {
    min: { x: 150, y: 150 },
    max: { x: 300, y: 300 },
  };
  assert.equal(spellAreaOriginAdjacentToCaster({
    origin: { x: 75, y: 225 },
    casterBounds,
    dpi: 150,
  }), true);
  assert.equal(spellAreaOriginAdjacentToCaster({
    origin: { x: 75, y: 75 },
    casterBounds,
    dpi: 150,
  }), true);
  assert.equal(spellAreaOriginAdjacentToCaster({
    origin: { x: 225, y: 225 },
    casterBounds,
    dpi: 150,
  }), false);
  assert.equal(spellAreaOriginAdjacentToCaster({
    origin: { x: -75, y: 225 },
    casterBounds,
    dpi: 150,
  }), false);
});

test("la sessione passa da posizionamento a revisione e conclusione", () => {
  const rule = getSpellAreaRuleById("burning-hands:cast");
  const session = createSpellAreaPlacementSession({
    requestId: "request-1",
    rule,
    casterId: "caster",
    previousToolId: "ruler",
    previousModeId: "ruler-mode",
  });
  assert.equal(session.phase, "placing");
  assert.deepEqual(session.previousTool, {
    id: "ruler",
    modeId: "ruler-mode",
  });

  const review = reviewSpellAreaPlacement(session, {
    type: "cone",
    start: { x: 0, y: 0 },
    end: { x: 450, y: 0 },
    gridOrigin: { x: 0, y: 0 },
    dpi: 150,
    widthSquares: 2,
    targetIds: ["a", "a", "b"],
  });
  assert.equal(review.phase, "review");
  assert.deepEqual(review.preview.targetIds, ["a", "b"]);
  assert.equal(review.preview.widthSquares, 2);
  assert.equal(completeSpellAreaPlacement(review, "confirmed").phase, "confirmed");
});

test("la revisione conserva il raggio reale della sagoma circolare", () => {
  const session = createSpellAreaPlacementSession({
    requestId: "request-fireball",
    rule: getSpellAreaRuleById("fireball:cast"),
  });
  const review = reviewSpellAreaPlacement(session, {
    type: "circle",
    start: { x: 100, y: 100 },
    end: { x: 6850, y: 100 },
    radius: 600,
    gridOrigin: { x: 0, y: 0 },
    dpi: 150,
  });

  assert.equal(review.preview.radius, 600);
});

test("la revisione conserva il centro confermato di una pedina magica", () => {
  const rule = getSpellAreaRuleById("spiritual-weapon:board-token");
  const session = createSpellAreaPlacementSession({
    requestId: "request-board-token",
    rule,
    casterId: "caster",
  });
  const review = reviewSpellAreaPlacement(session, {
    type: "square",
    start: { x: 225, y: 375 },
    end: { x: 225, y: 375 },
    position: { x: 225, y: 375 },
    gridOrigin: { x: 0, y: 0 },
    dpi: 150,
  });
  assert.deepEqual(review.preview.position, { x: 225, y: 375 });
});

test("non conferma una sessione priva di anteprima", () => {
  const session = createSpellAreaPlacementSession({
    requestId: "request-2",
    rule: getSpellAreaRuleById("fireball:cast"),
  });
  assert.throws(
    () => completeSpellAreaPlacement(session, "confirmed"),
    /placement-preview-required/
  );
  assert.equal(completeSpellAreaPlacement(session, "cancelled").phase, "cancelled");
});

test("Gabbia di forza conserva la variante scelta nella sessione", () => {
  assert.deepEqual(getSpellAreaPlacementChoices("forcecage"), [
    { value: "cage", label: "Gabbia 4×4" },
    { value: "box", label: "Box solida 2×2" },
  ]);
  const boxRule = getSpellAreaRuleForPlacement("forcecage:cast", "box");
  assert.equal(boxRule.geometry.size.value, 3);
  const session = createSpellAreaPlacementSession({
    requestId: "request-forcecage",
    rule: boxRule,
    ruleChoice: "box",
  });
  assert.equal(session.ruleChoice, "box");
  assert.equal(session.shape, "square");
});
