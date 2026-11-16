// Lot T4c of docs/STUDIO_AZIONI_DI_TURNO.md (decision A3): the class pills «Invisibile» end when their bearer attacks
// from the console, as Hidden Step's and Fade Away's (pcAttackLinkEnds). Psychic Veil only when the attack deals damage
// or forces a save; Empty Body lasts its minute.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");
const { pcAttackLinkEnds } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const CLOAK_CLERIC = "chierico-dominio-dell-inganno-incanalare-divinita-manto-di-ombre";
const CLOAK_MONK = "monaco-via-dell-ombra-manto-di-ombre";
const MISTY_ESCAPE = "warlock-il-signore-fatato-fuga-velata";
const PSYCHIC_VEIL = "ladro-lama-spirituale-velo-psichico";
const EMPTY_BODY = "monaco-corpo-vuoto";
const invisible = (featureId) => ({ id: "pc", name: "Pg", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, attitude: "pc",
  conditions: { version: 2, instances: [{ id: `pill-${featureId}`, condition: "Invisibile", effectId: featureId, active: true }] } } } });
const orc = { id: "orc", name: "Orco", layer: "CHARACTER", metadata: { [META]: { hp: 15, hpMax: 15, attitude: "enemy" } } };
const ended = (featureId, extra = {}) => pcAttackLinkEnds({ sourceItem: invisible(featureId), targetItem: orc, ...extra })
  .map((end) => [end.featureId, end.reason]);

test("the four class pills end on an attack; Psychic Veil's mark says damage or save; Empty Body none", () => {
  assert.deepEqual([CLOAK_CLERIC, CLOAK_MONK, MISTY_ESCAPE, PSYCHIC_VEIL, EMPTY_BODY].map((id) => getClassFeatureDefinition(id)?.endsOnAttack),
    [true, true, true, "damage-or-save", undefined]);
  assert.equal(getClassFeatureDefinition(CLOAK_CLERIC).effectPlan.conditionName, "Invisibile", "the catalog's own pill, untouched");
});

test("Cloak of Shadows and Misty Escape end with any attack registered by the console, hit or miss", () => {
  for (const featureId of [CLOAK_CLERIC, CLOAK_MONK, MISTY_ESCAPE]) {
    assert.deepEqual(ended(featureId), [[featureId, "Ha attaccato."]], featureId);
    assert.deepEqual(ended(featureId, { damaged: true, attackRoll: true }), [[featureId, "Ha attaccato."]], featureId);
  }
});

test("Psychic Veil ends only on damage dealt or a save forced; a miss keeps it", () => {
  assert.deepEqual(ended(PSYCHIC_VEIL, { attackRoll: true }), [], "a miss: still invisible");
  assert.deepEqual(ended(PSYCHIC_VEIL, { attackRoll: true, damaged: true }), [[PSYCHIC_VEIL, "Ha inflitto danni."]]);
  assert.deepEqual(ended(PSYCHIC_VEIL, { saveForced: true }), [[PSYCHIC_VEIL, "Ha imposto un tiro salvezza."]]);
});

test("Empty Body lasts its minute: an attack does not end it", () => {
  assert.deepEqual(ended(EMPTY_BODY, { damaged: true, attackRoll: true }), []);
});
