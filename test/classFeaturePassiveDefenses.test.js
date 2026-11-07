// Passive class features' damage defenses from the Actor Profile (L3 of the class features' defenses, 06/11): read from
// the catalog while the class, the level and the sheet enable the feature, as a species' traits are; never written on the card.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { CLASS_FEATURE_BY_ID } = await import("../src/classFeatureCatalog.js");
const { classFeatureConditionInstancesForActivation } = await import("../src/classFeatureCore.js");
const { classFeaturePassiveDamageDefenses, damageDefenseFor, damageDefensesForItem, profileDamageDefenses, sanitizeDamageDefenses } =
  await import("../src/damageDefensesCore.js");
const { bossDefendedDamage } = await import("../src/bossActionsViewCore.js");
const { defendedComponents } = await import("../src/bossActionExecutionCore.js");
const { magicalDamageDefensesForItem } = await import("../src/spellDamageDefenseCore.js");

const META = "com.thebigpicture.initiative/meta";
const STORM_HERALD = "barbaro-cammino-dell-araldo-della-tempesta";
const ANIMA_TEMPESTOSA = `${STORM_HERALD}-anima-tempestosa`;
const GENIE = "warlock-il-genio";
const DONO_ELEMENTALE = `${GENIE}-dono-elementale`;
const RUNA_COLLINE = "guerriero-cavaliere-runico-intagliatore-di-rune-runa-delle-colline";

const card = (classId, level, subclassId = "", extra = {}) => ({ characterBuild: [{ classId, level, ...(subclassId ? { subclassId } : {}) }], ...extra });
const configured = (base, ...ids) => ({ ...base, classFeaturesConfigured: true, enabledClassFeatureIds: ids });
const creature = (id, initiativeCard, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER",
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, initiativeCard, ...extra } } });

// [feature, class, subclass, defense kind, types]
const PASSIVES = [
  ["monaco-purezza-del-corpo", "monaco", "", "immunity", ["poison"]],
  ["druido-circolo-della-terra-interdizione-della-natura", "druido", "druido-circolo-della-terra", "immunity", ["poison"]],
  ["chierico-dominio-della-forgia-anima-della-forgia", "chierico", "chierico-dominio-della-forgia", "resistance", ["fire"]],
  ["chierico-dominio-della-forgia-santo-della-forgia-e-del-fuoco", "chierico", "chierico-dominio-della-forgia", "immunity", ["fire"]],
  ["mago-scuola-di-negromanzia-impervio-alla-non-morte", "mago", "mago-scuola-di-negromanzia", "resistance", ["necrotic"]],
  ["stregone-mente-aberrante-difese-psichiche", "stregone", "stregone-mente-aberrante", "resistance", ["psychic"]],
  ["guerriero-guerriero-psionico-scudo-mentale", "guerriero", "guerriero-guerriero-psionico", "resistance", ["psychic"]],
  ["warlock-il-grande-antico-scudo-del-pensiero", "warlock", "warlock-il-grande-antico", "resistance", ["psychic"]],
  ["warlock-l-insondabile-anima-oceanica", "warlock", "warlock-l-insondabile", "resistance", ["cold"]],
  ["warlock-il-celestiale-anima-radiosa", "warlock", "warlock-il-celestiale", "resistance", ["radiant"]],
  ["stregone-stregoneria-della-tempesta-cuore-della-tempesta", "stregone", "stregone-stregoneria-della-tempesta", "resistance", ["lightning", "thunder"]],
  ["stregone-stregoneria-della-tempesta-anima-del-vento", "stregone", "stregone-stregoneria-della-tempesta", "immunity", ["lightning", "thunder"]],
];

test("each passive feature gives its defense from its level on, and not before", () => {
  for (const [featureId, classId, subclassId, kind, types] of PASSIVES) {
    const level = CLASS_FEATURE_BY_ID.get(featureId)?.minimumLevel;
    assert.ok(level, featureId);
    const now = profileDamageDefenses(card(classId, level, subclassId));
    const before = profileDamageDefenses(card(classId, level - 1, subclassId));
    for (const type of types) {
      assert.equal(damageDefenseFor(now, type), kind, `${featureId} at ${level}: ${type}`);
      assert.notEqual(damageDefenseFor(before, type), kind, `${featureId} at ${level - 1}: ${type}`);
    }
  }
});

test("the sheet decides: a feature the GM switched off gives nothing, the Hill Rune only once known", () => {
  const monk = card("monaco", 10);
  assert.deepEqual(profileDamageDefenses(monk).immunities, ["poison"]);
  assert.deepEqual(profileDamageDefenses(configured(monk, "monaco-arti-marziali")).immunities, []);
  const runeKnight = card("guerriero", 7, "guerriero-cavaliere-runico");
  assert.equal(damageDefenseFor(profileDamageDefenses(runeKnight), "poison"), null, "a rune the knight does not know");
  assert.equal(damageDefenseFor(profileDamageDefenses(configured(runeKnight, RUNA_COLLINE)), "poison"), "resistance");
});

test("the option the sheet saves picks the type: Storm Soul's environment, the genie's kind", () => {
  const herald = (level, ...options) => configured(card("barbaro", level, STORM_HERALD), ANIMA_TEMPESTOSA, ...options);
  for (const [environment, type] of [["deserto", "fire"], ["mare", "lightning"], ["tundra", "cold"]]) {
    const option = `${STORM_HERALD}-aura-tempestosa-${environment}`;
    assert.deepEqual(profileDamageDefenses(herald(6, option)).resistances, [type], environment);
    assert.deepEqual(profileDamageDefenses(herald(5, option)).resistances, [], `${environment}: Storm Soul is a 6th-level feature`);
  }
  assert.deepEqual(profileDamageDefenses(herald(6)).resistances, [], "no environment chosen, no resistance");
  for (const [kind, type] of [["dao", "bludgeoning"], ["djinni", "thunder"], ["efreeti", "fire"], ["marid", "cold"]]) {
    const patron = configured(card("warlock", 6, GENIE), DONO_ELEMENTALE, `${GENIE}-lista-degli-incantesimi-espansa-${kind}`);
    assert.deepEqual(profileDamageDefenses(patron).resistances, [type], kind);
  }
});

test("immunity wins over resistance, and the card keeps only what the GM typed", () => {
  const smith = card("chierico", 17, "chierico-dominio-della-forgia", { damageDefenses: { resistances: ["cold"] } });
  const defenses = profileDamageDefenses(smith);
  assert.deepEqual(defenses.immunities, ["fire"]);
  assert.deepEqual(defenses.resistances, ["bludgeoning", "cold", "piercing", "slashing"],
    "Soul of the Forge's fire resistance gives way to the immunity; the heavy armor's nonmagical weapons are L5's");
  assert.deepEqual(sanitizeDamageDefenses(smith.damageDefenses), { immunities: [], resistances: ["cold"], vulnerabilities: [] });
});

test("every reader sees the passive defense, credited to the profile", () => {
  const monk = creature("monk", card("monaco", 10));
  const defenses = damageDefensesForItem(monk, META);
  assert.deepEqual(defenses.immunities, ["poison"]);
  assert.equal(bossDefendedDamage([{ id: "c1", type: "poison" }], { c1: 12 }, "hit", defenses), 0);
  const [component] = defendedComponents([{ id: "c1", type: "poison" }], { c1: 12 }, "full", monk, [], defenses);
  assert.equal(component.amount, 0);
  assert.equal(component.defenseSource, "actor-profile");
  assert.deepEqual(magicalDamageDefensesForItem(monk, META).immunities, ["poison"]);
});

test("the Hill Rune: poison always, and the invoked rune's pill adds the weapons' damage", () => {
  const build = card("guerriero", 7, "guerriero-cavaliere-runico");
  const knight = configured(build, RUNA_COLLINE);
  const [pill] = classFeatureConditionInstancesForActivation(CLASS_FEATURE_BY_ID.get(RUNA_COLLINE),
    { instanceId: "rune-1", sourceId: "knight", targetIds: ["knight"], startedRound: 1 }, "knight", build.characterBuild);
  const invoked = creature("knight", knight, { conditions: { version: 2, instances: [pill] } });
  assert.deepEqual(damageDefensesForItem(creature("knight", knight), META).resistances, ["poison"]);
  assert.deepEqual(damageDefensesForItem(invoked, META).resistances, ["bludgeoning", "piercing", "poison", "slashing"]);
});

test("a card without a class (a monster) gets nothing from the class features", () => {
  assert.equal(classFeaturePassiveDamageDefenses({}), null);
  assert.equal(classFeaturePassiveDamageDefenses({ damageDefenses: { immunities: ["poison"] } }), null);
  assert.equal(classFeaturePassiveDamageDefenses(card("ladro", 20)), null, "no rogue feature gives a damage defense");
});
