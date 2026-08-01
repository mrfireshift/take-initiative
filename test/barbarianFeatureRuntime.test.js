import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureTargeting,
} from "../src/classFeatureCatalog.js";
import {
  appendClassFeatureConditionInstances,
  classFeatureBreaksConcentration,
  classFeatureChoiceOptions,
  classFeatureConditionInstancesForActivation,
  classFeatureDisplayName,
  classFeatureEffectProjection,
  classFeatureTemporaryHpApplications,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";

const PRIORITY_IDS = [
  "barbaro-ira",
  "barbaro-attacco-irruento",
  "barbaro-cammino-del-berserker-frenesia",
  "barbaro-cammino-del-berserker-presenza-intimidatoria",
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
  "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  "barbaro-cammino-della-bestia-forma-della-bestia",
  "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
  "barbaro-cammino-dello-zelota-presenza-zelante",
];
const OPTION_GATED_IDS = new Set([
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
  "barbaro-cammino-della-bestia-forma-della-bestia",
  "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
]);

test("tutti i candidati prioritari Barbaro sono pronti nel runtime", () => {
  for (const id of PRIORITY_IDS) {
    const feature = CLASS_FEATURE_BY_ID.get(id);
    assert.ok(feature, id);
    assert.equal(feature.runtimeSupport.status, "implemented", id);
    assert.equal(feature.defaultEnabled, !OPTION_GATED_IDS.has(id), id);
    assert.equal(feature.trackingMode, "active", id);
    assert.notEqual(feature.effectPlan, null, id);
  }
});

test("Ira e le varianti collegate dichiarano la rottura della concentrazione", () => {
  for (const id of [
    "barbaro-ira",
    "barbaro-cammino-del-berserker-frenesia",
    "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
    "barbaro-cammino-della-bestia-forma-della-bestia",
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
    "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2",
    "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
  ]) {
    assert.equal(classFeatureBreaksConcentration(CLASS_FEATURE_BY_ID.get(id)), true, id);
  }
  assert.equal(
    classFeatureBreaksConcentration(
      CLASS_FEATURE_BY_ID.get("barbaro-attacco-irruento"),
    ),
    false,
  );
});

test("i bersagli dei marker Barbaro rispettano la semantica della capacità", () => {
  const intimidatoria = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const protettori = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  const presenza = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-dello-zelota-presenza-zelante",
  );
  const chiamata = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  );
  const magia = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  );
  assert.deepEqual(classFeatureTargeting(intimidatoria), {
    mode: "single-target",
    rangeMeters: 9,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(protettori), {
    mode: "single-target",
    rangeMeters: null,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(presenza), {
    mode: "single-target",
    rangeMeters: 18,
    maxTargets: 10,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(chiamata), {
    mode: "single-target",
    rangeMeters: 9,
    maxTargets: null,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(magia), {
    mode: "single-target",
    rangeMeters: 1.5,
    maxTargets: 1,
    excludeSource: false,
  });
});

test("Attacco Irruento scade all'inizio del prossimo turno del barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-attacco-irruento");
  const activation = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 2, subclassId: "" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "reckless-1",
  });
  assert.equal(activation.ok, true);
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.deepEqual(pill.expiry, {
    mode: "turn-start",
    actor: "source",
    actorId: "barbarian",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.equal(pill.appliedAt.turnKey, "3:2:barbarian");
});

test("Presenza Intimidatoria scade alla fine del prossimo turno del barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const activation = planClassFeatureActivation({
    feature,
    poolsById: new Map(),
    characterBuild: [{ classId: "barbaro", level: 10, subclassId: "" }],
    sourceId: "barbarian",
    targetIds: ["enemy"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "intimidating-2",
  });
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.deepEqual(pill.expiry, {
    mode: "turn-end",
    actor: "source",
    actorId: "barbarian",
    remaining: 1,
    anchor: "next-turn",
  });
});

test("Frenesia usa lo stesso pool di Ira", () => {
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-del-berserker-frenesia");
  assert.deepEqual(feature.resourceCosts, [{
    poolId: "barbaro-ira-usi",
    amount: 1,
    sharedWithFeatureId: "barbaro-ira",
  }]);
});

test("Presenza Zelante termina all'inizio del prossimo turno del barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-dello-zelota-presenza-zelante",
  );
  const activation = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 14, subclassId: "" }],
    sourceId: "barbarian",
    targetIds: ["ally-1", "ally-2"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "zealous-1",
  });
  assert.equal(activation.ok, true);
  const instances = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.deepEqual(instances.map((entry) => entry.expiry), [
    {
      mode: "turn-start",
      actor: "source",
      actorId: "barbarian",
      remaining: 1,
      anchor: "next-turn",
    },
    {
      mode: "turn-start",
      actor: "source",
      actorId: "barbarian",
      remaining: 1,
      anchor: "next-turn",
    },
  ]);
});

test("le varianti di Ira condividono l'istanza senza consumare una seconda Ira", () => {
  const rage = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const frenzy = CLASS_FEATURE_BY_ID.get("barbaro-cammino-del-berserker-frenesia");
  const rageActivation = planClassFeatureActivation({
    feature: rage,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-berserker" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "rage-parent",
  });
  const frenzyActivation = planClassFeatureActivation({
    state: rageActivation.state,
    feature: frenzy,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-berserker" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "frenzy-child",
  });
  assert.equal(rageActivation.ok, true);
  assert.equal(frenzyActivation.ok, true);
  assert.equal(frenzyActivation.instance.parentInstanceId, "rage-parent");
  assert.equal(frenzyActivation.state.resources["barbaro-ira-usi"].current, 2);
});

test("i risultati di Magia Selvaggia usano nomi semantici", () => {
  const names = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => {
    const feature = CLASS_FEATURE_BY_ID.get(
      `barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-${number}`,
    );
    return feature?.name;
  });
  assert.deepEqual(names, [
    "Magia Selvaggia: Viti Oscure",
    "Magia Selvaggia: Teletrasporto",
    "Magia Selvaggia: Spirito Esplosivo",
    "Magia Selvaggia: Arma Infusa",
    "Magia Selvaggia: Ritorsione della Forza",
    "Magia Selvaggia: Luci Protettive",
    "Magia Selvaggia: Rampicanti",
    "Magia Selvaggia: Dardo di Luce",
  ]);
});

test("le pill dei marker prioritari ereditano nome e tema della Feature", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  const instances = classFeatureConditionInstancesForActivation(feature, {
    instanceId: "ancestors-1",
    sourceId: "barbarian",
    targetIds: ["enemy"],
    startedRound: 3,
    expiresRound: 4,
  }, "Barbaro");
  assert.equal(instances.length, 1);
  assert.equal(instances[0].targetId, "enemy");
  assert.equal(instances[0].condition, "Protettori Ancestrali");
  assert.deepEqual(instances[0].theme, feature.theme);
});

test("una capacitÃ  a bersaglio non crea la pill anche sul caster", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const instances = classFeatureConditionInstancesForActivation(feature, {
    instanceId: "intimidating-1",
    sourceId: "barbarian",
    targetIds: ["barbarian", "enemy"],
    startedRound: 3,
    expiresRound: 4,
  }, "Barbaro");
  assert.deepEqual(instances.map((entry) => entry.targetId), ["enemy"]);
});

test("il fallback della scheda non ricrea la pill del caster per un bersaglio", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const state = {
    instances: [{
      instanceId: "intimidating-3",
      featureId: feature.id,
      sourceId: "barbarian",
      targetIds: ["enemy"],
      startedRound: 3,
      expiresRound: null,
    }],
  };
  const projected = appendClassFeatureConditionInstances(
    {},
    state,
    CLASS_FEATURE_BY_ID,
    3,
  );
  assert.deepEqual(projected.instances, []);
});

test("una capacità a contatto non ricrea la pill sul caster quando il bersaglio è un alleato", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  );
  const projected = appendClassFeatureConditionInstances(
    {},
    {
      instances: [{
        instanceId: "magic-legacy",
        featureId: feature.id,
        sourceId: "barbarian",
        targetIds: ["ally"],
        choiceId: "bonus-d20",
        startedRound: 1,
        expiresRound: 100,
      }],
    },
    CLASS_FEATURE_BY_ID,
    2,
  );
  assert.deepEqual(projected.instances, []);
});

test("la proiezione dei marker resta una pill di classe e non una condizione neutra", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
  );
  const projection = classFeatureEffectProjection(feature);
  assert.equal(projection.kind, "condition");
  assert.equal(projection.conditionName, "Magia Selvaggia: Ritorsione della Forza");
  assert.equal(projection.theme.background, "#312e81");
});

test("le capacità a scelta persistono variante, nome e durata nella pill", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-bestia-forma-della-bestia",
  );
  assert.deepEqual(classFeatureChoiceOptions(feature).map((option) => option.id), [
    "morso",
    "artigli",
    "coda",
  ]);
  const activation = planClassFeatureActivation({
    state: {
      instances: [{
        instanceId: "rage-parent",
        featureId: "barbaro-ira",
        sourceId: "barbarian",
        targetIds: ["barbarian"],
        startedRound: 1,
        expiresRound: 10,
      }],
    },
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-della-bestia" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "beast-form-1",
    choiceId: "coda",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.choiceId, "coda");
  assert.equal(classFeatureDisplayName(feature, activation.instance.choiceId), "🐾 Forma della Bestia: Coda");
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.equal(pill.condition, "Forma della Bestia: Coda");
  assert.deepEqual(pill.expiry, { mode: "rounds", remaining: 9 });
});

test("Chiamata alla Caccia applica gli HP temporanei fissi al solo barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  );
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, {
    sourceId: "barbarian",
    targetIds: ["ally-1", "ally-2", "ally-3"],
  }), [{ targetId: "barbarian", amount: 15 }]);
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, {
    sourceId: "barbarian",
    targetIds: [],
  }), []);
});

test("Magia Corroborante richiede una scelta e dura 10 minuti", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  );
  const missing = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 6, subclassId: "barbaro-cammino-della-magia-selvaggia" }],
    sourceId: "barbarian",
    targetIds: ["ally"],
    instanceId: "magic-1",
  });
  assert.deepEqual(missing, { ok: false, reason: "choice-required" });
  const activation = planClassFeatureActivation({
    ...missing,
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 6, subclassId: "barbaro-cammino-della-magia-selvaggia" }],
    sourceId: "barbarian",
    targetIds: ["ally"],
    instanceId: "magic-2",
    choiceId: "bonus-d20",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.expiresRound, 100);
  assert.equal(activation.instance.choiceId, "bonus-d20");
});
