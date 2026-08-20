import assert from "node:assert/strict";
import test from "node:test";

import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";

const SPELL_ID = "slow";

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
