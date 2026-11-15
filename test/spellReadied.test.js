// The readied spell's foundations (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6a, decisions P1–P12): which spells the Ready
// action holds, the hold's two phases, its concentration whatever the spell, and its pill «Azione preparata · …» on the
// caster until the start of its next turn.
import assert from "node:assert/strict";
import test from "node:test";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  READIED_SPELL_CONDITION, READIED_SPELL_EXPIRY, getSpellCastPhasePlan, readiedSpellLabel, spellCanBeReadied, spellCastWithOneAction,
} from "../src/spellCastPhaseCore.js";
import { spellForCastContext } from "../src/spellCastContextCore.js";
import { buildSpellApplicationIntent, buildSpellApplicationPlan } from "../src/spellApplicationPlanCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { READIED_ACTION_CONDITION, hasReadiedAction } from "../src/reactionTrackerCore.js";
import { planSpellSlotSpend } from "../src/spellSlotSpendCore.js";

const spell = (id) => getSpellDefinition(id);
const readied = (extra = {}) => ({ readied: true, phase: "prepare", ...extra });
const appliedAt = { round: 2, actorId: "caster", phase: "turn", turnKey: "2:caster" };
// The hold's command, as the panel's lifecycle sends it: on the caster, the slot in the cast context.
function holdPlan(id, castContext = readied(), instanceId = "hold-1") {
  const intent = buildSpellApplicationIntent({ spell: spell(id), enteredName: id, turns: 1, casterId: "caster", targetIds: ["caster"], castContext });
  return { intent, plan: buildSpellApplicationPlan({ intent, instanceId, appliedAt, casterName: "Maga" }) };
}
// What the effects coordinator adds before applying (effectsMutations.js, prepareOperation): the ids of its entries.
function withIds(operations) {
  return operations.map((operation, index) => ({
    ...operation, operationId: operation.operationId || `op-${index}`, createdAt: 100 + index,
    ...(operation.type === "condition:add" ? { instanceIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `${id}-pill-${index}`])) } : {}),
    ...(operation.type === "spell:upsert" ? { entryIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `${id}-entry-${index}`])) } : {}),
  }));
}
const token = (id, overrides = {}) => ({ id, name: id, spells: [], concentrations: {}, conditions: [], ...overrides });
const state = (plan, id) => plan.states.find((entry) => entry.id === id);

test("the Ready action holds a spell cast with 1 action: the SRD's from the excerpt, the others' from their reference", () => {
  assert.deepEqual(["fireball", "fire-bolt", "web", "guiding-bolt", "freezing-sphere"].map((id) => spellCastWithOneAction(spell(id))), [true, true, true, true, true]);
  assert.deepEqual(["misty-step", "shield", "identify"].map((id) => spellCastWithOneAction(spell(id))), [false, false, false],
    "a bonus action, a reaction, 1 minute");
  assert.equal(spellCastWithOneAction(spell("phb2014-frusta-di-spine")), true, "PHB 2014: «1 azione»");
  assert.equal(spellCastWithOneAction(spell("phb2014-punizione-collerica")), false, "«1 azione bonus»");
  assert.equal(spellCastWithOneAction(spell("xanathar-aculeo-mentale")), true, "a supplement's");
  assert.equal(spellCastWithOneAction(spell("xanathar-assorbire-elementi")), false, "«1 reazione, che…»");
  assert.equal(spellCanBeReadied(spell("fireball")), true);
  assert.equal(spellCanBeReadied(spell("symbol")), false, "Symbol is traced, not held");
  assert.equal(spellCanBeReadied(spell("freezing-sphere")), true, "Freezing Sphere in its «Scaglia subito» form");
  assert.equal(spellCanBeReadied(null), false);
});

test("the hold's phase: on the caster, the pill «Azione preparata · …» until the start of its next turn, no automation", () => {
  const plan = getSpellCastPhasePlan(spell("fireball"), "prepare", readied({ slotLevel: 4 }));
  assert.deepEqual([plan.phase, plan.readied, plan.subjectMode, plan.useCatalogAutomation, plan.concentrationAction], ["prepare", true, "caster", false, "replace"]);
  assert.deepEqual(plan.preparedExpiry, { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" });
  assert.deepEqual(READIED_SPELL_EXPIRY, plan.preparedExpiry);
  const [pill] = plan.effects;
  assert.equal(READIED_SPELL_CONDITION, READIED_ACTION_CONDITION, "the creature's readied action (P5): the card's menu reads it");
  assert.deepEqual([pill.label, pill.displayLabel, pill.manualRemoval, pill.endsParentOnRemoval, pill.parentRemoval],
    ["Azione preparata", "Azione preparata · Palla di fuoco (4°)", true, true, "spell"]);
  assert.match(pill.detail, /si rilascia con la reazione/);
  assert.equal(readiedSpellLabel(spell("fire-bolt")), "Azione preparata · Dardo di fuoco", "a cantrip: no slot");
  // Released: the spell as a cast, its concentration going on with it if it needs it, ended otherwise (P7).
  const fireball = getSpellCastPhasePlan(spell("fireball"), "resolve", { readied: true, phase: "resolve" });
  assert.deepEqual([fireball.phase, fireball.useCatalogAutomation, fireball.subjectMode, fireball.concentrationAction], ["resolve", true, "selected", "dismiss"]);
  assert.equal(getSpellCastPhasePlan(spell("web"), "resolve", { readied: true, phase: "resolve" }).concentrationAction, "extend");
  // Without the mark, as before; Symbol keeps its own phases.
  assert.equal(getSpellCastPhasePlan(spell("fireball"), "", {}).phase, "cast");
  assert.equal(getSpellCastPhasePlan(spell("symbol"), "prepare", readied()).readied, undefined);
});

test("holding the energy is concentration, whatever the spell and its slot; released, the spell is itself again", () => {
  assert.equal(spellForCastContext(spell("fireball"), readied()).concentration, true);
  assert.equal(spellForCastContext(spell("fireball"), { readied: true, phase: "resolve" }).concentration, false);
  assert.equal(spellForCastContext(spell("fireball"), {}).concentration, false);
  assert.equal(spellForCastContext(spell("web"), readied()).concentration, true);
});

test("the hold's command: the other concentrations end, the record and the pill on the caster, its concentration registered", () => {
  const { intent, plan } = holdPlan("fireball", readied({ slotLevel: 3 }));
  assert.equal(intent.wantsConcentration, true);
  assert.equal(plan.historyLabel, "Preparazione: Palla di fuoco");
  assert.deepEqual(plan.operations.map((operation) => operation.type),
    ["concentration:break", "spell:upsert", "condition:add", "concentration:register", "condition:automate"]);
  const upsert = plan.operations.find((operation) => operation.type === "spell:upsert");
  assert.deepEqual([upsert.targetIds, upsert.conc, upsert.spellId, upsert.instanceId], [["caster"], true, "fireball", "hold-1"]);
  assert.deepEqual(upsert.expiry, READIED_SPELL_EXPIRY);
  assert.deepEqual([upsert.castContext.readied, upsert.castContext.phase, upsert.castContext.slotLevel], [true, "prepare", 3]);
  const add = plan.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual([add.targetIds, add.conditionName, add.options.displayLabel, add.options.parentEffectId, add.options.sourceId],
    [["caster"], "Azione preparata", "Azione preparata · Palla di fuoco (3°)", "hold-1", "caster"]);
  assert.deepEqual(add.options.expiry, READIED_SPELL_EXPIRY);
  // An attack spell is held too: no roll yet, so its record and its concentration are kept and no hit pill is put.
  const bolt = holdPlan("guiding-bolt", readied({ slotLevel: 1 }));
  assert.equal(bolt.intent.attackResolution, null);
  assert.deepEqual(bolt.plan.operations.map((operation) => operation.type),
    ["concentration:break", "spell:upsert", "condition:add", "concentration:register", "condition:automate"]);
  assert.equal(bolt.plan.operations.filter((operation) => operation.type === "condition:add").length, 1);
});

test("the slot is spent at the hold, never at the release", () => {
  const build = [{ classId: "mago", level: 5 }];
  assert.equal(planSpellSlotSpend({ characterBuild: build, spellLevel: 3, slotLevel: 3, phase: "prepare" }).spend?.level, 3);
  assert.equal(planSpellSlotSpend({ characterBuild: build, spellLevel: 3, slotLevel: 3, phase: "resolve" }).reason, "phase");
});

test("held: the caster's readied action and its concentration; at the start of its next turn the hold ends, all of it", () => {
  const { plan } = holdPlan("fireball", readied({ slotLevel: 3 }));
  const held = buildEffectsMutationPlan([
    token("caster", { concentrations: { ragnatela: { name: "Ragnatela", instanceId: "web-1", spellId: "web", targets: ["goblin"] } },
      spells: [{ id: "web-entry", name: "Ragnatela", instanceId: "web-1", spellId: "web", casterId: "caster", conc: true, turns: 10 }] }),
    token("goblin", { spells: [{ id: "web-goblin", name: "Ragnatela", instanceId: "web-1", spellId: "web", casterId: "caster", conc: true, turns: 10 }] }),
  ], withIds(plan.operations));
  const caster = state(held, "caster");
  assert.deepEqual(state(held, "goblin").spells, [], "Ragnatela ended: holding a spell is concentrating on it (P4)");
  assert.deepEqual(Object.values(caster.concentrations).map((entry) => [entry.name, entry.instanceId]), [["Palla di fuoco", "hold-1"]]);
  assert.deepEqual(caster.spells.map((entry) => [entry.spellId, entry.conc, entry.castContext?.readied]), [["fireball", true, true]]);
  assert.deepEqual(caster.conditions.map((instance) => [instance.condition, instance.displayLabel, instance.parentEffectId]),
    [["Azione preparata", "Azione preparata · Palla di fuoco (3°)", "hold-1"]]);
  assert.equal(hasReadiedAction({ instances: caster.conditions }), true, "the card's menu sees the creature's readied action");
  // Another creature's turn keeps it; the caster's next turn ends the record, its pill and its concentration.
  const later = buildEffectsMutationPlan(held.states, [{ type: "effects:tick-boundaries", targetIds: ["caster", "goblin"],
    boundaries: [{ phase: "start", actorId: "goblin", turnKey: "2:goblin" }] }]);
  assert.equal(state(later, "caster").conditions.length, 1);
  const sameTurn = buildEffectsMutationPlan(later.states, [{ type: "effects:tick-boundaries", targetIds: ["caster"],
    boundaries: [{ phase: "start", actorId: "caster", turnKey: "2:caster" }] }]);
  assert.equal(state(sameTurn, "caster").conditions.length, 1, "the turn it was readied in does not count");
  const next = buildEffectsMutationPlan(sameTurn.states, [{ type: "effects:tick-boundaries", targetIds: ["caster", "goblin"],
    boundaries: [{ phase: "start", actorId: "caster", turnKey: "3:caster" }] }]);
  assert.deepEqual([state(next, "caster").spells, state(next, "caster").conditions, state(next, "caster").concentrations], [[], [], {}]);
});
