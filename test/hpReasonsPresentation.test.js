// Lot U3b of the system UX audit: the combat log says why a creature's HP are not what the command asked. The
// reasons were planned and then dropped: Warding Bond's damage on the caster, Death Ward's 1 HP, the defenses of
// the Boss and attack consoles, massive damage.
import test from "node:test";
import assert from "node:assert/strict";
import { combatEventFromHistoryEntry } from "../src/combatLogCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";
import { normalizeCombatLogCausality } from "../src/combatLogCausalityCore.js";
import { planDeathSaveHpChange, MASSIVE_DAMAGE_DETAIL } from "../src/deathSaveCore.js";
import { planDeathWard, planWardingBondDamage } from "../src/reactionHpCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const snapshot = (value) => (value === undefined ? { present: false } : { present: true, value });
const lines = (entry) => buildCombatLogPresentation({}, [combatEventFromHistoryEntry(entry, { round: 1 })])
  .events[0].details.flatMap((section) => section.lines);
const hpChange = (id, name, before, after, hpMax = 40) => ({ id, name,
  before: { hp: snapshot(before), hpMax: snapshot(hpMax) }, after: { hp: snapshot(after), hpMax: snapshot(hpMax) } });

test("U3b: il piano del Vincolo e dell'Interdizione restituisce una ragione breve per creatura", () => {
  const caster = { id: "omar", name: "Omar", metadata: { [META_KEY]: { hp: 30, hpMax: 40 } } };
  const hero = { id: "kios", name: "Kios", metadata: { [META_KEY]: { hp: 20, hpMax: 40, conditions: { instances: [
    { id: "bond", sourceId: "omar", mechanics: { wardingBond: true } }] } } } };
  const bond = planWardingBondDamage({ writes: [{ itemId: "kios", damage: 7 }], itemsById: new Map([["omar", caster], ["kios", hero]]) });
  assert.deepEqual(bond.records, [{ id: "omar", kind: "warding-bond", text: "Vincolo di interdizione: 7 danni con Kios" }]);
  const warded = { id: "kios", name: "Kios", metadata: { [META_KEY]: { hp: 5, hpMax: 40, conditions: { instances: [
    { id: "ward", mechanics: { deathWard: true } }] } } } };
  assert.deepEqual(planDeathWard({ item: warded, hpAfter: -3, damage: 8 }).record,
    { id: "kios", kind: "death-ward", text: "Interdizione alla morte: resta a 1 PF, l'interdizione termina" });
});

test("U3b: la riga dei PF nel registro aggiunge le ragioni della Cronologia, alla creatura giusta", () => {
  const entry = { id: "h-bond", kind: "hp", label: "Danno rapido: 7 · 1 bersagli",
    payload: { reactions: [{ id: "omar", kind: "warding-bond", text: "Vincolo di interdizione: 7 danni con Kios" }] },
    changes: [hpChange("kios", "Kios", 20, 13), hpChange("omar", "Omar", 30, 23)] };
  const all = lines(entry);
  assert.ok(all.includes("Omar: 30/40 → 23/40 (-7 PF · Vincolo di interdizione: 7 danni con Kios)"), all.join("\n"));
  assert.ok(all.includes("Kios: 20/40 → 13/40 (-7 PF)"), "the warded creature keeps its plain line");
});

test("U3b: l'Interdizione alla morte spiega perché il bersaglio resta a 1 PF", () => {
  const entry = { id: "h-ward", kind: "hp", label: "Danno rapido: 15 · 1 bersagli",
    payload: { reactions: [{ id: "klos", kind: "death-ward", text: "Interdizione alla morte: resta a 1 PF, l'interdizione termina" }] },
    changes: [hpChange("klos", "Klos", 6, 1, 133)] };
  assert.ok(lines(entry).includes("Klos: 6/133 → 1/133 (-5 PF · Interdizione alla morte: resta a 1 PF, l'interdizione termina)"));
});

test("U3b: la causalità conserva le difese applicate o ignorate di ogni componente", () => {
  const causality = normalizeCombatLogCausality({ targets: [{ id: "dars", name: "Dars", requestedDamage: 16, appliedHpDelta: -16,
    damageComponents: [
      { id: "c1", type: "slashing", amount: 12, defense: null },
      { id: "c2", type: "cold", amount: 4, defense: "resistance" },
      { id: "c3", type: "fire", amount: 0, defense: null, defenseIgnored: "immunity" },
    ] }] });
  assert.deepEqual(causality.targets[0].defenses, [
    { type: "cold", defense: "resistance" },
    { type: "fire", defense: "immunity", ignored: true },
  ]);
  const entry = { id: "h-boss", kind: "boss-action", label: "Icekiss", payload: { causality: { targets: causality.targets } },
    changes: [hpChange("dars", "Dars", 40, 24)] };
  const causalityLine = lines(entry).find((line) => line.startsWith("Dars:") && line.includes("richiesti"));
  assert.match(causalityLine, /resistenza \(freddo\), immunità \(fuoco\) ignorata/);
});

test("U3b: il danno massiccio porta Morto con il suo motivo, sulla pill e nel registro", () => {
  const atFull = planDeathSaveHpChange({ meta: { attitude: "pc", hp: 10, hpMax: 20 }, hpAfter: 0, hpMax: 20, damage: 31 });
  assert.equal(atFull.addCondition, "Morto");
  assert.equal(atFull.deathDetail, MASSIVE_DAMAGE_DETAIL);
  const atZero = planDeathSaveHpChange({ meta: { attitude: "pc", hp: 0, hpMax: 20 }, hpAfter: 0, hpMax: 20, damage: 20 });
  assert.equal(atZero.deathDetail, MASSIVE_DAMAGE_DETAIL);
  const thirdFailure = planDeathSaveHpChange({ meta: { attitude: "pc", hp: 0, hpMax: 20, deathSaves: { successes: 0, failures: 2 } },
    hpAfter: 0, hpMax: 20, damage: 3 });
  assert.equal(thirdFailure.addCondition, "Morto");
  assert.equal(thirdFailure.deathDetail, undefined, "the third failure needs no reason");
});
