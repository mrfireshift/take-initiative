import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureQuickActions,
  classFeatureIsReferenceOnly,
  getAvailableClassFeatures,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureResourceEntries,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";

const mechanics = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/tasha_livello_meccanico_v1_0.json", import.meta.url),
  "utf8",
)).mechanics;

const ELOQUENCE = "bardo-collegio-dell-eloquenza";
const BASE_INSPIRATION = "bardo-ispirazione-bardica";
const INSPIRATION_POOL = "bardo-ispirazione-bardica-usi";
const CONTAGIOUS_POOL = "bardo-collegio-dell-eloquenza-ispirazione-contagiosa-usi";

const bardoBuild = (level, subclassId = ELOQUENCE) => [{
  classId: "bardo",
  level,
  subclassId,
}];

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function mechanic(id) {
  const value = mechanics.find((entry) => entry.id === id);
  assert.ok(value, id);
  return value;
}

test("il catalogo dell'Eloquenza applica livelli, gating e superfici corrette", () => {
  const ids = [
    "bardo-collegio-dell-eloquenza-arte-oratoria",
    "bardo-collegio-dell-eloquenza-parole-inquietanti",
    "bardo-collegio-dell-eloquenza-ispirazione-infallibile",
    "bardo-collegio-dell-eloquenza-linguaggio-universale",
    "bardo-collegio-dell-eloquenza-ispirazione-contagiosa",
  ];
  const levels = [3, 3, 6, 6, 14];
  for (const [index, id] of ids.entries()) {
    const current = feature(id);
    assert.equal(current.subclassId, ELOQUENCE, id);
    assert.equal(current.minimumLevel, levels[index], id);
    assert.equal(current.defaultEnabled, true, id);
    assert.equal(current.quickActionEligible, false, id);
  }

  assert.equal(getAvailableClassFeatures(bardoBuild(2)).some((entry) => entry.subclassId === ELOQUENCE), false);
  assert.equal(getAvailableClassFeatures(bardoBuild(13)).some((entry) => entry.id.endsWith("ispirazione-contagiosa")), false);
  assert.equal(getAvailableClassFeatures(bardoBuild(14, "bardo-collegio-della-sapienza"))
    .some((entry) => entry.subclassId === ELOQUENCE), false);

  for (const id of [ids[0], ids[2]]) {
    const current = feature(id);
    assert.equal(classFeatureIsReferenceOnly(current), true, id);
    assert.equal(current.effectPlan, null, id);
  }
  for (const id of ids.slice(1, 2).concat(ids.slice(3))) {
    assert.equal(feature(id).runtimeSupport.status, "implemented", id);
  }

  const quickActions = new Set(buildClassFeatureQuickActions({
    characterBuild: bardoBuild(20),
    classFeaturesConfigured: false,
  }).map((entry) => entry.featureId));
  assert.equal(ids.some((id) => quickActions.has(id)), false);
  assert.equal(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === BASE_INSPIRATION), true);
});

test("i record meccanici Eloquenza conservano trigger, visibilità, durata e pool", () => {
  const arte = mechanic("bardo-collegio-dell-eloquenza-arte-oratoria");
  assert.equal(arte.automation_level, "riferimento");
  assert.equal(arte.activation.primary, "passiva");
  assert.deepEqual(arte.triggers_detected, ["prova_persuasione", "prova_inganno"]);

  const unsettling = mechanic("bardo-collegio-dell-eloquenza-parole-inquietanti");
  assert.equal(unsettling.targets.type, "creatura");
  assert.deepEqual(unsettling.targets.range_meters_detected, [18]);
  assert.equal(unsettling.targets.requirements.includes("visibile_al_bardo"), true);
  assert.deepEqual(unsettling.duration.end_conditions, [
    "prossimo_tiro_salvezza",
    "inizio_prossimo_turno_bardo",
  ]);
  assert.equal(unsettling.resource_costs[0].pool_id, INSPIRATION_POOL);

  const universal = mechanic("bardo-collegio-dell-eloquenza-linguaggio-universale");
  assert.equal(universal.targets.type, "creature_multiple");
  assert.equal(universal.targets.requirements.includes("visibile_al_bardo"), true);
  assert.equal(universal.targets.requirements.includes("max(1, modificatore_carisma)"), true);
  assert.deepEqual([universal.duration.value, universal.duration.unit], [1, "ora"]);

  const contagious = mechanic("bardo-collegio-dell-eloquenza-ispirazione-contagiosa");
  assert.equal(contagious.activation.primary, "reazione");
  assert.equal(contagious.targets.type, "creatura_diversa_da_se");
  assert.equal(contagious.targets.requirements.includes("puo_sentire_il_bardo"), true);
  assert.equal(contagious.resource_costs[0].pool_id, CONTAGIOUS_POOL);
  assert.equal(contagious.effects[0].die_from.progression_field, "dado_ispirazione_bardica");
});

test("il dado di Ispirazione resta quello del pool Bardo e scala ai livelli 3/5/10/15", () => {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(INSPIRATION_POOL);
  const expected = new Map([[3, "d6"], [5, "d8"], [10, "d10"], [15, "d12"]]);
  for (const [level, die] of expected) {
    const [entry] = classFeatureResourceEntries(
      null,
      [{ resourceCosts: [{ poolId: INSPIRATION_POOL, amount: 1 }] }],
      CLASS_FEATURE_RESOURCE_POOL_BY_ID,
      bardoBuild(level),
    );
    assert.equal(entry.die, die, `livello ${level}`);
  }
  assert.equal(pool.capacity.expression, "max(1, modificatore_carisma)");
});

test("Parole Inquietanti conserva value-N, consuma il pool e scade al prossimo turno", () => {
  const base = feature("bardo-collegio-dell-eloquenza-parole-inquietanti");
  const value = 8;
  const prepared = {
    ...base,
    effectPlan: {
      ...base.effectPlan,
      conditionName: `Parole Inquietanti −${value}`,
      detail: `Il bersaglio sottrae ${value} al prossimo tiro salvezza.`,
      targetEffect: {
        ...base.effectPlan.targetEffect,
        conditionName: `Parole Inquietanti −${value}`,
        detail: `Il bersaglio sottrae ${value} al prossimo tiro salvezza.`,
        effectKind: "debuff",
      },
    },
  };
  const activation = planClassFeatureActivation({
    state: { resources: { [INSPIRATION_POOL]: { current: 2, maximum: 5 } } },
    feature: prepared,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(5),
    sourceId: "bard",
    targetIds: ["target"],
    currentRound: 12,
    currentTurnKey: "12:bard",
    instanceId: "unsettling-1",
    choiceId: `value-${value}`,
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.choiceId, "value-8");
  assert.equal(activation.state.resources[INSPIRATION_POOL].current, 1);

  const [pill] = classFeatureConditionInstancesForActivation(
    prepared,
    activation.instance,
    "Bardo",
    bardoBuild(5),
  );
  assert.equal(pill.condition, "Parole Inquietanti −8");
  assert.match(pill.effectDetail, /8/);
  assert.deepEqual(pill.expiry, {
    mode: "turn-start",
    actor: "source",
    actorId: "bard",
    remaining: 1,
    anchor: "next-turn",
  });
});

test("Linguaggio Universale consuma il pool giornaliero oppure crea 600 round senza slot metadata", () => {
  const base = feature("bardo-collegio-dell-eloquenza-linguaggio-universale");
  const daily = planClassFeatureActivation({
    state: { resources: {
      [base.resourceCosts[0].poolId]: { current: 1, maximum: 1 },
    } },
    feature: base,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(6),
    sourceId: "bard",
    targetIds: ["bard", "ally-a", "ally-b"],
    currentRound: 4,
    instanceId: "universal-daily",
    choiceId: "daily",
  });
  assert.equal(daily.ok, true);
  assert.equal(daily.state.resources[base.resourceCosts[0].poolId].current, 0);
  assert.equal(daily.instance.expiresRound, 603);
  assert.equal(classFeatureConditionInstancesForActivation(
    base,
    daily.instance,
    "Bardo",
    bardoBuild(6),
  ).length, 3);

  const slotFeature = { ...base, resourceCosts: [] };
  const slot = planClassFeatureActivation({
    state: { resources: {
      [base.resourceCosts[0].poolId]: { current: 0, maximum: 1 },
    } },
    feature: slotFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(6),
    sourceId: "bard",
    targetIds: ["ally-c"],
    currentRound: 4,
    instanceId: "universal-slot",
    choiceId: "slot",
  });
  assert.equal(slot.ok, true);
  assert.equal(slot.state.resources[base.resourceCosts[0].poolId].current, 0);
  const [pill] = classFeatureConditionInstancesForActivation(
    slotFeature,
    slot.instance,
    "Bardo",
    bardoBuild(6),
  );
  assert.equal(pill.expiry.mode, "rounds");
  assert.equal(pill.expiry.remaining, 600);
  assert.match(pill.effectDetail, /unidirezionale/i);
});

test("Ispirazione Contagiosa riusa identità, dado, stacking e lifecycle dell'Ispirazione base", () => {
  const contagious = feature("bardo-collegio-dell-eloquenza-ispirazione-contagiosa");
  const projection = classFeatureEffectProjection(contagious, "", bardoBuild(14));
  assert.equal(projection.conditionEffectId, BASE_INSPIRATION);
  assert.equal(contagious.stacking.sameEffectMaxInstancesPerTarget, 1);

  const activation = planClassFeatureActivation({
    state: { resources: {
      [INSPIRATION_POOL]: { current: 4, maximum: 4 },
      [CONTAGIOUS_POOL]: { current: 2, maximum: 2 },
    } },
    feature: contagious,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: bardoBuild(14),
    sourceId: "bard",
    targetIds: ["ally"],
    currentRound: 9,
    currentTurnKey: "9:bard",
    instanceId: "contagious-1",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.state.resources[CONTAGIOUS_POOL].current, 1);
  assert.equal(activation.state.resources[INSPIRATION_POOL].current, 4);

  const [pill] = classFeatureConditionInstancesForActivation(
    contagious,
    activation.instance,
    "Bardo",
    bardoBuild(14),
  );
  assert.equal(pill.condition, "Ispirazione Bardica");
  assert.equal(pill.effectId, BASE_INSPIRATION);
  assert.equal(pill.parentEffectId, "contagious-1");
  assert.deepEqual(pill.expiry, { mode: "rounds", remaining: 100 });

  const infallibleDetail = "Ispirazione Bardica d6/d8/d10/d12: usa dopo il d20 e prima dell'esito su prova, attacco o TS. Se il tiro fallisce, conserva il dado; rimuovi la pill soltanto quando il dado è consumato con successo o scade.";
  const [infalliblePill] = classFeatureConditionInstancesForActivation(
    {
      ...feature(BASE_INSPIRATION),
      effectPlan: { ...feature(BASE_INSPIRATION).effectPlan, detail: infallibleDetail },
    },
    activation.instance,
    "Bardo",
    bardoBuild(14),
  );
  assert.match(infalliblePill.effectDetail, /conserva il dado/i);
});
