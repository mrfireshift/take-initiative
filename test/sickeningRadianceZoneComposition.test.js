import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { exhaustionLevelFromInstances } from "../src/exhaustionCore.js";
import {
  buildReminderResolutionPlan,
  buildZoneTriggerReminderResolution,
  REMINDER_OUTCOMES,
} from "../src/reminderResolutionCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import { planStaticSpellZoneReminder } from "../src/spellStaticZoneReminderCore.js";
import { planSpellZoneTriggers } from "../src/spellZoneTriggerCore.js";

const SPELL_ID = "xanathar-fulgore-nauseante";
const RULE_ID = `${SPELL_ID}:cast`;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

function initiativeState(current, round = 1) {
  return {
    order: ["caster", "target"],
    current,
    round,
  };
}

function token(id, meta = {}) {
  return {
    id,
    name: id,
    metadata: { [META_KEY]: meta },
  };
}

function areaRule() {
  return getSpellAreaRuleById(RULE_ID);
}

function triggerFor(triggerId) {
  return areaRule().zonePolicy.triggers.find((trigger) => trigger.id === triggerId);
}

function zoneMetadata(instanceId = "radiance-a", casterId = "caster") {
  return {
    instanceId,
    ruleId: RULE_ID,
    spellId: SPELL_ID,
    casterId,
    role: "root",
  };
}

function activationFor({
  triggerId = "sickening-radiance-save-on-entry",
  instanceId = "radiance-a",
  activationId = `${instanceId}:failure`,
  casterId = "caster",
} = {}) {
  const trigger = triggerFor(triggerId);
  return {
    ...trigger,
    id: activationId,
    instanceId,
    ruleId: RULE_ID,
    spellId: SPELL_ID,
    casterId,
    triggerId,
    zoneItemId: "zone-a",
    targetIds: ["target"],
    turnKey: "1:1:target",
    noticeTurnKey: "1:1:target",
  };
}

function reminderItems(activationId, targetConditions = [], targetHp = 100) {
  return [
    token("target", {
      hp: targetHp,
      hpMax: targetHp,
      conditions: targetConditions,
    }),
    token("caster", { initiativeCard: { spellSaveDC: 15 } }),
    {
      id: "zone-a",
      name: "Fulgore Nauseante",
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: {
          triggerRuntime: {
            pending: [{ id: activationId, targetIds: ["target"] }],
          },
        },
      },
    },
  ];
}

function reminderResolution(activation) {
  return buildZoneTriggerReminderResolution({
    activation,
    targetId: "target",
    sourceId: activation.casterId,
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
}

function failureOperations(activation, targetConditions = []) {
  const resolution = reminderResolution(activation);
  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: activation.id,
      targets: [{ id: "target", name: "Target" }],
      resolution,
    },
    items: reminderItems(activation.id, targetConditions),
    outcome: REMINDER_OUTCOMES.FAILED,
    damageRoll: 4,
    sceneMetadata: { [STATE_KEY]: initiativeState(0) },
    now: 100,
  });
  assert.equal(plan.status, "ready");
  return plan.operations;
}

function preparedOperations(operations, prefix) {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    if (operation.type !== "condition:add") {
      return { ...operation, operationId };
    }
    const targetIds = operation.targetIds || [];
    return {
      ...operation,
      operationId,
      createdAt: 100 + index,
      instanceIds: Object.fromEntries(targetIds.map((id) => [
        id,
        `${operationId}:condition:${id}`,
      ])),
    };
  });
}

function stateById(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function spellState(id, overrides = {}) {
  return {
    id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function exhaustion(level, id = `base-exhaustion-${level}`, overrides = {}) {
  return {
    id,
    condition: "Indebolimento",
    active: true,
    level,
    type: "initiative-card",
    ...overrides,
  };
}

function concentrationEntry(instanceId, targetId = "target") {
  return {
    name: "Fulgore Nauseante",
    instanceId,
    targets: [targetId],
  };
}

function spellEntry(instanceId, casterId) {
  return {
    id: instanceId,
    instanceId,
    spellId: SPELL_ID,
    name: "Fulgore Nauseante",
    casterId,
    conc: true,
  };
}

test("Fulgore conserva trigger statici CON/once-per-turn senza TS iniziale", () => {
  const rule = areaRule();
  assert.equal(rule.zonePolicy.initialResolution, "none");
  assert.deepEqual(
    rule.zonePolicy.triggers.map((trigger) => ({
      id: trigger.id,
      event: trigger.event,
      frequency: trigger.frequency,
      resolution: trigger.resolution,
      ability: trigger.ability,
      requiresOwnTurn: trigger.requiresOwnTurn ?? false,
      triggerOnAreaMove: trigger.triggerOnAreaMove ?? false,
      failureAutomation: trigger.resolutionData?.failureAutomation,
    })),
    [
      {
        id: "sickening-radiance-save-on-entry",
        event: "enter",
        frequency: "once-per-turn",
        resolution: "manual-save",
        ability: "con",
        requiresOwnTurn: false,
        triggerOnAreaMove: false,
        failureAutomation: "spell-save",
      },
      {
        id: "sickening-radiance-save-on-turn-start",
        event: "turn-start",
        frequency: "once-per-turn",
        resolution: "manual-save",
        ability: "con",
        requiresOwnTurn: false,
        triggerOnAreaMove: false,
        failureAutomation: "spell-save",
      },
    ],
  );

  const zoneItem = {
    id: "zone-a",
    name: "Fulgore Nauseante",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        ...zoneMetadata(),
        targetIds: [],
      },
    },
  };
  const planned = planStaticSpellZoneReminder({
    zoneItem,
    rule,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(0),
    itemsById: new Map([
      ["zone-a", zoneItem],
      ["caster", token("caster", { initiativeCard: { spellSaveDC: 15 } })],
      ["target", token("target")],
    ]),
    now: 100,
  });
  assert.deepEqual(planned.newActivations.map((activation) => activation.event), ["enter"]);
  assert.equal(planned.notices.length, 1);
  assert.equal(
    planned.notices[0].resolution.outcomes.failed.actions.length,
    2,
  );

  const turnStart = planSpellZoneTriggers({
    rule,
    zoneMetadata: zoneMetadata(),
    runtime: planned.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(1),
    now: 200,
  });
  assert.deepEqual(
    turnStart.newActivations.map((activation) => activation.event),
    ["turn-start"],
  );
  assert.equal(
    turnStart.newActivations[0].resolutionData.failureAutomation,
    "spell-save",
  );
});

test("Fulgore: successo senza azioni persistenti né danno", () => {
  const activation = activationFor({ activationId: "radiance-success" });
  const resolution = reminderResolution(activation);
  assert.deepEqual(resolution.outcomes.passed.actions, []);

  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: activation.id,
      targets: [{ id: "target", name: "Target" }],
      resolution,
    },
    items: reminderItems(activation.id),
    outcome: REMINDER_OUTCOMES.PASSED,
    damageRoll: "",
    sceneMetadata: { [STATE_KEY]: initiativeState(0) },
    now: 100,
  });
  assert.equal(plan.status, "ready");
  assert.equal(plan.damage.amount, 0);
  assert.equal(plan.hpChange, null);
  assert.equal(
    plan.operations.some((operation) => operation.type === "condition:add"),
    false,
  );
});

test("Fulgore: fallimento compone danno, Indebolimento e anti-invisibilità", () => {
  const activation = activationFor({
    triggerId: "sickening-radiance-save-on-turn-start",
    activationId: "radiance-failure",
  });
  const resolution = reminderResolution(activation);
  assert.deepEqual(resolution.damage, {
    dice: "4d10",
    type: "radiosi",
    onFailed: "full",
    onPassed: "zero",
    onImmune: "zero",
  });

  const actions = resolution.outcomes.failed.actions.filter((action) => (
    action.kind === "condition" && action.action === "apply"
  ));
  assert.deepEqual(actions.map((action) => action.name), [
    "Indebolimento",
    "Fulgore: invisibilità inefficace",
  ]);
  assert.equal(actions[0].options.exhaustionContribution, true);
  assert.deepEqual(actions[0].options.expiry, { mode: "concentration" });
  assert.equal(actions[0].options.parentEffectId, "radiance-a");
  assert.equal(actions[1].options.effectId, "sickening-radiance-no-invisibility");
  assert.equal(actions[1].options.effectKind, "debuff");
  assert.match(actions[1].options.effectDetail, /invisibilita|invisibilità/u);
  assert.deepEqual(actions[1].options.expiry, { mode: "concentration" });
  assert.equal(actions[1].options.parentEffectId, "radiance-a");
});

test("Fulgore: due fallimenti portano Indebolimento 2 → 3 → 4 e la concentrazione torna a 2", () => {
  const initial = [
    spellState("caster", {
      concentrations: {
        "Fulgore Nauseante": concentrationEntry("radiance-a"),
      },
    }),
    spellState("target", {
      spells: [spellEntry("radiance-a", "caster")],
      conditions: [exhaustion(2, "base-exhaustion")],
    }),
  ];
  const first = buildEffectsMutationPlan(
    initial,
    preparedOperations(
      failureOperations(activationFor({ activationId: "failure-1" })),
      "failure-1",
    ),
  );
  assert.equal(exhaustionLevelFromInstances(stateById(first, "target").conditions), 3);

  const second = buildEffectsMutationPlan(
    first.states,
    preparedOperations(
      failureOperations(activationFor({ activationId: "failure-2" })),
      "failure-2",
    ),
  );
  assert.equal(exhaustionLevelFromInstances(stateById(second, "target").conditions), 4);
  assert.equal(
    stateById(second, "target").conditions.filter(
      (condition) => condition.exhaustionContribution === true,
    ).length,
    2,
  );
  assert.equal(
    stateById(second, "target").conditions.filter(
      (condition) => condition.effectId === "sickening-radiance-no-invisibility",
    ).length,
    1,
  );

  const ended = buildEffectsMutationPlan(second.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "radiance-a",
    operationId: "end-radiance-a",
  }]);
  assert.equal(exhaustionLevelFromInstances(stateById(ended, "target").conditions), 2);
  assert.deepEqual(
    stateById(ended, "target").conditions.map((condition) => condition.id),
    ["base-exhaustion"],
  );
});

test("Fulgore: la fine dell'istanza non rimuove una seconda fonte di Indebolimento", () => {
  const otherSource = exhaustion(1, "other-exhaustion", {
    type: "spell",
    sourceId: "other-caster",
    parentEffectId: "other-spell",
    exhaustionContribution: true,
    expiry: { mode: "concentration" },
  });
  const initial = [
    spellState("caster", {
      concentrations: {
        "Fulgore Nauseante": concentrationEntry("radiance-a"),
      },
    }),
    spellState("target", {
      spells: [spellEntry("radiance-a", "caster")],
      conditions: [exhaustion(2, "base-exhaustion"), otherSource],
    }),
  ];
  const applied = buildEffectsMutationPlan(
    initial,
    preparedOperations(
      failureOperations(activationFor({ activationId: "failure-other-source" })),
      "failure-other-source",
    ),
  );
  const ended = buildEffectsMutationPlan(applied.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "radiance-a",
    operationId: "end-radiance-source",
  }]);
  const target = stateById(ended, "target");
  assert.equal(exhaustionLevelFromInstances(target.conditions), 3);
  assert.equal(
    target.conditions.some((condition) => condition.id === "other-exhaustion"),
    true,
  );
  assert.equal(
    target.conditions.some((condition) => condition.parentEffectId === "radiance-a"),
    false,
  );
});

test("Fulgore: due istanze di caster diversi hanno cleanup indipendente", () => {
  const initial = [
    spellState("caster-a", {
      concentrations: {
        "Fulgore Nauseante": concentrationEntry("radiance-a"),
      },
    }),
    spellState("caster-b", {
      concentrations: {
        "Fulgore Nauseante": concentrationEntry("radiance-b"),
      },
    }),
    spellState("target", {
      spells: [
        spellEntry("radiance-a", "caster-a"),
        spellEntry("radiance-b", "caster-b"),
      ],
      conditions: [exhaustion(2, "base-exhaustion")],
    }),
  ];
  const withA = buildEffectsMutationPlan(
    initial,
    preparedOperations(
      failureOperations(activationFor({
        instanceId: "radiance-a",
        activationId: "failure-a",
        casterId: "caster-a",
      })),
      "failure-a",
    ),
  );
  const withBoth = buildEffectsMutationPlan(
    withA.states,
    preparedOperations(
      failureOperations(activationFor({
        instanceId: "radiance-b",
        activationId: "failure-b",
        casterId: "caster-b",
      })),
      "failure-b",
    ),
  );
  assert.equal(exhaustionLevelFromInstances(stateById(withBoth, "target").conditions), 4);

  const afterA = buildEffectsMutationPlan(withBoth.states, [{
    type: "concentration:break",
    casterIds: ["caster-a"],
    reference: "radiance-a",
    operationId: "end-radiance-a",
  }]);
  const afterATarget = stateById(afterA, "target");
  assert.equal(exhaustionLevelFromInstances(afterATarget.conditions), 3);
  assert.equal(
    afterATarget.conditions.some((condition) => condition.parentEffectId === "radiance-a"),
    false,
  );
  assert.equal(
    afterATarget.conditions.some((condition) => condition.parentEffectId === "radiance-b"),
    true,
  );

  const afterB = buildEffectsMutationPlan(afterA.states, [{
    type: "concentration:break",
    casterIds: ["caster-b"],
    reference: "radiance-b",
    operationId: "end-radiance-b",
  }]);
  assert.equal(exhaustionLevelFromInstances(stateById(afterB, "target").conditions), 2);
});
