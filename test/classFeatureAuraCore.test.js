import test from "node:test";
import assert from "node:assert/strict";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { ID } from "../src/constants.js";
import { CLASS_FEATURE_CATALOG } from "../src/classFeatureCatalog.js";
import {
  CLASS_FEATURE_AREA_EFFECT_TYPE,
  classFeatureAuraMembershipPlan,
  classFeatureAuraTargetIds,
  collectActiveClassFeatureAuras,
} from "../src/classFeatureAuraCore.js";

const META_KEY = `${ID}/meta`;
const twilightId = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";

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
