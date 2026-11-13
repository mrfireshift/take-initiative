// CAP-CARRIAGE: the height of the creatures a zone holds up, decisions H-3 and H-4 of 12/11/2026. Let go, they come down;
// from 3 m up (two squares) they fall: 1d6 per two squares, prone if hurt, unless the spell's text says otherwise.
import test from "node:test";
import assert from "node:assert/strict";

import {
  planZoneLandings,
  ZONE_FALL_EFFECT_ID,
  zoneFallConditionOperation,
  zoneFallDice,
  zoneLandingOf,
} from "../src/zoneLandingCore.js";

const sphere = (id = "held") => ({
  id, condition: "Trattenuto", active: true, effectId: "watery-sphere-restrained", mechanics: { landing: { fall: "on-exit" } },
});
const whirlwind = (id = "held") => ({
  id, condition: "Trattenuto", active: true, effectId: "xanathar-turbine-restrained", mechanics: { landing: { fall: "always" } },
});
const change = (id, before, after) => ({ id, before: { conditions: before }, after: { conditions: after } });
const heights = (map) => (id) => map[id] ?? 0;

test("i d6 della caduta: uno ogni due caselle (3 m, 10 ft), niente sotto, al massimo 20", () => {
  assert.deepEqual([0, 1, 1.99, 2, 3, 4, 6, 40, 60].map(zoneFallDice), [0, 0, 0, 1, 1, 2, 3, 20, 20]);
  assert.equal(zoneLandingOf({ mechanics: { landing: { fall: "boh" } } }).fall, "none");
  assert.equal(zoneLandingOf({ mechanics: {} }), null);
});

test("H-3: chi la zona lascia torna a terra; chi resta trattenuto o è già a terra non cambia", () => {
  const landings = planZoneLandings({
    changes: [
      change("free", [sphere()], []),
      change("still", [sphere()], [sphere()]),
      change("ground", [sphere()], []),
      change("other", [{ id: "x", condition: "Accecato", active: true }], []),
    ],
    heightOf: heights({ free: 2, still: 2, ground: 0, other: 2 }),
  });
  assert.deepEqual(landings, [{ id: "free", squares: 2, dice: 0 }]);
});

test("H-4, sfera: cade solo chi esce col TS superato; la caduta fuori e la fine lasciano solo Prona", () => {
  const changes = [change("exit", [sphere()], []), change("fallen", [sphere()], [])];
  assert.deepEqual(planZoneLandings({ changes, exitIds: ["exit"], heightOf: () => 2 }), [
    { id: "exit", squares: 2, dice: 1 },
    { id: "fallen", squares: 2, dice: 0 },
  ]);
});

test("H-4, Turbine: cade sempre, da 9 m (sei caselle) 3d6; da 1,5 m torna a terra senza danno", () => {
  assert.deepEqual(planZoneLandings({
    changes: [change("high", [whirlwind()], []), change("low", [whirlwind()], [])],
    heightOf: heights({ high: 6, low: 1 }),
  }), [
    { id: "high", squares: 6, dice: 3 },
    { id: "low", squares: 1, dice: 0 },
  ]);
});

test("la pill della caduta: il promemoria chiede i dadi subito e se ne va con la risposta", () => {
  const operation = zoneFallConditionOperation({ targetId: "goblin", heightText: "6 m", dice: 2 });
  assert.equal(operation.type, "condition:add");
  assert.deepEqual(operation.targetIds, ["goblin"]);
  assert.equal(operation.conditionName, "Caduta da 6 m");
  assert.equal(operation.options.effectId, ZONE_FALL_EFFECT_ID);
  assert.equal(operation.options.effectDetail, "2d6 contundenti; Prona se subisce danni.");
  assert.deepEqual(operation.options.deferredEffect, {
    id: ZONE_FALL_EFFECT_ID,
    timing: "immediate",
    actor: "target",
    reminder: "Caduta da 6 m: 2d6 contundenti",
    resolution: { mode: "manual-damage", damage: { dice: "2d6", type: "contundenti" } },
  });
  assert.equal(zoneFallConditionOperation({ targetId: "goblin", heightText: "20 ft", dice: 2 }).conditionName, "Caduta da 20 ft");
  assert.equal(zoneFallConditionOperation({ targetId: "goblin", heightText: "1,5 m", dice: 0 }), null);
});

test("H-4: risolta la caduta, chi subisce danni è Prono e la pill se ne va; con 0 resta in piedi", async () => {
  const { buildDeferredEffectResolution, buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
  const { normalizeDeferredEffect } = await import("../src/spellLifecycleContracts.js");
  const META = "com.thebigpicture.initiative/meta";
  const operation = zoneFallConditionOperation({ targetId: "goblin", heightText: "6 m", dice: 2 });
  const deferredEffect = normalizeDeferredEffect(operation.options.deferredEffect);
  const instance = { id: "fall-1", condition: operation.conditionName, active: true, effectId: ZONE_FALL_EFFECT_ID,
    deferredEffects: [deferredEffect], expiry: { mode: "manual" }, manualRemoval: true };
  const goblin = { id: "goblin", name: "Goblin", layer: "CHARACTER",
    metadata: { [META]: { hp: 20, hpMax: 20, conditions: { version: 2, instances: [instance] } } } };
  const resolution = buildDeferredEffectResolution({ item: goblin, instance, deferredEffect, activationId: "fall-a" });
  const plan = (roll) => buildReminderResolutionPlan({
    notice: { activationId: "fall-a", resolution, targets: [{ id: "goblin" }] },
    items: [goblin],
    outcome: "confirmed",
    damageRoll: roll,
  });
  const hurt = plan(7);
  assert.equal(hurt.status, "ready", JSON.stringify(hurt));
  assert.equal(hurt.damage.amount, 7);
  assert.deepEqual(hurt.operations, [
    { type: "condition:remove-instances", removals: [{ itemId: "goblin", instanceId: "fall-1" }] },
    {
      type: "condition:add",
      targetIds: ["goblin"],
      conditionName: "Prono",
      options: { type: "automatic", expiry: { mode: "manual" }, effectDetail: "È caduto dalla sua quota." },
    },
  ]);
  const unhurt = plan(0);
  assert.equal(unhurt.status, "ready", JSON.stringify(unhurt));
  assert.equal(unhurt.operations.some((entry) => entry.conditionName === "Prono"), false);
});

test("la Trattenuto del Turbine dichiara la caduta sempre, quella della sfera solo all'uscita col TS", async () => {
  const { turbineRestrainedConditionOptions } = await import("../src/xanatharTurbineCore.js");
  const { getAreaSaveAutomation } = await import("../src/spells-srd.js");
  assert.deepEqual(turbineRestrainedConditionOptions({ parentEffectId: "turbine-instance" }).mechanics, { landing: { fall: "always" } });
  assert.deepEqual(getAreaSaveAutomation("xanathar-sfera-acquea").failed[0].mechanics.landing, { fall: "on-exit" });
});
