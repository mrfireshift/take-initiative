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
  classFeatureDurationTiming,
  classFeatureEffectProjection,
  classFeatureResourceEntries,
  classFeatureResourceRefreshEvents,
  classFeatureTargeting,
  planClassFeatureActivation,
  planClassFeatureResourceAdjustment,
  resolveClassFeatureProgressionValue,
} from "../src/classFeatureCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const mechanics = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/phb2014_livello_meccanico_v1_1.json", import.meta.url),
  "utf8",
)).mechanics;

const ROGUE_SUBCLASS_ID = "ladro-mistificatore-arcano";
const rogueBuild = (level, subclassId = "") => [{
  classId: "ladro",
  level,
  subclassId,
}];

const BASE_FEATURE_LEVELS = {
  "ladro-maestria": 1,
  "ladro-attacco-furtivo": 1,
  "ladro-gergo-ladresco": 1,
  "ladro-azione-scaltra": 2,
  "ladro-archetipo-ladresco": 3,
  "ladro-aumento-dei-punteggi-di-caratteristica": 4,
  "ladro-schivata-prodigiosa": 5,
  "ladro-elusione": 7,
  "ladro-dote-affidabile": 11,
  "ladro-percezione-cieca": 14,
  "ladro-mente-sfuggente": 15,
  "ladro-inafferrabile": 18,
  "ladro-colpo-di-fortuna": 20,
};

const ARCANE_TRICKSTER_FEATURE_LEVELS = {
  "ladro-mistificatore-arcano-incantesimi": 3,
  "ladro-mistificatore-arcano-gioco-di-prestigio-della-mano-magica": 3,
  "ladro-mistificatore-arcano-imboscata-magica": 9,
  "ladro-mistificatore-arcano-ingannatore-versatile": 13,
  "ladro-mistificatore-arcano-ladro-di-incantesimi": 17,
};

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

test("il Ladro e il Mistificatore Arcano espongono livelli e sottoclasse corretti", () => {
  assert.equal(CLASS_FEATURE_CATALOG.validation.catalogRecords, 860);
  const baseAvailable = new Set(getAvailableClassFeatures(rogueBuild(20)).map((entry) => entry.id));
  assert.deepEqual(
    [...baseAvailable].filter((id) => id in BASE_FEATURE_LEVELS).sort(),
    Object.keys(BASE_FEATURE_LEVELS).sort(),
  );
  for (const [id, level] of Object.entries(BASE_FEATURE_LEVELS)) {
    assert.equal(feature(id).minimumLevel, level, id);
    assert.equal(feature(id).subclassId, "", id);
  }

  const arcaneAvailable = new Set(
    getAvailableClassFeatures(rogueBuild(20, ROGUE_SUBCLASS_ID)).map((entry) => entry.id),
  );
  for (const [id, level] of Object.entries(ARCANE_TRICKSTER_FEATURE_LEVELS)) {
    assert.equal(arcaneAvailable.has(id), true, id);
    assert.equal(feature(id).minimumLevel, level, id);
    assert.equal(feature(id).subclassId, ROGUE_SUBCLASS_ID, id);
  }
  assert.equal(
    getAvailableClassFeatures(rogueBuild(20, "ladro-assassino"))
      .some((entry) => entry.subclassId === ROGUE_SUBCLASS_ID),
    false,
  );

  const descriptiveIds = [
    ...Object.keys(BASE_FEATURE_LEVELS).filter((id) => id !== "ladro-colpo-di-fortuna"),
    "ladro-mistificatore-arcano-incantesimi",
    "ladro-mistificatore-arcano-gioco-di-prestigio-della-mano-magica",
  ];
  for (const id of descriptiveIds) {
    const current = feature(id);
    assert.equal(classFeatureIsReferenceOnly(current), true, id);
    assert.equal(current.runtimeSupport.status, "not-automated", id);
    assert.equal(current.quickActionEligible, false, id);
    assert.equal(current.effectPlan, null, id);
  }
  const profile = {
    characterBuild: rogueBuild(20, ROGUE_SUBCLASS_ID),
    classFeaturesConfigured: false,
  };
  assert.deepEqual(buildClassFeatureQuickActions(profile), []);
  assert.equal(getSpellDefinition("mage-hand")?.id, "mage-hand");
  assert.equal(
    CLASS_FEATURE_BY_ID.has("mage-hand"),
    false,
    "Mano magica resta una spell, non una capacità duplicata",
  );
});

test("Attacco Furtivo risolve il dado corrente dalla progressione canonica", () => {
  const sneakAttack = feature("ladro-attacco-furtivo");
  assert.deepEqual(sneakAttack.diceFrom, {
    type: "class_progression",
    class_id: "ladro",
    field: "attacco_furtivo",
  });
  for (const [level, expected] of [[1, "1d6"], [3, "2d6"], [5, "3d6"], [19, "10d6"], [20, "10d6"]]) {
    assert.equal(
      resolveClassFeatureProgressionValue(sneakAttack, rogueBuild(level)),
      expected,
      `livello ${level}`,
    );
  }
  assert.equal(sneakAttack.trackingMode, "instant");
  assert.deepEqual(sneakAttack.resourceCosts, []);
  assert.equal(sneakAttack.diceByClassLevel[20], "10d6");
});

test("Colpo di Fortuna usa un pool fisso con entrambi i riposi e nessun marker", () => {
  const featureValue = feature("ladro-colpo-di-fortuna");
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("ladro-colpo-di-fortuna-usi");
  assert.equal(featureValue.runtimeSupport.adapter, "resource-only");
  assert.deepEqual(
    classFeatureResourceRefreshEvents(pool, rogueBuild(20)),
    ["riposo_breve", "riposo_lungo"],
  );
  const [initial] = classFeatureResourceEntries(
    null,
    [featureValue],
    CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    rogueBuild(20),
  );
  assert.equal(initial.current, 1);
  assert.equal(initial.maximum, 1);

  const activation = planClassFeatureActivation({
    stateValue: null,
    feature: featureValue,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(20),
    sourceId: "rogue",
    targetIds: [],
    currentRound: 4,
    instanceId: "luck-1",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.state.resources[pool.id].current, 0);
  assert.deepEqual(activation.state.instances, []);
  assert.deepEqual(classFeatureConditionInstancesForActivation(
    featureValue,
    activation.instance,
    "Rogue",
    rogueBuild(20),
  ), []);

  const restored = planClassFeatureResourceAdjustment(
    activation.state,
    pool,
    rogueBuild(20),
    { reset: true },
  );
  assert.equal(restored.state.resources[pool.id].current, 1);
});

test("turn-end scade nel turno corrente e resta distinto da next-turn-end", () => {
  const featureValue = feature("ladro-mistificatore-arcano-imboscata-magica");
  assert.equal(classFeatureDurationTiming(featureValue), "turn-end");
  const activation = planClassFeatureActivation({
    stateValue: null,
    feature: featureValue,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(9, ROGUE_SUBCLASS_ID),
    sourceId: "rogue",
    targetIds: ["rogue", "enemy-a", "enemy-b"],
    currentRound: 6,
    currentTurnKey: "6:rogue",
    instanceId: "ambush-1",
  });
  assert.equal(activation.ok, true);
  const [currentTurnExpiry] = classFeatureConditionInstancesForActivation(
    featureValue,
    activation.instance,
    "Rogue",
    rogueBuild(9, ROGUE_SUBCLASS_ID),
  ).filter((entry) => entry.targetId === "enemy-a");
  assert.deepEqual(currentTurnExpiry.expiry, {
    mode: "turn-end",
    actor: "source",
    actorId: "rogue",
    remaining: 1,
  });
  assert.equal(currentTurnExpiry.appliedAt.round, 6);
  assert.equal(currentTurnExpiry.appliedAt.actorId, "rogue");
  assert.equal(currentTurnExpiry.appliedAt.turnKey, "6:rogue");

  const nextTurnFeature = {
    ...featureValue,
    duration: { rounds: null, timing: "next-turn-end" },
  };
  const nextActivation = planClassFeatureActivation({
    stateValue: null,
    feature: nextTurnFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(9, ROGUE_SUBCLASS_ID),
    sourceId: "rogue",
    targetIds: ["enemy-a"],
    currentRound: 6,
    instanceId: "next-ambush-1",
  });
  const [nextTurnExpiry] = classFeatureConditionInstancesForActivation(
    nextTurnFeature,
    nextActivation.instance,
    "Rogue",
    rogueBuild(9, ROGUE_SUBCLASS_ID),
  );
  assert.deepEqual(nextTurnExpiry.expiry, {
    mode: "turn-end",
    actor: "source",
    actorId: "rogue",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.notDeepEqual(currentTurnExpiry.expiry, nextTurnExpiry.expiry);
});

test("Imboscata Magica supporta più bersagli, esclude il Ladro e non impone una portata", () => {
  const value = feature("ladro-mistificatore-arcano-imboscata-magica");
  assert.deepEqual(classFeatureTargeting(value, rogueBuild(9, ROGUE_SUBCLASS_ID)), {
    mode: "single-target",
    rangeMeters: null,
    maxTargets: null,
    excludeSource: true,
  });
  const activation = planClassFeatureActivation({
    stateValue: null,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(9, ROGUE_SUBCLASS_ID),
    sourceId: "rogue",
    targetIds: ["rogue", "enemy-a", "enemy-b"],
    currentRound: 2,
    instanceId: "ambush-2",
  });
  const instances = classFeatureConditionInstancesForActivation(
    value,
    activation.instance,
    "Ladro Mistificatore",
    rogueBuild(9, ROGUE_SUBCLASS_ID),
  );
  assert.deepEqual(instances.map((entry) => entry.targetId).sort(), ["enemy-a", "enemy-b"]);
  assert.equal(instances.every((entry) => entry.sourceId === "rogue"), true);
  assert.equal(instances.every((entry) => entry.sourceName === "Ladro Mistificatore"), true);
  assert.equal(instances.every((entry) => entry.appliedAt.round === 2), true);
  assert.equal(classFeatureEffectProjection(value).kind, "condition");
});

test("Ingannatore Versatile è un marker singolo con distanza dalla Mano gestita al tavolo", () => {
  const value = feature("ladro-mistificatore-arcano-ingannatore-versatile");
  const targeting = classFeatureTargeting(value, rogueBuild(13, ROGUE_SUBCLASS_ID));
  assert.equal(targeting.maxTargets, 1);
  assert.equal(targeting.rangeMeters, null);
  assert.equal(targeting.excludeSource, true);
  const activation = planClassFeatureActivation({
    stateValue: null,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(13, ROGUE_SUBCLASS_ID),
    sourceId: "rogue",
    targetIds: ["rogue", "enemy"],
    currentRound: 3,
    instanceId: "trickster-1",
  });
  const instances = classFeatureConditionInstancesForActivation(
    value,
    activation.instance,
    "Rogue",
    rogueBuild(13, ROGUE_SUBCLASS_ID),
  );
  assert.deepEqual(instances.map((entry) => entry.targetId), ["enemy"]);
  assert.match(instances[0].effectDetail, /Mano Magica/u);
  assert.deepEqual(instances[0].expiry, {
    mode: "turn-end",
    actor: "source",
    actorId: "rogue",
    remaining: 1,
  });
});

test("Ladro di Incantesimi conserva la durata sorgente e il choiceId dello spell", () => {
  const value = feature("ladro-mistificatore-arcano-ladro-di-incantesimi");
  const source = mechanic(value.id);
  assert.equal(source.activation.primary, "reazione");
  assert.equal(source.targets.type, "lanciatore_originale");
  assert.deepEqual(source.recovery, ["riposo_lungo"]);
  assert.equal(source.duration.value, 8);
  assert.equal(source.duration.unit, "ora");
  assert.equal(value.duration.rounds, 4800);
  assert.deepEqual(value.resourceCosts, [{
    poolId: "ladro-mistificatore-arcano-ladro-di-incantesimi-usi",
    amount: 1,
  }]);

  const spell = getSpellDefinition("fireball");
  assert.ok(spell);
  assert.ok(Number(spell.level) >= 1);
  const spellLabel = spell.catalogLabel || spell.displayName || spell.name || spell.id;
  const stolenFeature = {
    ...value,
    trackingMode: "active",
    effectPlan: {
      kind: "condition",
      conditionName: `Incantesimo rubato: ${spellLabel}`,
      detail: `Reminder di ${spellLabel}.`,
    },
  };
  const activation = planClassFeatureActivation({
    stateValue: null,
    feature: stolenFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(17, ROGUE_SUBCLASS_ID),
    sourceId: "rogue",
    targetIds: ["caster"],
    currentRound: 7,
    instanceId: "spell-thief-1",
    choiceId: spell.id,
  });
  assert.equal(activation.ok, true);
  assert.equal(
    activation.state.resources["ladro-mistificatore-arcano-ladro-di-incantesimi-usi"].current,
    0,
  );
  const [marker] = classFeatureConditionInstancesForActivation(
    stolenFeature,
    activation.instance,
    "Ladro",
    rogueBuild(17, ROGUE_SUBCLASS_ID),
  );
  assert.equal(marker.targetId, "caster");
  assert.equal(marker.sourceId, "rogue");
  assert.equal(marker.choiceId, spell.id);
  assert.equal(marker.expiry.mode, "rounds");
  assert.equal(marker.expiry.remaining, 4800);
  assert.equal(marker.appliedAt.round, 7);
  assert.equal(marker.condition, `Incantesimo rubato: ${spellLabel}`);

  const deniedFeature = { ...value, trackingMode: "instant", effectPlan: { kind: "none" } };
  const denied = planClassFeatureActivation({
    stateValue: null,
    feature: deniedFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: rogueBuild(17, ROGUE_SUBCLASS_ID),
    sourceId: "rogue",
    targetIds: ["caster"],
    currentRound: 7,
    instanceId: "spell-thief-2",
    choiceId: spell.id,
  });
  assert.equal(denied.ok, true);
  assert.deepEqual(classFeatureConditionInstancesForActivation(
    deniedFeature,
    denied.instance,
    "Ladro",
    rogueBuild(17, ROGUE_SUBCLASS_ID),
  ), []);
  assert.deepEqual(denied.state.instances, []);
});
