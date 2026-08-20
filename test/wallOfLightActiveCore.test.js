import test from "node:test";
import assert from "node:assert/strict";

import { buildLineArea } from "../src/aoeGeometryCore.js";
import { AOE_AREA_META_KEY } from "../src/aoeStyle.js";
import {
  planWallOfLightShortening,
  wallOfLightTargetWithinRange,
} from "../src/wallOfLightActiveCore.js";

const scale = { multiplier: 1.5, unit: "m" };

function zone(start, end, dpi = 100) {
  return {
    id: "wall",
    position: { x: 0, y: 0 },
    metadata: {
      [AOE_AREA_META_KEY]: {
        version: 2,
        singlePath: true,
        type: "line",
        start,
        end,
        gridOrigin: start,
        basePosition: { x: 0, y: 0 },
        dpi,
        widthSquares: 1,
      },
    },
  };
}

test("Muro di Luce accorcia di 3 m l'estremita finale senza spostare l'origine", () => {
  const plan = planWallOfLightShortening({
    zoneItem: zone({ x: 0, y: 0 }, { x: 1200, y: 0 }),
    scale,
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.endsSpell, false);
  assert.equal(plan.currentCells, 12);
  assert.equal(plan.consumeCells, 2);
  assert.equal(plan.remainingCells, 10);
  assert.deepEqual(plan.preview.start, { x: 0, y: 0 });
  assert.deepEqual(plan.preview.end, { x: 1000, y: 0 });
});

test("Muro di Luce termina quando viene consumata l'ultima sezione da 3 m", () => {
  const plan = planWallOfLightShortening({
    zoneItem: zone({ x: 0, y: 0 }, { x: 200, y: 0 }),
    scale,
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.endsSpell, true);
  assert.equal(plan.remainingCells, 0);
  assert.equal(plan.preview, null);
});

test("il range del raggio viene misurato dai tasselli reali del muro", () => {
  const dpi = 100;
  const area = buildLineArea(
    { x: 0, y: 0 },
    { x: 1200, y: 0 },
    dpi,
    { x: 0, y: 0 },
    1,
  );

  assert.equal(wallOfLightTargetWithinRange({
    area,
    targetBounds: { min: { x: 1200, y: 1200 }, max: { x: 1300, y: 1300 } },
    range: { value: 18, unit: "m" },
    dpi,
    scale,
  }), true);

  assert.equal(wallOfLightTargetWithinRange({
    area,
    targetBounds: { min: { x: 1200, y: 1401 }, max: { x: 1300, y: 1501 } },
    range: { value: 18, unit: "m" },
    dpi,
    scale,
  }), false);
});


test("Muro di Luce può consumare 3 m dall'estremita iniziale mantenendo quella finale", () => {
  const zoneItem = zone({ x: 0, y: 0 }, { x: 1200, y: 0 }, 100);
  const plan = planWallOfLightShortening({
    zoneItem,
    scale: { multiplier: 1.5, unit: "m" },
    meters: 3,
    from: "start",
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.endsSpell, false);
  assert.deepEqual(plan.preview.start, { x: 200, y: 0 });
  assert.deepEqual(plan.preview.end, { x: 1200, y: 0 });
});
