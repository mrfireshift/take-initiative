import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureContextEntries,
  buildClassFeatureQuickActions,
  classFeatureDisplayNameWithParent,
  classFeatureIsReferenceOnly,
  classFeatureRuntimeSupport,
  classFeatureTargeting,
  getAvailableClassFeatures,
  getEnabledClassFeatures,
} from "../src/classFeatureCatalog.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const rageId = "barbaro-ira";
const vowId = "paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia";
const twilightId = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";

test("il catalogo runtime copre PHB, Xanathar, Tasha e Ranger Revised", () => {
  assert.equal(CLASS_FEATURE_CATALOG.version, 4);
  assert.deepEqual(
    CLASS_FEATURE_CATALOG.sources.map((entry) => entry.id),
    ["phb2014", "xanathar", "tasha", "ranger-revised"],
  );
  assert.equal(CLASS_FEATURE_CATALOG.validation.catalogRecords, 860);
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeImplemented, 59);
  assert.equal(CLASS_FEATURE_CATALOG.validation.runtimeNotAutomated, 483);
  assert.ok(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === rageId));
  assert.ok(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === vowId));
  assert.ok(CLASS_FEATURE_CATALOG.features.some((entry) => entry.id === twilightId));
});

test("il Cammino del Berserker espone quattro capacità e distingue i reminder descrittivi", () => {
  const build = [{
    classId: "barbaro",
    level: 14,
    subclassId: "barbaro-cammino-del-berserker",
  }];
  const ids = [
    "barbaro-cammino-del-berserker-frenesia",
    "barbaro-cammino-del-berserker-ira-incontenibile",
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
    "barbaro-cammino-del-berserker-ritorsione",
  ];
  const available = new Set(getAvailableClassFeatures(build).map((feature) => feature.id));
  const profile = {
    characterBuild: build,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ids,
  };
  for (const id of ids) {
    assert.equal(available.has(id), true, id);
    assert.equal(CLASS_FEATURE_BY_ID.get(id)?.defaultEnabled, true, id);
  }
  assert.equal(CLASS_FEATURE_BY_ID.get(ids[0])?.runtimeSupport.status, "implemented");
  assert.equal(CLASS_FEATURE_BY_ID.get(ids[2])?.runtimeSupport.status, "implemented");
  for (const id of [ids[1], ids[3]]) {
    const feature = CLASS_FEATURE_BY_ID.get(id);
    assert.equal(feature?.runtimeSupport.status, "not-automated", id);
    assert.equal(classFeatureIsReferenceOnly(feature), true, id);
  }
  const quickActions = buildClassFeatureQuickActions(profile);
  const contextEntries = buildClassFeatureContextEntries(profile, null, 1);
  for (const id of [ids[1], ids[3]]) {
    assert.equal(quickActions.some((entry) => entry.featureId === id), false, id);
    assert.equal(contextEntries.some((entry) => entry.featureId === id), false, id);
  }
});

test("Ranger e Ranger Revised coesistono e il Cacciatore delle Profondità riusa il catalogo spell", () => {
  assert.ok(CLASS_FEATURE_CATALOG.classes.some((entry) => entry.id === "ranger"));
  assert.ok(CLASS_FEATURE_CATALOG.classes.some((entry) => entry.id === "ranger-revised"));
  const subclasses = CLASS_FEATURE_CATALOG.subclasses.filter((entry) =>
    entry.classId === "ranger-revised"
  );
  assert.equal(subclasses.length, 3);
  const deepStalker = subclasses.find((entry) =>
    entry.id === "ranger-revised-conclave-del-cacciatore-delle-profondita"
  );
  assert.deepEqual(deepStalker?.additionalSpellsByLevel, {
    "3": ["camuffare se stesso"],
    "5": ["trucco della corda"],
    "9": ["glifo di interdizione"],
    "13": ["invisibilità superiore"],
    "17": ["sembrare"],
  });
  for (const spellName of Object.values(deepStalker.additionalSpellsByLevel).flat()) {
    assert.ok(getSpellDefinition(spellName), spellName);
  }
});

test("ogni caratteristica attivabile ha un'emoji unica e coerente", () => {
  const activatable = CLASS_FEATURE_CATALOG.features.filter((feature) =>
    feature.runtimeSupport?.status === "implemented"
  );
  const byClass = new Map();
  for (const feature of activatable) {
    const entries = byClass.get(feature.classId) || [];
    entries.push(feature.theme?.emoji);
    byClass.set(feature.classId, entries);
  }
  for (const emojis of byClass.values()) {
    assert.equal(emojis.every(Boolean), true);
    assert.equal(new Set(emojis).size, emojis.length);
  }
  assert.notEqual(
    CLASS_FEATURE_CATALOG.features.find((feature) =>
      feature.id === "paladino-imposizione-delle-mani"
    )?.theme?.emoji,
    "✨",
  );
});

test("il Giuramento di Vendetta espone i dieci incantesimi aggiuntivi per livello", () => {
  const oath = CLASS_FEATURE_CATALOG.subclasses.find((entry) =>
    entry.id === "paladino-giuramento-di-vendetta"
  );
  assert.deepEqual(oath?.additionalSpellsByLevel, {
    "3": ["Anatema", "Marchio del Cacciatore"],
    "5": ["Blocca Persone", "Passo Velato"],
    "9": ["Velocità", "Protezione dall’Energia"],
    "13": ["Esilio", "Porta Dimensionale"],
    "17": ["Blocca Mostri", "Scrutare"],
  });
  for (const spellName of Object.values(oath.additionalSpellsByLevel).flat()) {
    assert.ok(getSpellDefinition(spellName), spellName);
  }
});

test("le quattro opzioni dello Stile di Combattimento sono scelte esclusive", () => {
  const options = CLASS_FEATURE_CATALOG.features.filter((feature) =>
    feature.optionGroup === "paladino-stile-di-combattimento"
  );
  assert.equal(options.length, 4);
  assert.equal(options.every((feature) => feature.defaultEnabled === false), true);
  assert.equal(options.every((feature) => feature.runtimeSupport.status === "not-automated"), true);
});

test("livello e sottoclasse filtrano le capacità disponibili", () => {
  const build = [
    { classId: "barbaro", level: 1 },
    {
      classId: "paladino",
      level: 3,
      subclassId: "paladino-giuramento-di-vendetta",
    },
  ];
  const available = new Set(getAvailableClassFeatures(build).map((entry) => entry.id));
  assert.equal(available.has(rageId), true);
  assert.equal(available.has(vowId), true);
  assert.equal(available.has(twilightId), false);
});

test("la configurazione esplicita limita le capacità attive", () => {
  const profile = {
    characterBuild: [{ classId: "barbaro", level: 3 }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [rageId],
  };
  assert.deepEqual(
    getEnabledClassFeatures(profile).map((entry) => entry.id),
    [rageId],
  );
  assert.deepEqual(
    buildClassFeatureQuickActions(profile).map((entry) => entry.featureId),
    [rageId],
  );
});

test("il menu Feature espone stato, tema e risorse disponibili", () => {
  const entries = buildClassFeatureContextEntries({
    characterBuild: [{ classId: "barbaro", level: 3 }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [rageId],
  }, {
    instances: [{
      instanceId: "rage-active",
      featureId: rageId,
      sourceId: "barbarian",
      targetIds: ["barbarian"],
      startedRound: 2,
      expiresRound: 11,
    }],
  }, 4);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].active, true);
  assert.equal(entries[0].activeInstances[0].remainingRounds, 8);
  assert.equal(entries[0].resourceReady, true);
  assert.equal(entries[0].theme.background, "#7f1d1d");
  assert.equal(entries[0].targetLabel, "su di s\u00e9");
});

test("Frenesia resta disponibile quando usa l'Ira gi\u00e0 attiva", () => {
  const frenzyId = "barbaro-cammino-del-berserker-frenesia";
  const entries = buildClassFeatureContextEntries({
    characterBuild: [{
      classId: "barbaro",
      level: 3,
      subclassId: "barbaro-cammino-del-berserker",
    }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [rageId, frenzyId],
  }, {
    resources: {
      "barbaro-ira-usi": { current: 0, maximum: 3, unlimited: false },
    },
    instances: [{
      instanceId: "rage-active",
      featureId: rageId,
      sourceId: "barbarian",
      targetIds: ["barbarian"],
      startedRound: 2,
      expiresRound: 11,
    }],
  }, 3);
  const frenzy = entries.find((entry) => entry.featureId === frenzyId);
  assert.equal(frenzy?.active, false);
  assert.equal(frenzy?.resourceReady, true);
});

test("il menu Feature conserva una voce non automatizzata non descrittiva", () => {
  const entries = buildClassFeatureContextEntries({
    characterBuild: [{ classId: "guerriero", level: 1 }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-recuperare-energie"],
  }, null, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].runtimeReady, false);
  assert.equal(entries[0].runtimeStatus, "not-automated");
});

test("i reminder Barbaro restano disponibili ma non diventano azioni o voci context", () => {
  const build = [{
    classId: "barbaro",
    level: 20,
    subclassId: "barbaro-cammino-del-combattente-totemico",
  }];
  const reminderIds = [
    "barbaro-difesa-senza-armatura",
    "barbaro-percezione-del-pericolo",
    "barbaro-attacco-extra",
    "barbaro-movimento-veloce",
    "barbaro-istinto-ferino",
    "barbaro-critico-brutale",
    "barbaro-ira-implacabile",
    "barbaro-ira-persistente",
    "barbaro-potenza-indomabile",
    "barbaro-campione-primordiale",
    "barbaro-cammino-del-combattente-totemico-cercatore-di-spiriti",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-aquila",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-lupo",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-orso",
    "barbaro-cammino-del-combattente-totemico-viandante-spirituale",
    "barbaro-cammino-del-combattente-totemico-sintonia-totemica",
  ];
  const available = new Set(getAvailableClassFeatures(build).map((feature) => feature.id));
  for (const id of reminderIds) {
    assert.equal(available.has(id), true, id);
    assert.equal(classFeatureIsReferenceOnly(
      CLASS_FEATURE_CATALOG.features.find((feature) => feature.id === id),
    ), true, id);
  }
  const profile = {
    characterBuild: build,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: reminderIds,
  };
  const quickActions = buildClassFeatureQuickActions(profile);
  assert.equal(quickActions.some((entry) => reminderIds.includes(entry.featureId)), false);
  assert.deepEqual(buildClassFeatureContextEntries(profile, null, 1), []);

  const optionIds = [
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-aquila",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-lupo",
    "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-orso",
  ];
  assert.equal(optionIds.every((id) => (
    CLASS_FEATURE_CATALOG.features.find((feature) => feature.id === id)?.defaultEnabled === false
  )), true);
});

test("i reminder rituali riusano gli incantesimi già presenti nei cataloghi", () => {
  for (const id of [
    "phb2014-percezione-delle-bestie",
    "speak-with-animals",
    "commune-with-nature",
  ]) {
    assert.ok(getSpellDefinition(id), id);
  }
});

test("i reminder di Aquila e Orso riportano tutte le limitazioni manuali", () => {
  const eagle = CLASS_FEATURE_CATALOG.features.find(
    (feature) => feature.id === "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
  );
  const attunementEagle = CLASS_FEATURE_CATALOG.features.find(
    (feature) => feature.id === "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
  );
  const attunementBear = CLASS_FEATURE_CATALOG.features.find(
    (feature) => feature.id === "barbaro-cammino-del-combattente-totemico-sintonia-totemica-orso",
  );
  assert.match(eagle.effectPlan.detail, /armatura pesante/i);
  assert.match(attunementEagle.effectPlan.detail, /cade/i);
  assert.match(attunementBear.effectPlan.detail, /vedere o sentire/i);
  assert.match(attunementBear.effectPlan.detail, /non può essere spaventata/i);
  assert.match(attunementBear.effectPlan.targetEffect.detail, /vedere o sentire/i);
  assert.match(attunementBear.effectPlan.targetEffect.detail, /non può essere spaventata/i);
});

test("le opzioni del Cammino Totemico conservano il gruppo della capacitÃ  madre", () => {
  for (const [childId, parentId] of [
    [
      "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia-aquila",
      "barbaro-cammino-del-combattente-totemico-aspetto-della-bestia",
    ],
    [
      "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
      "barbaro-cammino-del-combattente-totemico-spirito-totemico",
    ],
    [
      "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
      "barbaro-cammino-del-combattente-totemico-sintonia-totemica",
    ],
  ]) {
    const child = CLASS_FEATURE_CATALOG.features.find((feature) => feature.id === childId);
    const parent = CLASS_FEATURE_CATALOG.features.find((feature) => feature.id === parentId);
    assert.equal(child.parentFeatureId, parent.id);
    assert.match(classFeatureDisplayNameWithParent(child), new RegExp(parent.name));
  }
});

test("Movimento Veloce e Sintonia Totemica: Aquila dichiarano le meccaniche di velocitÃ ", () => {
  const fastMovement = CLASS_FEATURE_CATALOG.features.find(
    (feature) => feature.id === "barbaro-movimento-veloce",
  );
  const eagleAttunement = CLASS_FEATURE_CATALOG.features.find(
    (feature) => feature.id === "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
  );
  assert.equal(fastMovement.passiveMechanics.movement.addMeters, 3);
  assert.equal(eagleAttunement.effectPlan.mechanics.movement.modes.fly.copyFrom, "walk");
});

test("ogni costo del catalogo punta a una risorsa runtime", () => {
  for (const feature of CLASS_FEATURE_CATALOG.features) {
    for (const cost of feature.resourceCosts) {
      assert.equal(
        CLASS_FEATURE_RESOURCE_POOL_BY_ID.has(cost.poolId),
        true,
        `${feature.id}: ${cost.poolId}`,
      );
    }
  }
  for (const poolId of [
    "slot-incantesimo-standard-aggregati",
    "warlock-slot-magia-del-patto",
  ]) {
    assert.equal(CLASS_FEATURE_RESOURCE_POOL_BY_ID.has(poolId), false, poolId);
  }
  assert.equal(
    Boolean(CLASS_FEATURE_BY_ID.get("paladino-punizione-divina")?.trackedResourcePoolIds?.includes(
      "slot-incantesimo-standard-aggregati"
    )),
    false,
  );
});

test("il catalogo non proietta condizioni per Feature prive di adapter", () => {
  const unsupported = CLASS_FEATURE_CATALOG.features.find(
    (entry) => entry.id === "guerriero-recuperare-energie",
  );
  assert.equal(classFeatureRuntimeSupport(unsupported).ready, false);
  assert.equal(unsupported.effectPlan, null);
  assert.equal(unsupported.defaultEnabled, false);
  assert.equal(unsupported.completenessStatus, "curated");
});

test("il catalogo distingue bersaglio singolo e aura", () => {
  const vow = CLASS_FEATURE_CATALOG.features.find((entry) => entry.id === vowId);
  const twilight = CLASS_FEATURE_CATALOG.features.find((entry) => entry.id === twilightId);
  assert.deepEqual(classFeatureTargeting(vow), {
    mode: "single-target",
    rangeMeters: 3,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(twilight), {
    mode: "aura",
    rangeMeters: 9,
    maxTargets: null,
    excludeSource: false,
  });
  assert.equal(twilight.effectPlan.conditionName, "Santuario del Crepuscolo");
  assert.deepEqual(twilight.effectPlan.sourceCardPill, { mapVisible: false });
  assert.equal(twilight.effectPlan.targetEffect.effectKind, "buff");
  assert.equal(twilight.theme.emoji, "🌙");
  assert.equal(buildClassFeatureQuickActions({
    characterBuild: [{
      classId: "chierico",
      level: 2,
      subclassId: "chierico-dominio-del-crepuscolo",
    }],
  }).some((entry) => entry.featureId === twilightId), false);
  assert.deepEqual(twilight.effectPlan.membershipTargeting, {
    filter: "all",
    includeCaster: true,
  });
  assert.equal(twilight.effectPlan.targetEffect.conditionName, "Nel Santuario del Crepuscolo");
  assert.equal(twilight.effectPlan.targetEffect.mechanics, undefined);
  assert.deepEqual(twilight.effectPlan.triggerPolicy.triggers[0], {
    id: "santuario-del-crepuscolo-fine-turno",
    event: "turn-end",
    targetMode: "actor",
    frequency: "once-per-turn",
    resolution: "informational",
    label: "Santuario: per questa creatura, tira manualmente 1d6 + livello da Chierico e applica PF temporanei, oppure termina Affascinata o Spaventata.",
  });
});
