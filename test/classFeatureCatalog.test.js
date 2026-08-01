import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureContextEntries,
  buildClassFeatureQuickActions,
  classFeatureRuntimeSupport,
  classFeatureTargeting,
  getAvailableClassFeatures,
  getEnabledClassFeatures,
} from "../src/classFeatureCatalog.js";

const rageId = "barbaro-ira";
const vowId = "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia";
const twilightId = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";

test("il catalogo runtime copre PHB, Xanathar e Tasha", () => {
  assert.equal(CLASS_FEATURE_CATALOG.version, 4);
  assert.deepEqual(
    CLASS_FEATURE_CATALOG.sources.map((entry) => entry.id),
    ["phb2014", "xanathar", "tasha"],
  );
  assert.equal(CLASS_FEATURE_CATALOG.validation.catalogRecords, 815);
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeImplemented, 21);
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeNotAutomated, 395);
  assert.ok(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === rageId));
  assert.ok(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === vowId));
  assert.ok(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === twilightId));
});

test("livello e sottoclasse filtrano le capacità disponibili", () => {
  const build = [
    { classId: "barbaro", level: 1 },
    {
      classId: "paladino",
      level: 3,
      subclassId: "paladino-giuramento-di-vendetta",
    },
  ];
  const available = new Set(getAvailableClassFeatures(build).map((entry) => entry.id));
  assert.equal(available.has(rageId), true);
  assert.equal(available.has(vowId), true);
  assert.equal(available.has(twilightId), false);
});

test("la configurazione esplicita limita le capacità attive", () => {
  const profile = {
    characterBuild: [{ classId: "barbaro", level: 3 }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [rageId],
  };
  assert.deepEqual(
    getEnabledClassFeatures(profile).map((entry) => entry.id),
    [rageId],
  );
  assert.deepEqual(
    buildClassFeatureQuickActions(profile).map((entry) => entry.featureId),
    [rageId],
  );
});

test("il menu Feature espone stato, tema e risorse disponibili", () => {
  const entries = buildClassFeatureContextEntries({
    characterBuild: [{ classId: "barbaro", level: 3 }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [rageId],
  }, {
    instances: [{
      instanceId: "rage-active",
      featureId: rageId,
      sourceId: "barbarian",
      targetIds: ["barbarian"],
      startedRound: 2,
      expiresRound: 11,
    }],
  }, 4);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].active, true);
  assert.equal(entries[0].activeInstances[0].remainingRounds, 8);
  assert.equal(entries[0].resourceReady, true);
  assert.equal(entries[0].theme.background, "#7f1d1d");
  assert.equal(entries[0].targetLabel, "su di s\u00e9");
});

test("Frenesia resta disponibile quando usa l'Ira gi\u00e0 attiva", () => {
  const frenzyId = "barbaro-cammino-del-berserker-frenesia";
  const entries = buildClassFeatureContextEntries({
    characterBuild: [{
      classId: "barbaro",
      level: 3,
      subclassId: "barbaro-cammino-del-berserker",
    }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [rageId, frenzyId],
  }, {
    resources: {
      "barbaro-ira-usi": { current: 0, maximum: 3, unlimited: false },
    },
    instances: [{
      instanceId: "rage-active",
      featureId: rageId,
      sourceId: "barbarian",
      targetIds: ["barbarian"],
      startedRound: 2,
      expiresRound: 11,
    }],
  }, 3);
  const frenzy = entries.find((entry) => entry.featureId === frenzyId);
  assert.equal(frenzy?.active, false);
  assert.equal(frenzy?.resourceReady, true);
});

test("il menu Feature contrassegna una voce catalogata ma non automatizzata", () => {
  const entries = buildClassFeatureContextEntries({
    characterBuild: [{ classId: "guerriero", level: 1 }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-recuperare-energie"],
  }, null, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].runtimeReady, false);
  assert.equal(entries[0].runtimeStatus, "not-automated");
});

test("ogni costo del catalogo punta a una risorsa runtime", () => {
  for (const feature of CLASS_FEATURE_CATALOG.features) {
    for (const cost of feature.resourceCosts) {
      assert.equal(
        CLASS_FEATURE_RESOURCE_POOL_BY_ID.has(cost.poolId),
        true,
        `${feature.id}: ${cost.poolId}`,
      );
    }
  }
});

test("il catalogo non proietta condizioni per Feature prive di adapter", () => {
  const unsupported = CLASS_FEATURE_CATALOG.features.find(
    (entry) => entry.id === "guerriero-recuperare-energie",
  );
  assert.equal(classFeatureRuntimeSupport(unsupported).ready, false);
  assert.equal(unsupported.effectPlan, null);
  assert.equal(unsupported.defaultEnabled, false);
  assert.equal(unsupported.completenessStatus, "curated");
});

test("il catalogo distingue bersaglio singolo e aura", () => {
  const vow = CLASS_FEATURE_CATALOG.features.find((entry) => entry.id === vowId);
  const twilight = CLASS_FEATURE_CATALOG.features.find((entry) => entry.id === twilightId);
  assert.deepEqual(classFeatureTargeting(vow), {
    mode: "single-target",
    rangeMeters: 3,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(twilight), {
    mode: "aura",
    rangeMeters: 9,
    maxTargets: null,
    excludeSource: false,
  });
  assert.equal(twilight.effectPlan.conditionName, "Santuario del Crepuscolo");
  assert.equal(twilight.effectPlan.targetEffect.effectKind, "buff");
  assert.equal(twilight.theme.emoji, "🌙");
  assert.equal(buildClassFeatureQuickActions({
    characterBuild: [{
      classId: "chierico",
      level: 2,
      subclassId: "chierico-dominio-del-crepuscolo",
    }],
  }).find((entry) => entry.featureId === twilightId)?.label.startsWith("🌙 "), true);
  assert.deepEqual(twilight.effectPlan.targetEffect.mechanics.onEndTurn, [
    "temp_hp_1d6_plus_level_chierico",
    "end_charmed_or_frightened",
  ]);
});
