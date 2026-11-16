// Lot F9-1 of docs/STUDIO_TALENTI.md: the options a feat borrows from a class. Fighting Initiate's fighting style and
// Eldritch Adept's invocation are chosen on the sheet (choice.optionIds, the last part of the class records' ids) and
// become cards of the feat, copied from the class's records, with the option's text; an invocation above the character's
// warlock level is warned about (decision D8); the sheet's import reads them by name. The expectations come from the
// 2014 texts (Tasha) and the study, not from the definitions under test.
import test from "node:test";
import assert from "node:assert/strict";
import { FEAT_OPTION_FEATURES, featBorrowedCandidates, featBorrowedWarnings, getClassFeatureDefinition, getEnabledClassFeatures }
  from "../src/classFeatureCatalog.js";
import { classFeatureDescription, loadClassFeatureDescriptions } from "../src/classFeatureDescriptions.js";
import { isReactionClassFeature } from "../src/reactionTrackerCore.js";
import { FEATS, featBorrowedSlot, featChosenOptionIds, featPluginLine } from "../src/featCatalog.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";

const sheet = (feats, characterBuild = [{ classId: "guerriero", level: 3 }]) => ({ characterBuild, classFeaturesConfigured: true,
  enabledClassFeatureIds: [], feats });

test("the two feats borrow from the fighter's styles and the warlock's invocations, one option each", () => {
  assert.deepEqual(featBorrowedSlot("rudimenti-da-guerriero"), { key: "stile", label: "Stile di combattimento", count: 1,
    parentFeatureId: "guerriero-stile-di-combattimento" });
  assert.deepEqual(featBorrowedSlot("adepto-occulto").count, 1);
  assert.equal(featBorrowedSlot("robusto"), null);
  // The six styles of the Player's Handbook, the 46 invocations of the Handbook and Xanathar in the catalog.
  assert.deepEqual(featBorrowedCandidates("rudimenti-da-guerriero").map((option) => option.name),
    ["Combattere con Armi Possenti", "Combattere con Due Armi", "Difesa", "Duellare", "Protezione", "Tiro"]);
  assert.equal(featBorrowedCandidates("adepto-occulto").length, 46);
  // And the eight metamagic options of Metamagic Adept (lot F9-2, test/featMetamagicAdept.test.js), the sixteen
  // maneuvers of Martial Adept (lot F9-3, test/featMartialAdept.test.js).
  assert.equal(FEAT_OPTION_FEATURES.length, 6 + 46 + 8 + 16);
  assert.deepEqual(featBorrowedCandidates("adepto-occulto").find((option) => option.slug === "fardello-mentale"),
    { slug: "fardello-mentale", name: "Fardello Mentale", featureId: "talento-adepto-occulto-fardello-mentale", minimumLevel: 5 });
});

test("only the options chosen are cards of the sheet, copied from the class's records", () => {
  const card = sheet([{ id: "rudimenti-da-guerriero", choice: { optionIds: ["protezione"] } },
    { id: "adepto-occulto", choice: { optionIds: ["vista-del-diavolo", "fardello-mentale"] } }]);
  const enabled = getEnabledClassFeatures(card).filter((feature) => feature.featOption).map((feature) => feature.id);
  assert.deepEqual(enabled, ["talento-rudimenti-da-guerriero-protezione", "talento-adepto-occulto-vista-del-diavolo"], "one each");
  const protection = getClassFeatureDefinition("talento-rudimenti-da-guerriero-protezione");
  assert.deepEqual([protection.name, protection.featId, protection.sourceFeatureId, protection.source, protection.page, protection.collection],
    ["Rudimenti da Guerriero: Protezione", "rudimenti-da-guerriero", "guerriero-stile-di-combattimento-protezione", "phb2014", 72, "talenti"]);
  // Protection is a reaction: the attack console's "Usa reazione".
  assert.equal(isReactionClassFeature(protection), true);
  assert.equal(featPluginLine(protection, card), "", "the option's card shows the option's text, not the feat's line");
  assert.deepEqual(featChosenOptionIds({ id: "adepto-occulto", choice: { optionIds: ["vista-del-diavolo", "vista-del-diavolo", "Bad Id"] } }),
    ["vista-del-diavolo"]);
});

test("the option's card has the option's text", async () => {
  await loadClassFeatureDescriptions();
  const style = getClassFeatureDefinition("talento-rudimenti-da-guerriero-combattere-con-due-armi");
  const own = classFeatureDescription(getClassFeatureDefinition("guerriero-stile-di-combattimento-combattere-con-due-armi"));
  assert.ok(own.length > 20, "the SRD text of the style");
  assert.equal(classFeatureDescription(style), own);
});

test("an invocation above the character's warlock level is warned about, never blocked (decision D8)", () => {
  const entry = { id: "adepto-occulto", choice: { optionIds: ["fardello-mentale"] } };
  assert.deepEqual(featBorrowedWarnings(entry, [{ classId: "guerriero", level: 8 }]),
    ["Fardello Mentale chiede un warlock di 5° livello: i prerequisiti li controlla il GM."]);
  assert.deepEqual(featBorrowedWarnings(entry, [{ classId: "warlock", level: 5 }]), []);
  assert.deepEqual(featBorrowedWarnings({ id: "adepto-occulto", choice: { optionIds: ["vista-del-diavolo"] } }, []), []);
  assert.equal(getEnabledClassFeatures(sheet([entry])).some((feature) => feature.id === "talento-adepto-occulto-fardello-mentale"), true,
    "the card is there anyway");
});

test("the sheet's import reads the style and the invocation by name", () => {
  const imported = (entry) => parseCharacterSheetImport(JSON.stringify({ name: "Pg", feats: [entry] }));
  assert.deepEqual(imported({ name: "Fighting Initiate", style: "Difesa" }).sections.feats,
    [{ id: "rudimenti-da-guerriero", choice: { optionIds: ["difesa"] } }]);
  assert.deepEqual(imported({ name: "Adepto Occulto", supplica: "Vista del Diavolo" }).sections.feats,
    [{ id: "adepto-occulto", choice: { optionIds: ["vista-del-diavolo"] } }]);
  assert.deepEqual(imported({ name: "Adepto Occulto", supplica: "Inesistente" }).unresolved, ["opzione \"Inesistente\" per Adepto Occulto"]);
  assert.deepEqual(imported({ name: "Robusto", stile: "Difesa" }).unresolved, ["opzione \"Difesa\" per Robusto: il talento non ne fa scegliere"]);
  assert.deepEqual(imported({ name: "Rudimenti da Guerriero", options: ["Difesa", "Tiro"] }).unresolved,
    ["opzione \"Tiro\" per Rudimenti da Guerriero (ne fa scegliere 1)"]);
});

test("the two feats' lines say where the option is", () => {
  const line = (id) => FEATS.find((entry) => entry.id === id).plugin;
  assert.match(line("rudimenti-da-guerriero"), /^Lo stile di combattimento scelto nei Talenti della scheda è una card di questo talento/u);
  assert.match(line("adepto-occulto"), /^La supplica scelta nei Talenti della scheda è una card di questo talento, con il suo testo\./u);
});
