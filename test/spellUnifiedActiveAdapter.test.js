import assert from "node:assert/strict";
import test from "node:test";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  getSpellUnifiedActiveActionDeclarations,
} from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellUnifiedActivePopoverRequest,
  buildSpellUnifiedPreparedPopoverRequest,
  buildSpellUnifiedActiveResolutionPayload,
  buildSpellUnifiedPreparedResolutionRequest,
  executeSpellUnifiedActiveAction,
  normalizeSpellUnifiedActiveContext,
  SPELL_UNIFIED_ACTIVE_STATUS,
  validateSpellUnifiedActiveContext,
} from "../src/spellUnifiedActiveAdapter.js";

function actionFor(spellId, actionId) {
  const spell = getSpellDefinition(spellId);
  assert.ok(spell, `spell ${spellId} is present`);
  const action = spell.activeActions.find((entry) => entry.id === actionId);
  assert.ok(action, `action ${actionId} is present`);
  return action;
}

function overviewFor(spellId, action, context = {}) {
  const spell = getSpellDefinition(spellId);
  return {
    key: `instance:${context.instanceId || "instance-1"}`,
    name: spell.displayName,
    instanceId: context.instanceId || "instance-1",
    actions: [action],
    context: {
      spellId,
      instanceId: context.instanceId || "instance-1",
      casterId: context.casterId || "caster-1",
      casterName: "Caster",
      name: spell.displayName,
      storedName: spell.displayName,
      castContext: { slotLevel: 5, ...(context.castContext || {}) },
      appliedAt: { turnKey: "round-2:caster-1" },
      targetIds: context.targetIds || [],
      targetNames: context.targetNames || [],
      effectInstances: context.effectInstances || [],
      zoneItemId: context.zoneItemId || "",
      parentZoneId: context.parentZoneId || context.zoneItemId || "",
      sceneEpoch: context.sceneEpoch ?? 7,
      revision: context.revision ?? 11,
      turnKey: "round-2:caster-1",
      ...(context.extra || {}),
    },
  };
}

test("il contratto conserva le azioni ibride senza introdurre stato runtime", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
  });
  const action = contract.presentation.activeActions
    .find((entry) => entry.id === "storm-sphere-lightning");
  assert.equal(action.resolution.kind, "single-attack");
  assert.equal(action.requirements.zoneRoot, true);
  assert.equal(action.capabilities.attack, true);
  assert.equal(action.targeting.subjectMode, "none");
  assert.equal(action.zone.root, true);
  assert.equal(action.availability.turnStartPrompt, true);
  assert.equal(contract.execution.activeResolution, true);
  assert.equal(Object.prototype.hasOwnProperty.call(action, "feedback"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(action, "activationId"), false);
});

test("prepare → resolve costruisce la richiesta compatibile con il popup esistente", () => {
  const action = {
    id: "resolve-prepared",
    type: "resolve",
    subjectMode: "selected",
    requiresTargets: true,
  };
  const overview = overviewFor("phb2014-raffica-di-spine", action, {
    instanceId: "ready-1",
    casterId: "caster-1",
    targetIds: ["caster-1"],
    castContext: { phase: "prepare", slotLevel: 2 },
  });
  const built = buildSpellUnifiedPreparedResolutionRequest({
    overview,
    action,
    targetIds: ["target-1"],
    choiceValue: "damage",
    sceneEpoch: 7,
  });
  assert.equal(built.status, "request-ready");
  assert.equal(built.request.casterId, "caster-1");
  assert.deepEqual(built.request.targetIds, ["target-1"]);
  assert.equal(built.request.castContext.phase, "resolve");
  assert.equal(built.request.activeConcentration.instanceId, "ready-1");
});

test("la risoluzione prepared usa il popup mobile shared con payload canonico", () => {
  const spell = getSpellDefinition("phb2014-punizione-incandescente");
  const action = {
    id: "resolve-prepared",
    type: "resolve",
    subjectMode: "selected",
    requiresTargets: true,
  };
  const overview = overviewFor(spell.id, action, {
    instanceId: "prepared-mobile-1",
    casterId: "caster-1",
    castContext: { phase: "prepare", slotLevel: 2 },
  });
  const popover = buildSpellUnifiedPreparedPopoverRequest(overview);
  const payload = JSON.parse(new URL(`https://local.test${popover.url}`).searchParams.get("payload"));
  assert.match(popover.url, /\/spell-active-resolution\.html\?payload=/);
  assert.equal(popover.width, 360);
  assert.equal(payload.mode, "prepared");
  assert.equal(payload.instanceId, "prepared-mobile-1");
  assert.equal(payload.actionId, "resolve-prepared");
  assert.equal(payload.action.resolutionKind, "prepared");
  assert.equal(payload.popoverId, popover.id);
});

test("Colpo dello Zefiro usa il popup mobile senza trasformare l'azione in un next-hit", () => {
  const spell = getSpellDefinition("xanathar-colpo-dello-zefiro");
  const action = spell.activeActions[0];
  const overview = overviewFor(spell.id, action, {
    instanceId: "zephyr-mobile-1",
    casterId: "caster-1",
    effectInstances: [{
      itemId: "caster-1",
      instanceId: "zephyr-ready",
      effectId: "zephyr-strike",
      active: true,
    }],
  });
  const popover = buildSpellUnifiedPreparedPopoverRequest(overview);
  const payload = JSON.parse(new URL(`https://local.test${popover.url}`).searchParams.get("payload"));

  assert.match(popover.url, /\/spell-active-resolution\.html\?payload=/);
  assert.equal(payload.mode, "prepared");
  assert.equal(payload.actionId, "zephyr-strike-attack");
  assert.equal(payload.action.type, "manual");
  assert.equal(payload.action.resolutionKind, undefined);
  assert.equal(payload.action.subjectMode, "caster");
});

test("payload single-attack conserva istanza, caster, slot, epoch, revisione e root", () => {
  const action = actionFor("xanathar-sfera-della-tempesta", "storm-sphere-lightning");
  const overview = overviewFor(
    "xanathar-sfera-della-tempesta",
    action,
    { instanceId: "storm-1", zoneItemId: "root-1", revision: 19 },
  );
  const built = buildSpellUnifiedActiveResolutionPayload({
    overview,
    action,
    actionId: action.id,
    sceneEpoch: 7,
    revision: 19,
    turnKey: "round-2:caster-1",
  });
  assert.equal(built.status, "payload-ready");
  assert.equal(built.payload.instanceId, "storm-1");
  assert.equal(built.payload.casterId, "caster-1");
  assert.equal(built.payload.slotLevel, 5);
  assert.equal(built.payload.sceneEpoch, 7);
  assert.equal(built.payload.revision, 19);
  assert.equal(built.payload.zoneItemId, "root-1");
  assert.equal(built.payload.turnKey, "round-2:caster-1");
  const popover = buildSpellUnifiedActivePopoverRequest(built.payload);
  assert.match(popover.url, /spell-active-resolution\.html\?payload=/);
  assert.equal(popover.payload.actionId, action.id);
});

test("save-area, child-zone e single-attack delegano allo stesso popup attivo", async () => {
  const cases = [
    ["call-lightning", "call-lightning-strike", "save-area", ""],
    ["xanathar-sfera-della-tempesta", "storm-sphere-lightning", "single-attack", "root-1"],
    ["control-water", "control-water-whirlpool", "child-zone", "root-1"],
  ];
  for (const [spellId, actionId, resolutionKind, zoneItemId] of cases) {
    const action = actionFor(spellId, actionId);
    const overview = overviewFor(spellId, action, { zoneItemId });
    let payload = null;
    const result = await executeSpellUnifiedActiveAction({
      overview,
      action,
      actionId,
      sceneEpoch: 7,
      runtime: {
        openActiveResolution: (nextPayload) => { payload = nextPayload; },
      },
    });
    assert.equal(result.status, SPELL_UNIFIED_ACTIVE_STATUS.POPUP_OPENED, spellId);
    assert.equal(payload.action.resolutionKind, resolutionKind, spellId);
    assert.equal(payload.instanceId, "instance-1", spellId);
  }
});

test("root mancante, azione non disponibile e stato obsoleto sono rifiutati prima della delega", () => {
  const action = actionFor("xanathar-sfera-della-tempesta", "storm-sphere-lightning");
  const withoutRoot = overviewFor("xanathar-sfera-della-tempesta", action);
  const missingRoot = validateSpellUnifiedActiveContext({
    overview: withoutRoot,
    action,
    actionId: action.id,
    sceneEpoch: 7,
  });
  assert.equal(missingRoot.valid, false);
  assert.equal(missingRoot.errors.some((error) => error.code === "active-zone-root-required"), true);

  const unavailable = overviewFor("xanathar-sfera-della-tempesta", {
    ...action,
    available: false,
    disabledReason: "Disponibile dal prossimo turno.",
  }, { zoneItemId: "root-1" });
  const unavailableResult = validateSpellUnifiedActiveContext({
    overview: unavailable,
    action: unavailable.actions[0],
    actionId: action.id,
    sceneEpoch: 7,
  });
  assert.equal(unavailableResult.valid, false);
  assert.equal(unavailableResult.errors.some((error) => error.code === "active-action-not-available"), true);

  const stale = validateSpellUnifiedActiveContext({
    overview: overviewFor("xanathar-sfera-della-tempesta", action, {
      zoneItemId: "root-1",
      revision: 4,
    }),
    action,
    actionId: action.id,
    sceneEpoch: 7,
    currentSceneEpoch: 8,
    currentRevision: 5,
  });
  assert.equal(stale.valid, false);
  assert.equal(stale.errors.some((error) => error.code === "active-scene-epoch-stale"), true);
  assert.equal(stale.errors.some((error) => error.code === "active-revision-stale"), true);
});

test("azione manuale, movimento zona e popup annullato non duplicano la risoluzione", async () => {
  const manualAction = actionFor("heat-metal", "heat-metal-repeat");
  const manualOverview = overviewFor("heat-metal", manualAction, {
    targetIds: ["target-1"],
  });
  let activeCalls = 0;
  const manualResult = await executeSpellUnifiedActiveAction({
    overview: manualOverview,
    action: manualAction,
    actionId: manualAction.id,
    selectedTargetIds: ["target-1"],
    sceneEpoch: 7,
    runtime: {
      activeExecutor: async (input) => {
        activeCalls += 1;
        assert.equal(input.actionId, "heat-metal-repeat");
        const execution = ["target-1"];
        Object.defineProperties(execution, {
          historyEntryId: { value: "history-active" },
          undoAvailable: { value: true },
        });
        return execution;
      },
    },
  });
  assert.equal(manualResult.status, SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED);
  assert.deepEqual(manualResult.changedIds, ["target-1"]);
  assert.equal(manualResult.historyEntryId, "history-active");
  assert.equal(manualResult.undoAvailable, true);
  assert.equal(activeCalls, 1);

  const declarations = getSpellUnifiedActiveActionDeclarations("moonbeam");
  const movement = declarations.find((entry) => entry.resolutionKind === "zone-movement");
  assert.ok(movement);
  const movementOverview = overviewFor("moonbeam", movement, { zoneItemId: "moon-root" });
  let movementInput = null;
  const movementResult = await executeSpellUnifiedActiveAction({
    overview: movementOverview,
    action: movement,
    actionId: movement.id,
    sceneEpoch: 7,
    runtime: {
      zoneMovementExecutor: async (input) => {
        movementInput = input;
        return ["moon-root"];
      },
    },
  });
  assert.equal(movementResult.status, SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED);
  assert.equal(movementInput.action.ruleId, "moonbeam:cast");
  assert.equal(movementInput.action.zoneItemId, "moon-root");

  const direction = actionFor("gust-of-wind", "gust-of-wind-direction");
  const directionOverview = overviewFor("gust-of-wind", direction, {
    zoneItemId: "gust-root",
  });
  let directionInput = null;
  const directionResult = await executeSpellUnifiedActiveAction({
    overview: directionOverview,
    action: direction,
    actionId: direction.id,
    sceneEpoch: 7,
    runtime: {
      zoneDirectionExecutor: async (input) => {
        directionInput = input;
        return ["gust-root"];
      },
    },
  });
  assert.equal(directionResult.status, SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED);
  assert.equal(directionInput.action.ruleId, "gust-of-wind:cast");
  assert.equal(directionInput.action.zoneItemId, "gust-root");

  let executorCalled = false;
  const popupResult = await executeSpellUnifiedActiveAction({
    overview: overviewFor(
      "xanathar-sfera-della-tempesta",
      actionFor("xanathar-sfera-della-tempesta", "storm-sphere-lightning"),
      { zoneItemId: "root-1" },
    ),
    action: actionFor("xanathar-sfera-della-tempesta", "storm-sphere-lightning"),
    actionId: "storm-sphere-lightning",
    sceneEpoch: 7,
    runtime: {
      openActiveResolution: async () => {},
      activeExecutor: async () => { executorCalled = true; return ["target-1"]; },
    },
  });
  assert.equal(popupResult.status, SPELL_UNIFIED_ACTIVE_STATUS.POPUP_OPENED);
  assert.equal(popupResult.changedIds.length, 0);
  assert.equal(executorCalled, false);
});

test("Riscaldare il metallo apre il popup single-save senza falso successo", async () => {
  const action = actionFor("heat-metal", "heat-metal-repeat");
  const overview = overviewFor("heat-metal", action, {
    targetIds: ["target-1"],
  });
  let payload = null;
  let activeCalls = 0;
  const result = await executeSpellUnifiedActiveAction({
    overview,
    action,
    actionId: action.id,
    selectedTargetIds: ["target-1"],
    sceneEpoch: 7,
    runtime: {
      openActiveResolution: async (nextPayload) => { payload = nextPayload; },
      activeExecutor: async () => { activeCalls += 1; return ["target-1"]; },
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_ACTIVE_STATUS.POPUP_OPENED);
  assert.equal(activeCalls, 0);
  assert.equal(payload.action.resolutionKind, "single-save");
  assert.equal(payload.action.requiresZoneRoot, false);
  assert.equal(payload.action.economy, "bonus-action");
  assert.equal(payload.action.save.ability, "con");
  assert.equal(payload.action.attack, undefined);
  assert.deepEqual(payload.action.damage, {
    formula: "2d8",
    type: "fuoco",
    onSave: "full",
    baseSlot: 2,
    additionalPerSlotAbove: 1,
  });
  assert.equal(payload.action.effectOn, undefined);
});

test("il provider normalizzato ricostruisce il contesto senza imporre ID alla view", () => {
  const context = normalizeSpellUnifiedActiveContext({
    context: {
      spellId: "call-lightning",
      instanceId: "instance-1",
      casterId: "caster-1",
      targetIds: ["target-1"],
      targetNames: ["Bersaglio"],
      zoneItemId: "root-1",
      sceneEpoch: 7,
      revision: 2,
    },
  });
  assert.equal(context.targets.get("target-1"), "Bersaglio");
  assert.equal(context.parentZoneId, "root-1");
  assert.equal(context.sceneEpoch, 7);
  assert.equal(context.revision, 2);
});
