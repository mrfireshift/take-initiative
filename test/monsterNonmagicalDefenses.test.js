// Le difese di un mostro che valgono solo contro armi non magiche: dallo statblock alla console, ignorabili per un'arma magica.
import assert from "node:assert/strict";
import test from "node:test";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { damageDefenseTag, markNonmagicalDefenses, nonmagicalDefenseText } from "../src/damageDefensesCore.js";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { MONSTER_PROFILE_STATBLOCK_FIELDS, sanitizeMonsterProfile } from "../src/monsterProfileCore.js";
import { monsterStatblockOf } from "../src/monsterStatblockShareCore.js";
import { pcAttackPreview } from "../src/pcAttackCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const BPS = ["bludgeoning", "piercing", "slashing"];
const convert = (fields) => fiveToolsMonsterToStatblock({ name: "Test", source: "MM", ac: [15], hp: { average: 10 }, speed: { walk: 30 },
  action: [{ name: "Claw", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }], ...fields });
const conditional = (field, note, types = BPS) => ({ [field]: [{ [field]: types, note, cond: true }] });

test("da 5eTools: ogni forma di «armi non magiche» entra, con i materiali che la superano", () => {
  const cases = [
    ["from nonmagical attacks", []],
    ["that is nonmagical", []],
    ["from nonmagical attacks that aren't silvered", ["silvered"]],
    ["from nonmagical attacks not made with silvered weapons", ["silvered"]],
    ["from nonmagical attacks that aren't adamantine", ["adamantine"]],
    ["from nonmagical attacks that aren't adamantine or silvered", ["silvered", "adamantine"]],
  ];
  for (const [note, except] of cases) {
    const { block } = convert(conditional("resist", note));
    assert.deepEqual(block.damageDefenses.resistances, BPS, note);
    assert.deepEqual(block.damageDefenses.nonmagical, BPS, note);
    assert.deepEqual(block.damageDefenses.nonmagicalExcept ?? [], except, note);
  }
  const golem = convert(conditional("immune", "from nonmagical attacks that aren't adamantine"));
  assert.deepEqual([golem.block.damageDefenses.immunities, golem.block.damageDefenses.resistances], [BPS, []]);
  assert.ok(golem.report.includes("immunità ai danni non magici né di adamantio: contundenti, perforanti, taglienti (per un'arma magica o di quel materiale, ignorala nella console)"));
  const xorn = convert(conditional("resist", "from nonmagical attacks that aren't adamantine", ["piercing", "slashing"]));
  assert.deepEqual(xorn.block.damageDefenses.nonmagical, ["piercing", "slashing"]);
});

test("da 5eTools: quello che dipende da altro resta al tavolo, come prima", () => {
  for (const [field, note, types] of [
    ["resist", "while in dim light or darkness", BPS],
    ["resist", "from nonmagical attacks while in dim light or darkness", BPS],
    ["resist", "(from stoneskin)", BPS],
    ["resist", "from magic weapons", BPS],
    ["vulnerable", "from magic weapons wielded by good creatures", ["piercing"]],
  ]) {
    const { block, report } = convert(conditional(field, note, types));
    assert.equal(block.damageDefenses, undefined, note);
    assert.ok(report.some((line) => line.includes("condizionale non importata") && line.includes(note)), note);
  }
  const plain = convert({ resist: ["cold"], immune: ["fire"] });
  assert.equal(plain.block.damageDefenses.nonmagical, undefined);
  assert.deepEqual(plain.block.damageDefenses.resistances, ["cold"]);
});

test("dal blocco alla scheda: le difese nelle liste di sempre, il segno sul profilo del mostro", () => {
  const parsed = parseCharacterSheetImport(JSON.stringify(convert({ resist: ["cold", ...conditional("resist", "from nonmagical attacks that aren't silvered").resist], immune: ["fire", "poison"] }).block));
  assert.deepEqual(parsed.sections.defenses, { immunities: ["fire", "poison"], resistances: ["bludgeoning", "cold", "piercing", "slashing"], vulnerabilities: [] });
  assert.deepEqual(parsed.monster.nonmagicalDefenses, { types: BPS, except: ["silvered"] });
  const clean = sanitizeMonsterProfile(parsed.monster);
  assert.deepEqual(clean.nonmagicalDefenses, { types: BPS, except: ["silvered"] });
  assert.ok(MONSTER_PROFILE_STATBLOCK_FIELDS.includes("nonmagicalDefenses"), "un nuovo statblock lo sostituisce");
  assert.deepEqual(monsterStatblockOf({ monster: clean }).monster.nonmagicalDefenses, clean.nonmagicalDefenses, "e va agli omonimi");
});

test("dal JSON: inglese o italiano, i materiali anche; sul profilo solo tipi fisici e materiali noti; un PG non ha il segno", () => {
  const read = (damageDefenses) => parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Test", actions: [], armorClass: 12, damageDefenses }));
  assert.deepEqual(read({ resistances: ["slashing"], nonmagical: ["slashing"], nonmagicalExcept: "silvered" }).monster.nonmagicalDefenses, { types: ["slashing"], except: ["silvered"] });
  assert.deepEqual(read({ immunities: ["taglienti"], nonMagici: ["taglienti"], nonMagiciTranne: ["adamantio"] }).monster.nonmagicalDefenses, { types: ["slashing"], except: ["adamantine"] });
  assert.equal(read({ resistances: ["cold"] }).monster.nonmagicalDefenses, undefined);
  assert.deepEqual(sanitizeMonsterProfile({ source: "manual", nonmagicalDefenses: { types: ["slashing", "fire"], except: ["silvered", "wood"] } }).nonmagicalDefenses, { types: ["slashing"], except: ["silvered"] });
  assert.equal(sanitizeMonsterProfile({ source: "manual", nonmagicalDefenses: { types: ["fire"] } }).nonmagicalDefenses, undefined);
  assert.equal(parseCharacterSheetImport(JSON.stringify({ name: "Mira", armorClass: 12, damageDefenses: { resistances: ["slashing"], nonmagical: ["slashing"] } })).monster, undefined);
});

test("le parole sulla difesa: quando vale, e solo per i tipi segnati", () => {
  assert.equal(nonmagicalDefenseText(), "non magici");
  assert.equal(nonmagicalDefenseText(["silvered"]), "non magici né d'argento");
  assert.equal(nonmagicalDefenseText(["silvered", "adamantine"]), "non magici né d'argento né di adamantio");
  assert.equal(damageDefenseTag({ type: "slashing", defense: "resistance" }), "Res. taglienti");
  assert.equal(damageDefenseTag({ type: "slashing", defense: "immunity", nonmagical: "non magici" }), "Imm. taglienti (non magici)");
  const rows = [{ type: "slashing", defense: "resistance" }, { type: "cold", defense: "resistance" }];
  assert.equal(markNonmagicalDefenses(rows, {}), rows, "senza segno le righe sono quelle");
  assert.deepEqual(markNonmagicalDefenses(rows, { monster: { nonmagicalDefenses: { types: ["slashing"], except: ["silvered"] } } }).map((row) => row.nonmagical),
    ["non magici né d'argento", undefined]);
});

test("nella console: vale da sola, il pulsante la ignora per un'arma magica, il resto non cambia", () => {
  const creature = (id, card, attitude = "enemy") => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 50, hpMax: 50, attitude, inInitiative: true, initiativeCard: card } } });
  const devil = creature("devil", { damageDefenses: { resistances: ["cold", ...BPS], immunities: ["fire"] }, monster: { source: "5etools", nonmagicalDefenses: { types: BPS, except: ["silvered"] } } });
  const golem = creature("golem", { damageDefenses: { immunities: BPS }, monster: { source: "5etools", nonmagicalDefenses: { types: BPS, except: ["adamantine"] } } });
  const hero = creature("hero", {}, "pc");
  const weapon = (type) => ({ version: 2, id: `w-${type}`, label: "Arma", kind: "attack", targetMode: "selection", range: "melee", components: [{ id: "c1", type, formula: "1d8" }] });
  const hit = (type, targetItem, ignoredDefenses = []) => pcAttackPreview({ action: weapon(type), sourceItem: hero, targetItem, outcome: "hit", amounts: { c1: 10 }, ignoredDefenses });
  const applied = hit("slashing", devil);
  assert.equal(applied.total, 5);
  assert.deepEqual(applied.defenses, [{ type: "slashing", defense: "resistance", ignored: false, nonmagical: "non magici né d'argento" }]);
  assert.equal(damageDefenseTag(applied.defenses[0]), "Res. taglienti (non magici né d'argento)");
  const magic = hit("slashing", devil, ["slashing"]);
  assert.equal(magic.total, 10, "arma magica: un clic, danno pieno");
  assert.equal(magic.defenses[0].ignored, true);
  assert.equal(hit("slashing", golem).total, 0);
  assert.equal(hit("slashing", golem, ["slashing"]).total, 10);
  const cold = hit("cold", devil);
  assert.equal(cold.total, 5);
  assert.equal(cold.defenses[0].nonmagical, undefined, "il freddo è una resistenza piena: nessuna scritta");
  assert.equal(hit("fire", devil).total, 0);
  assert.equal(hit("necrotic", devil).total, 10);
});
