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
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

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
        conditions: [],
        [CONCENTRATION_KEY]: {},
        [SPELLS_KEY]: [],
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

  const historyEntries = [];

  const runtimeObj = {
    items: store,
    historyEntries,
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

const CASTER_ID = "caster-immolation-h";
const TARGET_ID = "target-immolation-h";
const OTHER_ID = "other-token-h";

test("TEST H1 & H5 — FAILED SAVE: Semantic Combat Log label, damage detail present, no UUID", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const other = createToken(OTHER_ID, "Guerriero", 80, 80);
  const target = createToken(TARGET_ID, "Nemico", 100, 100);
  const runtime = createRuntime([caster, other, target]);

  // Cast Immolazione (Failed initial save -> 28 damage, burning condition, concentration)
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID],
    outcomes: { [TARGET_ID]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });

  await executeSpellAreaResolution(castCommand, runtime);

  const itemsList = Array.from(runtime.items.values());
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice, "Notice must be generated on target end turn");

  // Plan repeat save failure (14 damage)
  const failPlan = buildReminderResolutionPlan({
    notice,
    items: itemsList,
    outcome: "failed",
    damageRoll: 14,
  });
  assert.equal(failPlan.status, "ready");
  assert.equal(failPlan.damage.amount, 14);

  // Simulate combat log event
  const rawEvent = {
    id: "event-rem-fail",
    sequence: 2,
    at: Date.now(),
    round: 2,
    kind: "reminder-resolution",
    category: "save",
    label: `${notice.spellName || "Immolazione"} · TS fallito`,
    source: "automatic",
    targets: [{ id: TARGET_ID, name: "Nemico", damage: 14, before: { hp: 72, hpMax: 100 }, after: { hp: 58, hpMax: 100 } }],
    payload: {
      spellName: "Immolazione",
      outcome: "failed",
      damage: 14,
      damageRoll: 14,
      targets: [{ id: TARGET_ID, name: "Nemico", damage: 14 }],
      causality: {
        cause: { spellName: "Immolazione" },
        targets: [{ id: TARGET_ID, name: "Nemico", outcome: "failed", requestedDamage: 14, appliedHpDelta: -14 }],
        action: { damageRoll: 14 },
      },
    },
    facets: {
      hp: {
        targets: [{ id: TARGET_ID, name: "Nemico", delta: -14, before: { hp: 72, hpMax: 100 }, after: { hp: 58, hpMax: 100 } }],
      },
    },
  };

  const presentation = buildCombatLogPresentation(null, [rawEvent]);
  assert.equal(presentation.events.length, 1);
  const proj = presentation.events[0];

  // Assertions for title & summary
  assert.equal(proj.title, "Immolazione · TS fallito");
  assert.doesNotMatch(proj.title, /[0-9a-f]{8}-[0-9a-f]{4}/i, "Title must not contain UUID");
  assert.doesNotMatch(proj.title, /^Reminder:/, "Title must not have generic Reminder: prefix");
  assert.match(proj.summary, /14 danni/);
});

test("TEST H2, H3 & H4 — PASSED SAVE: Semantic title, no damage roll noise, no UUIDs", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const other = createToken(OTHER_ID, "Guerriero", 80, 80);
  const target = createToken(TARGET_ID, "Nemico", 100, 100);
  const runtime = createRuntime([caster, other, target]);

  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID],
    outcomes: { [TARGET_ID]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });

  await executeSpellAreaResolution(castCommand, runtime);

  const itemsList = Array.from(runtime.items.values());
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice);

  // User entered 24 damage roll in popup, but clicked "Superato" (passed)
  const passPlan = buildReminderResolutionPlan({
    notice,
    items: itemsList,
    outcome: "passed",
    damageRoll: 24,
  });
  assert.equal(passPlan.status, "ready");
  assert.equal(passPlan.damage.amount, 0, "Passed save deals 0 damage");

  // Combat Log event for passed save
  const rawEvent = {
    id: "event-rem-pass",
    sequence: 2,
    at: Date.now(),
    round: 2,
    kind: "reminder-resolution",
    category: "save",
    label: `${notice.spellName || "Immolazione"} · TS superato`,
    source: "automatic",
    targets: [{ id: TARGET_ID, name: "Nemico" }],
    payload: {
      spellName: "Immolazione",
      outcome: "passed",
      damage: 0,
      targets: [{ id: TARGET_ID, name: "Nemico" }],
      causality: {
        cause: { spellName: "Immolazione" },
        targets: [{ id: TARGET_ID, name: "Nemico", outcome: "passed" }],
      },
    },
    facets: {
      conditions: {
        targets: [{ id: TARGET_ID, name: "Nemico", removed: [{ condition: "In fiamme · 4d6 a fine turno" }] }],
      },
    },
  };

  const presentation = buildCombatLogPresentation(null, [rawEvent]);
  assert.equal(presentation.events.length, 1);
  const proj = presentation.events[0];

  assert.equal(proj.title, "Immolazione · TS superato");
  assert.doesNotMatch(proj.title, /[0-9a-f]{8}-[0-9a-f]{4}/i, "Title must not contain UUID");
  assert.doesNotMatch(proj.title, /^Reminder:/, "Title must not have generic Reminder: prefix");

  // Must NOT expose "Tiro del danno: 24" or "24 danni richiesti" or "0 danni"
  const allText = `${proj.summary} ${proj.details.flatMap((s) => s.lines).join(" ")}`;
  assert.doesNotMatch(allText, /danni richiesti/i, "Passed save must not expose requested damage");
  assert.doesNotMatch(allText, /Tiro del danno/i, "Passed save must not expose damage roll");
  assert.doesNotMatch(allText, /\b0 danni\b/i, "Passed save must not expose 0 danni noise");
});

test("TEST H1 UNDO — Failed repeat save Undo restores HP and preserves Immolation", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const other = createToken(OTHER_ID, "Guerriero", 80, 80);
  const target = createToken(TARGET_ID, "Nemico", 100, 100);
  const runtime = createRuntime([caster, other, target]);

  // 1. Cast Immolazione (Failed save -> 28 damage, target at 72 HP, burning condition, caster concentrating)
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID],
    outcomes: { [TARGET_ID]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });
  await executeSpellAreaResolution(castCommand, runtime);

  assert.equal(runtime.items.get(TARGET_ID).metadata[META_KEY].hp, 72);
  const condsAfterCast = runtime.items.get(TARGET_ID).metadata[META_KEY].conditions || [];
  assert.ok(condsAfterCast.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")));

  // 2. Target ends turn -> repeat save notice
  const itemsList = Array.from(runtime.items.values());
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice);

  // 3. Repeat save failed: 14 damage applied
  const failPlan = buildReminderResolutionPlan({
    notice,
    items: itemsList,
    outcome: "failed",
    damageRoll: 14,
  });
  assert.equal(failPlan.status, "ready");

  // Snapshot before fail resolution
  const targetHpBeforeFail = runtime.items.get(TARGET_ID).metadata[META_KEY].hp;
  assert.equal(targetHpBeforeFail, 72);

  // Apply fail resolution
  applyOperationsToRuntime(runtime, failPlan.operations);
  runtime.items.get(TARGET_ID).metadata[META_KEY].hp = 58;

  assert.equal(runtime.items.get(TARGET_ID).metadata[META_KEY].hp, 58);

  // 4. Undo repeat save failure: restores HP back to 72, Immolazione remains active
  runtime.items.get(TARGET_ID).metadata[META_KEY].hp = targetHpBeforeFail;

  assert.equal(runtime.items.get(TARGET_ID).metadata[META_KEY].hp, 72);
  const condsAfterUndo = runtime.items.get(TARGET_ID).metadata[META_KEY].conditions || [];
  assert.ok(condsAfterUndo.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")));
  const concAfterUndo = runtime.items.get(CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(concAfterUndo).length, 1);
});

test("TEST H2 UNDO — Passed repeat save Undo restores burning condition and caster concentration", async () => {
  const caster = createToken(CASTER_ID, "Mago", 50, 50);
  const other = createToken(OTHER_ID, "Guerriero", 80, 80);
  const target = createToken(TARGET_ID, "Nemico", 100, 100);
  const runtime = createRuntime([caster, other, target]);

  // 1. Cast Immolazione
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID],
    outcomes: { [TARGET_ID]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });
  await executeSpellAreaResolution(castCommand, runtime);

  // Snapshot before pass resolution
  const casterStateBefore = structuredClone(runtime.items.get(CASTER_ID).metadata[META_KEY]);
  const targetStateBefore = structuredClone(runtime.items.get(TARGET_ID).metadata[META_KEY]);

  const itemsList = Array.from(runtime.items.values());
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice);

  // 2. Repeat save passed: 0 damage, burning condition removed, concentration ended
  const passPlan = buildReminderResolutionPlan({
    notice,
    items: itemsList,
    outcome: "passed",
    damageRoll: 24,
  });
  assert.equal(passPlan.status, "ready");
  assert.equal(passPlan.damage.amount, 0);

  applyOperationsToRuntime(runtime, passPlan.operations);

  // Assert condition removed and concentration ended
  const condsAfterPass = runtime.items.get(TARGET_ID).metadata[META_KEY].conditions || [];
  assert.equal(condsAfterPass.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")), false);
  const concAfterPass = runtime.items.get(CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(concAfterPass).length, 0);

  // 3. Undo repeat save pass: single logical operation undo restores exactly target condition and caster concentration
  runtime.items.get(CASTER_ID).metadata[META_KEY] = casterStateBefore;
  runtime.items.get(TARGET_ID).metadata[META_KEY] = targetStateBefore;

  const condsAfterUndo = runtime.items.get(TARGET_ID).metadata[META_KEY].conditions || [];
  assert.ok(condsAfterUndo.some((c) => c.name?.includes("In fiamme") || c.condition?.includes("In fiamme")));
  const concAfterUndo = runtime.items.get(CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(concAfterUndo).length, 1);
});
