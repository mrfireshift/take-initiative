import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellActiveResolutionPayload,
  getSpellResolutionAction,
  resolveSpellActiveResolutionDamage,
  SPELL_ACTIVE_RESOLUTION_PAYLOAD_TYPE,
  validateSpellActiveResolutionAction,
  validateSpellActiveResolutionPayload,
} from "../src/spellActiveResolutionCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

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

  const storm = getSpellDefinition("Sfera della Tempesta").activeActions[0];
  assert.equal(storm.economy, "bonus-action");
  assert.equal(storm.turnStartPrompt, true);
  assert.equal(storm.rangeOrigin, "root");
  assert.equal(storm.maxTargets, 1);
  assert.deepEqual(storm.attack, {
    outcomes: ["hit", "miss"],
    advantageWhen: "inside-root",
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
