// Lot F3b-5 of docs/STUDIO_TALENTI.md (decision S8): Telekinetic's shove, a card of its own with its DC; the save and the
// move stay the table's, as the shoves of the maneuvers.
import assert from "node:assert/strict";
import test from "node:test";
import { FEATS, FEAT_FEATURES, featFeaturesForProfile, featPartSave, featPluginLine } from "../src/featCatalog.js";
import { CLASS_FEATURE_BY_ID } from "../src/classFeatureCatalog.js";
import { pcAttackFeatureEntries } from "../src/pcAttackPickerCore.js";

const card = (feats, extra = {}) => ({ characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { int: 3, wis: 1, cha: 2 },
  feats, ...extra });
const shove = () => CLASS_FEATURE_BY_ID.get("talento-telecinesi-spinta");

test("Telekinetic's shove is a card of its own: a bonus action with a Strength save, nothing automated", () => {
  const record = shove();
  assert.deepEqual([record.name, record.activation.primary, record.featSave, record.featPart, record.automationLevel, record.effectPlan],
    ["Telecinesi: spinta telecinetica", "azione_bonus", { ability: "str" }, true, "riferimento", null]);
  assert.deepEqual(featFeaturesForProfile(card([{ id: "telecinesi" }])).map((feature) => feature.id),
    ["talento-telecinesi", "talento-telecinesi-spinta", "talento-telecinesi-mano-magica"]);
  assert.deepEqual(featFeaturesForProfile(card([])), [], "without the feat, no card");
  // The only part with a save; the feat's line points to it.
  assert.deepEqual(FEAT_FEATURES.filter((feature) => feature.featSave).map((feature) => feature.id), ["talento-telecinesi-spinta"]);
  assert.match(FEATS.find((entry) => entry.id === "telecinesi").plugin, /La spinta telecinetica ha la sua card, con la CD/u);
});

test("its DC is the half feat's ability: the one chosen, else the highest of Intelligence, Wisdom and Charisma", () => {
  assert.deepEqual(featPartSave(shove(), card([{ id: "telecinesi", ability: "cha" }])),
    { ability: "str", dcAbility: "cha", dc: 13, label: "TS su Forza CD 13 (Carisma)" });
  assert.equal(featPartSave(shove(), card([{ id: "telecinesi" }])).dc, 14, "Intelligence +3");
  assert.equal(featPluginLine(shove(), card([{ id: "telecinesi" }])),
    "TS su Forza CD 14 (Intelligenza): chi lo fallisce si sposta di 1,5 m; il token si sposta a mano.");
  assert.equal(featPluginLine(shove(), { feats: [{ id: "telecinesi" }] }),
    "TS su Forza: per la CD servono il livello e i modificatori nella scheda; il token si sposta a mano.");
  // A part without a save keeps no line of its own: Slasher's critical shows its text.
  const critical = CLASS_FEATURE_BY_ID.get("talento-bisturi-da-battaglia-critico");
  assert.deepEqual([featPartSave(critical, card([])), featPluginLine(critical, card([]))], [null, ""]);
});

test("the attack console lists it among the other features, a bonus action to read", () => {
  const entry = pcAttackFeatureEntries(card([{ id: "telecinesi" }])).find((candidate) => candidate.featureId === "talento-telecinesi-spinta");
  assert.deepEqual([entry.mode, entry.group, entry.activation], ["reference", "other", "azione bonus"]);
});
