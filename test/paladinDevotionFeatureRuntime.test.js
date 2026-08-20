import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { ID } from "../src/constants.js";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureIsReferenceOnly,
  getAdditionalSubclassSpellEntries,
  getAvailableClassFeatures,
} from "../src/classFeatureCatalog.js";
import {
  CLASS_FEATURE_AURA_META_KEY,
  classFeatureAuraMembershipPlan,
  classFeatureAuraTargetIds,
  collectActiveClassFeatureAuras,
} from "../src/classFeatureAuraCore.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureTargeting,
  planClassFeatureActivation,
  purifyingSpellSelectionOptions,
  resolvePurifyingSpellChoice,
} from "../src/classFeatureCore.js";
import { planClassFeatureAuraReminder } from "../src/classFeatureAuraReminderCore.js";
import { resolveDamageEndsConditionRemovals } from "../src/hpConditionRulesCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const META_KEY = `${ID}/meta`;
const DEVOTION_SUBCLASS = "paladino-giuramento-di-devozione";
const CHANNEL_POOL = "paladino-incanalare-divinita-usi";
const SACRED_CLOUD_POOL = "paladino-giuramento-di-devozione-nube-sacra-usi";
const DEVOTION_IDS = [
  "paladino-giuramento-di-devozione-incanalare-divinita-arma-consacrata",
  "paladino-giuramento-di-devozione-incanalare-divinita-scacciare-i-sacrileghi",
  "paladino-giuramento-di-devozione-aura-di-devozione",
  "paladino-giuramento-di-devozione-purezza-di-spirito",
  "paladino-giuramento-di-devozione-nube-sacra",
];
const SACRED_WEAPON = DEVOTION_IDS[0];
const TURN_CREATURES = DEVOTION_IDS[1];
const DEVOTION_AURA = DEVOTION_IDS[2];
const PURITY = DEVOTION_IDS[3];
const SACRED_CLOUD = DEVOTION_IDS[4];

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function devotionBuild(level, subclassId = DEVOTION_SUBCLASS) {
  return [{ classId: "paladino", level, subclassId }];
}

function activate(value, {
  level = 20,
  state = null,
  targetIds = ["paladin"],
  instanceId = `${value.id}-instance`,
} = {}) {
  return planClassFeatureActivation({
    state,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: devotionBuild(level),
    sourceId: "paladin",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId,
  });
}

function token(id, attitude) {
  return {
    id,
    name: id,
    metadata: {
      [META_KEY]: {
        attitude,
        conditions: { instances: [] },
      },
    },
  };
}

function auraFixture(value, level) {
  const activation = activate(value, { level });
  assert.equal(activation.ok, true);
  const items = [
    token("paladin", "pc"),
    token("ally", "ally"),
    token("neutral", "neutral"),
    token("enemy", "enemy"),
  ];
  items[0].metadata[META_KEY].classFeatureState = activation.state;
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    currentRound: 1,
    characterBuildBySourceId: new Map([[
      "paladin",
      devotionBuild(level),
    ]]),
  });
  const area = buildCircleArea(
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    1,
    { x: 0, y: 0 },
  );
  const candidates = items.map((item, index) => ({
    item,
    bounds: {
      min: { x: index + 1, y: 0 },
      max: { x: index + 2, y: 1 },
    },
  }));
  return { activation, area, aura, candidates, items };
}

test("Giuramento di Devozione espone esattamente cinque privilegi ai livelli corretti e filtra gli altri giuramenti", () => {
  const available = getAvailableClassFeatures(devotionBuild(20))
    .filter((entry) => entry.subclassId === DEVOTION_SUBCLASS);
  assert.deepEqual(available.map((entry) => entry.id), DEVOTION_IDS);
  assert.deepEqual(available.map((entry) => entry.minimumLevel), [3, 3, 7, 15, 20]);

  const otherOath = getAvailableClassFeatures(
    devotionBuild(20, "paladino-giuramento-di-vendetta"),
  );
  assert.equal(otherOath.some((entry) => DEVOTION_IDS.includes(entry.id)), false);
});

test("i dieci incantesimi di Devozione risolvono nel catalogo comune e Vendetta resta invariata", () => {
  const devotionSpells = getAdditionalSubclassSpellEntries({
    characterBuild: devotionBuild(20),
  }, "paladino");
  assert.equal(devotionSpells.subclass.name, "Giuramento di Devozione");
  assert.equal(devotionSpells.entries.length, 10);
  assert.equal(devotionSpells.entries.every((entry) => getSpellDefinition(entry.name)), true);

  const vendettaSpells = getAdditionalSubclassSpellEntries({
    characterBuild: devotionBuild(20, "paladino-giuramento-di-vendetta"),
  }, "paladino");
  assert.equal(vendettaSpells.subclass.name, "Giuramento di Vendetta");
  assert.deepEqual(vendettaSpells.entries, [
    { level: 3, name: "Anatema" },
    { level: 3, name: "Marchio del Cacciatore" },
    { level: 5, name: "Blocca Persone" },
    { level: 5, name: "Passo Velato" },
    { level: 9, name: "Velocità" },
    { level: 9, name: "Protezione dall\u2019Energia" },
    { level: 13, name: "Esilio" },
    { level: 13, name: "Porta Dimensionale" },
    { level: 17, name: "Blocca Mostri" },
    { level: 17, name: "Scrutare" },
  ]);
});

test("Arma Consacrata è self, dura dieci round e consuma un solo Incanalare Divinità senza automazioni collaterali", () => {
  const value = feature(SACRED_WEAPON);
  assert.deepEqual(value.targeting, {
    mode: "self",
    rangeMeters: null,
    maxTargets: 1,
    excludeSource: false,
  });
  assert.equal(value.duration.rounds, 10);
  assert.deepEqual(value.resourceCosts, [{ poolId: CHANNEL_POOL, amount: 1 }]);
  assert.equal(value.effectPlan.mechanics, undefined);
  assert.equal(value.effectPlan.targetEffect, undefined);
  assert.equal(value.effectPlan.temporaryHp, undefined);

  const result = activate(value, {
    level: 3,
    state: { resources: { [CHANNEL_POOL]: { current: 1, maximum: 1 } } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.resources[CHANNEL_POOL].current, 0);
  assert.equal(result.instance.expiresRound, 10);
  const [pill] = classFeatureConditionInstancesForActivation(
    value,
    result.instance,
    "Paladino",
    devotionBuild(3),
  );
  assert.equal(pill.condition, "Arma Consacrata");
  assert.equal(pill.targetId, "paladin");
});

test("Scacciare i Sacrileghi usa turn-creatures, richiede esiti manuali e marca soltanto i fallimenti", () => {
  const value = feature(TURN_CREATURES);
  assert.equal(value.runtimeSupport.adapter, "turn-creatures");
  assert.equal(value.targetRemovalMode, "single");
  assert.deepEqual(value.targeting, {
    mode: "single-target",
    rangeMeters: 9,
    maxTargets: null,
    excludeSource: true,
  });
  assert.equal(value.quickActionEligible, false);
  assert.equal(value.effectPlan.conditionName, "Scacciato");
  assert.match(value.effectPlan.detail, /fallito|falliti/iu);
  assert.equal(value.effectPlan.targetEffect.effectKind, "debuff");

  const initial = {
    resources: { [CHANNEL_POOL]: { current: 1, maximum: 1 } },
  };
  const failed = activate(value, {
    level: 3,
    state: initial,
    targetIds: ["enemy-a", "enemy-b"],
    instanceId: "turn-creatures-failed",
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.state.resources[CHANNEL_POOL].current, 0);
  const pills = classFeatureConditionInstancesForActivation(
    value,
    failed.instance,
    "Paladino",
    devotionBuild(3),
  );
  assert.deepEqual(pills.map((pill) => pill.targetId), ["enemy-a", "enemy-b"]);
  assert.equal(pills.every((pill) => pill.condition === "Scacciato"), true);
  assert.equal(pills.every((pill) => pill.expiry.remaining === 10), true);

  const noFailureValue = {
    ...value,
    targeting: { mode: "self", maxTargets: 1, excludeSource: false },
    trackingMode: "instant",
    effectPlan: { kind: "none" },
  };
  const noFailure = activate(noFailureValue, {
    level: 3,
    state: initial,
    instanceId: "turn-creatures-none",
  });
  assert.equal(noFailure.ok, true);
  assert.equal(noFailure.state.resources[CHANNEL_POOL].current, 0);
  assert.deepEqual(noFailure.state.instances, []);
  assert.equal(classFeatureEffectProjection(noFailureValue).kind, "none");
});

test("Aura di Devozione scala da 3 a 9 metri, include il Paladino e gli alleati e non crea una pill sulla card", () => {
  const value = feature(DEVOTION_AURA);
  assert.equal(classFeatureTargeting(value, devotionBuild(7)).rangeMeters, 3);
  assert.equal(classFeatureTargeting(value, devotionBuild(17)).rangeMeters, 3);
  assert.equal(classFeatureTargeting(value, devotionBuild(18)).rangeMeters, 9);
  assert.equal(value.suppressSourceCardPill, true);
  assert.deepEqual(value.effectPlan.targetEffect.targeting, {
    filter: "friendly",
    includeCaster: true,
  });

  const fixture = auraFixture(value, 7);
  assert.equal(fixture.aura.radiusMeters, 3);
  assert.equal(fixture.aura.targetEffect.label, "Immunità ad Affascinato");
  assert.deepEqual(
    classFeatureConditionInstancesForActivation(
      value,
      fixture.activation.instance,
      "Paladino",
      devotionBuild(7),
    ),
    [],
  );
  const desired = classFeatureAuraTargetIds({
    aura: fixture.aura,
    area: fixture.area,
    candidates: fixture.candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(desired, ["paladin", "ally"]);
  const membership = classFeatureAuraMembershipPlan({
    aura: fixture.aura,
    desiredTargetIds: desired,
    items: fixture.items,
    metaKey: META_KEY,
  });
  const addition = membership.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual(addition.targetIds, ["paladin", "ally"]);
  assert.equal(addition.conditionName, "Immunità ad Affascinato");
});

test("Purezza di Spirito resta un riferimento passivo senza effetto, durata o risorse", () => {
  const value = feature(PURITY);
  assert.equal(value.runtimeSupport.status, "not-automated");
  assert.equal(value.automationLevel, "riferimento");
  assert.equal(value.effectPlan, null);
  assert.equal(value.duration.rounds, null);
  assert.deepEqual(value.resourceCosts, []);
  assert.equal(value.quickActionEligible, false);
  assert.equal(classFeatureIsReferenceOnly(value), true);
  assert.equal(JSON.stringify(value).includes("spellSlots"), false);
});

test("Nube Sacra usa una sola risorsa a riposo lungo, un'aura ostile da 9 metri e un reminder informativo senza HP", () => {
  const value = feature(SACRED_CLOUD);
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(SACRED_CLOUD_POOL);
  assert.ok(pool);
  assert.equal(pool.capacity.type, "fixed");
  assert.equal(pool.capacity.value, 1);
  assert.deepEqual(pool.refresh, [{ event: "riposo_lungo", amount: "massimo" }]);
  assert.deepEqual(value.resourceCosts, [{ poolId: SACRED_CLOUD_POOL, amount: 1 }]);
  assert.equal(classFeatureTargeting(value, devotionBuild(20)).rangeMeters, 9);
  assert.equal(value.duration.rounds, 10);
  assert.equal(value.effectPlan.radiusMeters, 9);
  assert.deepEqual(value.effectPlan.targetEffect.targeting, {
    filter: "hostile",
    includeCaster: false,
  });
  assert.deepEqual(value.effectPlan.triggerPolicy.triggers[0], {
    id: "nube-sacra-danni-inizio-turno",
    event: "turn-start",
    targetMode: "actor",
    frequency: "once-per-turn",
    resolution: "informational",
    label: "Nube Sacra: questa creatura nemica subisce 10 danni radianti. Applicali manualmente con il controllo HP.",
  });

  const fixture = auraFixture(value, 20);
  const desired = classFeatureAuraTargetIds({
    aura: fixture.aura,
    area: fixture.area,
    candidates: fixture.candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(desired, ["neutral", "enemy"]);
  const before = structuredClone(fixture.items);
  const initial = planClassFeatureAuraReminder({
    aura: fixture.aura,
    desiredTargetIds: desired,
    initiativeState: { order: ["paladin", "enemy"], current: 0, round: 1 },
    itemsById: new Map(fixture.items.map((item) => [item.id, item])),
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  const turnStart = planClassFeatureAuraReminder({
    aura: fixture.aura,
    auraItem: {
      id: "sacred-cloud-aura",
      metadata: {
        [CLASS_FEATURE_AURA_META_KEY]: {
          triggerRuntime: initial.runtime,
        },
      },
    },
    desiredTargetIds: desired,
    initiativeState: { order: ["paladin", "enemy"], current: 1, round: 1 },
    itemsById: new Map(fixture.items.map((item) => [item.id, item])),
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });
  assert.equal(turnStart.notices.length, 1);
  assert.equal(turnStart.notices[0].label, value.effectPlan.triggerPolicy.triggers[0].label);
  assert.equal(turnStart.newActivations[0].resolution, "informational");
  assert.deepEqual(fixture.items, before);
});

test("le capacità di Devozione attivabili hanno emoji calzanti e nessuna traccia di spell slot", () => {
  const values = DEVOTION_IDS.map(feature);
  const implemented = values.filter((value) => value.runtimeSupport.status === "implemented");
  assert.equal(implemented.every((value) => value.theme?.emoji), true);
  assert.equal(new Set(values.map((value) => value.theme?.emoji)).size, values.length);
  assert.equal(values.every((value) => value.resourceCosts.every((cost) => !cost.poolId.includes("slot"))), true);
});

test("il catalogo include le cinque capacità di Devozione e i quattro privilegi implementati incrementano i conteggi derivati", () => {
  assert.equal(DEVOTION_IDS.every((id) => CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === id)), true);
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeImplemented, 59);
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeNotAutomated, 492);
});

test("Abiurare Nemico espone due esiti (TS fallito e TS superato) con movement ed endsOnDamage differenziati", () => {
  const abjure = feature("paladino-giuramento-di-vendetta-incanalare-divinita-abiurare-nemico");
  assert.equal(abjure.runtimeSupport.adapter, "condition");
  assert.equal(abjure.resourceCosts[0].poolId, "paladino-incanalare-divinita-usi");
  assert.ok(Array.isArray(abjure.choiceOptions), "Abiurare Nemico must expose choiceOptions for TS outcomes");
  assert.equal(abjure.choiceOptions.length, 2);
  assert.equal(abjure.choiceOptions[0].id, "failed");
  assert.equal(abjure.choiceOptions[1].id, "succeeded");

  // Outcome 1: TS fallito
  const actFail = planClassFeatureActivation({
    state: null,
    feature: abjure,
    choiceId: "failed",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 5, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin",
    targetIds: ["enemy-1"],
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId: "abjure-instance-fail",
  });
  assert.equal(actFail.ok, true);
  assert.equal(actFail.state.resources["paladino-incanalare-divinita-usi"].current, 0);

  const condsFail = classFeatureConditionInstancesForActivation(
    abjure,
    actFail.instance,
    "Paladin",
    [{ classId: "paladino", level: 5, subclassId: "paladino-giuramento-di-vendetta" }],
  );
  assert.equal(condsFail.length, 1);
  assert.equal(condsFail[0].condition, "Spaventato");
  assert.equal(condsFail[0].displayLabel, "Spaventato · Velocità 0");
  assert.equal(condsFail[0].targetId, "enemy-1");
  assert.equal(condsFail[0].mechanics?.endsOnDamage, true);
  assert.equal(condsFail[0].mechanics?.movement?.setMeters, 0);

  // Movement test FAIL: Speed = 0
  const moveFail = resolveMovementProfile(9, condsFail);
  assert.equal(moveFail.speedMeters, 0);
  const moveFailWithBonus = resolveMovementProfile(9, condsFail, ["longstrider"]);
  assert.equal(moveFailWithBonus.speedMeters, 0, "No speed bonus should bypass setMeters: 0");

  // Outcome 2: TS superato
  const actSucc = planClassFeatureActivation({
    state: null,
    feature: abjure,
    choiceId: "succeeded",
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 5, subclassId: "paladino-giuramento-di-vendetta" }],
    sourceId: "paladin",
    targetIds: ["enemy-1"],
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId: "abjure-instance-succ",
  });
  assert.equal(actSucc.ok, true);
  assert.equal(actSucc.state.resources["paladino-incanalare-divinita-usi"].current, 0);

  const condsSucc = classFeatureConditionInstancesForActivation(
    abjure,
    actSucc.instance,
    "Paladin",
    [{ classId: "paladino", level: 5, subclassId: "paladino-giuramento-di-vendetta" }],
  );
  assert.equal(condsSucc.length, 1);
  assert.equal(condsSucc[0].condition, "Velocità dimezzata");
  assert.equal(condsSucc[0].displayLabel, "Velocità dimezzata");
  assert.equal(condsSucc[0].targetId, "enemy-1");
  assert.equal(condsSucc[0].mechanics?.endsOnDamage, true);
  assert.equal(condsSucc[0].mechanics?.movement?.multiplier, 0.5);

  // Movement test SUCCESS: Speed = 4.5
  const moveSucc = resolveMovementProfile(9, condsSucc);
  assert.equal(moveSucc.speedMeters, 4.5);

  // Both outcomes terminate on damage
  assert.deepEqual(resolveDamageEndsConditionRemovals(condsFail), [condsFail[0].id]);
  assert.deepEqual(resolveDamageEndsConditionRemovals(condsSucc), [condsSucc[0].id]);
});

test("Percezione del Divino consuma la risorsa senza creare condizioni o pill", () => {
  const divineSense = feature("paladino-percezione-del-divino");
  assert.equal(divineSense.runtimeSupport.adapter, "resource-only");
  assert.equal(divineSense.automationLevel, "tracciamento");
  assert.equal(divineSense.resourceCosts[0].poolId, "paladino-percezione-divino-usi");
  assert.equal(divineSense.effectPlan, null);

  const activation = planClassFeatureActivation({
    state: null,
    feature: divineSense,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 3 }],
    sourceId: "paladin",
    targetIds: ["paladin"],
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId: "divine-sense-instance",
  });
  assert.equal(activation.ok, true);
  assert.ok(activation.state.resources["paladino-percezione-divino-usi"]);

  const conditions = classFeatureConditionInstancesForActivation(
    divineSense,
    activation.instance,
    "Paladin",
    [{ classId: "paladino", level: 3 }],
  );
  assert.equal(conditions.length, 0);
});

test("Tocco Purificatore dichiara adapter purifying-touch e consuma il pool corretto", () => {
  const purifyingTouch = feature("paladino-tocco-purificatore");
  assert.equal(purifyingTouch.runtimeSupport.adapter, "purifying-touch");
  assert.equal(purifyingTouch.resourceCosts[0].poolId, "paladino-tocco-purificatore-usi");

  const activation = planClassFeatureActivation({
    state: null,
    feature: purifyingTouch,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "paladino", level: 14 }],
    sourceId: "paladin",
    targetIds: ["ally"],
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId: "purify-instance",
  });
  assert.equal(activation.ok, true);
  assert.ok(activation.state.resources["paladino-tocco-purificatore-usi"]);
});

test("CF-B01D: Tocco Purificatore 0 / 1 / 2+ selection model and modal contract (Tests 1-7)", () => {
  const spellsZero = [];
  const spellsOne = [
    {
      instanceId: "inst-spell-1",
      name: "Benedizione",
      casterName: "Anyanca",
      conc: true,
    },
  ];
  const spellsTwo = [
    {
      instanceId: "inst-spell-fast",
      name: "Passo veloce",
      casterName: "Anyanca",
      conc: false,
    },
    {
      instanceId: "inst-spell-mage-armor",
      name: "Armatura magica",
      casterName: "Anyanca",
      conc: false,
    },
  ];

  // TEST 1: 0 effects -> options empty, error / no modal opened
  const optsZero = purifyingSpellSelectionOptions(spellsZero);
  assert.equal(optsZero.length, 0);

  // TEST 2: 1 effect -> options has 1, direct bypass resolves instanceId
  const optsOne = purifyingSpellSelectionOptions(spellsOne);
  assert.equal(optsOne.length, 1);
  const choiceOne = resolvePurifyingSpellChoice(spellsOne);
  assert.equal(choiceOne?.instanceId, "inst-spell-1");
  assert.equal(choiceOne?.name, "Benedizione");

  // TEST 3: 2+ effects -> options has 2 readable items
  const optsTwo = purifyingSpellSelectionOptions(spellsTwo);
  assert.equal(optsTwo.length, 2);
  assert.equal(optsTwo[0].name, "Passo veloce");
  assert.equal(optsTwo[1].name, "Armatura magica");

  // TEST 4: Human labels and subtitles, NO leaked UUIDs/instanceIds in human fields
  for (const opt of optsTwo) {
    assert.ok(opt.label, "Must have readable label");
    assert.ok(!opt.label.includes("inst-"), "Label must not contain raw instance ID");
    assert.ok(!opt.subtitle.includes("inst-"), "Subtitle must not contain raw instance ID");
    assert.equal(opt.subtitle, "Lanciato da Anyanca");
  }

  // TEST 5: Select second option -> returns second instanceId
  const choiceSecond = resolvePurifyingSpellChoice(spellsTwo, "inst-spell-mage-armor");
  assert.equal(choiceSecond?.instanceId, "inst-spell-mage-armor");
  assert.equal(choiceSecond?.name, "Armatura magica");

  // TEST 6: Selection by name
  const choiceByName = resolvePurifyingSpellChoice(spellsTwo, "Passo veloce");
  assert.equal(choiceByName?.instanceId, "inst-spell-fast");

  // TEST 7: Source code verification: choosePurifyingSpell does NOT use window.prompt
  const modalJs = fs.readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8");
  const choosePurifyingSpellCode = modalJs.slice(
    modalJs.indexOf("function showPurifyingSpellSelectionModal"),
    modalJs.indexOf("async function launchSpecialClassFeature"),
  );
  assert.ok(!choosePurifyingSpellCode.includes("window.prompt"), "Purifying Touch workflow must not use window.prompt");
  assert.ok(!choosePurifyingSpellCode.includes("prompt("), "Purifying Touch workflow must not use prompt()");
  assert.ok(choosePurifyingSpellCode.includes("showPurifyingSpellSelectionModal"), "Purifying Touch must use custom modal overlay");
});
