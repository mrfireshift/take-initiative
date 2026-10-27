// Attacchi dei mostri, lotto 2: la console esegue le azioni dei mostri. Un attacco con arma resta l'attacco di oggi
// (bonus, portata e ricarica solo mostrati); un'azione a tiro salvezza passa dal percorso ad area del soffio con TS,
// CD, area e condizione propri.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackAreaMutation, buildPcAttackMutation, pcAttackAreaPreview, pcAttackFeetLabel, pcAttackMonsterAreaNote, pcAttackMonsterTags,
  pcAttackPreview, pcAttackResolvedAction, pcAttackSaveLabel } from "../src/pcAttackCore.js";
import { sanitizeQuickAction } from "../src/quickActionsCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const META = "com.thebigpicture.initiative/meta";
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const fireBreath = sanitizeQuickAction({ id: "fire-breath", label: "Soffio di fuoco", kind: "attack", range: "ranged",
  components: [{ type: "fire", formula: "18d6" }], save: "dex", saveDC: 21, saveHalf: true, area: { shape: "cone", sizeFeet: 60 }, recharge: 5 });
const presence = sanitizeQuickAction({ id: "presence", label: "Presenza terrificante", kind: "attack", components: [],
  save: "wis", saveDC: 19, area: { shape: "sphere", sizeFeet: 120 }, onFail: { condition: "Spaventato" }, note: "Ripete il TS a fine turno." });
const bite = sanitizeQuickAction({ id: "bite", label: "Morso", kind: "attack", range: "melee",
  components: [{ type: "piercing", formula: "2d10+8" }, { type: "fire", formula: "2d6" }], attackBonus: 14, reachFeet: 10 });
const poison = sanitizeQuickAction({ id: "poison", label: "Sputo velenoso", kind: "attack", range: "ranged",
  components: [{ type: "poison", formula: "4d8" }], save: "con", saveDC: 13 });
const dragon = (actions = [fireBreath, presence, bite], meta = {}) => creature("dragon", "Drago rosso adulto", {
  hp: 256, hpMax: 256, initiativeCard: { armorClass: 19, spellSaveDC: 8, quickActions: actions }, ...meta });
const elf = () => creature("elf", "Elfo", { initiativeCard: { damageDefenses: { resistances: ["fire"] } } });
const orc = () => creature("orc", "Orco", { hp: 15, hpMax: 15 });
const logLines = (result) => buildCombatLogPresentation(null, [{ category: "attack", payload: result.options.history.payload }]).events[0]
  .details.flatMap((section) => section.lines);

test("un'azione a TS diventa un'area a scelta manuale con TS, CD e metà danni propri", () => {
  const attack = pcAttackResolvedAction(fireBreath);
  assert.deepEqual(attack.area, { shape: "cone", sizeFeet: 60, manual: true });
  assert.equal(attack.save, "dex");
  assert.equal(attack.saveHalf, true);
  assert.deepEqual(attack.monster, { name: "Soffio di fuoco", half: true });
  // La CD del mostro, mai quella degli incantesimi della scheda (8).
  assert.equal(pcAttackSaveLabel(attack, dragon().metadata[META].initiativeCard), "TS Destrezza (CD 21)");
});

test("un TS senza area vale per una creatura, come lo Sputo acido", () => {
  const attack = pcAttackResolvedAction(poison);
  assert.deepEqual(attack.area, { shape: "target", maxTargets: 1, manual: true });
  assert.equal(attack.saveHalf, false);
  const preview = pcAttackAreaPreview({ action: poison, sourceItem: dragon([poison]),
    members: [{ item: elf(), outcome: "failed" }, { item: orc(), outcome: "failed" }], amounts: { c1: 18 } });
  assert.equal(preview.blocker, "Sputo velenoso: un solo bersaglio.");
  const capped = sanitizeQuickAction({ ...poison, area: { shape: "target", maxTargets: 2 } });
  assert.equal(pcAttackAreaPreview({ action: capped, sourceItem: dragon([capped]),
    members: [{ item: elf(), outcome: "failed" }, { item: orc(), outcome: "failed" }, { item: creature("imp", "Imp"), outcome: "failed" }], amounts: { c1: 18 } }).blocker,
  "Sputo velenoso: al massimo 2 bersagli.");
});

test("soffio: pieno a chi fallisce, metà a chi supera, resistenze del bersaglio; CD nel Combat Log", () => {
  const result = buildPcAttackAreaMutation({ action: fireBreath, sourceItem: dragon(),
    members: [{ item: elf(), outcome: "failed" }, { item: orc(), outcome: "passed" }], componentAmounts: { c1: 60 },
    attackInstanceId: "breath-1", expectedDefenses: {}, turnState: null });
  assert.deepEqual(result.rows.map((row) => [row.item.id, row.factor, row.change.requested, row.change.afterHP]), [["elf", "full", 30, 0], ["orc", "half", 30, 0]],
    "l'elfo resiste al fuoco: 60 → 30; l'orco supera: 60 → 30");
  assert.equal(result.causality.attack.source, "monster");
  assert.deepEqual(result.causality.save, { ability: "dex", dc: 21 });
  assert.deepEqual(result.causality.monster, { name: "Soffio di fuoco", half: true, dice: "18d6 fuoco",
    spent: [{ poolId: "quick-action-recharge:fire-breath", name: "Ricarica: Soffio di fuoco", amount: 1, before: 1, after: 0 }] });
  assert.deepEqual(result.causality.area, { manual: true, count: 2, shape: "cone", sizeFeet: 60 });
  assert.equal(result.options.label, "Drago rosso adulto: Soffio di fuoco → 2 creature");
  const lines = logLines(result);
  assert.ok(lines.includes("Area: 2 creature nel cono"), lines.join(" | "));
});

test("senza metà danni chi supera non subisce nulla", () => {
  const result = buildPcAttackAreaMutation({ action: poison, sourceItem: dragon([poison]), members: [{ item: orc(), outcome: "passed" }],
    componentAmounts: { c1: 18 }, attackInstanceId: "spit-1", expectedDefenses: {}, turnState: null });
  assert.equal(result.rows[0].factor, "zero");
  assert.deepEqual(result.operations, [], "PF invariati, nessuna condizione");
});

test("Presenza terrificante: nessun danno, Spaventato a chi fallisce, rimosso a mano; la nota va nel Combat Log", () => {
  const preview = pcAttackAreaPreview({ action: presence, sourceItem: dragon(), members: [{ item: elf(), outcome: "failed" }, { item: orc(), outcome: "passed" }] });
  assert.equal(preview.ready, true, preview.blocker);
  const result = buildPcAttackAreaMutation({ action: presence, sourceItem: dragon(),
    members: [{ item: elf(), outcome: "failed" }, { item: orc(), outcome: "passed" }], attackInstanceId: "fear-1", expectedDefenses: {}, turnState: null });
  assert.equal(result.operations.length, 1, "solo la condizione");
  const [operation] = result.operations;
  assert.equal(operation.type, "condition:add");
  assert.deepEqual(operation.targetIds, ["elf"]);
  assert.equal(operation.conditionName, "Spaventato");
  assert.deepEqual(operation.options.expiry, { mode: "manual" });
  assert.equal(operation.options.manualRemoval, true);
  assert.match(Object.values(operation.instanceIds)[0], /fear-1:monster/);
  assert.deepEqual(result.labelTargetIds, ["elf"]);
  const lines = logLines(result);
  assert.ok(lines.includes("Azione del mostro: Presenza terrificante · TS Saggezza CD 19, Spaventato se fallito"), lines.join(" | "));
  assert.ok(lines.includes("Da fare: Ripete il TS a fine turno."), lines.join(" | "));
  assert.ok(lines.includes("Area: 2 creature nella sfera"), lines.join(" | "));
});

test("un attacco con arma del mostro resta un attacco: esiti Colpito/Critico/Mancato, due componenti", () => {
  const attack = pcAttackResolvedAction(bite);
  assert.equal(attack.area, undefined);
  assert.equal(attack.monster, undefined);
  const preview = pcAttackPreview({ action: bite, sourceItem: dragon(), targetItem: orc(), outcome: "hit", amounts: { c1: 19, c2: 7 } });
  assert.equal(preview.ready, true, preview.blocker);
  const result = buildPcAttackMutation({ action: bite, sourceItem: dragon(), targetItem: orc(), outcome: "hit", componentAmounts: { c1: 19, c2: 7 },
    attackInstanceId: "bite-1", expectedDefenses: {}, turnState: null });
  assert.equal(result.operations[0].updates[0].hp, 0);
});

test("le etichette del mostro: bonus, portata e gittata in metri, ricarica e usi", () => {
  assert.deepEqual(pcAttackMonsterTags(bite), ["+14 al tiro", "portata 3 m"]);
  const bow = sanitizeQuickAction({ id: "bow", label: "Arco", kind: "attack", range: "ranged", components: [{ type: "piercing" }],
    attackBonus: -1, rangeFeet: { normal: 80, long: 320 }, uses: 3 });
  assert.deepEqual(pcAttackMonsterTags(bow), ["−1 al tiro", "gittata 24/96 m", "3/3 al giorno"]);
  assert.deepEqual(pcAttackMonsterTags(fireBreath), ["Ricarica 5–6"]);
  assert.deepEqual(pcAttackMonsterTags(sanitizeQuickAction({ ...bite, recharge: 6 })), ["+14 al tiro", "portata 3 m", "Ricarica 6"]);
  assert.deepEqual(pcAttackMonsterTags(sanitizeQuickAction({ id: "c", label: "T", kind: "attack", source: { kind: "cantrip" } })), []);
  assert.deepEqual([5, 15, 60, 120].map(pcAttackFeetLabel), ["1,5 m", "4,5 m", "18 m", "36 m"]);
});

test("la nota dell'area: forma e misura, TS e CD, cosa fanno successo e fallimento", () => {
  const card = dragon().metadata[META].initiativeCard;
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(fireBreath), card),
    "Cono di 18 m: disegna l'area sulla mappa o spunta le creature colpite. TS Destrezza (CD 21): metà se superato.");
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(presence), card),
    "Sfera di 36 m di raggio: disegna l'area sulla mappa o spunta le creature colpite. TS Saggezza (CD 19): chi fallisce è spaventato.");
  // Fase 5, lotto 1: "within 120 feet of the dragon", "of its choice": the creatures within are proposed.
  const around = pcAttackResolvedAction(sanitizeQuickAction({ ...presence, area: { shape: "sphere", sizeFeet: 120, origin: "self", choice: true } }));
  assert.deepEqual([around.area.manual, around.area.proposeFeet, around.area.chosen], [true, 120, true]);
  assert.equal(pcAttackMonsterAreaNote(around, card), "Entro 36 m dal mostro: proposte, togli quelle che non sceglie. TS Saggezza (CD 19): chi fallisce è spaventato.");
  const onPoint = pcAttackResolvedAction(sanitizeQuickAction({ ...presence, area: { shape: "sphere", sizeFeet: 20, origin: "point" } }));
  assert.equal(onPoint.area.proposeFeet, undefined, "a sphere on a point is drawn, never proposed");
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(poison), card),
    "Un bersaglio: spuntalo. TS Costituzione (CD 13): niente se superato.");
  const line = sanitizeQuickAction({ ...fireBreath, area: { shape: "line", sizeFeet: 60, widthFeet: 5 } });
  assert.match(pcAttackMonsterAreaNote(pcAttackResolvedAction(line), card), /^Linea di 18 m larga 1,5 m: /);
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(bite), card), "");
});

// Lotto 3: usi al giorno e ricarica, contatori in classFeatureState.resources spesi con l'attacco.
import { quickActionRechargePool, quickActionRechargeState, quickActionResourcePools, quickActionUsesPool } from "../src/quickActionsCore.js";

const USES = "quick-action-uses:bite-3";
const RECHARGE = "quick-action-recharge:fire-breath";
const limitedBite = sanitizeQuickAction({ ...bite, id: "bite-3", uses: 3 });
const withResources = (actions, resources) => dragon(actions, { classFeatureState: { resources } });

test("i contatori del mostro: usi al giorno al riposo lungo, ricarica di una carica anche al riposo breve", () => {
  assert.deepEqual(quickActionUsesPool(limitedBite), { id: USES, name: "Usi: Morso", capacity: { type: "fixed", value: 3 },
    refresh: [{ event: "riposo_lungo", amount: "massimo" }] });
  assert.deepEqual(quickActionRechargePool(fireBreath), { id: RECHARGE, name: "Ricarica: Soffio di fuoco", capacity: { type: "fixed", value: 1 },
    refresh: [{ event: "riposo_breve", amount: "massimo" }, { event: "riposo_lungo", amount: "massimo" }] });
  assert.deepEqual(quickActionResourcePools(bite), []);
  assert.equal(quickActionUsesPool(sanitizeQuickAction({ id: "c", label: "T", kind: "attack", source: { kind: "cantrip" } })), null);
  assert.equal(quickActionUsesPool({ id: "s", label: "Sonno", kind: "spell", spellId: "sleep", cost: "uses", uses: 2 }).capacity.value, 2, "gli usi degli incantesimi restano");
  assert.equal(quickActionRechargeState(fireBreath, {}).ready, true, "pronta finché non è usata");
  assert.equal(quickActionRechargeState(fireBreath, { [RECHARGE]: { current: 0 } }).ready, false);
});

test("un attacco con usi al giorno ne spende uno anche se manca; finiti gli usi è bloccato", () => {
  const result = buildPcAttackMutation({ action: limitedBite, sourceItem: dragon([limitedBite]), targetItem: orc(), outcome: "miss",
    attackInstanceId: "bite-1", expectedDefenses: {}, turnState: null });
  assert.equal(result.options.metadataPatches[0].fields.classFeatureState.value.resources[USES].current, 2);
  assert.deepEqual(result.causality.monster, { name: "Morso", spent: [{ poolId: USES, name: "Usi: Morso", amount: 1, before: 3, after: 2 }] });
  assert.ok(logLines(result).includes("Azione del mostro: Morso · Usi: Morso 3 → 2"), logLines(result).join(" | "));
  const empty = withResources([limitedBite], { [USES]: { current: 0 } });
  assert.equal(pcAttackPreview({ action: limitedBite, sourceItem: empty, targetItem: orc(), outcome: "hit", amounts: { c1: 19, c2: 7 } }).blocker,
    "Morso: nessun uso rimasto (0/3).");
  assert.throws(() => buildPcAttackMutation({ action: limitedBite, sourceItem: empty, targetItem: orc(), outcome: "hit", componentAmounts: { c1: 19, c2: 7 },
    attackInstanceId: "bite-2", expectedDefenses: {}, turnState: null }), /nessun uso rimasto/);
  assert.deepEqual(pcAttackMonsterTags(limitedBite, { [USES]: { current: 1 } }), ["+14 al tiro", "portata 3 m", "1/3 al giorno"]);
});

test("la ricarica si spende al primo uso e non blocca mai: riusata da spesa, il Combat Log dice che è tornata al tavolo", () => {
  const members = [{ item: orc(), outcome: "failed" }];
  const first = buildPcAttackAreaMutation({ action: fireBreath, sourceItem: dragon(), members, componentAmounts: { c1: 60 },
    attackInstanceId: "breath-a", expectedDefenses: {}, turnState: null });
  assert.equal(first.options.metadataPatches[0].fields.classFeatureState.value.resources[RECHARGE].current, 0);
  assert.ok(logLines(first).includes("Azione del mostro: Soffio di fuoco (18d6 fuoco) · TS Destrezza CD 21, metà se superato · Ricarica: Soffio di fuoco 1 → 0"),
    logLines(first).join(" | "));
  const spentDragon = withResources(undefined, { [RECHARGE]: { current: 0 } });
  assert.deepEqual(pcAttackMonsterTags(fireBreath, { [RECHARGE]: { current: 0 } }), ["Ricarica 5–6 · usata"]);
  assert.equal(pcAttackAreaPreview({ action: fireBreath, sourceItem: spentDragon, members, amounts: { c1: 60 } }).ready, true, "mai bloccata");
  const again = buildPcAttackAreaMutation({ action: fireBreath, sourceItem: spentDragon, members, componentAmounts: { c1: 60 },
    attackInstanceId: "breath-b", expectedDefenses: {}, turnState: null });
  assert.equal(Object.hasOwn(again.options.metadataPatches[0].fields, "classFeatureState"), false, "niente da spendere");
  assert.deepEqual(again.causality.monster.spent, [{ poolId: RECHARGE, name: "Ricarica: Soffio di fuoco", recharged: true }]);
  assert.ok(logLines(again).some((line) => line.endsWith("· Ricarica: Soffio di fuoco tornata al tavolo")), logLines(again).join(" | "));
});

test("un attacco senza contatori non tocca le risorse", () => {
  const result = buildPcAttackMutation({ action: bite, sourceItem: dragon(), targetItem: orc(), outcome: "hit", componentAmounts: { c1: 5, c2: 2 },
    attackInstanceId: "bite-x", expectedDefenses: {}, turnState: null });
  assert.equal(Object.hasOwn(result.options.metadataPatches[0].fields, "classFeatureState"), false);
  assert.equal(result.causality.monster, undefined);
});

// Attacchi dei mostri, fase 5, lotto 2: esiti più ricchi. Il bonus al TS del bersaglio accanto ai pulsanti (i dadi restano
// del tavolo), l'esito «Immune», le immunità alle condizioni della scheda del mostro (D3), l'Elusione.
import { PC_ATTACK_MONSTER_SAVE_OUTCOMES, pcAttackAreaOutcomes, pcAttackTargetConditionImmune, pcAttackTargetEvasion, pcAttackTargetSaveBonus }
  from "../src/pcAttackCore.js";

const undead = () => creature("zombie", "Zombi", { attitude: "enemy", initiativeCard: { monster: { source: "manual", conditionImmunities: ["avvelenato", "spaventato"] },
  abilityModifiers: { str: 1, dex: -2, con: 3, int: -4, wis: -2, cha: -3 }, savingThrows: { wis: 0 } } });
const rogue = () => creature("rogue", "Ladra", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "ladro", level: 7 }],
  savingThrows: { dex: 7 }, abilityModifiers: { dex: 4 } } });

test("il bonus al TS del bersaglio: il TS della scheda, il modificatore di un mostro, nulla se non si sa", () => {
  assert.equal(pcAttackTargetSaveBonus(undead(), "wis"), 0, "the sheet's save first");
  assert.equal(pcAttackTargetSaveBonus(undead(), "dex"), -2, "a monster without proficiency: its modifier");
  assert.equal(pcAttackTargetSaveBonus(rogue(), "dex"), 7);
  assert.equal(pcAttackTargetSaveBonus(rogue(), "wis"), null, "a character's modifier is not its save: unknown");
  assert.equal(pcAttackTargetSaveBonus(orc(), "dex"), null);
});

test("Immune: terzo esito delle azioni dei mostri, mai danni né condizione; immunità alle condizioni della scheda", () => {
  assert.deepEqual(pcAttackAreaOutcomes(pcAttackResolvedAction(presence)), PC_ATTACK_MONSTER_SAVE_OUTCOMES);
  assert.deepEqual(pcAttackAreaOutcomes(pcAttackResolvedAction(fireBreath)), ["failed", "passed", "immune"]);
  assert.equal(pcAttackTargetConditionImmune(undead(), "Spaventato"), true);
  assert.equal(pcAttackTargetConditionImmune(orc(), "Spaventato"), false);
  // Everyone immune: nothing to roll, nothing written but the action's use.
  const allImmune = pcAttackAreaPreview({ action: presence, sourceItem: dragon(), members: [{ item: undead(), outcome: "immune" }] });
  assert.equal(allImmune.blocker, "");
  const result = buildPcAttackAreaMutation({ action: presence, sourceItem: dragon(), members: [{ item: undead(), outcome: "immune" }, { item: orc(), outcome: "failed" }],
    componentAmounts: {}, attackInstanceId: "presence-immune", expectedDefenses: {}, turnState: null });
  assert.deepEqual(result.operations.filter((operation) => operation.type === "condition:add").map((operation) => operation.targetIds[0]), ["orc"]);
  assert.deepEqual(result.causality.targets.map((target) => [target.id, target.outcome]), [["zombie", "immune"], ["orc", "failed"]]);
  // A failed save of a creature immune to the condition: the damage, never the condition.
  const poisonCloud = sanitizeQuickAction({ id: "cloud", label: "Nube velenosa", kind: "attack", components: [{ type: "poison", formula: "4d8" }],
    save: "con", saveDC: 14, saveHalf: true, area: { shape: "sphere", sizeFeet: 20 }, onFail: { condition: "Avvelenato" } });
  const cloud = buildPcAttackAreaMutation({ action: poisonCloud, sourceItem: dragon([poisonCloud]), members: [{ item: undead(), outcome: "failed" }, { item: orc(), outcome: "failed" }],
    componentAmounts: { c1: 18 }, attackInstanceId: "cloud-1", expectedDefenses: {}, turnState: null });
  assert.deepEqual(cloud.rows.map((row) => [row.item.id, row.change.requested]), [["zombie", 18], ["orc", 18]]);
  assert.deepEqual(cloud.operations.filter((operation) => operation.type === "condition:add").map((operation) => operation.targetIds[0]), ["orc"]);
  assert.equal(cloud.causality.targets[0].conditionImmune, true);
});

test("Elusione: TS di Destrezza che dimezza, niente se superato e metà se fallito; mai su un altro TS", () => {
  const breath = pcAttackResolvedAction(fireBreath);
  assert.equal(pcAttackTargetEvasion(breath, rogue()), true);
  assert.equal(pcAttackTargetEvasion(breath, orc()), false);
  assert.equal(pcAttackTargetEvasion(pcAttackResolvedAction(presence), rogue()), false, "a Wisdom save");
  const monk = creature("shadow", "Danzatore", { initiativeCard: { monster: { source: "5etools", evasion: true } } });
  assert.equal(pcAttackTargetEvasion(breath, monk), true, "a monster with the Evasion trait");
  const result = buildPcAttackAreaMutation({ action: fireBreath, sourceItem: dragon(), members: [{ item: rogue(), outcome: "passed" }, { item: monk, outcome: "failed" }],
    componentAmounts: { c1: 40 }, attackInstanceId: "breath-evasion", expectedDefenses: {}, turnState: null });
  assert.deepEqual(result.rows.map((row) => [row.item.id, row.factor, row.change.requested]), [["rogue", "zero", 0], ["shadow", "half", 20]]);
  assert.deepEqual(result.causality.targets.map((target) => target.evasion), ["applied", "applied"]);
});

import { MONSTER_PROFILE_STATBLOCK_FIELDS, sanitizeMonsterProfile } from "../src/monsterProfileCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";

test("immunità alle condizioni ed Elusione nel profilo del mostro: dal formato del plugin, in inglese o in italiano", () => {
  const sheet = parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Ombra", actions: [],
    conditionImmunities: ["frightened", "Avvelenato", "exhaustion"], evasion: true }));
  assert.deepEqual(sheet.monster, { source: "manual", conditionImmunities: ["spaventato", "avvelenato", "indebolimento"], evasion: true });
  assert.deepEqual(sanitizeMonsterProfile({ source: "5etools", conditionImmunities: ["Spaventato", "spaventato", ""], evasion: "sì" }),
    { source: "5etools", conditionImmunities: ["spaventato"] });
  assert.deepEqual(MONSTER_PROFILE_STATBLOCK_FIELDS, ["conditionImmunities", "evasion"], "a new block replaces them, never merges");
  assert.equal(parseCharacterSheetImport(JSON.stringify({ name: "PG", conditionImmunities: ["frightened"] })).monster, undefined, "only a monster's block");
});

// Attacchi dei mostri, fase 5, lotto 3: la condizione dura quanto dice lo statblock; il tiro ripetuto la chiude con il
// promemoria (D7: mai il conteggio dei round); chi supera un'azione con immunità prende la pillola per 24 ore.
import { pcAttackActionImmunityId, pcAttackMonsterConditionTiming, pcAttackMonsterFailureText, pcAttackTargetActionImmune } from "../src/pcAttackCore.js";
import { importedMonsterActions } from "../src/monsterStatblockImportCore.js";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { readFileSync } from "node:fs";

const frightful = sanitizeQuickAction({ id: "presence", label: "Presenza terrificante", kind: "attack", components: [], save: "wis", saveDC: 19,
  area: { shape: "sphere", sizeFeet: 120, origin: "self", choice: true }, onFail: { condition: "Spaventato", rounds: 10, repeat: "turn-end" }, immuneHours: 24 });

test("sulla scheda: condizioni in più, round, fino al prossimo turno, tiro ripetuto, ore di immunità", () => {
  assert.deepEqual([frightful.onFail, frightful.immuneHours], [{ condition: "Spaventato", rounds: 10, repeat: "turn-end" }, 24]);
  assert.deepEqual(sanitizeQuickAction({ ...frightful, onFail: { condition: "Avvelenato", also: ["Paralizzato", "Paralizzato"], until: "turn-end", anchor: "source",
    repeat: "sometimes" } }).onFail, { condition: "Avvelenato", also: ["Paralizzato"], until: "turn-end", anchor: "source" });
  // From 5eTools to the card: the dragon's Frightful Presence.
  const srd = JSON.parse(readFileSync(new URL("../test-support/fivetools-srd-monsters.json", import.meta.url), "utf8"));
  const block = fiveToolsMonsterToStatblock(srd.monster.find((monster) => monster.name === "Adult Silver Dragon")).block;
  const presenceFields = importedMonsterActions(block, { resolveDamageType: (type) => type, resolveAbility: (value) => ({ wisdom: "wis", wis: "wis" })[String(value).toLowerCase()] || "", unresolved: [] })
    .attacks.find((action) => action.label === "Frightful Presence");
  assert.deepEqual([presenceFields.onFail, presenceFields.immuneHours], [{ condition: "Spaventato", rounds: 10, repeat: "turn-end" }, 24]);
});

test("la durata in parole e nei comandi: il tiro ripetuto non conta i round (D7)", () => {
  const attack = pcAttackResolvedAction(frightful);
  assert.equal(pcAttackMonsterFailureText(attack.monster.onFail), "spaventato fino a 1 minuto, TS a fine turno");
  assert.match(pcAttackMonsterAreaNote(attack, dragon().metadata[META].initiativeCard), /chi fallisce è spaventato fino a 1 minuto, TS a fine turno, chi supera è immune per 24 ore\.$/);
  assert.deepEqual(pcAttackMonsterConditionTiming(attack), { expiry: { mode: "manual" }, manualRemoval: true, saveReminder: { ability: "wis", timing: "turn-end", dc: 19 } });
  const timed = pcAttackResolvedAction(sanitizeQuickAction({ ...frightful, onFail: { condition: "Stordito", rounds: 1 }, immuneHours: undefined }));
  assert.deepEqual(pcAttackMonsterConditionTiming(timed), { manualRemoval: false, expiry: { mode: "rounds", remaining: 1 } });
  assert.equal(pcAttackMonsterFailureText(timed.monster.onFail), "stordito per 1 round");
  const untilTarget = pcAttackResolvedAction(sanitizeQuickAction({ ...frightful, onFail: { condition: "Trattenuto", until: "turn-end" } }));
  assert.deepEqual(pcAttackMonsterConditionTiming(untilTarget, { sourceId: "dragon", targetId: "orc" }).expiry,
    { mode: "turn-end", remaining: 1, actor: "target", actorId: "orc", anchor: "next-turn" });
  const untilSource = pcAttackResolvedAction(sanitizeQuickAction({ ...frightful, onFail: { condition: "Accecato", until: "turn-end", anchor: "source" } }));
  assert.equal(pcAttackMonsterFailureText(untilSource.monster.onFail), "accecato fino alla fine del prossimo turno del mostro");
  assert.equal(pcAttackMonsterConditionTiming(untilSource, { sourceId: "dragon", targetId: "orc" }).expiry.actorId, "dragon");
});

test("all'esecuzione: la condizione con il promemoria che, superato, applica l'immunità; chi supera è immune per 24 ore", () => {
  const result = buildPcAttackAreaMutation({ action: frightful, sourceItem: dragon([frightful]),
    members: [{ item: orc(), outcome: "failed" }, { item: elf(), outcome: "passed" }], componentAmounts: {}, attackInstanceId: "presence-3", expectedDefenses: {}, turnState: null });
  const [fear, immunity] = result.operations;
  assert.deepEqual([fear.type, fear.targetIds, fear.conditionName, fear.options.manualRemoval, fear.options.expiry], ["condition:add", ["orc"], "Spaventato", true, { mode: "manual" }]);
  assert.deepEqual([fear.options.saveReminder.ability, fear.options.saveReminder.timing, fear.options.saveReminder.dc], ["wis", "turn-end", 19]);
  assert.equal(fear.options.saveReminder.label, "Se supera il TS, termina Spaventato e diventa immune per 24 ore.");
  const immunityId = pcAttackActionImmunityId(pcAttackResolvedAction(frightful), "dragon");
  assert.equal(fear.options.saveReminder.resolution.success.actions[0].options.effectId, immunityId);
  assert.deepEqual([immunity.targetIds, immunity.conditionName, immunity.options.effectId, immunity.options.effectKind], [["elf"], "Immune · Presenza terrificante", immunityId, "buff"]);
  assert.deepEqual(result.causality.immunityApplied, { hours: 24, targetIds: ["elf"] });
  assert.deepEqual(result.labelTargetIds, ["orc", "elf"]);
  // The pill on the elf: Immune to this dragon's Frightful Presence, never to another dragon's.
  const pill = { effectId: immunityId, active: true };
  const immuneElf = creature("elf", "Elfo", { conditions: [pill] });
  assert.equal(pcAttackTargetActionImmune(immuneElf, pcAttackResolvedAction(frightful), "dragon"), true);
  assert.equal(pcAttackTargetActionImmune(immuneElf, pcAttackResolvedAction(frightful), "other-dragon"), false);
  const again = buildPcAttackAreaMutation({ action: frightful, sourceItem: dragon([frightful]), members: [{ item: immuneElf, outcome: "passed" }],
    componentAmounts: {}, attackInstanceId: "presence-4", expectedDefenses: {}, turnState: null });
  assert.equal(again.operations.length, 0, "already immune: no second pill");
});

test("più condizioni, ognuna saltata per chi ne è immune; la condizione a tempo scade da sola", () => {
  const sting = sanitizeQuickAction({ id: "sting", label: "Pungiglione", kind: "attack", components: [{ type: "poison", formula: "2d6" }], save: "con", saveDC: 13,
    onFail: { condition: "Avvelenato", also: ["Paralizzato"], rounds: 10 } });
  const undeadImmune = creature("zombie", "Zombi", { initiativeCard: { monster: { source: "manual", conditionImmunities: ["avvelenato"] } } });
  const result = buildPcAttackAreaMutation({ action: sting, sourceItem: dragon([sting]), members: [{ item: undeadImmune, outcome: "failed" }],
    componentAmounts: { c1: 7 }, attackInstanceId: "sting-1", expectedDefenses: {}, turnState: null });
  assert.deepEqual(result.operations.filter((operation) => operation.type === "condition:add").map((operation) => [operation.conditionName, operation.options.expiry]),
    [["Paralizzato", { mode: "rounds", remaining: 10 }]]);
});
