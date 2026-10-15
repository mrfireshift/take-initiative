import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureIsReferenceOnly,
  classFeatureRuntimeSupport,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureRequiresActivationChoice,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

const SORCERY = "stregone-punti-stregoneria";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function sorcerer(level, subclassId) {
  return [{ classId: "stregone", level, subclassId }];
}

function activate(id, { build, targetIds = ["sorcerer"], choiceId = "", instanceId = `${id}-1` }) {
  const activation = planClassFeatureActivation({
    state: null,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "sorcerer",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:sorcerer",
    instanceId,
    choiceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Sable", build),
  };
}

// Costi RAW in punti stregoneria: la fonte li marcava variabili.
const FIXED_SORCERY = {
  "stregone-magia-delle-ombre-segugio-dei-presagi-nefasti": 3,
  "stregone-magia-delle-ombre-forma-d-ombra": 6,
  "stregone-discendenza-draconica-presenza-draconica": 5,
  "stregone-anima-divina-guarigione-potenziata": 1,
};

const IMPLEMENTED = [
  ...Object.keys(FIXED_SORCERY),
  "stregone-discendenza-draconica-ali-di-drago",
  "stregone-magia-delle-ombre-forza-della-tomba",
  "stregone-anima-divina-prescelto-dagli-dei",
  "stregone-anima-divina-ali-ultraterrene",
  "stregone-anima-divina-recupero-ultraterreno",
  "stregone-anima-meccanica-ripristino-dell-equilibrio",
  "stregone-anima-meccanica-trance-dell-ordine",
  "stregone-stregoneria-della-tempesta-anima-del-vento",
];

test("Stregone: il batch implementa 12 capacità delle origini non curate", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "stregone" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 25);
  assert.equal(IMPLEMENTED.length, 12);
  for (const id of IMPLEMENTED) assert.ok(classFeatureRuntimeSupport(feature(id)).ready, id);
});

test("i costi in punti stregoneria sono fissi come da RAW", () => {
  for (const [id, amount] of Object.entries(FIXED_SORCERY)) {
    const cost = feature(id).resourceCosts.find((entry) => entry.poolId === SORCERY);
    assert.equal(cost?.amount, amount, id);
    assert.notEqual(cost?.variable, true, id);
  }
  const { activation } = activate("stregone-magia-delle-ombre-forma-d-ombra", {
    build: sorcerer(18, "stregone-magia-delle-ombre"),
  });
  assert.equal(activation.state.resources[SORCERY].current, 12);
});

test("Trance dell'Ordine è gratuita al primo uso", () => {
  const value = feature("stregone-anima-meccanica-trance-dell-ordine");
  assert.deepEqual(value.resourceCosts, []);
  const { activation } = activate(value.id, { build: sorcerer(14, "stregone-anima-meccanica") });
  assert.equal(activation.instance.expiresRound, 10);
});

test("il Segugio dei Presagi Nefasti segna il bersaglio per 5 minuti", () => {
  const { activation, conditions } = activate("stregone-magia-delle-ombre-segugio-dei-presagi-nefasti", {
    build: sorcerer(6, "stregone-magia-delle-ombre"),
    targetIds: ["cultist"],
  });
  assert.equal(activation.state.resources[SORCERY].current, 3);
  assert.equal(conditions[0].targetId, "cultist");
  assert.equal(activation.instance.expiresRound, 50);
});

test("Presenza Draconica è un'aura di 18 m con scelta venerazione o paura", () => {
  const value = feature("stregone-discendenza-draconica-presenza-draconica");
  assert.equal(value.runtimeSupport.adapter, "aura");
  assert.equal(classFeatureRequiresActivationChoice(value), true);
  const projection = classFeatureEffectProjection(value, "venerazione", sorcerer(18, "stregone-discendenza-draconica"));
  assert.equal(projection.kind, "aura");
  assert.equal(projection.radiusMeters, 18);
  assert.equal(projection.membershipTargeting.filter, "hostile");
  assert.equal(projection.triggerPolicy.triggers[0].event, "turn-start");
});

test("le ali concedono il volo: copiato dal passo o fisso a 9 m", () => {
  const dragon = activate("stregone-discendenza-draconica-ali-di-drago", {
    build: sorcerer(14, "stregone-discendenza-draconica"),
  });
  assert.equal(resolveMovementProfile(9, dragon.conditions, [], "fly").modes.fly.speedMeters, 9);
  const divine = activate("stregone-anima-divina-ali-ultraterrene", {
    build: sorcerer(14, "stregone-anima-divina"),
    instanceId: "wings-1",
  });
  assert.equal(resolveMovementProfile(12, divine.conditions, [], "fly").modes.fly.speedMeters, 9);
});

test("costi variabili e incantesimi restano fuori", () => {
  for (const id of [
    "stregone-anima-meccanica-bastione-della-legge",
    "stregone-mente-aberrante-rivelazione-della-carne",
  ]) {
    assert.equal(classFeatureRuntimeSupport(feature(id)).ready, false, id);
  }
  for (const id of [
    "stregone-mente-aberrante-stregoneria-psionica",
    "stregone-magia-delle-ombre-camminare-nelle-ombre",
    "stregone-stregoneria-della-tempesta-furia-della-tempesta",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
});
