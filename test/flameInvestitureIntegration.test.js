import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ID } from "../src/constants.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import {
  getMobileAuraRule,
  collectActiveMobileAuras,
  mobileAuraTargetIds,
  mobileAuraMembershipPlan,
  staleMobileAuraEffectRemovals,
  SPELL_AURA_META_KEY,
} from "../src/spellAuraCore.js";
import {
  areaMembershipEffects,
} from "../src/spellAreaMembershipCore.js";
import {
  planMobileAuraReminder,
} from "../src/spellAuraReminderCore.js";
import { buildArea } from "../src/aoeGeometryCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

function token(id, {
  name = id,
  attitude = "enemy",
  conditions = [],
  spells = [],
  concentration = {},
  x = 0,
  y = 0,
} = {}) {
  return {
    id,
    name,
    position: { x, y },
    metadata: {
      [META_KEY]: {
        hp: 50,
        hpMax: 50,
        attitude,
        conditions: { version: 2, instances: conditions },
        [SPELLS_KEY]: spells,
        [CONCENTRATION_KEY]: concentration,
      },
    },
  };
}

function bounds(x, y, radius = 25) {
  return {
    center: { x, y },
    min: { x: x - radius, y: y - radius },
    max: { x: x + radius, y: y + radius },
    width: radius * 2,
    height: radius * 2,
  };
}

function initiativeState(current, order = ["caster", "target-1", "ally-1", "enemy-2"]) {
  return {
    round: 1,
    current,
    order,
  };
}

// -----------------------------------------------------------------------------
// SP-B01.3A — INVESTITURA DELLA FIAMMA MOBILE AURA INTEGRATION SUITE (M1–M13)
// -----------------------------------------------------------------------------

test("M1 & M2 & M3 & M4 & M5 — Membership lifecycle (outside, enter, repeat reconcile, exit, re-enter)", () => {
  const rule = getMobileAuraRule("xanathar-investitura-della-fiamma");
  assert.ok(rule, "Mobile aura rule must exist for Investitura della Fiamma");

  const effects = areaMembershipEffects(rule);
  assert.equal(effects.length, 1, "Investitura della Fiamma must expose exactly one aura membership pill");
  assert.equal(effects[0].id, "flame-investiture-aura");
  assert.equal(effects[0].kind, "debuff");
  assert.equal(effects[0].label, "Nell’aura di fuoco");

  const caster = token("caster", {
    attitude: "pc",
    spells: [{
      id: "spell-flame-1",
      instanceId: "inst-flame-1",
      spellId: "xanathar-investitura-della-fiamma",
      name: "Investitura della Fiamma",
      casterId: "caster",
      castContext: { mobileAura: true },
    }],
  });
  const target = token("target-1", { attitude: "enemy", x: 50, y: 0 });
  const outside = token("outside-1", { attitude: "enemy", x: 300, y: 0 });

  const aura = {
    instanceId: "inst-flame-1",
    spellId: "xanathar-investitura-della-fiamma",
    spellName: "Investitura della Fiamma",
    casterId: "caster",
    rule,
  };

  const area = buildArea(
    rule.geometry.shape,
    { x: 0, y: 0 },
    { x: 150, y: 0 }, // 1.5m at 100 dpi / 1.5m scale = 1 cell radius
    100,
    { x: 0, y: 0 },
  );

  // M1: Target outside -> no membership
  const candidatesOutside = [
    { item: caster, bounds: bounds(0, 0) },
    { item: outside, bounds: bounds(300, 0) },
  ];
  const desiredOutside = mobileAuraTargetIds({
    aura,
    area,
    candidates: candidatesOutside,
    metaKey: META_KEY,
  });
  assert.deepEqual(desiredOutside, []);

  // M2: Target inside -> membership added
  const candidatesInside = [
    { item: caster, bounds: bounds(0, 0) },
    { item: target, bounds: bounds(50, 0) },
  ];
  const desiredInside = mobileAuraTargetIds({
    aura,
    area,
    candidates: candidatesInside,
    metaKey: META_KEY,
  });
  assert.deepEqual(desiredInside, ["target-1"]);

  const planEnter = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds: desiredInside,
    items: [caster, target],
    metaKey: META_KEY,
    sourceName: "Mago",
  });
  assert.equal(planEnter.operations.length, 1);
  assert.equal(planEnter.operations[0].type, "condition:add");
  assert.deepEqual(planEnter.operations[0].targetIds, ["target-1"]);
  assert.equal(planEnter.operations[0].options.effectId, "flame-investiture-aura");
  assert.equal(planEnter.operations[0].options.parentEffectId, "inst-flame-1");

  // M3: Repeated reconcile -> no new additions if already present
  const targetWithCondition = token("target-1", {
    attitude: "enemy",
    x: 50,
    y: 0,
    conditions: [{
      id: "cond-1",
      condition: "Nell’aura di fuoco",
      effectId: "flame-investiture-aura",
      effectKind: "debuff",
      parentEffectId: "inst-flame-1",
      active: true,
    }],
  });
  const planRepeat = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds: desiredInside,
    items: [caster, targetWithCondition],
    metaKey: META_KEY,
    sourceName: "Mago",
  });
  assert.deepEqual(planRepeat.operations, []);

  // M4: Target exits -> membership removed
  const planExit = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds: [],
    items: [caster, targetWithCondition],
    metaKey: META_KEY,
    sourceName: "Mago",
  });
  assert.equal(planExit.operations.length, 1);
  assert.equal(planExit.operations[0].type, "condition:remove-instances");
  assert.deepEqual(planExit.operations[0].removals, [{
    itemId: "target-1",
    instanceId: "cond-1",
  }]);

  // M5: Target re-enters -> added once
  const planReenter = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds: ["target-1"],
    items: [caster, target], // target without condition
    metaKey: META_KEY,
    sourceName: "Mago",
  });
  assert.equal(planReenter.operations.length, 1);
  assert.equal(planReenter.operations[0].type, "condition:add");
});

test("M6 & M7 — Caster movement vs Target movement enter trigger", () => {
  const rule = getMobileAuraRule("xanathar-investitura-della-fiamma");
  const itemsById = new Map([
    ["caster", token("caster", { attitude: "pc", x: 0, y: 0 })],
    ["target-1", token("target-1", { attitude: "enemy", x: 50, y: 0 })],
  ]);
  const aura = {
    instanceId: "inst-flame-1",
    spellId: "xanathar-investitura-della-fiamma",
    spellName: "Investitura della Fiamma",
    casterId: "caster",
    rule,
  };

  // Initial state at cast time
  const initial = planMobileAuraReminder({
    aura,
    desiredTargetIds: [],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });

  const auraItem = {
    id: "flame-aura-visual",
    metadata: {
      [SPELL_AURA_META_KEY]: {
        instanceId: aura.instanceId,
        triggerRuntime: initial.runtime,
      },
    },
  };

  // M6: Caster moves bringing aura over target (areaPosition changes from {0,0} to {50,0})
  const casterMoved = planMobileAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["target-1"],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 50, y: 0 },
    now: 2,
  });
  assert.deepEqual(casterMoved.newActivations, [], "Caster movement over target must NOT produce enter damage reminder");

  // M7: Target moves into stationary aura (areaPosition stays {0,0})
  const targetMoved = planMobileAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["target-1"],
    initiativeState: initiativeState(1), // target's turn
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 3,
  });
  assert.equal(targetMoved.newActivations.length, 1, "Target moving into aura MUST produce enter reminder");
  assert.equal(targetMoved.newActivations[0].event, "enter");
  assert.equal(targetMoved.newActivations[0].damage.dice, "1d10");
  assert.equal(targetMoved.newActivations[0].damage.type, "fuoco");
});

test("M8 & M9 & M10 — End-turn trigger, wrong turn, and caster exclusion", () => {
  const rule = getMobileAuraRule("xanathar-investitura-della-fiamma");
  const itemsById = new Map([
    ["caster", token("caster", { attitude: "pc", x: 0, y: 0 })],
    ["target-1", token("target-1", { attitude: "enemy", x: 50, y: 0 })],
  ]);
  const aura = {
    instanceId: "inst-flame-1",
    spellId: "xanathar-investitura-della-fiamma",
    spellName: "Investitura della Fiamma",
    casterId: "caster",
    rule,
  };

  // M10: Caster excluded from target IDs
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  const targetIds = mobileAuraTargetIds({
    aura,
    area,
    candidates: [
      { item: itemsById.get("caster"), bounds: bounds(0, 0) },
      { item: itemsById.get("target-1"), bounds: bounds(50, 0) },
    ],
    metaKey: META_KEY,
  });
  assert.deepEqual(targetIds, ["target-1"]);

  // Runtime where target-1 is already in memberIds during turn 1 (target's turn)
  const baseRuntime = {
    initialized: true,
    memberIds: ["target-1"],
    memberPositions: { "target-1": { x: 50, y: 0 } },
    evaluatedTurnKey: "1:1",
    evaluatedActorId: "target-1",
    areaPosition: { x: 0, y: 0 },
    areaMoveTargetIds: {},
    handledKeys: [],
    pending: [],
    sequence: 1,
  };
  const auraItem = {
    id: "flame-aura-visual",
    metadata: {
      [SPELL_AURA_META_KEY]: {
        instanceId: aura.instanceId,
        triggerRuntime: baseRuntime,
      },
    },
  };

  // M8: Target-1 ends turn (turn advances from 1:1 to 1:2)
  const turnEnd = planMobileAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["target-1"],
    initiativeState: initiativeState(2), // turn 2 (ally-1)
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 4,
  });
  assert.equal(turnEnd.newActivations.length, 1);
  assert.equal(turnEnd.newActivations[0].event, "turn-end");
  assert.deepEqual(turnEnd.newActivations[0].targetIds, ["target-1"]);
  assert.equal(turnEnd.notices[0].targets[0].id, "target-1");
  assert.equal(turnEnd.newActivations[0].damage.dice, "1d10");

  // M9: Wrong token turn (e.g. ally-1 turn ends when ally-1 is not in aura)
  const allyTurnBaseRuntime = {
    ...baseRuntime,
    evaluatedTurnKey: "1:2",
    evaluatedActorId: "ally-1",
  };
  const allyTurnEnd = planMobileAuraReminder({
    aura,
    auraItem: {
      ...auraItem,
      metadata: {
        [SPELL_AURA_META_KEY]: {
          instanceId: aura.instanceId,
          triggerRuntime: allyTurnBaseRuntime,
        },
      },
    },
    desiredTargetIds: ["target-1"],
    initiativeState: initiativeState(3), // turn 3 (enemy-2)
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 5,
  });
  assert.deepEqual(allyTurnEnd.newActivations, [], "Ending turn of a creature outside the aura must produce NO reminders");
});

test("M11 & M12 — Cleanup on concentration end and manual spell termination", () => {
  const rule = getMobileAuraRule("xanathar-investitura-della-fiamma");
  const targetWithCondition = token("target-1", {
    attitude: "enemy",
    conditions: [{
      id: "cond-1",
      condition: "Aura di fuoco",
      effectId: "flame-investiture-aura",
      parentEffectId: "inst-flame-1",
      active: true,
    }],
  });

  // M11 & M12: When spell instance is no longer active (empty activeInstanceIds)
  const staleRemovals = staleMobileAuraEffectRemovals([targetWithCondition], {
    activeInstanceIds: [], // spell ended
    auraEffectIds: ["flame-investiture-aura"],
    metaKey: META_KEY,
  });
  assert.deepEqual(staleRemovals, [{
    itemId: "target-1",
    instanceId: "cond-1",
  }]);
});

test("M13 — Enter + End-turn in same turn both produce reminders without premature deduplication", () => {
  const rule = getMobileAuraRule("xanathar-investitura-della-fiamma");
  const itemsById = new Map([
    ["caster", token("caster", { attitude: "pc", x: 0, y: 0 })],
    ["target-1", token("target-1", { attitude: "enemy", x: 50, y: 0 })],
  ]);
  const aura = {
    instanceId: "inst-flame-1",
    spellId: "xanathar-investitura-della-fiamma",
    spellName: "Investitura della Fiamma",
    casterId: "caster",
    rule,
  };

  // Step 1: Target-1 enters during turn 1:1
  const initialRuntime = {
    initialized: true,
    memberIds: [],
    memberPositions: {},
    evaluatedTurnKey: "1:1",
    evaluatedActorId: "target-1",
    areaPosition: { x: 0, y: 0 },
    areaMoveTargetIds: {},
    handledKeys: [],
    pending: [],
    sequence: 1,
  };
  const enterPlan = planMobileAuraReminder({
    aura,
    auraItem: {
      id: "visual-1",
      metadata: {
        [SPELL_AURA_META_KEY]: {
          instanceId: aura.instanceId,
          triggerRuntime: initialRuntime,
        },
      },
    },
    desiredTargetIds: ["target-1"],
    initiativeState: initiativeState(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 10,
  });
  assert.equal(enterPlan.newActivations.length, 1);
  assert.equal(enterPlan.newActivations[0].event, "enter");

  // Step 2: Target-1 finishes its turn 1:1 (advances to 1:2) using runtime from Step 1
  const endTurnPlan = planMobileAuraReminder({
    aura,
    auraItem: {
      id: "visual-1",
      metadata: {
        [SPELL_AURA_META_KEY]: {
          instanceId: aura.instanceId,
          triggerRuntime: enterPlan.runtime,
        },
      },
    },
    desiredTargetIds: ["target-1"],
    initiativeState: initiativeState(2), // next turn
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 11,
  });
  assert.equal(endTurnPlan.newActivations.length, 1, "End-turn reminder must NOT be suppressed when creature previously entered in the same turn");
  assert.equal(endTurnPlan.newActivations[0].event, "turn-end");
});


test("M14 — spell aura controller delivers planned notices after its own triggerRuntime write", () => {
  const source = readFileSync(
    new URL("../src/spellAuraController.js", import.meta.url),
    "utf8",
  );
  const reconcileIndex = source.indexOf("const auraVisualReconcile = await reconcileAuraVisuals");
  const noticeIndex = source.indexOf("if (deliveryNotices.length)", reconcileIndex);
  assert.ok(reconcileIndex >= 0 && noticeIndex > reconcileIndex);
  const bridge = source.slice(reconcileIndex, noticeIndex);
  assert.match(bridge, /auraVisualReconcilePerformedOwnedWrite\(auraVisualReconcile\)/);
  assert.match(bridge, /scheduleSpellAuraRecovery\(\)/);
  assert.doesNotMatch(
    bridge,
    /if \(!isCurrentSceneEpoch\(sceneEpoch\) \|\| !spatialSceneSnapshot\.isCurrent\(snapshot\)\) return;/,
    "An owned aura metadata write must not suppress the live reminder broadcast",
  );
});
