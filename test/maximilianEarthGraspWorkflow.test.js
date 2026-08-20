import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import {
  getSpellDefinition,
} from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  updateSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import { getSpellAreaSpatialValidation } from "../src/spellUnifiedPanelSceneProvider.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { spellSaveDamageFactor } from "../src/spellCastResolutionRules.js";
import {
  buildSpellActiveResolutionFailureOperations,
  buildSpellActiveResolutionLinkedEffectRemovals,
  resolveSpellActiveResolutionDamage,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import {
  buildSpellUnifiedActivePopoverRequest,
  buildSpellUnifiedActiveResolutionPayload,
} from "../src/spellUnifiedActiveAdapter.js";

const SPELL_ID = "xanathar-stretta-della-terra-di-maximilian";
const EFFECT_ID = "maximilian-earth-grasp-restrained";
const META_KEY = `${ID}/meta`;

function spell() {
  return getSpellDefinition(SPELL_ID);
}

function contract(actionId = "") {
  return buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    actionId,
    castContext: { slotLevel: 2 },
  });
}

function placement({
  spellId = SPELL_ID,
  ruleId = `${SPELL_ID}:board-token`,
  casterId = "caster",
} = {}) {
  return {
    status: "confirmed",
    spellId,
    ruleId,
    casterId,
    preview: {
      position: { x: 10, y: 20 },
      targetIds: [],
    },
  };
}

function castCommand({ targetIds = ["target"], damageAmount = 7, spatialValidation = null } = {}) {
  return buildSpellAreaResolutionCommand({
    contract: contract(),
    spellId: SPELL_ID,
    phase: "cast",
    casterId: "caster",
    slotLevel: 2,
    targetIds,
    candidateTargetIds: targetIds,
    placement: placement(),
    hp: { mode: "damage", amount: damageAmount },
    ...(spatialValidation ? { spatialValidation } : {}),
    sceneEpoch: 4,
    currentSceneEpoch: 4,
  });
}

function preparedOperations(operations, prefix = "max") {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = operation.targetIds || [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:spell:${id}`])),
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

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("SP-B03E.1 — cast piazza la mano, afferra subito e applica danno senza workflow TS", () => {
  const model = contract();
  const currentSpell = spell();
  const command = castCommand({
    spatialValidation: {
      mode: "placement-range",
      maxMeters: 1.5,
      distancesMeters: { target: 1.5 },
      invalidTargetIds: [],
    },
  });

  assert.equal(getSpellSaveWorkflowRule(SPELL_ID), null);
  assert.equal(spellSaveDamageFactor(SPELL_ID, "passed"), null);
  assert.equal(currentSpell.boardToken?.spellId, SPELL_ID);
  assert.equal(currentSpell.boardToken?.sizeCategory, "Medium");
  assert.equal(currentSpell.boardToken?.spaceCells, 1);
  assert.equal(model.presentation.placement.mode, "board-token");
  assert.equal(model.presentation.placement.ruleId, `${SPELL_ID}:board-token`);
  assert.equal(model.presentation.targeting.selectionMode, "post-placement");
  assert.equal(model.presentation.targeting.confirmTargets, true);
  assert.equal(model.presentation.targeting.limit.maximum, 1);
  assert.equal(model.presentation.inputs.targets.visible, true);
  assert.equal(model.presentation.inputs.damage.visible, true);
  assert.equal(model.presentation.inputs.outcomes.visible, false);
  assert.equal(model.execution.hasTokens, true);
  assert.equal(model.execution.castHasHP, true);

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.placement.ruleId, `${SPELL_ID}:board-token`);
  assert.deepEqual(command.targeting.targetIds, ["target"]);
  assert.equal(command.hp.amount, 7);
  assert.equal(command.hp.outcomeFactors.target, "full");
  assert.equal(command.resolution.conditionApplications.length, 1);
  assert.equal(command.resolution.conditionApplications[0].conditionName, "Trattenuto");
  assert.equal(command.resolution.conditionApplications[0].options.effectId, EFFECT_ID);
  assert.notEqual(command.resolution.conditionApplications[0].options.effectKind, "debuff");
  assert.equal(command.execution.requiresCompositeUndo, true);
});

test("SP-B03E.1 — cast rifiuta bersagli oltre 1,5 m dalla mano", () => {
  const command = castCommand({
    spatialValidation: {
      mode: "placement-range",
      maxMeters: 1.5,
      distancesMeters: { target: 3 },
      invalidTargetIds: ["target"],
    },
  });
  assert.equal(command.valid, false);
  assert.ok(command.errors.includes("target-out-of-range"));

  const missingTarget = castCommand({ targetIds: [] });
  assert.equal(missingTarget.valid, false);
  assert.ok(missingTarget.errors.includes("targets-required"));
});

test("SP-B03E.1 — UX cast: placement prima, poi target e danno", () => {
  const currentContract = contract();
  let session = createSpellPanelSession({
    contract: currentContract,
    spellId: SPELL_ID,
    casterId: "caster",
    slotLevel: 2,
  });
  let model = buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    targetCandidates: [{ key: "target", label: "Target" }],
  });
  assert.equal(model.workflow.primaryAction.id, "place");
  assert.equal(model.workflow.primaryAction.disabled, false);
  assert.equal(model.targets.visible, false);

  session = updateSpellPanelSession(session, {
    placement: {
      state: "confirmed",
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      ruleId: `${SPELL_ID}:board-token`,
      mode: "board-token",
      kind: "board-token",
      preview: { position: { x: 100, y: 100 }, targetIds: [] },
    },
  });
  model = buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    targetCandidates: [{ key: "target", label: "Target" }],
  });
  assert.equal(model.targets.visible, true);
  assert.equal(model.workflow.validation.firstInvalidField, "targets");

  session = updateSpellPanelSession(session, {
    targetIds: ["target"],
    hpValues: { damage: 7 },
  });
  model = buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    targetCandidates: [{ key: "target", label: "Target" }],
  });
  assert.equal(model.workflow.validation.valid, true);
  assert.equal(model.workflow.primaryAction.label, "Crea mano e afferra");
});

test("SP-B03E.1 — la distanza del target viene misurata dalla mano piazzata", async () => {
  const currentContract = contract();
  const items = {
    adjacent: { id: "adjacent", position: { x: 250, y: 100 } },
    diagonal: { id: "diagonal", position: { x: 250, y: 250 } },
    far: { id: "far", position: { x: 400, y: 100 } },
  };
  const obr = {
    scene: {
      items: {
        getItems: async (ids) => (Array.isArray(ids) ? ids.map((id) => items[id]).filter(Boolean) : []),
        getItemBounds: async (ids) => {
          const id = Array.isArray(ids) ? ids[0] : ids;
          const item = items[id];
          return item ? {
            min: { x: item.position.x - 75, y: item.position.y - 75 },
            max: { x: item.position.x + 75, y: item.position.y + 75 },
            center: { ...item.position },
          } : null;
        },
      },
      grid: {
        getDpi: async () => 150,
        getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
      },
    },
  };
  const spatial = await getSpellAreaSpatialValidation(obr, {
    contract: currentContract,
    session: {
      targetIds: ["adjacent", "diagonal", "far"],
      placement: { preview: { position: { x: 100, y: 100 } } },
    },
  });
  assert.equal(spatial.distancesMeters.adjacent, 1.5);
  assert.equal(spatial.distancesMeters.diagonal, 1.5);
  assert.equal(spatial.distancesMeters.far, 3);
  assert.deepEqual(spatial.invalidTargetIds, ["far"]);
});

test("SP-B03E.1 — liberarsi rimuove solo Trattenuto; fine concentrazione pulisce il child effect", () => {
  const operations = preparedOperations([
    {
      type: "spell:upsert",
      targetIds: ["caster"],
      name: "Stretta della Terra di Maximilian",
      turns: 10,
      conc: true,
      source: "caster",
      instanceId: "grasp-1",
      castContext: { slotLevel: 2 },
    },
    {
      type: "concentration:register",
      casterId: "caster",
      targetIds: ["caster"],
      name: "Stretta della Terra di Maximilian",
      instanceId: "grasp-1",
      appliedAt: { round: 2, actorId: "caster", turnKey: "2:0:caster" },
    },
    {
      type: "condition:add",
      targetIds: ["target"],
      conditionName: "Trattenuto",
      options: {
        sourceId: "caster",
        sourceName: "Caster",
        parentEffectId: "grasp-1",
        effectId: EFFECT_ID,
        type: "spell",
        expiry: { mode: "concentration" },
        manualRemoval: true,
      },
    },
  ]);
  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], concentrations: {}, conditions: [] },
    { id: "target", spells: [], concentrations: {}, conditions: [] },
  ], operations);

  assert.equal(state(initial, "caster").spells.length, 1);
  assert.ok(Object.values(state(initial, "caster").concentrations).some((entry) => entry.instanceId === "grasp-1"));
  assert.equal(state(initial, "target").conditions.length, 1);
  const restrainedId = state(initial, "target").conditions[0].id;

  const escaped = buildEffectsMutationPlan(initial.states, [{
    type: "condition:remove-instances",
    operationId: "escape",
    removals: [{ itemId: "target", instanceId: restrainedId }],
  }]);
  assert.equal(state(escaped, "target").conditions.length, 0);
  assert.equal(state(escaped, "caster").spells.length, 1);
  assert.ok(Object.values(state(escaped, "caster").concentrations).some((entry) => entry.instanceId === "grasp-1"));

  const ended = buildEffectsMutationPlan(initial.states, [{
    type: "concentration:break",
    operationId: "break",
    casterIds: ["caster"],
    reference: "grasp-1",
  }]);
  assert.equal(state(ended, "caster").spells.length, 0);
  assert.equal(state(ended, "target").conditions.length, 0);

  const manuallyRemoved = buildEffectsMutationPlan(initial.states, [{
    type: "spell:remove-instance",
    operationId: "manual-remove",
    targetIds: ["caster"],
    instanceId: "grasp-1",
  }]);
  assert.equal(state(manuallyRemoved, "caster").spells.length, 0);
  assert.equal(state(manuallyRemoved, "target").conditions.length, 0);

  const unrelatedCondition = buildEffectsMutationPlan([
    ...initial.states.map((entry) => ({ ...entry })),
    {
      id: "other-target",
      spells: [],
      concentrations: {},
      conditions: [{
        id: "other-restrained",
        condition: "Trattenuto",
        active: true,
        type: "spell",
        parentEffectId: "other-grasp",
        effectId: EFFECT_ID,
      }],
    },
  ], [{
    type: "spell:remove-instance",
    operationId: "manual-remove-scoped",
    targetIds: ["caster"],
    instanceId: "grasp-1",
  }]);
  assert.equal(state(unrelatedCondition, "target").conditions.length, 0);
  assert.equal(state(unrelatedCondition, "other-target").conditions.length, 1);

  // Il percorso usato dal pannello Incantesimi rimuove direttamente gli effetti
  // figli per parentEffectId e non deve dipendere dal campo type.
  const panelTerminate = buildEffectsMutationPlan([
    ...initial.states
      .filter((entry) => entry.id !== "target")
      .map((entry) => ({ ...entry })),
    {
      id: "target",
      spells: [],
      concentrations: {},
      conditions: [{
        id: "panel-restrained",
        condition: "Trattenuto",
        active: true,
        parentEffectId: "grasp-1",
        effectId: EFFECT_ID,
      }],
    },
  ], [{
    type: "condition:remove-parent-effects",
    operationId: "panel-terminate-linked-effect",
    removals: [{ itemId: "target", parentEffectId: "grasp-1" }],
  }]);
  assert.equal(state(panelTerminate, "target").conditions.length, 0);

  // Regression reale: il legame col parent deve bastare anche se un percorso legacy
  // non ha persistito type=spell sulla condition.
  const linkedWithoutType = buildEffectsMutationPlan([
    ...initial.states
      .filter((entry) => entry.id !== "target")
      .map((entry) => ({ ...entry })),
    {
      id: "target",
      spells: [],
      concentrations: {},
      conditions: [{
        id: "legacy-restrained",
        condition: "Trattenuto",
        active: true,
        parentEffectId: "grasp-1",
        effectId: EFFECT_ID,
      }],
    },
  ], [{
    type: "spell:remove-instance",
    operationId: "manual-remove-linked-without-type",
    targetIds: ["caster"],
    instanceId: "grasp-1",
  }]);
  assert.equal(state(linkedWithoutType, "target").conditions.length, 0);
});

test("SP-B03E.2 — Afferra e Stritola sono azioni single-save distinte e coerenti", () => {
  const currentSpell = spell();
  const crush = currentSpell.activeActions.find((action) => action.id === "maximilian-earth-grasp-crush");
  const grab = currentSpell.activeActions.find((action) => action.id === "maximilian-earth-grasp-grab");

  assert.equal(validateSpellActiveResolutionAction(crush).valid, true);
  assert.equal(validateSpellActiveResolutionAction(grab).valid, true);

  assert.equal(crush.resolutionKind, "single-save");
  assert.equal(crush.label, "Stritola · 2d6 (metà se supera)");
  assert.equal(crush.requiredTargetEffectId, EFFECT_ID);
  assert.equal(crush.requiresZoneRoot, false);
  assert.equal(crush.save.ability, "str");

  assert.equal(grab.resolutionKind, "single-save");
  assert.equal(grab.label, "Afferra · Trattenuto");
  assert.equal(grab.manualSaveAtTable, true);
  assert.equal(grab.assumedOutcome, "failed");
  assert.equal(grab.moveRootToTarget, undefined);
  assert.equal(grab.rangeOrigin, "root");
  assert.equal(grab.range.value, 1.5);
  assert.equal(grab.requiresZoneRoot, true);
  assert.equal(grab.replaceLinkedEffectId, EFFECT_ID);
  assert.equal(grab.excludedTargetEffectId, EFFECT_ID);
  assert.equal(grab.failureEffects[0].label, "Trattenuto");
  assert.notEqual(grab.failureEffects[0].kind, "debuff");
  assert.equal(grab.damage, undefined);
  assert.equal(grab.turnStartPrompt, true);
  assert.equal(grab.showInOverview, true);
  assert.equal(grab.availableAfterCast, true);
  assert.equal(crush.turnStartPrompt, true);
  assert.equal(crush.showInOverview, true);
  assert.equal(crush.availableAfterCast, true);

  assert.equal(resolveSpellActiveResolutionDamage({ action: crush, slotLevel: 2, outcome: "failed", roll: 9 }).amount, 9);
  assert.equal(resolveSpellActiveResolutionDamage({ action: crush, slotLevel: 2, outcome: "passed", roll: 9 }).amount, 4);
  assert.equal(resolveSpellActiveResolutionDamage({ action: grab, slotLevel: 2, outcome: "failed", roll: 9 }).valid, false);
});

test("SP-B03E.2 — Afferra applica Trattenuto solo al fallimento e sostituisce solo il child effect della stessa istanza", () => {
  const grab = spell().activeActions.find((action) => action.id === "maximilian-earth-grasp-grab");
  const payload = {
    spellId: SPELL_ID,
    spellName: "Stretta della Terra di Maximilian",
    instanceId: "grasp-1",
    casterId: "caster",
    casterName: "Caster",
    action: grab,
  };

  const failedOps = buildSpellActiveResolutionFailureOperations({
    action: grab,
    payload,
    targetIds: ["new-target"],
    outcomes: { "new-target": "failed" },
  });
  assert.equal(failedOps[0].type, "condition:add");
  assert.equal(failedOps[0].conditionName, "Trattenuto");
  assert.equal(failedOps[0].options.parentEffectId, "grasp-1");
  assert.equal(failedOps[0].options.effectId, EFFECT_ID);
  assert.notEqual(failedOps[0].options.effectKind, "debuff");

  const passedOps = buildSpellActiveResolutionFailureOperations({
    action: grab,
    payload,
    targetIds: ["new-target"],
    outcomes: { "new-target": "passed" },
  });
  assert.deepEqual(passedOps, []);

  const removals = buildSpellActiveResolutionLinkedEffectRemovals({
    action: grab,
    payload,
    items: [
      {
        id: "old-target",
        metadata: { [META_KEY]: { conditions: { version: 2, instances: [
          { id: "old-restrained", parentEffectId: "grasp-1", effectId: EFFECT_ID },
          { id: "other-effect", parentEffectId: "grasp-1", effectId: "other" },
        ] } } },
      },
      {
        id: "unrelated-target",
        metadata: { [META_KEY]: { conditions: { version: 2, instances: [
          { id: "other-grasp", parentEffectId: "grasp-2", effectId: EFFECT_ID },
        ] } } },
      },
    ],
  });
  assert.deepEqual(removals, [{ itemId: "old-target", instanceId: "old-restrained" }]);
});

test("SP-B03E.2 — il pannello unificato delega single-save allo stesso popup attivo", () => {
  const currentSpell = spell();
  const action = currentSpell.activeActions.find((entry) => entry.id === "maximilian-earth-grasp-grab");
  const overview = {
    instanceId: "grasp-1",
    actions: [action],
    context: {
      spellId: SPELL_ID,
      instanceId: "grasp-1",
      casterId: "caster",
      casterName: "Caster",
      name: currentSpell.displayName,
      storedName: currentSpell.displayName,
      castContext: { slotLevel: 2 },
      targetIds: ["caster"],
      targetNames: ["Caster"],
      zoneItemId: "hand-token-1",
      sceneEpoch: 3,
      revision: 5,
    },
  };
  const built = buildSpellUnifiedActiveResolutionPayload({
    overview,
    action,
    actionId: action.id,
    sceneEpoch: 3,
    revision: 5,
  });
  assert.equal(built.status, "payload-ready");
  assert.equal(built.payload.action.resolutionKind, "single-save");
  assert.equal(built.payload.action.rangeOrigin, "root");
  assert.equal(built.payload.zoneItemId, "hand-token-1");
  const popover = buildSpellUnifiedActivePopoverRequest(built.payload);
  assert.equal(popover.height, 350);
  assert.match(popover.url, /spell-active-resolution\.html\?payload=/);
});
