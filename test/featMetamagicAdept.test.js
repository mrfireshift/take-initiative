// Lot F9-2 of docs/STUDIO_TALENTI.md (decision D14): Metamagic Adept. Two metamagic options chosen on the sheet become
// cards of the feat that spend its own 2 points, back with a long rest, separate from a sorcerer's, with the sorcerer's
// costs; Twinned Spell asks the spell's level as the sorcerer's does; an option that costs more than the 2 points is
// warned about. The expectations are read from Tasha's and the Player's Handbook's texts, not from the definitions under
// test.
import test from "node:test";
import assert from "node:assert/strict";
import { featBorrowedCandidates, featBorrowedWarnings, getClassFeatureDefinition, getClassFeatureResourcePool, getEnabledClassFeatures }
  from "../src/classFeatureCatalog.js";
import { pcAttackFeatureForm, pcAttackFeatureRequest } from "../src/pcAttackFeatureFormCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { FEATS, featBorrowedPoolId } from "../src/featCatalog.js";

const POINTS = "talento-adepto-di-metamagia-punti-usi";
const option = (slug) => getClassFeatureDefinition(`talento-adepto-di-metamagia-${slug}`);

test("two of the eight options, with 2 points of the feat, back with a long rest", () => {
  assert.equal(featBorrowedCandidates("adepto-di-metamagia").length, 8);
  assert.equal(featBorrowedPoolId("adepto-di-metamagia"), POINTS);
  const pool = getClassFeatureResourcePool(POINTS);
  assert.deepEqual([pool.capacity, pool.refresh.map((entry) => entry.event)], [{ type: "fixed", value: 2 }, ["riposo_lungo"]]);
  assert.deepEqual(getClassFeatureDefinition("talento-adepto-di-metamagia").resourceCosts, [], "the feat's card spends nothing");
  const card = { characterBuild: [{ classId: "mago", level: 4 }], classFeaturesConfigured: true, enabledClassFeatureIds: [],
    feats: [{ id: "adepto-di-metamagia", choice: { optionIds: ["incantesimo-rapido", "incantesimo-celato", "incantesimo-esteso"] } }] };
  assert.deepEqual(getEnabledClassFeatures(card).filter((feature) => feature.featOption).map((feature) => feature.id),
    ["talento-adepto-di-metamagia-incantesimo-rapido", "talento-adepto-di-metamagia-incantesimo-celato"], "two, the third left out");
});

test("each option spends the feat's points with the sorcerer's cost", () => {
  const quickened = option("incantesimo-rapido");
  assert.deepEqual([quickened.name, quickened.runtimeSupport.adapter, quickened.resourceCosts, quickened.trackedResourcePoolIds],
    ["Adepto di Metamagia: Incantesimo Rapido", "resource-only", [{ poolId: POINTS, amount: 2 }], [POINTS]]);
  assert.deepEqual(option("incantesimo-celato").resourceCosts, [{ poolId: POINTS, amount: 1 }]);
  assert.deepEqual(option("incantesimo-raddoppiato").resourceCosts, [{ poolId: POINTS, amount: 1, variable: true, valueInput: "spell-level-0-9" }]);
  // The sorcerer's own cards keep the sorcery points.
  assert.equal(getClassFeatureDefinition("stregone-metamagia-incantesimo-rapido").resourceCosts[0].poolId, "stregone-punti-stregoneria");
});

test("Twinned Spell asks the spell's level and spends the feat's points, as the sorcerer's card spends the sorcery points", () => {
  const twinned = option("incantesimo-raddoppiato");
  const form = pcAttackFeatureForm(twinned, {});
  assert.deepEqual([form.kind, form.twinned, form.fields.map((field) => field.id)], ["activate", true, ["spellLevel"]]);
  assert.deepEqual(pcAttackFeatureRequest(twinned, form, { spellLevel: "2" }, { sourceId: "pc" }).params.resourceValues, { [POINTS]: 2 });
  assert.deepEqual(pcAttackFeatureRequest(twinned, form, { spellLevel: "0" }, { sourceId: "pc" }).params.resourceValues, { [POINTS]: 1 },
    "a cantrip costs 1");
  const sorcerer = getClassFeatureDefinition("stregone-metamagia-incantesimo-raddoppiato");
  assert.deepEqual(pcAttackFeatureRequest(sorcerer, pcAttackFeatureForm(sorcerer, {}), { spellLevel: "2" }, { sourceId: "pc" }).params.resourceValues,
    { "stregone-punti-stregoneria": 2 });
});

test("an option that costs more than the 2 points is warned about (Heightened Spell, 3)", () => {
  assert.deepEqual(featBorrowedWarnings({ id: "adepto-di-metamagia", choice: { optionIds: ["incantesimo-intensificato", "incantesimo-rapido"] } }),
    ["Incantesimo Intensificato costa 3 punti: con i 2 del talento non si usa."]);
  assert.deepEqual(featBorrowedWarnings({ id: "adepto-di-metamagia", choice: { optionIds: ["incantesimo-raddoppiato"] } }), [],
    "Twinned Spell's cost depends on the spell");
});

test("the sheet's import reads the options by name; the feat's line", () => {
  const result = parseCharacterSheetImport(JSON.stringify({ name: "Pg", feats: [{ name: "Metamagic Adept", metamagic: ["Incantesimo Rapido", "Incantesimo Celato"] }] }));
  assert.deepEqual([result.sections.feats, result.unresolved],
    [[{ id: "adepto-di-metamagia", choice: { optionIds: ["incantesimo-rapido", "incantesimo-celato"] } }], []]);
  assert.match(FEATS.find((entry) => entry.id === "adepto-di-metamagia").plugin,
    /^Le due opzioni scelte nei Talenti della scheda sono card di questo talento, che spendono i suoi 2 punti/u);
});
