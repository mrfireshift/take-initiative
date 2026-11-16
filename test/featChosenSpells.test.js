// Lot F3b-1 of docs/STUDIO_TALENTI.md (decisions S1, S3, S9): the 1st-level spell the Touched feats let choose. A record for
// each candidate (S1), the one the sheet chose cast like a species' innate spell with the slot's use and the feat's DC,
// in the book as "Talento", in the import, and warned about when outside the list.
import assert from "node:assert/strict";
import test from "node:test";
import { FEATS, FEAT_FEATURES, featChoiceSlots, featDisplayName, featFeaturesForProfile, featWarnings, sanitizeFeats } from "../src/featCatalog.js";
import { planSpeciesSpellCost, speciesSpellActionId, speciesSpellCast } from "../src/speciesInnateSpellCore.js";
import { spellbookGroupsForProfile } from "../src/spellbookCatalog.js";
import { creatureCastableSpellIds } from "../src/attackReactionsCore.js";
import { getSpellCatalog, getSpellDefinition } from "../src/spells-srd.js";
import { parseCharacterSheetImport, sheetImportSectionSummary } from "../src/characterSheetImportCore.js";
import { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID } from "../src/classFeatureCatalog.js";
import { FEAT_CANTRIPS, featGrantedSpells, featSpellcastingAbility } from "../src/featCatalog.js";
import { pcAttackResolvedAction, pcAttackSaveLabel, pcAttackSpellBonusTags } from "../src/pcAttackCore.js";
import { pcAttackTargetNotes } from "../src/pcAttackTurnActionCore.js";
import { PC_ATTACK_CANTRIPS } from "../src/pcAttackCantripCatalog.js";
import reference from "../src/spell-reference-it.json" with { type: "json" };
import runtimeReference from "../src/spell-reference-it-runtime.json" with { type: "json" };

const META = "com.thebigpicture.initiative/meta";
const ITALIAN_SCHOOLS = { abiurazione: "abjuration", ammaliamento: "enchantment", divinazione: "divination", evocazione: "conjuration",
  illusione: "illusion", invocazione: "evocation", necromanzia: "necromancy", trasmutazione: "transmutation" };
const catalog = Array.isArray(getSpellCatalog()) ? getSpellCatalog() : Object.values(getSpellCatalog());
const referenceById = new Map((Array.isArray(reference.spells) ? reference.spells : Object.values(reference.spells)).map((spell) => [spell.id, spell]));
const oneAction = new Set(runtimeReference.oneActionIds);
const schoolOf = (spell) => spell.school || ITALIAN_SCHOOLS[String(spell.italianReference?.school || "").toLocaleLowerCase("it")] || "";
const castingKind = (spell) => {
  const time = spell.italianReference?.castingTime || referenceById.get(spell.id)?.castingTime || (oneAction.has(spell.id) ? "1 azione" : "");
  return time === "1 azione" ? "azione" : /^1 azione bonus/u.test(time) ? "azione_bonus" : /^1 reazione/u.test(time) ? "reazione" : "speciale";
};
const card = (feats, extra = {}) => ({ characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { int: 1, wis: 2, cha: 3 }, feats, ...extra });
const fey = (spellId, extra = {}) => card([{ id: "contaminazione-fatata", ability: "cha", choice: { spellIds: [spellId] } }], extra);

test("the Touched feats choose among the catalog's 1st-level spells of their schools, with their casting times", () => {
  for (const [featId, schools] of [["contaminazione-fatata", ["divination", "enchantment"]], ["contaminazione-ombrosa", ["illusion", "necromancy"]]]) {
    const [slot] = featChoiceSlots(featId);
    const expected = catalog.filter((spell) => spell.level === 1 && schools.includes(schoolOf(spell))).map((spell) => spell.id).sort();
    assert.deepEqual(slot.candidates.map((candidate) => candidate.spellId).sort(), expected, featId);
    for (const candidate of slot.candidates) {
      const spell = getSpellDefinition(candidate.spellId);
      assert.equal(candidate.name, spell.displayName || spell.name, candidate.spellId);
      assert.equal(CLASS_FEATURE_BY_ID.get(`talento-${featId}-incantesimo-${candidate.spellId}`).activation.primary, castingKind(spell), candidate.spellId);
    }
  }
  assert.deepEqual(FEATS.filter((entry) => entry.chosenSpells.length).map((entry) => [entry.id, entry.chosenSpells[0].candidates.length]),
    [["iniziato-alla-magia", 73], ["contaminazione-fatata", 19], ["contaminazione-ombrosa", 8], ["rudimenti-da-artefice", 73]]);
});

test("one record per candidate, sharing the slot's use; the profile gets only the chosen one", () => {
  const records = FEAT_FEATURES.filter((feature) => feature.featChoice);
  assert.equal(records.length, 73 + 19 + 8 + 73);
  assert.deepEqual([...new Set(records.map((feature) => feature.trackedResourcePoolIds[0]))],
    ["talento-iniziato-alla-magia-incantesimo-usi", "talento-contaminazione-fatata-incantesimo-usi", "talento-contaminazione-ombrosa-incantesimo-usi",
      "talento-rudimenti-da-artefice-incantesimo-usi"]);
  assert.deepEqual(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("talento-contaminazione-fatata-incantesimo-usi").refresh.map((entry) => entry.event), ["riposo_lungo"]);
  assert.deepEqual(featFeaturesForProfile(fey("phb2014-sortilegio")).map((feature) => feature.id),
    ["talento-contaminazione-fatata", "talento-contaminazione-fatata-passo-velato", "talento-contaminazione-fatata-incantesimo-phb2014-sortilegio"]);
  assert.deepEqual(featFeaturesForProfile(card([{ id: "contaminazione-fatata" }])).map((feature) => feature.id),
    ["talento-contaminazione-fatata", "talento-contaminazione-fatata-passo-velato"], "nothing chosen yet");
  assert.deepEqual(featFeaturesForProfile(fey("fireball")).map((feature) => feature.id).filter((id) => id.includes("incantesimo")), [],
    "a spell outside the list casts nothing");
});

test("the chosen spell is cast with the slot's use and the feat's DC, and the slots can cast it too", () => {
  const profile = fey("phb2014-sortilegio");
  const hex = speciesSpellCast({ actionId: speciesSpellActionId("talento-contaminazione-fatata-incantesimo-phb2014-sortilegio"), card: profile });
  assert.deepEqual([hex.spellId, hex.ability, hex.dc, hex.uses.current, hex.feature.activation.primary],
    ["phb2014-sortilegio", "cha", 14, 1, "azione_bonus"]);
  assert.equal(hex.label, "Incantesimo di talento: Contaminazione Fatata: Sortilegio · CD 14 (Carisma) · usi 1/1");
  assert.equal(planSpeciesSpellCost({ cast: hex, sourceId: "pc", card: profile }).operation.pool.id, "talento-contaminazione-fatata-incantesimo-usi");
  assert.equal(speciesSpellCast({ actionId: speciesSpellActionId("talento-contaminazione-fatata-incantesimo-sleep"), card: profile }), null,
    "another candidate is not the character's");
  const granted = spellbookGroupsForProfile(profile).flatMap((group) => group.spells).filter((spell) => spell.granted);
  assert.deepEqual(granted.map((spell) => [spell.id, spell.granted]),
    [["phb2014-sortilegio", "Talento: Contaminazione Fatata"], ["misty-step", "Talento: Contaminazione Fatata"]]);
  assert.ok(creatureCastableSpellIds({ id: "pc", metadata: { [META]: { initiativeCard: profile } } }).has("phb2014-sortilegio"));
});

test("the sheet names the chosen spell and warns about one outside the list or repeated among the quick actions", () => {
  assert.equal(featDisplayName({ id: "contaminazione-fatata", ability: "cha", choice: { spellIds: ["phb2014-sortilegio"] } }),
    "Contaminazione Fatata · Car · Sortilegio");
  assert.equal(featDisplayName({ id: "contaminazione-ombrosa", choice: { spellIds: ["false-life"] } }), "Contaminazione Ombrosa · Vita falsata");
  assert.deepEqual(featWarnings([{ id: "contaminazione-fatata", choice: { spellIds: ["fireball"] } }]),
    [["L'incantesimo scelto (fireball) non è fra quelli del talento: Incantesimo di 1° (divinazione o ammaliamento)."]]);
  assert.deepEqual(featWarnings([{ id: "contaminazione-ombrosa", choice: { spellIds: ["false-life"] } }], null,
    [{ kind: "spell", spellId: "false-life" }]),
    [["Vita falsata arriva con il talento ed è anche nelle Azioni rapide: toglila da lì, o gli usi contano due volte."]]);
  assert.deepEqual(sanitizeFeats([{ id: "contaminazione-fatata", choice: { spellIds: ["phb2014-sortilegio"] } }])[0].choice,
    { spellIds: ["phb2014-sortilegio"] });
});

test("the import reads the chosen spell in Italian or in English, and reports one outside the list", () => {
  const result = parseCharacterSheetImport(JSON.stringify({ feats: [
    { name: "Fey Touched", ability: "cha", spells: ["Sortilegio"] },
    { name: "Shadow Touched", spell: "False Life" },
    { name: "Contaminazione Fatata", spells: ["Palla di fuoco"] },
    { name: "Robusto", spells: ["Scudo"] },
  ] }));
  assert.deepEqual(result.sections.feats, [
    { id: "contaminazione-fatata", ability: "cha", choice: { spellIds: ["phb2014-sortilegio"] } },
    { id: "contaminazione-ombrosa", choice: { spellIds: ["false-life"] } },
    { id: "robusto" },
  ]);
  assert.deepEqual(result.unresolved, [
    "incantesimo \"Palla di fuoco\" per Contaminazione Fatata (Incantesimo di 1° (divinazione o ammaliamento))",
    "incantesimo \"Scudo\" per Robusto: il talento non ne fa scegliere",
  ]);
  assert.equal(sheetImportSectionSummary("feats", result.sections.feats),
    "3 talenti: Contaminazione Fatata · Car · Sortilegio, Contaminazione Ombrosa · Vita falsata, Robusto");
});

// Lot F3b-2 (decisions S2, S3, S4, S5): Magic Initiate, Artificer Initiate and Wood Elf Magic.
const initiate = (choice, extra = {}) => ({ characterBuild: [{ classId: "guerriero", level: 5 }],
  abilityModifiers: { str: 3, dex: 1, con: 2, int: 2, wis: 1, cha: 0 }, feats: [{ id: "iniziato-alla-magia", choice }], ...extra });

test("Magic Initiate and Artificer Initiate choose among every 1st-level spell of the catalog, every cantrip too", () => {
  const firstLevel = catalog.filter((spell) => spell.level === 1).map((spell) => spell.id).sort();
  for (const featId of ["iniziato-alla-magia", "rudimenti-da-artefice"]) {
    const [slot] = featChoiceSlots(featId);
    assert.deepEqual(slot.candidates.map((candidate) => candidate.spellId).sort(), firstLevel, featId);
    for (const candidate of slot.candidates) {
      assert.equal(CLASS_FEATURE_BY_ID.get(`talento-${featId}-incantesimo-${candidate.spellId}`).activation.primary,
        castingKind(getSpellDefinition(candidate.spellId)), candidate.spellId);
    }
  }
  assert.deepEqual(FEAT_CANTRIPS.map((cantrip) => cantrip.spellId).sort(), catalog.filter((spell) => spell.level === 0).map((spell) => spell.id).sort());
  // Spell Sniper's cantrip and class came with lot F3b-3.
  assert.deepEqual(FEATS.filter((entry) => entry.cantrips).map((entry) => [entry.id, entry.cantrips]),
    [["cecchino-magico", 1], ["iniziato-alla-magia", 2], ["magia-degli-elfi-dei-boschi", 1], ["rudimenti-da-artefice", 1]]);
  const casters = ["bardo", "chierico", "druido", "stregone", "warlock", "mago"];
  assert.deepEqual(FEATS.filter((entry) => entry.classChoices.length).map((entry) => [entry.id, entry.classChoices]),
    [["cecchino-magico", casters], ["iniziato-alla-magia", casters]]);
});

test("Magic Initiate's spells take the chosen class's ability; the cantrips go in the book as «Talento»", () => {
  const wizard = initiate({ classId: "mago", cantripIds: ["fire-bolt", "sacred-flame"], spellIds: ["shield"] });
  const shield = speciesSpellCast({ actionId: speciesSpellActionId("talento-iniziato-alla-magia-incantesimo-shield"), card: wizard });
  assert.deepEqual([shield.ability, shield.dc, shield.feature.activation.primary, shield.feature.trackedResourcePoolIds[0]],
    ["int", 13, "reazione", "talento-iniziato-alla-magia-incantesimo-usi"]);
  assert.deepEqual(featGrantedSpells(wizard), [{ spellId: "shield", source: "Talento: Iniziato alla Magia" },
    { spellId: "fire-bolt", source: "Talento: Iniziato alla Magia" }, { spellId: "sacred-flame", source: "Talento: Iniziato alla Magia" }]);
  const cleric = initiate({ classId: "chierico", cantripIds: ["sacred-flame"] });
  assert.equal(featSpellcastingAbility(cleric, "sacred-flame"), "wis");
  assert.equal(featSpellcastingAbility(initiate({ cantripIds: ["sacred-flame"] }), "sacred-flame"), "int", "no class yet: the highest of Int, Wis, Cha");
  assert.equal(featSpellcastingAbility({ ...wizard, spellbook: { spellIds: ["fire-bolt"] } }, "fire-bolt"), "",
    "a spell of the character's own book keeps the card's numbers");
  assert.equal(featSpellcastingAbility(wizard, "fireball"), "");
  const elf = card([{ id: "magia-degli-elfi-dei-boschi", choice: { cantripIds: ["shillelagh"] } }]);
  assert.deepEqual([featSpellcastingAbility(elf, "shillelagh"), featGrantedSpells(elf)], ["wis", [{ spellId: "shillelagh", source: "Talento: Magia degli Elfi dei Boschi" }]]);
  assert.equal(featSpellcastingAbility(card([{ id: "rudimenti-da-artefice", choice: { cantripIds: ["mending"], spellIds: ["cure-wounds"] } }]), "cure-wounds"), "int");
});

test("the attack console reads a feat's spell with the feat's bonus and DC, any other with the card's (decision S3)", () => {
  const cantrip = (spellId) => pcAttackResolvedAction({ id: `cantrip-${spellId}`, label: spellId, kind: "attack",
    source: { kind: "cantrip", spellIds: [spellId] } }, spellId);
  const fighter = initiate({ classId: "mago", cantripIds: ["fire-bolt", "sacred-flame"] }, { spellSaveDC: 11, spellAttackBonus: 2 });
  assert.deepEqual(pcAttackSpellBonusTags(cantrip("fire-bolt"), fighter), ["+5 al tiro"], "3 of proficiency + 2 of Intelligence");
  assert.equal(pcAttackSaveLabel(cantrip("sacred-flame"), fighter), "TS Destrezza (CD 13)");
  const plain = { ...fighter, feats: [] };
  assert.deepEqual(pcAttackSpellBonusTags(cantrip("fire-bolt"), plain), ["+2 al tiro"]);
  assert.equal(pcAttackSaveLabel(cantrip("sacred-flame"), plain), "TS Destrezza (CD 11)");
});

test("the sheet and the import: the class, the cantrips, the spell; what is outside the lists is reported", () => {
  assert.equal(featDisplayName({ id: "iniziato-alla-magia", choice: { classId: "mago", spellIds: ["shield"] } }), "Iniziato alla Magia · Mago · Scudo");
  assert.deepEqual(featWarnings([{ id: "iniziato-alla-magia", choice: { cantripIds: ["fireball", "fire-bolt"] } }]),
    [["Il trucchetto scelto (fireball) non è un trucchetto del catalogo."]]);
  const result = parseCharacterSheetImport(JSON.stringify({ feats: [
    { name: "Magic Initiate", class: "wizard", cantrips: ["Fire Bolt", "Mano magica", "Luce"], spell: "Scudo" },
    { name: "Artificer Initiate", cantrips: ["Palla di fuoco"], spells: ["Cura ferite"] },
    { name: "Wood Elf Magic", cantrips: ["Druidcraft"] },
    { name: "Iniziato alla Magia", class: "Guerriero" },
  ] }));
  assert.deepEqual(result.sections.feats, [
    { id: "iniziato-alla-magia", choice: { spellIds: ["shield"], classId: "mago", cantripIds: ["fire-bolt", "mage-hand"] } },
    { id: "rudimenti-da-artefice", choice: { spellIds: ["cure-wounds"] } },
    { id: "magia-degli-elfi-dei-boschi", choice: { cantripIds: ["druidcraft"] } },
  ]);
  assert.deepEqual(result.unresolved, [
    "trucchetto \"Luce\" per Iniziato alla Magia (ne fa scegliere 2)",
    "trucchetto \"Palla di fuoco\" per Rudimenti da Artefice",
    "classe \"Guerriero\" per Iniziato alla Magia",
  ]);
});

// Lot F3b-3 (decisions S2, S3, S8): Spell Sniper's class and attack cantrip, and the attack console's reminder.
const sniperCard = (choice, extra = {}) => ({ characterBuild: [{ classId: "ladro", level: 5 }], abilityModifiers: { int: 3, wis: 1, cha: 0 },
  feats: [{ id: "cecchino-magico", choice }], ...extra });
const resolved = (kind, spellId) => pcAttackResolvedAction({ id: `${kind}-${spellId}`, label: spellId, kind: "attack",
  source: { kind, spellIds: [spellId] } }, spellId);

test("Spell Sniper chooses its cantrip among the catalog's with an attack roll: the console's, the blades, Magic Stone", () => {
  const sniper = FEATS.find((entry) => entry.id === "cecchino-magico");
  assert.deepEqual([sniper.cantrips, sniper.spellAbility, sniper.cantripLabel], [1, "class", "Trucchetto con tiro per colpire"]);
  // Every cantrip the attack console casts with an attack roll: a spell attack (no delivery), a blade's weapon attack.
  const consoleAttacks = PC_ATTACK_CANTRIPS.filter((cantrip) => !cantrip.delivery || cantrip.delivery === "weapon").map((cantrip) => cantrip.spellId);
  // Magic Stone (Xanathar) is a ranged spell attack the console does not cast.
  assert.deepEqual(sniper.cantripCandidates.map((cantrip) => cantrip.spellId).sort(), [...consoleAttacks, "xanathar-pietra-magica"].sort());
  for (const cantrip of sniper.cantripCandidates) {
    assert.equal(getSpellDefinition(cantrip.spellId)?.level, 0, cantrip.spellId);
    assert.equal(cantrip.name, FEAT_CANTRIPS.find((entry) => entry.spellId === cantrip.spellId).name);
  }
  // The other feats offer every cantrip.
  for (const id of ["iniziato-alla-magia", "rudimenti-da-artefice", "magia-degli-elfi-dei-boschi"]) {
    assert.equal(FEATS.find((entry) => entry.id === id).cantripCandidates.length, FEAT_CANTRIPS.length, id);
  }
});

test("Spell Sniper's cantrip is cast with the class's ability; the console reminds the doubled range and the cover", () => {
  const sniper = sniperCard({ classId: "mago", cantripIds: ["fire-bolt"] }, { spellAttackBonus: 2 });
  assert.equal(featSpellcastingAbility(sniper, "fire-bolt"), "int");
  assert.deepEqual(featGrantedSpells(sniper), [{ spellId: "fire-bolt", source: "Talento: Cecchino Magico" }]);
  assert.deepEqual(pcAttackSpellBonusTags(resolved("cantrip", "fire-bolt"), sniper), ["+6 al tiro"], "3 of proficiency + 3 of Intelligence");
  const notes = (attack, profile = sniper) => pcAttackTargetNotes({ attack, targetItem: { id: "goblin", metadata: {} },
    sourceItem: { id: "pc", metadata: { [META]: { initiativeCard: profile } } } });
  const cover = "l'attacco ignora mezza copertura e tre quarti di copertura";
  assert.deepEqual(notes(resolved("cantrip", "fire-bolt")), [`Cecchino Magico: gittata 72 m invece di 36 m; ${cover}.`]);
  assert.deepEqual(notes(resolved("spell", "phb2014-globo-cromatico")), [`Cecchino Magico: gittata 54 m invece di 27 m; ${cover}.`],
    "a leveled spell, any spell with an attack roll");
  assert.deepEqual(notes(resolved("cantrip", "phb2014-frusta-di-spine")), ["Cecchino Magico: gittata 18 m invece di 9 m."],
    "a melee spell attack with a range: no cover");
  assert.deepEqual(notes(resolved("cantrip", "produce-flame")), [`Cecchino Magico: ${cover}.`], "range Self: no range to double");
  for (const attack of [resolved("cantrip", "shocking-grasp"), resolved("spell", "inflict-wounds"), resolved("cantrip", "sacred-flame"),
    resolved("spell", "magic-missile")]) {
    assert.deepEqual(notes(attack), [], "touch, a save, an automatic hit");
  }
  const bow = pcAttackResolvedAction({ id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ id: "c1", type: "piercing" }] });
  assert.deepEqual(notes(bow), [], "a weapon");
  assert.deepEqual(notes(resolved("cantrip", "fire-bolt"), { ...sniper, feats: [] }), [], "without the feat");
});

test("Spell Sniper on the sheet and in the import: a cantrip without an attack roll is kept with a warning, or reported", () => {
  assert.equal(featDisplayName({ id: "cecchino-magico", choice: { classId: "warlock", cantripIds: ["eldritch-blast"] } }), "Cecchino Magico · Warlock");
  assert.deepEqual(featWarnings([{ id: "cecchino-magico", choice: { cantripIds: ["light"] } }]),
    [["Il trucchetto scelto (Luce) non è fra quelli del talento: Trucchetto con tiro per colpire."]]);
  // Kept, it reaches the book: the GM decides (decision D8).
  assert.deepEqual(featGrantedSpells(sniperCard({ cantripIds: ["light"] })), [{ spellId: "light", source: "Talento: Cecchino Magico" }]);
  const result = parseCharacterSheetImport(JSON.stringify({ feats: [{ name: "Spell Sniper", class: "Warlock", cantrips: ["Luce", "Eldritch Blast"] }] }));
  assert.deepEqual(result.sections.feats, [{ id: "cecchino-magico", choice: { classId: "warlock", cantripIds: ["eldritch-blast"] } }]);
  assert.deepEqual(result.unresolved, ["trucchetto \"Luce\" per Cecchino Magico (fuori dalla lista: trucchetto con tiro per colpire)"]);
});
