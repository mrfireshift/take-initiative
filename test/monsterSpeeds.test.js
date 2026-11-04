// Velocità dei mostri, lotto 1: le velocità oltre la camminata, dallo statblock al profilo del mostro sulla scheda.
// Lotto 2: quelle stesse velocità nel motore, come effetto passivo.
import assert from "node:assert/strict";
import test from "node:test";
import { resolveMovementProfile } from "../src/movementProfileCore.js";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { MONSTER_PROFILE_STATBLOCK_FIELDS, monsterSpeedsMovementInstance, monsterSpeedsText, sanitizeMonsterProfile } from "../src/monsterProfileCore.js";
import { buildSpeedCheckSnapshot, speedSnapshotForPlayers, speedWarningDestination, startingMovementMode } from "../src/speedCheckCore.js";
import { compactSpeedReadout } from "../src/initiativeMovementPresentation.js";

const convert = (speed) => fiveToolsMonsterToStatblock({ name: "Test", source: "MM", ac: [15], hp: { average: 10 }, speed,
  action: [{ name: "Claw", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }] });
const importedMonster = (fields) => parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Test", actions: [], armorClass: 12, ...fields })).monster;

test("da 5eTools: le modalità in piedi, lo stazionario, la camminata resta speed", () => {
  const { block, report } = convert({ walk: 40, fly: 80, swim: 40, climb: 20, burrow: 10 });
  assert.equal(block.speed, "40 ft");
  assert.deepEqual(block.speeds, { fly: "80 ft", swim: "40 ft", climb: "20 ft", burrow: "10 ft" });
  assert.ok(!report.some((line) => line.startsWith("velocità")));
  assert.equal(convert({ walk: 30 }).block.speeds, undefined, "only walking: nothing more on the token");
  const hovering = convert({ walk: 0, fly: { number: 20, condition: "(hover)" }, canHover: true }).block;
  assert.deepEqual([hovering.speed, hovering.speeds], [undefined, { fly: "20 ft", hover: true }]);
  assert.deepEqual(convert({ walk: 30, fly: { number: 40, condition: "(hover)" } }).block.speeds, { fly: "40 ft", hover: true });
});

test("da 5eTools: una velocità solo in una forma o in un caso non è una modalità, va nel rapporto", () => {
  const form = convert({ walk: { number: 40, condition: "(wolf form only)" }, fly: { number: 60, condition: "(owl form only)" }, climb: 30 });
  assert.equal(form.block.speed, "40 ft", "as before: the card's speed");
  assert.deepEqual(form.block.speeds, { climb: "30 ft" });
  assert.ok(form.report.includes("velocità da gestire al tavolo: camminare 40 ft (wolf form only)"));
  assert.ok(form.report.includes("velocità da gestire al tavolo: volare 60 ft (owl form only)"));
  const magic = convert({ walk: 30, fly: { number: 50, condition: "(hover, Graystaff magic)" } });
  assert.equal(magic.block.speeds, undefined);
  assert.ok(magic.report.includes("velocità da gestire al tavolo: volare 50 ft (hover, Graystaff magic)"));
  const alternate = convert({ walk: 30, alternate: { walk: [{ number: 40, condition: "(bear form only)" }] } });
  assert.ok(alternate.report.includes("velocità da gestire al tavolo: camminare 40 ft (bear form only)"));
  const choice = convert({ walk: 5, choose: { from: ["climb", "fly"], amount: 20, note: "(DM's choice)" } });
  assert.equal(choice.block.speeds, undefined);
  assert.ok(choice.report.includes("velocità da gestire al tavolo: scalare o volare 20 ft (DM's choice)"));
});

test("dal JSON: speeds in piedi o metri, in italiano, oppure speed a oggetto; arriva in metri nel profilo", () => {
  assert.deepEqual(importedMonster({ speed: "40 ft", speeds: { fly: "80 ft", swim: 12, hover: true } }).speeds, { fly: 24, swim: 12 });
  assert.equal(importedMonster({ speed: "40 ft", speeds: { fly: "80 ft", hover: true } }).hover, true);
  assert.deepEqual(importedMonster({ speeds: { volo: "24 m", scavo: "10 piedi" } }).speeds, { fly: 24, burrow: 3 });
  const object = parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Test", actions: [], speed: { walk: "40 ft", climb: "20 ft" } }));
  assert.equal(object.sections.stats.speed, 12);
  assert.deepEqual(object.monster.speeds, { climb: 6 });
  assert.equal(importedMonster({ speed: "30 ft" }).speeds, undefined);
});

test("sul profilo: solo modalità note e positive, lo stazionario solo con il volo; un nuovo blocco le sostituisce", () => {
  assert.deepEqual(sanitizeMonsterProfile({ source: "5etools", speeds: { fly: 24, swim: 0, teleport: 9, climb: "6" }, hover: true }),
    { source: "5etools", speeds: { fly: 24, climb: 6 }, hover: true });
  assert.deepEqual(sanitizeMonsterProfile({ source: "manual", speeds: { swim: 12 }, hover: true }), { source: "manual", speeds: { swim: 12 } });
  assert.deepEqual(sanitizeMonsterProfile({ source: "manual", speeds: {} }), { source: "manual" });
  for (const field of ["speeds", "hover"]) assert.ok(MONSTER_PROFILE_STATBLOCK_FIELDS.includes(field));
});

test("in parole: le modalità nell'ordine, in metri con la virgola, lo stazionario", () => {
  assert.equal(monsterSpeedsText({ speeds: { swim: 7.5, fly: 24 }, hover: true }), "Volare 24 m (stazionario) · Nuotare 7,5 m");
  assert.equal(monsterSpeedsText({ source: "manual" }), "");
  assert.equal(monsterSpeedsText(null), "");
});

const modesOf = (profile) => profile.movementModes.map(({ id, speedMeters }) => [id, speedMeters]);
const statblock = (speed, speeds) => monsterSpeedsMovementInstance({ speed, monster: { source: "5etools", speeds } });

test("nel motore: le modalità dello statblock si aggiungono alla camminata, nell'ordine, senza una riga di motivi", () => {
  const profile = resolveMovementProfile(12, [statblock(12, { burrow: 6, fly: 24, swim: 12, climb: 3 })]);
  assert.deepEqual(modesOf(profile), [["walk", 12], ["fly", 24], ["swim", 12], ["climb", 3], ["burrow", 6]]);
  assert.equal(profile.movementModes.at(-1).label, "Scavare");
  assert.equal(profile.activeMode, "walk");
  assert.equal(profile.summary, "");
  assert.equal(resolveMovementProfile(12, [statblock(12, { fly: 24 })], [], "fly").summary, "");
});

test("nel motore: condizioni e incantesimi valgono per ogni modalità, come per quelle date da un incantesimo", () => {
  const flyer = statblock(12, { fly: 24 });
  const grappled = resolveMovementProfile(12, [flyer, { condition: "Afferrato", active: true }], [], "fly");
  assert.deepEqual(modesOf(grappled), [["walk", 0], ["fly", 0]]);
  assert.equal(grappled.blocked, true);
  assert.deepEqual(modesOf(resolveMovementProfile(12, [flyer, { condition: "Indebolimento", level: 2, active: true }])), [["walk", 6], ["fly", 12]]);
  assert.deepEqual(modesOf(resolveMovementProfile(12, [flyer], ["Velocità"])), [["walk", 24], ["fly", 48]]);
  assert.equal(resolveMovementProfile(12, [flyer, { condition: "Prono", active: true }], [], "fly").movementCostMultiplier, 2);
  const flySpell = { condition: "Volare", active: true, mechanics: { movement: { modes: { fly: { grantMeters: 18 } } } } };
  assert.deepEqual(modesOf(resolveMovementProfile(12, [flyer, flySpell])), [["walk", 12], ["fly", 24]], "il più alto fra i due");
});

test("nel motore: chi non cammina non ha la camminata e parte dalla prima modalità che ha", () => {
  for (const speed of [null, undefined, 0]) {
    const profile = resolveMovementProfile(speed, [statblock(speed, { swim: 6, fly: 12 })]);
    assert.deepEqual(modesOf(profile), [["fly", 12], ["swim", 6]], String(speed));
    assert.deepEqual([profile.activeMode, profile.speedMeters, profile.hasMovementModes], ["fly", 12, true]);
  }
  assert.equal(resolveMovementProfile(12, [statblock(12, { fly: 24 })], [], "swim").activeMode, "walk", "una modalità che non ha: cammina");
});

test("nel motore: senza altre velocità nessun effetto, e la scheda resta quella di prima", () => {
  for (const card of [null, {}, { speed: 9 }, { speed: 9, monster: { source: "manual" } }, { monster: { speeds: { fly: 0, teleport: 9 } } }]) {
    assert.equal(monsterSpeedsMovementInstance(card), null);
  }
  assert.equal(resolveMovementProfile(0, []).hasMovementModes, false);
  assert.ok(monsterSpeedsMovementInstance({ speed: 9, monster: { speeds: { fly: 12 } } }).mechanics.movement.suppressModes === undefined,
    "chi cammina tiene la camminata: la velocità di default è quella della scheda");
});

const moving = (extra = {}) => buildSpeedCheckSnapshot({
  turnKey: "1:0:a", itemId: "a", name: "Drago", speedMeters: 24, baseSpeedMeters: 12, cycleMeters: 3, activeMode: "fly", activeModeLabel: "Volare",
  movementModes: [{ id: "walk", label: "Camminare", baseSpeedMeters: 12, speedMeters: 12 }, { id: "fly", label: "Volare", baseSpeedMeters: 24, speedMeters: 24 }],
  ...extra,
});

test("ai giocatori: del mostro nascosto solo il turno, del visibile la modalità in uso, del PG tutto", () => {
  const hidden = speedSnapshotForPlayers(moving({ hiddenFromPlayers: true, nonPlayerCreature: true }));
  assert.deepEqual([hidden.turnKey, hidden.disabled, hidden.available, hidden.name, hidden.itemId, hidden.movementModes, hidden.totalMeters, hidden.speedMeters],
    ["1:0:a", true, false, "", "", [], 0, 0]);
  const visible = speedSnapshotForPlayers(moving({ nonPlayerCreature: true }));
  assert.deepEqual([visible.name, visible.totalMeters, visible.speedMeters, visible.activeMode, visible.movementModes.map(({ id }) => id)], ["Drago", 3, 24, "fly", ["fly"]]);
  const pc = moving();
  assert.equal(speedSnapshotForPlayers(pc), pc, "lo stesso oggetto: un messaggio solo");
  const oneMode = moving({ nonPlayerCreature: true, movementModes: [{ id: "fly", label: "Volare", speedMeters: 24 }] });
  assert.equal(speedSnapshotForPlayers(oneMode), oneMode, "un mostro con una modalità sola non ha nulla da togliere");
  const before = moving();
  assert.equal(speedSnapshotForPlayers(before), before);
  assert.equal(speedSnapshotForPlayers(null), null);
});

test("gli avvisi: al tavolo quelli di un PG, solo al GM quelli di un non PG o di un token nascosto", () => {
  assert.equal(speedWarningDestination({}), "ALL");
  assert.equal(speedWarningDestination({ nonPlayerCreature: true }), "LOCAL");
  assert.equal(speedWarningDestination({ hiddenFromPlayers: true }), "LOCAL");
  assert.equal(speedWarningDestination(null), "ALL");
});

test("nel motore: chi può spendere movimento su un promemoria a inizio turno", () => {
  assert.equal(resolveMovementProfile(12, []).hasMovementEscape, false);
  assert.equal(resolveMovementProfile(12, [statblock(12, { fly: 24 })]).hasMovementEscape, false);
  assert.equal(resolveMovementProfile(12, [], ["freedom-of-movement"]).hasMovementEscape, true);
  assert.equal(resolveMovementProfile(12, [], [{ name: "Libertà di movimento" }]).hasMovementEscape, true);
  const escape = { condition: "Libertà di movimento", active: true, mechanics: { movement: { escape: { costMeters: 1.5, conditions: ["Afferrato"] } } } };
  assert.equal(resolveMovementProfile(12, [escape]).hasMovementEscape, true);
  assert.equal(resolveMovementProfile(12, [{ ...escape, active: false }]).hasMovementEscape, false);
});

test("la linguetta compatta: il GM di chi ha più modalità le sceglie e legge i soli metri, tutti gli altri come prima", () => {
  const several = moving({ totalMeters: 3 });
  const asGm = compactSpeedReadout(several, { gm: true });
  assert.equal(asGm.summary, "3/24 m");
  assert.deepEqual(asGm.modes, [{ id: "walk", label: "Camminare · 12 m" }, { id: "fly", label: "Volare · 24 m" }]);
  assert.equal(asGm.activeLabel, "Volo", "una parola breve nella linguetta, per 154 px");
  assert.deepEqual(compactSpeedReadout(several), { summary: "3/24 m · (2/16)", modes: [], activeLabel: "" }, "il giocatore");
  const single = moving({ movementModes: [{ id: "fly", label: "Volare", speedMeters: 7.5 }], speedMeters: 7.5 });
  assert.deepEqual(compactSpeedReadout(single, { gm: true }), { summary: "3/7,5 m · (2/5)", modes: [], activeLabel: "" }, "il GM con una modalità sola");
});

test("la modalità di partenza: quella del turno se è lo stesso; quella dell'ultimo per i non PG, la camminata per i PG", () => {
  const last = { turnKey: "1:0:a", activeMode: "fly" };
  assert.equal(startingMovementMode(last, "1:0:a", "pc"), "fly", "lo stesso turno ricaricato");
  assert.equal(startingMovementMode(last, "1:0:a", "enemy"), "fly");
  assert.equal(startingMovementMode(last, "2:0:a", "pc"), "walk");
  assert.equal(startingMovementMode(last, "2:0:a", "PC"), "walk");
  for (const attitude of ["enemy", "ally", "neutral", "", undefined]) {
    assert.equal(startingMovementMode(last, "2:0:a", attitude), "fly", String(attitude));
  }
  assert.equal(startingMovementMode(undefined, "1:0:a", "enemy"), "walk", "il primo turno");
  assert.equal(startingMovementMode({ turnKey: "1:0:a" }, "1:0:a", "pc"), "walk");
});
