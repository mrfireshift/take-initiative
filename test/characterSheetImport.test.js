// Character sheet import: a JSON block from a character sheet read into sections for the sheet editor.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const {
  SHEET_IMPORT_SECTIONS,
  mergeImportedSpellbook,
  parseCharacterSheetImport,
  sheetImportSectionSummary,
} = await import("../src/characterSheetImportCore.js");

const read = (data) => parseCharacterSheetImport(JSON.stringify(data));

test("an unreadable or empty block is reported, never thrown", () => {
  assert.match(parseCharacterSheetImport("non json").error, /non leggibile/);
  assert.match(parseCharacterSheetImport("[1, 2]").error, /oggetto JSON/);
  assert.match(read({ name: "Nyx" }).error, /nessun dato/);
  assert.deepEqual(read({ name: "Nyx" }).sections, {});
});

test("classes in Italian or English, with subclasses by full or partial name", () => {
  const { sections, unresolved } = read({
    classes: [
      { class: "Wizard", level: 5, subclass: "Divinazione" },
      { class: "Guerriero", level: "2", subclass: "Campione" },
      { class: "Artefice", level: 3 },
      { class: "Ladro", level: 1, subclass: "Phantom" },
    ],
  });
  assert.deepEqual(sections.classes, [
    { classId: "mago", level: 5, subclassId: "mago-scuola-di-divinazione" },
    { classId: "guerriero", level: 2, subclassId: "guerriero-campione" },
    { classId: "ladro", level: 1, subclassId: "" },
  ]);
  assert.deepEqual(unresolved, ['classe "Artefice"', 'sottoclasse "Phantom"']);
  assert.deepEqual(read({ class: "Bardo", level: 3 }).sections.classes, [{ classId: "bardo", level: 3, subclassId: "" }]);
});

test("species: by name, alias or option; one outside the catalog is reported", () => {
  assert.deepEqual(read({ species: { name: "Dragonide cromatico", ancestry: "Bianco" } }).sections.species,
    { id: "dragonide-cromatico", ancestryId: "bianco" });
  assert.deepEqual(read({ species: "Elfo oscuro (drow)" }).sections.species, { id: "elfo", ancestryId: "drow" });
  assert.deepEqual(read({ race: "Hill Dwarf" }).sections.species, { id: "nano", ancestryId: "colline" });
  assert.deepEqual(read({ species: { name: "Elf", subrace: "Wood Elf" } }).sections.species, { id: "elfo", ancestryId: "boschi" });
  assert.deepEqual(read({ species: "Tiefling" }).sections.species, { id: "tiefling", ancestryId: "" });
  assert.equal(sheetImportSectionSummary("species", { id: "elfo", ancestryId: "drow" }), "Elfo oscuro (drow)");
  assert.equal(sheetImportSectionSummary("species", { id: "elfo", ancestryId: "" }), "Elfo · sottorazza da scegliere");
  assert.equal(sheetImportSectionSummary("species", { id: "tiefling", ancestryId: "" }), "Tiefling");
  const autognome = read({ species: "Autognome", armorClass: 12 });
  assert.equal(autognome.sections.species, undefined);
  assert.match(autognome.unresolved[0], /specie "Autognome"/);
  assert.match(read({ species: { name: "Elfo", subrace: "Elfo marino" } }).unresolved[0], /sottorazza "Elfo marino"/);
});

test("species in more than one manual: source picks the version, else the first with a note", () => {
  assert.deepEqual(read({ species: { name: "Aasimar", source: "Mostri del Multiverso" } }).sections.species, { id: "aasimar-multiverso", ancestryId: "" });
  assert.deepEqual(read({ species: { name: "Firbolg", source: "MotM" } }).sections.species, { id: "firbolg-multiverso", ancestryId: "" });
  const volo = read({ species: "Firbolg" });
  assert.deepEqual(volo.sections.species, { id: "firbolg", ancestryId: "" });
  assert.match(volo.unresolved[0], /più manuali: usata Guida di Volo ai Mostri/);
  assert.deepEqual(read({ species: { name: "Tiefling", source: "Tomo dei Nemici", subrace: "Zariel" } }).sections.species, { id: "tiefling-stirpe", ancestryId: "zariel" });
  assert.deepEqual(read({ species: { name: "Aasimar", subrace: "Fallen" } }).sections.species, { id: "aasimar", ancestryId: "caduto" });
  assert.deepEqual(read({ species: "Yuan-ti Pureblood" }).sections.species, { id: "yuan-ti", ancestryId: "" });
  assert.match(read({ species: { name: "Goblin", source: "Strixhaven" } }).unresolved[0], /manuale "Strixhaven"/);
  assert.deepEqual(read({ species: { name: "Minotaur", source: "Theros" } }).sections.species, { id: "minotauro", ancestryId: "" });
  assert.deepEqual(read({ species: { name: "Minotaur", source: "MotM" } }).sections.species, { id: "minotauro-multiverso", ancestryId: "" });
  assert.deepEqual(read({ species: "Simic Hybrid" }).sections.species, { id: "ibrido-simic", ancestryId: "" });
  assert.deepEqual(read({ species: { name: "Fairy", source: "Monsters of the Multiverse" } }).sections.species, { id: "fata", ancestryId: "" });
  assert.equal(read({ species: "Harengon" }).unresolved.length, 0, "one entry, no ambiguity");
  assert.deepEqual(read({ species: { name: "Tortle", source: "MotM" } }).sections.species, { id: "tortle-multiverso", ancestryId: "" });
  assert.deepEqual(read({ species: { name: "Tortle", source: "The Tortle Package" } }).sections.species, { id: "tortle", ancestryId: "" });
  const dragonborn = read({ species: { name: "Dragonborn", ancestry: "Red" } });
  assert.deepEqual(dragonborn.sections.species, { id: "dragonide", ancestryId: "rosso" }, "English ancestry names too");
  assert.equal(dragonborn.unresolved.some((line) => /più manuali/.test(line)), false, "the Wildemount variant does not make Dragonborn ambiguous");
  assert.deepEqual(read({ species: "Ravenite" }).sections.species, { id: "dragonide-wildemount", ancestryId: "ravenite" });
  assert.deepEqual(read({ species: { name: "Sea Elf", source: "Wildemount" } }).sections.species, { id: "elfo-marino", ancestryId: "" });
  assert.deepEqual(read({ species: { name: "Goblin", source: "Eberron" } }).sections.species, { id: "goblin", ancestryId: "" }, "same traits as Volo");
  assert.deepEqual(read({ species: "Mark of Shadow" }).sections.species, { id: "marchio-del-drago", ancestryId: "ombra" });
  assert.deepEqual(read({ species: { name: "Shifter", subrace: "Wildhunt", source: "MotM" } }).sections.species, { id: "shifter-multiverso", ancestryId: "caccia-selvaggia" });
  assert.equal(sheetImportSectionSummary("species", { id: "marchio-del-drago", ancestryId: "ombra" }), "Marchio dell'ombra (elfo)");
  assert.deepEqual(read({ species: { name: "Goliath", source: "Elemental Evil" } }).sections.species, { id: "goliath", ancestryId: "" }, "same text as Volo");
  assert.deepEqual(read({ species: { name: "Duergar", source: "SCAG" } }).sections.species, { id: "duergar", ancestryId: "" });
  assert.deepEqual(read({ species: { name: "Genasi", subrace: "Fire", source: "MotM" } }).sections.species, { id: "genasi-multiverso", ancestryId: "fuoco" });
  assert.deepEqual(read({ species: { name: "Tiefling", source: "Sword Coast", variant: "Winged" } }).sections.species, { id: "tiefling-variante", ancestryId: "alato" });
  assert.deepEqual(read({ species: "Ghostwise Halfling" }).sections.species, { id: "halfling-spettrale", ancestryId: "" });
  assert.deepEqual(read({ species: "Sun Elf" }).sections.species, { id: "elfo", ancestryId: "alto" });
  assert.equal(sheetImportSectionSummary("species", { id: "tiefling-variante", ancestryId: "alato" }), "Tiefling (alato)");
});

test("statistics: numbers or text, speed in metres or feet", () => {
  const { sections } = read({ armorClass: "15", speed: "30 ft", passivePerception: 13, spellSaveDC: 15, spellAttackBonus: "+7" });
  assert.deepEqual(sections.stats, { armorClass: 15, speed: 9, passivePerception: 13, spellSaveDC: 15, spellAttackBonus: 7 });
  assert.equal(read({ speed: "9 m" }).sections.stats.speed, 9);
  assert.equal(read({ speed: 10.5 }).sections.stats.speed, 10.5);
  assert.equal(read({ spellAttackBonus: "-1" }).sections.stats.spellAttackBonus, -1);
  assert.equal(read({ armorClass: "molto alta", notes: "x" }).sections.stats, undefined);
});

test("abilities as scores or modifiers, saves as bonuses; keys in Italian or English", () => {
  const { sections } = read({
    abilities: { FOR: 8, destrezza: { score: 14, modifier: 3 }, con: 14 },
    abilityModifiers: { int: "+4" },
    savingThrows: { INT: "+7", wisdom: 4 },
  });
  assert.deepEqual(sections.abilities, { str: -1, dex: 3, con: 2, int: 4, wis: null, cha: null });
  assert.deepEqual(sections.saves, { str: null, dex: null, con: null, int: 7, wis: 4, cha: null });
  assert.deepEqual(read({ abilityScores: { cha: 17 } }).sections.abilities.cha, 3);
});

test("damage defenses with ids or Italian names", () => {
  const { sections, unresolved } = read({ damageDefenses: { resistances: ["fuoco", "cold", "banana"], immunities: ["veleno"] } });
  assert.deepEqual(sections.defenses, { immunities: ["poison"], resistances: ["cold", "fire"], vulnerabilities: [] });
  assert.deepEqual(unresolved, ['tipo di danno "banana"']);
  assert.deepEqual(read({ resistances: ["necrotici"] }).sections.defenses.resistances, ["necrotic"]);
});

test("spells by name in either language, as a list or by level, with favourites", () => {
  const { sections, unresolved } = read({
    cantrips: ["Fire Bolt"],
    spells: { 1: ["Scudo", { name: "Shield" }], 3: [{ name: "Fireball", pinned: true }, "Incantesimo inventato"] },
  });
  assert.deepEqual(sections.spells, { spellIds: ["fire-bolt", "shield", "fireball"], pinnedIds: ["fireball"] });
  assert.deepEqual(unresolved, ['incantesimo "Incantesimo inventato"']);
});

test("attacks as in the Attacks import, damage types also in Italian", () => {
  const { sections, unresolved } = read({ attacks: [
    { name: "Pugnale", range: "melee", components: [{ type: "perforanti", formula: "1d4+2" }] },
    { label: "Trucchetto", source: { kind: "cantrip", spellIds: ["ray-of-frost"] } },
    { label: "Senza danni", components: [] },
    "testo",
  ] });
  assert.deepEqual(sections.attacks.map((attack) => attack.label), ["Pugnale", "Trucchetto"]);
  assert.deepEqual(sections.attacks[0].components, [{ id: "c1", type: "piercing", formula: "1d4+2" }]);
  assert.equal("id" in sections.attacks[0], false, "the editor gives the ids");
  assert.deepEqual(unresolved, ["2 attacchi non validi"]);
});

test("hit points are not imported: they live in the token's canonical metadata", () => {
  const { sections, error } = read({ hp: 30, hpMax: 38, notes: "Prova" });
  assert.equal(error, "");
  assert.deepEqual(Object.keys(sections), ["notes"]);
});

test("each section has a one-line summary for the panel", () => {
  const { sections } = read({
    classes: [{ class: "Mago", level: 5, subclass: "Divinazione" }],
    species: { name: "Dragonide", ancestry: "Rosso" },
    armorClass: 15, speed: 9, spellAttackBonus: 7,
    abilities: { int: 18 }, damageDefenses: { resistances: ["fire"] },
    spells: ["Shield", "Fireball"], attacks: [{ label: "Pugnale", components: [{ type: "piercing" }] }],
    notes: "Breve",
  });
  const names = {
    classNameOf: () => "Mago",
    subclassNameOf: () => "Scuola di Divinazione",
    spellNameOf: (id) => ({ shield: "Scudo", fireball: "Palla di fuoco" })[id],
  };
  const summary = (id) => sheetImportSectionSummary(id, sections[id], names);
  assert.equal(summary("classes"), "Mago 5 (Scuola di Divinazione)");
  assert.equal(summary("species"), "Dragonide (rosso)");
  assert.equal(summary("stats"), "CA 15 · Velocità 9 m · Attacco incantesimi +7");
  assert.equal(summary("abilities"), "INT +4");
  assert.equal(summary("defenses"), "Res. fuoco");
  assert.equal(summary("spells"), "2 incantesimi: Scudo, Palla di fuoco");
  assert.equal(summary("attacks"), "1 attacco: Pugnale");
  assert.equal(summary("notes"), "Breve");
  assert.deepEqual(SHEET_IMPORT_SECTIONS.map((section) => section.id).filter((id) => !sections[id]), ["saves"]);
});

test("imported spells add to the book or replace it, keeping surviving favourites", () => {
  const current = { spellIds: ["shield", "bless"], pinnedIds: ["bless"] };
  const imported = { spellIds: ["fireball", "shield"], pinnedIds: ["fireball"] };
  assert.deepEqual(mergeImportedSpellbook(current, imported, "add"),
    { spellIds: ["shield", "bless", "fireball"], pinnedIds: ["bless", "fireball"] });
  assert.deepEqual(mergeImportedSpellbook(current, imported, "replace"),
    { spellIds: ["fireball", "shield"], pinnedIds: ["fireball"] });
});

test("the sheet editor offers the import only to the GM, while editing", () => {
  const source = readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../initiative-card-modal.html", import.meta.url), "utf8");
  assert.match(html, /id="sheetImportToggle"[^>]*hidden/);
  assert.match(html, /<form id="form"[^>]*>\s*<section id="sheetImport"/);
  assert.match(source, /\$\("sheetImportToggle"\)\.hidden = !isGM \|\| !editing/);
});

test("an imported spell marked prepared: false stays in the book as unprepared", () => {
  const { sections } = read({ spells: ["Shield", { name: "Fireball", prepared: false }] });
  assert.deepEqual(sections.spells, { spellIds: ["shield", "fireball"], pinnedIds: [], unpreparedIds: ["fireball"] });
  const current = { spellIds: ["fireball", "bless"], pinnedIds: [], unpreparedIds: ["bless", "fireball"] };
  const imported = { spellIds: ["fireball", "shield"], pinnedIds: [] };
  assert.deepEqual(mergeImportedSpellbook(current, imported, "add"),
    { spellIds: ["fireball", "bless", "shield"], pinnedIds: [], unpreparedIds: ["bless"] }, "the import says Fireball is prepared");
  assert.deepEqual(mergeImportedSpellbook(current, { ...imported, unpreparedIds: ["shield"] }, "replace"),
    { spellIds: ["fireball", "shield"], pinnedIds: [], unpreparedIds: ["shield"] });
});
