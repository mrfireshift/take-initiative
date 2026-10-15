// P1: modificatori di caratteristica nel profilo card, massimi dei pool a formula
// e CD 8 + competenza + modificatore nei popup dei TS delle capacità di classe.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const {
  ABILITY_MODIFIERS_FIELD,
  abilitySaveDC,
  compactAbilityModifiers,
  hasAbilityModifiers,
  proficiencyBonusForLevel,
  sanitizeAbilityModifiers,
} = await import("../src/abilityModifiersCore.js");
const {
  classFeatureConditionInstancesForActivation,
  classFeatureResourceEntries,
  planClassFeatureActivation,
  planClassFeatureResourceAdjustment,
  resolveClassFeatureResourceMaximum,
} = await import("../src/classFeatureCore.js");
const {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  getEnabledClassFeatures,
} = await import("../src/classFeatureCatalog.js");
const { sanitizeInitiativeCard, hasInitiativeCardValues } = await import("../src/initiativeCards.js");
const {
  decodeInitiativeCardRegistryFromRoom,
  encodeInitiativeCardRegistryForRoom,
} = await import("../src/initiativeCardRegistryCore.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { initiativeTurnKeyAtOrdinal } = await import("../src/turnBoundaryCore.js");
const { ID } = await import("../src/constants.js");

const META_KEY = `${ID}/meta`;
const pool = (id) => {
  const value = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(id);
  assert.ok(value, id);
  return value;
};
const feature = (id) => {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
};

const BARDIC_POOL = "bardo-ispirazione-bardica-usi";
const DIVINE_SENSE_POOL = "paladino-percezione-divino-usi";
const ARCANE_WARD_POOL = "mago-interdizione-arcana-pf";
const GLORIOUS_DEFENSE = "paladino-giuramento-di-gloria-difesa-gloriosa";
const GLORIOUS_DEFENSE_POOL = "paladino-giuramento-di-gloria-difesa-gloriosa-usi";
const bard = [{ classId: "bardo", level: 5, subclassId: "" }];
const paladin = [{ classId: "paladino", level: 15, subclassId: "paladino-giuramento-di-gloria" }];
const wizard = [{ classId: "mago", level: 6, subclassId: "" }];

test("i modificatori si normalizzano da oggetto o array compatto, con limiti -5..+10", () => {
  assert.deepEqual(sanitizeAbilityModifiers({ str: "2", dex: 12, con: -9, wis: "", cha: 3.6 }), {
    str: 2, dex: 10, con: -5, int: null, wis: null, cha: 4,
  });
  assert.deepEqual(sanitizeAbilityModifiers([1, 2, null, 0, -1, 5]), {
    str: 1, dex: 2, con: null, int: 0, wis: -1, cha: 5,
  });
  assert.deepEqual(compactAbilityModifiers({ cha: 4 }), [null, null, null, null, null, 4]);
  assert.equal(hasAbilityModifiers({}), false);
  assert.equal(hasAbilityModifiers({ int: 0 }), true);
});

test("la CD da caratteristica usa competenza del livello totale e modificatore della card", () => {
  assert.equal(proficiencyBonusForLevel(1), 2);
  assert.equal(proficiencyBonusForLevel(9), 4);
  assert.equal(proficiencyBonusForLevel(17), 6);
  const profile = {
    characterBuild: [{ classId: "guerriero", level: 7 }, { classId: "mago", level: 2 }],
    [ABILITY_MODIFIERS_FIELD]: { con: 3 },
  };
  assert.equal(abilitySaveDC(profile, "con"), 8 + 4 + 3);
  assert.equal(abilitySaveDC(profile, "dex"), null);
  assert.equal(abilitySaveDC({ [ABILITY_MODIFIERS_FIELD]: { con: 3 } }, "con"), null);
});

test("il profilo card salva i modificatori solo quando il campo è presente", () => {
  const legacy = sanitizeInitiativeCard({ armorClass: 15 });
  assert.equal(Object.hasOwn(legacy, ABILITY_MODIFIERS_FIELD), false);
  const withModifiers = sanitizeInitiativeCard({ [ABILITY_MODIFIERS_FIELD]: { cha: 4 } });
  assert.deepEqual(withModifiers[ABILITY_MODIFIERS_FIELD], {
    str: null, dex: null, con: null, int: null, wis: null, cha: 4,
  });
  assert.equal(hasInitiativeCardValues(withModifiers), true);
});

test("le formule con modificatore risolvono il massimo solo se il modificatore c'è", () => {
  assert.equal(resolveClassFeatureResourceMaximum(pool(BARDIC_POOL), bard).maximum, null);
  assert.equal(resolveClassFeatureResourceMaximum(pool(BARDIC_POOL), bard, { cha: 4 }).maximum, 4);
  // max(1, Car): con Carisma negativo resta 1.
  assert.equal(resolveClassFeatureResourceMaximum(pool(BARDIC_POOL), bard, { cha: -1 }).maximum, 1);
  // 1 + Car.
  assert.equal(resolveClassFeatureResourceMaximum(pool(DIVINE_SENSE_POOL), paladin, { cha: 3 }).maximum, 4);
  // 2 × livello da mago + Int.
  assert.equal(resolveClassFeatureResourceMaximum(pool(ARCANE_WARD_POOL), wizard, { int: 4 }).maximum, 16);
  assert.equal(resolveClassFeatureResourceMaximum(pool(ARCANE_WARD_POOL), bard, { int: 4 }).maximum, null);
});

test("il massimo calcolato prende il posto di quello inserito a mano; senza modificatori resta quello manuale", () => {
  const manual = planClassFeatureResourceAdjustment(null, pool(BARDIC_POOL), bard, { maximum: 3, reset: true });
  assert.deepEqual(manual.state.resources[BARDIC_POOL], { current: 3, maximum: 3, unlimited: false });
  const features = [{ trackedResourcePoolIds: [BARDIC_POOL] }];
  const [withoutModifiers] = classFeatureResourceEntries(manual.state, features, CLASS_FEATURE_RESOURCE_POOL_BY_ID, bard);
  assert.equal(withoutModifiers.maximum, 3);
  const [computed] = classFeatureResourceEntries(manual.state, features, CLASS_FEATURE_RESOURCE_POOL_BY_ID, bard, { cha: 5 });
  assert.equal(computed.maximum, 5);
  assert.equal(computed.current, 3);
  const [lowered] = classFeatureResourceEntries(manual.state, features, CLASS_FEATURE_RESOURCE_POOL_BY_ID, bard, { cha: 2 });
  assert.equal(lowered.maximum, 2);
  assert.equal(lowered.current, 2);
});

test("Difesa Gloriosa: sbloccata da P1, spende un uso dal massimo pari al Carisma", () => {
  const value = feature(GLORIOUS_DEFENSE);
  assert.equal(value.runtimeSupport.status, "implemented");
  assert.equal(value.runtimeSupport.adapter, "resource-only");
  const activation = planClassFeatureActivation({
    state: null,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: paladin,
    abilityModifiers: { cha: 4 },
    sourceId: "paladin",
    targetIds: ["paladin"],
    currentRound: 1,
    currentTurnKey: "1:paladin",
    instanceId: "glorious-1",
  });
  assert.equal(activation.ok, true, activation.reason);
  assert.deepEqual(activation.state.resources[GLORIOUS_DEFENSE_POOL], { current: 3, maximum: 4, unlimited: false });
});

test("Incarnazione della Legge e Viandante Velato diventano consumi di risorsa", () => {
  for (const id of [
    "chierico-dominio-dell-ordine-incarnazione-della-legge",
    "ranger-viandante-fatato-viandante-velato",
  ]) {
    assert.equal(feature(id).runtimeSupport.status, "implemented", id);
    assert.equal(feature(id).runtimeSupport.adapter, "resource-only", id);
  }
});

test("il registry Room salva i modificatori come array e li rilegge come oggetto", () => {
  const defaults = (characterBuild) => getEnabledClassFeatures({ characterBuild }).map((entry) => entry.id);
  const profile = sanitizeInitiativeCard({
    characterBuild: paladin,
    [ABILITY_MODIFIERS_FIELD]: { str: 3, cha: 4 },
  });
  const registry = { "name:aldric": { name: "Aldric", updatedAt: 1, profile } };
  const encoded = encodeInitiativeCardRegistryForRoom(registry, defaults);
  assert.deepEqual(encoded["name:aldric"].profile[ABILITY_MODIFIERS_FIELD], [3, null, null, null, null, 4]);
  const decoded = decodeInitiativeCardRegistryFromRoom(encoded, defaults);
  assert.deepEqual(decoded["name:aldric"].profile[ABILITY_MODIFIERS_FIELD], profile[ABILITY_MODIFIERS_FIELD]);
  // Un profilo Room già in forma a oggetto resta leggibile.
  const legacy = decodeInitiativeCardRegistryFromRoom(registry, defaults);
  assert.deepEqual(legacy["name:aldric"].profile[ABILITY_MODIFIERS_FIELD], profile[ABILITY_MODIFIERS_FIELD]);
});

const order = ["hero", "goblin"];
const goblinTurnEnd = [{ current: 1, round: 1 }, { current: 0, round: 2 }];

function turnEndNotice(featureId, card) {
  const [pill] = classFeatureConditionInstancesForActivation(feature(featureId), {
    instanceId: `${featureId}-1`,
    sourceId: "hero",
    targetIds: ["goblin"],
    startedRound: 1,
    startedTurnKey: initiativeTurnKeyAtOrdinal(order, 0),
  }, "Eroe");
  const notices = planEffectSaveReminderNotices({
    items: [
      { id: "hero", name: "Eroe", metadata: { [META_KEY]: { initiativeCard: card } } },
      { id: "goblin", name: "Goblin", metadata: { [META_KEY]: { conditions: { instances: [pill] } } } },
    ],
    previousInitiativeState: { order, ...goblinTurnEnd[0] },
    initiativeState: { order, ...goblinTurnEnd[1] },
    includeCurrentTurnStart: false,
  });
  return notices.find((notice) => notice.timing === "turn-end");
}

test("i popup delle rune e di Squarciare la Mente mostrano la CD dai modificatori della sorgente", () => {
  const runeKnight = { characterBuild: [{ classId: "guerriero", level: 9 }], [ABILITY_MODIFIERS_FIELD]: { con: 3 } };
  for (const id of [
    "guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-fuoco",
    "guerriero-cavaliere-runico-intagliatore-di-rune-runa-della-pietra",
  ]) {
    assert.equal(turnEndNotice(id, runeKnight).dc, 8 + 4 + 3, id);
    assert.equal(turnEndNotice(id, { characterBuild: runeKnight.characterBuild }).dc, undefined, id);
  }
  const soulknife = { characterBuild: [{ classId: "ladro", level: 3 }], [ABILITY_MODIFIERS_FIELD]: { dex: 4, con: 1 } };
  assert.equal(turnEndNotice("ladro-lama-spirituale-squarciare-la-mente", soulknife).dc, 8 + 2 + 4);
});
