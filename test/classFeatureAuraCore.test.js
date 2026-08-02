import test from "node:test";
import assert from "node:assert/strict";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { ID } from "../src/constants.js";
import { CLASS_FEATURE_CATALOG } from "../src/classFeatureCatalog.js";
import {
  CLASS_FEATURE_AREA_EFFECT_TYPE,
  classFeatureAuraEndsOnSourceCondition,
  classFeatureAuraMembershipPlan,
  classFeatureAuraTargetIds,
  collectActiveClassFeatureAuras,
} from "../src/classFeatureAuraCore.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
} from "../src/classFeatureCore.js";

const META_KEY = `${ID}/meta`;
const twilightId = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";
const wolfId = "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo";

function twilightItems() {
  return [{
    id: "cleric",
    name: "Cleric",
    metadata: {
      [META_KEY]: {
        attitude: "pc",
        classFeatureState: {
          instances: [{
            instanceId: "twilight-1",
            featureId: twilightId,
            sourceId: "cleric",
            targetIds: ["cleric"],
            suppressedTargetIds: [],
            startedRound: 1,
            expiresRound: 10,
          }],
        },
      },
    },
  }];
}

test("un'aura di capacità produce membership e buff area", () => {
  const items = twilightItems();
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: new Map(CLASS_FEATURE_CATALOG.features.map((entry) => [entry.id, entry])),
    currentRound: 1,
  });
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 6, y: 0 }, 1, { x: 0, y: 0 });
  const candidates = [
    { item: items[0], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } },
    {
      item: { id: "ally", metadata: { [META_KEY]: { attitude: "ally" } } },
      bounds: { min: { x: 2, y: 0 }, max: { x: 3, y: 1 } },
    },
    {
      item: { id: "enemy", metadata: { [META_KEY]: { attitude: "enemy" } } },
      bounds: { min: { x: 3, y: 0 }, max: { x: 4, y: 1 } },
    },
    { item: { id: "far" }, bounds: { min: { x: 30, y: 0 }, max: { x: 31, y: 1 } } },
  ];
  const targetIds = classFeatureAuraTargetIds({ aura, area, candidates, metaKey: META_KEY });
  assert.deepEqual(targetIds, ["cleric", "ally", "enemy"]);

  const plan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: targetIds,
    items,
    metaKey: META_KEY,
  });
  assert.equal(plan.operations[0].type, "condition:add");
  assert.deepEqual(plan.operations[0].targetIds, ["cleric", "ally", "enemy"]);
  assert.equal(plan.operations[0].options.type, CLASS_FEATURE_AREA_EFFECT_TYPE);
  assert.equal(plan.operations[0].options.effectKind, "buff");
  assert.equal(plan.operations[0].options.parentEffectId, "twilight-1");
  assert.equal(plan.operations[0].options.theme.emoji, "🌙");
  assert.equal(plan.operations[0].options.theme.background, "#312e81");

  const itemsWithAreaMember = [{
    id: "ally",
    metadata: {
      [META_KEY]: {
        conditions: {
          instances: [{
            id: "twilight-area-ally",
            condition: "Santuario del Crepuscolo",
            active: true,
            targetId: "ally",
            sourceId: "cleric",
            parentEffectId: "twilight-1",
            effectId: `${twilightId}:area`,
            type: CLASS_FEATURE_AREA_EFFECT_TYPE,
            effectKind: "buff",
          }],
        },
      },
    },
  }];
  const leavingPlan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: ["cleric"],
    items: itemsWithAreaMember,
    metaKey: META_KEY,
  });
  assert.equal(leavingPlan.operations[0].removals[0].skipClassFeatureReconcile, true);
});

test("Spirito Totemico: Lupo produce aura e pill di vantaggio agli alleati", () => {
  const items = [
    {
      id: "barbarian",
      name: "Barbaro",
      metadata: {
        [META_KEY]: {
          attitude: "pc",
          classFeatureState: {
            instances: [
              {
                instanceId: "rage-parent",
                featureId: "barbaro-ira",
                sourceId: "barbarian",
                targetIds: ["barbarian"],
                startedRound: 1,
                expiresRound: 10,
              },
              {
                instanceId: "wolf-1",
                featureId: wolfId,
                sourceId: "barbarian",
                targetIds: ["barbarian"],
                parentFeatureId: "barbaro-ira",
                parentInstanceId: "rage-parent",
                startedRound: 1,
                expiresRound: 10,
              },
            ],
          },
        },
      },
    },
    {
      id: "ally",
      metadata: {
        [META_KEY]: {
          attitude: "ally",
        },
      },
    },
  ];
  const auras = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: new Map(CLASS_FEATURE_CATALOG.features.map((entry) => [entry.id, entry])),
    currentRound: 1,
  });
  assert.equal(auras.length, 1);
  const [aura] = auras;
  assert.equal(aura.featureId, wolfId);
  assert.equal(aura.radiusMeters, 1.5);
  assert.equal(aura.targetEffect.label, "Vantaggio: attacchi in mischia");
  assert.equal(aura.targetEffect.kind, "buff");
  assert.equal(aura.targetEffects.length, 1);

  const area = buildCircleArea({ x: 0, y: 0 }, { x: 6, y: 0 }, 1, { x: 0, y: 0 });
  const targetIds = classFeatureAuraTargetIds({
    aura,
    area,
    candidates: [
      { item: items[0], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } },
      { item: items[1], bounds: { min: { x: 2, y: 0 }, max: { x: 3, y: 1 } } },
      {
        item: { id: "enemy", metadata: { [META_KEY]: { attitude: "enemy" } } },
        bounds: { min: { x: 3, y: 0 }, max: { x: 4, y: 1 } },
      },
    ],
    metaKey: META_KEY,
  });
  assert.deepEqual(targetIds, ["ally"]);
  const plan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: targetIds,
    items,
    metaKey: META_KEY,
  });
  assert.equal(plan.operations[0].type, "condition:add");
  assert.deepEqual(plan.operations[0].targetIds, ["ally"]);
  assert.equal(plan.operations[0].options.type, CLASS_FEATURE_AREA_EFFECT_TYPE);
  assert.equal(plan.operations[0].options.effectKind, "buff");
  assert.equal(plan.operations[0].options.parentEffectId, "wolf-1");
});

test("le aure del Paladino usano 3/9 metri e mostrano lo stesso effetto a Paladino e alleati", () => {
  const feature = CLASS_FEATURE_CATALOG.features.find((entry) =>
    entry.id === "paladino-aura-di-protezione"
  );
  const courage = CLASS_FEATURE_CATALOG.features.find((entry) =>
    entry.id === "paladino-aura-di-coraggio"
  );
  assert.ok(feature);
  assert.ok(courage);
  const levelSix = [{ classId: "paladino", level: 6 }];
  const levelTen = [{ classId: "paladino", level: 10 }];
  const levelEighteen = [{ classId: "paladino", level: 18 }];
  assert.equal(classFeatureEffectProjection(feature, "", []).radiusMeters, 3);
  assert.equal(classFeatureEffectProjection(feature, "", levelSix).radiusMeters, 3);
  assert.equal(classFeatureEffectProjection(feature, "", levelEighteen).radiusMeters, 9);
  assert.equal(classFeatureEffectProjection(courage, "", levelTen).radiusMeters, 3);
  assert.equal(classFeatureEffectProjection(courage, "", levelEighteen).radiusMeters, 9);
  assert.equal(feature.suppressSourceCardPill, true);
  assert.equal(courage.suppressSourceCardPill, true);
  assert.equal(feature.quickActionEligible, false);
  assert.equal(courage.quickActionEligible, false);
  assert.deepEqual(feature.duration.endConditions, ["privo_di_sensi"]);
  assert.deepEqual(courage.duration.endConditions, ["privo_di_sensi"]);
  assert.deepEqual(feature.effectPlan.targetEffect.targeting, {
    filter: "friendly",
    includeCaster: true,
  });
  assert.deepEqual(courage.effectPlan.targetEffect.targeting, {
    filter: "friendly",
    includeCaster: true,
  });
  for (const [auraFeature, instanceId, build] of [
    [feature, "protection-1", levelSix],
    [courage, "courage-1", levelTen],
  ]) {
    assert.deepEqual(classFeatureConditionInstancesForActivation(
      auraFeature,
      {
        instanceId,
        sourceId: "paladin",
        targetIds: ["paladin"],
        startedRound: 1,
      },
      "Paladino",
      build,
    ), []);
  }

  const items = [{
    id: "paladin",
    name: "Paladino",
    metadata: {
      [META_KEY]: {
        attitude: "pc",
        classFeatureState: {
          instances: [{
            instanceId: "protection-1",
            featureId: feature.id,
            sourceId: "paladin",
            targetIds: ["paladin"],
            startedRound: 1,
          }],
        },
      },
    },
  }];
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: new Map([[feature.id, feature]]),
    currentRound: 1,
    characterBuildBySourceId: new Map([["paladin", levelSix]]),
  });
  assert.equal(aura.radiusMeters, 3);
  assert.equal(aura.targetEffect.label, "Bonus ai tiri salvezza");
  assert.equal(aura.targetEffect.kind, "buff");
  assert.equal(aura.targetEffects.length, 1);
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 6, y: 0 }, 1, { x: 0, y: 0 });
  const targetIds = classFeatureAuraTargetIds({
    aura,
    area,
    candidates: [
      { item: items[0], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } },
      {
        item: { id: "ally", metadata: { [META_KEY]: { attitude: "ally" } } },
        bounds: { min: { x: 2, y: 0 }, max: { x: 3, y: 1 } },
      },
      {
        item: { id: "enemy", metadata: { [META_KEY]: { attitude: "enemy" } } },
        bounds: { min: { x: 3, y: 0 }, max: { x: 4, y: 1 } },
      },
    ],
    metaKey: META_KEY,
  });
  assert.deepEqual(targetIds, ["paladin", "ally"]);
  const membership = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: targetIds,
    items,
    metaKey: META_KEY,
  });
  assert.deepEqual(membership.operations[0].targetIds, ["paladin", "ally"]);
  assert.equal(membership.operations[0].conditionName, "Bonus ai tiri salvezza");
  assert.equal(classFeatureAuraEndsOnSourceCondition(
    { feature },
    [{ id: "unconscious", condition: "Privo di Sensi", active: true }],
  ), true);
  assert.equal(classFeatureAuraEndsOnSourceCondition(
    { feature },
    [{ id: "unconscious", condition: "Privo di Sensi", active: false }],
  ), false);
});

test("Angelo Vendicatore usa un'aura ostile solo per i trigger e collega il volo", () => {
  const feature = CLASS_FEATURE_CATALOG.features.find((entry) =>
    entry.id === "paladino-giuramento-di-vendetta-angelo-vendicatore"
  );
  const items = [
    {
      id: "paladin",
      name: "Paladino",
      metadata: {
        [META_KEY]: {
          attitude: "pc",
          classFeatureState: {
            instances: [{
              instanceId: "angel-1",
              featureId: feature.id,
              sourceId: "paladin",
              targetIds: ["paladin"],
              startedRound: 1,
            }],
          },
        },
      },
    },
  ];
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: new Map([[feature.id, feature]]),
    currentRound: 1,
  });
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 9, y: 0 }, 1, { x: 0, y: 0 });
  const targetIds = classFeatureAuraTargetIds({
    aura,
    area,
    candidates: [
      { item: items[0], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } },
      {
        item: { id: "ally", metadata: { [META_KEY]: { attitude: "ally" } } },
        bounds: { min: { x: 2, y: 0 }, max: { x: 3, y: 1 } },
      },
      {
        item: { id: "enemy", metadata: { [META_KEY]: { attitude: "enemy" } } },
        bounds: { min: { x: 3, y: 0 }, max: { x: 4, y: 1 } },
      },
    ],
    metaKey: META_KEY,
  });
  const [casterPill] = classFeatureConditionInstancesForActivation(
    feature,
    {
      instanceId: "angel-1",
      sourceId: "paladin",
      targetIds: ["paladin"],
      startedRound: 1,
    },
    "Paladino",
  );

  assert.equal(aura.targetEffects.length, 0);
  assert.equal(aura.triggerPolicy.triggers.length, 2);
  assert.deepEqual(targetIds, ["enemy"]);
  assert.deepEqual(classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: targetIds,
    items,
    metaKey: META_KEY,
  }).operations, []);
  assert.equal(casterPill.mechanics.movement.modes.fly.grantMeters, 18);
});

test("la riconciliazione migra una pill area senza tema al tema della Feature", () => {
  const items = twilightItems();
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: new Map(CLASS_FEATURE_CATALOG.features.map((entry) => [entry.id, entry])),
    currentRound: 1,
  });
  const plan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: ["cleric"],
    items: [{
      id: "cleric",
      metadata: {
        [META_KEY]: {
          conditions: {
            instances: [{
              id: "legacy-twilight-area",
              condition: "Santuario del Crepuscolo",
              active: true,
              targetId: "cleric",
              sourceId: "cleric",
              parentEffectId: "twilight-1",
              effectId: `${twilightId}:area`,
              type: CLASS_FEATURE_AREA_EFFECT_TYPE,
              effectKind: "buff",
            }],
          },
        },
      },
    }],
    metaKey: META_KEY,
  });
  assert.equal(plan.operations[0].type, "condition:remove-instances");
  assert.equal(plan.operations[0].removals[0].skipClassFeatureReconcile, true);
  assert.equal(plan.operations[1].type, "condition:add");
  assert.equal(plan.operations[1].options.theme.background, "#312e81");
  assert.equal(plan.operations[1].options.theme.accent, "#a78bfa");
});
