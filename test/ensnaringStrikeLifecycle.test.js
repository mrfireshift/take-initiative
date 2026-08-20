import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "test-room", getMetadata: async () => ({}) },
      player: { getRole: async () => "GM" },
      scene: {
        isReady: async () => true,
        getMetadata: async () => ({}),
        items: {
          getItems: async () => [],
          updateItems: async () => {},
        },
      },
      broadcast: {
        onMessage: () => () => {},
        sendMessage: async () => {},
      },
    },
    buildLabel: (...args) => ({ type: "LABEL", args, build: () => ({ id: "mock-label" }) }),
    buildImage: (...args) => ({ type: "IMAGE", args, build: () => ({ id: "mock-image" }) }),
    buildText: (...args) => ({ type: "TEXT", args, build: () => ({ id: "mock-text" }) }),
    buildShape: (...args) => ({ type: "SHAPE", args, build: () => ({ id: "mock-shape" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
    buildPath: () => ({
      commands: () => ({
        fillRule: () => ({
          fillColor: () => ({
            fillOpacity: () => ({
              strokeColor: () => ({
                strokeOpacity: () => ({
                  strokeWidth: () => ({
                    position: () => ({
                      locked: () => ({
                        disableHit: () => ({
                          layer: () => ({
                            metadata: () => ({
                              name: () => ({
                                build: () => ({ id: "mock-path" }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
});

const { ID } = await import("../src/constants.js");
const {
  normalizeEffectSaveReminder,
  planEffectSaveReminderNotices,
} = await import("../src/effectSaveReminderCore.js");
const {
  buildEffectSaveReminderResolution,
  buildReminderResolutionPlan,
} = await import("../src/reminderResolutionCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { PHB2014_SAVE_AUTOMATION } = await import("../src/phb2014SpellRules.js");

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

let instanceCounter = 0;
function applyOperationsToRuntime(runtime, operations, { metadataPatches = [] } = {}) {
  const rawItems = Array.from(runtime.items.values());
  const items = rawItems.map((item) => {
    const meta = item?.metadata?.[META_KEY] || {};
    return {
      id: item.id,
      name: item.name,
      spells: meta[SPELLS_KEY] || meta.spells || [],
      concentrations: meta[CONCENTRATION_KEY] || meta.concentrations || {},
      conditions: meta.conditions || [],
      hp: meta.hp,
      hpMax: meta.hpMax,
    };
  });
  const normalizedOps = (operations || []).map((op) => {
    if (op?.type === "condition:add") {
      const instanceIds = { ...(op.instanceIds || {}) };
      for (const tid of op.targetIds || []) {
        instanceIds[tid] = instanceIds[tid] || `cond-inst-${tid}-${++instanceCounter}`;
      }
      return { ...op, instanceIds };
    }
    return op;
  });
  const plan = buildEffectsMutationPlan(items, normalizedOps);
  for (const change of plan.changes) {
    const item = runtime.items.get(change.id);
    if (!item) continue;
    item.metadata = item.metadata || {};
    item.metadata[META_KEY] = item.metadata[META_KEY] || {};
    if (change.spells) item.metadata[META_KEY][SPELLS_KEY] = change.spells;
    if (change.concentrations) item.metadata[META_KEY][CONCENTRATION_KEY] = change.concentrations;
    if (change.conditions) item.metadata[META_KEY].conditions = change.conditions;
    if (change.hp !== undefined) item.metadata[META_KEY].hp = change.hp;
  }
  for (const patch of metadataPatches || []) {
    const item = runtime.items.get(patch.id);
    if (!item) continue;
    item.metadata = item.metadata || {};
    item.metadata[META_KEY] = item.metadata[META_KEY] || {};
    for (const [field, spec] of Object.entries(patch.fields || {})) {
      item.metadata[META_KEY][field] = spec && typeof spec === "object" && "value" in spec ? spec.value : spec;
    }
  }
}

function createToken(id, name, hp = 50, hpMax = 50, metaExtras = {}) {
  return {
    id,
    name,
    type: "TOKEN",
    metadata: {
      [META_KEY]: {
        hp,
        hpMax,
        conditions: [],
        [SPELLS_KEY]: [],
        [CONCENTRATION_KEY]: {},
        ...metaExtras,
      },
    },
  };
}

function createRuntime(items = [], sceneState = {}) {
  const store = new Map(items.map((it) => [it.id, structuredClone(it)]));
  let state = {
    round: 1,
    current: 0,
    order: items.map((it) => it.id),
    ...sceneState,
  };

  const runtimeObj = {
    items: store,
    readItems: async (ids) => ids.map((id) => store.get(id)).filter(Boolean),
    readAllItems: async () => Array.from(store.values()),
    readSceneMetadata: async () => ({
      [STATE_KEY]: state,
    }),
    getInitiativeActorId: async () => state.order?.[state.current] || null,
    updateItems: async (ids, updater) => {
      const targets = ids.map((id) => store.get(id)).filter(Boolean);
      updater(targets);
      for (const t of targets) store.set(t.id, t);
    },
    updateSceneMetadata: async (updater) => {
      updater({ [STATE_KEY]: state });
    },
    runEffectsMutation: async (operations, options = {}) => {
      applyOperationsToRuntime(runtimeObj, operations, options);
      return { committed: true, changedIds: [] };
    },
  };
  return runtimeObj;
}

// ---------------------------------------------------------------------------
// UNIT TESTS: NORMALIZATION & RESOLUTION GUARDS
// ---------------------------------------------------------------------------

test("R1 — NORMALIZATION: damage-only reminder without ability is accepted", () => {
  const reminder = normalizeEffectSaveReminder({
    timing: "turn-start",
    mode: "manual-damage",
    damage: {
      dice: "1d6",
      type: "perforanti",
      baseSlot: 1,
      additionalPerSlotAbove: 1,
    },
    label: "Subisce danni perforanti all'inizio di ogni proprio turno.",
  });

  assert.ok(reminder, "reminder should not be null");
  assert.equal(reminder.timing, "turn-start");
  assert.equal(reminder.mode, "manual-damage");
  assert.equal(reminder.damage.dice, "1d6");
  assert.equal(reminder.damage.type, "perforanti");
  assert.equal(reminder.ability, undefined, "should not have ability");
});

test("R2 — INVALID EMPTY REMINDER: reminder with timing but neither ability nor damage is rejected", () => {
  const reminder = normalizeEffectSaveReminder({
    timing: "turn-start",
  });
  assert.equal(reminder, null, "empty reminder must be rejected as null");
});

test("R3 — EXISTING SAVE REMINDER REGRESSION: standard save reminder with ability is preserved", () => {
  const reminder = normalizeEffectSaveReminder({
    ability: "con",
    timing: "turn-start",
    dcSource: "source-spell",
    success: "remove-effect",
    damage: {
      dice: "1d6",
      type: "fuoco",
      onSave: "none",
    },
    label: "1d6 fuoco se fallisce; se supera, termina la spell.",
  });

  assert.ok(reminder);
  assert.equal(reminder.ability, "con");
  assert.equal(reminder.timing, "turn-start");
  assert.equal(reminder.success, "remove-effect");
  assert.equal(reminder.damage.dice, "1d6");
  assert.equal(reminder.damage.type, "fuoco");
});

// ---------------------------------------------------------------------------
// INTEGRATION TESTS: LIFECYCLE & SCALING
// ---------------------------------------------------------------------------

const CASTER_ID = "caster-ranger-1";
const TARGET_A_ID = "target-goblin-a";
const TARGET_B_ID = "target-goblin-b";

function applyEnsnaringStrikeToTarget(runtime, {
  casterId = CASTER_ID,
  targetId = TARGET_A_ID,
  instanceId = "ensnaring-inst-1",
  slotLevel = 1,
} = {}) {
  const target = runtime.items.get(targetId);
  const caster = runtime.items.get(casterId);

  // 1. Spell record on target
  target.metadata[META_KEY][SPELLS_KEY] = [
    ...(target.metadata[META_KEY][SPELLS_KEY] || []),
    {
      id: "phb2014-colpo-intrappolante",
      spellId: "phb2014-colpo-intrappolante",
      name: "Colpo Intrappolante",
      instanceId,
      casterId,
      casterName: caster.name,
      conc: true,
      castContext: { slotLevel, phase: "resolve" },
    },
  ];

  // 2. Concentration on caster
  caster.metadata[META_KEY][CONCENTRATION_KEY] = {
    ...(caster.metadata[META_KEY][CONCENTRATION_KEY] || {}),
    "phb2014-colpo-intrappolante": {
      instanceId,
      spellId: "phb2014-colpo-intrappolante",
      name: "Colpo Intrappolante",
      targets: [targetId],
      castContext: { slotLevel },
    },
  };

  // 3. Conditions on target from PHB2014_SAVE_AUTOMATION["phb2014-colpo-intrappolante"]
  const rule = PHB2014_SAVE_AUTOMATION["phb2014-colpo-intrappolante"];
  const condList = target.metadata[META_KEY].conditions || [];
  for (const condRule of rule.failed) {
    condList.push({
      id: `cond-${condRule.effectId || condRule.condition}-${targetId}`,
      condition: condRule.condition,
      type: "spell",
      spellId: "phb2014-colpo-intrappolante",
      spellName: "Colpo Intrappolante",
      parentEffectId: instanceId,
      sourceId: casterId,
      sourceName: caster.name,
      active: true,
      manualRemoval: condRule.manualRemoval,
      endsParentOnRemoval: condRule.endsParentOnRemoval,
      effectId: condRule.effectId,
      effectKind: condRule.effectKind,
      effectDetail: condRule.effectDetail,
      saveReminder: condRule.saveReminder,
    });
  }
  target.metadata[META_KEY].conditions = condList;
}

test("R4 — BASE SLOT (SLOT 1): Turn-start generates 1 damage-only notice with 1d6 and no save", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA], { order: [TARGET_A_ID, CASTER_ID], current: 0 });

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 1 });

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });

  assert.equal(notices.length, 1, "exactly 1 turn notice should be produced");
  const notice = notices[0];
  assert.equal(notice.target.id, TARGET_A_ID);
  assert.equal(notice.timing, "turn-start");
  assert.equal(notice.ability, undefined, "should not have saving throw ability");
  assert.ok(notice.resolution, "notice must have resolution");
  assert.equal(notice.resolution.mode, "manual-damage");
  assert.equal(notice.resolution.damage.dice, "1d6");
  assert.equal(notice.resolution.damage.type, "perforanti");
  assert.equal(notice.resolution.save, undefined, "resolution must not have save field");
});

test("R5 — UPSCALED SLOT 3: Turn-start notice scales damage dice to 3d6", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA], { order: [TARGET_A_ID, CASTER_ID], current: 0 });

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 3 });

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });

  assert.equal(notices.length, 1);
  const notice = notices[0];
  assert.equal(notice.resolution.mode, "manual-damage");
  assert.equal(notice.resolution.damage.dice, "3d6");
  assert.equal(notice.resolution.slotLevel, 3);
});

test("R6 — INSTANCE PERSISTENCE: Slot level is bound to spell instance, immune to UI state changes", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA], { order: [TARGET_A_ID, CASTER_ID], current: 0 });

  // Cast with slot 4
  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 4 });

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });

  assert.equal(notices.length, 1);
  assert.equal(notices[0].resolution.damage.dice, "4d6");
  assert.equal(notices[0].resolution.slotLevel, 4);
});

test("R7 — TWO INSTANCES: Independent scaling for separate targets", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const targetB = createToken(TARGET_B_ID, "Goblin B", 30, 30);
  const runtime = createRuntime([caster, targetA, targetB], {
    order: [TARGET_A_ID, TARGET_B_ID, CASTER_ID],
    current: 0,
  });

  // Target A hit by slot 1, Target B hit by slot 3
  applyEnsnaringStrikeToTarget(runtime, {
    casterId: CASTER_ID,
    targetId: TARGET_A_ID,
    instanceId: "ensnaring-inst-1",
    slotLevel: 1,
  });
  applyEnsnaringStrikeToTarget(runtime, {
    casterId: CASTER_ID,
    targetId: TARGET_B_ID,
    instanceId: "ensnaring-inst-2",
    slotLevel: 3,
  });

  // Turn starts on Target A
  const noticesA = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 2, order: [TARGET_A_ID, TARGET_B_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, TARGET_B_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  assert.equal(noticesA.length, 1);
  assert.equal(noticesA[0].target.id, TARGET_A_ID);
  assert.equal(noticesA[0].resolution.damage.dice, "1d6");

  // Turn advances to Target B
  const noticesB = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 2, current: 0, order: [TARGET_A_ID, TARGET_B_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 1, order: [TARGET_A_ID, TARGET_B_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  assert.equal(noticesB.length, 1);
  assert.equal(noticesB[0].target.id, TARGET_B_ID);
  assert.equal(noticesB[0].resolution.damage.dice, "3d6");
});

test("R8 — RESOLUTION ACCEPTANCE: mode 'manual-damage' accepts 'confirmed' and rejects save outcomes", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA]);

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 2 });

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  const notice = notices[0];

  // outcome: "passed" should be rejected / informational
  const invalidPlan = buildReminderResolutionPlan({
    notice,
    items: Array.from(runtime.items.values()),
    outcome: "passed",
    damageRoll: 8,
  });
  assert.equal(invalidPlan.status, "informational");

  // outcome: "confirmed" is accepted
  const validPlan = buildReminderResolutionPlan({
    notice,
    items: Array.from(runtime.items.values()),
    outcome: "confirmed",
    damageRoll: 8,
  });
  assert.equal(validPlan.status, "ready");
  assert.equal(validPlan.hpChange.before, 30);
  assert.equal(validPlan.hpChange.after, 22);
});

test("R9 — MANUAL DAMAGE APPLICATION: HP is reduced by 11 while spell, conditions, and concentration remain active", async () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA]);

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 3 });

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  const notice = notices[0];

  const plan = buildReminderResolutionPlan({
    notice,
    items: Array.from(runtime.items.values()),
    outcome: "confirmed",
    damageRoll: 11,
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.damage.amount, 11);

  await runtime.runEffectsMutation(plan.operations, { metadataPatches: plan.metadataPatches });

  const updatedTarget = runtime.items.get(TARGET_A_ID);
  const updatedCaster = runtime.items.get(CASTER_ID);

  // HP reduced by 11
  assert.equal(updatedTarget.metadata[META_KEY].hp, 19);

  // Spell record remains active
  assert.equal(updatedTarget.metadata[META_KEY][SPELLS_KEY].length, 1);
  assert.equal(updatedTarget.metadata[META_KEY][SPELLS_KEY][0].name, "Colpo Intrappolante");

  // Conditions remain active
  const conds = updatedTarget.metadata[META_KEY].conditions;
  assert.ok(conds.some((c) => c.condition === "Trattenuto"), "Trattenuto must remain active");
  assert.ok(conds.some((c) => c.effectId === "ensnaring-strike-damage"), "ensnaring-strike-damage must remain active");

  // Concentration remains active
  assert.ok(updatedCaster.metadata[META_KEY][CONCENTRATION_KEY]["phb2014-colpo-intrappolante"], "concentration must remain active");
});

test("R10 — NO AUTO ROLL: Damage amount matches exact user input without RNG", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA]);

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 1 });

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  const notice = notices[0];

  const plan = buildReminderResolutionPlan({
    notice,
    items: Array.from(runtime.items.values()),
    outcome: "confirmed",
    damageRoll: 5,
  });

  assert.equal(plan.damage.amount, 5);
  assert.equal(plan.damage.roll, 5);
});

test("R11 — ONCE PER TURN: Resolving marks turn, preventing duplicates until next round", async () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA]);

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 1 });

  const noticesR2 = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  assert.equal(noticesR2.length, 1);

  // Resolve reminder in round 2
  const plan = buildReminderResolutionPlan({
    notice: noticesR2[0],
    items: Array.from(runtime.items.values()),
    outcome: "confirmed",
    damageRoll: 4,
  });
  await runtime.runEffectsMutation(plan.operations);

  // Mark resolution in target metadata resolutions map
  const targetInStore = runtime.items.get(TARGET_A_ID);
  targetInStore.metadata[META_KEY].reminderResolutions = {
    [noticesR2[0].activationId]: { resolvedAt: Date.now(), outcome: "confirmed" },
  };

  // Re-evaluation in same turn produces 0 notices
  const duplicates = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  assert.equal(duplicates.length, 0, "should not produce duplicate notice in same turn");

  // Next round (round 3) produces a new notice
  const noticesR3 = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 2, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 3, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  assert.equal(noticesR3.length, 1, "next round should produce a new turn notice");
});

test("R12 — CLEANUP: Removing Trattenuto or breaking concentration stops future turn notices", () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA]);

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 1 });

  // Cleanup: target frees itself / conditions removed
  const targetInStore = runtime.items.get(TARGET_A_ID);
  targetInStore.metadata[META_KEY].conditions = [];
  targetInStore.metadata[META_KEY][SPELLS_KEY] = [];

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  assert.equal(notices.length, 0, "no notices after cleanup");
});

test("R13 — CONTROL SPELL REGRESSION: Immolation continues to produce Dex save with passed/failed outcomes", () => {
  const { PHB2014_SAVE_AUTOMATION: SRD_RULES } = PHB2014_SAVE_AUTOMATION;
  const immolationReminder = normalizeEffectSaveReminder({
    ability: "dex",
    timing: "turn-end",
    dcSource: "source-spell",
    success: "remove-effect",
    damage: {
      dice: "4d6",
      type: "fuoco",
      onSave: "none",
    },
    label: "4d6 fuoco se fallisce; se supera, termina la spell.",
  });

  assert.ok(immolationReminder);
  assert.equal(immolationReminder.ability, "dex");
  assert.equal(immolationReminder.timing, "turn-end");
  assert.equal(immolationReminder.success, "remove-effect");
  assert.equal(immolationReminder.damage.dice, "4d6");

  const resolution = buildEffectSaveReminderResolution({
    item: createToken("target-1", "Enemy", 50, 50),
    instance: {
      id: "cond-immolation-1",
      parentEffectId: "immolation-inst-1",
      spellName: "Immolazione",
      spellId: "xanathar-immolazione",
      manualRemoval: true,
    },
    reminder: immolationReminder,
    dc: 15,
    activationId: "act-immolation-1",
    turnKey: "1:0",
  });

  assert.ok(resolution);
  assert.equal(resolution.save.ability, "dex");
  assert.equal(resolution.save.dc, 15);
  assert.ok(resolution.outcomes.passed, "passed outcome must exist");
  assert.ok(resolution.outcomes.failed, "failed outcome must exist");
  assert.ok(resolution.outcomes.immune, "immune outcome must exist");
});

test("R14 — HISTORY / UNDO: Undoing damage resolution reverts HP while preserving spell, conditions, and concentration", async () => {
  const caster = createToken(CASTER_ID, "Ranger", 40, 40);
  const targetA = createToken(TARGET_A_ID, "Goblin A", 30, 30);
  const runtime = createRuntime([caster, targetA]);

  applyEnsnaringStrikeToTarget(runtime, { slotLevel: 3 });

  // Snapshot before turn-start damage
  const targetStateBefore = structuredClone(runtime.items.get(TARGET_A_ID).metadata[META_KEY]);
  const casterStateBefore = structuredClone(runtime.items.get(CASTER_ID).metadata[META_KEY]);

  const notices = planEffectSaveReminderNotices({
    previousInitiativeState: { round: 1, current: 1, order: [TARGET_A_ID, CASTER_ID] },
    initiativeState: { round: 2, current: 0, order: [TARGET_A_ID, CASTER_ID] },
    items: Array.from(runtime.items.values()),
  });
  const notice = notices[0];

  const plan = buildReminderResolutionPlan({
    notice,
    items: Array.from(runtime.items.values()),
    outcome: "confirmed",
    damageRoll: 11,
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.damage.amount, 11);

  await runtime.runEffectsMutation(plan.operations, { metadataPatches: plan.metadataPatches });

  // Assert damage applied
  const targetAfterDamage = runtime.items.get(TARGET_A_ID);
  assert.equal(targetAfterDamage.metadata[META_KEY].hp, 19);

  // Undo damage resolution (restores snapshot)
  runtime.items.get(TARGET_A_ID).metadata[META_KEY] = targetStateBefore;
  runtime.items.get(CASTER_ID).metadata[META_KEY] = casterStateBefore;

  const targetAfterUndo = runtime.items.get(TARGET_A_ID);
  const casterAfterUndo = runtime.items.get(CASTER_ID);

  // HP restored to 30
  assert.equal(targetAfterUndo.metadata[META_KEY].hp, 30);

  // Spell, conditions and concentration are preserved
  assert.equal(targetAfterUndo.metadata[META_KEY][SPELLS_KEY].length, 1);
  assert.ok(targetAfterUndo.metadata[META_KEY].conditions.some((c) => c.condition === "Trattenuto"));
  assert.ok(targetAfterUndo.metadata[META_KEY].conditions.some((c) => c.effectId === "ensnaring-strike-damage"));
  assert.ok(casterAfterUndo.metadata[META_KEY][CONCENTRATION_KEY]["phb2014-colpo-intrappolante"]);
});
