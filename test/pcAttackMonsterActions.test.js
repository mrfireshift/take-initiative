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
