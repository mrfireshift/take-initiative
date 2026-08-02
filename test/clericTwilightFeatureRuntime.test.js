import test from "node:test";
import assert from "node:assert/strict";

import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { ID } from "../src/constants.js";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureQuickActions,
  classFeatureIsReferenceOnly,
  getAdditionalSubclassSpellEntries,
  getAvailableClassFeatures,
  orderClassFeaturesByParent,
} from "../src/classFeatureCatalog.js";
import {
  CLASS_FEATURE_AREA_EFFECT_TYPE,
  classFeatureAuraMembershipPlan,
  classFeatureAuraTargetIds,
  collectActiveClassFeatureAuras,
} from "../src/classFeatureAuraCore.js";
import { CLASS_FEATURE_AURA_META_KEY } from "../src/classFeatureAuraCore.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureResourceEntries,
  planClassFeatureActivation,
  resolveClassFeatureResourceMaximum,
} from "../src/classFeatureCore.js";
import { planClassFeatureAuraReminder } from "../src/classFeatureAuraReminderCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const META_KEY = ID + "/meta";
const TWILIGHT_SUBCLASS = "chierico-dominio-del-crepuscolo";
const TURN_UNDEAD = "chierico-incanalare-divinita-scacciare-non-morti";
const NIGHT_EYES = "chierico-dominio-del-crepuscolo-occhi-della-notte";
const VIGILANT_BLESSING = "chierico-dominio-del-crepuscolo-benedizione-vigile";
const SANCTUARY = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";
const STEPS = "chierico-dominio-del-crepuscolo-passi-nella-notte";
const CHANNEL_POOL = "chierico-incanalare-divinita-usi";
const STEPS_POOL = "chierico-dominio-del-crepuscolo-passi-nella-notte-usi";

const BASE_IDS = [
  "chierico-dominio-divino",
  "chierico-incantesimi",
  "chierico-incanalare-divinita",
  TURN_UNDEAD,
  "chierico-aumento-dei-punteggi-di-caratteristica",
  "chierico-distruggere-non-morti",
  "chierico-intervento-divino",
];

const TWILIGHT_IDS = [
  "chierico-dominio-del-crepuscolo-competenze-bonus",
  NIGHT_EYES,
  VIGILANT_BLESSING,
  SANCTUARY,
  STEPS,
  "chierico-dominio-del-crepuscolo-colpo-divino",
  "chierico-dominio-del-crepuscolo-sudario-del-crepuscolo",
];

const REFERENCE_IDS = [
  "chierico-dominio-divino",
  "chierico-incantesimi",
  "chierico-incanalare-divinita",
  "chierico-aumento-dei-punteggi-di-caratteristica",
  "chierico-distruggere-non-morti",
  "chierico-intervento-divino",
  "chierico-dominio-del-crepuscolo-competenze-bonus",
  NIGHT_EYES,
  VIGILANT_BLESSING,
  "chierico-dominio-del-crepuscolo-colpo-divino",
  "chierico-dominio-del-crepuscolo-sudario-del-crepuscolo",
];

const ASSISTED_IDS = [
  TURN_UNDEAD,
  SANCTUARY,
  STEPS,
];

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function clericBuild(level, {
  subclassId = TWILIGHT_SUBCLASS,
  extraClasses = [],
} = {}) {
  return [
    { classId: "chierico", level, subclassId },
    ...extraClasses,
  ];
}

function activation({
  feature: value,
  state = null,
  build,
  sourceId = "cleric",
  targetIds = [sourceId],
  round = 1,
  instanceId = "feature-instance",
  choiceId = "",
} = {}) {
  return planClassFeatureActivation({
    state,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId,
    targetIds,
    currentRound: round,
    currentTurnKey: String(round) + ":" + sourceId,
    instanceId,
    choiceId,
  });
}

test("il Chierico del Crepuscolo espone i sette privilegi base e i sette di sottoclasse ai livelli corretti", () => {
  const levelTwenty = new Set(
    getAvailableClassFeatures(clericBuild(20)).map((entry) => entry.id),
  );
  for (const id of [...BASE_IDS, ...TWILIGHT_IDS]) {
    assert.equal(levelTwenty.has(id), true, id);
  }

  const requiredLevels = new Map([
    ["chierico-dominio-divino", 1],
    ["chierico-incantesimi", 1],
    ["chierico-incanalare-divinita", 2],
    [TURN_UNDEAD, 2],
    ["chierico-aumento-dei-punteggi-di-caratteristica", 4],
    ["chierico-distruggere-non-morti", 5],
    ["chierico-intervento-divino", 10],
    ["chierico-dominio-del-crepuscolo-competenze-bonus", 1],
    [NIGHT_EYES, 1],
    [VIGILANT_BLESSING, 1],
    [SANCTUARY, 2],
    [STEPS, 6],
    ["chierico-dominio-del-crepuscolo-colpo-divino", 8],
    ["chierico-dominio-del-crepuscolo-sudario-del-crepuscolo", 17],
  ]);
  for (const [id, minimumLevel] of requiredLevels) {
    assert.equal(feature(id).minimumLevel, minimumLevel, id);
  }

  const otherDomain = getAvailableClassFeatures(clericBuild(20, {
    subclassId: "chierico-dominio-della-vita",
  }));
  assert.equal(otherDomain.some((entry) => TWILIGHT_IDS.includes(entry.id)), false);
});

test("gli undici reminder descrittivi non hanno effect plan né quick action, mentre le tre capacità assistite sono le sole implementate", () => {
  for (const id of REFERENCE_IDS) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.status, "not-automated", id);
    assert.equal(value.automationLevel, "riferimento", id);
    assert.equal(value.defaultEnabled, true, id);
    assert.equal(value.quickActionEligible, false, id);
    assert.equal(value.effectPlan, null, id);
    assert.equal(classFeatureIsReferenceOnly(value), true, id);
  }

  const perimeter = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "chierico"
    && (!entry.subclassId || entry.subclassId === TWILIGHT_SUBCLASS)
  );
  assert.deepEqual(
    perimeter
      .filter((entry) => entry.runtimeSupport.status === "implemented")
      .map((entry) => entry.id)
      .sort(),
    [...ASSISTED_IDS].sort(),
  );
  assert.equal(perimeter.filter((entry) => entry.runtimeSupport.status === "implemented").length, 3);
});

test("Incanalare Divinità risolve 1/2/3 usi e recupera a riposo breve o lungo", () => {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(CHANNEL_POOL);
  assert.ok(pool);
  assert.equal(resolveClassFeatureResourceMaximum(pool, clericBuild(2)).maximum, 1);
  assert.equal(resolveClassFeatureResourceMaximum(pool, clericBuild(6)).maximum, 2);
  assert.equal(resolveClassFeatureResourceMaximum(pool, clericBuild(18)).maximum, 3);

  const entry = classFeatureResourceEntries(
    null,
    [feature(TURN_UNDEAD)],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    clericBuild(6),
  ).find((value) => value.pool.id === CHANNEL_POOL);
  assert.deepEqual(entry.refreshEvents, ["riposo_breve", "riposo_lungo"]);
});

test("Scacciare Non Morti consuma l'uso anche senza bersagli e marca soltanto i fallimenti selezionati", () => {
  const base = feature(TURN_UNDEAD);
  const build = clericBuild(2);
  const initial = {
    resources: {
      [CHANNEL_POOL]: { current: 1, maximum: 1 },
    },
  };
  const noTargetsFeature = {
    ...base,
    targeting: { mode: "self", maxTargets: 1, excludeSource: false },
    trackingMode: "instant",
    effectPlan: { kind: "none" },
  };
  const noTargets = activation({
    feature: noTargetsFeature,
    state: initial,
    build,
    targetIds: ["cleric"],
    instanceId: "turn-undead-none",
    choiceId: "no-targets",
  });
  assert.equal(noTargets.ok, true);
  assert.equal(noTargets.state.resources[CHANNEL_POOL].current, 0);
  assert.deepEqual(noTargets.state.instances, []);
  assert.equal(classFeatureEffectProjection(noTargetsFeature).kind, "none");

  const failedTargets = activation({
    feature: base,
    state: initial,
    build,
    targetIds: ["undead-a", "undead-b"],
    instanceId: "turn-undead-failed",
    choiceId: "failed-targets",
  });
  assert.equal(failedTargets.ok, true);
  assert.equal(failedTargets.state.resources[CHANNEL_POOL].current, 0);
  const pills = classFeatureConditionInstancesForActivation(
    base,
    failedTargets.instance,
    "Chierico",
    build,
  );
  assert.equal(pills.length, 2);
  assert.deepEqual(pills.map((pill) => pill.targetId), ["undead-a", "undead-b"]);
  assert.equal(pills.every((pill) => pill.condition === "Scacciato"), true);
  assert.equal(pills.every((pill) => pill.expiry.remaining === 10), true);
  assert.equal(pills.every((pill) => pill.effectDetail.includes("Termina se subisce danni")), true);
  assert.equal(Object.hasOwn(base.effectPlan, "temporaryHp"), false);
  assert.equal(/(?:stat.?block|challenge|gs|hpmax)/iu.test(JSON.stringify(base.effectPlan)), false);
});

test("Occhi della Notte e Benedizione Vigile restano promemoria descrittivi senza pill o risorse", () => {
  for (const id of [NIGHT_EYES, VIGILANT_BLESSING]) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.status, "not-automated", id);
    assert.equal(value.runtimeSupport.adapter, null, id);
    assert.equal(value.automationLevel, "riferimento", id);
    assert.equal(classFeatureIsReferenceOnly(value), true, id);
    assert.equal(value.effectPlan, null, id);
    assert.deepEqual(value.resourceCosts, [], id);
  }
  assert.equal(feature(NIGHT_EYES).trackedResourcePoolIds, undefined);
});

test("tutti gli usi specifici del Chierico sono figli di Incanalare Divinità", () => {
  const channelUses = CLASS_FEATURE_CATALOG.features.filter((entry) => (
    entry.classId === "chierico"
    && entry.id !== "chierico-incanalare-divinita"
    && entry.id.includes("-incanalare-divinita-")
  ));
  assert.ok(channelUses.length > 0);
  assert.equal(channelUses.every((entry) => (
    entry.parentFeatureId === "chierico-incanalare-divinita"
  )), true);
  assert.equal(feature(TURN_UNDEAD).parentFeatureId, "chierico-incanalare-divinita");
  assert.equal(feature(SANCTUARY).parentFeatureId, "chierico-incanalare-divinita");
  assert.deepEqual(
    orderClassFeaturesByParent([
      feature("chierico-incanalare-divinita"),
      feature(TURN_UNDEAD),
      feature(SANCTUARY),
    ]).map((entry) => entry.id),
    ["chierico-incanalare-divinita", TURN_UNDEAD, SANCTUARY],
  );
});

test("Passi nella Notte usa il bonus di competenza del livello totale e concede volo copyFrom walk", () => {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(STEPS_POOL);
  assert.ok(pool);
  const expected = new Map([[1, 2], [5, 3], [9, 4], [13, 5], [17, 6], [20, 6]]);
  for (const [totalLevel, maximum] of expected) {
    const build = totalLevel <= 6
      ? clericBuild(totalLevel)
      : clericBuild(6, {
        extraClasses: [{ classId: "guerriero", level: totalLevel - 6 }],
      });
    assert.equal(resolveClassFeatureResourceMaximum(pool, build).maximum, maximum, String(totalLevel));
  }

  const build = clericBuild(6);
  const result = activation({
    feature: feature(STEPS),
    state: {
      resources: {
        [STEPS_POOL]: { current: 3, maximum: 3 },
      },
    },
    build,
    round: 4,
    instanceId: "steps-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.resources[STEPS_POOL].current, 2);
  assert.equal(result.instance.expiresRound, 13);
  const [pill] = classFeatureConditionInstancesForActivation(
    feature(STEPS),
    result.instance,
    "Chierico",
    build,
  );
  assert.equal(pill.mechanics.movement.modes.fly.copyFrom, "walk");
});

function sanctuaryFixture() {
  const build = clericBuild(17);
  const value = feature(SANCTUARY);
  const state = {
    resources: {
      [CHANNEL_POOL]: { current: 1, maximum: 3 },
    },
  };
  const result = activation({
    feature: value,
    state,
    build,
    round: 1,
    instanceId: "sanctuary-1",
  });
  assert.equal(result.ok, true);
  const items = [
    {
      id: "cleric",
      name: "Chierico",
      metadata: {
        [META_KEY]: {
          attitude: "pc",
          hp: 42,
          hpMax: 42,
          initiativeCard: { spellSaveDC: 17 },
          classFeatureState: result.state,
          conditions: { instances: [] },
        },
      },
    },
    {
      id: "ally",
      name: "Alleato",
      metadata: {
        [META_KEY]: {
          attitude: "ally",
          hp: 20,
          hpMax: 20,
          conditions: { instances: [] },
        },
      },
    },
    {
      id: "neutral",
      name: "Neutrale",
      metadata: {
        [META_KEY]: {
          attitude: "neutral",
          hp: 12,
          hpMax: 12,
          conditions: { instances: [] },
        },
      },
    },
    {
      id: "enemy",
      name: "Nemico",
      metadata: {
        [META_KEY]: {
          attitude: "enemy",
          hp: 30,
          hpMax: 30,
          conditions: { instances: [] },
        },
      },
    },
  ];
  const [aura] = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: new Map(CLASS_FEATURE_CATALOG.features.map((entry) => [entry.id, entry])),
    currentRound: 1,
    characterBuildBySourceId: new Map([["cleric", build]]),
  });
  const area = buildCircleArea({ x: 0, y: 0 }, { x: 6, y: 0 }, 1, { x: 0, y: 0 });
  const candidates = items.map((item, index) => ({
    item,
    bounds: {
      min: { x: index + 1, y: 0 },
      max: { x: index + 2, y: 1 },
    },
  }));
  return { aura, build, candidates, items, result, value, area };
}

test("Santuario conserva costo, durata e aura, con pill diretta solo sulla Card", () => {
  const fixture = sanctuaryFixture();
  const { aura, area, candidates, items, result, value } = fixture;
  assert.equal(result.state.resources[CHANNEL_POOL].current, 0);
  assert.equal(result.instance.expiresRound, 10);
  assert.equal(aura.radiusMeters, 9);
  assert.deepEqual(aura.membershipTargeting, { filter: "all", includeCaster: true });
  assert.equal(aura.targetEffects.length, 1);
  assert.equal(aura.targetEffect.label, "Nel Santuario del Crepuscolo");
  assert.equal(aura.targetEffect.detail.includes("Sudario"), true);
  assert.equal(JSON.stringify(value.effectPlan).includes("temporaryHp"), false);

  const directPills = classFeatureConditionInstancesForActivation(
    value,
    result.instance,
    "Chierico",
    fixture.build,
  );
  assert.equal(directPills.length, 1);
  assert.equal(directPills[0].condition, "Santuario del Crepuscolo");
  assert.equal(directPills[0].targetId, "cleric");
  assert.equal(directPills[0].mapVisible, false);

  const desiredTargetIds = classFeatureAuraTargetIds({
    aura,
    area,
    candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(desiredTargetIds, ["cleric", "ally", "neutral", "enemy"]);
  const membership = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds,
    items,
    metaKey: META_KEY,
  });
  const add = membership.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual(add.targetIds, desiredTargetIds);
  assert.equal(add.conditionName, "Nel Santuario del Crepuscolo");
  assert.equal(add.options.type, CLASS_FEATURE_AREA_EFFECT_TYPE);
  assert.equal(add.targetIds.filter((id) => id === "cleric").length, 1);

  const leavingItems = structuredClone(items);
  leavingItems.find((item) => item.id === "enemy").metadata[META_KEY].conditions.instances.push({
    id: "sanctuary-area-enemy",
    condition: "Nel Santuario del Crepuscolo",
    active: true,
    targetId: "enemy",
    sourceId: "cleric",
    parentEffectId: result.instance.instanceId,
    effectId: SANCTUARY + ":area",
    type: CLASS_FEATURE_AREA_EFFECT_TYPE,
  });
  const leaving = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: ["cleric", "ally", "neutral"],
    items: leavingItems,
    metaKey: META_KEY,
  });
  assert.equal(
    leaving.operations[0].removals.some((entry) => entry.itemId === "enemy"),
    true,
  );
});

test("Santuario invia un solo reminder informativo a fine turno senza mutare HP o condizioni", () => {
  const fixture = sanctuaryFixture();
  const desiredTargetIds = ["cleric", "ally", "neutral", "enemy"];
  const state = (current) => ({
    order: ["cleric", "ally", "neutral", "enemy"],
    current,
    round: 1,
  });
  const before = structuredClone(fixture.items);
  const initialized = planClassFeatureAuraReminder({
    aura: fixture.aura,
    desiredTargetIds,
    initiativeState: state(0),
    itemsById: new Map(fixture.items.map((item) => [item.id, item])),
    areaPosition: { x: 0, y: 0 },
    now: 1,
  });
  assert.deepEqual(initialized.notices, []);
  const auraItem = {
    id: "sanctuary-visual",
    metadata: {
      [CLASS_FEATURE_AURA_META_KEY]: {
        instanceId: fixture.result.instance.instanceId,
        triggerRuntime: initialized.runtime,
      },
    },
  };
  const clericEnd = planClassFeatureAuraReminder({
    aura: fixture.aura,
    auraItem,
    desiredTargetIds,
    initiativeState: state(1),
    itemsById: new Map(fixture.items.map((item) => [item.id, item])),
    areaPosition: { x: 0, y: 0 },
    now: 2,
  });
  assert.equal(clericEnd.notices.length, 1);
  assert.equal(clericEnd.notices[0].targets[0].id, "cleric");
  assert.match(clericEnd.notices[0].label, /1d6/iu);
  assert.match(clericEnd.notices[0].label, /Affascinata/iu);
  assert.match(clericEnd.notices[0].label, /Spaventata/iu);
  assert.equal(clericEnd.newActivations[0].resolution, "informational");

  const duplicate = planClassFeatureAuraReminder({
    aura: fixture.aura,
    auraItem: {
      ...auraItem,
      metadata: {
        [CLASS_FEATURE_AURA_META_KEY]: {
          ...auraItem.metadata[CLASS_FEATURE_AURA_META_KEY],
          triggerRuntime: clericEnd.runtime,
        },
      },
    },
    desiredTargetIds,
    initiativeState: state(1),
    itemsById: new Map(fixture.items.map((item) => [item.id, item])),
    areaPosition: { x: 0, y: 0 },
    now: 3,
  });
  assert.deepEqual(duplicate.notices, []);
  assert.deepEqual(fixture.items, before);
});

test("gli incantesimi del Dominio del Crepuscolo e del Giuramento di Vendetta usano il catalogo comune", () => {
  const twilight = getAdditionalSubclassSpellEntries({
    characterBuild: clericBuild(9),
  }, "chierico");
  assert.equal(twilight.subclass.name, "Dominio del Crepuscolo");
  assert.equal(twilight.entries.length, 10);
  for (const entry of twilight.entries) {
    assert.ok(getSpellDefinition(entry.name), entry.name);
  }

  const oath = getAdditionalSubclassSpellEntries({
    characterBuild: [{
      classId: "paladino",
      level: 20,
      subclassId: "paladino-giuramento-di-vendetta",
    }],
  }, "paladino");
  assert.equal(oath.subclass.name, "Giuramento di Vendetta");
  assert.deepEqual(oath.entries, [
    { level: 3, name: "Anatema" },
    { level: 3, name: "Marchio del Cacciatore" },
    { level: 5, name: "Blocca Persone" },
    { level: 5, name: "Passo Velato" },
    { level: 9, name: "Velocità" },
    { level: 9, name: "Protezione dall’Energia" },
    { level: 13, name: "Esilio" },
    { level: 13, name: "Porta Dimensionale" },
    { level: 17, name: "Blocca Mostri" },
    { level: 17, name: "Scrutare" },
  ]);
});

test("nessuna capacità del perimetro entra nelle quick action", () => {
  const quickActions = new Set(buildClassFeatureQuickActions({
    characterBuild: clericBuild(20),
    classFeaturesConfigured: false,
  }).map((entry) => entry.featureId));
  assert.equal([...BASE_IDS, ...TWILIGHT_IDS].some((id) => quickActions.has(id)), false);
});
