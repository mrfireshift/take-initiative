import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdkStub = {
  onReady() {},
  room: { id: "test-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    isReady: async () => true,
    getMetadata: async () => ({}),
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    local: {
      getItems: async () => [],
      deleteItems: async () => {},
      addItems: async () => {},
    },
    items: {
      getItems: async () => [],
      updateItems: async () => {},
    },
  },
  broadcast: {
    onMessage: () => () => {},
    sendMessage: async () => {},
  },
};

const fluentPathMock = () => {
  const node = {};
  const methods = [
    "commands", "fillRule", "fillColor", "fillOpacity", "strokeColor",
    "strokeOpacity", "strokeWidth", "position", "locked", "disableHit",
    "layer", "metadata", "name", "visible", "zIndex",
  ];
  for (const m of methods) node[m] = () => node;
  node.build = () => ({ id: "mock-path", type: "PATH" });
  return node;
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, build: () => ({ id: "mock-label" }) }),
    buildImage: (...args) => ({ type: "IMAGE", args, build: () => ({ id: "mock-image" }) }),
    buildPath: fluentPathMock,
    buildText: (...args) => ({ type: "TEXT", args, build: () => ({ id: "mock-text" }) }),
    buildShape: (...args) => ({ type: "SHAPE", args, build: () => ({ id: "mock-shape" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  getSpellSaveTargetMaximum,
  resolveSpellSaveTargeting,
} = await import("../src/spellSaveTargetingCore.js");
const {
  getSpellSaveWorkflowRule,
} = await import("../src/spellSaveWorkflowRules.js");
const {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
} = await import("../src/spellUnifiedPanelCore.js");
const {
  buildSpellAreaResolutionCommand,
} = await import("../src/spellAreaResolutionCommandCore.js");
const {
  buildSpellAreaResolutionExecutionPlan,
} = await import("../src/spellAreaResolutionExecutor.js");
const {
  getAreaSaveAutomation,
  getSpellDefinition,
} = await import("../src/spells-srd.js");
const { resolveSaveSpellResolution } = await import("../src/saveSpellCore.js");
const { saveSpellResolutionOperations } = await import("../src/saveSpellOperationsCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const {
  buildMatchedVisualEvent,
  matchedVisualLayerPlan,
} = await import("../src/embersMatchedVisualCore.js");

const state = (plan, id) => plan.states.find((entry) => entry.id === id);

function preparedOperations(operations, prefix = "hold-person-op") {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = operation.targetIds || [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:entry:${id}`])),
      };
    }
    if (operation.type === "condition:add") {
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:condition:${id}`])),
      };
    }
    return { ...operation, operationId };
  });
}

function areaCommandFor(spellId, {
  slotLevel = 2,
  targetIds = ["target-a"],
  outcomes = { "target-a": "failed" },
  placement = null,
  targetContexts = {},
} = {}) {
  const contract = buildSpellUnifiedPanelContract({
    spellId,
    phase: "cast",
    castContext: { slotLevel },
  });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster-1",
    slotLevel,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes,
    placement,
    targetContexts,
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
}

test("R1 & R2: Hold Person dichiara TS Saggezza, slot base 2 e scaling slot RAW", () => {
  const rule = getSpellSaveWorkflowRule("hold-person");

  assert.ok(rule, "hold-person workflow rule must exist");
  assert.equal(rule.ability, "wis");
  assert.equal(rule.targeting.baseSlot, 2);
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.additionalPerSlotAbove, 1);
  assert.deepEqual(rule.targeting.spatial, {
    mode: "pairwise-distance",
    maxMeters: 9,
  });

  assert.equal(getSpellSaveTargetMaximum("hold-person", 2), 1);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 3), 2);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 4), 3);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 5), 4);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 6), 5);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 7), 6);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 8), 7);
  assert.equal(getSpellSaveTargetMaximum("hold-person", 9), 8);
});

test("S3 & S4: Hold Person valida il vincolo spaziale pairwise-distance (max 9m)", () => {
  const valid = resolveSpellSaveTargeting({
    spellId: "hold-person",
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    pairwiseDistancesMeters: [
      { targetIds: ["target-a", "target-b"], distanceMeters: 8 },
    ],
  });
  assert.equal(valid.valid, true);

  const exceeded = resolveSpellSaveTargeting({
    spellId: "hold-person",
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    pairwiseDistancesMeters: [
      { targetIds: ["target-a", "target-b"], distanceMeters: 9.5 },
    ],
  });
  assert.equal(exceeded.valid, false);
  assert.ok(exceeded.errors.includes("pairwise-distance-exceeded"));

  const incomplete = resolveSpellSaveTargeting({
    spellId: "hold-person",
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    pairwiseDistancesMeters: [],
  });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.includes("pairwise-distance-unavailable"));
});

test("R4: Core Target Limit rifiuta target oltre il limite dello slot", () => {
  const tooManyBase = resolveSpellSaveTargeting({
    spellId: "hold-person",
    slotLevel: 2,
    targetIds: ["target-a", "target-b"],
  });
  assert.equal(tooManyBase.valid, false);
  assert.ok(tooManyBase.errors.includes("target-limit-exceeded"));

  const tooManyUpcast = resolveSpellSaveTargeting({
    spellId: "hold-person",
    slotLevel: 3,
    targetIds: ["target-a", "target-b", "target-c"],
    pairwiseDistancesMeters: [
      { targetIds: ["target-a", "target-b"], distanceMeters: 5 },
      { targetIds: ["target-a", "target-c"], distanceMeters: 5 },
      { targetIds: ["target-b", "target-c"], distanceMeters: 5 },
    ],
  });
  assert.equal(tooManyUpcast.valid, false);
  assert.ok(tooManyUpcast.errors.includes("target-limit-exceeded"));
});

test("R5: Unified Panel espone esiti TS e maxTargets corretto per Hold Person", () => {
  const contractSlot2 = buildSpellUnifiedPanelContract({
    spellId: "hold-person",
    phase: "cast",
    castContext: { slotLevel: 2 },
  });
  assert.equal(contractSlot2.presentation.inputs.outcomes.visible, true);
  assert.equal(contractSlot2.presentation.inputs.outcomes.required, true);
  assert.equal(contractSlot2.presentation.inputs.targets.maximum, 1);

  const contractSlot3 = buildSpellUnifiedPanelContract({
    spellId: "hold-person",
    phase: "cast",
    castContext: { slotLevel: 3 },
  });
  assert.equal(contractSlot3.presentation.inputs.targets.maximum, 2);
  assert.equal(contractSlot3.presentation.inputs.outcomes.visible, true);
  assert.equal(contractSlot3.presentation.inputs.outcomes.required, true);
});

test("R3: Target Matrix View Model disabilita checkbox non selezionate a limite raggiunto", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "hold-person",
    phase: "cast",
    castContext: { slotLevel: 3 },
  });
  const candidates = [
    { key: "a", label: "Bersaglio A" },
    { key: "b", label: "Bersaglio B" },
    { key: "c", label: "Bersaglio C" },
  ];

  const modelLimitReached = buildUnifiedPanelViewModel({
    contract,
    session: {
      casterId: "caster-1",
      slotLevel: 3,
      targetIds: ["a", "b"],
      outcomes: { a: "failed", b: "passed" },
    },
    targetCandidates: candidates,
  });

  const targetA = modelLimitReached.targets.candidates.find((c) => c.key === "a");
  const targetB = modelLimitReached.targets.candidates.find((c) => c.key === "b");
  const targetC = modelLimitReached.targets.candidates.find((c) => c.key === "c");

  assert.equal(targetA.selected, true);
  assert.equal(targetA.disabled, false);
  assert.equal(targetB.selected, true);
  assert.equal(targetB.disabled, false);
  assert.equal(targetC.selected, false);
  assert.equal(targetC.disabled, true);

  const modelOneSelected = buildUnifiedPanelViewModel({
    contract,
    session: {
      casterId: "caster-1",
      slotLevel: 3,
      targetIds: ["a"],
      outcomes: { a: "failed" },
    },
    targetCandidates: candidates,
  });

  const targetCUnblocked = modelOneSelected.targets.candidates.find((c) => c.key === "c");
  assert.equal(targetCUnblocked.disabled, false);
});

test("R6: Risoluzione esiti misti applica Paralizzato solo ai falliti", () => {
  const spell = getSpellDefinition("hold-person");
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster-1",
    targetIds: ["target-a", "target-b"],
    outcomes: {
      "target-a": "failed",
      "target-b": "passed",
    },
    automation: getAreaSaveAutomation("hold-person"),
    saveWorkflowRule: getSpellSaveWorkflowRule("hold-person"),
    slotLevel: 3,
    pairwiseDistancesMeters: [
      { targetIds: ["target-a", "target-b"], distanceMeters: 6 },
    ],
  });

  assert.equal(resolution.valid, true);
  assert.deepEqual(resolution.failedIds, ["target-a"]);
  assert.deepEqual(resolution.passedIds, ["target-b"]);
  assert.deepEqual(resolution.spellTargetIds, ["target-a"]);
  assert.equal(resolution.conditionApplications.length, 1);
  assert.equal(resolution.conditionApplications[0].conditionName, "Paralizzato");
  assert.deepEqual(resolution.conditionApplications[0].targetIds, ["target-a"]);
});

test("R7 & R9: Multi-target lifecycle, independent repeat save cleanup e concentrazione persistente", () => {
  const spell = getSpellDefinition("hold-person");
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target-a", "target-b"],
    outcomes: {
      "target-a": "failed",
      "target-b": "failed",
    },
    automation: getAreaSaveAutomation("hold-person"),
    saveWorkflowRule: getSpellSaveWorkflowRule("hold-person"),
    slotLevel: 3,
    pairwiseDistancesMeters: [
      { targetIds: ["target-a", "target-b"], distanceMeters: 6 },
    ],
  });

  assert.equal(resolution.valid, true);
  assert.deepEqual(resolution.spellTargetIds, ["target-a", "target-b"]);

  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "hold-person-instance",
    casterName: "Mago Caster",
    turns: 10,
    spellExpiry: { mode: "concentration" },
  });

  const initialItems = [
    { id: "caster", spells: [], conditions: [], concentrations: {} },
    { id: "target-a", spells: [], conditions: [] },
    { id: "target-b", spells: [], conditions: [] },
  ];

  const castPlan = buildEffectsMutationPlan(initialItems, preparedOperations(operations));

  // Verifico che entrambi i target abbiano la condizione e la spell
  const targetAState = state(castPlan, "target-a");
  const targetBState = state(castPlan, "target-b");
  const casterState = state(castPlan, "caster");

  assert.equal(targetAState.conditions.length, 1);
  assert.equal(targetAState.conditions[0].condition, "Paralizzato");
  assert.equal(targetAState.conditions[0].parentEffectId, "hold-person-instance");
  assert.equal(targetAState.conditions[0].saveReminder.ability, "wis");
  assert.equal(targetAState.conditions[0].saveReminder.timing, "turn-end");

  assert.equal(targetBState.conditions.length, 1);
  assert.equal(targetBState.conditions[0].condition, "Paralizzato");

  // Concentrazione caster include entrambi i target
  assert.ok(casterState.concentrations["blocca persone"]);
  assert.deepEqual(casterState.concentrations["blocca persone"].targets, ["target-a", "target-b"]);

  // Target A supera il repeat save: viene rimossa l'istanza della condizione da Target A
  const targetAConditionInstanceId = targetAState.conditions[0].id;
  const repeatSavePlanA = buildEffectsMutationPlan(castPlan.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target-a", instanceId: targetAConditionInstanceId }],
  }]);

  const targetAAfterSave = state(repeatSavePlanA, "target-a");
  const targetBAfterSave = state(repeatSavePlanA, "target-b");
  const casterAfterSaveA = state(repeatSavePlanA, "caster");

  // Target A è pulito
  assert.equal(targetAAfterSave.conditions.length, 0);
  assert.equal(targetAAfterSave.spells.length, 0);

  // Target B è ancora affetto
  assert.equal(targetBAfterSave.conditions.length, 1);
  assert.equal(targetBAfterSave.spells.length, 1);

  // Concentrazione del caster è ancora attiva con solo Target B
  assert.ok(casterAfterSaveA.concentrations["blocca persone"]);
  assert.deepEqual(casterAfterSaveA.concentrations["blocca persone"].targets, ["target-b"]);

  // Target B successivamente supera il repeat save
  const targetBConditionInstanceId = targetBAfterSave.conditions[0].id;
  const repeatSavePlanB = buildEffectsMutationPlan(repeatSavePlanA.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target-b", instanceId: targetBConditionInstanceId }],
  }]);

  const targetBAfterSaveB = state(repeatSavePlanB, "target-b");
  const casterAfterSaveB = state(repeatSavePlanB, "caster");

  // Target B è pulito
  assert.equal(targetBAfterSaveB.conditions.length, 0);
  assert.equal(targetBAfterSaveB.spells.length, 0);

  // Concentrazione del caster è completamente terminata
  assert.equal(Object.keys(casterAfterSaveB.concentrations || {}).length, 0);
});

test("R8: Slot downgrade non tronca automaticamente i target ma invalida la sessione finché non riconciliata", () => {
  const contractSlot2 = buildSpellUnifiedPanelContract({
    spellId: "hold-person",
    phase: "cast",
    castContext: { slotLevel: 2 },
  });

  const sessionOverLimit = {
    casterId: "caster-1",
    slotLevel: 2,
    targetIds: ["target-a", "target-b", "target-c"],
    outcomes: { "target-a": "failed", "target-b": "failed", "target-c": "failed" },
  };

  const modelOverLimit = buildSpellPanelViewModel(
    contractSlot2,
    sessionOverLimit,
  );
  assert.equal(modelOverLimit.validation.valid, false);
  assert.equal(modelOverLimit.validation.firstInvalidField, "targets");
  assert.ok(modelOverLimit.validation.errors.includes("target-limit-exceeded"));
  assert.deepEqual(sessionOverLimit.targetIds, ["target-a", "target-b", "target-c"]);

  const sessionReconciled = {
    ...sessionOverLimit,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
  };
  const modelReconciled = buildSpellPanelViewModel(
    contractSlot2,
    sessionReconciled,
  );
  assert.equal(modelReconciled.validation.valid, true);
});

test("Regression Control: Banishment e Bane conservano contratti e target scaling invariati", () => {
  const banishment = getSpellSaveWorkflowRule("banishment");
  assert.equal(banishment.ability, "cha");
  assert.equal(getSpellSaveTargetMaximum("banishment", 4), 1);
  assert.equal(getSpellSaveTargetMaximum("banishment", 5), 2);

  const bane = getSpellSaveWorkflowRule("bane");
  assert.equal(bane.ability, "cha");
  assert.equal(getSpellSaveTargetMaximum("bane", 1), 3);
  assert.equal(getSpellSaveTargetMaximum("bane", 2), 4);
});

// ==================================================
// SP-B03A.1 — VFX PLAYBACK TESTS (V1–V8)
// ==================================================

function runtimeFor(targetIds = ["target-a"]) {
  return {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => ids.map((id) => ({ id, name: id, position: { x: 0, y: 0 } })),
  };
}

test("V1: Hold Person genera matchedVisualContext valido per target fallito", async () => {
  const command = areaCommandFor("hold-person", {
    slotLevel: 2,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    placement: null,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeFor(["target-a"]));

  assert.equal(plan.valid, true, plan.errors?.map((e) => e.message).join(", "));
  assert.ok(plan.matchedVisualContext, "matchedVisualContext must not be null for hold-person");
  assert.equal(plan.matchedVisualContext.spellId, "hold-person");
  assert.equal(plan.matchedVisualContext.casterId, "caster-1");
  assert.deepEqual(plan.matchedVisualContext.targetIds, ["target-a"]);
  assert.equal(plan.matchedVisualContext.sceneEpoch, 3);
});

test("V2: Hold Person Multi-Target (Slot 3) genera matchedVisualContext con tutti i bersagli affetti", async () => {
  const command = areaCommandFor("hold-person", {
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "failed" },
    placement: null,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeFor(["target-a", "target-b"]));

  assert.equal(plan.valid, true);
  assert.ok(plan.matchedVisualContext);
  assert.deepEqual(plan.matchedVisualContext.targetIds, ["target-a", "target-b"]);
});

test("V3: Hold Person Mixed Outcomes include solo i bersagli che hanno fallito il TS", async () => {
  const command = areaCommandFor("hold-person", {
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
    placement: null,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeFor(["target-a", "target-b"]));

  assert.equal(plan.valid, true);
  assert.ok(plan.matchedVisualContext);
  assert.deepEqual(plan.matchedVisualContext.targetIds, ["target-a"]);
});

test("V4: Banishment conserva matchedVisualContext target-based", async () => {
  const command = areaCommandFor("banishment", {
    slotLevel: 4,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    targetContexts: { "target-a": { planeOrigin: "current-plane" } },
    placement: null,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeFor(["target-a"]));

  assert.equal(plan.valid, true);
  assert.ok(plan.matchedVisualContext);
  assert.equal(plan.matchedVisualContext.spellId, "banishment");
  assert.deepEqual(plan.matchedVisualContext.targetIds, ["target-a"]);
});

test("V5: Placed Matched Visual (Web) genera matchedVisualContext con placement preview e non entra nel ramo discrete", async () => {
  const placement = {
    status: "confirmed",
    confirmed: true,
    ruleId: "web:cast",
    spellId: "web",
    casterId: "caster-1",
    targetLocked: true,
    targetIds: ["target-a"],
    preview: {
      type: "square",
      start: { x: 0, y: 0 },
      end: { x: 150, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
      targetIds: ["target-a"],
      targetLocked: true,
    },
  };
  const command = areaCommandFor("web", {
    slotLevel: 2,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    placement,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeFor(["target-a"]));

  assert.equal(plan.valid, true);
  assert.ok(plan.matchedVisualContext);
  assert.equal(plan.matchedVisualContext.spellId, "web");
  assert.ok(plan.matchedVisualContext.preview, "placed spell must preserve preview");
  assert.equal(plan.matchedVisualContext.preview.type, "square");
});

test("Web: initialResolution none non applica Trattenuto al cast", async () => {
  const placement = {
    status: "confirmed",
    confirmed: true,
    ruleId: "web:cast",
    spellId: "web",
    casterId: "caster-1",
    targetLocked: true,
    targetIds: ["target-a"],
    preview: {
      type: "square",
      start: { x: 0, y: 0 },
      end: { x: 150, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
      targetIds: ["target-a"],
      targetLocked: true,
    },
  };
  const command = areaCommandFor("web", {
    slotLevel: 2,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    placement,
  });
  const items = [
    { id: "caster-1", name: "Caster", position: { x: 0, y: 0 }, metadata: {} },
    { id: "target-a", name: "Target", position: { x: 0, y: 0 }, metadata: {} },
  ];
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    ...runtimeFor(["target-a"]),
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    validateSpatial: async () => ({ valid: true, errors: [] }),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "web-instance",
    targetItems: items,
  });

  assert.equal(plan.valid, true, plan.errors?.map((entry) => entry.message).join(", "));
  assert.equal(
    plan.effectOperations.some((operation) => operation.conditionName === "Trattenuto"),
    false,
  );
  assert.equal(
    plan.effectOperations.some((operation) => (
      operation.type === "spell:upsert"
      && operation.targetIds?.includes("target-a")
    )),
    false,
  );
  assert.ok(
    plan.effectOperations.some((operation) => (
      operation.type === "spell:upsert"
      && operation.targetIds?.includes("caster-1")
    )),
  );
  assert.ok(
    plan.effectOperations.some((operation) => operation.conditionName === "Terreno difficile / Ragnatela"),
  );
});

test("V6: Hold Person senza bersagli falliti produce matchedVisualContext null", async () => {
  const command = areaCommandFor("hold-person", {
    slotLevel: 2,
    targetIds: ["target-a"],
    outcomes: { "target-a": "passed" },
    placement: null,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeFor(["target-a"]));

  assert.equal(plan.valid, true);
  assert.equal(plan.matchedVisualContext, null);
});

test("V8: Visual Event & Cleanup Contract per Hold Person", () => {
  const startEvent = buildMatchedVisualEvent({
    spellId: "hold-person",
    eventId: "event-1",
    lifecycleId: "lifecycle-1",
    casterId: "caster-1",
    caster: { id: "caster-1", center: { x: 100, y: 100 }, diameter: 200 },
    targets: [
      { id: "target-a", center: { x: 500, y: 100 }, diameter: 150 },
      { id: "target-b", center: { x: 800, y: 100 }, diameter: 150 },
    ],
    targetIds: ["target-a", "target-b"],
    sceneDpi: 100,
  });

  assert.ok(startEvent);
  const targetALayers = startEvent.layers.filter((l) => l.targetId === "target-a");
  const targetBLayers = startEvent.layers.filter((l) => l.targetId === "target-b");
  assert.equal(targetALayers.length, 2, "target-a must have intro and loop layers");
  assert.equal(targetBLayers.length, 2, "target-b must have intro and loop layers");

  const endEvent = buildMatchedVisualEvent({
    spellId: "hold-person",
    eventId: "event-end",
    lifecycleId: "lifecycle-1",
    mode: "end",
    casterId: "caster-1",
    targets: [{ id: "target-a", center: { x: 500, y: 100 }, diameter: 150 }],
    targetIds: ["target-a"],
    sceneDpi: 100,
  });
  assert.equal(endEvent.mode, "end");
  assert.deepEqual(endEvent.layers, []);
});
