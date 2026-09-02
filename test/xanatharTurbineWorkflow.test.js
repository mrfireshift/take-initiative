import assert from "node:assert/strict";
import test from "node:test";

import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import {
  buildSpellActiveResolutionLinkedEffectRemovals,
  getSpellResolutionAction,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { buildSpellUnifiedPanelContract, getSpellUnifiedActiveActionDeclarations } from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "../src/spellStaticZoneCore.js";
import { planSpellZoneTriggers } from "../src/spellZoneTriggerCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  resolveTurbineSaveChain,
  resolveTurbineTargetChains,
  turbineSizeFromToken,
  turbineRestrainedOperations,
  XANATHAR_TURBINE_RESTRAINED_EFFECT_ID,
} from "../src/xanatharTurbineCore.js";
import {
  buildReminderResolutionPlan,
  buildZoneTriggerReminderResolution,
} from "../src/reminderResolutionCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";

const META_KEY = `${ID}/meta`;

function initiativeState(current, round = 1) {
  return {
    order: ["caster", "target"],
    current,
    round,
  };
}

function turbineZoneMetadata(overrides = {}) {
  return {
    instanceId: "turbine-instance",
    ruleId: "xanathar-turbine:cast",
    spellId: "xanathar-turbine",
    casterId: "caster",
    role: "root",
    ...overrides,
  };
}

function turbinePlacement(targetIds = ["target"]) {
  return {
    status: "confirmed",
    spellId: "xanathar-turbine",
    ruleId: "xanathar-turbine:cast",
    casterId: "caster",
    preview: { position: { x: 0, y: 0 } },
    targetIds,
  };
}

function token(id, overrides = {}) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function conditionOf(plan, id) {
  return plan.states.find((entry) => entry.id === id)?.conditions || [];
}

function restrainedOperationsWithIds(targetIds, parentEffectId = "turbine-instance") {
  return turbineRestrainedOperations({
    targetIds,
    parentEffectId,
    sourceId: "caster",
    sourceName: "Caster",
  }).map((operation) => operation.type === "condition:add"
    ? {
      ...operation,
      instanceIds: { [operation.targetIds[0]]: `restrained-${operation.targetIds[0]}` },
    }
    : operation);
}

function turbineReminderFixture() {
  const activation = {
    id: "turbine-activation",
    instanceId: "turbine-instance",
    ruleId: "xanathar-turbine:cast",
    spellId: "xanathar-turbine",
    spellName: "Turbine",
    casterId: "caster",
    triggerId: "xanathar-turbine-entry-save",
    event: "enter",
    resolution: "manual-save",
    ability: "dex",
    zoneItemId: "turbine-root",
    targetIds: ["target"],
    turnKey: "1:1:target",
    resolutionData: { turbine: true },
    damage: { dice: "10d6", type: "contundenti", onSave: "half" },
  };
  const resolution = buildZoneTriggerReminderResolution({
    activation,
    targetId: "target",
    sourceId: "caster",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
  const root = token("turbine-root", {
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        triggerRuntime: { pending: [activation] },
      },
    },
  });
  const target = token("target", {
    metadata: { [META_KEY]: { hp: 20, hpMax: 100, conditions: [] } },
  });
  const caster = token("caster", { metadata: { [META_KEY]: {} } });
  return {
    activation,
    notice: {
      activationId: activation.id,
      targets: [{ id: "target", name: "Target" }],
      resolution,
    },
    items: [root, target, caster],
  };
}

test("Turbine compone il contratto RAW: zona manuale, concentrazione e azioni", () => {
  const spell = getSpellDefinition("xanathar-turbine");
  const rule = getSpellAreaRuleById("xanathar-turbine:cast");
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-turbine" });
  const actions = getSpellUnifiedActiveActionDeclarations("xanathar-turbine");
  const escape = actions.find((action) => action.id === "xanathar-turbine-escape");

  assert.equal(spell.range, "90 metri");
  assert.equal(spell.duration, "Concentrazione, fino a 1 minuto");
  assert.equal(spell.concentration, true);
  assert.equal(spell.defaultTurns, 10);
  assert.deepEqual(rule.geometry.size, { value: 3, unit: "m", measure: "radius" });
  assert.deepEqual(rule.geometry.height, { value: 9, unit: "m", measure: "height" });
  assert.equal(rule.placement.range.value, 90);
  assert.equal(rule.zonePolicy.placementOptional, false);
  assert.equal(rule.zonePolicy.initialResolution, "manual-save");
  assert.equal(rule.zonePolicy.initialSave.ability, "dex");
  assert.equal(rule.zonePolicy.movement, "fixed");
  assert.deepEqual(rule.zonePolicy.carriedEffectIds, [XANATHAR_TURBINE_RESTRAINED_EFFECT_ID]);
  assert.equal(actions.some((action) => action.resolutionKind === "zone-movement"), false);
  assert.equal(rule.zonePolicy.triggers.length, 2);
  assert.deepEqual(rule.zonePolicy.triggers.map((trigger) => trigger.group), [
    "xanathar-turbine-entry",
    "xanathar-turbine-entry",
  ]);
  assert.ok(rule.zonePolicy.triggers.every((trigger) => trigger.frequency === "once-per-turn"));
  assert.equal(rule.zonePolicy.triggers[0].triggerOnAreaMove, false);
  assert.equal(rule.zonePolicy.triggers[1].triggerOnAreaMove, true);
  assert.equal(rule.zonePolicy.triggers.every((trigger) => trigger.persistsAfterExit === true), true);
  assert.equal(rule.zonePolicy.triggers.every((trigger) => trigger.requiresConcentration !== true), true);

  const turbineSizeField = contract.presentation.targeting.workflow.context.fields
    .find((field) => field.id === "turbineSize");
  const turbineStrengthField = contract.presentation.targeting.workflow.context.fields
    .find((field) => field.id === "turbineStrengthOutcome");
  assert.equal(turbineSizeField.automatic, true);
  assert.equal(turbineSizeField.candidateValue, "turbineSize");
  assert.deepEqual(turbineStrengthField.dependentOutcome, { primaryOutcome: "failed" });
  const panel = buildUnifiedPanelViewModel({
    contract,
    session: {
      spellId: "xanathar-turbine",
      targetIds: ["target"],
      outcomes: { target: "passed" },
      targetContext: { target: { turbineSize: "large-or-smaller" } },
    },
    targetCandidates: [{
      key: "target",
      label: "Target",
      turbineSize: "large-or-smaller",
    }],
  });
  assert.equal(panel.targets.context.fields.some((field) => field.id === "turbineSize"), false);
  assert.equal(panel.targets.context.visible, false);
  assert.deepEqual(panel.targets.context.fields, []);
  assert.deepEqual(panel.targets.context.targets[0].dependentOutcomes, []);

  const failedPanel = buildUnifiedPanelViewModel({
    contract,
    session: {
      spellId: "xanathar-turbine",
      targetIds: ["target"],
      outcomes: { target: "failed" },
      targetContext: { target: { turbineSize: "large-or-smaller" } },
    },
    targetCandidates: [{
      key: "target",
      label: "Target",
      turbineSize: "large-or-smaller",
    }],
  });
  assert.deepEqual(
    failedPanel.targets.context.targets[0].dependentOutcomes.map((field) => [field.id, field.value]),
    [["turbineStrengthOutcome", ""]],
  );

  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.execution.requiresCompositeUndo, true);
  assert.equal(escape.economy, "action");
  assert.equal(escape.resolutionKind, "single-save");
  assert.equal(escape.requiresTargets, false);
  assert.deepEqual(escape.save.abilityOptions.map((option) => option.value), ["str", "dex"]);
  assert.equal(escape.replaceLinkedEffectId, XANATHAR_TURBINE_RESTRAINED_EFFECT_ID);
  assert.equal(escape.replaceLinkedEffectOnSuccess, true);
  assert.match(escape.successNotice, /3d6 × 3 m/);
});

test("Turbine risolve la catena TS Des → taglia → TS For senza catturare Huge/Gargantuan", () => {
  const dexPassed = resolveTurbineSaveChain({ dexOutcome: "passed" });
  assert.equal(dexPassed.valid, true);
  assert.equal(dexPassed.status, "stopped-on-dex-save");
  assert.equal(dexPassed.damageFactor, "half");
  assert.equal(dexPassed.capture, false);
  assert.equal(resolveTurbineSaveChain({ dexOutcome: "failed" }).valid, false);
  assert.equal(
    resolveTurbineSaveChain({
      dexOutcome: "failed",
      size: "huge-or-gargantuan",
    }).status,
    "stopped-on-size",
  );
  assert.equal(
    resolveTurbineSaveChain({
      dexOutcome: "failed",
      size: "huge-or-gargantuan",
    }).damageFactor,
    "full",
  );
  assert.equal(
    resolveTurbineSaveChain({
      dexOutcome: "failed",
      size: "large-or-smaller",
      strengthOutcome: "passed",
    }).capture,
    false,
  );
  assert.equal(
    resolveTurbineSaveChain({
      dexOutcome: "failed",
      size: "large-or-smaller",
      strengthOutcome: "failed",
    }).status,
    "captured",
  );

  const batch = resolveTurbineTargetChains({
    targetIds: ["large", "large", "huge", "medium"],
    outcomes: {
      large: "failed",
      huge: "failed",
      medium: "passed",
    },
    targetContexts: {
      large: { turbineSize: "large-or-smaller", turbineStrengthOutcome: "failed" },
      huge: { turbineSize: "huge-or-gargantuan" },
    },
  });
  assert.equal(batch.valid, true);
  assert.deepEqual(batch.targetIds, ["large", "huge", "medium"]);
  assert.deepEqual(batch.captureTargetIds, ["large"]);

  assert.equal(
    turbineSizeFromToken({ item: { width: 450, height: 450 }, dpi: 150 }),
    "huge-or-gargantuan",
  );
  assert.equal(
    turbineSizeFromToken({ item: { width: 300, height: 450 }, dpi: 150 }),
    "large-or-smaller",
  );
  for (const faction of ["pc", "ally", "neutral"]) {
    assert.equal(
      turbineSizeFromToken({ item: { id: faction, layer: "CHARACTER" }, dpi: 150 }),
      "large-or-smaller",
    );
  }
  const inferred = resolveTurbineTargetChains({
    targetIds: ["small", "huge"],
    outcomes: { small: "failed", huge: "failed" },
    targetItems: [
      { id: "small", width: 150, height: 150 },
      { id: "huge", width: 450, height: 450 },
    ],
    gridDpi: 150,
    targetContexts: { small: { turbineStrengthOutcome: "failed" } },
  });
  assert.deepEqual(inferred.captureTargetIds, ["small"]);
});

test("Turbine cast richiede placement e compone danno metà/pieno", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-turbine" });
  const missingPlacement = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster",
    slotLevel: 7,
    outcomes: { target: "passed" },
    hpAmount: 20,
  });
  assert.equal(missingPlacement.valid, false);
  assert.ok(missingPlacement.errors.includes("placement-required"));

  const passed = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster",
    slotLevel: 7,
    placement: turbinePlacement(),
    outcomes: { target: "passed" },
    targetContexts: {
      target: { turbineSize: "large-or-smaller" },
    },
    hpAmount: 20,
  });
  assert.equal(passed.valid, true, passed.errors.join(", "));
  assert.equal(passed.hp.outcomeFactors.target, "half");

  const captured = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster",
    slotLevel: 7,
    placement: turbinePlacement(),
    outcomes: { target: "failed" },
    targetContexts: {
      target: {
        turbineSize: "large-or-smaller",
        turbineStrengthOutcome: "failed",
      },
    },
    hpAmount: 20,
  });
  assert.equal(captured.valid, true, captured.errors.join(", "));
  assert.equal(captured.hp.outcomeFactors.target, "full");

  const failedWithoutStrength = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster",
    slotLevel: 7,
    placement: turbinePlacement(),
    outcomes: { target: "failed" },
    targetContexts: {
      target: { turbineSize: "large-or-smaller" },
    },
    hpAmount: 20,
  });
  assert.equal(failedWithoutStrength.valid, false);
  assert.ok(failedWithoutStrength.errors.includes("target-context-required"));

  const hugeFailed = buildSpellAreaResolutionCommand({
    contract,
    casterId: "caster",
    slotLevel: 7,
    placement: turbinePlacement(),
    outcomes: { target: "failed" },
    targetContexts: {
      target: { turbineSize: "huge-or-gargantuan" },
    },
    hpAmount: 20,
  });
  assert.equal(hugeFailed.valid, true, hugeFailed.errors.join(", "));
  assert.equal(hugeFailed.hp.outcomeFactors.target, "full");
});

test("Turbine triggera ingresso, crossing e swept-area una sola volta per turno", () => {
  const rule = getSpellAreaRuleById("xanathar-turbine:cast");
  const metadata = turbineZoneMetadata();
  const triggerIds = {
    entry: "xanathar-turbine-entry-save",
    move: "xanathar-turbine-area-move-save",
  };
  const outside = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: [],
    currentTargetIdsByTrigger: { [triggerIds.entry]: [], [triggerIds.move]: [] },
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const entered = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: outside.runtime,
    currentTargetIds: ["target"],
    currentTargetIdsByTrigger: { [triggerIds.entry]: ["target"], [triggerIds.move]: ["target"] },
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });
  assert.equal(entered.newActivations.length, 1);
  assert.deepEqual(entered.newActivations[0].targetIds, ["target"]);

  const left = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: entered.runtime,
    currentTargetIds: [],
    currentTargetIdsByTrigger: { [triggerIds.entry]: [], [triggerIds.move]: [] },
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 3,
  });
  assert.equal(left.runtime.pending.length, 1);
  assert.deepEqual(left.runtime.pending[0].targetIds, ["target"]);
  const reenteredSameTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: left.runtime,
    currentTargetIds: ["target"],
    currentTargetIdsByTrigger: { [triggerIds.entry]: ["target"], [triggerIds.move]: ["target"] },
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 4,
  });
  assert.deepEqual(reenteredSameTurn.newActivations, []);

  const nextTurnOutside = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: left.runtime,
    currentTargetIds: [],
    currentTargetIdsByTrigger: { [triggerIds.entry]: [], [triggerIds.move]: [] },
    initiativeState: initiativeState(1),
    areaPosition: { x: 0, y: 0 },
    now: 5,
  });
  const reenteredNextTurn = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: nextTurnOutside.runtime,
    currentTargetIds: ["target"],
    currentTargetIdsByTrigger: { [triggerIds.entry]: ["target"], [triggerIds.move]: ["target"] },
    initiativeState: initiativeState(1),
    areaPosition: { x: 0, y: 0 },
    now: 6,
  });
  assert.equal(reenteredNextTurn.newActivations.length, 1);

  const sweptOnly = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: {
      ...outside.runtime,
      areaMoveTargetIds: {
        [triggerIds.move]: ["swept-only", "final", "swept-only"],
      },
    },
    currentTargetIds: ["final"],
    currentTargetIdsByTrigger: { [triggerIds.entry]: ["final"], [triggerIds.move]: ["final"] },
    initiativeState: initiativeState(0),
    areaPosition: { x: 10, y: 0 },
    now: 7,
  });
  assert.equal(sweptOnly.newActivations.length, 1);
  assert.deepEqual(sweptOnly.newActivations[0].targetIds, ["final", "swept-only"]);

  const targetCrossing = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: outside.runtime,
    currentTargetIds: [],
    currentTargetIdsByTrigger: { [triggerIds.entry]: [], [triggerIds.move]: [] },
    crossingTargetIdsByTrigger: { [triggerIds.entry]: ["runner", "runner"] },
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 8,
  });
  assert.equal(targetCrossing.newActivations.length, 1);
  assert.deepEqual(targetCrossing.newActivations[0].targetIds, ["runner"]);

  const initialAndFinalInside = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 9,
  });
  const zeroMove = planSpellZoneTriggers({
    rule,
    zoneMetadata: metadata,
    runtime: initialAndFinalInside.runtime,
    currentTargetIds: ["target"],
    initiativeState: initiativeState(0),
    areaPosition: { x: 0, y: 0 },
    now: 10,
  });
  assert.deepEqual(initialAndFinalInside.newActivations, []);
  assert.deepEqual(zeroMove.newActivations, []);
});

test("Turbine applica la catena al reminder e conserva capture scoped alla parent instance", () => {
  const fixture = turbineReminderFixture();
  const passed = buildReminderResolutionPlan({
    ...fixture,
    outcome: "passed",
    damageRoll: 7,
    now: 10,
  });
  assert.equal(passed.status, "ready");
  assert.equal(passed.damage.factor, "half");
  assert.equal(passed.hpChange.after, 17);
  assert.deepEqual(passed.operations, []);

  const captured = buildReminderResolutionPlan({
    ...fixture,
    outcome: "failed",
    damageRoll: 7,
    turbineSize: "large-or-smaller",
    turbineStrengthOutcome: "failed",
    now: 11,
  });
  assert.equal(captured.status, "ready");
  assert.equal(captured.damage.factor, "full");
  assert.equal(captured.hpChange.after, 13);
  const add = captured.operations.find((operation) => operation.type === "condition:add");
  assert.equal(add.options.parentEffectId, "turbine-instance");
  assert.equal(add.options.effectId, XANATHAR_TURBINE_RESTRAINED_EFFECT_ID);
  assert.equal(add.options.endsParentOnRemoval, undefined);
  assert.equal(add.options.expiry.mode, "concentration");

  const huge = buildReminderResolutionPlan({
    ...fixture,
    outcome: "failed",
    damageRoll: 7,
    turbineSize: "huge-or-gargantuan",
    now: 12,
  });
  assert.equal(huge.status, "ready");
  assert.equal(huge.damage.factor, "full");
  assert.equal(huge.hpChange.after, 13);
  assert.equal(huge.turbineChain.capture, false);
  assert.equal(huge.operations.some((operation) => operation.type === "condition:add"), false);

  const hugeAutoFixture = {
    ...fixture,
    items: fixture.items.map((item) => item.id === "target"
      ? { ...item, width: 450, height: 450 }
      : item),
  };
  const hugeAuto = buildReminderResolutionPlan({
    ...hugeAutoFixture,
    outcome: "failed",
    damageRoll: 7,
    now: 13,
  });
  assert.equal(hugeAuto.status, "ready");
  assert.equal(hugeAuto.turbineChain.size, "huge-or-gargantuan");
  assert.equal(hugeAuto.turbineChain.capture, false);
});

test("Turbine child removal non chiude il parent e il cleanup non crea la pill di caduta", () => {
  const baseItems = [
    token("caster", {
      spells: [{
        id: "turbine-spell",
        name: "Turbine",
        turns: 10,
        conc: true,
        casterId: "caster",
        instanceId: "turbine-instance",
      }],
      concentrations: {
        turbine: {
          name: "Turbine",
          instanceId: "turbine-instance",
          targets: ["a", "b"],
        },
      },
    }),
    token("a"),
    token("b"),
  ];
  const applied = buildEffectsMutationPlan(
    baseItems,
    restrainedOperationsWithIds(["a", "b"]),
  );
  assert.equal(conditionOf(applied, "a")[0].endsParentOnRemoval, undefined);
  assert.equal(conditionOf(applied, "b")[0].effectId, XANATHAR_TURBINE_RESTRAINED_EFFECT_ID);

  const escaped = buildEffectsMutationPlan(applied.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "a", instanceId: "restrained-a" }],
  }]);
  assert.deepEqual(escaped.states.find((entry) => entry.id === "caster").concentrations.turbine.instanceId, "turbine-instance");
  assert.deepEqual(conditionOf(escaped, "b").map((condition) => condition.effectId), [XANATHAR_TURBINE_RESTRAINED_EFFECT_ID]);

  const ended = buildEffectsMutationPlan(escaped.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "turbine-instance",
  }]);
  assert.deepEqual(ended.states.find((entry) => entry.id === "caster").concentrations, {});
  assert.deepEqual(conditionOf(ended, "a"), []);
  assert.deepEqual(conditionOf(ended, "b"), []);
});

test("Turbine ancora semanticamente il target e mostra il reminder di fuga", () => {
  const baseItems = [
    token("caster", {
      concentrations: {
        turbine: {
          name: "Turbine",
          instanceId: "turbine-instance",
          targets: ["target"],
        },
      },
      metadata: {
        [META_KEY]: {
          [`${ID}/concentration`]: {
            turbine: {
              name: "Turbine",
              instanceId: "turbine-instance",
              targets: ["target"],
            },
          },
        },
      },
    }),
    token("target", {
      metadata: { [META_KEY]: { conditions: [] } },
    }),
  ];
  const applied = buildEffectsMutationPlan(
    baseItems,
    restrainedOperationsWithIds(["target"]),
  );
  const restrained = conditionOf(applied, "target")[0];
  assert.equal(restrained.parentEffectId, "turbine-instance");
  assert.equal(restrained.effectId, XANATHAR_TURBINE_RESTRAINED_EFFECT_ID);
  assert.equal(restrained.saveReminder.mode, "choice");
  assert.deepEqual(restrained.saveReminder.resolution.choiceLabels, {
    passed: "Superato",
    failed: "Fallito",
  });

  const noticeItems = [
    token("caster", {
      metadata: {
        [META_KEY]: {
          [`${ID}/concentration`]: {
            turbine: {
              name: "Turbine",
              instanceId: "turbine-instance",
              targets: ["target"],
            },
          },
        },
      },
    }),
    token("target", {
      metadata: {
        [META_KEY]: { conditions: [restrained] },
      },
    }),
  ];
  const notices = planEffectSaveReminderNotices({
    items: noticeItems,
    previousInitiativeState: initiativeState(0),
    initiativeState: initiativeState(1),
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((entry) => entry.target?.id === "target");
  assert.ok(notice);
  assert.equal(notice.kind, "effect-reminder");
  assert.match(notice.instruction, /Forza o Destrezza/u);
  assert.deepEqual(notice.resolution.choiceLabels, {
    passed: "Superato",
    failed: "Fallito",
  });

  const passed = buildReminderResolutionPlan({
    notice,
    items: noticeItems,
    outcome: "passed",
    now: 20,
  });
  assert.equal(passed.status, "ready");
  assert.deepEqual(passed.operations, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: restrained.id }],
  }]);

  const released = buildEffectsMutationPlan(applied.states, passed.operations);
  assert.deepEqual(conditionOf(released, "target"), []);
  assert.equal(
    released.states.find((entry) => entry.id === "caster").concentrations.turbine.instanceId,
    "turbine-instance",
  );
});

test("Turbine escape usa ACTION, due ability fisiche e rimuove solo il target selezionato", () => {
  const action = getSpellResolutionAction("xanathar-turbine", "xanathar-turbine-escape");
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
  assert.equal(action.economy, "action");
  assert.deepEqual(action.save.abilityOptions.map((option) => option.value), ["str", "dex"]);
  assert.equal(action.successNotice, "Scagliato · 3d6 × 3 m · direzione casuale");

  const items = [
    token("a", { metadata: { [META_KEY]: { conditions: [{
      id: "a-restrained",
      condition: "Trattenuto",
      active: true,
      parentEffectId: "turbine-instance",
      effectId: XANATHAR_TURBINE_RESTRAINED_EFFECT_ID,
    }] } } }),
    token("b", { metadata: { [META_KEY]: { conditions: [{
      id: "b-restrained",
      condition: "Trattenuto",
      active: true,
      parentEffectId: "turbine-instance",
      effectId: XANATHAR_TURBINE_RESTRAINED_EFFECT_ID,
    }] } } }),
  ];
  const removals = buildSpellActiveResolutionLinkedEffectRemovals({
    action,
    payload: { instanceId: "turbine-instance" },
    items,
    targetIds: ["a"],
  });
  assert.deepEqual(removals, [{ itemId: "a", instanceId: "a-restrained" }]);
});
