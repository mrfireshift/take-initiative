import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellUnifiedPanelContract,
  buildSpellPanelViewModel,
  changeSpellPanelActiveAction,
  changeSpellPanelPhase,
  changeSpellPanelSpell,
  changeSpellPanelVariant,
  createSpellPanelSession,
  updateSpellPanelSession,
  SPELL_UNIFIED_PANEL_LANES,
  SPELL_UNIFIED_TARGETING_MODES,
  SPELL_PANEL_UNDO_STATES,
} from "../src/spellUnifiedPanelCore.js";

function has(values, value) {
  assert.equal(values.includes(value), true, `missing ${value}`);
}

test("Palla di fuoco espone placement geometrico e transazione HP", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "fireball" });

  assert.deepEqual(model.presentation.phase.options.map((phase) => phase.value), ["cast"]);
  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.placement.ruleId, "fireball:cast");
  assert.equal(model.presentation.placement.policy, "required");
  assert.equal(model.presentation.placement.required, true);
  assert.equal(model.presentation.duration.policy, "instantaneous");
  assert.equal(model.presentation.slot.min, 3);
  assert.equal(model.presentation.slot.max, 9);
  assert.equal(model.presentation.slot.default, 3);
  assert.equal(model.presentation.inputs.damage.required, true);
  has(model.presentation.controls, "placement");
  has(model.presentation.controls, "save-outcomes");
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
  has(model.execution.lanes, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);
  assert.equal(model.execution.hasHP, true);
  assert.equal(model.execution.hasZones, false);
  assert.equal(model.execution.hasTokens, false);
  assert.equal(model.execution.requiresCompositeUndo, true);
});

test("Anatema espone targeting discreto e workflow TS senza HP", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "bane" });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(model.presentation.placement.available, false);
  assert.equal(model.presentation.placement.policy, "unavailable");
  assert.equal(model.presentation.concentration.required, true);
  assert.equal(model.presentation.duration.defaultTurns, 10);
  has(model.presentation.controls, "caster");
  has(model.presentation.controls, "targets");
  has(model.presentation.controls, "save-workflow");
  has(model.presentation.controls, "save-outcomes");
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
  assert.equal(model.execution.hasHP, false);
  assert.equal(model.execution.hasZones, false);
  assert.equal(model.execution.hasTokens, false);
  assert.equal(model.execution.requiresCompositeUndo, true);
});

test("Anatema Elementale espone una sola opzione per tipo di danno", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: "xanathar-anatema-elementale",
  });
  const values = model.presentation.variant.options.map((option) => option.value);

  assert.deepEqual(values, ["acido", "freddo", "fulmine", "fuoco", "tuono"]);
  assert.equal(new Set(values).size, values.length);
});

test("Allucinazione di Forza combina bersaglio manuale e zona persistente", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: "phb2014-allucinazione-di-forza",
  });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.targeting.selectionMode, "manual");
  assert.equal(model.presentation.targeting.limit.maximum, 1);
  assert.deepEqual(model.presentation.targeting.spatialRules, {
    mode: "caster-range",
    maxMeters: 18,
  });
  assert.equal(model.presentation.placement.ruleId, "phb2014-allucinazione-di-forza:cast");
  assert.equal(model.presentation.placement.policy, "required");
  assert.equal(model.presentation.inputs.damage.required, false);
  assert.equal(model.execution.hasZones, true);
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
});

test("Catena di fulmini usa targeting discreto e conserva la lane HP area", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "chain-lightning" });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(model.presentation.placement.available, false);
  assert.equal(model.presentation.caster.required, true);
  assert.equal(model.presentation.targeting.primaryTarget.required, true);
  assert.equal(model.presentation.targeting.primaryTarget.rangeMeters, 45);
  assert.deepEqual(model.presentation.targeting.spatialRules, {
    mode: "primary-and-secondary-range",
    primaryRangeMeters: 45,
    secondaryRangeMeters: 9,
    selectionMode: "primary-then-secondary",
    unit: "meters",
    source: "chain-lightning-targeting",
  });
  assert.equal(model.presentation.targeting.limit.maximum, 4);
  has(model.presentation.controls, "targets");
  has(model.presentation.controls, "save-outcomes");
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
  assert.equal(model.execution.hasHP, true);
  assert.equal(model.execution.hasZones, false);
  assert.equal(model.execution.hasTokens, false);
});

test("Invocare il fulmine espone il danno del primo fulmine", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: "call-lightning",
    phase: "cast",
    castContext: { slotLevel: 3 },
  });

  assert.equal(model.presentation.inputs.damage.required, true);
  assert.equal(model.presentation.inputs.damage.visible, true);
  assert.equal(model.execution.castHasHP, true);
  assert.equal(model.execution.deferredHP, true);
});

test("gli input danno e l'upcasting usano le dichiarazioni del workflow", () => {
  const command = buildSpellUnifiedPanelContract({
    spellId: "command",
    castContext: { slotLevel: 3 },
  });
  assert.equal(command.presentation.targeting.limit.maximum, 3);

  const whip = buildSpellUnifiedPanelContract({
    spellId: "legacy-tashas-mind-whip",
    castContext: { slotLevel: 5 },
  });
  assert.equal(whip.execution.lane, "area-transaction");
  assert.equal(whip.presentation.inputs.damage.visible, true);
  assert.equal(whip.presentation.targeting.limit.maximum, 4);

  const acidArrow = buildSpellUnifiedPanelContract({
    spellId: "acid-arrow",
    castContext: { slotLevel: 3 },
  });
  assert.equal(acidArrow.execution.lane, "area-transaction");
  assert.equal(acidArrow.presentation.inputs.damage.required, true);
  assert.equal(acidArrow.presentation.inputs.variant.required, true);
});

test("Aculeo Mentale usa il workflow TS/danno senza sagoma", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: "xanathar-aculeo-mentale",
    castContext: { slotLevel: 4 },
  });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(model.presentation.targeting.limit.maximum, 1);
  assert.deepEqual(model.presentation.targeting.spatialRules, {
    mode: "caster-range",
    maxMeters: 18,
  });
  assert.equal(model.presentation.placement.available, false);
  assert.equal(model.presentation.inputs.damage.required, true);
  assert.equal(model.presentation.inputs.outcomes.required, true);
  assert.equal(model.execution.hasHP, true);
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
});

test("Arma magica limita la selezione a un bersaglio", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "magic-weapon" });

  assert.equal(model.presentation.targeting.limit.maximum, 1);
  assert.equal(model.presentation.targeting.limit.source, "spell-targeting");
  assert.equal(model.presentation.inputs.targets.required, true);
  assert.equal(model.presentation.placement.available, false);
});

test("Benedizione scala il limite dei bersagli senza introdurre TS", () => {
  const base = buildSpellUnifiedPanelContract({
    spellId: "bless",
    castContext: { slotLevel: 1 },
  });
  const upcast = buildSpellUnifiedPanelContract({
    spellId: "bless",
    castContext: { slotLevel: 4 },
  });

  assert.equal(base.presentation.targeting.limit.maximum, 3);
  assert.equal(upcast.presentation.targeting.limit.maximum, 6);
  assert.equal(upcast.presentation.inputs.outcomes.visible, false);
  assert.equal(upcast.presentation.inputs.targets.maximum, 6);
  assert.equal(upcast.execution.lane, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);
});

test("Mano arcana compone placement pedina, HP e azioni della pedina", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "arcane-hand" });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.placement.mode, "board-token");
  assert.equal(model.presentation.placement.ruleId, "arcane-hand:board-token");
  assert.equal(model.presentation.placement.policy, "required");
  assert.equal(model.presentation.placement.required, true);
  assert.deepEqual(
    model.presentation.activeActions.map((action) => action.id),
    [
      "arcane-hand-interposing",
      "arcane-hand-forceful",
      "arcane-hand-grasping",
      "arcane-hand-clenched",
    ],
  );
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);
  has(model.execution.lanes, SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION);
  assert.equal(model.execution.hasHP, true);
  assert.equal(model.execution.hasTokens, true);
  assert.equal(model.execution.hasZones, false);
  assert.equal(model.execution.requiresCompositeUndo, true);

  const action = buildSpellUnifiedPanelContract({
    spellId: "arcane-hand",
    actionId: "arcane-hand-clenched",
  });
  assert.equal(action.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(action.execution.lane, SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION);
  assert.equal(action.execution.selectedActionId, "arcane-hand-clenched");
});

test("Animare oggetti espone composizione obbligatoria e placement batch", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "animate-objects",
    castContext: {
      slotLevel: 5,
      animatedObjects: { counts: { tiny: 2, large: 2 } },
    },
  });

  assert.equal(contract.presentation.placement.mode, "board-token");
  assert.equal(contract.presentation.placement.ruleId, "animate-objects:board-token");
  assert.equal(contract.presentation.composition.required, true);
  assert.deepEqual(contract.presentation.composition.selected, {
    counts: { tiny: 2, large: 2 },
  });
  assert.equal(contract.presentation.composition.maximumCost, 10);
  assert.equal(contract.presentation.composition.options.find((option) => option.id === "large").cost, 4);
  has(contract.presentation.controls, "composition");
  has(contract.presentation.controls, "placement");
  assert.equal(contract.execution.hasTokens, true);
  assert.equal(contract.execution.hasHP, true);
  assert.equal(contract.execution.lane, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);

  const empty = buildSpellPanelViewModel(
    buildSpellUnifiedPanelContract({ spellId: "animate-objects" }),
    { casterId: "caster", slotLevel: 5 },
  );
  assert.equal(empty.validation.firstInvalidField, "composition");
  assert.equal(empty.primaryAction.disabled, true);

  const invalid = buildSpellPanelViewModel(contract, {
    casterId: "caster",
    slotLevel: 5,
    castContext: { animatedObjects: { counts: { huge: 2 } } },
  });
  assert.equal(invalid.validation.firstInvalidField, "composition");
  assert.equal(invalid.validation.errors.includes("composition-invalid"), true);
});

test("il contesto della composizione sopravvive al cambio slot e si azzera cambiando spell", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "animate-objects",
    castContext: { slotLevel: 5, animatedObjects: { counts: { small: 3 } } },
  });
  const session = createSpellPanelSession({
    contract,
    casterId: "caster",
    slotLevel: 5,
    castContext: { animatedObjects: { counts: { small: 3 } } },
  });
  const slotChanged = updateSpellPanelSession(session, {
    slotLevel: 6,
    castContext: { slotLevel: 6 },
  });
  assert.deepEqual(slotChanged.castContext.animatedObjects, {
    counts: { small: 3 },
  });
  const switched = changeSpellPanelSpell(
    slotChanged,
    buildSpellUnifiedPanelContract({ spellId: "arcane-hand" }),
  );
  assert.equal(switched.castContext.animatedObjects, undefined);
});

test("Raffica di Spine separa preparazione e risoluzione", () => {
  const prepare = buildSpellUnifiedPanelContract({
    spellId: "phb2014-raffica-di-spine",
  });
  assert.equal(prepare.presentation.phase.selected, "prepare");
  assert.equal(prepare.presentation.subjectMode, "caster");
  assert.equal(prepare.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.NONE);
  assert.equal(prepare.presentation.placement.available, false);
  assert.equal(prepare.presentation.inputs.damage.required, false);
  assert.equal(prepare.presentation.capabilities.manualSpellEffect.available, true);
  assert.equal(prepare.execution.lane, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);
  assert.deepEqual(prepare.presentation.controls, ["phase", "caster", "slot-level"]);

  const resolve = buildSpellUnifiedPanelContract({
    spellId: "phb2014-raffica-di-spine",
    phase: "resolve",
  });
  assert.equal(resolve.presentation.phase.selected, "resolve");
  assert.equal(resolve.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(resolve.presentation.placement.ruleId, "phb2014-raffica-di-spine:cast");
  assert.equal(resolve.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
  has(resolve.presentation.controls, "save-outcomes");
});

test("Investitura della Fiamma distingue aura e linea attiva", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: "xanathar-investitura-della-fiamma",
  });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.placement.ruleId, "xanathar-investitura-della-fiamma:aura");
  assert.equal(model.presentation.placement.policy, "automatic");
  assert.equal(model.presentation.placement.required, false);
  assert.equal(model.execution.hasZones, true);
  assert.equal(model.execution.hasHP, true);
  has(model.execution.lanes, SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION);

  const action = buildSpellUnifiedPanelContract({
    spellId: "xanathar-investitura-della-fiamma",
    actionId: "flame-investiture-line",
  });
  assert.equal(action.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(action.presentation.placement.ruleId, "xanathar-investitura-della-fiamma:linea-di-fuoco");
  assert.equal(action.presentation.placement.required, true);
  has(action.presentation.controls, "save-outcomes");
  assert.equal(action.execution.lane, SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION);
});

test("Sfera della Tempesta distingue zona iniziale e fulmine su bersaglio", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
  });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.placement.ruleId, "xanathar-sfera-della-tempesta:cast");
  assert.equal(model.presentation.placement.policy, "optional");
  assert.equal(model.execution.hasZones, true);
  assert.equal(model.execution.hasHP, true);
  assert.equal(model.presentation.capabilities.zoneTrigger, true);
  assert.equal(model.presentation.zoneTrigger.runtimeActivation, true);
  has(model.presentation.controls, "save-outcomes");
  has(model.presentation.controls, "active-action");

  const action = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
    actionId: "storm-sphere-lightning",
  });
  assert.equal(action.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(action.presentation.placement.available, false);
  has(action.presentation.controls, "targets");
  has(action.presentation.controls, "attack-outcomes");
  assert.equal(action.execution.lane, SPELL_UNIFIED_PANEL_LANES.ACTIVE_RESOLUTION);
});

test("Il contratto statico non contiene stato runtime della sessione", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "fireball" });

  for (const key of [
    "targetIds",
    "outcomes",
    "placementConfirmed",
    "damageValue",
    "feedback",
    "errors",
    "loading",
    "activationId",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(model, key), false, key);
  }
  assert.equal(model.execution.undo.capable, true);
  assert.equal(Object.prototype.hasOwnProperty.call(model.execution.undo, "available"), false);
});

test("La sessione resetta i dipendenti quando Raffica di Spine cambia fase", () => {
  const prepare = buildSpellUnifiedPanelContract({ spellId: "phb2014-raffica-di-spine" });
  const resolve = buildSpellUnifiedPanelContract({
    spellId: "phb2014-raffica-di-spine",
    phase: "resolve",
  });
  const session = createSpellPanelSession({
    contract: prepare,
    casterId: "caster-1",
    activeInstanceId: "storm-1",
    activeActionId: "old-action",
    activeActionState: {
      state: "opened",
      instanceId: "storm-1",
      actionId: "old-action",
    },
    targetIds: ["target-1"],
    primaryTargetId: "target-1",
    outcomes: { "target-1": "failed" },
    placement: { state: "confirmed", preview: { x: 1, y: 2 } },
    damageValue: 12,
    feedback: { state: "error", message: "old" },
    commitState: { state: "committed", activationId: "activation-old" },
    undoState: { state: "available", available: true, activationId: "activation-old" },
  });
  const changed = changeSpellPanelPhase(session, resolve, "resolve", {
    validCasterIds: ["caster-1"],
  });

  assert.equal(changed.phase, "resolve");
  assert.equal(changed.casterId, "caster-1");
  assert.equal(changed.slotLevel, 1);
  assert.deepEqual(changed.targetIds, []);
  assert.equal(changed.primaryTargetId, "");
  assert.deepEqual(changed.outcomes, {});
  assert.equal(changed.placement, null);
  assert.deepEqual(changed.hpValues, { hp: null, damage: null, healing: null });
  assert.equal(changed.feedback.state, "idle");
  assert.equal(changed.commitState.state, "idle");
  assert.equal(changed.activeInstanceId, "");
  assert.equal(changed.activeActionId, "");
  assert.equal(changed.activeActionState.state, "idle");
  assert.equal(changed.undoState.state, SPELL_PANEL_UNDO_STATES.UNAVAILABLE);
});

test("Il cambio spell cancella esiti e placement e conserva solo input validi", () => {
  const fireball = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  const bane = buildSpellUnifiedPanelContract({ spellId: "bane" });
  const session = createSpellPanelSession({
    contract: fireball,
    casterId: "caster-1",
    activeInstanceId: "fireball-1",
    activeActionId: "old-action",
    activeActionState: { state: "selected", instanceId: "fireball-1", actionId: "old-action" },
    slotLevel: 3,
    targetIds: ["target-1"],
    outcomes: { "target-1": "passed" },
    placement: { state: "confirmed" },
    damageValue: 10,
  });
  const changed = changeSpellPanelSpell(session, bane, {
    validCasterIds: ["caster-1"],
    validSlotLevels: [1],
  });

  assert.equal(changed.spellId, "bane");
  assert.equal(changed.casterId, "caster-1");
  assert.equal(changed.slotLevel, 1);
  assert.deepEqual(changed.targetIds, []);
  assert.deepEqual(changed.outcomes, {});
  assert.equal(changed.placement, null);
  assert.deepEqual(changed.hpValues, { hp: null, damage: null, healing: null });
  assert.equal(changed.activeInstanceId, "");
  assert.equal(changed.activeActionId, "");
});

test("Cambio di active action e variante resetta il runtime dipendente", () => {
  const cast = buildSpellUnifiedPanelContract({ spellId: "xanathar-sfera-della-tempesta" });
  const action = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
    actionId: "storm-sphere-lightning",
  });
  const session = createSpellPanelSession({
    contract: cast,
    casterId: "caster-1",
    targetIds: ["target-1"],
    placement: { state: "confirmed" },
  });
  const actionChanged = changeSpellPanelActiveAction(
    session,
    action,
    "storm-sphere-lightning",
    { validCasterIds: ["caster-1"] },
  );
  const variantChanged = changeSpellPanelVariant(
    actionChanged,
    action,
    "variant-a",
    { validCasterIds: ["caster-1"] },
  );

  assert.equal(actionChanged.activeActionId, "storm-sphere-lightning");
  assert.equal(actionChanged.activeInstanceId, "");
  assert.equal(actionChanged.activeActionState.state, "idle");
  assert.deepEqual(actionChanged.targetIds, []);
  assert.equal(actionChanged.placement, null);
  assert.equal(variantChanged.variant, "variant-a");
  assert.deepEqual(variantChanged.targetIds, []);
  assert.equal(variantChanged.placement, null);
});

test("Il view model espone placement, azione primaria e nessun ID spell", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  const incomplete = createSpellPanelSession({
    contract,
    casterId: "caster-1",
    targetIds: ["target-1"],
    outcomes: { "target-1": "failed" },
    damageValue: 18,
  });
  const placementPending = buildSpellPanelViewModel(contract, incomplete);

  assert.equal(Object.prototype.hasOwnProperty.call(placementPending.spell, "id"), false);
  assert.equal(placementPending.placement.policy, "required");
  assert.equal(placementPending.validation.firstInvalidField, "placement");
  assert.equal(placementPending.primaryAction.id, "place");

  const applied = buildSpellPanelViewModel(
    contract,
    updateSpellPanelSession(incomplete, {
      placement: { state: "confirmed", preview: { x: 1, y: 2 } },
    }),
  );
  assert.equal(applied.validation.valid, true);
  assert.equal(applied.primaryAction.id, "apply");
});

test("Undo capability statica e disponibilità runtime restano separate", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  const session = createSpellPanelSession({ contract });
  const unavailable = buildSpellPanelViewModel(contract, session);
  assert.equal(unavailable.undo.capable, true);
  assert.equal(unavailable.undo.available, false);

  const available = buildSpellPanelViewModel(
    contract,
    updateSpellPanelSession(session, {
      undoState: {
        state: SPELL_PANEL_UNDO_STATES.AVAILABLE,
        available: true,
        activationId: "runtime-activation",
      },
    }),
  );
  assert.equal(available.undo.capable, true);
  assert.equal(available.undo.available, true);
  assert.equal(available.undo.disabled, false);
});

test("la sessione conserva il contesto di commit senza contaminarne il contratto", () => {
  const current = buildSpellUnifiedPanelContract({ spellId: "bless" });
  const session = createSpellPanelSession({
    contract: current,
    casterId: "caster-a",
    targetIds: ["target-a"],
    enteredName: "Benedizione",
    castContext: { mobileAura: false },
    applyAutomatedConditions: false,
    requestedConcentration: true,
    activeConcentration: { instanceId: "active-1" },
    executionGate: { allowed: false, code: "lane-not-supported", message: "Workflow dedicato" },
  });

  assert.equal(session.enteredName, "Benedizione");
  assert.deepEqual(session.castContext, { mobileAura: false });
  assert.equal(session.applyAutomatedConditions, false);
  assert.equal(session.requestedConcentration, true);
  assert.equal(session.activeConcentration.instanceId, "active-1");
  assert.equal(session.executionGate.allowed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(current, "targetIds"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(current, "feedback"), false);
});

test("il gate runtime disabilita la primary action senza fallback implicito", () => {
  const current = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  const session = createSpellPanelSession({
    contract: current,
    executionGate: {
      allowed: false,
      code: "lane-not-supported",
      message: "Workflow area dedicato",
    },
  });
  const view = buildSpellPanelViewModel(current, session);

  assert.equal(view.validation.firstInvalidField, "execution");
  assert.equal(view.primaryAction.id, "unavailable");
  assert.equal(view.primaryAction.disabled, true);
  assert.equal(view.execution.message, "Workflow area dedicato");
});
