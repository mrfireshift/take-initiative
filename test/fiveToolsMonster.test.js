// Attacchi dei mostri, fase 2, lotto 1: il JSON di 5eTools tradotto nello statblock della fase 1 e letto dall'import della
// scheda. Mostri dell'SRD 5.1 (CC-BY-4.0, test-support/fivetools-srd-monsters.json) e mostri inventati per i casi limite.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fiveToolsActions, fiveToolsMonsterToStatblock, fiveToolsMonsters, fiveToolsPlainText, isFiveTools2024, isFiveToolsData }
  from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";

const srd = JSON.parse(readFileSync(new URL("../test-support/fivetools-srd-monsters.json", import.meta.url), "utf8"));
const monster = (name) => srd.monster.find((entry) => entry.name === name);
const imported = (name) => {
  const { block, error } = fiveToolsMonsterToStatblock(monster(name));
  assert.equal(error, "");
  return parseCharacterSheetImport(JSON.stringify(block));
};

test("5eTools: un file bestiario, un elenco o un mostro; il formato del plugin non è 5eTools", () => {
  assert.equal(fiveToolsMonsters(srd).length, 7);
  assert.equal(fiveToolsMonsters(srd.monster).length, 7);
  assert.deepEqual(fiveToolsMonsters(monster("Goblin")).map((entry) => entry.name), ["Goblin"]);
  assert.equal(isFiveToolsData(srd), true);
  assert.equal(isFiveToolsData(monster("Ghoul")), true);
  assert.equal(isFiveToolsData({ kind: "monster", name: "Goblin", actions: [] }), false);
  assert.equal(isFiveToolsData({ name: "Nyx", classes: [] }), false);
});

test("i tag diventano testo", () => {
  assert.equal(fiveToolsPlainText("{@atk mw} {@hit 4} to hit. {@h}5 ({@damage 1d6 + 2}) slashing, {@dc 13}, {@condition frightened}, {@spell shillelagh|phb}"),
    "Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) slashing, DC 13, frightened, shillelagh");
  assert.equal(fiveToolsPlainText("Fire Breath {@recharge 5}"), "Fire Breath (Recharge 5–6)");
  assert.equal(fiveToolsPlainText("{@creature air elemental|mm|elementale}"), "elementale");
});

test("goblin: CA, PF, velocità, caratteristiche, due attacchi pieni; il tratto nelle note", () => {
  const { block, report, counts } = fiveToolsMonsterToStatblock(monster("Goblin"));
  assert.equal(block.source, "5etools");
  assert.equal(block.armorClass, 15);
  assert.deepEqual(block.hitPoints, { average: 7, formula: "2d6" });
  assert.equal(block.speed, "30 ft");
  assert.deepEqual(counts, { full: 2, partial: 0, manual: 0 });
  assert.deepEqual(block.actions.map((action) => [action.name, action.attack.type, action.attack.bonus]), [["Scimitar", "melee", 4], ["Shortbow", "ranged", 4]]);
  assert.deepEqual(block.actions[1].attack.range, { normal: 80, long: 320 });
  assert.equal(block.notes, "Tratti: Nimble Escape.");
  assert.ok(report.includes("tratti da leggere nella console (Capacità): Nimble Escape"));
  const parsed = imported("Goblin");
  assert.deepEqual(parsed.unresolved, []);
  assert.deepEqual(parsed.sections.attacks.map((attack) => [attack.label, attack.attackBonus, attack.reachFeet, attack.components[0].type]),
    [["Scimitar", 4, 5, "slashing"], ["Shortbow", 4, undefined, "piercing"]]);
  assert.deepEqual(parsed.hitPoints, { average: 7, formula: "2d6" });
});

test("bugbear: il giavellotto con due danni diventa due azioni, mischia e distanza", () => {
  const parsed = imported("Bugbear");
  assert.deepEqual(parsed.unresolved, []);
  const javelins = parsed.sections.attacks.filter((attack) => attack.label.startsWith("Javelin"));
  assert.deepEqual(javelins.map((attack) => [attack.label, attack.range, attack.components[0].formula, attack.reachFeet, attack.rangeFeet]),
    [["Javelin (melee)", "melee", "2d6+2", 5, undefined], ["Javelin (ranged)", "ranged", "1d6+2", undefined, { normal: 30, long: 120 }]]);
});

test("ghoul: il TS degli artigli al colpo si registra (fase 5, lotto 4), l'eccezione sui bersagli resta nella nota; immunità in italiano", () => {
  const { block, report, counts } = fiveToolsMonsterToStatblock(monster("Ghoul"));
  assert.deepEqual(counts, { full: 2, partial: 0, manual: 0 });
  const claws = block.actions.find((action) => action.name === "Claws");
  assert.deepEqual(claws.onHit.save.conditions, ["paralyzed"]);
  assert.match(claws.note, /^If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed/,
    "a save for some targets only keeps its sentence");
  assert.ok(!report.some((line) => /resta nella nota/.test(line)));
  assert.equal(block.notes, "Immune a: affascinato, indebolimento, avvelenato.");
  assert.deepEqual(block.damageDefenses, { resistances: [], immunities: ["poison"], vulnerabilities: [] });
  assert.deepEqual(imported("Ghoul").unresolved, []);
});

test("ragno gigante: morso con TS veleno al colpo, ragnatela con ricarica e senza danni al tavolo", () => {
  const { block, report } = fiveToolsMonsterToStatblock(monster("Giant Spider"));
  assert.deepEqual(block.actions.map((action) => action.name), ["Bite"]);
  assert.ok(report.includes("da gestire al tavolo: Web"));
});

test("drago d'argento adulto: multiattacco, Presenza terrificante, i due soffi con la stessa ricarica, resistenza leggendaria segnalata", () => {
  const { block, report } = fiveToolsMonsterToStatblock(monster("Adult Silver Dragon"));
  assert.match(block.multiattack, /^The dragon can use its Frightful Presence\. It then makes three attacks/);
  const presence = block.actions.find((action) => action.name === "Frightful Presence");
  assert.deepEqual([presence.save, presence.area, presence.onFail, presence.damage], [{ ability: "wis", dc: 18, half: false },
    { shape: "sphere", size: 120, origin: "self", choice: true },
    { condition: "frightened", duration: { rounds: 10 }, repeat: { timing: "turn-end", ends: true } }, []], "phase 5, lot 0: origin, choice, duration, repeat");
  assert.equal(presence.immuneHours, 24);
  // Fase 5, lotto 3: the repeated save and the 24-hour immunity are fields; their sentences left the note.
  assert.equal(presence.note, undefined);
  const cold = block.actions.find((action) => action.name === "Cold Breath");
  assert.deepEqual([cold.recharge, cold.save, cold.area, cold.damage, cold.note], [5, { ability: "con", dc: 20, half: true }, { shape: "cone", size: 60, origin: "self" },
    [{ type: "cold", formula: "13d8" }], undefined]);
  const paralyzing = block.actions.find((action) => action.name === "Paralyzing Breath");
  assert.deepEqual([paralyzing.recharge, paralyzing.onFail, paralyzing.damage], [5, { condition: "paralyzed", duration: { rounds: 10 }, repeat: { timing: "turn-end", ends: true } }, []]);
  // Fase 4, lotto 5: the tracker's Leggendario mode, set after Salva; the traits are read in the console.
  assert.deepEqual(block.legendary, { actions: 3, resistances: 3 });
  assert.ok(report.includes("tratti da leggere nella console (Capacità): Legendary Resistance (3/Day)"));
  assert.ok(report.includes("da gestire al tavolo: Change Shape"));
  const parsed = imported("Adult Silver Dragon");
  assert.deepEqual(parsed.unresolved, []);
  const coldAttack = parsed.sections.attacks.find((attack) => attack.label === "Cold Breath");
  assert.deepEqual([coldAttack.save, coldAttack.saveDC, coldAttack.saveHalf, coldAttack.area, coldAttack.recharge],
    ["con", 20, true, { shape: "cone", sizeFeet: 60, origin: "self" }, 5]);
  assert.equal(parsed.sections.attacks.find((attack) => attack.label === "Paralyzing Breath").onFail.condition, "Paralizzato");
});

test("druido: «to hit with shillelagh» e l'arma versatile, la prima forma; il resto nella nota; la prima CA", () => {
  const { block } = fiveToolsMonsterToStatblock(monster("Druid"));
  assert.equal(block.armorClass, 11);
  const [staff] = block.actions;
  assert.deepEqual([staff.attack.bonus, staff.damage], [2, [{ type: "bludgeoning", formula: "1d6" }]]);
  assert.match(staff.note, /4 \(1d8\) bludgeoning damage if wielded with two hands, or 6 \(1d8 \+ 2\) bludgeoning damage with shillelagh/);
  assert.match(block.notes || "", /^$|Tratti/);
});

test("elefante: un bersaglio con tag («one prone creature») resta un attacco", () => {
  const { block, counts } = fiveToolsMonsterToStatblock(monster("Elephant"));
  assert.deepEqual(counts.manual, 0);
  assert.equal(block.actions.find((action) => action.name === "Stomp").damage[0].formula, "3d10+6");
});

// Mostri inventati: nessun testo WotC.
const invented = (fields) => ({ name: "Prova", source: "HB", ac: [13], hp: { average: 20, formula: "3d8+7" }, speed: { walk: 30 }, ...fields });

test("danni detti solo per chi supera il TS: al tavolo, mai letti come danni del fallimento", () => {
  const [action] = fiveToolsActions({ name: "Urlo (1/Day)", entries: ["Each creature within 30 feet must make a {@dc 13} Constitution saving throw. On a failure, a creature drops to 0 hit points. On a success, a creature takes 10 ({@damage 3d6}) psychic damage."] });
  assert.equal(action.status, "manual");
});

test("usi al giorno, ricarica 6, linea con larghezza, un bersaglio, danno fisso, condizione «or fall»", () => {
  const [line] = fiveToolsActions({ name: "Raggio {@recharge}", entries: ["The creature exhales lightning in a 30-foot line that is 5 feet wide. Each creature in that line must make a {@dc 12} Dexterity saving throw, taking 10 ({@damage 3d6}) lightning damage on a failed save, or half as much damage on a successful one."] });
  assert.deepEqual([line.name, line.recharge, line.area, line.save.half], ["Raggio", 6, { shape: "line", size: 30, width: 5, origin: "self" }, true]);
  const [gaze] = fiveToolsActions({ name: "Sguardo (3/Day)", entries: ["The creature targets one creature it can see within 30 feet of it. The target must succeed on a {@dc 11} Wisdom saving throw or fall {@condition unconscious} for 1 minute."] });
  assert.deepEqual([gaze.name, gaze.uses, gaze.area, gaze.onFail], ["Sguardo", 3, undefined, { condition: "unconscious", duration: { rounds: 10 } }]);
  const [poke] = fiveToolsActions({ name: "Puntura", entries: ["{@atk mw} {@hit 3} to hit, reach 5 ft., one target. {@h}1 piercing damage."] });
  assert.deepEqual(poke.damage, [{ type: "piercing", formula: "1" }]);
  const [bolt] = fiveToolsActions({ name: "Dardo", entries: ["{@atk rs} {@hit 5} to hit, range 120 ft., one target. {@h}10 ({@damage 3d6}) fire damage."] });
  assert.deepEqual([bolt.attack.type, bolt.attack.range, bolt.status], ["ranged", { normal: 120 }, "full"]);
});

test("difese da armi non magiche importate e segnate, le altre condizionali segnalate; azioni bonus con il loro nome", () => {
  const { block, report } = fiveToolsMonsterToStatblock(invented({
    resist: ["fire", { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true }],
    bonus: [{ name: "Morso rapido", entries: ["{@atk mw} {@hit 3} to hit, reach 5 ft., one target. {@h}4 ({@damage 1d4 + 2}) piercing damage."] }],
  }));
  assert.deepEqual(block.damageDefenses.resistances, ["fire", "bludgeoning", "piercing", "slashing"]);
  assert.deepEqual(block.damageDefenses.nonmagical, ["bludgeoning", "piercing", "slashing"]);
  assert.equal(block.damageDefenses.nonmagicalExcept, undefined);
  assert.ok(report.includes("resistenza ai danni non magici: contundenti, perforanti, taglienti (per un'arma magica, ✦ Magica nella console)"));
  assert.deepEqual(block.actions.map((action) => action.name), ["Morso rapido (bonus action)"]);
  const inDarkness = fiveToolsMonsterToStatblock(invented({ resist: [{ resist: ["slashing"], note: "from nonmagical attacks while in dim light or darkness", cond: true }] }));
  assert.equal(inDarkness.block.damageDefenses, undefined);
  assert.ok(inDarkness.report.includes("resistenza condizionale non importata: slashing (from nonmagical attacks while in dim light or darkness)"));
});

test("rifiutati: i mostri delle regole 2024 e, per ora, quelli derivati da un altro (lotto 2)", () => {
  assert.equal(isFiveTools2024({ name: "Goblin Warrior", source: "XMM" }), true);
  assert.equal(isFiveTools2024(invented({ action: [{ name: "Scimitar", entries: ["{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage."] }] })), true);
  assert.match(fiveToolsMonsterToStatblock({ name: "Goblin Warrior", source: "XMM" }).error, /regole 2024/);
  assert.match(fiveToolsMonsterToStatblock({ name: "Snowy Owlbear", source: "IDRotF", _copy: { name: "Owlbear", source: "MM" } }).error,
    /^Snowy Owlbear deriva da Owlbear \(MM\)/);
  assert.equal(isFiveTools2024(monster("Goblin")), false);
});

test("punti ferita speciali: non importati, segnalati", () => {
  const { block, report } = fiveToolsMonsterToStatblock(invented({ hp: { special: "equal to the summoner's level" } }));
  assert.equal(block.hitPoints, undefined);
  assert.ok(report.includes("punti ferita speciali: equal to the summoner's level"));
});

// Lotto 2: i mostri derivati (`_copy`), risolti dai mostri caricati insieme (pool).
import { resolveFiveToolsMonster } from "../src/fiveToolsMonsterCore.js";

const ghoulCopy = (mod, extra = {}) => ({ name: "Ghoul delle nevi", source: "HB", _copy: { name: "Ghoul", source: "MM", ...(mod ? { _mod: mod } : {}) }, ...extra });

test("un derivato prende lo statblock della base, i suoi campi sostituiscono quelli della base", () => {
  const { block, report, error } = fiveToolsMonsterToStatblock(ghoulCopy(null, { ac: [14], hp: { average: 30, formula: "6d8 + 3" } }), { pool: srd.monster });
  assert.equal(error, "");
  assert.equal(block.name, "Ghoul delle nevi");
  assert.equal(block.armorClass, 14);
  assert.deepEqual(block.hitPoints, { average: 30, formula: "6d8 + 3" });
  assert.deepEqual(block.actions.map((action) => action.name), ["Bite", "Claws"]);
  assert.equal(report[0], "derivato da Ghoul (MM)");
});

test("le modifiche: testo sostituito (mai i nomi), azioni sostituite, tolte, aggiunte in testa e in coda", () => {
  const { monster, report } = resolveFiveToolsMonster(ghoulCopy({
    "*": { mode: "replaceTxt", replace: "the target", with: "la preda", flags: "i" },
    action: [
      { mode: "replaceArr", replace: "Bite", items: { name: "Morso gelido", entries: ["{@atk mw} {@hit 3} to hit, reach 5 ft., one target. {@h}9 ({@damage 2d6 + 2}) cold damage."] } },
      { mode: "appendArr", items: { name: "Urlo", entries: ["Il ghoul urla."] } },
      { mode: "removeArr", names: "Claws" },
    ],
    trait: { mode: "prependArr", items: { name: "Pelle di ghiaccio", entries: ["Resiste al freddo."] } },
  }), srd.monster);
  assert.deepEqual(monster.action.map((action) => action.name), ["Morso gelido", "Urlo"]);
  assert.deepEqual(monster.trait.map((trait) => trait.name), ["Pelle di ghiaccio"]);
  assert.deepEqual(report, ["derivato da Ghoul (MM)"]);
  const { monster: replaced } = resolveFiveToolsMonster(ghoulCopy({ "*": { mode: "replaceTxt", replace: "the target", with: "la preda", flags: "i" } }), srd.monster);
  assert.match(replaced.action[1].entries[0], /If la preda is a creature other than an elf/);
  assert.equal(replaced.action[1].name, "Claws");
});

test("una modifica sconosciuta, un modello e una voce da sostituire assente finiscono nel rapporto", () => {
  const { report } = fiveToolsMonsterToStatblock(ghoulCopy({ _: { mode: "addSkills", skills: { stealth: 1 } }, action: { mode: "replaceArr", replace: "Tail", items: [] } },
    { _copy: { name: "Ghoul", source: "MM", _templates: [{ name: "Mountain Dwarf", source: "PHB" }], _mod: { _: { mode: "addSkills", skills: {} }, action: { mode: "replaceArr", replace: "Tail", items: [] } } } }),
  { pool: srd.monster });
  assert.ok(report.includes("modifica di 5eTools ignorata: addSkills"), report.join(" | "));
  assert.ok(report.includes("action: «Tail» da sostituire non trovata"), report.join(" | "));
  assert.ok(report.includes("modelli di 5eTools ignorati: Mountain Dwarf"), report.join(" | "));
});

test("una catena di derivati si risolve; la base mancante dice quale bestiario caricare; un ciclo si rifiuta", () => {
  const middle = { name: "Ghoul delle nevi", source: "HB", _copy: { name: "Ghoul", source: "MM" }, ac: [14] };
  const top = { name: "Re dei ghoul", source: "HB2", _copy: { name: "Ghoul delle nevi", source: "HB" }, hp: { average: 60, formula: "10d8 + 15" } };
  const { block, report } = fiveToolsMonsterToStatblock(top, { pool: [...srd.monster, middle] });
  assert.deepEqual([block.armorClass, block.hitPoints.average, block.actions.length], [14, 60, 2]);
  assert.equal(report[0], "derivato da Ghoul delle nevi (HB)");
  assert.equal(fiveToolsMonsterToStatblock(top, { pool: srd.monster }).error, "Re dei ghoul deriva da Ghoul delle nevi (HB): carica anche il bestiario HB.");
  const loopA = { name: "A", source: "X", _copy: { name: "B", source: "X" } };
  const loopB = { name: "B", source: "X", _copy: { name: "A", source: "X" } };
  assert.match(fiveToolsMonsterToStatblock(loopA, { pool: [loopA, loopB] }).error, /catena di mostri derivati non risolvibile/);
});

test("la base cercata per nome e libro senza maiuscole; un derivato da un mostro 2024 è rifiutato", () => {
  assert.equal(fiveToolsMonsterToStatblock({ name: "G", source: "HB", _copy: { name: "ghoul", source: "mm" } }, { pool: srd.monster }).error, "");
  const modern = { name: "Goblin Warrior", source: "XMM", ac: [15] };
  assert.match(fiveToolsMonsterToStatblock({ name: "G2", source: "HB", _copy: { name: "Goblin Warrior", source: "XMM" } }, { pool: [modern] }).error, /regole 2024/);
});

// Lotto 3: i mostri di tutto ciò che il GM ha caricato, la ricerca, la riga di riepilogo, il riferimento sulla scheda.
import { fiveToolsCollection, fiveToolsImportSummary, fiveToolsMonsterLabel, fiveToolsSearch } from "../src/fiveToolsMonsterCore.js";

test("la raccolta: un mostro per nome e libro (vince l'ultimo caricato), in ordine, i 2024 contati ed esclusi", () => {
  const updated = { ...monster("Goblin"), ac: [16] };
  const modern = { name: "Goblin Warrior", source: "XMM", ac: [15] };
  const derived = ghoulCopy(null);
  const collection = fiveToolsCollection([srd, [updated, modern], derived]);
  assert.equal(collection.monsters.length, 8);
  assert.equal(collection.monsters.find((entry) => entry.name === "Goblin").ac[0], 16);
  assert.deepEqual(collection.monsters.slice(0, 3).map(fiveToolsMonsterLabel), ["Adult Silver Dragon (MM)", "Bugbear (MM)", "Druid (MM)"]);
  assert.equal(fiveToolsMonsterLabel(derived), "Ghoul delle nevi (HB) · derivato");
  assert.equal(collection.excluded2024, 1);
  assert.equal(collection.pool.length, 9, "the 2024 one stays in the pool, for nothing but a clear refusal");
  assert.deepEqual(collection.sources, ["HB", "MM"]);
});

test("la ricerca: ogni parola nel nome o nel libro, senza maiuscole né accenti, con un limite", () => {
  const { monsters } = fiveToolsCollection([srd, ghoulCopy(null)]);
  assert.deepEqual(fiveToolsSearch(monsters, "ghoul").map((entry) => entry.name), ["Ghoul", "Ghoul delle nevi"]);
  assert.deepEqual(fiveToolsSearch(monsters, "ghoul hb").map((entry) => entry.name), ["Ghoul delle nevi"]);
  assert.deepEqual(fiveToolsSearch(monsters, "DRÁGON").map((entry) => entry.name), ["Adult Silver Dragon"]);
  assert.equal(fiveToolsSearch(monsters, "").length, 8);
  assert.equal(fiveToolsSearch(monsters, "", 3).length, 3);
});

test("la riga di riepilogo e il riferimento del mostro sulla scheda", () => {
  const converted = fiveToolsMonsterToStatblock(monster("Ghoul"));
  assert.equal(fiveToolsImportSummary(converted, monster("Ghoul")), "Da 5eTools (MM): Ghoul, 2 azioni registrabili.");
  assert.equal(converted.block.ref, "Ghoul|MM");
  const parsed = parseCharacterSheetImport(JSON.stringify(converted.block));
  // Fase 5, lotto 2: the conditions it is immune to, as the plugin names them, for the console's «Immune».
  assert.deepEqual(parsed.monster, { source: "5etools", ref: "Ghoul|MM", conditionImmunities: ["affascinato", "indebolimento", "avvelenato"] });
  assert.equal(fiveToolsImportSummary(fiveToolsMonsterToStatblock(monster("Giant Spider")), monster("Giant Spider")),
    "Da 5eTools (MM): Giant Spider, 1 azione registrabile, 1 da gestire al tavolo.");
});

// Testi fuori forma (27/10): il versatile abbreviato di Zariel, «to hit.» con il punto, la parentesi chiusa dopo il tipo.
// Testi inventati sulla loro forma; le scelte di tipo restano al tavolo.
test("testi fuori forma: versatile abbreviato con il «plus» sommato, «to hit.», la parentesi spostata", () => {
  const [hammer] = fiveToolsActions({ name: "Warhammer", entries: ["{@atk mw} {@hit 16} to hit, reach 10 ft., one target. {@h}17 ({@damage 2d8 + 8}) bludgeoning, or 19 ({@damage 2d10 + 8}) bludgeoning damage if used with two hands, plus 36 ({@damage 8d8}) fire damage. In addition, the weapon emits a burst of cold."] });
  assert.deepEqual([hammer.status, hammer.damage], ["full", [{ type: "bludgeoning", formula: "2d8+8" }, { type: "fire", formula: "8d8" }]]);
  assert.equal(hammer.note, "or 19 (2d10 + 8) bludgeoning damage if used with two hands. In addition, the weapon emits a burst of cold.");
  // The two-handed damage before the "plus": the "plus" adds to both.
  const [sword] = fiveToolsActions({ name: "Longsword", entries: ["{@atk mw} {@hit 11} to hit, reach 5 ft., one target. {@h}9 ({@damage 1d8 + 5}) slashing damage, or 10 ({@damage 1d10 + 5}) slashing damage if used with two hands, plus 18 ({@damage 4d8}) necrotic damage."] });
  assert.deepEqual([sword.damage, sword.note], [[{ type: "slashing", formula: "1d8+5" }, { type: "necrotic", formula: "4d8" }], "or 10 (1d10 + 5) slashing damage if used with two hands."]);
  const [claw] = fiveToolsActions({ name: "Claw", entries: ["{@atk mw} {@hit 6} to hit. reach 10 ft., one target. {@h}7 ({@damage 1d6 + 4}) slashing damage."] });
  assert.deepEqual([claw.status, claw.attack], ["full", { bonus: 6, type: "melee", reach: 10 }]);
  const [deathly] = fiveToolsActions({ name: "Deathly Claw", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}13 ({@damage 3d6 + 3} necrotic damage)."] });
  assert.deepEqual([deathly.status, deathly.damage, deathly.note], ["full", [{ type: "necrotic", formula: "3d6+3" }], undefined]);
  const [choice] = fiveToolsActions({ name: "Sledgehammer", entries: ["{@atk mw} {@hit 9} to hit, reach 5 ft., one target. {@h}27 ({@damage 6d6 + 6}) bludgeoning or force damage (tomb tapper's choice)."] });
  assert.equal(choice.status, "manual", "a choice of type stays at the table");
});

// Statblock da testo, lotto ST3: the sentences of a save as some books and homebrew write them, the areas, a hit that
// opens with "The target takes", the feet spelled out. Invented actions; the 5eTools import reads them the same way.
test("le frasi del tiro salvezza, le aree e il colpo che comincia con «The target takes» (lotto ST3)", () => {
  const save = (...entries) => fiveToolsActions({ name: "Prova", entries })[0];
  // The failure's damage in a sentence of its own; who fails is also knocked prone; a failure by 5 or more stays a note.
  const blast = save("Each creature in a 10-foot-radius sphere centered on that point must make a {@dc 13} Dexterity saving throw. A target takes 7 ({@damage 2d6}) fire damage on a failed save, or half as much damage on a successful one. A target that fails the save is also knocked {@condition prone}. A creature that fails the save by 5 or more is {@condition stunned} until the end of its next turn.");
  assert.deepEqual([blast.status, blast.save, blast.damage, blast.onFail], ["full", { ability: "dex", dc: 13, half: true }, [{ type: "fire", formula: "2d6" }], { condition: "prone" }]);
  assert.match(blast.note, /by 5 or more is stunned/);
  assert.doesNotMatch(blast.note, /on a failed save/, "the damage's sentence is registered, not noted");
  // A second save, with its own DC, is not this one's (as in the Ice Devil's wall).
  const wall = save("Each creature in the wall's area makes a {@dc 15} Dexterity saving throw, taking 28 ({@damage 8d6}) cold damage on a failed save, or half as much damage on a successful one.",
    "Whenever a creature ends its turn inside the freezing mist, it must make a {@dc 15} Constitution saving throw, taking 14 ({@damage 4d6}) cold damage on a failed save, or half as much damage on a successful one.");
  assert.deepEqual(wall.damage, [{ type: "cold", formula: "8d6" }]);
  // A DC inside a failure's own sentence does not end it.
  const curse = save("The witch curses one creature she can see within 30 feet, which must make a {@dc 15} Charisma saving throw. On a failure, the target takes 12 ({@damage 2d8 + 3}) necrotic damage and its hands wither (while withered, it must succeed on a {@dc 15} Constitution saving throw to hold a weapon).");
  assert.deepEqual(curse.damage, [{ type: "necrotic", formula: "2d8+3" }]);
  // Damage before the DC in its sentence comes anyway: not the failure's, and its sentence stays in the note.
  const strike = save("The sentinel makes one halberd attack. On a hit, the target takes an extra 9 ({@damage 2d8}) lightning damage, and the target must succeed on a {@dc 13} Strength saving throw or be knocked {@condition prone}.");
  assert.deepEqual([strike.status, strike.damage, strike.onFail], ["full", [], { condition: "prone" }]);
  assert.match(strike.note, /extra 9 \(2d8\) lightning damage/);
  // Areas: never the "all" of "magically"; "up to two creatures … within 40 feet of it" are chosen around the monster.
  const glare = save("The hag magically compels one creature she can see within 40 feet of her to make a {@dc 13} Wisdom saving throw. The creature takes 22 ({@damage 5d8}) psychic damage on a failed save, or half as much damage on a successful one.");
  assert.deepEqual([glare.area, glare.damage], [undefined, [{ type: "psychic", formula: "5d8" }]]);
  const wail = save("The specter picks up to two creatures it can see within 40 feet of it. Each target must succeed on a {@dc 12} Wisdom saving throw or take 9 ({@damage 2d8}) psychic damage.");
  assert.deepEqual(wail.area, { shape: "sphere", size: 40, origin: "self" });
  // Half damage on a success as homebrew writes it; never the half of a healing.
  const sweep = save("Each creature in a 15-foot cone must make a {@dc 15} Dexterity saving throw, taking 10 ({@damage 3d6}) slashing damage on a failure or half as much on a success.");
  assert.equal(sweep.save.half, true);
  const lash = save("The hag lashes one creature within 10 feet, which must make a {@dc 14} Strength saving throw or take 9 ({@damage 2d8}) necrotic damage and be knocked {@condition prone}. A creature that succeeds on the saving throw takes half damage and isn't knocked prone.");
  assert.deepEqual([lash.save.half, lash.onFail], [true, { condition: "prone" }]);
  const sip = save("One creature within 5 feet must succeed on a {@dc 13} Constitution saving throw or take 7 ({@damage 2d6}) necrotic damage. The hag regains hit points equal to half the damage taken.");
  assert.equal(sip.save.half, false);
  // "… damage on a failure" in the middle of its sentence; never the repeated save's own failure.
  const squeeze = save("The ogre forces a creature it's grappling to make a {@dc 13} Constitution saving throw. The creature takes 7 ({@damage 2d6}) bludgeoning damage on a failure, and half as much damage on a success.");
  assert.deepEqual([squeeze.status, squeeze.save.half, squeeze.damage], ["full", true, [{ type: "bludgeoning", formula: "2d6" }]]);
  const dread = save("One creature the ghost can see must make a {@dc 14} Wisdom saving throw, taking 9 ({@damage 2d8}) psychic damage on a failed save. The target can repeat the saving throw at the end of each of its turns, ending the dread on a success, or taking 9 ({@damage 2d8}) psychic damage on a failure.");
  assert.deepEqual(dread.damage, [{ type: "psychic", formula: "2d8" }]);
  assert.match(dread.note, /repeat the saving throw/);
  // "falling prone"; an area on a point ("to a point … within 5 feet of that point", "within 10 ft. of that point"); the
  // radius without its hyphen, around the monster; a beam.
  const swipe = save("The hag swipes her tail in a 10-foot cone. Each creature in that area must make a {@dc 15} Dexterity saving throw, taking 9 ({@damage 2d8}) bludgeoning damage and falling {@condition prone} on a failure.");
  assert.deepEqual([swipe.onFail, swipe.area], [{ condition: "prone" }, { shape: "cone", size: 10, origin: "self" }]);
  const flare = save("The hag sends a wisp to a point within 30 feet. Each creature within 5 feet of that point must succeed on a {@dc 14} Constitution saving throw or take 7 ({@damage 2d6}) radiant damage.");
  assert.deepEqual(flare.area, { shape: "sphere", size: 5, origin: "point" });
  const volley = save("Fiery orbs rain down on a point within 60 ft. that the hag can see. Each creature within 10 ft. of that point must make a {@dc 13} Dexterity saving throw or take 7 ({@damage 2d6}) fire damage.");
  assert.deepEqual(volley.area, { shape: "sphere", size: 10, origin: "point" });
  const pyre = save("The hag hurls a ball of black flame that explodes at a point she can see. Each creature in a 10-foot radius sphere centered on that point must make a {@dc 15} Dexterity saving throw, taking 10 ({@damage 3d6}) fire damage on a failed save, or half as much damage on a successful one.");
  assert.deepEqual(pyre.area, { shape: "sphere", size: 10, origin: "point" });
  const stomp = save("The hag stomps. Each creature within a 5-foot radius of the hag must make a {@dc 15} Dexterity saving throw, taking 11 ({@damage 2d10}) bludgeoning damage on a failure.");
  assert.deepEqual(stomp.area, { shape: "sphere", size: 5 });
  const beam = save("A 5-foot-wide, 60-foot-long beam of shadow bursts from the hag. Each creature in that area must make a {@dc 15} Dexterity saving throw, taking 14 ({@damage 4d6}) necrotic damage on a failed save, or half as much damage on a success.");
  assert.deepEqual(beam.area, { shape: "line", size: 60, width: 5, origin: "self" });
  // A sentence that opens with a parenthesis is a sentence: whole in the note.
  const daze = save("Each creature within 5 feet of the hag must succeed on a {@dc 13} Constitution saving throw or take 4 ({@damage 1d8}) thunder damage and be dazed until the start of the hag's next turn. (A dazed creature can move or act on its turn, not both. It can't take reactions.)");
  assert.equal(daze.note, "(A dazed creature can move or act on its turn, not both. It can't take reactions.)");
  // The hit that opens with "The target takes"; the feet spelled out.
  const [drain] = fiveToolsActions({ name: "Drain Marrow", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one restrained creature. {@h}The target takes 22 ({@damage 4d10}) necrotic damage."] });
  assert.deepEqual([drain.status, drain.damage], ["full", [{ type: "necrotic", formula: "4d10" }]]);
  const [mote] = fiveToolsActions({ name: "Mote of Frost", entries: ["{@atk rs} {@hit 8} to hit, range 90 feet, one target. {@h}13 ({@damage 3d8}) cold damage."] });
  assert.deepEqual([mote.status, mote.attack], ["full", { bonus: 8, type: "ranged", range: { normal: 90 } }]);
});

// Decisione D11 di STUDIO_IMPORT_STATBLOCK_TESTO.md: un'azione che lancia soltanto un incantesimo diventa un incantesimo
// innato della scheda, con gli usi del nome, il livello e la CD del testo quando la scheda non ne ha una.
test("un'azione che lancia un incantesimo diventa un incantesimo innato (D11)", () => {
  const monster = invented({
    action: [
      { name: "Hold Person (2/Day)", entries: ["The witch casts hold person ({@dc 15}) at 3rd level."] },
      { name: "Darkness", entries: ["The witch magically casts darkness without any components."] },
      { name: "Choice", entries: ["The witch casts longstrider, darkvision, or cordon of arrows."] },
      { name: "Thorns", entries: ["The witch casts thorn whip (+8 to hit), dealing 10 ({@damage 3d6}) piercing damage on a hit."] },
      { name: "Web", entries: ["If the witch is concentrating on grease, she casts web without using concentration."] },
    ],
    bonus: [{ name: "Blight", entries: ["The witch casts blight. A target takes an additional 5 ({@damage 2d4}) necrotic damage if it fails the saving throw, or half damage on a success."] }],
  });
  const { block, report } = fiveToolsMonsterToStatblock(monster);
  assert.deepEqual(block.innateSpells, [{ name: "hold person", perDay: 2, level: 3 }, { name: "darkness" }, { name: "blight" }]);
  assert.equal(block.spellSaveDC, 15, "the DC of the text, the card having none");
  assert.ok(report.includes("Hold Person: incantesimo innato hold person (2/giorno)"), report.join(" | "));
  assert.ok(report.some((line) => /^Blight \(bonus action\): incantesimo innato blight; il danno in più \(2d4 necrotici\) resta da aggiungere al tavolo/.test(line)), report.join(" | "));
  // A choice, numbers of its own, a cast on a condition: the table's.
  for (const name of ["Choice", "Thorns", "Web"]) assert.ok(report.includes(`da gestire al tavolo: ${name}`), name);
  // The sheet finds the spells in the plugin's books: quick actions with their uses and level.
  const sheet = parseCharacterSheetImport(JSON.stringify(block));
  assert.deepEqual(sheet.sections.innate.map((action) => [action.spellId, action.cost, action.uses ?? null, action.slotLevel ?? null]),
    [["hold-person", "uses", 2, 3], ["darkness", "free", null, null], ["blight", "free", null, null]]);
});

test("senza CD sulla scheda né nel testo il rapporto chiede di scriverla (D11)", () => {
  const { block, report } = fiveToolsMonsterToStatblock(invented({ action: [{ name: "Blur", entries: ["The witch casts blur."] }] }));
  assert.deepEqual([block.innateSpells, block.spellSaveDC], [[{ name: "blur" }], undefined]);
  assert.ok(report.includes("incantesimi delle azioni (blur): la scheda non dice CD né bonus, da scrivere in Statistiche"), report.join(" | "));
});

// Una lista senza tiri propri sotto la frase con la CD (lo Sguardo di Demogorgon) resta una sola azione.
test("una lista di effetti sotto la CD dell'azione resta una sola azione (D12)", () => {
  const [gaze] = fiveToolsActions({ name: "Gaze", entries: ["The witch gazes at one creature within 60 feet, which must make a {@dc 16} Wisdom saving throw. If the target fails the save, it suffers one of the following effects:",
    { type: "list", items: [{ type: "item", name: "1. Sleep", entry: "The target is {@condition unconscious} for 1 minute." }, { type: "item", name: "2. Dread", entry: "The target is {@condition frightened} for 1 minute." }] }] });
  assert.equal(gaze.name, "Gaze");
  assert.deepEqual(gaze.save, { ability: "wis", dc: 16, half: false });
});
