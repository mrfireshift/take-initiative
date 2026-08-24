import assert from "node:assert/strict";
import test from "node:test";

import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { buildReminderResolutionPlan, REMINDER_OUTCOMES } from "../src/reminderResolutionCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getAreaSaveAutomation } from "../src/spells-srd.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";

const SPELL_ID = "slow";
const META_KEY = `${ID}/meta`;

function slowCondition(id) {
  const rule = getAreaSaveAutomation(SPELL_ID).failed[0];
  return {
    id,
    ...rule,
    active: true,
    sourceId: "caster",
    sourceName: "Caster",
    parentEffectId: "slow-cast",
    spellName: "Lentezza",
    spellId: SPELL_ID,
    type: "spell",
  };
}

function slowReminderItems() {
  return [
    {
      id: "caster",
      name: "Caster",
      metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 15 } } },
    },
    {
      id: "target-a",
      name: "Target A",
      metadata: { [META_KEY]: { conditions: [slowCondition("slow-effect-a")] } },
    },
    {
      id: "target-b",
      name: "Target B",
      metadata: { [META_KEY]: { conditions: [slowCondition("slow-effect-b")] } },
    },
  ];
}

function slowStateItems() {
  return [
    {
      id: "caster",
      spells: [],
      conditions: [],
      concentrations: {
        lentezza: {
          name: "Lentezza",
          spellId: SPELL_ID,
          instanceId: "slow-cast",
          targets: ["target-a", "target-b"],
        },
      },
    },
    ...["a", "b"].map((suffix) => ({
      id: `target-${suffix}`,
      spells: [{
        name: "Lentezza",
        spellId: SPELL_ID,
        instanceId: "slow-cast",
        conc: true,
        casterId: "caster",
      }],
      conditions: [slowCondition(`slow-effect-${suffix}`)],
    })),
  ];
}

function stateOf(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function contract() {
  return buildSpellUnifiedPanelContract({ spellId: SPELL_ID, castContext: { slotLevel: 3 } });
}

function placement(candidateTargetIds) {
  return {
    status: "confirmed",
    spellId: SPELL_ID,
    ruleId: `${SPELL_ID}:cast`,
    casterId: "caster",
    preview: {
      start: { x: 0, y: 0 },
      end: { x: 3, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      targetIds: candidateTargetIds,
    },
  };
}

test("SP-B05F — Lentezza usa un subset volontario dell'area e massimo 6 bersagli", () => {
  const rule = getSpellAreaRuleById(`${SPELL_ID}:cast`);
  const workflow = getSpellSaveWorkflowRule(SPELL_ID);
  const model = contract();

  assert.equal(rule.targeting.selectionMode, "area-subset");
  assert.equal(rule.targeting.confirmTargets, true);
  assert.equal(rule.targeting.includeCaster, true);
  assert.equal(workflow.ability, "wis");
  assert.equal(workflow.targeting.baseMaximum, 6);
  assert.equal(workflow.targeting.additionalPerSlotAbove, 0);
  assert.equal(model.presentation.targeting.selectionMode, "area-subset");
  assert.equal(model.presentation.targeting.limit.maximum, 6);
  assert.equal(model.presentation.inputs.targets.maximum, 6);
});

test("SP-B05F — i token esclusi volontariamente non richiedono un esito TS", () => {
  const candidates = ["enemy-a", "enemy-b", "ally-c"];
  const command = buildSpellAreaResolutionCommand({
    contract: contract(),
    casterId: "caster",
    slotLevel: 3,
    targetIds: ["enemy-a"],
    candidateTargetIds: candidates,
    outcomes: { "enemy-a": "failed" },
    placement: placement(candidates),
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.deepEqual(command.targeting.targetIds, ["enemy-a"]);
  assert.deepEqual(command.outcomes.byTarget, { "enemy-a": "failed" });
});

test("SP-B05F — oltre sei bersagli selezionati viene rifiutato", () => {
  const candidates = Array.from({ length: 7 }, (_, index) => `target-${index + 1}`);
  const command = buildSpellAreaResolutionCommand({
    contract: contract(),
    casterId: "caster",
    slotLevel: 3,
    targetIds: candidates,
    candidateTargetIds: candidates,
    outcomes: Object.fromEntries(candidates.map((id) => [id, "failed"])),
    placement: placement(candidates),
  });

  assert.equal(command.valid, false);
  assert.ok(command.errors.includes("target-limit-exceeded"));
});

test("SP-B05F — il TS SAG ricorrente mantiene Lentezza se fallisce e pulisce solo il bersaglio passato", () => {
  const [notice] = planEffectSaveReminderNotices({
    items: slowReminderItems(),
    previousInitiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: 1,
      round: 1,
    },
    initiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: 2,
      round: 1,
    },
    includeCurrentTurnStart: false,
  });

  assert.ok(notice);
  assert.equal(notice.target.id, "target-a");
  assert.equal(notice.saveLabel, "TS Saggezza CD 15");
  assert.equal(notice.resolution.damage, undefined);

  const failed = buildReminderResolutionPlan({
    notice,
    items: slowReminderItems(),
    outcome: REMINDER_OUTCOMES.FAILED,
    now: 100,
  });
  assert.equal(failed.status, "ready");
  assert.equal(
    failed.operations.some((operation) => operation.type === "condition:remove-instances"),
    false,
  );
  const afterFailed = buildEffectsMutationPlan(slowStateItems(), failed.operations);
  assert.equal(stateOf(afterFailed, "target-a").conditions.length, 1);
  assert.equal(stateOf(afterFailed, "target-a").spells.length, 1);

  const passed = buildReminderResolutionPlan({
    notice,
    items: slowReminderItems(),
    outcome: REMINDER_OUTCOMES.PASSED,
    now: 101,
  });
  assert.equal(passed.status, "ready");
  assert.deepEqual(passed.operations, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target-a", instanceId: "slow-effect-a" }],
  }]);
  const afterPassed = buildEffectsMutationPlan(slowStateItems(), passed.operations);
  assert.equal(stateOf(afterPassed, "target-a").conditions.length, 0);
  assert.equal(stateOf(afterPassed, "target-a").spells.length, 0);
  assert.equal(stateOf(afterPassed, "target-b").conditions.length, 1);
  assert.equal(stateOf(afterPassed, "target-b").spells.length, 1);
  assert.deepEqual(
    stateOf(afterPassed, "caster").concentrations.lentezza.targets,
    ["target-b"],
  );
});
