import assert from "node:assert/strict";
import test, { mock } from "node:test";

let currentSceneItems = [];

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "test-room", getMetadata: async () => ({}) },
      player: { getRole: async () => "GM" },
      scene: {
        isReady: async () => true,
        getMetadata: async () => ({}),
        items: {
          getItems: async (ids) => {
            return Array.isArray(ids)
              ? currentSceneItems.filter((i) => ids.includes(i.id))
              : currentSceneItems;
          },
          updateItems: async () => {},
        },
      },
      broadcast: {
        onMessage: () => () => {},
        sendMessage: async () => {},
      },
    },
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const {
  planClassFeatureActivation,
  classFeatureConditionInstancesForActivation,
  CLASS_FEATURE_STATE_FIELD,
} = await import("../src/classFeatureCore.js");
const { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID } = await import("../src/classFeatureCatalog.js");
const { resolveDamageEndsConditionRemovals } = await import("../src/hpConditionRulesCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { buildZoneTriggerReminderResolution, buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js");
const { buildCoordinatedEffectsUndoPlan } = await import("../src/effectsMutationUndoCore.js");
const { prepareEffectsMutation } = await import("../src/effectsMutations.js");
const { resolveMovementProfile } = await import("../src/movementProfileCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
const { ID } = await import("../src/constants.js");

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentrations`;

function makeToken({
  id,
  name,
  hp = 40,
  hpMax = 40,
  attitude = "enemy",
  conditions = [],
  spells = [],
  classFeatureState = null,
}) {
  return {
    id,
    name,
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp,
        hpMax,
        attitude,
        ...(conditions.length ? { conditions: { version: 1, instances: conditions } } : {}),
        ...(spells.length ? { [SPELLS_META_KEY]: spells } : {}),
        ...(classFeatureState ? { [CLASS_FEATURE_STATE_FIELD]: classFeatureState } : {}),
      },
    },
  };
}

function makeAbiurareCondition(sourceId = "paladin-1", targetId = "enemy-1") {
  return {
    id: `abiurare-instance-${targetId}`,
    condition: "Spaventato",
    name: "Spaventato",
    active: true,
    type: "class-feature",
    sourceId,
    targetId,
    effectId: "paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico",
    parentEffectId: "abiurare-activation-1",
    mechanics: {
      speedMeters: 0,
      noSpeedBonuses: true,
      endsOnDamage: true,
    },
    endsOnDamage: true,
  };
}

function makeGenericSpaventatoCondition(targetId = "enemy-1") {
  return {
    id: `fear-spell-instance-${targetId}`,
    condition: "Spaventato",
    name: "Spaventato",
    active: true,
    type: "condition",
    targetId,
    mechanics: {},
  };
}

// -----------------------------------------------------------------------------
// PART 3 / CF-INT-001C: ABIURARE NEMICO DAMAGE INTEGRATION TESTS
// -----------------------------------------------------------------------------

test("CF-INT-001C.1: Abiurare Nemico condition has endsOnDamage semantics", () => {
  const feature = CLASS_FEATURE_BY_ID.get("paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico");
  assert.ok(feature);
  const act = planClassFeatureActivation({
    feature,
    choiceId: "failed",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin-1",
    targetIds: ["enemy-1"],
    instanceId: "abiurare-activation-1",
  });
  assert.equal(act.ok, true);
  const instances = classFeatureConditionInstancesForActivation(
    feature,
    act.instance,
    "enemy-1",
    [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
  );
  assert.equal(instances.length, 1);
  const cond = instances[0];
  assert.equal(cond.condition, "Spaventato");
  assert.equal(cond.mechanics?.endsOnDamage, true);
});

test("CF-INT-001C.2: resolveDamageEndsConditionRemovals identifies ONLY conditions with endsOnDamage", () => {
  const abiurare = makeAbiurareCondition("paladin-1", "enemy-1");
  const genericFear = makeGenericSpaventatoCondition("enemy-1");
  const poisoned = { id: "poison-1", condition: "Avvelenato", active: true };

  const removals = resolveDamageEndsConditionRemovals([abiurare, genericFear, poisoned]);
  assert.deepEqual(removals, [abiurare.id]);
});

test("CF-INT-001C.3: Spell Area Resolution damage removes endsOnDamage condition", async () => {
  const abiurare = makeAbiurareCondition("paladin-1", "enemy-1");
  const genericFear = makeGenericSpaventatoCondition("enemy-1");
  const target = makeToken({
    id: "enemy-1",
    name: "Nemico 1",
    hp: 40,
    hpMax: 40,
    conditions: [abiurare, genericFear],
  });

  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast" });
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "fireball",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 1 },
    casterId: "caster-1",
    slotLevel: 3,
    targetIds: ["enemy-1"],
    candidateTargetIds: ["enemy-1"],
    outcomes: { "enemy-1": "failed" },
    placement: {
      status: "confirmed",
      confirmed: true,
      ruleId: contract.presentation?.placement?.ruleId || "fireball",
      spellId: "fireball",
      casterId: "caster-1",
      targetLocked: true,
      targetIds: ["enemy-1"],
      preview: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 150, y: 0 },
        gridOrigin: { x: 0, y: 0 },
        dpi: 150,
        targetIds: ["enemy-1"],
        targetLocked: true,
      },
    },
    targetLocked: true,
    hp: { mode: "damage", amount: 20 },
    sceneEpoch: 1,
    currentSceneEpoch: 1,
    validateSpatial: false,
  });

  const runtimeMock = {
    isCurrent: () => true,
    readItems: async (ids) => {
      const all = [target, tokenMock("caster-1")];
      return Array.isArray(ids) ? all.filter((i) => ids.includes(i.id)) : all;
    },
    readAllItems: async () => [target, tokenMock("caster-1")],
    sceneEpoch: 1,
    zoneTriggerRootItems: async () => [],
    getZeroHPConditionHistoryIds: async () => [],
  };

  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeMock);
  assert.ok(plan.valid, `Expected plan to be valid, errors: ${JSON.stringify(plan.errors)}`);
  assert.ok(plan.damageEndsRemovals?.length > 0, "Plan must collect damageEndsRemovals for damaged target");
  assert.ok(plan.damageEndsRemovals.some((r) => r.instanceId === abiurare.id));
  assert.ok(!plan.damageEndsRemovals.some((r) => r.instanceId === genericFear.id));
});

test("CF-INT-001C.4: Reminder / Deferred damage removes endsOnDamage condition", () => {
  const abiurare = makeAbiurareCondition("paladin-1", "enemy-1");
  const genericFear = makeGenericSpaventatoCondition("enemy-1");
  const target = makeToken({
    id: "enemy-1",
    name: "Nemico 1",
    hp: 30,
    hpMax: 40,
    conditions: [abiurare, genericFear],
  });

  const zoneItem = {
    id: "zone-1",
    name: "Zona",
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        triggerRuntime: {
          pending: [{
            id: "zone-act-1",
            targetIds: ["enemy-1"],
          }],
        },
      },
    },
  };

  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: "zone-act-1",
      resolution: "manual-save",
      ability: "dex",
      zoneItemId: "zone-1",
      targetIds: ["enemy-1"],
      turnKey: "turn-1",
      damage: { dice: "1d6", type: "fuoco", onSave: "half" },
    },
    targetId: "enemy-1",
    sourceId: "caster-1",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });

  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "zone-act-1",
      targets: [{ id: "enemy-1", name: "Nemico 1" }],
      resolution,
    },
    items: [target, tokenMock("caster-1"), zoneItem],
    outcome: "failed",
    damageRoll: 10,
    sceneMetadata: { [STATE_KEY]: { round: 1, current: 0 } },
  });

  assert.equal(plan.status, "ready");
  const removeOp = plan.operations?.find((op) =>
    op.type === "condition:remove-instances" && op.removals?.some((r) => r.instanceId === abiurare.id)
  );
  assert.ok(removeOp, "Deferred damage in reminder resolution must remove endsOnDamage condition");
  const genericRemoval = plan.operations?.some((op) =>
    op.type === "condition:remove-instances" && op.removals?.some((r) => r.instanceId === genericFear.id)
  );
  assert.equal(genericRemoval, false, "Generic fear must not be removed by deferred damage");
});

test("CF-INT-001C.5: Healing does NOT remove Abiurare Nemico", () => {
  const abiurare = makeAbiurareCondition("paladin-1", "enemy-1");
  const target = makeToken({
    id: "enemy-1",
    name: "Nemico 1",
    hp: 20,
    hpMax: 40,
    conditions: [abiurare],
  });

  const resolution = {
    mode: "manual-heal",
    target: { id: "enemy-1" },
    heal: 10,
  };

  const plan = buildReminderResolutionPlan({
    notice: {
      activationId: "reminder-heal",
      targets: [{ id: "enemy-1", name: "Nemico 1" }],
      resolution,
    },
    items: [target],
    outcome: "apply",
    sceneMetadata: { [STATE_KEY]: { round: 1, current: 0 } },
  });

  assert.equal(plan.status, "ready");
  const removeOp = plan.operations?.find((op) =>
    op.type === "condition:remove-instances" && op.removals?.some((r) => r.instanceId === abiurare.id)
  );
  assert.equal(removeOp, undefined, "Healing must NEVER remove endsOnDamage condition");
});

function tokenMock(id) {
  return { id, name: id, metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 15 } } } };
}

// -----------------------------------------------------------------------------
// PART 8, 9, 10 / CF-INT-001B: TOCCO PURIFICATORE & SCOPED HISTORY UNDO
// -----------------------------------------------------------------------------

test("CF-INT-001B.1: Scoped Class Feature Undo allows undo when unrelated state changed", () => {
  const paladinInitialState = {
    version: 1,
    resources: {
      "paladino-tocco-purificatore-usi": { current: 3, maximum: 3, unlimited: false },
      "paladino-incanalare-divinita-usi": { current: 1, maximum: 1, unlimited: false },
    },
    instances: [],
  };

  const paladinAfterToccoState = {
    version: 1,
    resources: {
      "paladino-tocco-purificatore-usi": { current: 2, maximum: 3, unlimited: false },
      "paladino-incanalare-divinita-usi": { current: 1, maximum: 1, unlimited: false },
    },
    instances: [],
  };

  const historyEntry = {
    id: "entry-tocco-1",
    kind: "spell",
    label: "Tocco Purificatore",
    effectsMutation: {
      version: 1,
      commandId: "cmd-tocco-1",
      changes: [
        {
          id: "paladin-1",
          fields: {},
          metadataFields: { [CLASS_FEATURE_STATE_FIELD]: true },
          beforeMetadata: {
            [CLASS_FEATURE_STATE_FIELD]: { present: true, value: paladinInitialState },
          },
          afterMetadata: {
            [CLASS_FEATURE_STATE_FIELD]: { present: true, value: paladinAfterToccoState },
          },
        },
      ],
    },
  };

  // Now, suppose an UNRELATED feature modifies channel divinity (1 -> 0)
  const paladinCurrentStateWithUnrelatedChange = {
    version: 1,
    resources: {
      "paladino-tocco-purificatore-usi": { current: 2, maximum: 3, unlimited: false },
      "paladino-incanalare-divinita-usi": { current: 0, maximum: 1, unlimited: false }, // changed unrelated!
    },
    instances: [{ instanceId: "vow-of-enmity-inst", featureId: "vow", active: true }], // added unrelated instance!
  };

  const currentStates = [
    {
      id: "paladin-1",
      conditions: [],
      spells: [],
      concentrations: {},
      metadata: {
        [CLASS_FEATURE_STATE_FIELD]: paladinCurrentStateWithUnrelatedChange,
      },
    },
  ];

  const undoPlan = buildCoordinatedEffectsUndoPlan({
    currentStates,
    entryOrEntries: [historyEntry],
  });

  // On scoped undo, this should succeed (no conflicts), restore Tocco to 3, and KEEP channel divinity at 0
  assert.equal(undoPlan.conflicts.length, 0, `Expected 0 conflicts for unrelated change, got: ${JSON.stringify(undoPlan.conflicts)}`);
  const restoredState = undoPlan.states?.find((s) => s.id === "paladin-1")?.metadata?.[CLASS_FEATURE_STATE_FIELD];
  assert.ok(restoredState, "Restored state must exist");
  assert.equal(restoredState.resources["paladino-tocco-purificatore-usi"]?.current, 3, "Tocco uses must be restored to 3");
  assert.equal(restoredState.resources["paladino-incanalare-divinita-usi"]?.current, 0, "Unrelated channel divinity must remain 0");
  assert.equal(restoredState.instances?.length, 1, "Unrelated instance must remain preserved");
});

test("CF-INT-001B.2: Scoped Class Feature Undo correctly detects conflict on SAME resource pool", () => {
  const paladinInitialState = {
    version: 1,
    resources: {
      "paladino-tocco-purificatore-usi": { current: 3, maximum: 3, unlimited: false },
    },
    instances: [],
  };

  const paladinAfterToccoState = {
    version: 1,
    resources: {
      "paladino-tocco-purificatore-usi": { current: 2, maximum: 3, unlimited: false },
    },
    instances: [],
  };

  const historyEntry = {
    id: "entry-tocco-1",
    kind: "spell",
    label: "Tocco Purificatore",
    effectsMutation: {
      version: 1,
      commandId: "cmd-tocco-1",
      changes: [
        {
          id: "paladin-1",
          fields: {},
          metadataFields: { [CLASS_FEATURE_STATE_FIELD]: true },
          beforeMetadata: {
            [CLASS_FEATURE_STATE_FIELD]: { present: true, value: paladinInitialState },
          },
          afterMetadata: {
            [CLASS_FEATURE_STATE_FIELD]: { present: true, value: paladinAfterToccoState },
          },
        },
      ],
    },
  };

  // The SAME resource pool was modified again (2 -> 1)
  const paladinStateWithSameResourceConflict = {
    version: 1,
    resources: {
      "paladino-tocco-purificatore-usi": { current: 1, maximum: 3, unlimited: false },
    },
    instances: [],
  };

  const currentStates = [
    {
      id: "paladin-1",
      conditions: [],
      spells: [],
      concentrations: {},
      metadata: {
        [CLASS_FEATURE_STATE_FIELD]: paladinStateWithSameResourceConflict,
      },
    },
  ];

  const undoPlan = buildCoordinatedEffectsUndoPlan({
    currentStates,
    entryOrEntries: [historyEntry],
  });

  assert.ok(undoPlan.conflicts.length > 0, "Same resource pool modification MUST create a conflict on Undo");
  assert.equal(undoPlan.conflicts[0].field, CLASS_FEATURE_STATE_FIELD);
});

test("CF-INT-001B.3: Stale spell selection race aborts without consuming resource", async () => {
  const paladin = makeToken({
    id: "paladin-1",
    name: "Paladino",
    classFeatureState: {
      version: 1,
      resources: {
        "paladino-tocco-purificatore-usi": { current: 3, maximum: 3, unlimited: false },
      },
      instances: [],
    },
  });

  const ally = makeToken({
    id: "ally-1",
    name: "Alleato",
    spells: [], // NO SPELLS! The requested spell was already removed!
  });

  currentSceneItems = [paladin, ally];

  const operations = [
    {
      type: "spell:remove-requested",
      targetIds: ["ally-1"],
      instanceId: "stale-spell-instance-999",
      name: "benedizione",
    },
  ];

  const command = {
    metadataPatches: [
      {
        id: "paladin-1",
        fields: {
          [CLASS_FEATURE_STATE_FIELD]: {
            expected: { present: true, value: paladin.metadata[META_KEY][CLASS_FEATURE_STATE_FIELD] },
            value: {
              version: 1,
              resources: {
                "paladino-tocco-purificatore-usi": { current: 2, maximum: 3, unlimited: false },
              },
              instances: [],
            },
          },
        },
      },
    ],
  };

  const mutation = await prepareEffectsMutation(operations, {
    command,
    sceneItems: [paladin, ally],
  });

  // If spell is not found, the mutation must be rejected/conflict rather than committing the metadata patch alone
  assert.ok(
    mutation.status === "conflict" || mutation.status === "rejected" || (mutation.changedIds && !mutation.changedIds.includes("paladin-1")),
    `Stale spell selection must NOT commit resource consumption, got status: ${mutation.status}`,
  );
});

test("CF-INT-001A.6: Damage + Abiurare Condition removal undoes in a SINGLE transaction", () => {
  const abiurare = makeAbiurareCondition("paladin-1", "enemy-1");
  const enemyBefore = makeToken({
    id: "enemy-1",
    name: "Nemico 1",
    hp: 40,
    hpMax: 40,
    conditions: [abiurare],
  });

  // Damage 10 applied: HP 40 -> 30, abiurare condition removed
  const historyEntry = {
    id: "damage-entry-1",
    kind: "hp",
    label: "Modifica HP",
    effectsMutation: {
      version: 1,
      commandId: "cmd-dmg-1",
      changes: [
        {
          id: "enemy-1",
          fields: { conditions: true },
          before: { conditions: [abiurare] },
          after: { conditions: [] },
          metadataFields: { hp: true },
          beforeMetadata: { hp: { present: true, value: 40 } },
          afterMetadata: { hp: { present: true, value: 30 } },
        },
      ],
    },
  };

  const currentStates = [
    {
      id: "enemy-1",
      conditions: [],
      spells: [],
      concentrations: {},
      metadata: { hp: 30, hpMax: 40 },
    },
  ];

  const undoPlan = buildCoordinatedEffectsUndoPlan({
    currentStates,
    entryOrEntries: [historyEntry],
  });

  assert.equal(undoPlan.conflicts.length, 0);
  const restoredState = undoPlan.states?.find((s) => s.id === "enemy-1");
  assert.ok(restoredState);
  assert.equal(restoredState.metadata.hp, 40, "HP must be restored to 40");
  assert.equal(restoredState.conditions.length, 1, "Abiurare condition must be restored");
  assert.equal(restoredState.conditions[0].id, abiurare.id);
});

test("CF-INT-001B.4: Multi-target spell purification with Tocco Purificatore removes ONLY targeted token", async () => {
  const spellInstanceId = "bless-instance-1";
  const casterId = "cleric-1";
  const spellEntry = {
    instanceId: spellInstanceId,
    id: "bless",
    name: "Benedizione",
    casterId,
    conc: true,
  };

  const allyA = makeToken({ id: "ally-A", name: "Alleato A", spells: [spellEntry] });
  const allyB = makeToken({ id: "ally-B", name: "Alleato B", spells: [spellEntry] });
  const allyC = makeToken({ id: "ally-C", name: "Alleato C", spells: [spellEntry] });
  const caster = makeToken({
    id: casterId,
    name: "Chierico",
    attitude: "ally",
    spells: [spellEntry],
  });
  caster.metadata[META_KEY][CONC_META_KEY] = {
    [spellInstanceId]: {
      instanceId: spellInstanceId,
      spellId: "bless",
      targetIds: ["ally-A", "ally-B", "ally-C"],
    },
  };

  currentSceneItems = [allyA, allyB, allyC, caster];

  const operations = [
    {
      type: "spell:remove-requested",
      targetIds: ["ally-B"],
      instanceId: spellInstanceId,
      name: "benedizione",
    },
  ];

  const mutation = await prepareEffectsMutation(operations, {
    sceneItems: [allyA, allyB, allyC, caster],
  });

  assert.ok(Array.isArray(mutation.changes), "Mutation should be prepared successfully");
  // Ally B spell should be removed, but Ally A and Ally C must remain untouched
  const allyBChange = mutation.changes.find((c) => c.id === "ally-B");
  assert.ok(allyBChange, "Ally B must be modified");
  assert.deepEqual(allyBChange.after.spells, [], "Ally B spell must be removed");

  const allyAChange = mutation.changes.find((c) => c.id === "ally-A");
  assert.equal(allyAChange, undefined, "Ally A must NOT be modified");

  const allyCChange = mutation.changes.find((c) => c.id === "ally-C");
  assert.equal(allyCChange, undefined, "Ally C must NOT be modified");
});

// -----------------------------------------------------------------------------
// CF-B01A — ABIURARE NEMICO OUTCOME, MOVEMENT, PILL, COMBAT LOG, UNDO
// -----------------------------------------------------------------------------

test("CF-B01A.1: Abiurare Nemico FAIL outcome applies Spaventato with setMeters: 0 and displayLabel", () => {
  const feature = CLASS_FEATURE_BY_ID.get("paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico");
  assert.ok(feature);
  const act = planClassFeatureActivation({
    feature,
    choiceId: "failed",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin-1",
    targetIds: ["enemy-1"],
    instanceId: "abjure-fail-1",
  });
  assert.equal(act.ok, true);
  const conds = classFeatureConditionInstancesForActivation(
    feature,
    act.instance,
    "Paladin",
    [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
  );
  assert.equal(conds.length, 1);
  const cond = conds[0];
  assert.equal(cond.condition, "Spaventato", "Canonical condition must remain Spaventato");
  assert.equal(cond.displayLabel, "Spaventato · Velocità 0", "Display label must show Spaventato · Velocità 0");
  assert.equal(cond.mechanics?.endsOnDamage, true);
  assert.equal(cond.mechanics?.movement?.setMeters, 0);

  // Movement evaluation
  const moveProfile = resolveMovementProfile(9, [cond]);
  assert.equal(moveProfile.speedMeters, 0);
  const moveWithBonus = resolveMovementProfile(9, [cond], ["longstrider"]);
  assert.equal(moveWithBonus.speedMeters, 0, "Bonuses cannot increase speed past setMeters: 0");
});

test("CF-B01A.2: Abiurare Nemico SUCCESS outcome applies Velocità dimezzata with multiplier: 0.5 and displayLabel", () => {
  const feature = CLASS_FEATURE_BY_ID.get("paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico");
  assert.ok(feature);
  const act = planClassFeatureActivation({
    feature,
    choiceId: "succeeded",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin-1",
    targetIds: ["enemy-1"],
    instanceId: "abjure-succ-1",
  });
  assert.equal(act.ok, true);
  const conds = classFeatureConditionInstancesForActivation(
    feature,
    act.instance,
    "Paladin",
    [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
  );
  assert.equal(conds.length, 1);
  const cond = conds[0];
  assert.equal(cond.condition, "Velocità dimezzata", "Condition should be Velocità dimezzata");
  assert.equal(cond.displayLabel, "Velocità dimezzata");
  assert.equal(cond.mechanics?.endsOnDamage, true);
  assert.equal(cond.mechanics?.movement?.multiplier, 0.5);

  // Movement evaluation: 9m halved -> 4.5m
  const moveProfile = resolveMovementProfile(9, [cond]);
  assert.equal(moveProfile.speedMeters, 4.5);
});

test("CF-B01A.3: Both outcomes consume the exact same Incanalare Divinità resource pool", () => {
  const feature = CLASS_FEATURE_BY_ID.get("paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico");
  const actFail = planClassFeatureActivation({
    feature,
    choiceId: "failed",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin-1",
    targetIds: ["enemy-1"],
    instanceId: "abjure-res-1",
  });
  const actSucc = planClassFeatureActivation({
    feature,
    choiceId: "succeeded",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 9, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin-1",
    targetIds: ["enemy-1"],
    instanceId: "abjure-res-2",
  });
  assert.equal(actFail.state.resources["paladino-incanalare-divinita-usi"]?.current, 0);
  assert.equal(actSucc.state.resources["paladino-incanalare-divinita-usi"]?.current, 0);
});

test("CF-B01A.4: Combat Log summary for damage shows HP delta AND endsOnDamage condition removal (FAIL outcome)", () => {
  const rawEvent = {
    id: "evt-dmg-abjure-fail",
    category: "hp",
    label: "Modifica HP",
    sequence: 1,
    at: 1000,
    facets: {
      hp: {
        targets: [
          {
            id: "enemy-1",
            name: "Nemico 1",
            before: { hp: 40, hpMax: 40 },
            after: { hp: 30, hpMax: 40 },
            delta: -10,
          },
        ],
      },
      conditions: {
        targets: [
          {
            id: "enemy-1",
            name: "Nemico 1",
            removed: [
              {
                id: "abjure-fail-inst",
                condition: "Spaventato",
                displayLabel: "Spaventato · Velocità 0",
              },
            ],
          },
        ],
      },
    },
  };

  const presentation = buildCombatLogPresentation({}, [rawEvent]);
  assert.equal(presentation.events.length, 1, "Must generate exactly 1 combat log event");
  const event = presentation.events[0];
  assert.ok(event.summary.includes("-10 HP"), `Expected -10 HP in summary: ${event.summary}`);
  assert.ok(
    event.summary.includes("Spaventato · Velocità 0") || event.summary.includes("Spaventato"),
    `Expected condition removal in summary: ${event.summary}`,
  );
});

test("CF-B01A.5: Combat Log summary for damage shows HP delta AND endsOnDamage effect removal (SUCCESS outcome)", () => {
  const rawEvent = {
    id: "evt-dmg-abjure-succ",
    category: "hp",
    label: "Modifica HP",
    sequence: 2,
    at: 2000,
    facets: {
      hp: {
        targets: [
          {
            id: "enemy-1",
            name: "Nemico 1",
            before: { hp: 40, hpMax: 40 },
            after: { hp: 30, hpMax: 40 },
            delta: -10,
          },
        ],
      },
      conditions: {
        targets: [
          {
            id: "enemy-1",
            name: "Nemico 1",
            removed: [
              {
                id: "abjure-succ-inst",
                condition: "Velocità dimezzata",
                displayLabel: "Velocità dimezzata",
              },
            ],
          },
        ],
      },
    },
  };

  const presentation = buildCombatLogPresentation({}, [rawEvent]);
  assert.equal(presentation.events.length, 1, "Must generate exactly 1 combat log event");
  const event = presentation.events[0];
  assert.ok(event.summary.includes("-10 HP"), `Expected -10 HP in summary: ${event.summary}`);
  assert.ok(
    event.summary.includes("Velocità dimezzata"),
    `Expected effect removal in summary: ${event.summary}`,
  );
});

test("CF-B01A.6: Undo restores HP and SUCCESS effect (Velocità dimezzata) together in 1 transaction", () => {
  const succCond = {
    id: "abjure-succ-inst",
    condition: "Velocità dimezzata",
    displayLabel: "Velocità dimezzata",
    active: true,
    type: "class-feature",
    effectId: "paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico",
    mechanics: { endsOnDamage: true, movement: { multiplier: 0.5 } },
  };

  const historyEntry = {
    id: "damage-entry-succ-1",
    kind: "hp",
    label: "Modifica HP",
    effectsMutation: {
      version: 1,
      commandId: "cmd-dmg-succ-1",
      changes: [
        {
          id: "enemy-1",
          fields: { conditions: true },
          before: { conditions: [succCond] },
          after: { conditions: [] },
          metadataFields: { hp: true },
          beforeMetadata: { hp: { present: true, value: 40 } },
          afterMetadata: { hp: { present: true, value: 30 } },
        },
      ],
    },
  };

  const currentStates = [
    {
      id: "enemy-1",
      conditions: [],
      spells: [],
      concentrations: {},
      metadata: { hp: 30, hpMax: 40 },
    },
  ];

  const undoPlan = buildCoordinatedEffectsUndoPlan({
    currentStates,
    entryOrEntries: [historyEntry],
  });

  assert.equal(undoPlan.conflicts.length, 0);
  const restoredState = undoPlan.states?.find((s) => s.id === "enemy-1");
  assert.ok(restoredState);
  assert.equal(restoredState.metadata.hp, 40, "HP must be restored to 40");
  assert.equal(restoredState.conditions.length, 1, "Velocità dimezzata must be restored");
  assert.equal(restoredState.conditions[0].condition, "Velocità dimezzata");
});


