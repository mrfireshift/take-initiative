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

const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { resolveSpellSaveTargeting } = await import("../src/spellSaveTargetingCore.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");

const CASTER_ID = "caster-immolation";
const TARGET_ID_1 = "target-immolation-1";
const TARGET_ID_2 = "target-immolation-2";
const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";

let instanceCounter = 0;
function applyOperationsToRuntime(runtime, operations) {
  const rawItems = Array.from(runtime.items.values());
  const items = rawItems.map((item) => {
    const meta = item?.metadata?.[META_KEY] || {};
    return {
      id: item.id,
      name: item.name,
      spells: meta[SPELLS_KEY] || meta.spells || [],
      concentrations: meta[CONCENTRATION_KEY] || meta.concentrations || {},
      conditions: meta.conditions || [],
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
    if (change.fields.conditions) item.metadata[META_KEY].conditions = change.after.conditions;
    if (change.fields.concentrations) item.metadata[META_KEY][CONCENTRATION_KEY] = change.after.concentrations;
    if (change.fields.spells) item.metadata[META_KEY][SPELLS_KEY] = change.after.spells;
  }
}

function createToken(id, name, hp = 100, hpMax = 100, metaExtras = {}) {
  return {
    id,
    name,
    metadata: {
      [META_KEY]: {
        hp,
        hpMax,
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
    validateSpatial: async () => ({ valid: true, errors: [] }),
    getSpatialValidation: async () => ({ valid: true }),
    isCurrent: () => true,
    createSpellInstanceId: async () => "immolation-instance-1",
    runEffectsMutation: async (operations) => {
      applyOperationsToRuntime(runtimeObj, operations);
      return { committed: true, changedIds: [] };
    },
    syncHPBatchToMemory: async () => {},
    onConcentrationWarnings: async () => {},
    onEffectSaveWarnings: async () => {},
    requireAppliedEffectsMutation: () => {},
  };
  return runtimeObj;
}

// ============================================================================
// TARGETING TESTS (T1 - T3)
// ============================================================================

test("TARGETING T1 — Single target is accepted for Immolazione", () => {
  const targeting = resolveSpellSaveTargeting({
    spellId: "xanathar-immolazione",
    slotLevel: 5,
    targetIds: [TARGET_ID_1],
    validateSpatial: false,
  });
  assert.equal(targeting.valid, true, targeting.errors?.join(", "));
  assert.equal(targeting.maximumTargets, 1);
  assert.deepEqual(targeting.targetIds, [TARGET_ID_1]);
});

test("TARGETING T2 — Multiple targets (2+) are rejected by the targeting core", () => {
  const targeting = resolveSpellSaveTargeting({
    spellId: "xanathar-immolazione",
    slotLevel: 5,
    targetIds: [TARGET_ID_1, TARGET_ID_2],
    validateSpatial: false,
  });
  assert.equal(targeting.valid, false);
  assert.ok(targeting.errors.includes("target-limit-exceeded"));
});

test("TARGETING T3 — UI Contract specifies maxTargets = 1 and discrete mode", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-immolazione",
    phase: "cast",
  });
  assert.equal(contract.presentation.targeting.mode, "discrete");
  assert.equal(contract.presentation.inputs.targets.maximum, 1);
  assert.equal(contract.presentation.inputs.targets.required, true);
  assert.equal(contract.presentation.inputs.damage.required, true);
  assert.equal(contract.presentation.inputs.outcomes.required, true);
  assert.ok(contract.presentation.controls.includes("save-outcomes"));
  assert.equal(contract.execution.hasHP, true);
  assert.equal(contract.execution.lane, "area-transaction");
});

// ============================================================================
// INITIAL SAVE TESTS (I1 - I3)
// ============================================================================

test("INITIAL SAVE I1 — TS Failed: 8d6 full damage + burning condition + concentration active", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const target = createToken(TARGET_ID_1, "Nemico", 100, 100);
  const runtime = createRuntime([caster, target]);

  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-immolazione",
    phase: "cast",
  });

  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID_1],
    outcomes: { [TARGET_ID_1]: "failed" },
    hpAmount: 28, // 8d6 rolled physical damage
    validateSpatial: false,
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.hp.outcomeFactors[TARGET_ID_1], "full");

  const result = await executeSpellAreaResolution(command, runtime);
  assert.equal(result.status, "applied");

  // Check target HP: 100 - 28 = 72
  const updatedTarget = runtime.items.get(TARGET_ID_1);
  assert.equal(updatedTarget.metadata[META_KEY].hp, 72);

  // Check target has burning condition
  const conditions = updatedTarget.metadata[META_KEY].conditions || [];
  const burningCondition = conditions.find((c) =>
    (c.id === "immolation-burning" || c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")),
  );
  assert.ok(burningCondition, "Target must receive burning condition on failed initial save");
  assert.equal(burningCondition.endsParentOnRemoval, true);
  assert.ok(burningCondition.saveReminder, "Condition must have saveReminder attached");
  assert.equal(burningCondition.saveReminder.timing, "turn-end");
  assert.equal(burningCondition.saveReminder.ability, "dex");
  assert.equal(burningCondition.saveReminder.damage?.dice, "4d6");

  // Check caster concentration is active
  const updatedCaster = runtime.items.get(CASTER_ID);
  const concentrations = updatedCaster.metadata[META_KEY][CONCENTRATION_KEY] || {};
  const activeEntries = Object.values(concentrations);
  assert.equal(activeEntries.length, 1, "Caster must be concentrating on Immolation");
  assert.equal(activeEntries[0].spellId, "xanathar-immolazione");
});

test("INITIAL SAVE I2 & I3 — TS Passed: half 8d6 damage, NO burning condition, NO concentration", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const target = createToken(TARGET_ID_1, "Nemico", 100, 100);
  const runtime = createRuntime([caster, target]);

  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-immolazione",
    phase: "cast",
  });

  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID_1],
    outcomes: { [TARGET_ID_1]: "passed" },
    hpAmount: 28, // 8d6 rolled physical damage
    validateSpatial: false,
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.hp.outcomeFactors[TARGET_ID_1], "half");

  const result = await executeSpellAreaResolution(command, runtime);
  assert.equal(result.status, "applied");

  // Check target HP: 100 - 14 = 86 (half damage)
  const updatedTarget = runtime.items.get(TARGET_ID_1);
  assert.equal(updatedTarget.metadata[META_KEY].hp, 86);

  // Check target does NOT have burning condition
  const conditions = updatedTarget.metadata[META_KEY].conditions || [];
  const burningCondition = conditions.find((c) =>
    (c.id === "immolation-burning" || c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")),
  );
  assert.equal(burningCondition, undefined, "Target must NOT receive burning condition on passed initial save");

  // Check caster concentration is NOT registered (I3: no orphan concentration)
  const updatedCaster = runtime.items.get(CASTER_ID);
  const concentrations = updatedCaster.metadata[META_KEY][CONCENTRATION_KEY] || {};
  const activeEntries = Object.values(concentrations);
  assert.equal(activeEntries.length, 0, "Caster must NOT have active concentration when initial save passed");
});

// ============================================================================
// END-TURN REPEAT SAVE TESTS (R1 - R6)
// ============================================================================

test("REPEAT SAVE R1 - R6 — End-of-turn repeat save workflow and termination", async () => {
  // Setup: Cast Immolation with failed save
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const target = createToken(TARGET_ID_1, "Nemico", 100, 100);
  const otherToken = createToken("other-token", "Alleato", 50, 50);
  const runtime = createRuntime([caster, target, otherToken], {
    order: [CASTER_ID, otherToken.id, TARGET_ID_1],
    current: 0,
    round: 1,
  });

  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-immolazione",
    phase: "cast",
  });

  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID_1],
    outcomes: { [TARGET_ID_1]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });

  await executeSpellAreaResolution(castCommand, runtime);

  const itemsList = Array.from(runtime.items.values());

  // R1: Turn of other-token ends -> NO reminder for Immolazione
  const noticesOther = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 1, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    initiativeState: { round: 1, current: 2, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    includeCurrentTurnStart: false,
  });
  const immolationNoticesOther = noticesOther.filter((n) => n.effectName?.includes("In fiamme"));
  assert.equal(immolationNoticesOther.length, 0, "No Immolation reminder when another token's turn ends");

  // R2: Turn of target ends -> Exactly ONE reminder
  const noticesTarget = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    includeCurrentTurnStart: false,
  });
  const immolationNotices = noticesTarget.filter((n) => n.effectName?.includes("In fiamme"));
  assert.equal(immolationNotices.length, 1, "Exactly one reminder when burning target turn ends");
  const notice = immolationNotices[0];
  assert.equal(notice.ability, "DES");
  assert.equal(notice.resolution?.damage?.dice, "4d6");

  // R3: Repeat save FAILED: 4d6 full fire damage (14) + burning condition remains + concentration remains
  const failPlan = buildReminderResolutionPlan({
    notice,
    items: itemsList,
    outcome: "failed",
    damageRoll: 14,
  });
  assert.equal(failPlan.status, "ready");
  assert.equal(failPlan.damage.amount, 14);

  // Execute the reminder failure operations
  applyOperationsToRuntime(runtime, failPlan.operations);

  // Target HP was 72 -> now 72 - 14 = 58
  const targetItemAfterFail = runtime.items.get(TARGET_ID_1);
  targetItemAfterFail.metadata[META_KEY].hp = 58;

  // Target still has burning condition
  const condsAfterFail = runtime.items.get(TARGET_ID_1).metadata[META_KEY].conditions || [];
  assert.ok(condsAfterFail.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")));

  // Caster still concentrating
  const concAfterFail = runtime.items.get(CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(concAfterFail).length, 1);

  // R4: Next round target end-turn -> reminder returns
  const noticesRound2 = planEffectSaveReminderNotices({
    items: Array.from(runtime.items.values()),
    previousInitiativeState: { round: 2, current: 2, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    initiativeState: { round: 3, current: 0, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    includeCurrentTurnStart: false,
  });
  const round2Immolation = noticesRound2.filter((n) => n.effectName?.includes("In fiamme"));
  assert.equal(round2Immolation.length, 1, "Reminder returns on target's next turn");

  // R5: Repeat save PASSED: 0 damage, burning condition removed, spell & concentration ended
  const passPlan = buildReminderResolutionPlan({
    notice: round2Immolation[0],
    items: Array.from(runtime.items.values()),
    outcome: "passed",
    damageRoll: 14, // even if damage is entered, passed save deals 0
  });
  assert.equal(passPlan.status, "ready");
  assert.equal(passPlan.damage.amount, 0, "Passed repeat save deals 0 damage");

  applyOperationsToRuntime(runtime, passPlan.operations);

  // Target HP unchanged (58)
  assert.equal(runtime.items.get(TARGET_ID_1).metadata[META_KEY].hp, 58);

  // Burning condition removed from target
  const condsAfterPass = runtime.items.get(TARGET_ID_1).metadata[META_KEY].conditions || [];
  assert.equal(
    condsAfterPass.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")),
    false,
    "Burning condition must be removed on passed repeat save",
  );

  // Concentration ended on caster
  const concAfterPass = runtime.items.get(CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(
    Object.keys(concAfterPass).length,
    0,
    "Caster concentration must end when burning condition is removed via passed save",
  );

  // R6: Future turns -> reminder never returns
  const noticesRound3 = planEffectSaveReminderNotices({
    items: Array.from(runtime.items.values()),
    previousInitiativeState: { round: 3, current: 2, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    initiativeState: { round: 4, current: 0, order: [CASTER_ID, otherToken.id, TARGET_ID_1] },
    includeCurrentTurnStart: false,
  });
  const round3Immolation = noticesRound3.filter((n) => n.effectName?.includes("In fiamme"));
  assert.equal(round3Immolation.length, 0, "No reminder on future turns after spell ends");
});

// ============================================================================
// CLEANUP & LIFECYCLE TESTS (C1 - C3)
// ============================================================================

test("CLEANUP C1 — Concentration loss on caster cleans up burning condition on target", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const target = createToken(TARGET_ID_1, "Nemico", 100, 100);
  const runtime = createRuntime([caster, target]);

  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-immolazione",
    phase: "cast",
  });

  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID_1],
    outcomes: { [TARGET_ID_1]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });

  await executeSpellAreaResolution(castCommand, runtime);

  // Break concentration on caster
  applyOperationsToRuntime(runtime, [{
    type: "concentration:break",
    casterIds: [CASTER_ID],
  }]);

  // Burning condition should be cleaned up on target
  const conds = runtime.items.get(TARGET_ID_1).metadata[META_KEY].conditions || [];
  assert.equal(
    conds.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")),
    false,
    "Target burning condition must be removed when caster loses concentration",
  );
});

test("CLEANUP C2 — Manual removal of burning condition on target breaks caster concentration", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const target = createToken(TARGET_ID_1, "Nemico", 100, 100);
  const runtime = createRuntime([caster, target]);

  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-immolazione",
    phase: "cast",
  });

  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID_1],
    outcomes: { [TARGET_ID_1]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });

  await executeSpellAreaResolution(castCommand, runtime);

  const burningCond = runtime.items.get(TARGET_ID_1).metadata[META_KEY].conditions?.find((c) =>
    (c.id === "immolation-burning" || c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")),
  );
  assert.ok(burningCond);

  // Remove burning condition from target
  applyOperationsToRuntime(runtime, [{
    type: "condition:remove-instances",
    removals: [{ itemId: TARGET_ID_1, instanceId: burningCond.id }],
  }]);

  // Caster concentration should be terminated
  const conc = runtime.items.get(CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(
    Object.keys(conc).length,
    0,
    "Caster concentration must end when burning condition is removed manually",
  );
});
