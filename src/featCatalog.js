// The feats of the Manuale del Giocatore 2014, Xanathar and Tasha (docs/STUDIO_TALENTI.md, lot F0). Pure data: no SDK,
// no metadata writes, no rules text. A feat's text is its manual's entry in the GM's private pack (rulesEntryId, read by
// classFeatureDescriptions.js); the catalog keeps only what the plugin works with and a line of its own, "Nel plugin",
// on what the plugin does with the feat.
//
// Feats use the class-feature record shape, like the species traits (speciesTraitCore.js): they resolve by id, follow the
// species in getEnabledClassFeatures and stay out of CLASS_FEATURES, so the class editor and the catalog audits never
// list them. A feat with a use spends it with a button (Fortunato); the others are reference cards. Their automation
// arrives lot by lot (F1–F9 of the study), on the same records.
//
// The sheet stores initiativeCard.feats: [{ id, ability?, choice? }], written only when used. Its cleaning checks the
// shape, not the catalog: an id this version does not know stays, so an older client never drops a newer one's feats.
// A half feat's +1 is not applied: the sheet stores the modifiers, which already hold it (decision D4).

export const FEATS_FIELD = "feats";
export const MAX_FEATS = 20;
export const FEAT_ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const FEAT_ABILITY_LABELS = Object.freeze({
  str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma",
});
const ABILITY_SHORT = Object.freeze({ str: "For", dex: "Des", con: "Cos", int: "Int", wis: "Sag", cha: "Car" });
// Elemental Adept's types, with the labels of the damage defenses (damageDefensesCore.js).
export const FEAT_DAMAGE_TYPES = Object.freeze([
  Object.freeze({ id: "acid", label: "acido" }),
  Object.freeze({ id: "cold", label: "freddo" }),
  Object.freeze({ id: "fire", label: "fuoco" }),
  Object.freeze({ id: "lightning", label: "fulmine" }),
  Object.freeze({ id: "thunder", label: "tuono" }),
]);

const BOOKS = Object.freeze({
  phb: Object.freeze({ source: "phb2014", sourceLabel: "Manuale del Giocatore 2014", prefix: "phb" }),
  xge: Object.freeze({ source: "xanathar", sourceLabel: "Guida Omnicomprensiva di Xanathar", prefix: "xge" }),
  tce: Object.freeze({ source: "tasha", sourceLabel: "Calderone Omnicomprensivo di Tasha", prefix: "tce" }),
});
// The order of the books in the sheet's dropdown.
export const FEAT_BOOK_SOURCES = Object.freeze(Object.values(BOOKS).map((book) => book.source));

// The species a racial feat of Xanathar asks for, with the versions of the other manuals (a ghostwise halfling is a
// halfling). Only a hint: the sheet warns, never blocks (decision D8).
const DWARVES = ["nano", "duergar", "duergar-multiverso"];
const ELVES = ["elfo", "elfo-marino", "elfo-marino-multiverso", "elfo-pallido", "elfo-astrale", "eladrin", "eladrin-multiverso",
  "shadar-kai", "shadar-kai-multiverso"];
const HALFLINGS = ["halfling", "halfling-spettrale", "halfling-lotusden"];
const GNOMES = ["gnomo", "gnomo-profondita", "gnomo-profondita-multiverso"];
const HALF_ELVES = ["mezzelfo", "mezzelfo-variante"];
const TIEFLINGS = ["tiefling", "tiefling-variante", "tiefling-stirpe"];
const DRAGONBORN = ["dragonide", "dragonide-wildemount", "dragonide-cromatico", "dragonide-metallico", "dragonide-gemma"];
// Squat Nimbleness: a dwarf or a Small species, those that may be Small included (the GM picks the size).
const SMALL = [...HALFLINGS, ...GNOMES, "autognomo", "goblin", "goblin-multiverso", "coboldo", "coboldo-multiverso", "grung", "fata",
  "harengon", "owlin", "kender", "verdan", "lignaggio-personalizzato", "dhampir", "hexblood", "reborn", "plasmoide"];

const ALL_ABILITIES = FEAT_ABILITY_KEYS;
// The line of a feat the plugin leaves to the table, until its lot (F1–F9) automates it.
const LATER = "Per ora solo riferimento: si gestisce al tavolo.";
const AT_TABLE = "Si gestisce al tavolo.";
const ON_SHEET = "Le competenze vanno riportate nella scheda del personaggio.";

// abilities: the abilities a half feat may raise (decision D4: saved, not applied); choices: what the sheet asks with the
// feat; species: the racial feat's species (speciesOptions narrows them to a subrace); pool: a use of its own; srdEntryId
// and srdText: the SRD 5.1's text of the only feat it has, Lottatore, as the rules compendium has it
// (src/rules-reference-it.json): the card shows it when the GM has no pack of the manual.
// Lot F1 (the attack console): effect: the pill the feat's activation puts on the target ({ conditionName, detail,
// timing, movement }), as Lance of Lethargy's; parts: the records of a second effect, "talento-<feat>-<key>" (Slasher's
// critical); naturalWeapon: the attack the card adds, as a species' claws (speciesNaturalWeaponCore.js). pool.rest
// "breve": back with a short rest too.
// Lot F3a (the spells a feat grants, its own and not chosen): spells: [{ key, spellId, name, activation, uses ("lungo",
// "breve", or "" at will), slots (also with the character's slots: the book lists it as "Talento"), self }], each a
// record "talento-<feat>-<key>" cast like a species' innate spell (speciesInnateSpellCore.js); spellAbility: their
// casting ability ("feat": the one the half feat raises, featSpellAbility).
// Lot F3b (decision S1): chosenSpells: the spells the player picks, [{ key, label, candidates, uses, slots }]: a record
// "talento-<feat>-<key>-<spellId>" for each candidate, sharing the slot's use; the sheet's choice.spellIds says which.
// Lot F3b-2: classChoices: the classes whose list it draws from (choice.classId), spellAbility "class" then reads the
// class's ability; cantrips: how many cantrips it lets choose (choice.cantripIds), in the book as "Talento" (decision S2).
const feat = (book, page, name, english, { prerequisite = "", abilities = [], choices = [], species = [], speciesOptions = [],
  repeatable = false, plugin = LATER, pool = null, srdEntryId = "", srdText = "", effect = null, parts = [], naturalWeapon = null,
  spells = [], spellAbility = "", chosenSpells = [], classChoices = [], cantrips = 0 } = {}) => ({
  book, page, name, english, prerequisite, abilities, choices, species, speciesOptions, repeatable, plugin, pool, srdEntryId, srdText,
  effect, parts, naturalWeapon, spells, spellAbility, chosenSpells, classChoices, cantrips,
});
// The six classes Magic Initiate, Spell Sniper and Ritual Caster draw from, with their casting ability (PHB 2014).
const CASTER_CLASSES = ["bardo", "chierico", "druido", "stregone", "warlock", "mago"];
export const FEAT_CLASS_ABILITIES = Object.freeze({ bardo: "cha", chierico: "wis", druido: "wis", stregone: "cha", warlock: "cha", mago: "int" });
export const FEAT_CLASS_LABELS = Object.freeze({ bardo: "Bardo", chierico: "Chierico", druido: "Druido", stregone: "Stregone", warlock: "Warlock", mago: "Mago" });

// The 1st-level spells the Touched feats choose from (Tasha, p. 80): divination or enchantment, illusion or necromancy.
// [spellId, name, casting time when it is not an action]. The spell catalog (spells-srd.js) cannot be imported here: it
// reaches classFeatureCatalog.js, which imports this module. test/featChosenSpells.test.js checks them against it.
const FEY_TOUCHED_SPELLS = [
  ["animal-friendship", "Amicizia con gli animali"],
  ["bane", "Anatema"],
  ["bless", "Benedizione"],
  ["charm-person", "Charme su persone"],
  ["command", "Comando"],
  ["comprehend-languages", "Comprensione dei linguaggi"],
  ["phb2014-duello-obbligato", "Duello Obbligato", "azione_bonus"],
  ["heroism", "Eroismo"],
  ["identify", "Identificare", "speciale"],
  ["detect-evil-and-good", "Individuazione del bene e del male"],
  ["detect-magic", "Individuazione del magico"],
  ["detect-poison-and-disease", "Individuazione delle malattie e dei veleni"],
  ["xanathar-legame-con-le-bestie", "Legame con le Bestie"],
  ["hunters-mark", "Marchio del cacciatore", "azione_bonus"],
  ["speak-with-animals", "Parlare con gli animali"],
  ["hideous-laughter", "Risata incontenibile"],
  ["sleep", "Sonno"],
  ["phb2014-sortilegio", "Sortilegio", "azione_bonus"],
  ["phb2014-sussurri-dissonanti", "Sussurri Dissonanti"],
];
const SHADOW_TOUCHED_SPELLS = [
  ["disguise-self", "Camuffare se stesso"],
  ["silent-image", "Immagine silenziosa"],
  ["xanathar-incuti-paura", "Incuti Paura"],
  ["inflict-wounds", "Infliggi ferite"],
  ["phb2014-raggio-di-infermita", "Raggio di Infermità"],
  ["illusory-script", "Scritto illusorio", "speciale"],
  ["color-spray", "Spruzzo colorato"],
  ["false-life", "Vita falsata"],
];
// Lot F3b-2: the 1st-level spells and the cantrips Magic Initiate, Artificer Initiate and Wood Elf Magic choose from, every
// one of the catalog (decision S4: no class lists, the GM checks them), with the casting time of a 1st-level spell when it
// is not an action. Checked against the catalog by test/featChosenSpells.test.js, like the tables above.
const FIRST_LEVEL_SPELLS = [
  ["alarm", "Allarme", "speciale"],
  ["animal-friendship", "Amicizia con gli animali"],
  ["bane", "Anatema"],
  ["phb2014-armatura-di-agathys", "Armatura di Agathys"],
  ["mage-armor", "Armatura magica"],
  ["xanathar-assorbire-elementi", "Assorbire Elementi", "reazione"],
  ["goodberry", "Bacche benefiche"],
  ["bless", "Benedizione"],
  ["phb2014-braccia-di-hadar", "Braccia di Hadar"],
  ["feather-fall", "Caduta morbida", "reazione"],
  ["disguise-self", "Camuffare se stesso"],
  ["xanathar-catapulta", "Catapulta"],
  ["xanathar-cerimonia", "Cerimonia", "speciale"],
  ["charm-person", "Charme su persone"],
  ["xanathar-colpo-dello-zefiro", "Colpo dello Zefiro", "azione_bonus"],
  ["phb2014-colpo-intrappolante", "Colpo Intrappolante", "azione_bonus"],
  ["xanathar-coltello-di-ghiaccio", "Coltello di Ghiaccio"],
  ["command", "Comando"],
  ["comprehend-languages", "Comprensione dei linguaggi"],
  ["create-or-destroy-water", "Creare o distruggere acqua"],
  ["cure-wounds", "Cura ferite"],
  ["xanathar-dardo-di-caos", "Dardo di Caos"],
  ["magic-missile", "Dardo incantato"],
  ["phb2014-dardo-stregato", "Dardo Stregato"],
  ["guiding-bolt", "Dardo tracciante"],
  ["floating-disk", "Disco fluttuante"],
  ["phb2014-duello-obbligato", "Duello Obbligato", "azione_bonus"],
  ["heroism", "Eroismo"],
  ["divine-favor", "Favore divino", "azione_bonus"],
  ["phb2014-globo-cromatico", "Globo Cromatico"],
  ["identify", "Identificare", "speciale"],
  ["silent-image", "Immagine silenziosa"],
  ["xanathar-incuti-paura", "Incuti Paura"],
  ["detect-evil-and-good", "Individuazione del bene e del male"],
  ["detect-magic", "Individuazione del magico"],
  ["detect-poison-and-disease", "Individuazione delle malattie e dei veleni"],
  ["inflict-wounds", "Infliggi ferite"],
  ["hellish-rebuke", "Intimorire infernale", "reazione"],
  ["entangle", "Intralciare"],
  ["xanathar-legame-con-le-bestie", "Legame con le Bestie"],
  ["faerie-fire", "Luminescenza"],
  ["burning-hands", "Mani brucianti"],
  ["hunters-mark", "Marchio del cacciatore", "azione_bonus"],
  ["tasha-miscela-caustica-di-tasha", "Miscela Caustica di Tasha"],
  ["fog-cloud", "Nube di nebbia"],
  ["thunderwave", "Onda tonante"],
  ["speak-with-animals", "Parlare con gli animali"],
  ["healing-word", "Parola guaritrice", "azione_bonus"],
  ["longstrider", "Passo veloce"],
  ["protection-from-evil-and-good", "Protezione dal bene e dal male"],
  ["phb2014-punizione-collerica", "Punizione Collerica", "azione_bonus"],
  ["phb2014-punizione-incandescente", "Punizione Incandescente", "azione_bonus"],
  ["phb2014-punizione-tonante", "Punizione Tonante", "azione_bonus"],
  ["purify-food-and-drink", "Purificare cibo e bevande"],
  ["phb2014-raffica-di-spine", "Raffica di Spine", "azione_bonus"],
  ["phb2014-raggio-di-infermita", "Raggio di Infermità"],
  ["hideous-laughter", "Risata incontenibile"],
  ["expeditious-retreat", "Ritirata rapida", "azione_bonus"],
  ["jump", "Saltare"],
  ["sanctuary", "Santuario", "azione_bonus"],
  ["xanathar-scossa-tellurica", "Scossa Tellurica"],
  ["illusory-script", "Scritto illusorio", "speciale"],
  ["shield", "Scudo", "reazione"],
  ["shield-of-faith", "Scudo della fede", "azione_bonus"],
  ["unseen-servant", "Servitore inosservato"],
  ["sleep", "Sonno"],
  ["phb2014-sortilegio", "Sortilegio", "azione_bonus"],
  ["color-spray", "Spruzzo colorato"],
  ["phb2014-sussurri-dissonanti", "Sussurri Dissonanti"],
  ["xanathar-trabocchetto", "Trabocchetto", "speciale"],
  ["find-familiar", "Trova famiglio", "speciale"],
  ["grease", "Unto"],
  ["false-life", "Vita falsata"],
];
const CANTRIPS = [
  ["phb2014-amicizia", "Amicizia"],
  ["druidcraft", "Artificio druidico"],
  ["vicious-mockery", "Beffa crudele"],
  ["true-strike", "Colpo accurato"],
  ["xanathar-controllare-fiamme", "Controllare Fiamme"],
  ["xanathar-creare-falo", "Creare Falò"],
  ["fire-bolt", "Dardo di fuoco"],
  ["eldritch-blast", "Deflagrazione occulta"],
  ["xanathar-ferocia-primordiale", "Ferocia Primordiale"],
  ["sacred-flame", "Fiamma sacra"],
  ["acid-splash", "Fiotto acido"],
  ["xanathar-folata", "Folata"],
  ["phb2014-frusta-di-spine", "Frusta di Spine"],
  ["guidance", "Guida"],
  ["minor-illusion", "Illusione minore"],
  ["xanathar-infestazione", "Infestazione"],
  ["phb2014-interdizione-alle-lame", "Interdizione alle Lame"],
  ["tasha-lama-roboante", "Lama Roboante"],
  ["tasha-lama-verdefiamma", "Lama Verdefiamma"],
  ["tasha-lenza-elettrizzante", "Lenza Elettrizzante"],
  ["light", "Luce"],
  ["dancing-lights", "Luci danzanti"],
  ["mage-hand", "Mano magica"],
  ["message", "Messaggio"],
  ["xanathar-modellare-acqua", "Modellare Acqua"],
  ["xanathar-modellare-terra", "Modellare Terra"],
  ["xanathar-morsa-del-gelo", "Morsa del Gelo"],
  ["xanathar-parola-radiosa", "Parola Radiosa"],
  ["xanathar-pietra-magica", "Pietra Magica"],
  ["prestidigitation", "Prestidigitazione"],
  ["produce-flame", "Produrre fiamma"],
  ["ray-of-frost", "Raggio di gelo"],
  ["shillelagh", "Randello incantato"],
  ["resistance", "Resistenza"],
  ["xanathar-rintocco-dei-morti", "Rintocco dei Morti"],
  ["mending", "Riparare"],
  ["xanathar-rombo-di-tuono", "Rombo di Tuono"],
  ["spare-the-dying", "Salvare i morenti"],
  ["tasha-scheggia-della-mente", "Scheggia della Mente"],
  ["poison-spray", "Spruzzo velenoso"],
  ["shocking-grasp", "Stretta folgorante"],
  ["thaumaturgy", "Taumaturgia"],
  ["chill-touch", "Tocco gelido"],
  ["tasha-turbine-di-spade", "Turbine di Spade"],
];
// Until the start of the attacker's next turn: Slasher's and Crusher's pills.
const UNTIL_NEXT_TURN = "next-turn";
// The pills of the critical parts, which the attack console reminds about (pcAttackTargetNotes).
export const CRUSHER_CRITICAL_CONDITION = "Martello Vivente";
export const SLASHER_CRITICAL_CONDITION = "Bisturi da Battaglia: critico";
// CC-BY-4.0, Systems Reference Document 5.1 in italiano: the compendium's entry "lottatore", word for word (a test checks).
const GRAPPLER_SRD_TEXT = [
  "Prerequisito: Forza 13 o superiore",
  "",
  "Il personaggio ha sviluppato le abilità necessarie per farsi valere nella lotta corpo a corpo. Ottiene i seguenti benefici:",
  "• Dispone di vantaggio ai tiri per colpire contro una creatura con cui sta lottando.",
  "• Può usare la sua azione per tentare di immobilizzare una creatura da lui afferrata. Per farlo deve effettuare un'altra "
    + "prova di lotta. Se la supera, il personaggio e la creatura sono entrambi trattenuti fino alla fine della lotta.",
].join("\n");

const DEFINITIONS = [
  // Manuale del Giocatore 2014, capitolo 6, pp. 165–170.
  feat("phb", 165, "Abile", "Skilled", { plugin: ON_SHEET }),
  feat("phb", 165, "Adepto Elementale", "Elemental Adept", { prerequisite: "Saper lanciare almeno un incantesimo",
    choices: ["damageType"], repeatable: true }),
  feat("phb", 165, "Adepto Marziale", "Martial Adept"),
  feat("phb", 165, "Aggressore Selvaggio", "Savage Attacker", {
    plugin: "Nella console attacchi, sui colpi in mischia, il promemoria: una volta per turno ritiri i dadi dell'arma e tieni il totale che preferisci." }),
  feat("phb", 165, "Allerta", "Alert", {
    plugin: "Il +5 all'iniziativa lo somma chi la tira: il plugin non tira l'iniziativa e non gestisce la sorpresa." }),
  feat("phb", 165, "Appostato", "Skulker", { prerequisite: "Destrezza 13" }),
  feat("phb", 165, "Atleta", "Athlete", { abilities: ["str", "dex"], plugin: AT_TABLE }),
  feat("phb", 165, "Attore", "Actor", { abilities: ["cha"], plugin: AT_TABLE }),
  feat("phb", 166, "Carica", "Charger"),
  feat("phb", 166, "Cecchino Magico", "Spell Sniper", { prerequisite: "Saper lanciare almeno un incantesimo" }),
  feat("phb", 167, "Combattente a Due Armi", "Dual Wielder", {
    plugin: "Il +1 alla CA va compreso nella CA della scheda; il resto si gestisce al tavolo." }),
  feat("phb", 167, "Combattente in Sella", "Mounted Combatant", { plugin: AT_TABLE }),
  feat("phb", 167, "Condottiero Ispiratore", "Inspiring Leader", { prerequisite: "Carisma 13" }),
  feat("phb", 167, "Corazze Leggere", "Lightly Armored", { abilities: ["str", "dex"], plugin: ON_SHEET }),
  feat("phb", 167, "Corazze Medie", "Moderately Armored", { prerequisite: "Competenza nelle armature leggere",
    abilities: ["str", "dex"], plugin: ON_SHEET }),
  feat("phb", 167, "Corazze Pesanti", "Heavily Armored", { prerequisite: "Competenza nelle armature medie",
    abilities: ["str"], plugin: ON_SHEET }),
  feat("phb", 167, "Duellante Difensivo", "Defensive Duelist", { prerequisite: "Destrezza 13" }),
  feat("phb", 167, "Esperto di Balestre", "Crossbow Expert", {
    plugin: "Dopo un attacco con un'arma, la console ricorda l'attacco bonus con la balestra a mano, se l'arma era a una mano; il resto si gestisce al tavolo." }),
  feat("phb", 167, "Esperto di Dungeon", "Dungeon Delver", { plugin: AT_TABLE }),
  feat("phb", 167, "Fortunato", "Lucky", {
    plugin: "3 punti fortuna, che tornano con il riposo lungo: il pulsante spende un punto, il d20 in più si tira al tavolo.",
    pool: { key: "punti", name: "Punti fortuna", count: 3 } }),
  feat("phb", 167, "Guaritore", "Healer"),
  feat("phb", 168, "Incantatore da Guerra", "War Caster", { prerequisite: "Saper lanciare almeno un incantesimo" }),
  feat("phb", 168, "Incantatore Rituale", "Ritual Caster", { prerequisite: "Intelligenza o Saggezza 13" }),
  feat("phb", 168, "Iniziato alla Magia", "Magic Initiate", {
    plugin: "I due trucchetti nel libro come «Talento»; l'incantesimo di 1° livello una volta per riposo lungo senza slot, o con i tuoi slot, dalla sua card. CD e attacco con la caratteristica della classe scelta.",
    spellAbility: "class", classChoices: CASTER_CLASSES, cantrips: 2,
    chosenSpells: [{ key: "incantesimo", label: "Incantesimo di 1° livello", candidates: FIRST_LEVEL_SPELLS, uses: "lungo", slots: true }] }),
  feat("phb", 168, "Linguista", "Linguist", { abilities: ["int"],
    plugin: "Le lingue vanno riportate nella scheda del personaggio." }),
  feat("phb", 168, "Lottatore", "Grappler", { prerequisite: "Forza 13", srdEntryId: "lottatore", srdText: GRAPPLER_SRD_TEXT }),
  feat("phb", 168, "Lottatore da Taverna", "Tavern Brawler", { abilities: ["str", "con"] }),
  feat("phb", 168, "Maestro d'Armi", "Weapon Master", { abilities: ["str", "dex"], plugin: ON_SHEET }),
  feat("phb", 168, "Maestro d'Armi Possenti", "Great Weapon Master", {
    plugin: "Nella console attacchi, in mischia: «−5/+10», −5 al tiro e +10 ai danni se colpisce, quando l'arma è pesante. Dopo un critico o un nemico a 0 PF, la console ricorda l'attacco bonus." }),
  feat("phb", 169, "Maestro degli Scudi", "Shield Master"),
  feat("phb", 169, "Maestro delle Armature Medie", "Medium Armor Master", { prerequisite: "Competenza nelle armature medie",
    plugin: "La CA va scritta nella scheda; il resto si gestisce al tavolo." }),
  feat("phb", 169, "Maestro delle Armature Pesanti", "Heavy Armor Master", { prerequisite: "Competenza nelle armature pesanti",
    abilities: ["str"] }),
  feat("phb", 170, "Maestro delle Armi su Asta", "Polearm Master"),
  feat("phb", 170, "Mente Acuta", "Keen Mind", { abilities: ["int"], plugin: AT_TABLE }),
  feat("phb", 170, "Mobilità", "Mobile"),
  feat("phb", 170, "Osservatore", "Observant", { abilities: ["int", "wis"],
    plugin: "Il +5 alla Percezione passiva va compreso in quella della scheda." }),
  feat("phb", 170, "Resiliente", "Resilient", { abilities: ALL_ABILITIES,
    plugin: "La competenza nel tiro salvezza va compresa nel totale della scheda." }),
  // Its line is counted on the character's level (featPluginLine).
  feat("phb", 170, "Robusto", "Tough", { plugin: "+2 PF massimi per livello, da comprendere nei PF massimi della scheda: il plugin non li scrive." }),
  feat("phb", 170, "Sentinella", "Sentinel"),
  feat("phb", 170, "Sterminatore di Maghi", "Mage Slayer"),
  feat("phb", 170, "Tenace", "Durable", { abilities: ["con"] }),
  feat("phb", 170, "Tiratore Scelto", "Sharpshooter", {
    plugin: "Nella console attacchi, a distanza: «−5/+10», −5 al tiro e +10 ai danni se colpisce. Gittata lunga e copertura restano al tavolo." }),

  // Guida Omnicomprensiva di Xanathar, capitolo 1, pp. 73–75: the racial feats.
  feat("xge", 74, "Agilità Tarchiata", "Squat Nimbleness", { prerequisite: "Nano o specie di taglia Piccola",
    species: [...DWARVES, ...SMALL], abilities: ["str", "dex"] }),
  feat("xge", 74, "Alta Magia Drow", "Drow High Magic", { prerequisite: "Elfo (drow)", species: ["elfo"], speciesOptions: ["drow"],
    plugin: "Individuazione del magico a volontà, Levitazione e Dissolvi magie una volta per riposo lungo ciascuno, senza slot e con Carisma: si lanciano dalle loro card.",
    spellAbility: "cha", spells: [
      { key: "individuazione-del-magico", spellId: "detect-magic", name: "Individuazione del magico", uses: "" },
      { key: "levitazione", spellId: "levitate", name: "Levitazione", uses: "lungo" },
      { key: "dissolvi-magie", spellId: "dispel-magic", name: "Dissolvi magie", uses: "lungo" },
    ] }),
  feat("xge", 74, "Costituzione Infernale", "Infernal Constitution", { prerequisite: "Tiefling", species: TIEFLINGS,
    abilities: ["con"] }),
  feat("xge", 74, "Fiamme di Flegesto", "Flames of Phlegethos", { prerequisite: "Tiefling", species: TIEFLINGS,
    abilities: ["int", "cha"] }),
  feat("xge", 74, "Fortuna Generosa", "Bountiful Luck", { prerequisite: "Halfling", species: HALFLINGS,
    plugin: "Si gestisce al tavolo: gli avvisi di reazione non vedono i tiri." }),
  feat("xge", 74, "Furia Orchesca", "Orcish Fury", { prerequisite: "Mezzorco", species: ["mezzorco"], abilities: ["str", "con"],
    plugin: "Nella console attacchi, su un colpo con un'arma: un dado dell'arma in più, una volta per riposo breve o lungo. L'attacco con la reazione dopo Tenacia implacabile resta al tavolo.",
    pool: { key: "dado", name: "Furia Orchesca", count: 1, rest: "breve" } }),
  feat("xge", 74, "Magia degli Elfi dei Boschi", "Wood Elf Magic", { prerequisite: "Elfo (dei boschi)", species: ["elfo"],
    speciesOptions: ["boschi"],
    plugin: "Passo veloce e Passare senza tracce una volta per riposo lungo ciascuno, senza slot: si lanciano dalle loro card. Il trucchetto da druido scelto è nel libro come «Talento». Tutti con Saggezza.",
    spellAbility: "wis", cantrips: 1, spells: [
      { key: "passo-veloce", spellId: "longstrider", name: "Passo veloce", uses: "lungo" },
      { key: "passare-senza-tracce", spellId: "pass-without-trace", name: "Passare senza tracce", uses: "lungo" },
    ] }),
  feat("xge", 74, "Paura Draconica", "Dragon Fear", { prerequisite: "Dragonide", species: DRAGONBORN, abilities: ["str", "con", "cha"] }),
  feat("xge", 75, "Pelle di Drago", "Dragon Hide", { prerequisite: "Dragonide", species: DRAGONBORN, abilities: ["str", "con", "cha"],
    plugin: "Gli artigli si aggiungono agli Attacchi da questa card (1d4 + Forza, taglienti); la CA va scritta nella scheda.",
    naturalWeapon: { label: "Artigli", dice: "1d4", type: "slashing", ability: "str" } }),
  feat("xge", 75, "Precisione Elfica", "Elven Accuracy", { prerequisite: "Elfo o mezzelfo", species: [...ELVES, ...HALF_ELVES],
    abilities: ["dex", "int", "wis", "cha"], plugin: "Si gestisce al tavolo, con i dadi." }),
  feat("xge", 75, "Prodigio", "Prodigy", { prerequisite: "Mezzelfo, mezzorco o umano", species: [...HALF_ELVES, "mezzorco", "umano"],
    plugin: ON_SHEET }),
  feat("xge", 75, "Scomparire", "Fade Away", { prerequisite: "Gnomo", species: GNOMES, abilities: ["dex", "int"] }),
  feat("xge", 75, "Seconda Possibilità", "Second Chance", { prerequisite: "Halfling", species: HALFLINGS,
    abilities: ["dex", "con", "cha"] }),
  feat("xge", 75, "Teletrasporto Fatato", "Fey Teleportation", { prerequisite: "Elfo (alto)", species: ["elfo"],
    speciesOptions: ["alto"], abilities: ["int", "cha"],
    plugin: "Passo velato una volta per riposo breve o lungo, senza slot e con Intelligenza: si lancia dalla sua card. La lingua silvana va nella scheda.",
    spellAbility: "int", spells: [{ key: "passo-velato", spellId: "misty-step", name: "Passo velato", uses: "breve", activation: "azione_bonus", self: true }] }),
  feat("xge", 75, "Tempra Nanica", "Dwarven Fortitude", { prerequisite: "Nano", species: DWARVES, abilities: ["con"] }),

  // Calderone Omnicomprensivo di Tasha, capitolo 1, pp. 79–81.
  feat("tce", 79, "Abilità Impeccabile", "Skill Expert", { abilities: ALL_ABILITIES, plugin: ON_SHEET }),
  feat("tce", 79, "Adepto di Metamagia", "Metamagic Adept", { prerequisite: "Lanciare Incantesimi o Magia del Patto" }),
  feat("tce", 79, "Adepto Occulto", "Eldritch Adept", { prerequisite: "Lanciare Incantesimi o Magia del Patto" }),
  feat("tce", 79, "Bisturi da Battaglia", "Slasher", { abilities: ["str", "dex"],
    plugin: "Nella console attacchi, una volta per turno su un colpo tagliente: −3 m di velocità al bersaglio fino all'inizio del tuo prossimo turno; al critico, svantaggio ai suoi tiri per colpire.",
    effect: { conditionName: "Bisturi da Battaglia", timing: UNTIL_NEXT_TURN, movement: { addMeters: -3 },
      detail: "Velocità ridotta di 3 m fino all'inizio del prossimo turno di chi l'ha colpito." },
    parts: [{ key: "critico", name: "Bisturi da Battaglia: critico",
      description: "Su un critico con danni taglienti: svantaggio ai tiri per colpire del bersaglio fino all'inizio del tuo prossimo turno.",
      effect: { conditionName: SLASHER_CRITICAL_CONDITION, timing: UNTIL_NEXT_TURN,
        detail: "Svantaggio ai tiri per colpire fino all'inizio del prossimo turno di chi l'ha colpito." } }] }),
  feat("tce", 80, "Contaminazione Fatata", "Fey Touched", { abilities: ["int", "wis", "cha"],
    plugin: "Passo velato e l'incantesimo di 1° livello scelto, una volta per riposo lungo ciascuno senza slot, o con i tuoi slot, con la caratteristica del talento: si lanciano dalle loro card.",
    spellAbility: "feat", spells: [{ key: "passo-velato", spellId: "misty-step", name: "Passo velato", uses: "lungo", slots: true, activation: "azione_bonus", self: true }],
    chosenSpells: [{ key: "incantesimo", label: "Incantesimo di 1° (divinazione o ammaliamento)", candidates: FEY_TOUCHED_SPELLS, uses: "lungo", slots: true }] }),
  feat("tce", 80, "Contaminazione Ombrosa", "Shadow Touched", { abilities: ["int", "wis", "cha"],
    plugin: "Invisibilità e l'incantesimo di 1° livello scelto, una volta per riposo lungo ciascuno senza slot, o con i tuoi slot, con la caratteristica del talento: si lanciano dalle loro card.",
    spellAbility: "feat", spells: [{ key: "invisibilita", spellId: "invisibility", name: "Invisibilità", uses: "lungo", slots: true }],
    chosenSpells: [{ key: "incantesimo", label: "Incantesimo di 1° (illusione o necromanzia)", candidates: SHADOW_TOUCHED_SPELLS, uses: "lungo", slots: true }] }),
  feat("tce", 80, "Cuoco", "Chef", { abilities: ["con", "wis"] }),
  feat("tce", 80, "Maestria dei Veleni", "Poisoner"),
  feat("tce", 80, "Martello Vivente", "Crusher", { abilities: ["str", "con"],
    plugin: "Nella console attacchi, una volta per turno su un colpo contundente: la nota «spostalo di 1,5 m»; al critico, gli attacchi contro il bersaglio hanno vantaggio fino all'inizio del tuo prossimo turno.",
    parts: [{ key: "critico", name: "Martello Vivente: critico",
      description: "Su un critico con danni contundenti: gli attacchi contro il bersaglio hanno vantaggio fino all'inizio del tuo prossimo turno.",
      effect: { conditionName: CRUSHER_CRITICAL_CONDITION, timing: UNTIL_NEXT_TURN,
        detail: "Gli attacchi contro hanno vantaggio fino all'inizio del prossimo turno di chi l'ha colpito." } }] }),
  feat("tce", 80, "Pistolero", "Gunner", { abilities: ["dex"], plugin: AT_TABLE }),
  feat("tce", 80, "Rudimenti da Artefice", "Artificer Initiate", {
    plugin: "Il trucchetto nel libro come «Talento»; l'incantesimo di 1° livello una volta per riposo lungo senza slot, o con i tuoi slot, dalla sua card. Tutti con Intelligenza; gli strumenti vanno nella scheda.",
    spellAbility: "int", cantrips: 1,
    chosenSpells: [{ key: "incantesimo", label: "Incantesimo di 1° livello", candidates: FIRST_LEVEL_SPELLS, uses: "lungo", slots: true }] }),
  feat("tce", 81, "Rudimenti da Guerriero", "Fighting Initiate", { prerequisite: "Competenza in un'arma da guerra" }),
  feat("tce", 81, "Stile Penetrante", "Piercer", { abilities: ["str", "dex"],
    plugin: "Nella console attacchi: al critico con danni perforanti, un dado di danno in più; sui colpi perforanti il promemoria di ritirare un dado, una volta per turno." }),
  feat("tce", 81, "Telecinesi", "Telekinetic", { abilities: ["int", "wis", "cha"],
    plugin: "Mano magica a volontà, invisibile, con la caratteristica del talento: si lancia dalla sua card. La spinta telecinetica (azione bonus, TS su Forza), per ora, si gestisce al tavolo.",
    spellAbility: "feat", spells: [{ key: "mano-magica", spellId: "mage-hand", name: "Mano magica", uses: "" }] }),
  feat("tce", 81, "Telepatia", "Telepathic", { abilities: ["int", "wis", "cha"],
    plugin: "Individuazione dei pensieri una volta per riposo lungo senza slot, o con i tuoi slot, con la caratteristica del talento: si lancia dalla sua card. La telepatia si gestisce al tavolo.",
    spellAbility: "feat", spells: [{ key: "individuazione-dei-pensieri", spellId: "detect-thoughts", name: "Individuazione dei pensieri", uses: "lungo",
      slots: true, self: true }] }),
];

// "Maestro d'Armi Possenti" -> "maestro-d-armi-possenti": the slug of the pack's entries (generate-srd-rules-reference.mjs).
export function featSlug(value) {
  return String(value ?? "")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export const FEATS = Object.freeze(DEFINITIONS.map((definition) => {
  const book = BOOKS[definition.book];
  const id = featSlug(definition.name);
  return Object.freeze({
    id,
    name: definition.name,
    english: definition.english,
    aliases: Object.freeze([definition.english]),
    source: book.source,
    sourceLabel: book.sourceLabel,
    page: definition.page,
    rulesEntryId: `${book.prefix}-${id}`,
    prerequisite: definition.prerequisite,
    abilityChoices: Object.freeze([...definition.abilities]),
    choices: Object.freeze([...definition.choices]),
    speciesIds: Object.freeze([...definition.species]),
    speciesOptionIds: Object.freeze([...definition.speciesOptions]),
    repeatable: definition.repeatable,
    plugin: definition.plugin,
    pool: definition.pool ? Object.freeze({ ...definition.pool }) : null,
    srdEntryId: definition.srdEntryId,
    srdText: definition.srdText,
    effect: definition.effect ? Object.freeze({ ...definition.effect }) : null,
    parts: Object.freeze(definition.parts.map((part) => Object.freeze({ ...part, effect: part.effect ? Object.freeze({ ...part.effect }) : null }))),
    naturalWeapon: definition.naturalWeapon ? Object.freeze({ ...definition.naturalWeapon }) : null,
    spells: Object.freeze(definition.spells.map((spell) => Object.freeze({ ...spell }))),
    spellAbility: definition.spellAbility,
    chosenSpells: Object.freeze(definition.chosenSpells.map((slot) => Object.freeze({ ...slot,
      candidates: Object.freeze(slot.candidates.map(([spellId, spellName, activation = ""]) => Object.freeze({ spellId, name: spellName,
        ...(activation ? { activation } : {}) }))) }))),
    classChoices: Object.freeze([...definition.classChoices]),
    cantrips: definition.cantrips,
  });
}));
// The cantrips a feat lets choose, by id: the same list for every feat that asks one (decision S4).
export const FEAT_CANTRIPS = Object.freeze(CANTRIPS.map(([spellId, spellName]) => Object.freeze({ spellId, name: spellName })));
const FEAT_BY_ID = new Map(FEATS.map((entry) => [entry.id, entry]));

export function getFeat(id) {
  return FEAT_BY_ID.get(String(id ?? "").trim()) || null;
}

// The record id of a feat: "talento-robusto".
export function featFeatureId(featId) {
  return `talento-${featId}`;
}

const pool = (id, name, capacity, shortRest = false) => Object.freeze({
  id, name, capacity: Object.freeze({ type: "fixed", value: capacity }), maximumByClassLevel: null,
  refresh: Object.freeze((shortRest ? ["riposo_breve", "riposo_lungo"] : ["riposo_lungo"])
    .map((event) => Object.freeze({ event, amount: "massimo" }))),
  refreshByClassLevel: Object.freeze([]),
});
const featPoolId = (entry) => `${featFeatureId(entry.id)}-${entry.pool.key}-usi`;

// A granted spell's use: "talento-<feat>-<key>-usi", one per long rest (or short, Fey Teleportation).
const featSpellPoolId = (entry, spell) => (spell.uses ? `${featFeatureId(entry.id)}-${spell.key}-usi` : "");

// A chosen spell's use belongs to its slot, whichever spell fills it: "talento-<feat>-<key>-usi" (lot F3b).
const featChosenPoolId = (entry, slot) => (slot.uses ? `${featFeatureId(entry.id)}-${slot.key}-usi` : "");

export const FEAT_RESOURCE_POOLS = Object.freeze([
  ...FEATS.filter((entry) => entry.pool)
    .map((entry) => pool(featPoolId(entry), entry.pool.name, entry.pool.count, entry.pool.rest === "breve")),
  ...FEATS.flatMap((entry) => entry.spells.filter((spell) => spell.uses)
    .map((spell) => pool(featSpellPoolId(entry, spell), `${entry.name}: ${spell.name}`, 1, spell.uses === "breve"))),
  ...FEATS.flatMap((entry) => entry.chosenSpells.filter((slot) => slot.uses)
    .map((slot) => pool(featChosenPoolId(entry, slot), `${entry.name}: incantesimo scelto`, 1, slot.uses === "breve"))),
]);

const NOT_AUTOMATED = Object.freeze({ status: "not-automated", adapter: null, reason: "adapter-not-implemented" });
// A use resolved at the table: the button only spends it (speciesTraitCore.js, RESOURCE_ONLY).
const RESOURCE_ONLY = Object.freeze({ status: "implemented", adapter: "resource-only", reason: null });
// A pill put on a creature (the attack console's activations), like Lance of Lethargy's.
const CONDITION_ADAPTER = Object.freeze({ status: "implemented", adapter: "condition", reason: null });
const SELF_TARGETING = Object.freeze({ mode: "self", rangeMeters: null, maxTargets: 1, excludeSource: false });
const TARGET_TARGETING = Object.freeze({ mode: "single-target", rangeMeters: null, maxTargets: 1, excludeSource: true });
export const FEAT_THEME = Object.freeze({ emoji: "🎖️", accent: "#facc15", background: "#422006", text: "#fefce8" });

// The fields of a record by what it does: a pill on a target, a use spent by a button, or a reference card.
function recordBehaviour({ effect, poolId }) {
  if (effect) {
    return {
      automationLevel: "assistita", completenessStatus: "partial", runtimeSupport: CONDITION_ADAPTER,
      activation: Object.freeze({ primary: "innesco" }), targetMode: "selection", targeting: TARGET_TARGETING,
      effectPlan: Object.freeze({ kind: "condition", conditionName: effect.conditionName, effectKind: effect.kind || "debuff",
        detail: effect.detail, ...(effect.movement ? { mechanics: Object.freeze({ movement: Object.freeze({ ...effect.movement }) }) } : {}) }),
      duration: Object.freeze({ rounds: null, timing: effect.timing }), trackingMode: "active",
    };
  }
  return {
    automationLevel: poolId ? "manuale" : "riferimento", completenessStatus: poolId ? "partial" : "reference",
    runtimeSupport: poolId ? RESOURCE_ONLY : NOT_AUTOMATED, activation: Object.freeze({ primary: poolId ? "innesco" : "passiva" }),
    targetMode: "self", targeting: SELF_TARGETING, effectPlan: null, duration: Object.freeze({ rounds: null }), trackingMode: "instant",
  };
}

function featRecord(entry) {
  const poolId = entry.pool ? featPoolId(entry) : "";
  return Object.freeze({
    id: featFeatureId(entry.id),
    name: entry.name,
    // The "Nel plugin" line: the rules text is the pack's entry (rulesEntryId).
    description: entry.plugin,
    classId: "",
    subclassId: "",
    featId: entry.id,
    minimumLevel: 1,
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    page: entry.page,
    rulesEntryId: entry.rulesEntryId,
    // Lottatore's SRD text, shown without the pack (classFeatureDescriptions.js).
    ...(entry.srdText ? { srdText: entry.srdText } : {}),
    collection: "talenti",
    defaultEnabled: true,
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    ...recordBehaviour({ effect: entry.effect, poolId }),
    trackedResourcePoolIds: Object.freeze(poolId ? [poolId] : []),
    theme: FEAT_THEME,
    breaksConcentration: false,
    resourceCosts: Object.freeze(poolId ? [Object.freeze({ poolId, amount: 1 })] : []),
    ...(entry.naturalWeapon ? { naturalWeapon: entry.naturalWeapon } : {}),
  });
}

// A second effect of a feat (Slasher's critical): a record of its own, with its pill and the line it shows as text; no
// rules entry, the feat's card has it.
function featPartRecord(entry, part) {
  return Object.freeze({
    id: `${featFeatureId(entry.id)}-${part.key}`,
    name: part.name,
    description: part.description,
    classId: "",
    subclassId: "",
    featId: entry.id,
    featPart: true,
    minimumLevel: 1,
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    page: entry.page,
    collection: "talenti",
    defaultEnabled: true,
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    ...recordBehaviour({ effect: part.effect, poolId: "" }),
    trackedResourcePoolIds: Object.freeze([]),
    theme: FEAT_THEME,
    breaksConcentration: false,
    resourceCosts: Object.freeze([]),
  });
}

// A granted spell (lot F3a): a record with the shape of a species' innate spell, its use spent by the cast's command.
// A chosen spell (lot F3b) is the same record, keyed by its slot and spell, with the slot's use: choice names the slot.
function featSpellRecord(entry, spell, { key = spell.key, poolId = featSpellPoolId(entry, spell), choice = null } = {}) {
  return Object.freeze({
    id: `${featFeatureId(entry.id)}-${key}`,
    ...(choice ? { featChoice: choice } : {}),
    name: `${entry.name}: ${spell.name}`,
    description: `Lanci ${spell.name} senza slot, ${spell.uses === "breve" ? "una volta per riposo breve o lungo"
      : spell.uses ? "una volta per riposo lungo" : "a volontà"}${spell.slots ? ", e anche con i tuoi slot" : ""}.`,
    classId: "",
    subclassId: "",
    featId: entry.id,
    featPart: true,
    minimumLevel: 1,
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    page: entry.page,
    collection: "talenti",
    defaultEnabled: true,
    automationLevel: "manuale",
    completenessStatus: "partial",
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    runtimeSupport: RESOURCE_ONLY,
    activation: Object.freeze({ primary: spell.activation || "azione" }),
    trackedResourcePoolIds: Object.freeze(poolId ? [poolId] : []),
    targetMode: "self",
    targeting: SELF_TARGETING,
    theme: FEAT_THEME,
    effectPlan: null,
    breaksConcentration: false,
    duration: Object.freeze({ rounds: null }),
    trackingMode: "instant",
    resourceCosts: Object.freeze(poolId ? [Object.freeze({ poolId, amount: 1 })] : []),
    innateSpell: Object.freeze({ spellId: spell.spellId, slotLevel: null, ability: entry.spellAbility, self: spell.self === true,
      ...(spell.slots ? { slots: true } : {}) }),
  });
}

// The record of a candidate of a chosen slot: "talento-contaminazione-fatata-incantesimo-sleep".
const featChosenRecordId = (entry, slot, spellId) => (spellId ? `${featFeatureId(entry.id)}-${slot.key}-${spellId}` : "");

function featChosenSpellRecords(entry) {
  return entry.chosenSpells.flatMap((slot) => slot.candidates.map((candidate) => featSpellRecord(entry, {
    spellId: candidate.spellId, name: candidate.name, uses: slot.uses, slots: slot.slots, activation: candidate.activation,
  }, { key: `${slot.key}-${candidate.spellId}`, poolId: featChosenPoolId(entry, slot), choice: Object.freeze({ key: slot.key }) })));
}

export const FEAT_FEATURES = Object.freeze(FEATS.flatMap((entry) => [featRecord(entry), ...entry.parts.map((part) => featPartRecord(entry, part)),
  ...entry.spells.map((spell) => featSpellRecord(entry, spell)), ...featChosenSpellRecords(entry)]));
const FEATURES_BY_FEAT = new Map(FEATS.map((entry) => [entry.id, FEAT_FEATURES.filter((feature) => feature.featId === entry.id)]));

const FEAT_ID = /^[a-z0-9][a-z0-9-]{0,47}$/u;
const CHOICE_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/u;
const MAX_CHOICE_KEYS = 8;
const MAX_CHOICE_LIST = 12;
const MAX_CHOICE_TEXT = 64;

function sanitizeChoiceValue(value) {
  if (typeof value === "string") return value.trim().slice(0, MAX_CHOICE_TEXT) || undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, MAX_CHOICE_TEXT))
    .filter(Boolean).slice(0, MAX_CHOICE_LIST);
  return list.length ? list : undefined;
}

// The choices of a feat as plain values: strings, numbers, booleans and lists of strings, under short keys. Keys this
// version does not use stay (a newer client's spells or class).
function sanitizeFeatChoice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .filter(([key]) => CHOICE_KEY.test(key))
    .slice(0, MAX_CHOICE_KEYS)
    .map(([key, item]) => [key, sanitizeChoiceValue(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : null;
}

// { id, ability?, choice? } or null. The shape only: an unknown id stays.
export function sanitizeFeatEntry(value) {
  const source = typeof value === "string" ? { id: value } : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const id = String(source.id ?? "").trim();
  if (!FEAT_ID.test(id)) return null;
  const entry = { id };
  if (FEAT_ABILITY_KEYS.includes(source.ability)) entry.ability = source.ability;
  const choice = sanitizeFeatChoice(source.choice);
  if (choice) entry.choice = choice;
  return entry;
}

export function sanitizeFeats(value) {
  return (Array.isArray(value) ? value : []).map(sanitizeFeatEntry).filter(Boolean).slice(0, MAX_FEATS);
}

export function hasFeats(value) {
  return sanitizeFeats(value).length > 0;
}

// The records of the profile's feats, in the sheet's order, each once (Elemental Adept may be taken twice). An id
// this version does not know gives none.
export function featFeaturesForProfile(profile) {
  const seen = new Set();
  const result = [];
  for (const entry of sanitizeFeats(profile?.[FEATS_FIELD])) {
    // Of a chosen slot's candidates, only the one the sheet chose (choice.spellIds, one per slot in order).
    const definition = getFeat(entry.id);
    const chosen = new Set((definition?.chosenSpells || [])
      .map((slot, index) => featChosenRecordId(definition, slot, entry.choice?.spellIds?.[index])).filter(Boolean));
    for (const feature of FEATURES_BY_FEAT.get(entry.id) || []) {
      if (seen.has(feature.id) || (feature.featChoice && !chosen.has(feature.id))) continue;
      seen.add(feature.id);
      result.push(feature);
    }
  }
  return result;
}

// The choices of spells a feat asks (lot F3b): [{ key, label, candidates: [{ spellId, name }] }], for the sheet and the
// import.
export function featChoiceSlots(featId) {
  return getFeat(featId)?.chosenSpells || [];
}

// The casting ability of a granted spell whose feat says "feat" (Fey Touched, Telepathic): the ability the sheet chose for
// the half feat, else the highest of those it offers (the first on a tie).
export function featSpellAbility(feature, card = {}) {
  const definition = getFeat(feature?.featId);
  if (!definition) return "";
  return featEntryAbility(definition, sanitizeFeats(card?.[FEATS_FIELD]).find((entry) => entry.id === definition.id), card);
}

// The ability of a feat's spells for one entry of the sheet: its own ("cha" for Drow High Magic), the half feat's ("feat"),
// or the chosen class's ("class": Magic Initiate, lot F3b-2). Without a choice, the highest of those it offers.
function featEntryAbility(definition, entry, card = {}) {
  const offered = definition.spellAbility === "feat" ? definition.abilityChoices
    : definition.spellAbility === "class" ? ["int", "wis", "cha"] : [];
  if (!offered.length) return definition.spellAbility;
  const chosen = definition.spellAbility === "feat" ? entry?.ability : FEAT_CLASS_ABILITIES[entry?.choice?.classId];
  if (chosen && offered.includes(chosen)) return chosen;
  const modifier = (key) => {
    const value = Number(card?.abilityModifiers?.[key]);
    return Number.isFinite(value) ? value : null;
  };
  return offered.reduce((best, key) => (
    modifier(key) !== null && (modifier(best) === null || modifier(key) > modifier(best)) ? key : best
  ), offered[0] || "");
}

// The cantrips the sheet's feats let it know (lot F3b-2): [{ spellId, featId }], those of the list only.
function featChosenCantrips(profile) {
  return sanitizeFeats(profile?.[FEATS_FIELD]).flatMap((entry) => {
    const definition = getFeat(entry.id);
    if (!definition?.cantrips) return [];
    const ids = (Array.isArray(entry.choice?.cantripIds) ? entry.choice.cantripIds : []).slice(0, definition.cantrips);
    return ids.filter((spellId) => FEAT_CANTRIPS.some((cantrip) => cantrip.spellId === spellId)).map((spellId) => ({ spellId, featId: entry.id, entry }));
  });
}

// The spells the profile's feats put in its book (lots F3a, F3b): those the slots can cast too and the chosen cantrips,
// always prepared, as "Talento: <feat>", like a subclass's (spellbookGroups' granted).
export function featGrantedSpells(profile) {
  return [
    ...featFeaturesForProfile(profile).filter((feature) => feature.innateSpell?.slots)
      .map((feature) => ({ spellId: feature.innateSpell.spellId, source: `Talento: ${getFeat(feature.featId)?.name || feature.name}` })),
    ...featChosenCantrips(profile).map(({ spellId, featId }) => ({ spellId, source: `Talento: ${getFeat(featId).name}` })),
  ];
}

// Decision S3 of lot F3b: the ability a spell is cast with when the character knows it only from a feat (its own spell, a
// chosen one, a chosen cantrip): the attack console's bonus and DC, and the spell panel's DC, are the feat's. "" when the
// spell is in the character's own book too, or no feat gives it: the card's numbers stay.
export function featSpellcastingAbility(profile, spellId) {
  const id = String(spellId || "").trim();
  if (!id || (Array.isArray(profile?.spellbook?.spellIds) && profile.spellbook.spellIds.includes(id))) return "";
  const record = featFeaturesForProfile(profile).find((feature) => feature.innateSpell?.spellId === id);
  if (record) return featSpellAbility(record, profile);
  const cantrip = featChosenCantrips(profile).find((entry) => entry.spellId === id);
  return cantrip ? featEntryAbility(getFeat(cantrip.featId), cantrip.entry, profile) : "";
}

// "Robusto", "Adepto Elementale · fuoco", "Atleta · Des"; an unknown id says so.
export function featDisplayName(entry) {
  const clean = sanitizeFeatEntry(entry);
  if (!clean) return "";
  const definition = getFeat(clean.id);
  if (!definition) return `Talento sconosciuto (${clean.id})`;
  const damageType = FEAT_DAMAGE_TYPES.find((type) => type.id === clean.choice?.damageType);
  // The spells chosen (lot F3b), by their names: "Contaminazione Fatata · Car · Sortilegio".
  const spells = definition.chosenSpells.map((slot, index) => slot.candidates
    .find((candidate) => candidate.spellId === clean.choice?.spellIds?.[index])?.name || "");
  // Magic Initiate's class (lot F3b-2): "Iniziato alla Magia · Mago · Scudo"; the cantrips are in the book.
  return [
    definition.name,
    clean.ability && definition.abilityChoices.length > 1 ? ABILITY_SHORT[clean.ability] : "",
    definition.classChoices.includes(clean.choice?.classId) ? FEAT_CLASS_LABELS[clean.choice.classId] : "",
    damageType?.label || "",
    ...spells,
  ].filter(Boolean).join(" · ");
}

function totalCharacterLevel(profile) {
  const build = Array.isArray(profile?.characterBuild) ? profile.characterBuild : [];
  return Math.min(20, build.reduce((total, entry) => total + (Number.isInteger(entry?.level) ? entry.level : 0), 0));
}

// The "Nel plugin" line of a feat's card, with the half feat's ability: Robusto's counted on the character's level.
export function featPluginLine(feature, profile = null) {
  const definition = getFeat(feature?.featId);
  // A second effect's card (Slasher's critical) shows its own line as its text: the feat's card has the plugin's.
  if (!definition || feature?.featPart) return "";
  const level = totalCharacterLevel(profile);
  const line = definition.id === "robusto" && level
    ? `+${2 * level} PF massimi al ${level}° livello (2 per livello), da comprendere nei PF massimi della scheda: il plugin non li scrive.`
    : definition.plugin;
  if (!definition.abilityChoices.length) return line;
  const chosen = sanitizeFeats(profile?.[FEATS_FIELD]).find((entry) => entry.id === definition.id)?.ability;
  const abilities = chosen ? [chosen] : definition.abilityChoices;
  const names = abilities.map((key) => FEAT_ABILITY_LABELS[key]);
  const raised = names.length > 2 ? `${names.slice(0, -1).join(", ")} o ${names.at(-1)}` : names.join(" o ");
  return `${line} Il +1 a ${raised} è già nei modificatori della scheda.`;
}

// The sheet's warnings, never blocks (decision D8), one list per entry: a racial feat on another species, a feat
// taken twice (Elemental Adept only with another type), a granted spell also among the quick actions (decision D7: the
// sheet points it out and removes nothing).
export function featWarnings(entries, species = null, quickActions = []) {
  const list = (Array.isArray(entries) ? entries : []).map(sanitizeFeatEntry);
  const speciesId = String(species?.id || "").trim();
  const optionId = String(species?.ancestryId || "").trim();
  const quickSpellIds = new Set((Array.isArray(quickActions) ? quickActions : [])
    .filter((action) => action?.kind === "spell" && action.spellId).map((action) => String(action.spellId)));
  return list.map((entry, index) => {
    const definition = entry ? getFeat(entry.id) : null;
    if (!definition) return [];
    const warnings = [];
    if (speciesId && definition.speciesIds.length && (!definition.speciesIds.includes(speciesId)
      || (definition.speciesOptionIds.length && !definition.speciesOptionIds.includes(optionId)))) {
      warnings.push(`Richiede: ${definition.prerequisite}.`);
    }
    const twin = list.slice(0, index).some((other) => other?.id === entry.id
      && (!definition.repeatable || (other.choice?.damageType || "") === (entry.choice?.damageType || "")));
    if (twin) warnings.push(definition.repeatable ? "Già scelto con lo stesso tipo di danno." : "Già scelto.");
    // A chosen spell outside the slot's candidates (an import, a newer client): kept, but it casts nothing (lot F3b).
    const chosen = definition.chosenSpells.map((slot, slotIndex) => {
      const spellId = entry.choice?.spellIds?.[slotIndex];
      return spellId ? { slot, spellId, candidate: slot.candidates.find((candidate) => candidate.spellId === spellId) || null } : null;
    }).filter(Boolean);
    for (const { slot, spellId, candidate } of chosen) {
      if (!candidate) warnings.push(`L'incantesimo scelto (${spellId}) non è fra quelli del talento: ${slot.label}.`);
    }
    // A chosen cantrip that is not one (lot F3b-2): kept, but it never reaches the book.
    for (const cantripId of (Array.isArray(entry.choice?.cantripIds) ? entry.choice.cantripIds : []).slice(0, definition.cantrips)) {
      if (cantripId && !FEAT_CANTRIPS.some((cantrip) => cantrip.spellId === cantripId)) warnings.push(`Il trucchetto scelto (${cantripId}) non è un trucchetto del catalogo.`);
    }
    const granted = [...definition.spells, ...chosen.map((entryChosen) => entryChosen.candidate).filter(Boolean)];
    for (const spell of twin ? [] : granted.filter((candidate) => quickSpellIds.has(candidate.spellId))) {
      warnings.push(`${spell.name} arriva con il talento ed è anche nelle Azioni rapide: toglila da lì, o gli usi contano due volte.`);
    }
    return warnings;
  });
}
