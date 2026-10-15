import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureIsReferenceOnly,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureRequiresActivationChoice,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

const PSIONIC = "ladro-lama-spirituale-potere-psionico-usi";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function rogue(level, subclassId) {
  return [{ classId: "ladro", level, subclassId }];
}

function activate(id, { build, targetIds = ["rogue"], choiceId = "", instanceId = `${id}-1` }) {
  const activation = planClassFeatureActivation({
    state: null,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "rogue",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:rogue",
    instanceId,
    choiceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Vex", build),
  };
}

const CONDITIONS = {
  "ladro-lama-spirituale-velo-psichico": "Invisibile",
  "ladro-lama-spirituale-squarciare-la-mente": "Stordito",
  "ladro-fantasma-cammino-fantasma": "Cammino Fantasma",
  "ladro-spadaccino-spavalderia": "Spavalderia",
  "ladro-indagatore-combattimento-intuitivo": "Combattimento Intuitivo",
  "ladro-esploratore-maestro-di-imboscate": "Maestro di Imboscate",
};

const RESOURCE_ONLY = [
  "ladro-lama-spirituale-potere-psionico-abilita-psicorinforzata",
  "ladro-lama-spirituale-potere-psionico-sussurri-psichici",
  "ladro-lama-spirituale-lame-dell-anima-colpi-guidati",
  "ladro-lama-spirituale-lame-dell-anima-teletrasporto-psichico",
  "ladro-fantasma-lamenti-dalla-tomba",
  "ladro-spadaccino-maestro-duellante",
];

test("Ladro: il batch implementa 12 capacità degli archetipi non curati", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "ladro" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 16);
  for (const [id, conditionName] of Object.entries(CONDITIONS)) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.equal(feature(id).effectPlan.conditionName, conditionName, id);
  }
  for (const id of RESOURCE_ONLY) {
    assert.equal(feature(id).runtimeSupport.adapter, "resource-only", id);
    assert.equal(feature(id).resourceCosts.length, 1, id);
  }
});

test("i poteri della Lama Spirituale spendono un dado di Energia Psionica", () => {
  const { activation } = activate("ladro-lama-spirituale-lame-dell-anima-teletrasporto-psichico", {
    build: rogue(9, "ladro-lama-spirituale"),
  });
  assert.equal(activation.state.resources[PSIONIC].maximum, 8);
  assert.equal(activation.state.resources[PSIONIC].current, 7);
  assert.equal(classFeatureIsReferenceOnly(feature("ladro-lama-spirituale-potere-psionico")), true);
  assert.deepEqual(feature("ladro-lama-spirituale-potere-psionico").trackedResourcePoolIds, [PSIONIC]);
});

test("Velo Psichico rende invisibili per un'ora; Squarciare la Mente stordisce per 10 round", () => {
  const veil = activate("ladro-lama-spirituale-velo-psichico", { build: rogue(13, "ladro-lama-spirituale") });
  assert.equal(veil.activation.instance.expiresRound, 600);
  assert.equal(veil.conditions[0].displayLabel, "Invisibile · Velo Psichico");
  const rend = activate("ladro-lama-spirituale-squarciare-la-mente", {
    build: rogue(17, "ladro-lama-spirituale"),
    targetIds: ["ogre"],
    instanceId: "rend-1",
  });
  assert.equal(rend.conditions[0].targetId, "ogre");
  assert.equal(rend.activation.instance.expiresRound, 10);
});

test("Spavalderia distingue creatura ostile e non ostile", () => {
  const value = feature("ladro-spadaccino-spavalderia");
  assert.equal(classFeatureRequiresActivationChoice(value), true);
  const friendly = activate(value.id, {
    build: rogue(9, "ladro-spadaccino"),
    targetIds: ["noble"],
    choiceId: "non-ostile",
  });
  assert.equal(friendly.conditions[0].condition, "Affascinato");
});

test("Cammino Fantasma concede volo 3 m per 10 minuti", () => {
  const { activation, conditions } = activate("ladro-fantasma-cammino-fantasma", {
    build: rogue(13, "ladro-fantasma"),
  });
  assert.equal(activation.instance.expiresRound, 100);
  assert.equal(resolveMovementProfile(9, conditions, [], "fly").modes.fly.speedMeters, 3);
});

test("contenitori, passive e potenziamenti restano carte descrittive", () => {
  for (const id of [
    "ladro-fantasma-compagno-della-morte",
    "ladro-pianificatore-maestro-di-intrighi",
    "ladro-assassino-assassinare",
    "ladro-lama-spirituale-lame-psichiche",
    "ladro-indagatore-occhio-infallibile",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
});
