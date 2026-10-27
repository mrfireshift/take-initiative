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

test("ghoul: il TS degli artigli al colpo resta nella nota (fase 1b); immunità alle condizioni in italiano", () => {
  const { block, report, counts } = fiveToolsMonsterToStatblock(monster("Ghoul"));
  assert.deepEqual(counts, { full: 1, partial: 1, manual: 0 });
  const claws = block.actions.find((action) => action.name === "Claws");
  assert.match(claws.note, /^If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed/);
  assert.ok(report.includes("Claws: il tiro salvezza o la condizione al colpo resta nella nota"));
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

test("difese condizionali segnalate e non importate; azioni bonus con il loro nome", () => {
  const { block, report } = fiveToolsMonsterToStatblock(invented({
    resist: ["fire", { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true }],
    bonus: [{ name: "Morso rapido", entries: ["{@atk mw} {@hit 3} to hit, reach 5 ft., one target. {@h}4 ({@damage 1d4 + 2}) piercing damage."] }],
  }));
  assert.deepEqual(block.damageDefenses.resistances, ["fire"]);
  assert.ok(report.includes("resistenza condizionale non importata: bludgeoning, piercing, slashing (from nonmagical attacks)"));
  assert.deepEqual(block.actions.map((action) => action.name), ["Morso rapido (bonus action)"]);
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
  assert.equal(fiveToolsImportSummary(converted, monster("Ghoul")), "Da 5eTools (MM): Ghoul, 1 azione registrabile, 1 con il tiro salvezza al colpo nella nota.");
  assert.equal(converted.block.ref, "Ghoul|MM");
  const parsed = parseCharacterSheetImport(JSON.stringify(converted.block));
  // Fase 5, lotto 2: the conditions it is immune to, as the plugin names them, for the console's «Immune».
  assert.deepEqual(parsed.monster, { source: "5etools", ref: "Ghoul|MM", conditionImmunities: ["affascinato", "indebolimento", "avvelenato"] });
  assert.equal(fiveToolsImportSummary(fiveToolsMonsterToStatblock(monster("Giant Spider")), monster("Giant Spider")),
    "Da 5eTools (MM): Giant Spider, 0 azioni registrabili, 1 con il tiro salvezza al colpo nella nota, 1 da gestire al tavolo.");
});
