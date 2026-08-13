import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureContextEntries,
  buildClassFeatureQuickActions,
  classFeatureIsReferenceOnly,
  getAvailableClassFeatures,
  getEnabledClassFeatures,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureResourceEntries,
} from "../src/classFeatureCore.js";

const BASE_IDS = [
  "mago-incantesimi",
  "mago-recupero-arcano",
  "mago-tradizione-arcana",
  "mago-aumento-dei-punteggi-di-caratteristica",
  "mago-maestria-negli-incantesimi",
  "mago-incantesimi-personali",
];

const EVOCATION_IDS = [
  "mago-scuola-di-invocazione-invocatore-sapiente",
  "mago-scuola-di-invocazione-plasmare-incantesimi",
  "mago-scuola-di-invocazione-trucchetto-potente",
  "mago-scuola-di-invocazione-invocazione-potente",
  "mago-scuola-di-invocazione-saturazione-magica",
];

const ALL_IDS = [...BASE_IDS, ...EVOCATION_IDS];
const EVOCATION = "mago-scuola-di-invocazione";

function build(level, subclassId = "") {
  return [{ classId: "mago", level, ...(subclassId ? { subclassId } : {}) }];
}

function feature(id) {
  const entry = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(entry, id);
  return entry;
}

test("il Mago di livello 20 con Scuola di Invocazione espone tutte le undici capacità", () => {
  const available = new Set(getAvailableClassFeatures(build(20, EVOCATION)).map((entry) => entry.id));
  assert.deepEqual(
    ALL_IDS.filter((id) => available.has(id)),
    ALL_IDS,
  );

  const baseOnly = new Set(getAvailableClassFeatures(build(20)).map((entry) => entry.id));
  assert.equal(EVOCATION_IDS.some((id) => baseOnly.has(id)), false);

  const levelStages = [
    [1, BASE_IDS.slice(0, 2)],
    [2, [...BASE_IDS.slice(0, 3), ...EVOCATION_IDS.slice(0, 2)]],
    [4, [...BASE_IDS.slice(0, 4), ...EVOCATION_IDS.slice(0, 2)]],
    [6, [...BASE_IDS.slice(0, 4), ...EVOCATION_IDS.slice(0, 3)]],
    [10, [...BASE_IDS.slice(0, 4), ...EVOCATION_IDS.slice(0, 4)]],
    [14, [...BASE_IDS.slice(0, 4), ...EVOCATION_IDS]],
    [18, [...BASE_IDS.slice(0, 5), ...EVOCATION_IDS]],
    [20, ALL_IDS],
  ];
  for (const [level, expected] of levelStages) {
    const ids = new Set(getAvailableClassFeatures(build(level, EVOCATION)).map((entry) => entry.id));
    for (const id of expected) assert.equal(ids.has(id), true, `${level}: ${id}`);
    for (const id of ALL_IDS.filter((id) => !expected.includes(id))) {
      assert.equal(ids.has(id), false, `${level}: ${id}`);
    }
  }
});

test("le undici capacità sono reminder reference-only senza automazione runtime", () => {
  const profile = {
    characterBuild: build(20, EVOCATION),
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ALL_IDS,
  };
  const enabled = new Set(getEnabledClassFeatures(profile).map((entry) => entry.id));
  assert.deepEqual([...enabled].sort(), [...ALL_IDS].sort());

  for (const id of ALL_IDS) {
    const current = feature(id);
    assert.equal(current.defaultEnabled, true, id);
    assert.equal(current.quickActionEligible, false, id);
    assert.equal(current.automationLevel, "riferimento", id);
    assert.equal(current.runtimeSupport.status, "not-automated", id);
    assert.equal(current.runtimeSupport.adapter, null, id);
    assert.equal(current.effectPlan, null, id);
    assert.equal(classFeatureIsReferenceOnly(current), true, id);
    assert.notEqual(current.trackingMode, "active", id);
    assert.notEqual(current.targeting.mode, "single-target", id);
    assert.notEqual(current.targeting.mode, "aura", id);
    assert.equal(current.duration.rounds, null, id);
    assert.deepEqual(
      classFeatureConditionInstancesForActivation(current, {
        instanceId: `${id}-instance`,
        sourceId: "wizard",
        targetIds: ["wizard", "target"],
      }, "Mago", build(20, EVOCATION)),
      [],
      id,
    );
  }

  assert.deepEqual(buildClassFeatureQuickActions(profile), []);
  assert.deepEqual(buildClassFeatureContextEntries(profile, null, 1), []);
});

test("Recupero Arcano conserva il pool condiviso senza trasformarlo in un'azione", () => {
  const recovery = feature("mago-recupero-arcano");
  assert.deepEqual(recovery.trackedResourcePoolIds, ["mago-recupero-arcano-usi"]);
  assert.deepEqual(recovery.resourceCosts, [{ poolId: "mago-recupero-arcano-usi", amount: 1 }]);
  const entries = classFeatureResourceEntries(
    {},
    [recovery],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    build(20),
  );
  assert.deepEqual(entries.map((entry) => entry.pool.id), ["mago-recupero-arcano-usi"]);
  assert.deepEqual(entries[0].refreshEvents, ["riposo_lungo"]);
  assert.deepEqual(buildClassFeatureQuickActions({
    characterBuild: build(20),
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [recovery.id],
  }), []);
});

test("i reminder conservano i trigger e i limiti distintivi del testo PHB", () => {
  const expected = {
    "mago-incantesimi": [/libro degli incantesimi/i, /riposo lungo/i, /rituale/i, /focus arcano/i],
    "mago-recupero-arcano": [/riposo breve/i, /una volta al giorno/i, /metà/i, /6° livello/i],
    "mago-tradizione-arcana": [/scuol/i, /2° livello/i, /6°/i, /10°/i, /14°/i],
    "mago-aumento-dei-punteggi-di-caratteristica": [/aumentare di 2/i, /aumentare di 1/i, /20/i],
    "mago-maestria-negli-incantesimi": [/1° livello/i, /2° livello/i, /senza spendere uno slot/i, /8 ore/i],
    "mago-incantesimi-personali": [/due incantesimi/i, /3° livello/i, /sempre preparati/i, /riposo breve o lungo/i],
    "mago-scuola-di-invocazione-invocatore-sapiente": [/copiare/i, /incantesimo di evocazione/i, /dimezzato/i],
    "mago-scuola-di-invocazione-plasmare-incantesimi": [/incantesimo di invocazione/i, /altre creature che puoi vedere/i, /1 \+ il livello/i, /superano automaticamente/i, /metà danni/i],
    "mago-scuola-di-invocazione-trucchetto-potente": [/trucchetti dannosi/i, /supera un tiro salvezza/i, /metà dei danni/i, /ulteriori effetti/i],
    "mago-scuola-di-invocazione-invocazione-potente": [/modificatore di intelligenza/i, /singolo tiro di danno/i],
    "mago-scuola-di-invocazione-saturazione-magica": [/1° e il 5°/i, /massimo dei danni/i, /prima volta/i, /2d12/i, /riposo lungo/i],
  };
  for (const [id, patterns] of Object.entries(expected)) {
    const description = feature(id).description;
    for (const pattern of patterns) assert.match(description, pattern, id);
  }
});
