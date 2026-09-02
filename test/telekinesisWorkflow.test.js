import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellActiveActionPlan,
  getSpellActiveAction,
  getSpellOverviewActions,
} from "../src/spellActiveActionCore.js";
import { buildSpellActiveResolutionPayload } from "../src/spellActiveResolutionCore.js";
import {
  TELEKINESIS_MAINTAIN_ACTION_ID,
  TELEKINESIS_RETARGET_ACTION_ID,
  telekinesisActivationId,
  telekinesisCastContext,
  telekinesisRestrainedConditionOptions,
  telekinesisStateFromCastContext,
  telekinesisSummaryParts,
} from "../src/telekinesisRules.js";

function group(castContext = {}) {
  return {
    instanceId: "telekinesis-1",
    spellId: "telekinesis",
    casterId: "caster",
    casterName: "Mago",
    name: "Telecinesi",
    storedName: "Telecinesi",
    castContext,
    appliedAt: { round: 3, actorId: "caster", turnKey: "3:0:caster" },
    targets: new Map([["old-target", "Vecchio"]]),
    turns: [87],
    effectInstances: [],
  };
}

test("Telecinesi espone mantenimento e retarget manuali dal pannello", () => {
  const spell = getSpellDefinition("telekinesis");
  const castContext = telekinesisCastContext({
    castContext: { slotLevel: 5 },
    casterId: "caster",
    targetId: "old-target",
    outcome: "failed",
  });
  const actions = getSpellOverviewActions({
    spell,
    castContext,
    casterId: "caster",
    targetIds: ["old-target"],
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "1:1:other",
    currentActorId: "caster",
  });

  assert.deepEqual(actions.map((action) => action.id), [
    TELEKINESIS_MAINTAIN_ACTION_ID,
    TELEKINESIS_RETARGET_ACTION_ID,
  ]);
  for (const action of actions) {
    assert.equal(action.resolutionKind, "telekinesis-contest");
    assert.equal(action.economy, "action");
    assert.equal(action.subjectMode, "none");
    assert.equal(action.requiresTargets, false);
    assert.equal(action.turnStartPrompt, true);
    assert.equal(action.availableAfterCast, true);
    assert.deepEqual(action.range, { value: 18, unit: "m" });
    assert.equal(action.rangeOrigin, "caster");
    assert.equal(action.maxTargets, 1);
    assert.equal(action.rememberTargets, true);
  }
});

test("Telecinesi mantiene una parent instance e compone il payload con identity esatta", () => {
  const spell = getSpellDefinition("telekinesis");
  const castContext = telekinesisCastContext({
    castContext: { slotLevel: 5 },
    casterId: "caster",
    targetId: "old-target",
    outcome: "failed",
  });
  const action = getSpellActiveAction(spell, TELEKINESIS_RETARGET_ACTION_ID);
  const payload = buildSpellActiveResolutionPayload({
    spell,
    action,
    group: group(castContext),
    sceneEpoch: 4,
    turnKey: "4:0:caster",
  });

  assert.equal(payload.instanceId, "telekinesis-1");
  assert.equal(payload.casterId, "caster");
  assert.equal(payload.actionId, TELEKINESIS_RETARGET_ACTION_ID);
  assert.equal(payload.action.resolutionKind, "telekinesis-contest");
  assert.equal(payload.action.telekinesisOperation, "retarget");
  assert.equal(payload.linkedTargetId, "old-target");
  assert.equal(payload.turnKey, "4:0:caster");
  assert.equal(
    payload.activationId,
    telekinesisActivationId(
      "telekinesis-1",
      TELEKINESIS_RETARGET_ACTION_ID,
      "4:0:caster",
    ),
  );
  assert.deepEqual(payload.castContext, castContext);
});

test("Telecinesi delega la contesa al popup e persiste il risultato nella stessa istanza", () => {
  const spell = getSpellDefinition("telekinesis");
  const castContext = telekinesisCastContext({
    castContext: { slotLevel: 5 },
    casterId: "caster",
    targetId: "old-target",
    outcome: "failed",
  });
  const plan = buildSpellActiveActionPlan({
    spell,
    actionId: TELEKINESIS_RETARGET_ACTION_ID,
    group: group(castContext),
    selectedTargetIds: [],
    casterName: "Mago",
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.delegatedResolution, true);
  assert.equal(plan.resolutionKind, "telekinesis-contest");
  assert.deepEqual(plan.operations, []);
  assert.deepEqual(plan.subjectIds, ["caster"]);

  const nextCastContext = telekinesisCastContext({
    castContext,
    casterId: "caster",
    targetId: "new-target",
    outcome: "passed",
    turnKey: "4:0:caster",
    activationId: telekinesisActivationId(
      "telekinesis-1",
      TELEKINESIS_RETARGET_ACTION_ID,
      "4:0:caster",
    ),
    actionId: TELEKINESIS_RETARGET_ACTION_ID,
  });
  assert.deepEqual(telekinesisStateFromCastContext(nextCastContext), {
    version: 1,
    mode: "creature",
    targetId: "new-target",
    contest: "passed",
    status: "controlled",
    restrainedUntil: {
      actorId: "caster",
      phase: "turn-end",
      anchor: "next-turn",
      remaining: 1,
      turnKey: "4:0:caster",
    },
    lastActivation: {
      turnKey: "4:0:caster",
      activationId: telekinesisActivationId(
        "telekinesis-1",
        TELEKINESIS_RETARGET_ACTION_ID,
        "4:0:caster",
      ),
      actionId: TELEKINESIS_RETARGET_ACTION_ID,
    },
  });
});

test("Telecinesi usa la condizione canonica e non espone minipill", () => {
  const options = telekinesisRestrainedConditionOptions({
    casterId: "caster",
    casterName: "Mago",
    instanceId: "telekinesis-1",
  });

  assert.equal(options.effectKind, undefined);
  assert.equal(options.effectId, "telekinesis-restrained");
  assert.deepEqual(telekinesisSummaryParts({}), []);
});
