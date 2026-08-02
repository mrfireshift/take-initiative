import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureQuickActions,
  getAvailableClassFeatures,
  classFeatureIsReferenceOnly,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureResourceEntries,
  planClassFeatureActivation,
  planClassFeatureResourceAdjustment,
} from "../src/classFeatureCore.js";

const mechanics = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/phb2014_livello_meccanico_v1_1.json", import.meta.url),
  "utf8",
)).mechanics;

const baseFeatureLevels = {
  "bardo-incantesimi": 1,
  "bardo-ispirazione-bardica": 1,
  "bardo-factotum": 2,
  "bardo-canto-di-riposo": 2,
  "bardo-collegio-bardico": 3,
  "bardo-maestria": 3,
  "bardo-aumento-dei-punteggi-di-caratteristica": 4,
  "bardo-fonte-di-ispirazione": 5,
  "bardo-controfascino": 6,
  "bardo-segreti-magici": 10,
  "bardo-ispirazione-superiore": 20,
};

const wisdomFeatureLevels = {
  "bardo-collegio-della-sapienza-competenze-bonus": 3,
  "bardo-collegio-della-sapienza-parole-taglienti": 3,
  "bardo-collegio-della-sapienza-segreti-magici-aggiuntivi": 6,
  "bardo-collegio-della-sapienza-abilita-impareggiabile": 14,
};

const bardoBuild = (level, subclassId = "") => [{
  classId: "bardo",
  level,
  subclassId,
}];

test("il catalogo Bardo/Sapienza espone livelli e runtime previsti", () => {
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeImplemented >= 44, true);
  for (const [id, level] of Object.entries(baseFeatureLevels)) {
    const feature = CLASS_FEATURE_BY_ID.get(id);
    assert.ok(feature, id);
    assert.equal(feature.subclassId, "", id);
    assert.equal(feature.minimumLevel, level, id);
  }
  for (const [id, level] of Object.entries(wisdomFeatureLevels)) {
    const feature = CLASS_FEATURE_BY_ID.get(id);
    assert.ok(feature, id);
    assert.equal(feature.subclassId, "bardo-collegio-della-sapienza", id);
    assert.equal(feature.minimumLevel, level, id);
  }

  const available = new Set(getAvailableClassFeatures(
    bardoBuild(14, "bardo-collegio-della-sapienza"),
  ).map((feature) => feature.id));
  assert.equal(available.has("bardo-collegio-della-sapienza-abilita-impareggiabile"), true);
  assert.equal(available.has("bardo-collegio-della-sapienza-parole-taglienti"), true);
  assert.equal(getAvailableClassFeatures(bardoBuild(14, "bardo-collegio-del-valore"))
    .some((feature) => feature.subclassId === "bardo-collegio-della-sapienza"), false);

  const references = [
    ...Object.keys(baseFeatureLevels).filter((id) => ![
      "bardo-ispirazione-bardica",
      "bardo-controfascino",
    ].includes(id)),
    ...Object.keys(wisdomFeatureLevels),
  ];
  assert.equal(references.every((id) => classFeatureIsReferenceOnly(CLASS_FEATURE_BY_ID.get(id))), true);

  const profile = {
    characterBuild: bardoBuild(14, "bardo-collegio-della-sapienza"),
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [
      ...Object.keys(baseFeatureLevels),
      ...Object.keys(wisdomFeatureLevels),
    ],
  };
  const quickActions = new Set(buildClassFeatureQuickActions(profile)
    .map((entry) => entry.featureId));
  assert.deepEqual([...quickActions].sort(), [
    "bardo-controfascino",
    "bardo-ispirazione-bardica",
  ]);
});

test("la fonte conserva i trigger contestuali di Sapienza", () => {
  const sharpWords = mechanics.find((entry) =>
    entry.id === "bardo-collegio-della-sapienza-parole-taglienti"
  );
  assert.equal(sharpWords.automation_level, "riferimento");
  assert.equal(sharpWords.activation.primary, "reazione");
  assert.equal(sharpWords.activation.optional, true);
  assert.deepEqual(sharpWords.triggers.sort(), [
    "prova_caratteristica",
    "tiro_danno",
    "tiro_per_colpire",
  ]);
  assert.equal(sharpWords.targets.range_meters, 18);
  assert.equal(sharpWords.targets.requirements.includes("visibile_al_bardo"), true);
  assert.equal(sharpWords.targets.requirements.includes("puo_sentire_il_bardo"), true);
  assert.equal(sharpWords.targets.requirements.includes("non_immune_ad_affascinato"), true);

  const peerless = mechanics.find((entry) =>
    entry.id === "bardo-collegio-della-sapienza-abilita-impareggiabile"
  );
  assert.equal(peerless.automation_level, "riferimento");
  assert.deepEqual(peerless.activation, {
    primary: "innesco",
    alternatives: [],
    trigger: "prova_caratteristica",
    timing: "dopo_d20_prima_esito",
    optional: true,
  });
  assert.equal(peerless.manual_choice_required, true);
});

test("il pool di Ispirazione conserva formula, dado e recupero senza massimo inventato", () => {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("bardo-ispirazione-bardica-usi");
  assert.equal(pool.capacity.expression, "max(1, modificatore_carisma)");
  assert.equal(pool.capacity.class_id, "bardo");

  const expected = new Map([
    [1, ["d6", ["riposo_lungo"]]],
    [4, ["d6", ["riposo_lungo"]]],
    [5, ["d8", ["riposo_breve", "riposo_lungo"]]],
    [9, ["d8", ["riposo_breve", "riposo_lungo"]]],
    [10, ["d10", ["riposo_breve", "riposo_lungo"]]],
    [14, ["d10", ["riposo_breve", "riposo_lungo"]]],
    [15, ["d12", ["riposo_breve", "riposo_lungo"]]],
    [20, ["d12", ["riposo_breve", "riposo_lungo"]]],
  ]);
  for (const [level, [die, refreshEvents]] of expected) {
    const [entry] = classFeatureResourceEntries(
      null,
      [{ resourceCosts: [{ poolId: pool.id, amount: 1 }] }],
      CLASS_FEATURE_RESOURCE_POOL_BY_ID,
      bardoBuild(level),
    );
    assert.equal(entry.die, die);
    assert.deepEqual(entry.refreshEvents, refreshEvents);
    assert.equal(entry.current, null);
    assert.equal(entry.maximum, null);
    assert.equal(entry.unlimited, false);
  }
});

test("il contatore di Ispirazione può essere impostato manualmente senza massimo risolto", () => {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("bardo-ispirazione-bardica-usi");
  const initialized = planClassFeatureResourceAdjustment(
    null,
    pool,
    bardoBuild(5),
    { current: 3 },
  );
  assert.deepEqual(initialized.state.resources[pool.id], {
    current: 3,
    maximum: null,
    unlimited: false,
  });

  const capped = planClassFeatureResourceAdjustment(
    initialized.state,
    pool,
    bardoBuild(5),
    { maximum: 5 },
  );
  assert.deepEqual(capped.state.resources[pool.id], {
    current: 3,
    maximum: 5,
    unlimited: false,
  });

  const recapped = planClassFeatureResourceAdjustment(
    capped.state,
    pool,
    bardoBuild(5),
    { maximum: 2 },
  );
  assert.deepEqual(recapped.state.resources[pool.id], {
    current: 2,
    maximum: 2,
    unlimited: false,
  });

  const activation = planClassFeatureActivation({
    state: initialized.state,
    feature: CLASS_FEATURE_BY_ID.get("bardo-ispirazione-bardica"),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(5),
    sourceId: "bard",
    targetIds: ["ally"],
    currentRound: 1,
    instanceId: "inspiration-manual-counter",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.state.resources[pool.id].current, 2);

  const legacy = {
    resources: {
      [pool.id]: { current: 0, maximum: 0, unlimited: false },
    },
  };
  const [legacyEntry] = classFeatureResourceEntries(
    legacy,
    [{ resourceCosts: [{ poolId: pool.id, amount: 1 }] }],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    bardoBuild(12),
  );
  assert.equal(legacyEntry.maximum, null);
  const repaired = planClassFeatureResourceAdjustment(
    legacy,
    pool,
    bardoBuild(12),
    { current: 3 },
  );
  assert.deepEqual(repaired.state.resources[pool.id], {
    current: 3,
    maximum: null,
    unlimited: false,
  });
});

test("Ispirazione crea un solo marker manuale sul bersaglio e non tira il dado", () => {
  const feature = CLASS_FEATURE_BY_ID.get("bardo-ispirazione-bardica");
  const activation = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(5),
    sourceId: "bard",
    targetIds: ["ally"],
    currentRound: 4,
    currentTurnKey: "4:1:bard",
    instanceId: "inspiration-1",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.state.resources["bardo-ispirazione-bardica-usi"].current, null);
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Bardo",
    bardoBuild(5),
  );
  assert.equal(pill.targetId, "ally");
  assert.equal(pill.sourceId, "bard");
  assert.equal(pill.sourceName, "Bardo");
  assert.equal(pill.effectId, feature.id);
  assert.equal(pill.parentEffectId, "inspiration-1");
  assert.equal(pill.manualRemoval, true);
  assert.deepEqual(pill.expiry, { mode: "rounds", remaining: 100 });
  assert.match(pill.effectDetail, /d6\/d8\/d10\/d12/i);
  assert.equal(pill.effectDetail.includes("d20"), true);
  assert.equal(pill.effectDetail.includes("prima dell'esito"), true);
});

test("Controfascino usa l'aura amichevole e scade alla fine del turno successivo", () => {
  const feature = CLASS_FEATURE_BY_ID.get("bardo-controfascino");
  const activation = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(6),
    sourceId: "bard",
    targetIds: ["bard"],
    currentRound: 7,
    currentTurnKey: "7:2:bard",
    instanceId: "countercharm-1",
  });
  assert.equal(activation.ok, true);
  const [sourcePill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Bardo",
    bardoBuild(6),
  );
  assert.equal(sourcePill.targetId, "bard");
  assert.equal(sourcePill.condition, "Controfascino");
  assert.deepEqual(sourcePill.expiry, {
    mode: "turn-end",
    actor: "source",
    actorId: "bard",
    remaining: 1,
    anchor: "next-turn",
  });
  const projection = classFeatureEffectProjection(feature, "", bardoBuild(6));
  assert.equal(projection.kind, "aura");
  assert.equal(projection.radiusMeters, 9);
  assert.deepEqual(projection.targetEffect.targeting, {
    filter: "friendly",
    includeCaster: false,
  });
  assert.match(projection.targetEffect.detail, /sentire il Bardo/i);
});
