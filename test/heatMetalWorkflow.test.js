import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildSpellUnifiedActivePopoverRequest } from "../src/spellUnifiedActiveAdapter.js";
import { buildSpellActiveResolutionPayload, getSpellResolutionAction } from "../src/spellActiveResolutionCore.js";

const META_KEY = `${ID}/meta`;

function decisionTarget() {
  const spell = getSpellDefinition("heat-metal");
  const action = spell.activeActions[0];
  const effect = action.postDamageEffects[0];
  return {
    id: "target",
    name: "Portatore",
    metadata: {
      [META_KEY]: {
        conditions: [{
          id: "drop-choice-1",
          condition: effect.label,
          active: true,
          sourceId: "caster",
          deferredEffects: effect.deferredEffects.map((deferredEffect) => ({
            ...deferredEffect,
            provenance: { ...(deferredEffect.provenance || {}), casterId: "caster" },
          })),
        }],
      },
    },
  };
}

function immediateDecision() {
  const items = [
    { id: "caster", name: "Caster", metadata: { [META_KEY]: {} } },
    decisionTarget(),
  ];
  const [notice] = planEffectSaveReminderNotices({
    items,
    includeCurrentTurnStart: false,
  });
  assert.ok(notice);
  assert.deepEqual(notice.resolution.choiceLabels, {
    passed: "Lascia cadere",
    failed: "Non può / non lascia",
  });
  return { items, notice };
}

function stateItems(states) {
  return states.map((state) => ({
    id: state.id,
    name: state.name,
    metadata: {
      [META_KEY]: {
        conditions: state.conditions || [],
        [`${ID}/spells`]: state.spells || [],
        [`${ID}/concentration`]: state.concentrations || {},
      },
    },
  }));
}

function applyReminderPlan(items, plan, instancePrefix) {
  let sequence = 0;
  const states = items.map((item) => {
    const meta = item.metadata?.[META_KEY] || {};
    return {
      id: item.id,
      name: item.name,
      spells: meta[`${ID}/spells`] || [],
      concentrations: meta[`${ID}/concentration`] || {},
      conditions: meta.conditions || [],
    };
  });
  const operations = plan.operations.map((operation) => {
    if (operation.type !== "condition:add") return operation;
    const targetIds = Array.isArray(operation.targetIds) ? operation.targetIds : [];
    return {
      ...operation,
      operationId: `${instancePrefix}:${sequence}`,
      instanceIds: Object.fromEntries(targetIds.map((targetId) => [
        targetId,
        `${instancePrefix}:${sequence++}`,
      ])),
    };
  });
  const applied = buildEffectsMutationPlan(states, operations, {
    operationId: instancePrefix,
  });
  return stateItems(applied.states);
}

test("il cast iniziale applica il danno e crea subito la scelta, senza TS nel workflow cast", () => {
  const spell = getSpellDefinition("heat-metal");
  const action = spell.activeActions[0];
  const automation = getAreaSaveAutomation(spell);
  const contract = buildSpellUnifiedPanelContract({ spellId: "heat-metal" });

  assert.equal(automation, null);
  assert.equal(contract.presentation.inputs.outcomes.required, false);
  assert.equal(contract.presentation.inputs.damage.required, true);
  assert.equal(contract.presentation.capabilities.saveOutcomes, false);
  assert.deepEqual(contract.presentation.controls.includes("save-workflow"), false);
  assert.deepEqual(contract.presentation.controls.includes("save-outcomes"), false);
  assert.equal(action.requiredTargetEffectId, undefined);
  assert.equal(action.rememberTargets, true);

  const command = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster",
    targetIds: ["target"],
    slotLevel: 2,
    hp: { amount: 12, mode: "damage" },
    source: { sceneEpoch: 1 },
    validateSpatial: false,
  });
  assert.equal(command.valid, true, command.errors.join(", "));
  assert.equal(command.outcomes.required, false);
  assert.equal(command.hp.outcomeFactors.target, "full");
  assert.deepEqual(command.resolution.spellTargetIds, ["target"]);
  assert.equal(command.resolution.conditionApplications.length, 1);
  assert.equal(command.resolution.conditionApplications[0].conditionName, "Scelta oggetto");
  assert.deepEqual(
    command.resolution.conditionApplications[0].options.deferredEffects[0].resolution.choiceLabels,
    { passed: "Lascia cadere", failed: "Non può / non lascia" },
  );

  const operations = saveSpellResolutionOperations({
    resolution: {
      valid: true,
      ...command.resolution,
      spellId: spell.id,
      casterId: "caster",
      spellName: spell.displayName,
      concentration: true,
    },
    instanceId: "heat-instance-1",
    casterName: "Caster",
    turns: 10,
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    castContext: { slotLevel: 2 },
  });
  assert.deepEqual(
    operations.find((operation) => operation.type === "spell:upsert").targetIds,
    ["target"],
  );
  assert.deepEqual(
    operations.find((operation) => operation.type === "concentration:register").targetIds,
    ["target"],
  );

  const castOperations = operations.map((operation, index) => operation.type === "condition:add"
    ? { ...operation, instanceIds: { target: `cast-choice-${index}` } }
    : operation);
  const applied = buildEffectsMutationPlan([
    { id: "caster", name: "Caster", spells: [], concentrations: {}, conditions: [] },
    { id: "target", name: "Target", spells: [], concentrations: {}, conditions: [] },
  ], castOperations, { operationId: "heat-metal-cast" });
  const [choiceNotice] = planEffectSaveReminderNotices({
    items: stateItems(applied.states),
    includeCurrentTurnStart: false,
  });
  assert.deepEqual(choiceNotice.resolution.choiceLabels, {
    passed: "Lascia cadere",
    failed: "Non può / non lascia",
  });
});

test("il repeat usa il popup mobile single-save condiviso con la box del danno", async () => {
  const spell = getSpellDefinition("heat-metal");
  const action = getSpellResolutionAction("heat-metal", "heat-metal-repeat");
  const payload = buildSpellActiveResolutionPayload({
    spell,
    action,
    group: {
      instanceId: "heat-1",
      casterId: "caster",
      targets: new Map([["target", "Portatore"]]),
      castContext: { slotLevel: 3 },
    },
    sceneEpoch: 1,
    turnKey: "2:0:caster",
  });
  const popover = buildSpellUnifiedActivePopoverRequest(payload);
  const [html, controller] = await Promise.all([
    readFile(new URL("../spell-active-resolution.html", import.meta.url), "utf8"),
    readFile(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8"),
  ]);

  assert.equal(popover.height, 350);
  assert.match(popover.url, /spell-active-resolution\.html\?payload=/);
  assert.match(html, /id="singleSaveDamageField"/);
  assert.match(controller, /singleSaveDamageField/);
  assert.match(controller, /damage\?\.onSave === "full"/);
  assert.match(controller, /singleSave\s*\n\s*\? payload\.action\?\.buttonLabel/);
});

test("failed + Lascia cadere consuma la decisione senza applicare penalità", () => {
  const { items, notice } = immediateDecision();
  const plan = buildReminderResolutionPlan({
    notice,
    items,
    outcome: "passed",
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.operations.some((operation) => operation.type === "condition:add"), false);
  assert.deepEqual(plan.operations.filter((operation) => operation.type === "condition:remove-instances")[0].removals, [
    { itemId: "target", instanceId: "drop-choice-1" },
  ]);
});

test("failed + Non può / non lascia apre subito il TS COS, senza applicare ancora la penalità", () => {
  const { items, notice } = immediateDecision();
  const choicePlan = buildReminderResolutionPlan({
    notice,
    items,
    outcome: "failed",
  });

  assert.equal(choicePlan.status, "ready");
  const add = choicePlan.operations.find((operation) => operation.type === "condition:add");
  assert.equal(add.conditionName, "TS Costituzione");
  assert.equal(add.options.deferredEffects[0].save.ability, "con");
  assert.deepEqual(choicePlan.operations.find((operation) => operation.type === "condition:remove-instances").removals, [
    { itemId: "target", instanceId: "drop-choice-1" },
  ]);

  const afterChoice = applyReminderPlan(items, choicePlan, "heat-metal-con-save");
  const [saveNotice] = planEffectSaveReminderNotices({
    items: afterChoice,
    includeCurrentTurnStart: false,
  });
  assert.equal(saveNotice.resolution.save.ability, "con");
  assert.equal(afterChoice.find((item) => item.id === "target").metadata[META_KEY].conditions
    .some((condition) => condition.condition === "Svant. attacchi e prove"), false);
});

test("fallimento del TS COS dopo Non può / non lascia applica la penalità", () => {
  const { items, notice } = immediateDecision();
  const choicePlan = buildReminderResolutionPlan({ notice, items, outcome: "failed" });
  const afterChoice = applyReminderPlan(items, choicePlan, "heat-metal-con-save");
  const [saveNotice] = planEffectSaveReminderNotices({
    items: afterChoice,
    includeCurrentTurnStart: false,
  });
  const savePlan = buildReminderResolutionPlan({
    notice: saveNotice,
    items: afterChoice,
    outcome: "failed",
  });
  const penalty = savePlan.operations.find((operation) => operation.type === "condition:add");
  assert.equal(penalty.conditionName, "Svant. attacchi e prove");
  assert.equal(penalty.options.parentEffectId, "");
  assert.deepEqual(penalty.options.expiry, {
    mode: "turn-start",
    actor: "source",
    remaining: 1,
    anchor: "next-turn",
  });
});

test("la penalità indipendente dalla concentrazione scade al prossimo turno del caster", () => {
  const { items, notice } = immediateDecision();
  const choicePlan = buildReminderResolutionPlan({ notice, items, outcome: "failed" });
  const afterChoice = applyReminderPlan(items, choicePlan, "heat-metal-con-save");
  const [saveNotice] = planEffectSaveReminderNotices({
    items: afterChoice,
    includeCurrentTurnStart: false,
  });
  const savePlan = buildReminderResolutionPlan({
    notice: saveNotice,
    items: afterChoice,
    outcome: "failed",
  });
  const afterSave = applyReminderPlan(afterChoice, savePlan, "heat-metal-penalty");
  const targetPenalty = afterSave.find((item) => item.id === "target")
    .metadata[META_KEY].conditions.find((condition) => condition.condition === "Svant. attacchi e prove");
  const mutationItems = [
    {
      id: "caster",
      name: "Caster",
      spells: [],
      concentrations: {
        heat: {
          name: "Riscaldare il Metallo",
          instanceId: "heat-cast-1",
          targets: ["target"],
        },
      },
      conditions: [],
    },
    {
      id: "target",
      name: "Portatore",
      spells: [],
      concentrations: {},
      conditions: [targetPenalty],
    },
  ];
  assert.ok(targetPenalty);
  const applied = buildEffectsMutationPlan(mutationItems, [], { operationId: "heat-metal-choice" });
  const targetAfterApply = applied.states.find((state) => state.id === "target");
  const penalty = targetAfterApply.conditions.find((condition) => condition.condition === "Svant. attacchi e prove");
  assert.equal(penalty.parentEffectId, undefined);
  assert.equal(penalty.expiry.actorId, "caster");

  const concentrationEnded = buildEffectsMutationPlan(applied.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
  }]);
  assert.ok(
    concentrationEnded.states.find((state) => state.id === "target")
      .conditions.some((condition) => condition.condition === "Svant. attacchi e prove"),
  );

  const boundary = buildEffectsMutationPlan(
    [
      { id: "caster", name: "Caster", spells: [], concentrations: {}, conditions: [] },
      concentrationEnded.states.find((state) => state.id === "target"),
    ],
    [{
      type: "condition:tick-boundaries",
      targetIds: ["target"],
      boundaries: [{ phase: "start", actorId: "caster", turnKey: "2:0:caster" }],
    }],
  );
  assert.deepEqual(boundary.states.find((state) => state.id === "target").conditions, []);
});
