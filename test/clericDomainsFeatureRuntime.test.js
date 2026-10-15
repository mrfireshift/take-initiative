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
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";

const CHANNEL = "chierico-incanalare-divinita-usi";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function cleric(level, subclassId) {
  return [{ classId: "chierico", level, subclassId }];
}

function activate(id, { build, targetIds = [], instanceId = `${id}-1` }) {
  const value = feature(id);
  const activation = planClassFeatureActivation({
    state: null,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "cleric",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:cleric",
    instanceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(value, activation.instance, "Ilse", build),
  };
}

// Pill attese per ogni capacità del batch con adapter condition.
const CONDITIONS = {
  "chierico-dominio-della-natura-incanalare-divinita-charme-su-animali-e-vegetali": ["Affascinato", "chierico-dominio-della-natura"],
  "chierico-dominio-della-conoscenza-incanalare-divinita-conoscenze-secolari": ["Conoscenze Secolari", "chierico-dominio-della-conoscenza"],
  "chierico-dominio-della-conoscenza-incanalare-divinita-lettura-del-pensiero": ["Lettura del Pensiero", "chierico-dominio-della-conoscenza"],
  "chierico-dominio-dell-inganno-incanalare-divinita-invocare-duplicato": ["Invocare Duplicato", "chierico-dominio-dell-inganno"],
  "chierico-dominio-dell-inganno-incanalare-divinita-manto-di-ombre": ["Invisibile", "chierico-dominio-dell-inganno"],
  "chierico-dominio-dell-ordine-incanalare-divinita-pretesa-dell-ordine": ["Affascinato", "chierico-dominio-dell-ordine"],
  "chierico-dominio-della-tomba-incanalare-divinita-verso-la-tomba": ["Verso la Tomba", "chierico-dominio-della-tomba"],
  "chierico-dominio-dell-inganno-benedizione-dell-ingannatore": ["Benedizione dell'Ingannatore", "chierico-dominio-dell-inganno"],
  "chierico-dominio-della-pace-legame-incoraggiante": ["Legame Incoraggiante", "chierico-dominio-della-pace"],
  "chierico-dominio-dell-ordine-ira-dell-ordine": ["Ira dell'Ordine", "chierico-dominio-dell-ordine"],
};

const RESOURCE_ONLY = {
  "chierico-dominio-della-forgia-incanalare-divinita-benedizione-dell-artigiano": CHANNEL,
  "chierico-dominio-della-guerra-incanalare-divinita-colpo-guidato": CHANNEL,
  "chierico-dominio-della-guerra-incanalare-divinita-benedizione-del-dio-della-guerra": CHANNEL,
  "chierico-dominio-della-luce-incanalare-divinita-fulgore-dell-alba": CHANNEL,
  "chierico-dominio-della-tempesta-incanalare-divinita-collera-distruttiva": CHANNEL,
  "chierico-dominio-della-forgia-benedizione-della-forgia": "chierico-dominio-della-forgia-benedizione-della-forgia-usi",
};

test("Chierico: il batch implementa 17 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "chierico" && entry.runtimeSupport.status === "implemented"
  );
  // 20 dal batch e dalle cure precedenti, più Incarnazione della Legge (P1).
  assert.equal(implemented.length, 21);
  assert.equal(Object.keys(CONDITIONS).length + Object.keys(RESOURCE_ONLY).length + 1, 17);
});

test("ogni capacità del batch dichiara adapter, pill e pool attesi", () => {
  for (const [id, [conditionName]] of Object.entries(CONDITIONS)) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.adapter, "condition", id);
    assert.equal(value.effectPlan.conditionName, conditionName, id);
    assert.equal(value.trackingMode, "active", id);
  }
  for (const [id, poolId] of Object.entries(RESOURCE_ONLY)) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.adapter, "resource-only", id);
    assert.deepEqual(value.resourceCosts.map((cost) => cost.poolId), [poolId], id);
  }
});

test("le opzioni di Incanalare Divinità condividono il pool di classe", () => {
  const { activation } = activate(
    "chierico-dominio-della-tempesta-incanalare-divinita-collera-distruttiva",
    { build: cleric(2, "chierico-dominio-della-tempesta") },
  );
  assert.equal(activation.state.resources[CHANNEL].current, 0);
  assert.equal(activation.state.resources[CHANNEL].maximum, 1);
});

test("Charme su Animali e Pretesa dell'Ordine applicano Affascinato a più bersagli", () => {
  const charm = activate(
    "chierico-dominio-della-natura-incanalare-divinita-charme-su-animali-e-vegetali",
    { build: cleric(2, "chierico-dominio-della-natura"), targetIds: ["wolf-1", "wolf-2"] },
  );
  assert.deepEqual(charm.conditions.map((entry) => entry.condition), ["Affascinato", "Affascinato"]);
  assert.equal(charm.activation.instance.expiresRound, 10);

  const order = activate(
    "chierico-dominio-dell-ordine-incanalare-divinita-pretesa-dell-ordine",
    { build: cleric(2, "chierico-dominio-dell-ordine"), targetIds: ["bandit-1", "bandit-2", "bandit-3"] },
  );
  assert.equal(order.conditions.length, 3);
  assert.equal(order.conditions[0].expiry.mode, "turn-end");
  assert.equal(order.conditions[0].expiry.anchor, "next-turn");
});

test("Manto di Ombre rende invisibile il chierico fino alla fine del prossimo turno", () => {
  const { activation, conditions } = activate(
    "chierico-dominio-dell-inganno-incanalare-divinita-manto-di-ombre",
    { build: cleric(6, "chierico-dominio-dell-inganno"), targetIds: ["cleric"] },
  );
  assert.equal(activation.state.resources[CHANNEL].current, 1);
  assert.equal(conditions[0].condition, "Invisibile");
  assert.equal(conditions[0].targetId, "cleric");
});

test("Legame Incoraggiante lega più creature, chierico incluso", () => {
  const { activation, conditions } = activate("chierico-dominio-della-pace-legame-incoraggiante", {
    build: cleric(1, "chierico-dominio-della-pace"),
    targetIds: ["cleric", "ally"],
  });
  assert.equal(activation.state.resources["chierico-dominio-della-pace-legame-incoraggiante-usi"].maximum, 2);
  assert.deepEqual(conditions.map((entry) => entry.targetId).sort(), ["ally", "cleric"]);
});

test("Corona di Luce è un'aura di 18 m che segna solo i nemici", () => {
  const value = feature("chierico-dominio-della-luce-corona-di-luce");
  assert.equal(value.runtimeSupport.adapter, "aura");
  const projection = classFeatureEffectProjection(value, "", cleric(17, "chierico-dominio-della-luce"));
  assert.equal(projection.kind, "aura");
  assert.equal(projection.radiusMeters, 18);
  assert.equal(projection.targetEffect.effectKind, "debuff");
  assert.equal(projection.membershipTargeting.filter, "hostile");
});

test("le capacità con usi legati alla Saggezza restano carte descrittive", () => {
  for (const id of [
    "chierico-dominio-della-tempesta-collera-della-tempesta",
    "chierico-dominio-della-luce-lampo-di-interdizione",
    "chierico-dominio-della-guerra-sacerdote-di-guerra",
    "chierico-dominio-della-tomba-sentinella-alla-porta-della-morte",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
  // Preservare Vita e Balsamo della Pace aspettano la primitiva value-input.
  assert.equal(classFeatureRuntimeSupport(feature("chierico-dominio-della-vita-incanalare-divinita-preservare-vita")).ready, false);
});
