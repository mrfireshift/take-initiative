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

test("Investitura della Fiamma propone 1d10 fuoco all'ingresso e a fine turno", () => {
  const flameAura = {
    instanceId: "flame-1",
    spellId: "xanathar-investitura-della-fiamma",
    spellName: "Investitura della Fiamma",
    casterId: "caster",
    rule: getSpellAreaRuleById("xanathar-investitura-della-fiamma:aura"),
  };
  const initial = planMobileAuraReminder({
    aura: flameAura,
    desiredTargetIds: [],
    initiativeState: initiativeState(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const auraItem = {
    id: "flame-aura-item",
    metadata: {
      [SPELL_AURA_META_KEY]: {
        instanceId: flameAura.instanceId,
        triggerRuntime: initial.runtime,
      },
    },
  };
  const entering = planMobileAuraReminder({
    aura: flameAura,
    auraItem,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });
  assert.equal(entering.newActivations.length, 1);
  assert.equal(entering.newActivations[0].damage.dice, "1d10");
  assert.equal(entering.newActivations[0].damage.type, "fuoco");

  const turnEndInitial = planMobileAuraReminder({
    aura: flameAura,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 3,
  });
  const turnEnd = planMobileAuraReminder({
    aura: flameAura,
    auraItem: {
      ...auraItem,
      metadata: {
        [SPELL_AURA_META_KEY]: {
          ...auraItem.metadata[SPELL_AURA_META_KEY],
          triggerRuntime: turnEndInitial.runtime,
        },
      },
    },
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 4,
  });
  assert.equal(turnEnd.newActivations.length, 1);
  assert.equal(turnEnd.newActivations[0].event, "turn-end");
  assert.equal(turnEnd.newActivations[0].damage.dice, "1d10");
});
