import test from "node:test";
import assert from "node:assert/strict";

import {
  AREA_SAVE_SPELL_ID_SET,
  AREA_POPOVER_SPELL_ID_SET,
  MULTI_TARGET_SAVE_SPELL_ID_SET,
} from "../src/areaSaveSpellRules.js";
import { getSpellAreaRules } from "../src/spellAreaRules.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { resolveSpellSaveTargeting } from "../src/spellSaveTargetingCore.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_TARGETING_MODES,
} from "../src/spellUnifiedPanelCore.js";

const SPELL_ID = "compulsion";

test("Compulsione al cast usa bersagli discreti, non una sagoma ad area", () => {
  assert.equal(AREA_SAVE_SPELL_ID_SET.has(SPELL_ID), false);
  assert.equal(MULTI_TARGET_SAVE_SPELL_ID_SET.has(SPELL_ID), true);
  assert.equal(AREA_POPOVER_SPELL_ID_SET.has(SPELL_ID), true);
  assert.deepEqual(getSpellAreaRules(SPELL_ID, { triggerType: "cast" }), []);

  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID });
  assert.equal(contract.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(contract.presentation.placement.available, false);
  assert.equal(contract.presentation.inputs.targets.required, true);
  assert.equal(contract.presentation.inputs.outcomes.required, true);
});

test("Compulsione consente piu bersagli entro 9 m dal caster senza limite artificiale", () => {
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.ok(rule);
  assert.equal(rule.ability, "wis");
  assert.equal(rule.targeting.unlimitedTargets, true);
  assert.deepEqual(rule.targeting.spatial, { mode: "caster-range", maxMeters: 9 });

  const valid = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    targetIds: ["a", "b", "c"],
    casterDistancesMeters: { a: 3, b: 6, c: 9 },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.maximumTargets, null);

  const invalid = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    targetIds: ["a", "b"],
    casterDistancesMeters: { a: 3, b: 9.1 },
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.spatial.invalidTargetIds, ["b"]);
  assert.ok(invalid.errors.includes("caster-range-exceeded"));
});

test("Compulsione applica il debuff persistente ma non un reminder generico di fine turno", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const automation = getAreaSaveAutomation(spell);
  assert.ok(automation);
  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  const effect = automation.failed[0];
  assert.equal(effect.effectId, "compulsion-forced-movement");
  assert.equal(effect.condition, "Compulsione: Movimento imposto");
  assert.equal(effect.expiry.mode, "concentration");
  assert.equal(effect.parentRemoval, "target");
  assert.equal(effect.saveReminder, undefined);
});

import { ID } from "../src/constants.js";
import { planCompulsionMovementReminderNotices } from "../src/compulsionMovementReminderCore.js";

function compulsionFixture() {
  const metaKey = `${ID}/meta`;
  const source = {
    id: "caster",
    name: "Bardo",
    metadata: {
      [metaKey]: {
        initiativeCard: { spellSaveDC: 16 },
      },
    },
  };
  const target = {
    id: "target",
    name: "Guardia",
    image: { url: "guard.png" },
    metadata: {
      [metaKey]: {
        conditions: {
          instances: [{
            id: "cond-compulsion-1",
            condition: "Compulsione: Movimento imposto",
            active: true,
            sourceId: "caster",
            sourceName: "Bardo",
            parentEffectId: "spell-compulsion-1",
            spellName: "Compulsione",
            spellId: SPELL_ID,
            effectId: "compulsion-forced-movement",
            manualRemoval: true,
            endsParentOnRemoval: true,
            parentRemoval: "target",
            expiry: { mode: "concentration" },
          }],
        },
      },
    },
  };
  return { source, target };
}

test("Compulsione genera il TS dopo il movimento del bersaglio nel suo turno", () => {
  const { source, target } = compulsionFixture();
  const notices = planCompulsionMovementReminderNotices({
    items: [source, target],
    changedRecords: [{
      domains: ["movement"],
      flags: { movement: true },
      after: { item: target },
    }],
    initiativeState: { order: ["caster", "target"], current: 1, round: 2 },
  });

  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "effect-save");
  assert.equal(notices[0].timing, "movement-end");
  assert.equal(notices[0].ability, "SAG");
  assert.equal(notices[0].dc, 16);
  assert.equal(notices[0].target.id, "target");
  assert.match(notices[0].activationId, /^cond-compulsion-1:movement:/);
  assert.equal(notices[0].resolution.outcomes.passed.mode, "remove-effect");
  assert.equal(notices[0].resolution.outcomes.failed.mode, "keep-effect");
});

test("Compulsione non genera reminder per movimenti fuori dal turno del bersaglio", () => {
  const { source, target } = compulsionFixture();
  const notices = planCompulsionMovementReminderNotices({
    items: [source, target],
    changedRecords: [{
      domains: ["movement"],
      flags: { movement: true },
      after: { item: target },
    }],
    initiativeState: { order: ["caster", "target"], current: 0, round: 2 },
  });
  assert.deepEqual(notices, []);
});
