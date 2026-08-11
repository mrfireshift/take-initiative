import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_PANEL_LANES,
  SPELL_UNIFIED_TARGETING_MODES,
} from "../src/spellUnifiedPanelCore.js";

function has(values, value) {
  assert.equal(values.includes(value), true, `missing ${value}`);
}

test("Palla di fuoco espone placement geometrico e transazione HP", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "fireball" });

  assert.deepEqual(model.presentation.phase.options.map((phase) => phase.value), ["cast"]);
  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.placement.ruleId, "fireball:cast");
  assert.equal(model.presentation.placement.required, true);
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

test("Catena di fulmini usa targeting discreto e conserva la lane HP area", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "chain-lightning" });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(model.presentation.placement.available, false);
  has(model.presentation.controls, "targets");
  has(model.presentation.controls, "save-outcomes");
  assert.equal(model.execution.lane, SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION);
  assert.equal(model.execution.hasHP, true);
  assert.equal(model.execution.hasZones, false);
  assert.equal(model.execution.hasTokens, false);
});

test("Mano arcana compone placement pedina, HP e azioni della pedina", () => {
  const model = buildSpellUnifiedPanelContract({ spellId: "arcane-hand" });

  assert.equal(model.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.GEOMETRIC);
  assert.equal(model.presentation.placement.mode, "board-token");
  assert.equal(model.presentation.placement.ruleId, "arcane-hand:board-token");
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

test("Raffica di Spine separa preparazione e risoluzione", () => {
  const prepare = buildSpellUnifiedPanelContract({
    spellId: "phb2014-raffica-di-spine",
  });
  assert.equal(prepare.presentation.phase.selected, "prepare");
  assert.equal(prepare.presentation.subjectMode, "caster");
  assert.equal(prepare.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.NONE);
  assert.equal(prepare.presentation.placement.available, false);
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
  assert.equal(model.execution.hasZones, true);
  assert.equal(model.execution.hasHP, true);
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
