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
  buildSpellActiveResolutionFailureOperations,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import {
  callLightningTurnPromptPayloads,
  STONE_INVESTITURE_TURN_PROMPT_ACTION_ID,
} from "../src/callLightningTurnPromptCore.js";
import { ID } from "../src/constants.js";
import { buildSpellApplicationIntent } from "../src/spellApplicationPlanCore.js";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_PANEL_LANES,
  SPELL_UNIFIED_TARGETING_MODES,
} from "../src/spellUnifiedPanelCore.js";

const SPELL_ID = "xanathar-investitura-della-pietra";
const ACTION_ID = "stone-investiture-quake";

test("Investitura della Pietra al cast e una self-buff, non una spell ad area", () => {
  const spell = getSpellDefinition(SPELL_ID);
  assert.ok(spell);
  assert.equal(spell.targetMode, "self");
  assert.equal(AREA_SAVE_SPELL_ID_SET.has(SPELL_ID), false);
  assert.equal(AREA_POPOVER_SPELL_ID_SET.has(SPELL_ID), false);
  assert.deepEqual(getSpellAreaRules(SPELL_ID, { triggerType: "cast" }), []);

  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID });
  assert.equal(contract.presentation.subjectMode, "self");
  assert.equal(contract.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.NONE);
  assert.equal(contract.presentation.placement.available, false);
  assert.equal(contract.presentation.inputs.outcomes.required, false);
  assert.equal(contract.execution.lane, SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE);
  assert.equal(contract.execution.hasZones, false);

  assert.equal(getAreaSaveAutomation(spell), null);
  const intent = buildSpellApplicationIntent({
    spell,
    casterId: "caster",
    targetIds: ["caster"],
    castContext: { slotLevel: 6 },
    requestedConcentration: true,
  });
  assert.deepEqual(intent.castAutomationPlan.conditions, []);
  assert.equal(intent.castAutomationPlan.usedSaveAutomation, false);

  assert.equal(spell.effects.length, 1);
  assert.equal(spell.effects[0].id, "stone-investiture");
  assert.match(spell.effects[0].label, /Res\. armi non magiche/i);
});

test("Investitura della Pietra espone Scossa tellurica come active action senza danno", () => {
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
  assert.equal(action.placementRuleId, undefined);
  assert.deepEqual(action.fixedCasterRadius, { value: 4.5, unit: "m", includeCaster: false });
  assert.deepEqual(action.save, { ability: "dex", onSuccess: "none" });
  assert.equal(action.damage, undefined);
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);

  assert.equal(action.failureEffects.length, 1);
  assert.equal(action.failureEffects[0].label, "Prono");
  assert.equal(action.failureEffects[0].parentEffectId, "");
  assert.deepEqual(action.failureEffects[0].expiry, { mode: "manual" });
});

test("Scossa tellurica usa un raggio fisso 4,5 m sul caster senza sagoma da ridisegnare", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const action = spell.activeActions[0];
  assert.deepEqual(action.fixedCasterRadius, { value: 4.5, unit: "m", includeCaster: false });
  assert.equal(action.placementRuleId, undefined);
  assert.equal(getSpellAreaRuleById(`${SPELL_ID}:quake`), null);
});



test("Scossa tellurica discretizza il raggio come circle e non come box", () => {
  const area = buildCircleArea(
    { x: 75, y: 75 },
    { x: 525, y: 75 },
    150,
    { x: 0, y: 0 },
  );
  assert.equal(area.squares, 3);
  assert.ok(area.cells.some((cell) => cell.column === 3 && cell.row === 0));
  assert.ok(area.cells.some((cell) => cell.column === 2 && cell.row === 2));
  assert.ok(!area.cells.some((cell) => cell.column === 3 && cell.row === 3));
  assert.ok(area.cells.length < 49, "un circle da 3 caselle non deve diventare un box 7x7");
});

test("il fallimento di Scossa tellurica applica Prono indipendente dalla concentrazione", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const action = spell.activeActions[0];
  const operations = buildSpellActiveResolutionFailureOperations({
    action,
    payload: {
      instanceId: "stone-cast-1",
      casterId: "caster",
      casterName: "Anyanca",
    },
    targetIds: ["a", "b"],
    outcomes: { a: "failed", b: "passed" },
  });

  assert.equal(operations.length, 2);
  assert.equal(operations[0].type, "condition:add");
  assert.deepEqual(operations[0].targetIds, ["a"]);
  assert.equal(operations[0].conditionName, "Prono");
  assert.equal(operations[0].options.parentEffectId, "");
  assert.deepEqual(operations[0].options.expiry, { mode: "manual" });
});

test("il popup save-area supporta raggio fisso senza sagoma e azioni senza danno", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/spell-active-resolution.js", import.meta.url), "utf8")
  );
  assert.match(source, /function fixedCasterRadiusConfig\(\)/);
  assert.match(source, /refreshFixedCasterRadiusPlacement/);
  assert.match(source, /showFixedCasterRadiusPreview/);
  assert.match(source, /fixedCasterRadiusCircleArea/);
  assert.match(source, /fixedCasterRadiusCellCommands/);
  assert.match(source, /buildCircleArea/);
  assert.match(source, /areaHitsBounds\(circleArea, bounds\)/);
  assert.match(source, /buildCellBoundaryLoops/);
  assert.match(source, /spellAreaStyle\(payload\?\.spellId, loadAoEStyle\(\)\)/);
  assert.match(source, /caselle interessate/);
  assert.doesNotMatch(source, /fixedCasterRadiusCircleCommands/);
  assert.match(source, /OBR\.interaction\?\.startItemInteraction/);
  assert.match(source, /clearFixedCasterRadiusPreview/);
  assert.match(source, /placementToolbar/);
  assert.match(source, /const damageRequired = !!payload\?\.action\?\.damage/);
  assert.match(source, /\(!child && !!payload\?\.action\?\.damage && !\$\("damage"\)\.value\.trim\(\)\)/);
});


test("Scossa tellurica apre il prompt dal turno successivo del caster", () => {
  const metaKey = `${ID}/meta`;
  const spellsKey = `${ID}/spells`;
  const payloads = callLightningTurnPromptPayloads({
    actorId: "caster",
    sceneEpoch: 7,
    turnKey: "2:1:caster",
    items: [{
      id: "caster",
      name: "Anyanca",
      metadata: {
        [metaKey]: {
          [spellsKey]: [{
            name: "Investitura della Pietra",
            spellId: SPELL_ID,
            instanceId: "stone-cast-1",
            casterId: "caster",
            appliedAt: { round: 1, actorId: "caster", turnKey: "1:1:caster" },
            conc: true,
            castContext: { slotLevel: 6 },
          }],
        },
      },
    }],
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].actionId, STONE_INVESTITURE_TURN_PROMPT_ACTION_ID);
  assert.equal(payloads[0].actionId, ACTION_ID);
  assert.equal(payloads[0].action.damage, undefined);
});
