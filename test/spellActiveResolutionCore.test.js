import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellActiveResolutionFailureOperations,
  buildSpellActiveResolutionPayload,
  buildSpellActiveResolutionPostDamageOperations,
  getSpellResolutionAction,
  resolveSpellActiveResolutionDamage,
  spellActiveResolutionSelectedTargetId,
  SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE,
  validateSpellActiveResolutionAction,
  validateSpellActiveResolutionPayload,
} from "../src/spellActiveResolutionCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { getSpellOverviewActions } from "../src/spellActiveActionCore.js";

function group(overrides = {}) {
  return {
    instanceId: "cast-1",
    casterId: "caster-1",
    casterName: "Omar",
    name: "Invocare il fulmine",
    castContext: { slotLevel: 5 },
    ...overrides,
  };
}

test("le tre attivazioni hanno un contratto dichiarativo congelato", () => {
  for (const spellName of [
    "Invocare il fulmine",
    "Investitura della Fiamma",
    "Sfera della Tempesta",
    "Arma Sacra",
  ]) {
    const spell = getSpellDefinition(spellName);
    assert.equal(spell.activeActions.length, 1);
    const action = spell.activeActions[0];
    assert.equal(validateSpellActiveResolutionAction(action).valid, true);
    assert.equal(Object.isFrozen(action), true);
    assert.equal(Object.isFrozen(action.damage), true);
    assert.equal(action.subjectMode, "none");
    assert.equal(action.requiresTargets, false);
  }
});

test("il contratto dichiara economia, geometria, gittata e risoluzione proprie", () => {
  const callLightning = getSpellDefinition("Invocare il fulmine").activeActions[0];
  assert.deepEqual({
    economy: callLightning.economy,
    kind: callLightning.resolutionKind,
    placement: callLightning.placementRuleId,
    rangeOrigin: callLightning.rangeOrigin,
    turnStartPrompt: callLightning.turnStartPrompt,
    damage: callLightning.damage.formula,
  }, {
    economy: "action",
    kind: "save-area",
    placement: "call-lightning:cast",
    rangeOrigin: "caster",
    turnStartPrompt: true,
    damage: "3d10",
  });

  const flame = getSpellDefinition("Investitura della Fiamma").activeActions[0];
  assert.equal(flame.placementRuleId, "xanathar-investitura-della-fiamma:linea-di-fuoco");
  assert.equal(flame.damage.type, "fuoco");
  assert.equal(flame.availableAfterCast, true);
  assert.equal(flame.turnStartPrompt, true);
  assert.equal(flame.showInOverview, true);

  const storm = getSpellDefinition("Sfera della Tempesta").activeActions[0];
  assert.equal(storm.economy, "bonus-action");
  assert.equal(storm.turnStartPrompt, true);
  assert.equal(storm.rangeOrigin, "root");
  assert.equal(storm.maxTargets, 1);
  assert.deepEqual(storm.attack, {
    outcomes: ["hit", "miss"],
    advantageWhen: "inside-root",
  });

  const holyWeapon = getSpellDefinition("Arma Sacra").activeActions[0];
  assert.deepEqual({
    economy: holyWeapon.economy,
    kind: holyWeapon.resolutionKind,
    placement: holyWeapon.placementRuleId,
    rangeOrigin: holyWeapon.rangeOrigin,
    save: holyWeapon.save.ability,
    damage: holyWeapon.damage.formula,
    dismissesConcentration: holyWeapon.concentrationAction,
  }, {
    economy: "bonus-action",
    kind: "save-area",
    placement: "xanathar-arma-sacra:burst",
    rangeOrigin: "caster",
    save: "con",
    damage: "4d8",
    dismissesConcentration: "dismiss",
  });
  assert.equal(holyWeapon.failureEffects.length, 1);
  assert.equal(holyWeapon.failureEffects[0].label, "Accecato");
  assert.deepEqual(holyWeapon.failureEffects[0].expiry, {
    mode: "rounds",
    remaining: 10,
  });
  assert.deepEqual(holyWeapon.failureEffects[0].saveReminder, {
    ability: "con",
    timing: "turn-end",
    dcSource: "source-spell",
    label: "Se supera il TS, termina Accecato su di sé.",
  });
});

test("il payload conserva istanza, slot, contesto e radice senza confonderli con un nuovo lancio", () => {
  const spell = getSpellDefinition("Invocare il fulmine");
  const action = getSpellResolutionAction(spell.id, "call-lightning-strike");
  const payload = buildSpellActiveResolutionPayload({
    spell,
    action,
    group: group({
      castContext: { slotLevel: 6, naturalStormBonus: false },
    }),
    sceneEpoch: 12,
  });

  assert.equal(payload.type, SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE);
  assert.equal(payload.instanceId, "cast-1");
  assert.equal(payload.slotLevel, 6);
  assert.deepEqual(payload.castContext, { slotLevel: 6, naturalStormBonus: false });
  assert.equal(validateSpellActiveResolutionPayload(payload).valid, true);
  assert.equal(Object.isFrozen(payload), true);
});

test("il danno applica metà ai TS superati, zero alle immunità e scala lo slot", () => {
  const action = getSpellDefinition("Invocare il fulmine").activeActions[0];
  assert.deepEqual(
    resolveSpellActiveResolutionDamage({
      action,
      slotLevel: 5,
      outcome: "failed",
      roll: 31,
    }),
    {
      valid: true,
      outcome: "failed",
      roll: 31,
      factor: 1,
      amount: 31,
      formula: "3d10",
      scaledFormula: "5d10",
      type: "fulmine",
    },
  );
  assert.equal(resolveSpellActiveResolutionDamage({
    action,
    slotLevel: 5,
    outcome: "passed",
    roll: 31,
  }).amount, 15);
  assert.equal(resolveSpellActiveResolutionDamage({
    action,
    slotLevel: 5,
    outcome: "immune",
    roll: 31,
  }).amount, 0);
});

test("Riscaldare il Metallo usa un solo single-save, danno pieno e scaling dello slot", () => {
  const spell = getSpellDefinition("heat-metal");
  const action = getSpellResolutionAction("heat-metal", "heat-metal-repeat");
  assert.equal(spell.activeActions.filter((candidate) => candidate.id === "heat-metal-repeat").length, 1);
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
  assert.equal(action.economy, "bonus-action");
  assert.equal(action.resolutionKind, "single-save");
  assert.equal(action.save.ability, "con");
  assert.equal(action.manualSaveAtTable, true);
  assert.equal(action.assumedOutcome, "passed");
  assert.equal(action.manualOutcomeLabel, "Danno");
  assert.equal(action.attack, undefined);
  assert.equal(action.effectOn, undefined);

  for (const [slotLevel, expectedFormula] of [[2, "2d8"], [3, "3d8"], [5, "5d8"]]) {
    for (const outcome of ["passed", "failed"]) {
      const damage = resolveSpellActiveResolutionDamage({
        action,
        slotLevel,
        outcome,
        roll: 18,
      });
      assert.equal(damage.valid, true);
      assert.equal(damage.scaledFormula, expectedFormula);
      assert.equal(damage.factor, 1);
      assert.equal(damage.amount, 18);
    }
  }

  const failureOperations = buildSpellActiveResolutionFailureOperations({
    action,
    payload: { casterId: "caster-1", casterName: "Omar", instanceId: "heat-1" },
    targetIds: ["target-1"],
    outcomes: { "target-1": "failed" },
  });
  assert.deepEqual(failureOperations, []);
  const postDamageOperations = buildSpellActiveResolutionPostDamageOperations({
    action,
    payload: { casterId: "caster-1", casterName: "Omar", instanceId: "heat-1" },
    targetIds: ["target-1"],
  });
  assert.equal(postDamageOperations[0].conditionName, "Scelta oggetto");
  assert.equal(postDamageOperations[0].options.parentEffectId, "");
  assert.deepEqual(postDamageOperations[0].options.deferredEffects[0].resolution.choiceLabels, {
    passed: "Lascia cadere",
    failed: "Non può / non lascia",
  });
});

test("il contratto rifiuta economia, esiti e risoluzione sconosciuti", () => {
  const action = getSpellDefinition("Sfera della Tempesta").activeActions[0];
  assert.equal(validateSpellActiveResolutionAction({
    ...action,
    economy: "free",
  }).valid, false);
  assert.equal(validateSpellActiveResolutionAction({
    ...action,
    attack: { outcomes: ["critical-hit"] },
  }).valid, false);
  assert.equal(validateSpellActiveResolutionPayload({
    type: SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE,
    version: 1,
    spellId: "call-lightning",
    instanceId: "cast-1",
    casterId: "caster-1",
    actionId: "unknown-action",
    sceneEpoch: 1,
    slotLevel: 4,
    action,
  }).valid, false);

  const callAction = getSpellDefinition("Invocare il fulmine").activeActions[0];
  assert.equal(validateSpellActiveResolutionPayload({
    type: SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE,
    version: 1,
    spellId: "call-lightning",
    instanceId: "cast-1",
    casterId: "caster-1",
    actionId: action.id,
    sceneEpoch: 1,
    slotLevel: 4,
    action,
  }).valid, false);
  assert.equal(validateSpellActiveResolutionAction({
    ...callAction,
    requiresParentInstance: false,
  }).valid, false);
});

test("un attacco mancato non infligge danno e lo scaling della Sfera usa lo slot originale", () => {
  const action = getSpellDefinition("Sfera della Tempesta").activeActions[0];
  assert.equal(resolveSpellActiveResolutionDamage({
    action,
    slotLevel: 6,
    outcome: "hit",
    roll: 24,
  }).scaledFormula, "6d6");
  assert.equal(resolveSpellActiveResolutionDamage({
    action,
    slotLevel: 6,
    outcome: "miss",
    roll: 24,
  }).amount, 0);
});

test("Arma Sacra applica Accecato solo ai fallimenti e lo rende indipendente dalla concentrazione", () => {
  const spell = getSpellDefinition("Arma Sacra");
  const action = spell.activeActions[0];
  const operations = buildSpellActiveResolutionFailureOperations({
    action,
    payload: {
      casterId: "caster-1",
      casterName: "Omar",
      instanceId: "holy-weapon-1",
    },
    targetIds: ["failed-1", "passed-1", "immune-1"],
    outcomes: {
      "failed-1": "failed",
      "passed-1": "passed",
      "immune-1": "immune",
    },
  });

  assert.equal(operations.length, 2);
  assert.deepEqual(operations[0].targetIds, ["failed-1"]);
  assert.equal(operations[0].conditionName, "Accecato");
  assert.equal(operations[0].options.effectKind, "");
  assert.equal(operations[0].options.displayLabel, undefined);
  assert.equal(operations[0].options.parentEffectId, "");
  assert.deepEqual(operations[0].options.expiry, {
    mode: "rounds",
    remaining: 10,
  });
  assert.deepEqual(operations[0].options.saveReminder, {
    ability: "con",
    timing: "turn-end",
    dcSource: "source-spell",
    label: "Se supera il TS, termina Accecato su di sé.",
  });
  assert.deepEqual(operations[1], {
    type: "condition:automate",
    subjectIds: ["failed-1"],
  });
});

test("il congedo di Arma Sacra compare dal turno successivo al lancio", () => {
  const spell = getSpellDefinition("Arma Sacra");
  const sameTurn = getSpellOverviewActions({
    spell,
    casterId: "caster-1",
    appliedAt: { turnKey: "round-1:caster-1" },
    currentTurnKey: "round-1:caster-1",
  });
  const nextTurn = getSpellOverviewActions({
    spell,
    casterId: "caster-1",
    appliedAt: { turnKey: "round-1:caster-1" },
    currentTurnKey: "round-1:other",
  });

  assert.equal(sameTurn.length, 1);
  assert.equal(sameTurn[0].unavailableReason, "Disponibile dal turno successivo al lancio.");
  assert.equal(nextTurn.length, 1);
  assert.equal(nextTurn[0].unavailableReason, undefined);
});


test("la selezione Owlbear aggancia il bersaglio valido del popup anche tra token paralleli", () => {
  const entries = [{ id: "goblin::p1" }, { id: "ogre" }];
  assert.equal(spellActiveResolutionSelectedTargetId(entries, ["goblin"], ""), "goblin::p1");
  assert.equal(spellActiveResolutionSelectedTargetId(entries, ["ogre"], "goblin::p1"), "ogre");
  assert.equal(spellActiveResolutionSelectedTargetId(entries, ["outside"], "goblin::p1"), "goblin::p1");
});
