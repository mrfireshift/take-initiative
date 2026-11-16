// Lot TD of docs/STUDIO_AZIONI_DI_TURNO.md (decision A6): the data the audit of §10.7 found wrong. The Inquisitive's
// levels, two activations, the revised ranger's two pills with their adapter, and the 2024 stat blocks' Bonus Actions in
// the console's Capacità tab.
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
const { classFeatureConditionInstancesForActivation } = await import("../src/classFeatureCore.js");
const { pcAttackFeatureEntries } = await import("../src/pcAttackPickerCore.js");
const { PC_ATTACK_MONSTER_GROUP_TITLES, pcAttackMonsterTraitEntries } = await import("../src/pcAttackMonsterTraitsCore.js");
const { fiveToolsMonsterToStatblock, fiveToolsStatblockSections } = await import("../src/fiveToolsMonsterCore.js");

test("the Inquisitive: Steady Eye (Occhio di Lince, passive) at the 9th level, Unerring Eye (Occhio Infallibile, action) at the 13th", () => {
  const steady = getClassFeatureDefinition("ladro-indagatore-occhio-di-lince");
  const unerring = getClassFeatureDefinition("ladro-indagatore-occhio-infallibile");
  assert.deepEqual([steady.minimumLevel, steady.activation.primary], [9, "passiva_o_non_specificata"]);
  assert.deepEqual([unerring.minimumLevel, unerring.activation.primary], [13, "azione"]);
  const rogue = (level) => ({ characterBuild: [{ classId: "ladro", level, subclassId: "ladro-indagatore" }] });
  const ids = (level) => pcAttackFeatureEntries(rogue(level)).map((entry) => entry.featureId);
  assert.deepEqual([ids(9).includes(steady.id), ids(9).includes(unerring.id)], [true, false]);
  assert.deepEqual([ids(13).includes(steady.id), ids(13).includes(unerring.id)], [true, true]);
});

test("Hide in Plain Sight takes a minute, One with Shadows an action: no more «reaction»", () => {
  assert.equal(getClassFeatureDefinition("ranger-nascondersi-in-piena-vista").activation.primary, "un_minuto");
  assert.equal(getClassFeatureDefinition("warlock-suppliche-occulte-tutt-uno-con-le-ombre").activation.primary, "azione");
  const ranger = { characterBuild: [{ classId: "ranger", level: 10 }] };
  assert.equal(pcAttackFeatureEntries(ranger).find((entry) => entry.featureId === "ranger-nascondersi-in-piena-vista").activation, "un minuto");
});

test("the revised ranger's Hide in Plain Sight and Animal Companion: their pill, with the condition adapter as the others", () => {
  for (const [id, pill] of [["ranger-revised-nascondersi-in-piena-vista", "Nascosto in Piena Vista"],
    ["ranger-revised-conclave-della-bestia-compagno-animale", "Compagno Animale"]]) {
    const feature = getClassFeatureDefinition(id);
    assert.deepEqual([feature.runtimeSupport.status, feature.runtimeSupport.adapter], ["implemented", "condition"], id);
    // Hide in Plain Sight on the ranger; the companion's pill on the beast chosen.
    const targetIds = feature.targeting.excludeSource ? ["wolf"] : ["kai"];
    const instances = classFeatureConditionInstancesForActivation(feature, { instanceId: `${id}-1`, sourceId: "kai", targetIds }, "Kai");
    assert.deepEqual(instances.map((instance) => instance.condition), [pill], id);
  }
});

// The Multiverse's stat blocks already have the section; the 2024 ones (XMM) the plugin reads only as an option.
test("a stat block's Bonus Actions in the Capacità tab, between the traits and the reactions", () => {
  const goblin = { name: "Goblin Boss", source: "MPMM", size: ["S"], type: "humanoid", ac: [17], hp: { average: 21, formula: "6d6" },
    speed: { walk: 30 }, str: 10, dex: 15, con: 10, int: 10, wis: 8, cha: 10, cr: "1",
    trait: [{ name: "Darkvision", entries: ["The goblin sees in the dark."] }],
    action: [{ name: "Scimitar", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }],
    bonus: [{ name: "Nimble Escape", entries: ["The goblin takes the Disengage or Hide action."] }],
    reaction: [{ name: "Duck", entries: ["The goblin ducks."] }] };
  const entries = pcAttackMonsterTraitEntries(fiveToolsStatblockSections(fiveToolsMonsterToStatblock(goblin).monster));
  assert.deepEqual(entries.map((entry) => [entry.group, entry.label, entry.activation]), [
    ["monster-trait", "Darkvision", ""],
    ["monster-bonus", "Nimble Escape", "azione bonus"],
    ["monster-reaction", "Duck", "reazione"],
  ]);
  assert.equal(PC_ATTACK_MONSTER_GROUP_TITLES["monster-bonus"], "Azioni bonus");
  assert.match(entries[1].text, /Disengage or Hide/u);
});
