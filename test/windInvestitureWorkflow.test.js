import test from "node:test";
import assert from "node:assert/strict";

import {
  AREA_SAVE_SPELL_ID_SET,
  AREA_POPOVER_SPELL_ID_SET,
} from "../src/areaSaveSpellRules.js";
import {
  getSpellAreaRuleById,
  getSpellAreaRules,
} from "../src/spellAreaRules.js";
import {
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import {
  callLightningTurnPromptPayloads,
  WIND_INVESTITURE_TURN_PROMPT_ACTION_ID,
} from "../src/callLightningTurnPromptCore.js";
import { ID } from "../src/constants.js";
import { buildSpellApplicationIntent } from "../src/spellApplicationPlanCore.js";
import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_PANEL_LANES,
  SPELL_UNIFIED_TARGETING_MODES,
} from "../src/spellUnifiedPanelCore.js";

const SPELL_ID = "xanathar-investitura-del-vento";
const ACTION_ID = "wind-investiture-gust";
const ACTION_RULE_ID = `${SPELL_ID}:cubo-di-vento`;

test("Investitura del Vento al cast e una self-buff, non una spell ad area", () => {
  const spell = getSpellDefinition(SPELL_ID);
  assert.ok(spell);
  assert.equal(spell.targetMode, "self");
  assert.equal(AREA_SAVE_SPELL_ID_SET.has(SPELL_ID), false);
  assert.equal(AREA_POPOVER_SPELL_ID_SET.has(SPELL_ID), false);
  assert.deepEqual(getSpellAreaRules(SPELL_ID, { triggerType: "cast" }), []);
  assert.equal(getAreaSaveAutomation(spell), null);

  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID });
  assert.equal(contract.presentation.subjectMode, "self");
  assert.equal(contract.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.NONE);
  assert.equal(contract.presentation.placement.available, false);
  assert.equal(contract.presentation.inputs.outcomes.required, false);
  assert.equal(contract.execution.lane, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);
  assert.equal(contract.execution.hasZones, false);
});

test("Investitura del Vento applica il buff persistente al caster", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const intent = buildSpellApplicationIntent({
    spell,
    casterId: "caster",
    targetIds: ["caster"],
    castContext: { slotLevel: 6 },
    requestedConcentration: true,
  });

  assert.deepEqual(intent.subjects, ["caster"]);
  assert.equal(intent.castAutomationPlan.usedSaveAutomation, false);
  assert.equal(intent.castAutomationPlan.effects.length, 1);
  assert.equal(intent.castAutomationPlan.effects[0].id, "wind-investiture");
  assert.match(intent.castAutomationPlan.effects[0].label, /Volo/i);
  assert.deepEqual(
    intent.castAutomationPlan.effects[0].mechanics.movement.modes.fly,
    { grantMeters: 18 },
  );
});

test("Investitura del Vento espone il cubo di vento come active action", () => {
  const spell = getSpellDefinition(SPELL_ID);
  assert.equal(spell.activeActions.length, 1);
  const action = spell.activeActions[0];

  assert.equal(action.id, ACTION_ID);
  assert.equal(action.economy, "action");
  assert.equal(action.resolutionKind, "save-area");
  assert.equal(action.turnStartPrompt, true);
  assert.equal(action.showInOverview, true);
  assert.equal(action.availableAfterCast, true);
  assert.equal(action.requiresTargets, false);
  assert.equal(action.placementRuleId, ACTION_RULE_ID);
  assert.equal(action.rangeOrigin, "caster");
  assert.deepEqual(action.save, { ability: "con", onSuccess: "half" });
  assert.deepEqual(action.damage, {
    formula: "2d10",
    type: "contundenti",
    onSave: "half",
  });
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);

  const rule = getSpellAreaRuleById(ACTION_RULE_ID);
  assert.ok(rule);
  assert.deepEqual(rule.trigger, { type: "active-action", actionId: ACTION_ID });
  assert.equal(rule.geometry.shape, "square");
  assert.deepEqual(rule.geometry.size, { value: 4.5, unit: "m", measure: "side" });
  assert.equal(rule.placement.origin, "point");
  assert.deepEqual(rule.placement.range, { value: 18, unit: "m", measure: "range" });
  assert.equal(rule.lifecycle.persistence, "preview");
});

test("Cubo di vento viene scoperto dal turno successivo del caster", () => {
  const metaKey = `${ID}/meta`;
  const spellsKey = `${ID}/spells`;
  const caster = {
    id: "caster",
    name: "Anyanca",
    metadata: {
      [metaKey]: {
        [spellsKey]: [{
          name: "Investitura del Vento",
          spellId: SPELL_ID,
          instanceId: "wind-cast-1",
          casterId: "caster",
          appliedAt: { round: 1, actorId: "caster", turnKey: "1:1:caster" },
          conc: true,
          castContext: { slotLevel: 6 },
        }],
      },
    },
  };

  assert.deepEqual(callLightningTurnPromptPayloads({
    actorId: "caster",
    sceneEpoch: 7,
    turnKey: "1:1:caster",
    items: [caster],
  }), []);

  const payloads = callLightningTurnPromptPayloads({
    actorId: "caster",
    sceneEpoch: 7,
    turnKey: "2:1:caster",
    items: [caster],
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].actionId, WIND_INVESTITURE_TURN_PROMPT_ACTION_ID);
  assert.equal(payloads[0].actionId, ACTION_ID);
  assert.equal(payloads[0].action.damage.formula, "2d10");
});
