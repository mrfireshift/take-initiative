import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { SPELL_AURA_META_KEY } from "../src/spellAuraCore.js";
import { planMobileAuraReminder } from "../src/spellAuraReminderCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";

const META_KEY = `${ID}/meta`;

const initiativeState = (current) => ({
  order: ["caster", "target"],
  current,
  round: 1,
});

const aura = {
  instanceId: "spirits-1",
  spellId: "spirit-guardians",
  spellName: "Guardiani Spirituali",
  casterId: "caster",
  rule: getSpellAreaRuleById("spirit-guardians:aura"),
};

const itemsById = new Map([
  ["caster", {
    id: "caster",
    name: "Lavera",
    metadata: {
      [META_KEY]: {
        initiativeCard: { spellSaveDC: 19 },
      },
    },
  }],
  ["target", {
    id: "target",
    name: "Nothic",
    metadata: { [META_KEY]: {} },
  }],
]);

test("Guardiani Spirituali genera il TS a inizio turno nell'aura mobile", () => {
  const initialized = planMobileAuraReminder({
    aura,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const auraItem = {
    id: "aura-item",
    metadata: {
      [SPELL_AURA_META_KEY]: {
        instanceId: aura.instanceId,
        triggerRuntime: initialized.runtime,
      },
    },
  };
  const turnStart = planMobileAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });

  assert.equal(turnStart.newActivations.length, 1);
  assert.equal(turnStart.newActivations[0].event, "turn-start");
  assert.equal(turnStart.newActivations[0].damage.dice, "3d8");
  assert.equal(turnStart.notices[0].spellName, "Guardiani Spirituali");
  assert.equal(turnStart.notices[0].dc, 19);
  assert.equal(turnStart.notices[0].casterName, "Lavera");
});

test("spostare l'aura sui token non simula il loro ingresso", () => {
  const initialized = planMobileAuraReminder({
    aura,
    desiredTargetIds: [],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const auraItem = {
    id: "aura-item",
    metadata: {
      [SPELL_AURA_META_KEY]: {
        instanceId: aura.instanceId,
        triggerRuntime: initialized.runtime,
      },
    },
  };
  const moved = planMobileAuraReminder({
    aura,
    auraItem,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 100, y: 0 },
    now: 2,
  });

  assert.deepEqual(moved.newActivations, []);
});
