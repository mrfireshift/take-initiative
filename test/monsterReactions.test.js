// Avvisi di reazione, lot R4 (docs/STUDIO_AVVISI_REAZIONE.md §6.12): a monster's reactions read from its stat block
// (decisions G1-G3), its candidates under the "Mostri" switch (D3, G5), and what Usa spends (the reaction only). The
// texts are the Monster Manual's (2014) and the 2024 form of the same reactions.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { monsterReactionFromEntry, monsterReactionsFromView } = await import("../src/monsterReactionParseCore.js");
const { reactionCandidates } = await import("../src/reactionCandidatesCore.js");
const { reactionPromptEffectText } = await import("../src/reactionPromptView.js");
const { planReactionFeatureSpend } = await import("../src/reactionFeatureRuntime.js");
const { normalizeDamageReactions } = await import("../src/damageReactionCore.js");

const META = "com.thebigpicture.initiative/meta";
const PARRY_2014 = { name: "Parry", text: "The knight adds 2 to its AC against one melee attack that would hit it. To do so, the knight must see the attacker and be wielding a melee weapon." };
const PARRY_2024 = { name: "Parry", text: "Trigger: The knight is hit by a melee attack roll while holding a weapon. Response: The knight adds 2 to its AC against that attack, possibly causing it to miss." };
const DODGE = { name: "Uncanny Dodge", text: "The assassin halves the damage that it takes from an attack that hits it. The assassin must be able to see the attacker." };
const SPITE = { name: "Spiteful Retort", text: "When a creature the cultist can see hits it with a melee attack, the cultist curses it." };
const TAUNT = { name: "Taunt", text: "When a creature misses the gladiator with a melee attack, the gladiator laughs." };
const OTHER = { name: "Leadership", text: "For 1 minute, the knight can utter a special command or warning." };

test("the forms read (G1): +N AC, melee when said; halved; a note after a hit or a miss; the rest is left", () => {
  assert.deepEqual(monsterReactionFromEntry(PARRY_2014), { kind: "ac-bonus", name: "Parry", text: PARRY_2014.text, amount: 2, melee: true });
  assert.equal(monsterReactionFromEntry({ name: "Shield Block", text: "The guard adds 3 to its AC against one attack that would hit it." }).melee, false);
  assert.equal(monsterReactionFromEntry(DODGE).kind, "halve");
  assert.equal(monsterReactionFromEntry(SPITE).kind, "note-hit");
  assert.equal(monsterReactionFromEntry(TAUNT).kind, "note-miss");
  assert.equal(monsterReactionFromEntry(OTHER), null);
  assert.equal(monsterReactionFromEntry({ name: "", text: PARRY_2014.text }), null, "a reaction has a name");
});

test("the 2024 form (G2): Trigger and Response read the same way, melee from the trigger", () => {
  assert.deepEqual(monsterReactionFromEntry(PARRY_2024), { kind: "ac-bonus", name: "Parry", text: PARRY_2024.text, amount: 2, melee: true });
});

test("from the view: the 5eTools Reactions section only; a pasted text under its Reactions line (G3)", () => {
  const view = { header: [], sections: [{ title: "", entries: [DODGE] }, { title: "Actions", entries: [PARRY_2014] },
    { title: "Reactions", entries: [PARRY_2014, OTHER] }] };
  assert.deepEqual(monsterReactionsFromView(view).map((reaction) => reaction.kind), ["ac-bonus"]);
  const pasted = ["Knight", "Armor Class 18", "ACTIONS", "Multiattack. The knight makes two melee attacks.", "REACTIONS",
    "Parry. The knight adds 2 to its AC against one melee attack that would hit it. To do so, the knight must see",
    "the attacker and be wielding a melee weapon.", "LEGENDARY ACTIONS", "Uncanny Dodge. The knight halves the damage that it takes."].join("\n");
  const read = monsterReactionsFromView({ header: [], sections: [{ title: "", entries: [{ name: "", text: pasted }] }] });
  assert.deepEqual(read.map((reaction) => [reaction.kind, reaction.amount]), [["ac-bonus", 2]]);
  assert.match(read[0].text, /be wielding a melee weapon\.$/u, "the line that follows belongs to the entry");
  assert.deepEqual(monsterReactionsFromView({ header: [], sections: [{ title: "", entries: [{ name: "", text: "Parry. The knight adds 2 to its AC against one melee attack." }] }] }), [],
    "no Reactions line, nothing");
});

const creature = (id, meta = {}, name = id) => ({ id, name, layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, attitude: "pc", ...meta } } });
const hero = creature("hero", {}, "Mira");
const knight = creature("knight", { attitude: "enemy", initiativeCard: { armorClass: 18 } }, "Cavaliere");
const state = { round: 1, current: 0, order: ["hero", "knight"] };
const hit = (extra = {}) => ({ trigger: "hit", attackerId: "hero", targetIds: ["knight"], range: "melee", attackRoll: true, damageTypes: ["slashing"], ...extra });
const npcsOn = { actors: { pcs: true, npcs: true } };
const knightReactions = { knight: [monsterReactionFromEntry(PARRY_2014), monsterReactionFromEntry(DODGE), monsterReactionFromEntry(SPITE)] };
const run = (event, extra = {}) => reactionCandidates(event, { items: [hero, knight], state, monsterReactions: knightReactions, ...extra })
  .candidates.map((candidate) => candidate);

test("the candidates: only with the Mostri switch on (D3), Parry in melee only, the halving as a damage modifier", () => {
  assert.deepEqual(run(hit()), [], "the switch is off by default");
  const on = run(hit(), { options: npcsOn });
  assert.deepEqual(on.map((candidate) => [candidate.reactionId, candidate.flow, candidate.timing]),
    [["monster-parry", "use-feature", "before"], ["monster-halve", "modifier", "before"]]);
  const parry = on[0];
  assert.equal(parry.amount, 2);
  assert.equal(parry.short, "+2 CA");
  assert.equal(parry.protectedId, "knight");
  assert.match(parry.rule, /^Parry: The knight adds 2/u);
  assert.equal(reactionPromptEffectText(parry, [hero, knight]), "+2 CA · CA 18 → 20: un tiro da 18 a 19 diventa Mancato");
  assert.deepEqual(run(hit({ range: "ranged" }), { options: npcsOn }).map((candidate) => candidate.reactionId), ["monster-halve"],
    "Parry says melee");
  assert.deepEqual(run(hit(), { options: npcsOn, monsterReactions: {} }), [], "no stat block read, nothing");
});

test("the notes come after: the hit's damage and the miss, with the stat block's name", () => {
  const afterHit = run({ ...hit(), trigger: "damage" }, { options: npcsOn }).filter((candidate) => candidate.timing === "after");
  assert.deepEqual(afterHit.map((candidate) => [candidate.reactionId, candidate.label]), [["monster-note-hit", "Spiteful Retort"]]);
  const gladiator = { knight: [monsterReactionFromEntry(TAUNT)] };
  const afterMiss = run({ ...hit(), trigger: "miss" }, { options: npcsOn, monsterReactions: gladiator });
  assert.deepEqual(afterMiss.map((candidate) => [candidate.reactionId, candidate.label, candidate.timing]), [["monster-note-miss", "Taunt", "after"]]);
});

test("Usa on a monster: the reaction only, never a resource; a reaction already used stops it", () => {
  const spend = planReactionFeatureSpend({ reactorItem: knight, reaction: { reactionId: "monster-halve", reactorId: "knight" }, initiativeState: state });
  assert.equal(spend.ok, true);
  assert.deepEqual(spend.operations.map((operation) => operation.type), ["condition:add", "condition:automate"]);
  const used = creature("knight", { attitude: "enemy", conditions: { version: 2, instances: [{ id: "r", condition: "Reazione usata", active: true }] } }, "Cavaliere");
  const again = planReactionFeatureSpend({ reactorItem: used, reaction: { reactionId: "monster-halve", reactorId: "knight" }, initiativeState: state });
  assert.equal(again.ok, false);
  assert.match(again.message, /ha già usato la reazione/u);
  assert.deepEqual(normalizeDamageReactions([{ reactionId: "monster-halve", reactorId: "knight", reactorName: "Cavaliere" }])
    .map((reaction) => [reaction.kind, reaction.label]), [["halve", "Schivata Prodigiosa"]]);
});
