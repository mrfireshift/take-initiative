// Lot F6-5 of docs/STUDIO_TALENTI.md (decision K6): Flames of Phlegethos. A card of the feat the GM uses after a spell with
// fire damage: the flames are a pill on the tiefling until the end of its next turn, and a creature that hits it in melee
// takes 1d4 fire damage, the retaliation the consoles show under the target as Fire Shield's. The expectations are read
// from Xanathar's text, not from the definitions under test.
import test from "node:test";
import assert from "node:assert/strict";
import { CLASS_FEATURE_BY_ID } from "../src/classFeatureCatalog.js";
import { classFeatureConditionInstancesForActivation, classFeatureIsReferenceOnly } from "../src/classFeatureCore.js";
import { attackTargetReactions } from "../src/attackReactionsCore.js";
import { FEATS } from "../src/featCatalog.js";

const META = "com.thebigpicture.initiative/meta";
const FLAMES = "talento-fiamme-di-flegesto-fiamme";

test("the flames: a card on the tiefling itself, without uses, until the end of its next turn", () => {
  const card = CLASS_FEATURE_BY_ID.get(FLAMES);
  assert.deepEqual([card.targetMode, card.runtimeSupport.adapter, card.resourceCosts, classFeatureIsReferenceOnly(card)], ["self", "condition", [], false]);
  const [pill] = classFeatureConditionInstancesForActivation(card, { instanceId: "i1", sourceId: "tief", targetIds: ["tief"], startedRound: 2 }, "Zara");
  assert.deepEqual([pill.targetId, pill.condition, pill.expiry.mode, pill.expiry.anchor], ["tief", "Fiamme di Flegesto", "turn-end", "next-turn"]);
  assert.deepEqual(pill.mechanics, { retaliation: { label: "Fiamme di Flegesto", dice: "1d4", type: "fire", meleeOnly: true, reachMeters: 1.5 } });
});

test("a melee hit on the tiefling in flames: 1d4 fire to the attacker, under the target; not at range nor on a miss", () => {
  const [pill] = classFeatureConditionInstancesForActivation(CLASS_FEATURE_BY_ID.get(FLAMES), { instanceId: "i1", sourceId: "tief",
    targetIds: ["tief"], startedRound: 2 }, "Zara");
  const tiefling = { id: "tief", name: "Zara", metadata: { [META]: { hp: 20, hpMax: 20, attitude: "pc", conditions: { version: 2, instances: [pill] } } } };
  const orc = { id: "orc", name: "Orco", metadata: { [META]: { hp: 15, hpMax: 15, attitude: "enemy" } } };
  const rows = (attack) => attackTargetReactions({ target: tiefling, attacker: orc, attack: { roll: true, ...attack }, items: [tiefling, orc] }).retaliations
    .map((row) => [row.short, row.text]);
  const flames = [["Fiamme di Flegesto · 1d4 fuoco", "Fiamme di Flegesto: Orco subisce 1d4 danni da fuoco se è entro 1,5 m."]];
  assert.deepEqual(rows({ melee: true, outcome: "hit" }), flames);
  assert.deepEqual(rows({ melee: true, outcome: "critical" }), flames);
  assert.deepEqual(rows({ melee: false, outcome: "hit" }), [], "a ranged hit");
  assert.deepEqual(rows({ melee: true, outcome: "miss" }), [], "a miss");
});

test("the feat's line says where the flames are and what stays at the table", () => {
  const line = FEATS.find((entry) => entry.id === "fiamme-di-flegesto").plugin;
  assert.match(line, /^Dopo un incantesimo con danni da fuoco, la card «fiamme» le accende fino alla fine del suo prossimo turno/u);
  assert.match(line, /Gli 1 si ritirano al tavolo\.$/u);
});
