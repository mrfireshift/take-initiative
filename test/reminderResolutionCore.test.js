import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import {
  buildEffectSaveReminderResolution,
  buildReminderResolutionPlan,
  buildZoneTriggerReminderResolution,
  REMINDER_OUTCOMES,
  reminderResolutionControls,
  reminderResolutionDamage,
} from "../src/reminderResolutionCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

function token(id, meta = {}) {
  return {
    id,
    name: id,
    metadata: { [META_KEY]: meta },
  };
}

function sceneItems(targetMeta = {}) {
  return [
    token("target", targetMeta),
    token("caster", { initiativeCard: { spellSaveDC: 15 } }),
    {
      id: "zone",
      name: "Zona",
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: {
          triggerRuntime: {
            pending: [{
              id: "zone-activation",
              targetIds: ["target"],
            }],
          },
        },
      },
    },
  ];
}

function zoneResolution(overrides = {}) {
  return buildZoneTriggerReminderResolution({
    activation: {
      id: "zone-activation",
      resolution: "manual-save",
      ability: "dex",
      zoneItemId: "zone",
      targetIds: ["target"],
      turnKey: "turn-1",
      damage: { dice: "1d6", type: "fuoco", onSave: "half" },
      failureCondition: { condition: "Prono" },
      ...overrides,
    },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
}

function planForZone({ outcome, damageRoll = 0, targetMeta = {}, resolution = zoneResolution() }) {
  return buildReminderResolutionPlan({
    notice: {
      activationId: "zone-activation",
      targets: [{ id: "target", name: "Target" }],
      resolution,
    },
    items: sceneItems(targetMeta),
    outcome,
    damageRoll,
    sceneMetadata: { [STATE_KEY]: { round: 1, current: 0 } },
    now: 100,
  });
}

test("i controlli di risoluzione sono disponibili solo al GM", () => {
  assert.deepEqual(
    reminderResolutionControls({ role: "GM", resolution: zoneResolution() }),
    ["passed", "failed", "immune"],
  );
  assert.deepEqual(
    reminderResolutionControls({ role: "PLAYER", resolution: zoneResolution() }),
    [],
  );
});

test("un reminder informativo resta privo di una risoluzione", () => {
  const instance = {
    id: "informational-effect",
    condition: "Nauseato",
    saveReminder: { ability: "wis", timing: "turn-end" },
  };
  assert.equal(
    buildEffectSaveReminderResolution({
      item: token("target"),
      instance,
      reminder: instance.saveReminder,
      activationId: "informational-activation",
    }),
    null,
  );
  assert.equal(
    buildReminderResolutionPlan({
      notice: {
        activationId: "informational-activation",
        targets: [{ id: "target" }],
      },
      items: [token("target")],
      outcome: REMINDER_OUTCOMES.PASSED,
    }).status,
    "informational",
  );
});

test("il successo rimuove la condizione indicata e marca il reminder", () => {
  const instance = {
    id: "effect-1",
    condition: "Nauseato",
    manualRemoval: true,
    sourceId: "caster",
    saveReminder: { ability: "wis", timing: "turn-end" },
  };
  const resolution = buildEffectSaveReminderResolution({
    item: token("target", { conditions: [instance] }),
    instance,
    reminder: instance.saveReminder,
    dc: 15,
    activationId: "effect-activation",
    turnKey: "turn-1",
  });
  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "effect-activation",
      targets: [{ id: "target" }],
      resolution,
    },
    items: [
      token("target", { conditions: [instance] }),
      token("caster"),
    ],
    outcome: REMINDER_OUTCOMES.PASSED,
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.operations[0], {
    type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: "effect-1" }],
  });
  assert.equal(
    plan.metadataPatches[0].fields.reminderResolutions.value["effect-activation"].outcome,
    "passed",
  );
});

test("il fallimento applica la condizione modellata e mantiene il reminder idempotente", () => {
  const plan = planForZone({
    outcome: REMINDER_OUTCOMES.FAILED,
    damageRoll: 7,
    targetMeta: { hp: 20, hpMax: 20 },
  });
  assert.equal(plan.status, "ready");
  assert.ok(plan.operations.some((operation) => operation.type === "condition:add"));
  assert.equal(plan.hpChange.after, 13);
  assert.equal(plan.damage.amount, 7);

  const marker = plan.metadataPatches[0].fields.reminderResolutions.value;
  const repeated = planForZone({
    outcome: REMINDER_OUTCOMES.FAILED,
    damageRoll: 7,
    targetMeta: { hp: 20, hpMax: 20, reminderResolutions: marker },
  });
  assert.equal(repeated.status, "already-resolved");
});

test("il danno pieno, dimezzato per difetto e nullo segue l'esito", () => {
  const resolution = zoneResolution();
  assert.deepEqual(reminderResolutionDamage(resolution, "failed", 7), {
    roll: 7,
    factor: "full",
    amount: 7,
  });
  assert.deepEqual(reminderResolutionDamage(resolution, "passed", 7), {
    roll: 7,
    factor: "half",
    amount: 3,
  });
  assert.deepEqual(reminderResolutionDamage(resolution, "immune", 7), {
    roll: 7,
    factor: "zero",
    amount: 0,
  });

  const zeroPlan = planForZone({
    outcome: REMINDER_OUTCOMES.PASSED,
    damageRoll: 7,
    targetMeta: { hp: 20, hpMax: 20 },
    resolution: zoneResolution({
      damage: { dice: "1d6", type: "fuoco", onSave: "none" },
      failureCondition: { condition: "Prono" },
    }),
  });
  assert.equal(zeroPlan.status, "ready");
  assert.equal(zeroPlan.damage.amount, 0);
  assert.equal(zeroPlan.hpChange, null);
  assert.equal(
    zeroPlan.operations.some((operation) => operation.type === "condition:add"),
    false,
  );
});

test("l'immunita non applica danni né condizioni", () => {
  const plan = planForZone({
    outcome: REMINDER_OUTCOMES.IMMUNE,
    damageRoll: 7,
    targetMeta: { hp: 20, hpMax: 20 },
  });
  assert.equal(plan.status, "ready");
  assert.equal(plan.damage.amount, 0);
  assert.equal(plan.hpChange, null);
  assert.equal(
    plan.operations.some((operation) => operation.type === "condition:add"),
    false,
  );
});

test("target assente o dado non valido rendono il reminder stale o invalido", () => {
  const stale = buildReminderResolutionPlan({
    notice: {
      activationId: "zone-activation",
      targets: [{ id: "missing" }],
      resolution: zoneResolution(),
    },
    items: sceneItems(),
    outcome: REMINDER_OUTCOMES.PASSED,
  });
  assert.equal(stale.status, "stale");

  const invalid = planForZone({
    outcome: REMINDER_OUTCOMES.FAILED,
    damageRoll: "-1",
    targetMeta: { hp: 20, hpMax: 20 },
  });
  assert.equal(invalid.status, "invalid");
});

test("una risoluzione aggregata multi-target resta informativa", () => {
  const result = buildReminderResolutionPlan({
    notice: {
      activationId: "zone-activation",
      targets: [{ id: "target" }, { id: "second-target" }],
      resolution: zoneResolution(),
    },
    items: sceneItems(),
    outcome: REMINDER_OUTCOMES.PASSED,
  });
  assert.equal(result.status, "unsupported");
});
