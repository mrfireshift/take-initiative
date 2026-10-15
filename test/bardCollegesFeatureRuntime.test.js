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
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

const INSPIRATION = "bardo-ispirazione-bardica-usi";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function bard(level, subclassId) {
  return [{ classId: "bardo", level, subclassId }];
}

function activate(id, { build, targetIds = ["bard"], instanceId = `${id}-1` }) {
  const activation = planClassFeatureActivation({
    state: null,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "bard",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:bard",
    instanceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Lyra", build),
  };
}

const CONDITIONS = {
  "bardo-collegio-dei-sussurri-parole-di-terrore": "Spaventato",
  "bardo-collegio-dei-sussurri-manto-di-sussurri": "Manto di Sussurri",
  "bardo-collegio-dei-sussurri-conoscenze-dell-ombra": "Affascinato",
  "bardo-collegio-dell-incanto-esibizione-estasiante": "Affascinato",
  "bardo-collegio-dell-incanto-manto-di-maesta": "Manto di Maestà",
  "bardo-collegio-dell-incanto-maesta-inviolabile": "Maestà Inviolabile",
  "bardo-collegio-della-creazione-creazione-animata": "Creazione Animata",
  "bardo-collegio-delle-spade-virtuosismo-della-lama": "Virtuosismo della Lama",
  "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo": "Virtuosismo Difensivo",
};

test("Bardo: il batch implementa 10 capacità dei collegi non curati", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "bardo" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 15);
  for (const [id, conditionName] of Object.entries(CONDITIONS)) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.equal(feature(id).effectPlan.conditionName, conditionName, id);
  }
  assert.equal(
    feature("bardo-collegio-della-creazione-compimento-della-creazione").runtimeSupport.adapter,
    "resource-only",
  );
});

test("Esibizione Estasiante affascina più umanoidi per un'ora e termina con il danno", () => {
  const { activation, conditions } = activate("bardo-collegio-dell-incanto-esibizione-estasiante", {
    build: bard(3, "bardo-collegio-dell-incanto"),
    targetIds: ["noble-1", "noble-2"],
  });
  assert.equal(activation.state.resources["bardo-collegio-dell-incanto-esibizione-estasiante-usi"].current, 0);
  assert.equal(activation.instance.expiresRound, 600);
  assert.deepEqual(conditions.map((entry) => entry.condition), ["Affascinato", "Affascinato"]);
  assert.equal(conditions[0].mechanics.endsOnDamage, true);
});

test("Conoscenze dell'Ombra dura 8 ore", () => {
  const { activation } = activate("bardo-collegio-dei-sussurri-conoscenze-dell-ombra", {
    build: bard(14, "bardo-collegio-dei-sussurri"),
    targetIds: ["spy"],
  });
  assert.equal(activation.instance.expiresRound, 4800);
});

test("Virtuosismo della Lama aggiunge 3 m; il Difensivo non scala un valore inventato", () => {
  const blade = activate("bardo-collegio-delle-spade-virtuosismo-della-lama", {
    build: bard(3, "bardo-collegio-delle-spade"),
  });
  assert.equal(resolveMovementProfile(9, blade.conditions).speedMeters, 12);

  const defensive = activate("bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo", {
    build: bard(3, "bardo-collegio-delle-spade"),
    instanceId: "defensive-1",
  });
  // Il massimo di Ispirazione Bardica dipende dal Carisma: resta sulla scheda.
  assert.equal(defensive.activation.state.resources[INSPIRATION].current, null);
  assert.equal(defensive.conditions[0].expiry.mode, "turn-start");
});

test("le spese istantanee di Ispirazione restano carte, come Parole Taglienti", () => {
  for (const id of [
    "bardo-collegio-del-valore-ispirazione-in-combattimento",
    "bardo-collegio-dei-sussurri-lame-psichiche",
    "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-mobile",
    "bardo-collegio-della-sapienza-parole-taglienti",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
  // Manto d'Ispirazione: PF temporanei per livello, primitiva value-input.
  assert.equal(classFeatureRuntimeSupport(feature("bardo-collegio-dell-incanto-manto-di-ispirazione")).ready, false);
});
