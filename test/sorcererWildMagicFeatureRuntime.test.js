import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURES,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureQuickActions,
  getAvailableClassFeatures,
  orderClassFeaturesByParent,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureResourceCostAmount,
  classFeatureResourceEntries,
  classFeatureSpecialRefresh,
  classFeatureSpellSlotCreationCost,
  classFeatureTwinnedSpellCost,
  planClassFeatureActivation,
  planClassFeatureSpecialRefresh,
} from "../src/classFeatureCore.js";

const STREGONE_BASE = [{ classId: "stregone", level: 1 }];
const STREGONE_LEVEL_3 = [{ classId: "stregone", level: 3 }];
const STREGONE_WILD_MAGIC_LEVEL_1 = [{
  classId: "stregone",
  level: 1,
  subclassId: "stregone-magia-selvaggia",
}];
const STREGONE_WILD_MAGIC = [{
  classId: "stregone",
  level: 20,
  subclassId: "stregone-magia-selvaggia",
}];
const POINTS_POOL = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("stregone-punti-stregoneria");

function feature(id) {
  const entry = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(entry, `feature ${id} should exist`);
  return entry;
}

test("catalogs the Wild Magic Sorcerer progression and optional Metamagia", () => {
  const availableAtLevelOne = new Set(getAvailableClassFeatures(STREGONE_WILD_MAGIC_LEVEL_1).map((entry) => entry.id));
  assert.ok(availableAtLevelOne.has("stregone-incantesimi"));
  assert.ok(availableAtLevelOne.has("stregone-magia-selvaggia-impulso-di-magia-selvaggia"));
  assert.ok(availableAtLevelOne.has("stregone-magia-selvaggia-onde-di-caos"));
  assert.ok(getAvailableClassFeatures([{ classId: "stregone", level: 2 }])
    .some((entry) => entry.id === "stregone-fonte-di-magia"));
  assert.ok(!availableAtLevelOne.has("stregone-metamagia"));

  assert.equal(feature("stregone-magia-selvaggia-piegare-la-fortuna").minimumLevel, 6);
  assert.equal(feature("stregone-magia-selvaggia-caos-controllato").minimumLevel, 14);
  assert.equal(feature("stregone-magia-selvaggia-bombardamento-magico").minimumLevel, 18);
  assert.equal(feature("stregone-ripristino-stregonesco").minimumLevel, 20);

  const metamagia = [
    "stregone-metamagia-incantesimo-celato",
    "stregone-metamagia-incantesimo-distante",
    "stregone-metamagia-incantesimo-esteso",
    "stregone-metamagia-incantesimo-intensificato",
    "stregone-metamagia-incantesimo-potenziato",
    "stregone-metamagia-incantesimo-preciso",
    "stregone-metamagia-incantesimo-rapido",
    "stregone-metamagia-incantesimo-raddoppiato",
  ];
  assert.equal(metamagia.length, 8);
  for (const id of metamagia) {
    const entry = feature(id);
    assert.equal(entry.minimumLevel, 3);
    assert.equal(entry.defaultEnabled, false);
    assert.equal(entry.parentFeatureId, "stregone-metamagia");
    assert.equal(entry.runtimeSupport.status, "implemented");
  }
});

test("orders every class feature parent before its subfeatures", () => {
  const ordered = orderClassFeaturesByParent([
    { id: "child", parentFeatureId: "parent" },
    { id: "root" },
    { id: "parent" },
  ]);
  assert.deepEqual(ordered.map((entry) => entry.id), ["root", "parent", "child"]);

  const positions = new Map(
    orderClassFeaturesByParent(CLASS_FEATURES).map((feature, index) => [feature.id, index]),
  );
  const catalogIds = new Set(CLASS_FEATURES.map((feature) => feature.id));
  for (const feature of CLASS_FEATURES) {
    if (!feature.parentFeatureId || !catalogIds.has(feature.parentFeatureId)) continue;
    assert.ok(
      positions.get(feature.parentFeatureId) < positions.get(feature.id),
      `${feature.parentFeatureId} should precede ${feature.id}`,
    );
  }
});

test("preserves all 50 Wild Magic Surge rows and consultive spell guidance", () => {
  const surge = feature("stregone-magia-selvaggia-impulso-di-magia-selvaggia");
  assert.equal(surge.wildMagicTable.length, 50);
  assert.equal(surge.wildMagicTable[0].d100, "01-02");
  assert.equal(surge.wildMagicTable.at(-1).d100, "99-00");
  assert.equal(new Set(surge.wildMagicTable.map((entry) => entry.d100)).size, 50);
  assert.equal(surge.wildMagicTable.find((entry) => entry.d100 === "07-08").spellId, "fireball");
  assert.equal(surge.wildMagicTable.find((entry) => entry.d100 === "09-10").spellId, "magic-missile");

  for (const range of ["13-14", "45-46", "63-64", "77-78", "87-88"]) {
    const row = surge.wildMagicTable.find((entry) => entry.d100 === range);
    assert.equal(row.noConcentration, true, range);
    assert.equal(row.fullDuration, true, range);
  }
  assert.equal(surge.wildMagicTable.find((entry) => entry.d100 === "99-00").effect.length > 0, true);
});

test("keeps reference features out of activation surfaces and Metamagia resource-only", () => {
  const profile = {
    characterBuild: STREGONE_WILD_MAGIC,
    classFeaturesConfigured: false,
  };
  const quickActions = buildClassFeatureQuickActions(profile).map((entry) => entry.featureId);
  assert.ok(!quickActions.includes("stregone-incantesimi"));
  assert.ok(!quickActions.includes("stregone-magia-selvaggia-impulso-di-magia-selvaggia"));
  assert.ok(!quickActions.includes("stregone-magia-selvaggia-onde-di-caos"));

  const subtle = feature("stregone-metamagia-incantesimo-celato");
  assert.deepEqual(classFeatureEffectProjection(subtle), {
    kind: "none",
    conditionName: "Incantesimo Celato",
    detail: "Incantesimo Celato",
    radiusMeters: null,
    theme: subtle.theme,
    targetEffect: null,
    targetEffects: [],
    secondaryEffects: [],
    membershipTargeting: null,
  });
  const activation = planClassFeatureActivation({
    state: { resources: { "stregone-punti-stregoneria": { current: 3, maximum: 3 } } },
    feature: subtle,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: STREGONE_LEVEL_3,
    sourceId: "source-1",
    targetIds: ["source-1"],
    instanceId: "instant-1",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.state.resources["stregone-punti-stregoneria"].current, 2);
  assert.deepEqual(classFeatureConditionInstancesForActivation(
    subtle,
    activation.instance,
    "Stregone",
    STREGONE_LEVEL_3,
  ), []);
});

test("creates a manual reminder pill on the Sorcerer when Wild Magic tides are activated", () => {
  const tides = feature("stregone-magia-selvaggia-onde-di-caos");
  assert.deepEqual(classFeatureEffectProjection(tides), {
    kind: "condition",
    conditionName: "Onde di Caos",
    detail: tides.effectPlan.detail,
    radiusMeters: null,
    theme: tides.theme,
    targetEffect: null,
    targetEffects: [],
    secondaryEffects: [],
    membershipTargeting: null,
  });

  const activation = planClassFeatureActivation({
    state: {
      resources: {
        "stregone-magia-selvaggia-onde-di-caos-usi": { current: 1, maximum: 1 },
      },
    },
    feature: tides,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: STREGONE_WILD_MAGIC_LEVEL_1,
    sourceId: "sorcerer-1",
    targetIds: ["sorcerer-1"],
    instanceId: "tides-1",
  });

  assert.equal(activation.ok, true);
  assert.equal(
    activation.state.resources["stregone-magia-selvaggia-onde-di-caos-usi"].current,
    0,
  );
  assert.deepEqual(activation.state.instances, []);

  const reminders = classFeatureConditionInstancesForActivation(
    tides,
    activation.instance,
    "Stregone",
    STREGONE_WILD_MAGIC_LEVEL_1,
  );
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].targetId, "sorcerer-1");
  assert.equal(reminders[0].condition, "Onde di Caos");
  assert.deepEqual(reminders[0].expiry, { mode: "manual" });
  assert.equal(reminders[0].manualRemoval, true);
  assert.equal("mechanics" in reminders[0], false);
});

test("supports Sorcery Point formulas and the level-20 short-rest refresh", () => {
  const source = feature("stregone-fonte-di-magia");
  assert.equal(classFeatureSpellSlotCreationCost(source, 1), 2);
  assert.equal(classFeatureSpellSlotCreationCost(source, 5), 7);
  assert.equal(classFeatureSpellSlotCreationCost(source, 6), null);
  assert.equal(classFeatureTwinnedSpellCost(0), 1);
  assert.equal(classFeatureTwinnedSpellCost(9), 9);
  assert.equal(classFeatureTwinnedSpellCost(10), null);

  const restorationPool = POINTS_POOL;
  assert.ok(restorationPool);
  assert.deepEqual(classFeatureSpecialRefresh(restorationPool, STREGONE_BASE), null);
  assert.deepEqual(
    classFeatureSpecialRefresh(restorationPool, STREGONE_WILD_MAGIC),
    restorationPool.specialRefresh.find((entry) => entry.event === "riposo_breve"),
  );
  const refreshed = planClassFeatureSpecialRefresh(
    { resources: { [restorationPool.id]: { current: 13, maximum: 20 } } },
    restorationPool,
    STREGONE_WILD_MAGIC,
  );
  assert.equal(refreshed.changed, true);
  assert.equal(refreshed.state.resources[restorationPool.id].current, 17);

  const capped = planClassFeatureSpecialRefresh(
    { resources: { [restorationPool.id]: { current: 18, maximum: 20 } } },
    restorationPool,
    STREGONE_WILD_MAGIC,
  );
  assert.equal(capped.state.resources[restorationPool.id].current, 20);
  assert.equal(classFeatureResourceCostAmount({ variable: true, valueInput: "spell-level-0-9" }, { amount: 0 }), 1);
  assert.equal(classFeatureResourceCostAmount({ variable: true, valueInput: "spell-level-0-9" }, { amount: 10 }), null);
});

test("tracks shared Sorcery Points for source-only features and Wild Magic tides", () => {
  const source = feature("stregone-fonte-di-magia");
  const tides = feature("stregone-magia-selvaggia-onde-di-caos");
  const entries = classFeatureResourceEntries(
    {},
    [source, tides],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    STREGONE_BASE,
  );
  assert.deepEqual(entries.map((entry) => entry.pool.id).sort(), [
    "stregone-magia-selvaggia-onde-di-caos-usi",
    "stregone-punti-stregoneria",
  ]);
  assert.equal(tides.resourceCosts[0].amount, 1);
  assert.equal(tides.resourceCosts[0].poolId, "stregone-magia-selvaggia-onde-di-caos-usi");
  assert.equal(tides.quickActionEligible, false);
});
