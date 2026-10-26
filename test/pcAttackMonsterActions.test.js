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

test("soffio: pieno a chi fallisce, metà a chi supera, resistenze del bersaglio; nessun uso speso, CD nel Combat Log", () => {
  const result = buildPcAttackAreaMutation({ action: fireBreath, sourceItem: dragon(),
    members: [{ item: elf(), outcome: "failed" }, { item: orc(), outcome: "passed" }], componentAmounts: { c1: 60 },
    attackInstanceId: "breath-1", expectedDefenses: {}, turnState: null });
  assert.deepEqual(result.rows.map((row) => [row.item.id, row.factor, row.change.requested, row.change.afterHP]), [["elf", "full", 30, 0], ["orc", "half", 30, 0]],
    "l'elfo resiste al fuoco: 60 → 30; l'orco supera: 60 → 30");
  assert.equal(result.causality.attack.source, "monster");
  assert.deepEqual(result.causality.save, { ability: "dex", dc: 21 });
  assert.deepEqual(result.causality.monster, { name: "Soffio di fuoco", half: true, dice: "18d6 fuoco" });
  assert.deepEqual(result.causality.area, { manual: true, count: 2, shape: "cone", sizeFeet: 60 });
  assert.equal(result.options.label, "Drago rosso adulto: Soffio di fuoco → 2 creature");
  assert.equal(Object.hasOwn(result.options.metadataPatches[0].fields, "classFeatureState"), false, "la ricarica non spende nulla (lotto 3)");
  const lines = logLines(result);
  assert.ok(lines.includes("Azione del mostro: Soffio di fuoco (18d6 fuoco) · TS Destrezza CD 21, metà se superato"), lines.join(" | "));
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
  assert.deepEqual(pcAttackMonsterTags(bow), ["−1 al tiro", "gittata 24/96 m", "3/giorno"]);
  assert.deepEqual(pcAttackMonsterTags(fireBreath), ["Ricarica 5–6"]);
  assert.deepEqual(pcAttackMonsterTags(sanitizeQuickAction({ ...bite, recharge: 6 })), ["+14 al tiro", "portata 3 m", "Ricarica 6"]);
  assert.deepEqual(pcAttackMonsterTags(sanitizeQuickAction({ id: "c", label: "T", kind: "attack", source: { kind: "cantrip" } })), []);
  assert.deepEqual([5, 15, 60, 120].map(pcAttackFeetLabel), ["1,5 m", "4,5 m", "18 m", "36 m"]);
});

test("la nota dell'area: forma e misura, TS e CD, cosa fanno successo e fallimento", () => {
  const card = dragon().metadata[META].initiativeCard;
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(fireBreath), card),
    "Cono di 18 m: spunta le creature colpite. TS Destrezza (CD 21): metà se superato.");
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(presence), card),
    "Sfera di 36 m di raggio: spunta le creature colpite. TS Saggezza (CD 19): chi fallisce è spaventato.");
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(poison), card),
    "Un bersaglio: spuntalo. TS Costituzione (CD 13): niente se superato.");
  const line = sanitizeQuickAction({ ...fireBreath, area: { shape: "line", sizeFeet: 60, widthFeet: 5 } });
  assert.match(pcAttackMonsterAreaNote(pcAttackResolvedAction(line), card), /^Linea di 18 m larga 1,5 m: /);
  assert.equal(pcAttackMonsterAreaNote(pcAttackResolvedAction(bite), card), "");
});
