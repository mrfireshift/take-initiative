// Trasformazioni, lotto W1 (docs/PIANO_TRASFORMAZIONI.md): l'istantanea di una forma da uno statblock e i limiti di ogni
// fonte secondo il PHB 2014 (Forma Selvatica e Circolo della Luna, Metamorfosi, Metamorfosi Pura, Trasformazione, Forme
// Animali). Le creature sono quelle dell'SRD 5.1 (CC-BY-4.0): qui servono solo tipo, GS, taglia e velocità.
// Lotto W2a: le forme rapide della scheda, il riassunto, il contesto del druido e l'import di «Altra forma…».
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { statblockTextImport } from "../src/monsterStatblockTextImportCore.js";
import {
  MAX_TRANSFORMATION_FORMS,
  TRANSFORMATION_KINDS,
  challengeRatingLabel,
  challengeRatingValue,
  creatureTypeOf,
  sanitizeTransformationForm,
  sanitizeTransformationForms,
  transformationContextForCharacter,
  transformationFormAllowed,
  transformationFormCandidates,
  transformationFormFacts,
  transformationFormFromImport,
  transformationFormFromStatblock,
  transformationFormSummary,
  transformationFormsWith,
  transformationFormsWithout,
  transformationLimits,
  transformationTemplateOf,
} from "../src/transformationCore.js";

const record = (name, type, cr, size, speed, extra = {}) => ({ name, source: "MM", type, cr, size: [size], speed, ...extra });
const beast = (name, cr, size, speed, extra = {}) => record(name, "beast", cr, size, speed, extra);

const wolf = beast("Wolf", "1/4", "M", { walk: 40 }, {
  alignment: ["U"], ac: [{ ac: 13, from: ["natural armor"] }], hp: { average: 11, formula: "2d8 + 2" },
  str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6, skill: { perception: "+3", stealth: "+4" }, passive: 13,
  trait: [{ name: "Keen Hearing and Smell", entries: ["The wolf has advantage on Wisdom ({@skill Perception}) checks that rely on hearing or smell."] }],
  action: [{ name: "Bite", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}7 ({@damage 2d4 + 2}) piercing damage. If the target is a creature, it must succeed on a {@dc 11} Strength saving throw or be knocked {@condition prone}."] }],
});
const brownBear = beast("Brown Bear", "1", "L", { walk: 40, climb: 30 }, {
  ac: [{ ac: 11, from: ["natural armor"] }], hp: { average: 34, formula: "4d10 + 12" },
  str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7, passive: 13,
  action: [
    { name: "Multiattack", entries: ["The bear makes two attacks: one with its bite and one with its claws."] },
    { name: "Bite", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}8 ({@damage 1d8 + 4}) piercing damage."] },
    { name: "Claws", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}11 ({@damage 2d6 + 4}) slashing damage."] },
  ],
});
const earthElemental = record("Earth Elemental", "elemental", "5", "L", { walk: 30, burrow: 30 }, {
  ac: [{ ac: 17, from: ["natural armor"] }], hp: { average: 126, formula: "12d10 + 60" },
  str: 20, dex: 8, con: 20, int: 5, wis: 10, cha: 5, passive: 10,
  vulnerable: ["thunder"], immune: ["poison"],
  resist: [{ resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true }],
  conditionImmune: ["exhaustion", "paralyzed", "petrified", "poisoned", "unconscious"],
  action: [
    { name: "Multiattack", entries: ["The elemental makes two slam attacks."] },
    { name: "Slam", entries: ["{@atk mw} {@hit 8} to hit, reach 10 ft., one target. {@h}14 ({@damage 2d8 + 5}) bludgeoning damage."] },
  ],
});
const cat = beast("Cat", "0", "T", { walk: 40, climb: 30 });
const crocodile = beast("Crocodile", "1/2", "L", { walk: 20, swim: 30 });
const ape = beast("Ape", "1/2", "M", { walk: 30, climb: 30 });
const blackBear = beast("Black Bear", "1/2", "M", { walk: 40, climb: 30 });
const giantEagle = beast("Giant Eagle", "1", "L", { walk: 10, fly: 80 });
const direWolf = beast("Dire Wolf", "1", "L", { walk: 50 });
const giantToad = beast("Giant Toad", "1", "L", { walk: 20, swim: 40 });
const polarBear = beast("Polar Bear", "2", "L", { walk: 40, swim: 30 });
const hunterShark = beast("Hunter Shark", "2", "L", { walk: 0, swim: 40 });
const giantConstrictorSnake = beast("Giant Constrictor Snake", "2", "H", { walk: 30, swim: 30 });
const elephant = beast("Elephant", "4", "H", { walk: 40 });
const mammoth = beast("Mammoth", "6", "H", { walk: 40 });
const tyrannosaurus = beast("Tyrannosaurus Rex", "8", "H", { walk: 50 });
const swarmOfRats = record("Swarm of Rats", { type: "beast", swarmSize: "T" }, "1/4", "M", { walk: 30 });
const airElemental = record("Air Elemental", "elemental", "5", "L", { walk: 0, fly: { number: 90, condition: "(hover)" }, canHover: true });
const salamander = record("Salamander", "elemental", "5", "L", { walk: 30 });
const ogre = record("Ogre", "giant", "2", "L", { walk: 40 });
const zombie = record("Zombie", "undead", "1/4", "M", { walk: 20 });
const ironGolem = record("Iron Golem", "construct", "16", "L", { walk: 30 });

const facts = (monster) => transformationFormFacts(monster);
const allowed = (monster, context) => transformationFormAllowed(facts(monster), context).allowed;
const reasons = (monster, context) => transformationFormAllowed(facts(monster), context).reasons;
const druid = (druidLevel, circle = "") => ({ kind: "wild-shape", druidLevel, circle });

test("il GS: frazioni, numeri e il GS di tana; sconosciuto quando non si legge", () => {
  assert.equal(challengeRatingValue("1/8"), 0.125);
  assert.equal(challengeRatingValue("1/4"), 0.25);
  assert.equal(challengeRatingValue({ cr: "1/2", lair: "1" }), 0.5);
  assert.equal(challengeRatingValue("17"), 17);
  assert.equal(challengeRatingValue(0), 0);
  for (const unknown of ["Unknown", "", null, undefined, -1, "—"]) assert.equal(challengeRatingValue(unknown), null, String(unknown));
  assert.equal(challengeRatingLabel(0.125), "1/8");
  assert.equal(challengeRatingLabel("1/2"), "1/2");
  assert.equal(challengeRatingLabel(2), "2");
  assert.equal(challengeRatingLabel("x"), "");
});

test("il tipo: 5eTools, il testo del parser, gli sciami e i nomi italiani", () => {
  assert.deepEqual(creatureTypeOf("beast"), { type: "beast" });
  assert.deepEqual(creatureTypeOf({ type: "beast", swarmSize: "T" }), { type: "beast", swarm: true });
  assert.deepEqual(creatureTypeOf("swarm of Tiny beasts"), { type: "beast", swarm: true });
  assert.deepEqual(creatureTypeOf("humanoid (any race)"), { type: "humanoid" });
  assert.deepEqual(creatureTypeOf({ type: { choose: ["celestial", "fiend"] } }), { type: "celestial" });
  assert.deepEqual(creatureTypeOf("bestia"), { type: "beast" });
  assert.deepEqual(creatureTypeOf("Non morto"), { type: "undead" });
  assert.deepEqual(creatureTypeOf("sciame di bestie Minuscole"), { type: "beast", swarm: true });
  assert.deepEqual(creatureTypeOf(""), { type: "" });
  assert.deepEqual(creatureTypeOf(undefined), { type: "" });
});

test("i dati che leggono i limiti: tipo, GS, taglia e velocità in metri, anche il volo stazionario", () => {
  assert.deepEqual(facts(wolf), { name: "Wolf", type: "beast", cr: "1/4", size: "medium", speeds: { walk: 12 } });
  assert.deepEqual(facts(swarmOfRats), { name: "Swarm of Rats", type: "beast", swarm: true, cr: "1/4", size: "medium", speeds: { walk: 9 } });
  assert.deepEqual(facts(hunterShark).speeds, { swim: 12 }, "a speed of 0 is no speed");
  assert.deepEqual(facts(airElemental), { name: "Air Elemental", type: "elemental", cr: "5", size: "large", speeds: { fly: 27 }, hover: true });
  assert.equal(facts(null), null);
});

test("Forma Selvatica: GS 1/4 senza nuoto né volo al 2°, GS 1/2 senza volo al 4°, GS 1 all'8° (PHB 2014, p. 66)", () => {
  assert.equal(allowed(cat, druid(2)), true);
  assert.equal(allowed(wolf, druid(2)), true);
  assert.deepEqual(reasons(crocodile, druid(2)), [
    "GS 1/2: oltre il limite di GS 1/4 al 2° livello.",
    "Nuota: le forme che nuotano arrivano al 4° livello.",
  ]);
  assert.equal(allowed(giantEagle, druid(2)), false);
  for (const form of [crocodile, ape, blackBear, wolf]) assert.equal(allowed(form, druid(4)), true, form.name);
  assert.deepEqual(reasons(giantEagle, druid(4)), [
    "GS 1: oltre il limite di GS 1/2 al 4° livello.",
    "Vola: le forme che volano arrivano all'8° livello.",
  ]);
  for (const form of [giantEagle, brownBear, giantToad]) assert.equal(allowed(form, druid(8)), true, form.name);
  assert.deepEqual(reasons(polarBear, druid(8)), ["GS 2: oltre il limite di GS 1 all'8° livello."]);
  assert.deepEqual(reasons(polarBear, druid(11)), ["GS 2: oltre il limite di GS 1 all'11° livello."],
    "after the 8th level only CR 1 is left: swimming no longer counts");
  assert.deepEqual(reasons(wolf, druid(1)), ["La Forma Selvatica arriva al 2° livello da druido."]);
  assert.deepEqual(reasons(zombie, druid(8)), ["Non morto: la forma deve essere una bestia."]);
  assert.deepEqual(reasons(ogre, druid(8)), ["Gigante: la forma deve essere una bestia.", "GS 2: oltre il limite di GS 1 all'8° livello."],
    "every limit it breaks, not only the first");
});

test("Circolo della Luna: GS 1 dal 2°, il livello diviso 3 dal 6°, ma nuoto e volo come il druido (PHB 2014, p. 69)", () => {
  for (const form of [brownBear, direWolf]) assert.equal(allowed(form, druid(2, "moon")), true, form.name);
  assert.deepEqual(reasons(giantToad, druid(2, "moon")), ["Nuota: le forme che nuotano arrivano al 4° livello."]);
  assert.deepEqual(reasons(polarBear, druid(2, "moon")), [
    "GS 2: oltre il limite di GS 1 al 2° livello (Circolo della Luna).",
    "Nuota: le forme che nuotano arrivano al 4° livello.",
  ]);
  assert.equal(allowed(giantToad, druid(4, "moon")), true);
  assert.deepEqual(reasons(giantEagle, druid(4, "moon")), ["Vola: le forme che volano arrivano all'8° livello."]);
  for (const form of [polarBear, hunterShark, giantConstrictorSnake]) {
    assert.equal(allowed(form, druid(6, "druido-circolo-della-luna")), true, form.name);
  }
  assert.deepEqual(reasons(elephant, druid(6, "moon")), ["GS 4: oltre il limite di GS 2 al 6° livello (Circolo della Luna)."]);
  assert.equal(allowed(elephant, druid(9, "moon")), false, "GS 3 al 9°");
  assert.equal(allowed(elephant, druid(12, "moon")), true, "GS 4 al 12°");
  assert.equal(allowed(mammoth, druid(18, "moon")), true, "GS 6 al 18°");
  assert.equal(allowed(tyrannosaurus, druid(20, "moon")), false, "GS 6 al 20°");
  assert.equal(allowed(brownBear, druid(2, "luna")), true, "the Italian name of the circle");
  assert.equal(allowed(brownBear, druid(2, "druido-circolo-della-terra")), false, "another circle is a plain druid");
});

test("Forma Selvatica Elementale: i quattro elementali, solo per il Circolo della Luna dal 10° livello", () => {
  const elemental = (druidLevel, circle = "moon") => ({ kind: "elemental-wild-shape", druidLevel, circle });
  assert.equal(allowed(earthElemental, elemental(10)), true);
  assert.equal(allowed(airElemental, elemental(10)), true);
  assert.equal(transformationFormAllowed({ name: "Elementale del Fuoco", type: "elemental", cr: "5", size: "large", speeds: { walk: 15 } },
    elemental(10)).allowed, true, "the Italian name of a Monster Manual elemental");
  assert.deepEqual(reasons(salamander, elemental(10)), ["Solo un elementale dell'aria, dell'acqua, del fuoco o della terra."]);
  assert.deepEqual(reasons(brownBear, elemental(10)), [
    "Bestia: la forma deve essere un elementale.",
    "Solo un elementale dell'aria, dell'acqua, del fuoco o della terra.",
  ]);
  const notYet = ["La Forma Selvatica Elementale è del Circolo della Luna, dal 10° livello."];
  assert.deepEqual(reasons(earthElemental, elemental(9)), notYet);
  assert.deepEqual(reasons(earthElemental, elemental(10, "")), notYet);
});

test("Metamorfosi: una bestia fino al GS del bersaglio, o al suo livello se non ha un GS", () => {
  const pc = { kind: "polymorph", targetLevel: 5 };
  assert.equal(allowed(elephant, pc), true);
  assert.deepEqual(reasons(mammoth, pc), ["GS 6: oltre il livello del bersaglio (5°)."]);
  assert.deepEqual(reasons(ogre, pc), ["Gigante: la forma deve essere una bestia."]);
  const ogreTarget = { kind: "polymorph", targetCr: "2" };
  assert.equal(allowed(polarBear, ogreTarget), true);
  assert.deepEqual(reasons(elephant, ogreTarget), ["GS 4: oltre il GS del bersaglio (2)."]);
  assert.equal(allowed(wolf, { kind: "polymorph", targetCr: "1/4" }), true);
  assert.equal(allowed(crocodile, { kind: "polymorph", targetCr: "1/4" }), false);
  assert.equal(allowed(elephant, { kind: "polymorph", targetCr: "4", targetLevel: 1 }), true, "the challenge rating wins over a level");
  assert.deepEqual(reasons(wolf, { kind: "polymorph" }), ["Serve il GS del bersaglio, o il suo livello se non ne ha."]);
});

test("Metamorfosi Pura: qualsiasi tipo fino al GS o al livello; Trasformazione: niente costrutti né non morti", () => {
  const trueForm = { kind: "true-polymorph", targetLevel: 17 };
  for (const form of [ironGolem, tyrannosaurus, zombie, ogre]) assert.equal(allowed(form, trueForm), true, form.name);
  assert.deepEqual(reasons(earthElemental, { kind: "true-polymorph", targetCr: "2" }), ["GS 5: oltre il GS del bersaglio (2)."]);
  const shapechange = { kind: "shapechange", casterLevel: 17 };
  for (const form of [tyrannosaurus, earthElemental, elephant]) assert.equal(allowed(form, shapechange), true, form.name);
  assert.deepEqual(reasons(zombie, shapechange), ["Non morto: Trasformazione non permette costrutti né non morti."]);
  assert.deepEqual(reasons(ironGolem, shapechange), ["Costrutto: Trasformazione non permette costrutti né non morti."]);
  assert.deepEqual(reasons(mammoth, { kind: "shapechange", casterLevel: 5 }), ["GS 6: oltre il livello di chi lancia (5°)."]);
  assert.deepEqual(reasons(mammoth, { kind: "shapechange", casterCr: "4" }), ["GS 6: oltre il GS di chi lancia (4)."]);
  assert.deepEqual(reasons(wolf, { kind: "shapechange" }), ["Serve il GS di chi lancia, o il suo livello se non ne ha."]);
});

test("Forme Animali: una bestia di taglia Grande o inferiore, fino al GS 4", () => {
  const shapes = { kind: "animal-shapes" };
  for (const form of [wolf, brownBear, polarBear]) assert.equal(allowed(form, shapes), true, form.name);
  assert.deepEqual(reasons(elephant, shapes), ["Taglia Enorme: al massimo Grande."]);
  assert.deepEqual(reasons(giantConstrictorSnake, shapes), ["Taglia Enorme: al massimo Grande."]);
  assert.deepEqual(reasons(mammoth, shapes), ["GS 6: oltre il limite di GS 4.", "Taglia Enorme: al massimo Grande."]);
  assert.deepEqual(reasons(ogre, shapes), ["Gigante: la forma deve essere una bestia."]);
});

test("gli sciami non sono mai ammessi, con nessuna fonte (G18)", () => {
  const contexts = [druid(8), druid(6, "moon"), { kind: "polymorph", targetLevel: 5 }, { kind: "true-polymorph", targetLevel: 17 },
    { kind: "shapechange", casterLevel: 17 }, { kind: "animal-shapes" }];
  for (const context of contexts) {
    assert.deepEqual(reasons(swarmOfRats, context), ["Sciame: non si può assumere la forma di uno sciame."], context.kind);
  }
});

test("tipo, GS o taglia mancanti: la forma aspetta che il GM li indichi", () => {
  const homebrew = { name: "Lucertola delle nevi", type: "", cr: "", size: "", speeds: { walk: 9 } };
  assert.deepEqual(transformationFormAllowed(homebrew, druid(8)).reasons, [
    "Tipo sconosciuto: va indicato prima di usare la forma.",
    "GS sconosciuto: va indicato prima di usare la forma.",
  ]);
  assert.deepEqual(transformationFormAllowed({ ...homebrew, type: "beast", cr: "1" }, { kind: "animal-shapes" }).reasons,
    ["Taglia sconosciuta: va indicata prima di usare la forma."]);
  assert.deepEqual(transformationFormAllowed(null, druid(8)), { allowed: false, reasons: ["Nessuna forma scelta."] });
  assert.deepEqual(transformationFormAllowed(facts(wolf), { kind: "moonbeam" }), { allowed: false, reasons: ["Trasformazione sconosciuta."] });
  assert.deepEqual(transformationLimits({ kind: "" }), { error: "Trasformazione sconosciuta." });
  assert.deepEqual([...TRANSFORMATION_KINDS], ["wild-shape", "elemental-wild-shape", "polymorph", "true-polymorph", "shapechange", "animal-shapes",
    "mass-polymorph"]);
});

test("l'istantanea della forma da 5eTools: PF, CA, caratteristiche, velocità, azioni e multiattacco", () => {
  const { block, error } = fiveToolsMonsterToStatblock(wolf);
  assert.equal(error, "");
  const form = transformationFormFromStatblock(block, wolf);
  const { actions, ...rest } = form;
  assert.deepEqual(rest, {
    name: "Wolf", ref: "Wolf|MM", source: "5etools", type: "beast", cr: "1/4", size: "medium",
    hitPoints: { average: 11, formula: "2d8 + 2" }, armorClass: 13,
    abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    speeds: { walk: 12 }, passivePerception: 13, notes: "Tratti: Keen Hearing and Smell.",
  });
  // Lotto W3a: the attacks as the card's quick actions, as the sheet's import reads a monster's block.
  assert.deepEqual(actions.map((action) => [action.id, action.label, action.kind, action.attackBonus]), [["form-1", "Bite", "attack", 4]]);
  assert.equal(actions[0].components[0].formula, "2d4+2");
  assert.equal(actions[0].onHit.save.onFail.condition, "Prono");
  const bear = transformationFormFromStatblock(fiveToolsMonsterToStatblock(brownBear).block, brownBear);
  assert.match(bear.multiattack, /two attacks/);
  assert.deepEqual(bear.actions.map((action) => action.label), ["Bite", "Claws"]);
  assert.deepEqual(bear.speeds, { walk: 12, climb: 9 });
  assert.equal(bear.size, "large");
});

test("l'istantanea tiene le difese, le immunità alle condizioni e i TS dello statblock", () => {
  const elemental = transformationFormFromStatblock(fiveToolsMonsterToStatblock(earthElemental).block, earthElemental);
  assert.deepEqual(elemental.damageDefenses.immunities, ["poison"]);
  assert.deepEqual(elemental.damageDefenses.vulnerabilities, ["thunder"]);
  assert.deepEqual(elemental.damageDefenses.nonmagical, ["bludgeoning", "piercing", "slashing"]);
  assert.ok(elemental.conditionImmunities.includes("avvelenato"));
  assert.deepEqual(elemental.speeds, { walk: 9, burrow: 9 });
  const saving = transformationFormFromStatblock({ name: "Tiger", savingThrows: { dex: "+5", con: "−1", wis: "" }, actions: [] }, null);
  assert.deepEqual(saving.savingThrows, { dex: 5, con: -1 });
});

test("senza record 5eTools l'istantanea legge le velocità dello statblock e lascia vuoti tipo e GS", () => {
  const form = transformationFormFromStatblock({ name: "Lontra gigante", size: "medium", speed: "30 ft", speeds: { swim: "40 ft" }, actions: [] });
  assert.deepEqual(form.speeds, { walk: 9, swim: 12 });
  assert.equal(form.type, "");
  assert.equal(form.cr, "");
  assert.equal(form.source, "manual");
  assert.equal(transformationFormFromStatblock(null), null);
  assert.equal(transformationFormFromStatblock({ name: " ", actions: [] }), null);
});

test("uno statblock delle regole 2024 non dà una forma: le trasformazioni seguono il 2014", () => {
  const { block } = fiveToolsMonsterToStatblock(wolf);
  assert.equal(transformationFormFromStatblock(block, { ...wolf, source: "XMM" }), null);
});

test("l'istantanea da un testo incollato: il parser dà anche tipo e GS", () => {
  const wolfText = [
    "Wolf", "Medium beast, unaligned", "Armor Class 13 (natural armor)", "Hit Points 11 (2d8 + 2)", "Speed 40 ft.",
    "STR DEX CON INT WIS CHA", "12 (+1) 15 (+2) 12 (+1) 3 (−4) 12 (+1) 6 (−2)", "Skills Perception +3, Stealth +4",
    "Senses passive Perception 13", "Languages —", "Challenge 1/4 (50 XP)",
    "Keen Hearing and Smell. The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.",
    "Actions",
    "Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.",
  ].join("\n");
  const read = statblockTextImport(wolfText);
  assert.equal(read.error, "");
  const form = transformationFormFromStatblock(read.block, read.monster);
  assert.equal(form.ref, "Wolf|testo");
  assert.equal(form.type, "beast");
  assert.equal(form.cr, "1/4");
  assert.deepEqual(form.hitPoints, { average: 11, formula: "2d8 + 2" });
  assert.deepEqual(form.speeds, { walk: 12 });
  assert.equal(transformationFormAllowed(form, druid(2)).allowed, true);
  const crocodileText = [
    "Crocodile", "Large beast, unaligned", "Armor Class 12 (natural armor)", "Hit Points 19 (3d10 + 3)", "Speed 20 ft., swim 30 ft.",
    "STR DEX CON INT WIS CHA", "15 (+2) 10 (+0) 13 (+1) 2 (−4) 10 (+0) 5 (−3)", "Skills Stealth +2", "Senses passive Perception 10",
    "Languages —", "Challenge 1/2 (100 XP)", "Hold Breath. The crocodile can hold its breath for 15 minutes.",
    "Actions",
    "Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 7 (1d10 + 2) piercing damage, and the target is grappled (escape DC 12).",
  ].join("\n");
  const crocodileRead = statblockTextImport(crocodileText);
  assert.equal(crocodileRead.error, "");
  const crocodileForm = transformationFormFromStatblock(crocodileRead.block, crocodileRead.monster);
  assert.deepEqual(crocodileForm.speeds, { walk: 6, swim: 9 });
  assert.equal(transformationFormAllowed(crocodileForm, druid(4)).allowed, true);
  assert.equal(transformationFormAllowed(crocodileForm, druid(2)).allowed, false);
});

test("l'elenco delle forme dall'archivio: solo quelle ammesse, il GS più alto prima, la ricerca per nome", () => {
  const winterPup = { name: "Winter Wolf Pup", source: "HB", _copy: { name: "Wolf", source: "MM" } };
  const archive = [cat, wolf, crocodile, ape, blackBear, giantEagle, brownBear, swarmOfRats, ogre, { ...wolf, source: "XMM" }, winterPup];
  const labels = (entries) => entries.map((entry) => `${entry.monster.name}|${entry.monster.source}`);
  const fourth = transformationFormCandidates(archive, druid(4));
  assert.deepEqual(labels(fourth), ["Ape|MM", "Black Bear|MM", "Crocodile|MM", "Winter Wolf Pup|HB", "Wolf|MM", "Cat|MM"]);
  assert.equal(fourth[3].monster, winterPup, "the record as given: the stat block is built from it, with its base");
  assert.equal(fourth[3].form.cr, "1/4", "a derived monster is read with its base");
  assert.deepEqual(labels(transformationFormCandidates(archive, druid(4), { query: "bear" })), ["Black Bear|MM"]);
  assert.deepEqual(labels(transformationFormCandidates(archive, druid(4), { query: "wolf" })), ["Winter Wolf Pup|HB", "Wolf|MM"]);
  assert.deepEqual(labels(transformationFormCandidates(archive, druid(4), { limit: 2 })), ["Ape|MM", "Black Bear|MM"]);
  assert.deepEqual(labels(transformationFormCandidates(archive, druid(8))).slice(0, 2), ["Brown Bear|MM", "Giant Eagle|MM"]);
  assert.deepEqual(transformationFormCandidates(archive, druid(1)), []);
  assert.deepEqual(transformationFormCandidates(null, druid(8)), []);
});

const quick = (name, extra = {}) => ({ name, ref: `${name}|MM`, source: "5etools", type: "beast", cr: "1/4", size: "medium",
  speeds: { walk: 12 }, actions: [], ...extra });

test("una forma salvata: campi controllati, stringhe accorciate, azioni limitate", () => {
  const form = sanitizeTransformationForm({
    name: "  Wolf  ", ref: "Wolf|MM", source: "pirate", type: "dragonish", cr: "1/4", size: "enormous",
    hitPoints: { average: "11", formula: "2d8 + 2" }, armorClass: 99, abilities: { str: 12, dex: 99, luck: 18 },
    savingThrows: { dex: "5", con: null }, speeds: { walk: 12, fly: 0, teleport: 30 }, hover: true,
    damageDefenses: { resistances: ["cold", "cold"], immunities: [], weird: ["x"] }, conditionImmunities: ["spaventato"],
    multiattack: "x".repeat(400), extra: "dropped",
    actions: [
      { label: "Bite", kind: "attack", range: "melee", attackBonus: 4, components: [{ type: "piercing", formula: "2d4+2" }] },
      { label: "", kind: "attack" }, "claw", { label: "Huge", kind: "attack", note: "y".repeat(2000) }, { name: "Old format" },
    ],
  });
  const { actions, ...rest } = form;
  assert.deepEqual(rest, {
    name: "Wolf", ref: "Wolf|MM", source: "manual", type: "", cr: "1/4", size: "",
    hitPoints: { average: 11, formula: "2d8 + 2" }, armorClass: 40, abilities: { str: 12, dex: 30 },
    savingThrows: { dex: 5 }, speeds: { walk: 12 }, damageDefenses: { resistances: ["cold"] },
    conditionImmunities: ["spaventato"], multiattack: "x".repeat(280),
  });
  assert.deepEqual(actions.map((action) => [action.id, action.label, action.attackBonus]), [["form-1", "Bite", 4]],
    "only quick actions of the card's shape, under 1.5 kB each");
  assert.equal(sanitizeTransformationForm({ name: "  " }), null);
  assert.equal(sanitizeTransformationForm(["Wolf"]), null);
});

test("le forme rapide: al massimo 8, senza doppioni, sostituite al loro posto", () => {
  const eight = Array.from({ length: MAX_TRANSFORMATION_FORMS + 2 }, (_, index) => quick(`Beast ${index}`));
  assert.equal(sanitizeTransformationForms([...eight, eight[0]]).length, MAX_TRANSFORMATION_FORMS);
  assert.deepEqual(sanitizeTransformationForms([quick("Wolf"), quick("Wolf", { cr: "1" })]).map((form) => form.cr), ["1/4"]);
  const full = sanitizeTransformationForms(eight);
  const refused = transformationFormsWith(full, quick("Brown Bear"));
  assert.equal(refused.error, "Le forme rapide sono già 8: scegli quale sostituire.");
  assert.equal(refused.forms.length, 8);
  const replaced = transformationFormsWith(full, quick("Brown Bear"), { replaceKey: "Beast 3|MM" });
  assert.equal(replaced.error, "");
  assert.deepEqual(replaced.forms.map((form) => form.name).slice(2, 5), ["Beast 2", "Brown Bear", "Beast 4"]);
  const same = transformationFormsWith([quick("Wolf"), quick("Ape")], quick("Wolf", { cr: "1/2" }));
  assert.deepEqual(same.forms.map((form) => `${form.name} ${form.cr}`), ["Wolf 1/2", "Ape 1/4"], "the same form takes its own place");
  assert.deepEqual(transformationFormsWithout(same.forms, "wolf|mm").map((form) => form.name), ["Ape"]);
  assert.equal(transformationFormsWith([], { name: "" }).error, "Forma non valida.");
});

test("le forme rapide restano entro il budget di byte del registro della stanza", () => {
  const heavy = (name) => quick(name, { notes: "n".repeat(280), multiattack: "m".repeat(280),
    actions: Array.from({ length: 8 }, (_, index) => ({ label: `Attack ${index} ${"t".repeat(60)}`, kind: "attack", range: "melee",
      attackBonus: 5, components: [{ type: "slashing", formula: "2d6+3" }, { type: "fire", formula: "1d6" }] })) });
  const kept = sanitizeTransformationForms(Array.from({ length: 8 }, (_, index) => heavy(`Heavy ${index}`)));
  assert.ok(kept.length < 8, "not all of them fit");
  assert.ok(new TextEncoder().encode(JSON.stringify(kept)).length <= 6000);
  assert.match(transformationFormsWith(kept, heavy("One more")).error, /Spazio delle forme rapide esaurito|scegli quale sostituire/);
});

test("il riassunto della forma, il contesto del druido e la trasformazione della capacità", () => {
  assert.equal(transformationFormSummary(quick("Crocodile", { cr: "1/2", armorClass: 12, hitPoints: { average: 19 }, speeds: { walk: 6, swim: 9.5 } })),
    "Crocodile (bestia, GS 1/2): CA 12 · PF 19 · 6 m, nuoto 9,5 m");
  assert.equal(transformationFormSummary({ name: "Thing", speeds: {} }), "Thing");
  assert.deepEqual(transformationContextForCharacter([{ classId: "mago", level: 3 }, { classId: "druido", level: 6, subclassId: "druido-circolo-della-luna" }], "wild-shape"),
    { kind: "wild-shape", druidLevel: 6, circle: "druido-circolo-della-luna" });
  assert.deepEqual(transformationContextForCharacter([], "wild-shape"), { kind: "wild-shape", druidLevel: 0, circle: "" });
  assert.deepEqual(transformationContextForCharacter([{ classId: "druido", level: 6 }], "polymorph"), { kind: "polymorph" });
  assert.equal(transformationTemplateOf({ effectPlan: { mechanics: { transformation: { kind: "wild-shape" } } } }).kind, "wild-shape");
  assert.equal(transformationTemplateOf({ effectPlan: { mechanics: { transformation: { kind: "moonbeam" } } } }), null);
  assert.equal(transformationTemplateOf(null), null);
});

test("«Altra forma…»: un JSON di 5eTools con un mostro, il testo di uno statblock, gli errori in italiano", () => {
  const fromJson = transformationFormFromImport(JSON.stringify(wolf));
  assert.equal(fromJson.error, "");
  assert.equal(fromJson.form.ref, "Wolf|MM");
  assert.equal(fromJson.form.cr, "1/4");
  assert.equal(transformationFormFromImport(JSON.stringify({ monster: [wolf] })).form.name, "Wolf");
  assert.equal(transformationFormFromImport(JSON.stringify({ monster: [wolf, brownBear] })).error,
    "Il JSON ha 2 mostri: incollane uno solo, o cercalo nell'archivio.");
  assert.equal(transformationFormFromImport(JSON.stringify({ name: "Nyx", classes: [] })).error, "Il JSON non è un mostro di 5eTools.");
  assert.equal(transformationFormFromImport(JSON.stringify({ ...wolf, source: "XMM" })).error,
    "Statblock delle regole 2024: le trasformazioni seguono quelle del 2014.");
  assert.equal(transformationFormFromImport("  ").error, "Incolla il JSON di un mostro di 5eTools o il testo di uno statblock.");
  const fromText = transformationFormFromImport([
    "Giant Frog", "Medium beast, unaligned", "Armor Class 11", "Hit Points 18 (4d8)", "Speed 30 ft., swim 30 ft.",
    "STR DEX CON INT WIS CHA", "12 (+1) 13 (+1) 11 (+0) 2 (−4) 10 (+0) 3 (−4)", "Senses passive Perception 12",
    "Languages —", "Challenge 1/4 (50 XP)", "Actions",
    "Bite. Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) piercing damage.",
  ].join("\n"));
  assert.equal(fromText.error, "");
  assert.equal(fromText.form.type, "beast");
  assert.deepEqual(fromText.form.speeds, { walk: 9, swim: 9 });
  assert.ok(transformationFormFromImport("just some words").error);
});

// «Altra forma…» da un token nella stanza (G37, fonte del GM): la card di un mostro, o il suo record nell'archivio.
test("W2a: i token dei mostri nella stanza come fonte; la forma dall'archivio o dai numeri della card", async () => {
  const { transformationTokenSources, transformationFormFromToken } = await import("../src/transformationCore.js");
  const META = "com.thebigpicture.initiative/meta";
  const token = (id, name, card, extra = {}) => ({ id, name, metadata: { [META]: { hp: 7, hpMax: 7, initiativeCard: card, ...extra } } });
  const bite = { id: "bite", label: "Morso", kind: "attack", range: "melee", attackBonus: 4, components: [{ type: "piercing", formula: "2d4+2" }] };
  const items = [
    token("druid", "Ilse", { characterBuild: [{ classId: "druido", level: 4 }] }),
    token("w1", "Lupo grigio", { monster: { source: "5etools", ref: "Wolf|MM" } }),
    token("g1", "Goblin", { armorClass: 15, speed: 9, abilityModifiers: { str: -1, dex: 2, con: 0, int: 0, wis: -1, cha: -1 },
      savingThrows: { dex: 2 }, passivePerception: 9, quickActions: [bite, { id: "heal", label: "Pozione", kind: "heal" }],
      damageDefenses: { resistances: ["fire"] },
      monster: { source: "manual", multiattack: "Two bites.", hitPoints: { value: 7, formula: "2d6" }, tokenSize: "small",
        speeds: { climb: 6 }, conditionImmunities: ["spaventato"] } }),
  ];
  assert.deepEqual(transformationTokenSources(items, "druid"),
    [{ id: "g1", name: "Goblin", fromArchive: false }, { id: "w1", name: "Lupo grigio", fromArchive: true }]);
  assert.deepEqual(transformationTokenSources(items, "g1").map((entry) => entry.id), ["w1"], "the creature itself left out");

  const fromArchive = transformationFormFromToken(items[1], { monsters: [wolf], pool: [wolf] });
  assert.deepEqual([fromArchive.error, fromArchive.form.name, fromArchive.form.type, fromArchive.form.cr, fromArchive.form.ref],
    ["", "Wolf", "beast", "1/4", "Wolf|MM"]);
  const withoutArchive = transformationFormFromToken(items[1]);
  assert.equal(withoutArchive.form.name, "Lupo grigio", "no record: the card's numbers");

  const goblin = transformationFormFromToken(items[2]);
  assert.equal(goblin.error, "");
  assert.deepEqual((({ name, type, cr, size, hitPoints, armorClass, speeds, passivePerception, multiattack, conditionImmunities }) =>
    ({ name, type, cr, size, hitPoints, armorClass, speeds, passivePerception, multiattack, conditionImmunities }))(goblin.form), {
    name: "Goblin", type: "", cr: "", size: "small", hitPoints: { average: 7, formula: "2d6" }, armorClass: 15,
    speeds: { walk: 9, climb: 6 }, passivePerception: 9, multiattack: "Two bites.", conditionImmunities: ["spaventato"],
  });
  assert.deepEqual(goblin.form.abilities, { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
  assert.deepEqual(goblin.form.damageDefenses, { resistances: ["fire"] });
  assert.deepEqual(goblin.form.actions.map((action) => action.label), ["Morso"], "only the attacks");
  assert.equal(transformationFormFromToken(items[0]).error, "Il token non ha la card di un mostro.");
});
