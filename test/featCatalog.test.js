// Lot F0 of docs/STUDIO_TALENTI.md: the feats of the PHB 2014, Xanathar and Tasha as records with the class-feature
// shape, the sheet's optional field, the import, Fortunato's points and the cards' line "Nel plugin".
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hasPrivateDir, privateDir } from "../scripts/privateSources.mjs";
import rulesReference from "../src/rules-reference-it.json" with { type: "json" };

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const {
  FEATS, FEAT_FEATURES, FEAT_RESOURCE_POOLS, MAX_FEATS, featDisplayName, featFeaturesForProfile, featPluginLine, featSlug,
  featWarnings, getFeat, hasFeats, sanitizeFeats,
} = await import("../src/featCatalog.js");
const {
  CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID, CLASS_FEATURES, buildClassFeatureContextEntries, getAvailableClassFeatures,
  getEnabledClassFeatures,
} = await import("../src/classFeatureCatalog.js");
const { classFeatureIsReferenceOnly, classFeatureRuntimeSupport } = await import("../src/classFeatureCore.js");
const { sanitizeInitiativeCard, hasInitiativeCardValues } = await import("../src/initiativeCards.js");
const { parseCharacterSheetImport, sheetImportSectionSummary, SHEET_IMPORT_SECTIONS } = await import("../src/characterSheetImportCore.js");
const { packInitiativeCardRegistryForRoom, unpackInitiativeCardRegistryFromRoom } = await import("../src/initiativeCardRegistryCore.js");
const { jsonBytes } = await import("../src/roomMetadataBudget.js");
const { classFeatureDescription, classFeatureMissingText, loadClassFeatureDescriptions } = await import("../src/classFeatureDescriptions.js");

const PRIVATE_TEXTS = { skip: !hasPrivateDir() && "sorgenti private assenti" };
const feature = (featId) => FEAT_FEATURES.find((entry) => entry.featId === featId);
const fighter = (level, extra = {}) => ({ characterBuild: [{ classId: "guerriero", level, subclassId: "" }], ...extra });

test("the catalog holds the 72 feats of the three manuals, 34 of them half feats", () => {
  const count = (source, filter = () => true) => FEATS.filter((entry) => entry.source === source && filter(entry)).length;
  assert.deepEqual([count("phb2014"), count("xanathar"), count("tasha")], [42, 15, 15]);
  const half = (entry) => entry.abilityChoices.length > 0;
  assert.deepEqual([count("phb2014", half), count("xanathar", half), count("tasha", half)], [13, 11, 10]);
  assert.equal(new Set(FEATS.map((entry) => entry.id)).size, 72);
  assert.deepEqual(FEATS.filter((entry) => entry.repeatable).map((entry) => entry.id), ["adepto-elementale"]);
  // Xanathar's are the racial feats, and only they ask for a species.
  assert.deepEqual(FEATS.filter((entry) => entry.speciesIds.length).map((entry) => entry.source), Array(15).fill("xanathar"));
  for (const entry of FEATS) {
    assert.equal(entry.id, featSlug(entry.name), entry.name);
    assert.match(entry.rulesEntryId, new RegExp(`^(phb|xge|tce)-${entry.id}$`, "u"));
    assert.ok(Number.isInteger(entry.page) && entry.page >= 73 && entry.page <= 170, entry.id);
    assert.ok(entry.english && entry.aliases.includes(entry.english), entry.id);
    assert.ok(entry.plugin.length > 10 && entry.plugin.length < 220, entry.id);
  }
  // The 23 feats of lot F0, the 9 of lot F1, the 7 of lot F3a, Magic Initiate and Artificer Initiate (lot F3b-2), Spell
  // Sniper (lot F3b-3), Ritual Caster (lot F3b-4), Inspiring Leader and Chef (lot F5-1), Healer (lot F5-2), Durable
  // (lot F5-3), Defensive Duelist, Fade Away and Second Chance (lot F6-1), Sentinel (lot F6-2), Polearm Master (lot F6-3),
  // Mage Slayer and War Caster (lot F6-4), Flames of Phlegethos (lot F6-5), Fighting Initiate and Eldritch Adept (lot
  // F9-1), Metamagic Adept (lot F9-2), Martial Adept (lot F9-3), Dragon Fear (lot F9-4), Mobile and Squat Nimbleness (lot
  // F2-1), Infernal Constitution and Poisoner (lot F7-1), Elemental Adept (lot F7-2) have a line of their own; the others
  // wait for their lot.
  assert.equal(FEATS.filter((entry) => !entry.plugin.startsWith("Per ora solo riferimento")).length,
    23 + 9 + 7 + 2 + 1 + 1 + 2 + 1 + 1 + 3 + 1 + 1 + 2 + 1 + 2 + 1 + 1 + 1 + 2 + 2 + 1);
});

test("feats resolve by id like the species traits, but stay out of the class catalog", () => {
  // One record per feat, one for each second effect (the criticals of Slasher and Crusher, lot F1), one for each spell
  // a feat grants (lot F3a, test/featSpells.test.js) and one for each spell a feat lets choose: the Touched feats' (lot
  // F3b-1), Magic Initiate's and Artificer Initiate's (lot F3b-2), in test/featChosenSpells.test.js; Telekinetic's shove
  // (lot F3b-5, test/featTelekineticShove.test.js); Inspiring Leader's speech and the Chef's treat (lot F5-1,
  // test/featTemporaryHp.test.js); Healer's cure (lot F5-2, test/featHealer.test.js); Fade Away's pill (lot F6-1,
  // test/featReactions.test.js); Sentinel's speed 0 (lot F6-2, test/featSentinel.test.js); the flames of Phlegethos (lot
  // F6-5, test/featFlames.test.js); Poisoner's potent poison (lot F7-1, test/featInfernalPoisoner.test.js).
  assert.equal(FEAT_FEATURES.length, 72 + 2 + 10 + 19 + 8 + 73 + 73 + 1 + 2 + 1 + 1 + 1 + 1 + 1);
  assert.deepEqual(FEAT_FEATURES.filter((record) => record.featPart && !record.innateSpell).map((record) => record.id),
    ["talento-condottiero-ispiratore-discorso", "talento-guaritore-cura", "talento-sentinella-velocita-zero", "talento-fiamme-di-flegesto-fiamme",
      "talento-scomparire-invisibile", "talento-bisturi-da-battaglia-critico",
      "talento-cuoco-delizia", "talento-maestria-dei-veleni-veleno-potente", "talento-martello-vivente-critico", "talento-telecinesi-spinta"]);
  for (const record of FEAT_FEATURES) {
    assert.ok(record.featPart ? record.id.startsWith(`talento-${record.featId}-`) : record.id === `talento-${record.featId}`, record.id);
    assert.equal(record.collection, "talenti");
    assert.equal(record.classId, "");
    assert.equal(CLASS_FEATURE_BY_ID.get(record.id), record);
    for (const poolId of record.trackedResourcePoolIds) assert.ok(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(poolId), poolId);
  }
  assert.equal(CLASS_FEATURES.some((entry) => entry.featId), false);
  assert.equal(getAvailableClassFeatures([{ classId: "guerriero", level: 20 }]).some((entry) => entry.featId), false);
  // A reference card is not offered by the card's menu; Fortunato is.
  assert.equal(classFeatureIsReferenceOnly(feature("robusto")), true);
  assert.equal(classFeatureIsReferenceOnly(feature("fortunato")), false);
});

test("the sheet's feats follow the species traits, each once; an unknown id gives no record", () => {
  const profile = fighter(5, { species: { id: "halfling", ancestryId: "piedelesto" },
    feats: [{ id: "robusto" }, { id: "adepto-elementale", choice: { damageType: "fire" } }, { id: "adepto-elementale", choice: { damageType: "cold" } },
      { id: "talento-del-futuro" }] });
  const ids = getEnabledClassFeatures(profile).map((entry) => entry.id);
  const firstFeat = ids.findIndex((id) => id.startsWith("talento-"));
  assert.ok(ids.slice(0, firstFeat).some((id) => id.startsWith("specie-halfling-")));
  assert.deepEqual(ids.slice(firstFeat), ["talento-robusto", "talento-adepto-elementale"]);
  assert.deepEqual(featFeaturesForProfile({}), []);
  // With configured class features, the feats stay: they are not in enabledClassFeatureIds.
  assert.ok(getEnabledClassFeatures({ ...profile, classFeaturesConfigured: true, enabledClassFeatureIds: [] })
    .some((entry) => entry.id === "talento-robusto"));
});

test("Fortunato's three points: a button that spends one, back with the long rest", () => {
  const lucky = feature("fortunato");
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("talento-fortunato-punti-usi");
  // Martial Adept's die (lot F9-3) comes first, in the manual's order.
  assert.deepEqual(FEAT_RESOURCE_POOLS.map((entry) => entry.id).slice(0, 3),
    ["talento-adepto-marziale-dado-usi", "talento-fortunato-punti-usi", "talento-furia-orchesca-dado-usi"]);
  assert.deepEqual(pool.capacity, { type: "fixed", value: 3 });
  assert.deepEqual(pool.refresh.map((entry) => entry.event), ["riposo_lungo"]);
  assert.equal(classFeatureRuntimeSupport(lucky).ready, true);
  assert.deepEqual(lucky.resourceCosts, [{ poolId: pool.id, amount: 1 }]);
  const [entry] = buildClassFeatureContextEntries(fighter(3, { feats: [{ id: "fortunato" }] }), null, 1)
    .filter((candidate) => candidate.featureId.startsWith("talento-"));
  assert.equal(entry.featureId, "talento-fortunato");
  assert.deepEqual(entry.resources.map(({ current, maximum }) => [current, maximum]), [[3, 3]]);
});

test("the field keeps its shape only: unknown ids and the choices of a newer client stay", () => {
  assert.deepEqual(sanitizeFeats([
    { id: "robusto" },
    "fortunato",
    { id: "Robusto!" },
    { id: "atleta", ability: "dex" },
    { id: "atleta", ability: "luck" },
    { id: "talento-del-futuro", choice: { spellIds: ["hex", 3, "  "], tier: 2, "bad key": "x", note: "" } },
    null,
  ]), [
    { id: "robusto" },
    { id: "fortunato" },
    { id: "atleta", ability: "dex" },
    { id: "atleta" },
    { id: "talento-del-futuro", choice: { spellIds: ["hex"], tier: 2 } },
  ]);
  assert.equal(sanitizeFeats(Array.from({ length: 30 }, () => ({ id: "robusto" }))).length, MAX_FEATS);
  assert.equal(hasFeats([]), false);
  assert.equal(hasFeats([{ id: "robusto" }]), true);
});

test("the card writes feats only when it has them, like the species", () => {
  assert.equal(Object.hasOwn(sanitizeInitiativeCard({ armorClass: 15 }), "feats"), false, "profiles without feats keep their shape");
  assert.deepEqual(sanitizeInitiativeCard({ feats: [{ id: "robusto" }, { id: "x y" }] }).feats, [{ id: "robusto" }]);
  assert.deepEqual(sanitizeInitiativeCard({ feats: [] }).feats, [], "an emptied list stays, to clear the previous one");
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ feats: [{ id: "robusto" }] })), true);
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ feats: [] })), false);
});

test("a party's feats stay small in the room's registry", () => {
  const card = (index, feats) => ({
    updatedAt: 1_700_000_000_000 + index,
    name: `PG ${index}`,
    profile: sanitizeInitiativeCard({ armorClass: 15 + index, speed: 9, characterBuild: [{ classId: "guerriero", level: 5 }],
      species: { id: "umano", ancestryId: "variante" }, ...(feats ? { feats } : {}) }),
  });
  const party = (withFeats) => Object.fromEntries([0, 1, 2, 3, 4].map((index) => [`pg-${index}`, card(index, withFeats
    ? FEATS.slice(index * 3, index * 3 + 3).map((entry) => ({ id: entry.id, ...(entry.abilityChoices.length > 1 ? { ability: entry.abilityChoices[0] } : {}) }))
    : null)]));
  const packed = packInitiativeCardRegistryForRoom(party(true));
  assert.deepEqual(unpackInitiativeCardRegistryFromRoom(packed)["pg-4"].profile.feats, party(true)["pg-4"].profile.feats);
  const added = jsonBytes(packed) - jsonBytes(packInitiativeCardRegistryForRoom(party(false)));
  assert.ok(added > 0 && added < 400, `${added} byte per 15 talenti`);
});

test("the badge names the feat with its choice; an unknown one says so", () => {
  assert.equal(featDisplayName({ id: "robusto" }), "Robusto");
  assert.equal(featDisplayName({ id: "adepto-elementale", choice: { damageType: "fire" } }), "Adepto Elementale · fuoco");
  assert.equal(featDisplayName({ id: "atleta", ability: "dex" }), "Atleta · Des");
  assert.equal(featDisplayName({ id: "attore", ability: "cha" }), "Attore", "a single ability is no choice");
  assert.equal(featDisplayName({ id: "talento-del-futuro" }), "Talento sconosciuto (talento-del-futuro)");
});

test("Robusto's line is counted on the character's level; a half feat's +1 is already in the modifiers", () => {
  assert.match(featPluginLine(feature("robusto"), fighter(5)), /^\+10 PF massimi al 5° livello/u);
  assert.match(featPluginLine(feature("robusto"), { characterBuild: [{ classId: "mago", level: 12 }, { classId: "guerriero", level: 12 }] }),
    /^\+40 PF massimi al 20° livello/u, "the total level stops at 20");
  assert.match(featPluginLine(feature("robusto"), {}), /^\+2 PF massimi per livello/u, "without classes the level is unknown");
  assert.match(featPluginLine(feature("resiliente"), { feats: [{ id: "resiliente", ability: "con" }] }),
    /Il \+1 a Costituzione è già nei modificatori della scheda\.$/u);
  assert.match(featPluginLine(feature("osservatore"), {}), /Il \+1 a Intelligenza o Saggezza è già/u);
  assert.match(featPluginLine(feature("paura-draconica"), {}), /Il \+1 a Forza, Costituzione o Carisma è già/u);
  assert.equal(featPluginLine(feature("allerta"), {}), getFeat("allerta").plugin);
});

test("the sheet warns, never blocks: another species, a subrace, a feat taken twice", () => {
  const entries = [
    { id: "agilita-tarchiata" },
    { id: "alta-magia-drow" },
    { id: "adepto-elementale", choice: { damageType: "fire" } },
    { id: "adepto-elementale", choice: { damageType: "cold" } },
    { id: "adepto-elementale", choice: { damageType: "fire" } },
    { id: "robusto" },
    { id: "robusto" },
    { id: "talento-del-futuro" },
  ];
  assert.deepEqual(featWarnings(entries, { id: "elfo", ancestryId: "alto" }), [
    ["Richiede: Nano o specie di taglia Piccola."],
    ["Richiede: Elfo (drow)."],
    [],
    [],
    ["Già scelto con lo stesso tipo di danno."],
    [],
    ["Già scelto."],
    [],
  ]);
  assert.deepEqual(featWarnings([{ id: "alta-magia-drow" }, { id: "agilita-tarchiata" }], { id: "elfo", ancestryId: "drow" }),
    [[], ["Richiede: Nano o specie di taglia Piccola."]]);
  assert.deepEqual(featWarnings([{ id: "agilita-tarchiata" }, { id: "fortuna-generosa" }], { id: "halfling-spettrale" }), [[], []]);
  assert.deepEqual(featWarnings([{ id: "tempra-nanica" }], null), [[]], "no species, no warning");
});

test("the import reads feats in Italian or English, with their choices; what it does not know is reported", () => {
  const result = parseCharacterSheetImport(JSON.stringify({ feats: [
    "Robusto",
    "Great Weapon Master",
    { name: "Adepto Elementale", damageType: "fuoco" },
    { name: "Elemental Adept", damageType: "cold" },
    { name: "Fey Touched", ability: "cha" },
    { name: "Atleta", ability: "Destrezza" },
    { name: "Robusto", ability: "str" },
    { name: "Adepto Elementale", damageType: "necrotico" },
    "Volare veloce",
  ] }));
  assert.deepEqual(result.sections.feats, [
    { id: "robusto" },
    { id: "maestro-d-armi-possenti" },
    { id: "adepto-elementale", choice: { damageType: "fire" } },
    { id: "adepto-elementale", choice: { damageType: "cold" } },
    { id: "contaminazione-fatata", ability: "cha" },
    { id: "atleta", ability: "dex" },
    { id: "adepto-elementale" },
  ]);
  assert.deepEqual(result.unresolved, [
    "caratteristica \"str\" per Robusto",
    "tipo di danno \"necrotico\" per Adepto Elementale",
    "talento \"Volare veloce\"",
  ]);
  assert.deepEqual(parseCharacterSheetImport(JSON.stringify({ talenti: "Mobile" })).sections, { feats: [{ id: "mobilita" }] });
  assert.equal(parseCharacterSheetImport(JSON.stringify({ feats: [] })).sections.feats, undefined);
  const ids = SHEET_IMPORT_SECTIONS.map((section) => section.id);
  assert.equal(ids.indexOf("feats"), ids.indexOf("supernaturalGift") + 1, "right after the species and the gift");
  assert.equal(sheetImportSectionSummary("feats", result.sections.feats),
    "7 talenti: Robusto, Maestro d'Armi Possenti, Adepto Elementale · fuoco, Adepto Elementale · freddo, Contaminazione Fatata · Car, Atleta · Des…");
});

test("a feat's text is its manual's entry in the pack, never the plugin's line", async () => {
  const tough = feature("robusto");
  await loadClassFeatureDescriptions();
  // Node has no IndexedDB, so no pack: the sheet points to the Manuale del Giocatore and shows its own line apart.
  assert.equal(classFeatureDescription(tough), "");
  assert.equal(classFeatureMissingText(tough), "phb2014");
  assert.equal(classFeatureMissingText(feature("telepatia")), "tasha");
});

test("Lottatore, the SRD's only feat, shows its SRD text without the pack, word for word the compendium's", async () => {
  const grappler = feature("lottatore");
  const entry = rulesReference.entries.find((candidate) => candidate.id === getFeat("lottatore").srdEntryId);
  assert.equal(entry.section, "talenti");
  assert.equal(entry.topic, "personaggio");
  assert.equal(grappler.srdText, entry.text);
  assert.deepEqual(FEATS.filter((candidate) => candidate.srdText).map((candidate) => candidate.id), ["lottatore"]);
  await loadClassFeatureDescriptions();
  assert.equal(classFeatureDescription(grappler), entry.text);
  assert.equal(classFeatureMissingText(grappler), "");
});

test("every feat's entry is in the GM's private packs", PRIVATE_TEXTS, () => {
  const dir = path.join(privateDir(), "pacchetti");
  const ids = new Set(fs.readdirSync(dir).filter((file) => file.endsWith(".private-pack.json"))
    .flatMap((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).rules?.entries || [])
    .map((entry) => entry.id));
  assert.deepEqual(FEATS.filter((entry) => !ids.has(entry.rulesEntryId)).map((entry) => entry.rulesEntryId), []);
});
