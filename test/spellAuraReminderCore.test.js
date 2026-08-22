import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { SPELL_AURA_META_KEY } from "../src/spellAuraCore.js";
import {
  planMobileAuraReminder,
  rearmedMobileAuraNotices,
} from "../src/spellAuraReminderCore.js";
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

test("Guardiani Spirituali espande un ingresso multi-target in risoluzioni indipendenti", () => {
  const multiItems = new Map(itemsById);
  multiItems.set("target-a", {
    id: "target-a",
    name: "Bersaglio A",
    metadata: { [META_KEY]: {} },
  });
  multiItems.set("target-b", {
    id: "target-b",
    name: "Bersaglio B",
    metadata: { [META_KEY]: {} },
  });
  const multiState = {
    order: ["caster", "target-a", "target-b"],
    current: 0,
    round: 1,
  };
  const initialized = planMobileAuraReminder({
    aura,
    desiredTargetIds: [],
    initiativeState: multiState,
    itemsById: multiItems,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const entering = planMobileAuraReminder({
    aura,
    auraItem: {
      id: "aura-item",
      metadata: {
        [SPELL_AURA_META_KEY]: {
          instanceId: aura.instanceId,
          triggerRuntime: initialized.runtime,
        },
      },
    },
    desiredTargetIds: ["target-a", "target-b"],
    initiativeState: multiState,
    itemsById: multiItems,
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });

  assert.equal(entering.newActivations.length, 1);
  assert.deepEqual(entering.newActivations[0].targetIds, ["target-a", "target-b"]);
  assert.equal(entering.notices.length, 2);
  assert.deepEqual(
    entering.notices.map((notice) => notice.targets.map((target) => target.id)),
    [["target-a"], ["target-b"]],
  );
  assert.equal(new Set(entering.notices.map((notice) => notice.activationId)).size, 2);
  for (const notice of entering.notices) {
    assert.equal(notice.resolution.save.ability, "wis");
    assert.equal(notice.resolution.damage.dice, "3d8");
    assert.equal(notice.resolution.activation.sourceActivationId, entering.newActivations[0].id);
  }

  const targetBNotice = entering.notices.find((notice) => notice.targets[0].id === "target-b");
  const rearmed = rearmedMobileAuraNotices({
    auraItem: {
      id: "aura-item",
      metadata: {
        [SPELL_AURA_META_KEY]: {
          instanceId: aura.instanceId,
          triggerRuntime: entering.runtime,
        },
      },
    },
    pendingActivations: entering.runtime.pending,
    rearmRequests: [{
      activationId: targetBNotice.activationId,
      sourceActivationId: entering.newActivations[0].id,
    }],
    itemsById: multiItems,
  });

  assert.deepEqual(rearmed.map((notice) => notice.activationId), [targetBNotice.activationId]);
  assert.deepEqual(rearmed[0].targets.map((target) => target.id), ["target-b"]);
});

test("un rearm root dell'aura riconsegna la pending activation senza crearne una nuova", () => {
  const initialized = planMobileAuraReminder({
    aura,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const turnStart = planMobileAuraReminder({
    aura,
    auraItem: {
      id: "aura-item",
      metadata: {
        [SPELL_AURA_META_KEY]: {
          instanceId: aura.instanceId,
          triggerRuntime: initialized.runtime,
        },
      },
    },
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });
  const activation = turnStart.runtime.pending[0];
  const notices = rearmedMobileAuraNotices({
    auraItem: { id: "aura-item" },
    pendingActivations: turnStart.runtime.pending,
    rearmRequests: [{ activationId: activation.id, sourceActivationId: activation.id }],
    itemsById,
  });

  assert.equal(turnStart.newActivations.length, 1);
  assert.deepEqual(notices.map((notice) => notice.activationId), [activation.id]);
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
