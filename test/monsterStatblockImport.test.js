// Attacchi dei mostri, lotto 4: lo statblock di un mostro nell'import della scheda. Le azioni diventano attacchi con i
// campi del mostro, il multiattacco una sezione, i PF un valore per il tracker (lotto 5); i nomi in italiano o inglese.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { SHEET_IMPORT_SECTIONS, parseCharacterSheetImport, sheetImportSectionSummary } = await import("../src/characterSheetImportCore.js");
const { MONSTER_IMPORT_CONDITIONS, monsterImportFeet } = await import("../src/monsterStatblockImportCore.js");
const { CONDITION_LIST } = await import("../src/conditions.js");
const { canOpenInitiativeCardSheet } = await import("../src/initiativeCardSheetAccessCore.js");

const read = (data) => parseCharacterSheetImport(JSON.stringify(data));
const dragon = {
  kind: "monster",
  name: "Drago rosso adulto",
  armorClass: 19,
  hitPoints: { average: 256, formula: "19d12 + 133" },
  speed: "40 ft",
  abilities: { str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21 },
  savingThrows: { dex: 6, con: 13, wis: 7, cha: 11 },
  damageDefenses: { immunities: ["fire"] },
  actions: [
    { name: "Multiattack", note: "Usa Presenza terrificante, poi un morso e due artigli." },
    { name: "Morso", attack: { bonus: "+14", type: "melee", reach: "10 ft" },
      damage: [{ type: "piercing", formula: "2d10 + 8" }, { type: "fuoco", formula: "2d6" }] },
    { name: "Soffio di fuoco", recharge: "5–6", save: { ability: "Destrezza", dc: 21, half: true }, area: { shape: "cone", size: 60 },
      damage: [{ type: "fire", formula: "18d6" }] },
    { name: "Presenza terrificante", save: { ability: "wis", dc: 19 }, area: { shape: "raggio", size: "36 m" }, onFail: { condition: "frightened" },
      note: "Ripete il TS a fine turno." },
  ],
};

test("lo statblock di un mostro: statistiche, caratteristiche, TS, difese, attacchi e multiattacco", () => {
  const result = read(dragon);
  assert.equal(result.error, "");
  assert.equal(result.name, "Drago rosso adulto");
  assert.deepEqual(result.monster, { source: "manual" });
  assert.deepEqual(result.hitPoints, { average: 256, formula: "19d12+133" });
  assert.deepEqual(result.sections.stats, { armorClass: 19, speed: 12 });
  assert.equal(result.sections.abilities.str, 8);
  assert.equal(result.sections.saves.con, 13);
  assert.deepEqual(result.sections.defenses.immunities, ["fire"]);
  assert.equal(result.sections.multiattack, "Usa Presenza terrificante, poi un morso e due artigli.");
  assert.deepEqual(result.unresolved, []);
  const [bite, breath, presence] = result.sections.attacks;
  assert.deepEqual(bite, { version: 2, label: "Morso", kind: "attack", targetMode: "selection", range: "melee",
    components: [{ id: "c1", type: "piercing", formula: "2d10+8" }, { id: "c2", type: "fire", formula: "2d6" }], attackBonus: 14, reachFeet: 10 });
  assert.deepEqual(breath, { version: 2, label: "Soffio di fuoco", kind: "attack", targetMode: "selection", range: "melee",
    components: [{ id: "c1", type: "fire", formula: "18d6" }], save: "dex", saveDC: 21, saveHalf: true, area: { shape: "cone", sizeFeet: 60 }, recharge: 5 });
  assert.deepEqual(presence, { version: 2, label: "Presenza terrificante", kind: "attack", targetMode: "selection", range: "melee",
    components: [], save: "wis", saveDC: 19, area: { shape: "sphere", sizeFeet: 120 }, onFail: { condition: "Spaventato" }, note: "Ripete il TS a fine turno." });
});

test("il pannello elenca il multiattacco tra attacchi e note", () => {
  const ids = SHEET_IMPORT_SECTIONS.map((section) => section.id);
  assert.equal(ids.indexOf("multiattack"), ids.indexOf("attacks") + 1);
  assert.equal(sheetImportSectionSummary("multiattack", "Un morso e due artigli."), "Un morso e due artigli.");
  assert.equal(sheetImportSectionSummary("attacks", read(dragon).sections.attacks), "3 attacchi: Morso, Soffio di fuoco, Presenza terrificante");
});

test("attacchi a distanza, usi al giorno e gittata; il tipo si deduce dalla gittata", () => {
  const result = read({ kind: "monster", name: "Goblin", actions: [
    { name: "Arco corto", attack: { bonus: 4, range: { normal: 80, long: 320 } }, uses: "3/giorno", damage: [{ type: "perforanti", formula: "1d6+2" }] },
    { name: "Scimitarra", attack: { bonus: 4, range: "melee", reach: 5 }, damage: [{ type: "taglienti", formula: "1d6+2" }] },
  ] });
  assert.deepEqual(result.unresolved, []);
  const [bow, scimitar] = result.sections.attacks;
  assert.equal(bow.range, "ranged");
  assert.deepEqual(bow.rangeFeet, { normal: 80, long: 320 });
  assert.equal(bow.uses, 3);
  assert.equal(scimitar.range, "melee");
  assert.equal(scimitar.reachFeet, 5);
});

test("un TS senza area resta per una creatura; il bersaglio multiplo tiene il numero", () => {
  const result = read({ kind: "monster", actions: [
    { name: "Sguardo", save: { ability: "con", dc: 13 }, damage: [{ type: "necrotic", formula: "4d8" }] },
    { name: "Raggi", save: { ability: "dex", dc: 15, half: true }, area: { shape: "bersagli", targets: 3 }, damage: [{ type: "fire", formula: "2d6" }] },
  ] });
  assert.equal(result.sections.attacks[0].area, undefined);
  assert.deepEqual(result.sections.attacks[1].area, { shape: "target", maxTargets: 3 });
});

test("ciò che non si riconosce va in rosso, non si indovina", () => {
  const result = read({ kind: "monster", actions: [
    { name: "Artiglio", attack: { bonus: 4, reach: 5 }, damage: [{ type: "sacro", formula: "1d6" }, { type: "slashing", formula: "1d6" }] },
    { name: "Urlo", save: { ability: "fortuna", dc: 12 }, onFail: { condition: "Terrorizzato" }, damage: [{ type: "thunder", formula: "2d6" }] },
    { name: "Ricarica rotta", attack: { bonus: 4, reach: 5 }, recharge: 7, damage: [{ type: "acid", formula: "1d4" }] },
    { name: "Teletrasporto", note: "Si teletrasporta di 18 m." },
    { name: "Artigli del ghoul", attack: { bonus: 4, reach: 5 }, save: { ability: "con", dc: 10 }, damage: [{ type: "slashing", formula: "2d4+2" }],
      note: "TS Costituzione CD 10 o paralizzato per 1 minuto." },
  ] });
  assert.ok(result.unresolved.includes("«Artiglio»: tipo di danno \"sacro\""), result.unresolved.join(" | "));
  assert.ok(result.unresolved.includes("«Urlo»: caratteristica del tiro salvezza \"fortuna\""), result.unresolved.join(" | "));
  assert.ok(result.unresolved.includes("«Urlo»: condizione \"Terrorizzato\""), result.unresolved.join(" | "));
  assert.ok(result.unresolved.includes("«Ricarica rotta»: ricarica non valido"), result.unresolved.join(" | "));
  assert.ok(result.unresolved.includes("«Artigli del ghoul»: il tiro salvezza al colpo resta da gestire al tavolo"), result.unresolved.join(" | "));
  assert.ok(result.unresolved.includes("azioni senza danni né tiro salvezza, da gestire al tavolo: Teletrasporto"), result.unresolved.join(" | "));
  const names = result.sections.attacks.map((attack) => attack.label);
  assert.deepEqual(names, ["Artiglio", "Urlo", "Ricarica rotta", "Artigli del ghoul"]);
  assert.deepEqual(result.sections.attacks[0].components.map((component) => component.type), ["slashing"]);
  assert.equal(result.sections.attacks[1].save, undefined, "senza caratteristica il TS cade: resta il danno");
  const ghoul = result.sections.attacks[3];
  assert.equal(ghoul.save, undefined);
  assert.equal(ghoul.attackBonus, 4);
  assert.equal(ghoul.note, "TS Costituzione CD 10 o paralizzato per 1 minuto.");
});

test("oltre 8 attacchi il resto è segnalato", () => {
  const actions = Array.from({ length: 10 }, (_, index) => ({ name: `Colpo ${index + 1}`, attack: { bonus: 3, reach: 5 }, damage: [{ type: "bludgeoning" }] }));
  const result = read({ kind: "monster", actions });
  assert.equal(result.sections.attacks.length, 8);
  assert.ok(result.unresolved.includes("2 azioni oltre il limite di 8 attacchi"));
});

test("una scheda personaggio resta una scheda personaggio", () => {
  const result = read({ name: "Nyx", armorClass: 15, attacks: [{ label: "Pugnale", range: "melee", components: [{ type: "perforanti", formula: "1d4+2" }] }] });
  assert.equal(result.monster, undefined);
  assert.equal(result.hitPoints, undefined);
  assert.equal(result.sections.multiattack, undefined);
  assert.equal(result.sections.attacks[0].label, "Pugnale");
});

test("la fonte nota resta, i PF assurdi non si importano", () => {
  assert.deepEqual(read({ ...dragon, source: "5etools" }).monster, { source: "5etools" });
  assert.equal(read({ ...dragon, hitPoints: 0 }).hitPoints, null);
  assert.deepEqual(read({ ...dragon, hitPoints: "45" }).hitPoints, { average: 45 });
});

test("distanze in piedi o in metri", () => {
  assert.deepEqual([10, "10 ft", "15 piedi", "3 m", "4,5 m", "1,5 metri", "x", 0].map(monsterImportFeet), [10, 10, 15, 10, 15, 5, null, null]);
});

test("le condizioni dell'import sono quelle del tracker", () => {
  for (const name of MONSTER_IMPORT_CONDITIONS) assert.ok(CONDITION_LIST.includes(name), name);
});

test("la scheda: chiunque per PG e alleati, il GM per ogni creatura, mai Tana o Azione Epica", () => {
  assert.equal(canOpenInitiativeCardSheet({ id: "a", attitude: "pc" }), true);
  assert.equal(canOpenInitiativeCardSheet({ id: "a", attitude: "ally" }), true);
  assert.equal(canOpenInitiativeCardSheet({ id: "a", attitude: "enemy" }), false);
  assert.equal(canOpenInitiativeCardSheet({ id: "a", attitude: "enemy" }, { isGM: true }), true);
  assert.equal(canOpenInitiativeCardSheet({ id: "a", attitude: "neutral" }, { isGM: true }), true);
  assert.equal(canOpenInitiativeCardSheet({ id: "a" }, { isGM: true }), true);
  assert.equal(canOpenInitiativeCardSheet({ id: "__LAIR__", attitude: "enemy" }, { isGM: true }), false);
  assert.equal(canOpenInitiativeCardSheet({ id: "__EPIC__::boss::after::pc", attitude: "enemy" }, { isGM: true }), false);
  assert.equal(canOpenInitiativeCardSheet({ id: "a", attitude: "pc", __groupCollapsed: true }, { isGM: true }), false);
});
