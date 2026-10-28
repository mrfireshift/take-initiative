// CAP-REACTION, lotto 1, of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: the defenses of Fire Shield, Shadow of Moil, Primordial
// Ward, Warding Bond and Absorb Elements, Sanctuary, the retaliation of the shields and the reactions the attacked
// creature can still cast (Shield, Absorb Elements, Hellish Rebuke). The expectations below are read from the 2014
// texts, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { attackTargetReactions, creatureCastableSpellIds } = await import("../src/attackReactionsCore.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellActiveActionPlan } = await import("../src/spellActiveActionCore.js");
const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { pcAttackLinkEnds } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const creature = (id, meta = {}) => ({ id, name: id, layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, ...meta } } });
const pills = (...instances) => ({ conditions: { version: 2, instances } });
const pill = (condition, mechanics, extra = {}) => ({ id: `${condition}-pill`, condition, active: true, mechanics, ...extra });

function castPills(spellId, choice = "", targetId = "caster") {
  const spell = getSpellDefinition(spellId);
  const intent = buildSpellApplicationIntent({ spell, enteredName: spell.displayName, turns: spell.defaultTurns, casterId: "caster",
    targetIds: [targetId], castContext: { slotLevel: spell.level, ...(choice ? { choice } : {}) }, selectedChoice: choice });
  return buildSpellApplicationPlan({ intent, instanceId: `${spellId}-1`, casterName: "Mago" }).operations
    .filter((operation) => operation.type === "condition:add")
    .map((operation) => ({ id: operation.conditionName, condition: operation.conditionName, active: true, mechanics: operation.options?.mechanics }));
}

test("the shields and wards resist for real: the consoles read the pill's defenses", () => {
  const defenses = (spellId, choice, targetId) => damageDefensesForItem(creature("c", pills(...castPills(spellId, choice, targetId))), META);
  assert.deepEqual(defenses("fire-shield", "warm").resistances, ["cold"], "warm shield: cold");
  assert.deepEqual(defenses("fire-shield", "chill").resistances, ["fire"], "chill shield: fire");
  assert.deepEqual(defenses("xanathar-ombra-di-moil").resistances, ["radiant"]);
  assert.deepEqual(defenses("xanathar-interdizione-primordiale").resistances, ["acid", "cold", "fire", "lightning", "thunder"]);
  assert.equal(defenses("warding-bond", "", "c").resistances.length, 13, "every damage type");
  assert.deepEqual(defenses("xanathar-assorbire-elementi", "fulmine").resistances, ["lightning"]);
});

test("Primordial Ward: the reaction trades the resistances for an immunity to one type, until the end of the next turn", () => {
  const spell = getSpellDefinition("xanathar-interdizione-primordiale");
  const group = { instanceId: "pw-1", casterId: "c", name: spell.displayName, castContext: {}, appliedAt: { round: 2, actorId: "x", turnKey: "2:1:x" },
    effectInstances: [{ itemId: "c", instanceId: "res-1", effectId: "elemental-resistances", active: true }] };
  const plan = buildSpellActiveActionPlan({ spell, actionId: "primordial-ward-immunity-fire", group, appliedAt: group.appliedAt });
  assert.equal(plan.valid, true, plan.errors?.join(", "));
  const [removal, immunity, reaction] = plan.operations;
  assert.deepEqual(removal.removals, [{ itemId: "c", instanceId: "res-1" }]);
  assert.deepEqual(immunity.options.mechanics.damageDefenses, { immunities: ["fire"] });
  assert.equal(immunity.options.expiry.mode, "turn-end");
  assert.equal(immunity.options.endsParentOnRemoval, true, "the spell ends with the immunity");
  assert.equal(reaction.conditionName, "Reazione usata");
  assert.equal(spell.activeActions.filter((action) => action.id.startsWith("primordial-ward-immunity-")).length, 5);
});

test("Sanctuary: the attacker saves on Wisdom against the warding caster's DC; it ends when the warded creature attacks", () => {
  const priest = creature("priest", { initiativeCard: { spellSaveDC: 15 } });
  const warded = creature("warded", pills(pill("Santuario", { sanctuary: true }, { sourceId: "priest", parentEffectId: "sanc-1" })));
  const orc = creature("orc");
  const view = attackTargetReactions({ target: warded, attacker: orc, attack: { roll: true, outcome: "" }, items: [priest, orc] });
  assert.match(view.sanctuary.text, /orc tira prima un TS Saggezza CD 15/u);
  assert.match(attackTargetReactions({ target: warded, attacker: orc, items: [] }).sanctuary.text, /CD del caster/u);
  const attacker = { ...warded, metadata: { [META]: { ...warded.metadata[META], [SPELLS]: [{ spellId: "sanctuary", instanceId: "sanc-1" }] } } };
  const ends = pcAttackLinkEnds({ sourceItem: attacker, targetItem: orc });
  assert.deepEqual(ends.map((end) => [end.spellId, end.instanceId]), [["sanctuary", "Santuario-pill"]]);
});

test("the retaliation: Fire Shield on a melee hit only, Shadow of Moil on any hit; nothing on a miss", () => {
  const shield = creature("mage", pills(...castPills("fire-shield", "warm")));
  const moil = creature("warlock", pills(...castPills("xanathar-ombra-di-moil")));
  const orc = creature("orc");
  const melee = { roll: true, melee: true, outcome: "hit" };
  const [fire] = attackTargetReactions({ target: shield, attacker: orc, attack: melee }).retaliations;
  assert.deepEqual([fire.dice, fire.type, fire.label], ["2d8", "fire", "Scudo di fuoco"]);
  assert.match(fire.text, /orc subisce 2d8 danni da fuoco se è entro 1,5 m/u);
  assert.deepEqual(attackTargetReactions({ target: shield, attacker: orc, attack: { ...melee, melee: false } }).retaliations, []);
  assert.deepEqual(attackTargetReactions({ target: shield, attacker: orc, attack: { ...melee, outcome: "miss" } }).retaliations, []);
  const [necrotic] = attackTargetReactions({ target: moil, attacker: orc, attack: { roll: true, melee: false, outcome: "critical" } }).retaliations;
  assert.deepEqual([necrotic.type, necrotic.label], ["necrotic", "Ombra di Moil"]);
});

test("the reactions the attacked creature can still cast: Shield on a hit, Absorb Elements on its types, Hellish Rebuke", () => {
  const book = (spellIds, extra = {}) => creature("hero", { initiativeCard: { spellbook: { spellIds } }, ...extra });
  const orc = creature("orc");
  const offers = (target, attack) => attackTargetReactions({ target, attacker: orc, attack }).offers.map((offer) => [offer.spellId, offer.direct, offer.variant || "", offer.targetIds || []]);
  const all = book(["shield", "xanathar-assorbire-elementi", "hellish-rebuke"]);
  assert.deepEqual(creatureCastableSpellIds(all).has("shield"), true);
  assert.deepEqual(offers(all, { roll: true, outcome: "hit", damageTypes: ["slashing", "fire"] }), [
    ["shield", true, "", []],
    ["xanathar-assorbire-elementi", false, "fuoco", []],
    ["hellish-rebuke", false, "", ["orc"]],
  ]);
  assert.deepEqual(offers(all, { roll: true, outcome: "miss", damageTypes: ["fire"] }), [], "a miss triggers nothing");
  assert.deepEqual(offers(all, { roll: false, outcome: "failed", damageTypes: ["cold"] }).map(([id]) => id),
    ["xanathar-assorbire-elementi", "hellish-rebuke"], "a save: no Shield");
  const used = book(["shield"], pills({ id: "r", condition: "Reazione usata", active: true }));
  assert.deepEqual(offers(used, { roll: true, outcome: "hit" }), [], "the reaction is already used");
  const shielded = book(["shield"], { [SPELLS]: [{ spellId: "shield", instanceId: "s-1" }] });
  assert.deepEqual(offers(shielded, { roll: true, outcome: "hit" }), [], "Shield already up");
  assert.deepEqual(offers(creature("tiefling", { initiativeCard: { quickActions: [{ kind: "spell", spellId: "hellish-rebuke" }] } }),
    { roll: true, outcome: "hit", damageTypes: ["piercing"] }).map(([id]) => id), ["hellish-rebuke"], "from a quick action too");
});
