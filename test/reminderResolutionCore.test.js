import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import {
  buildEffectSaveReminderResolution,
  buildMovementEscapeReminderResolution,
  buildReminderResolutionPlan,
  buildZoneTriggerReminderResolution,
  REMINDER_OUTCOMES,
  reminderResolutionControls,
  reminderResolutionDamage,
  reminderResolutionOutcomeNeedsDamage,
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

function sceneItems(targetMeta = {}, activationId = "zone-activation") {
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
              id: activationId,
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

test("il danno automatico espone soltanto il controllo Conferma al GM", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "flame-controls",
      resolution: "manual-effect",
      damage: { dice: "1d10", type: "fuoco", onSave: "none" },
    },
    targetId: "target",
  });
  assert.deepEqual(
    reminderResolutionControls({ role: "GM", resolution }),
    ["confirmed"],
  );
  assert.deepEqual(
    reminderResolutionControls({ role: "PLAYER", resolution }),
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

test("Libertà di movimento propone la fuga non magica al turno del bersaglio", () => {
  const resolution = buildMovementEscapeReminderResolution({
    targetId: "target",
    restrictionInstanceId: "grappled",
    activationId: "freedom-escape-1",
    turnKey: "1:0:target",
  });
  assert.deepEqual(resolution.choiceLabels, {
    passed: "Spendi 1,5 m",
    failed: "Non ora",
  });
  assert.deepEqual(resolution.outcomes.passed.actions.map((action) => action.kind), [
    "movement",
    "condition",
  ]);
});

test("la risoluzione di fuga rimuove la restrizione e aggiorna il movimento nello stesso piano", () => {
  const resolution = buildMovementEscapeReminderResolution({
    targetId: "target",
    restrictionInstanceId: "grappled",
    activationId: "freedom-escape-1",
    turnKey: "1:0:target",
  });
  const targetMeta = {
    conditions: [{ id: "grappled", condition: "Afferrato", active: true }],
    speedCheckMovement: {
      version: 2,
      turnKey: "1:0:target",
      totalMeters: 3,
      activeMode: "walk",
    },
  };
  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "freedom-escape-1",
      targets: [{ id: "target" }],
      resolution,
    },
    items: [token("target", targetMeta)],
    outcome: REMINDER_OUTCOMES.PASSED,
    sceneMetadata: {
      [STATE_KEY]: { order: ["target"], current: 0, round: 1 },
    },
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.operations, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: "grappled" }],
  }]);
  const movementPatch = plan.metadataPatches.find((patch) =>
    patch.fields?.speedCheckMovement,
  );
  assert.equal(movementPatch.fields.speedCheckMovement.value.totalMeters, 4.5);
  assert.equal(
    plan.metadataPatches[0].fields.reminderResolutions.value["freedom-escape-1"].outcome,
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

test("un esito a danno zero non richiede il risultato dadi, mentre full/half sì", () => {
  const zeroOnPassed = zoneResolution({
    damage: { dice: "4d6", type: "fuoco", onSave: "none" },
    failureCondition: { condition: "In fiamme" },
  });
  assert.equal(reminderResolutionOutcomeNeedsDamage(zeroOnPassed, "passed"), false);
  assert.equal(reminderResolutionOutcomeNeedsDamage(zeroOnPassed, "failed"), true);

  const passedWithoutRoll = planForZone({
    outcome: REMINDER_OUTCOMES.PASSED,
    damageRoll: "",
    targetMeta: { hp: 20, hpMax: 20 },
    resolution: zeroOnPassed,
  });
  assert.equal(passedWithoutRoll.status, "ready");
  assert.equal(passedWithoutRoll.damage.amount, 0);
  assert.equal(passedWithoutRoll.hpChange, null);

  const failedWithoutRoll = planForZone({
    outcome: REMINDER_OUTCOMES.FAILED,
    damageRoll: "",
    targetMeta: { hp: 20, hpMax: 20 },
    resolution: zeroOnPassed,
  });
  assert.equal(failedWithoutRoll.status, "invalid");

  const halfOnPassed = zoneResolution({
    damage: { dice: "4d6", type: "fuoco", onSave: "half" },
  });
  assert.equal(reminderResolutionOutcomeNeedsDamage(halfOnPassed, "passed"), true);
  const halfWithoutRoll = planForZone({
    outcome: REMINDER_OUTCOMES.PASSED,
    damageRoll: "",
    targetMeta: { hp: 20, hpMax: 20 },
    resolution: halfOnPassed,
  });
  assert.equal(halfWithoutRoll.status, "invalid");
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

test("il danno automatico di zona richiede Conferma e applica il tiro pieno", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "flame-activation",
      resolution: "manual-effect",
      zoneItemId: "zone",
      targetIds: ["target"],
      damage: { dice: "1d10", type: "fuoco", onSave: "none" },
    },
    targetId: "target",
    sourceId: "caster",
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
  assert.equal(resolution.mode, "manual-damage");
  assert.equal(reminderResolutionDamage(resolution, "confirmed", 7).amount, 7);

  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "flame-activation",
      targets: [{ id: "target" }],
      resolution,
    },
    items: sceneItems({ hp: 20, hpMax: 20 }, "flame-activation"),
    outcome: "confirmed",
    damageRoll: 7,
    sceneMetadata: { [STATE_KEY]: { round: 1, current: 0 } },
  });
  assert.equal(plan.status, "ready");
  assert.equal(plan.resolutionMode, "manual-damage");
  assert.equal(plan.damage.amount, 7);
  assert.deepEqual(plan.hpChange, { before: 20, after: 13, hpMax: 20 });
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

test("lo scaling dei reminder usa lo slot dell'istanza una sola volta", () => {
  const dust = (slotLevel) => buildZoneTriggerReminderResolution({
    activation: {
      id: "dust-activation",
      resolution: "manual-save",
      ability: "str",
      damage: {
        dice: "1d8",
        type: "contundenti",
        onSave: "half",
        additionalPerSlotAbove: 1,
        baseSlot: 2,
      },
    },
    targetId: "target",
    sourceId: "caster",
    slotLevel,
  });
  assert.equal(dust(2).damage.dice, "1d8");
  assert.equal(dust(3).damage.dice, "2d8");
  assert.equal(dust(5).damage.dice, "4d8");

  const spirit = (slotLevel) => buildZoneTriggerReminderResolution({
    activation: {
      id: "spirit-activation",
      resolution: "manual-heal",
      healing: { dice: "1d6", additionalPerSlotAbove: 1, baseSlot: 2 },
    },
    targetId: "target",
    sourceId: "caster",
    slotLevel,
  });
  assert.equal(spirit(2).healing.dice, "1d6");
  assert.equal(spirit(3).healing.dice, "2d6");
  assert.equal(spirit(5).healing.dice, "4d6");
});

test("la cura manuale usa hp canonici, cap, Ignora e consumo una tantum", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "heal-activation",
      resolution: "manual-heal",
      healing: { dice: "2d6", additionalPerSlotAbove: 1, baseSlot: 2 },
      zoneItemId: "zone",
      instanceId: "spirit-1",
    },
    targetId: "target",
    sourceId: "caster",
    slotLevel: 3,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
  const applied = buildReminderResolutionPlan({
    notice: {
      activationId: "heal-activation",
      targets: [{ id: "target" }],
      resolution,
    },
    items: sceneItems({ hp: 8, hpMax: 10 }, "heal-activation"),
    outcome: "apply",
    damageRoll: 7,
    now: 200,
  });
  assert.equal(applied.status, "ready");
  assert.deepEqual(applied.healing, { roll: 7, amount: 2 });
  assert.deepEqual(applied.hpChange, { before: 8, after: 10, hpMax: 10 });
  assert.equal(applied.sideEffects[0].type, "reminder:consume-zone-activation");
  assert.equal(
    applied.metadataPatches[0].fields.reminderResolutions.value["heal-activation"].outcome,
    "apply",
  );

  const ignored = buildReminderResolutionPlan({
    notice: {
      activationId: "heal-activation",
      targets: [{ id: "target" }],
      resolution,
    },
    items: sceneItems({ hp: 8, hpMax: 10 }, "heal-activation"),
    outcome: "ignore",
  });
  assert.equal(ignored.status, "ready");
  assert.equal(ignored.hpChange, null);

  const construct = buildReminderResolutionPlan({
    notice: {
      activationId: "heal-activation",
      targets: [{ id: "target" }],
      resolution,
    },
    items: sceneItems({ hp: 8, hpMax: 10, creatureType: "Costrutto" }, "heal-activation"),
    outcome: "apply",
    damageRoll: 7,
  });
  assert.equal(construct.status, "unsupported");
});

test("SP-B04B — Prono da Tempesta di Nevischio è indipendente dalla zona", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "sleet-prone",
      instanceId: "sleet-1",
      triggerId: "sleet-storm-save-on-turn-start",
      resolution: "manual-save",
      ability: "dex",
      zoneItemId: "zone",
      targetIds: ["target"],
      failureCondition: {
        condition: "Prono",
        options: { parentEffectId: "" },
      },
    },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });

  const failed = resolution.outcomes.failed.actions.find((action) => (
    action.kind === "condition" && action.action === "apply"
  ));
  assert.equal(failed.name, "Prono");
  assert.equal(failed.options.parentEffectId, "");
});

test("SP-B04B — fallire il check ambientale di concentrazione interrompe la concentrazione corrente", () => {
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "sleet-concentration",
      instanceId: "sleet-1",
      triggerId: "sleet-storm-concentration-save-on-turn-start",
      resolution: "manual-save",
      ability: "con",
      requiresConcentration: true,
      zoneItemId: "zone",
      targetIds: ["target"],
    },
    targetId: "target",
    sourceId: "caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });

  assert.deepEqual(
    resolution.outcomes.failed.actions,
    [{ kind: "concentration", action: "break", targetId: "target" }],
  );

  const items = sceneItems({
    [`${ID}/concentration`]: {
      web: { name: "Ragnatela", instanceId: "web-1", targets: ["target"] },
    },
  }, "sleet-concentration");
  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "sleet-concentration",
      targets: [{ id: "target", name: "Target" }],
      resolution,
    },
    items,
    outcome: REMINDER_OUTCOMES.FAILED,
    sceneMetadata: { [STATE_KEY]: { round: 1, current: 0 } },
  });
  assert.equal(plan.status, "ready");
  assert.deepEqual(
    plan.operations.filter((operation) => operation.type === "concentration:break"),
    [{ type: "concentration:break", casterIds: ["target"], reference: "web-1" }],
  );
});

test("SP-R06A regression — un reminder ricorrente compatta i marker obsoleti della stessa istanza senza gonfiare History", () => {
  const instance = {
    id: "effect-1",
    condition: "Trattenuto",
    manualRemoval: true,
    sourceId: "caster",
    parentEffectId: "fts-1",
    saveReminder: {
      ability: "con",
      timing: "turn-end",
      success: "keep-effect",
    },
  };
  const staleMarkers = Object.fromEntries(
    Array.from({ length: 48 }, (_, index) => [
      `effect-1:turn-end:${index + 1}:target`,
      { version: 1, outcome: "failed", resolvedAt: index + 1 },
    ]),
  );
  staleMarkers["other-effect:turn-end:48:target"] = {
    version: 1,
    outcome: "passed",
    resolvedAt: 48,
  };
  const targetMeta = {
    conditions: [instance],
    reminderResolutions: staleMarkers,
  };
  const resolution = buildEffectSaveReminderResolution({
    item: token("target", targetMeta),
    instance,
    reminder: instance.saveReminder,
    dc: 17,
    activationId: "effect-1:turn-end:49:target",
    turnKey: "49:0:target",
  });
  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "effect-1:turn-end:49:target",
      targets: [{ id: "target" }],
      resolution,
    },
    items: [
      token("target", targetMeta),
      token("caster"),
    ],
    outcome: REMINDER_OUTCOMES.FAILED,
    now: 100,
  });

  assert.equal(plan.status, "ready");
  const descriptor = plan.metadataPatches[0].fields.reminderResolutions;
  assert.ok(descriptor.value["effect-1:turn-end:49:target"]);
  assert.ok(descriptor.value["other-effect:turn-end:48:target"]);
  assert.equal(
    Object.keys(descriptor.value).some((key) => key.startsWith("effect-1:turn-end:")
      && key !== "effect-1:turn-end:49:target"),
    false,
  );
  assert.deepEqual(descriptor.historyBefore, {
    present: true,
    value: {
      "other-effect:turn-end:48:target": {
        version: 1,
        outcome: "passed",
        resolvedAt: 48,
      },
    },
  });
});
