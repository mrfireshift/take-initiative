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

const CHANNEL = "paladino-incanalare-divinita-usi";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function paladin(level, subclassId) {
  return [{ classId: "paladino", level, subclassId }];
}

function activate(id, { build, targetIds = ["paladin"], instanceId = `${id}-1` }) {
  const activation = planClassFeatureActivation({
    state: null,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "paladin",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Aldric", build),
  };
}

// Opzioni di Incanalare Divinità dei giuramenti completati nel batch.
const CHANNEL_OPTIONS = [
  "paladino-giuramento-delle-sentinelle-incanalare-divinita-abiurare-creature-extraplanari",
  "paladino-giuramento-delle-sentinelle-incanalare-divinita-volonta-della-sentinella",
  "paladino-giuramento-di-gloria-incanalare-divinita-atleta-impareggiabile",
  "paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice",
  "paladino-giuramento-di-conquista-incanalare-divinita-colpo-guidato",
  "paladino-giuramento-di-conquista-incanalare-divinita-presenza-conquistatrice",
  "paladino-giuramento-di-redenzione-incanalare-divinita-emissario-di-pace",
  "paladino-giuramento-di-redenzione-incanalare-divinita-intimorire-i-violenti",
  "paladino-giuramento-degli-antichi-incanalare-divinita-collera-della-natura",
  "paladino-giuramento-degli-antichi-incanalare-divinita-scacciare-gli-infedeli",
];

const AURAS = {
  "paladino-giuramento-delle-sentinelle-aura-della-sentinella": [3, 9],
  "paladino-giuramento-di-gloria-aura-di-alacrita": [1.5, 4.5],
  "paladino-giuramento-degli-antichi-aura-di-interdizione": [3, 9],
};

const CAPSTONES = [
  "paladino-giuramento-delle-sentinelle-baluardo-dei-mortali",
  "paladino-giuramento-di-gloria-leggenda-vivente",
  "paladino-giuramento-di-conquista-conquistatore-invincibile",
  "paladino-giuramento-degli-antichi-campione-degli-antichi",
];

test("Paladino: il batch implementa 18 capacità dei giuramenti non curati", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "paladino" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 30);
  assert.equal(CHANNEL_OPTIONS.length + Object.keys(AURAS).length + CAPSTONES.length + 1, 18);
  for (const id of CHANNEL_OPTIONS) {
    assert.ok(classFeatureRuntimeSupport(feature(id)).ready, id);
    assert.deepEqual(feature(id).resourceCosts, [{ poolId: CHANNEL, amount: 1 }], id);
  }
  for (const id of CAPSTONES) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.equal(feature(id).duration.rounds, 10, id);
  }
  assert.equal(
    feature("paladino-giuramento-degli-antichi-sentinella-imperitura").runtimeSupport.adapter,
    "resource-only",
  );
});

test("i contenitori di Incanalare Divinità sono carte con il pool tracciato", () => {
  for (const id of [
    "paladino-giuramento-delle-sentinelle-incanalare-divinita",
    "paladino-giuramento-di-gloria-incanalare-divinita",
    "paladino-giuramento-di-conquista-incanalare-divinita",
    "paladino-giuramento-di-redenzione-incanalare-divinita",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
    assert.deepEqual(feature(id).resourceCosts, [], id);
    assert.deepEqual(feature(id).trackedResourcePoolIds, [CHANNEL], id);
  }
});

test("Presenza Conquistatrice spende Incanalare Divinità e spaventa più bersagli", () => {
  const { activation, conditions } = activate(
    "paladino-giuramento-di-conquista-incanalare-divinita-presenza-conquistatrice",
    { build: paladin(3, "paladino-giuramento-di-conquista"), targetIds: ["orc-1", "orc-2", "orc-3"] },
  );
  assert.equal(activation.state.resources[CHANNEL].current, 0);
  assert.deepEqual(conditions.map((entry) => entry.condition), ["Spaventato", "Spaventato", "Spaventato"]);
});

test("Scacciare gli Infedeli termina con il danno; Collera della Natura non ha scadenza", () => {
  const turn = activate("paladino-giuramento-degli-antichi-incanalare-divinita-scacciare-gli-infedeli", {
    build: paladin(3, "paladino-giuramento-degli-antichi"),
    targetIds: ["imp"],
  });
  assert.equal(turn.conditions[0].condition, "Scacciato");
  assert.equal(turn.conditions[0].mechanics.endsOnDamage, true);
  const vines = activate("paladino-giuramento-degli-antichi-incanalare-divinita-collera-della-natura", {
    build: paladin(3, "paladino-giuramento-degli-antichi"),
    targetIds: ["troll"],
    instanceId: "vines-1",
  });
  assert.equal(vines.conditions[0].condition, "Trattenuto");
  assert.equal(vines.activation.instance.expiresRound ?? null, null);
});

test("le aure di 7° livello crescono al 18° e segnano solo gli alleati", () => {
  for (const [id, [radius7, radius18]] of Object.entries(AURAS)) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.adapter, "aura", id);
    const early = classFeatureEffectProjection(value, "", paladin(7, value.subclassId));
    const late = classFeatureEffectProjection(value, "", paladin(18, value.subclassId));
    assert.equal(early.radiusMeters, radius7, id);
    assert.equal(late.radiusMeters, radius18, id);
    assert.equal(early.membershipTargeting.filter, "friendly", id);
  }
  const alacrity = classFeatureEffectProjection(
    feature("paladino-giuramento-di-gloria-aura-di-alacrita"),
    "",
    paladin(7, "paladino-giuramento-di-gloria"),
  );
  assert.equal(alacrity.targetEffect.mechanics.movement.addMeters, 3);
});

test("le capacità non rappresentabili restano carte o aspettano una primitiva", () => {
  for (const id of [
    "paladino-giuramento-di-conquista-aura-di-conquista",
    "paladino-giuramento-di-redenzione-aura-del-guardiano",
    "paladino-giuramento-di-redenzione-emissario-di-redenzione",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
  // Difesa Gloriosa: usi pari al Carisma, primitiva P1.
  assert.equal(classFeatureRuntimeSupport(feature("paladino-giuramento-di-gloria-difesa-gloriosa")).ready, false);
});
