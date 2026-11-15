// The losses of a readied spell (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6e, decisions P4, P8): the hold is a true
// concentration, so the roads that end one end it (a failed save, 0 HP, Incapacitated, another concentration, the start
// of the caster's next turn, a Paragon's too), its slot still spent; wherever the concentration is named it says
// «(azione preparata)», and the log tells a hold that vanished from one released.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getSpellDefinition } from "../src/spells-srd.js";
import { buildSpellApplicationIntent, buildSpellApplicationPlan } from "../src/spellApplicationPlanCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { READIED_HOLD_TAG, isReadiedHoldEntry, readiedHoldName } from "../src/reactionTrackerCore.js";
import { buildConcentrationSaveWarning } from "../src/concentrationSaveReminderCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const held = { readied: true, phase: "prepare", slotLevel: 3 };
// The hold's command, as the panel's lifecycle sends it (lot T6b), with the ids the coordinator gives.
function holdOperations(spellId = "fireball", { casterId = "caster", turnKey = "2:1:caster" } = {}) {
  const intent = buildSpellApplicationIntent({ spell: getSpellDefinition(spellId), enteredName: spellId, turns: 1, casterId,
    targetIds: [casterId], castContext: held });
  const plan = buildSpellApplicationPlan({ intent, instanceId: "hold-1", appliedAt: { round: 2, actorId: casterId, phase: "turn", turnKey },
    casterName: "Maga" });
  return plan.operations.map((operation, index) => ({ ...operation, operationId: `op-${index}`, createdAt: 100 + index,
    ...(operation.type === "condition:add" ? { instanceIds: { [casterId]: `pill-${index}` } } : {}),
    ...(operation.type === "spell:upsert" ? { entryIds: { [casterId]: `entry-${index}` } } : {}) }));
}
const token = (id) => ({ id, name: id, spells: [], concentrations: {}, conditions: [] });
const holding = (casterId = "caster", turnKey) => buildEffectsMutationPlan([token(casterId), token("goblin")], holdOperations("fireball", { casterId, turnKey }));
const stateOf = (plan, id) => plan.states.find((entry) => entry.id === id);
const holdLeft = (plan, id = "caster") => {
  const caster = stateOf(plan, id);
  return [caster.spells.length, caster.conditions.filter((instance) => instance.active !== false).length, Object.keys(caster.concentrations).length];
};

test("wherever the hold's concentration is named it says «(azione preparata)», whatever the spell's gender", () => {
  const entry = { name: "Dardo di fuoco", castContext: held };
  assert.equal(readiedHoldName("Dardo di fuoco", entry), "Dardo di fuoco (azione preparata)");
  assert.equal(readiedHoldName("Benedizione", { castContext: { slotLevel: 1 } }), "Benedizione", "a cast");
  assert.equal(isReadiedHoldEntry({ castContext: { readied: true, phase: "cast" } }), false, "a released spell is no hold");
  assert.equal(READIED_HOLD_TAG, "azione preparata");
  const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  assert.ok(source("spells.js").includes("marker.title = `Concentrazione: ${readiedHoldName(displayName, spell)}`;"), "the card's C");
  assert.ok(source("pc-attack.js").includes("readiedHoldName(String(entry?.name || entry?.spellId || key).trim(),entry)"), "the console's line");
  assert.ok(source("spell-unified-panel.js").includes("name: readiedHoldName(displayName, info),"), "the panel's confirmation");
});

test("the concentration save's warning names the hold; failed, it ends the hold, the slot still spent", () => {
  const caster = stateOf(holding(), "caster");
  const warning = buildConcentrationSaveWarning({ casterId: "caster", casterName: "Maga", concentration: caster.concentrations, damage: 14 });
  assert.equal(warning.spellName, "Palla di fuoco (azione preparata)");
  assert.equal(warning.dc, 10);
  const [action] = warning.notice.resolution.outcomes.failed.actions;
  assert.deepEqual([action.kind, action.action, action.reference], ["concentration", "break", "hold-1"]);
  // As reminderResolutionCore.js turns the failed outcome into the command.
  const failed = buildEffectsMutationPlan(holding().states, [{ type: "concentration:break", casterIds: ["caster"], reference: "hold-1" }]);
  assert.deepEqual(holdLeft(failed), [0, 0, 0]);
});

test("Incapacitated ends the hold: the condition's automation breaks every concentration", () => {
  for (const condition of ["Incapacitato", "Stordito"]) {
    const plan = buildEffectsMutationPlan(holding().states, [
      { type: "condition:add", targetIds: ["caster"], conditionName: condition, instanceIds: { caster: "stun-1" }, operationId: "c1", createdAt: 200 },
      { type: "condition:automate", subjectIds: ["caster"] },
    ]);
    const caster = stateOf(plan, "caster");
    assert.deepEqual([caster.spells.length, Object.keys(caster.concentrations).length], [0, 0], condition);
    assert.equal(caster.conditions.some((instance) => instance.condition === "Azione preparata"), false, condition);
  }
});

test("another concentration ends the hold, as any concentration: the new one stays", () => {
  const intent = buildSpellApplicationIntent({ spell: getSpellDefinition("bless"), enteredName: "bless", turns: 10, casterId: "caster",
    targetIds: ["goblin"], castContext: { slotLevel: 1 } });
  const plan = buildSpellApplicationPlan({ intent, instanceId: "bless-1", appliedAt: { round: 2, actorId: "caster", phase: "turn", turnKey: "2:1:caster" },
    casterName: "Maga" });
  const cast = buildEffectsMutationPlan(holding().states, plan.operations.map((operation, index) => ({ ...operation, operationId: `b-${index}`,
    createdAt: 300 + index, ...(operation.type === "condition:add" ? { instanceIds: { goblin: `bless-pill-${index}` } } : {}),
    ...(operation.type === "spell:upsert" ? { entryIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `bless-${id}`])) } : {}) })));
  const caster = stateOf(cast, "caster");
  assert.deepEqual(Object.values(caster.concentrations).map((entry) => entry.instanceId), ["bless-1"]);
  assert.equal(caster.conditions.some((instance) => instance.condition === "Azione preparata"), false);
  assert.equal(caster.spells.some((entry) => entry.instanceId === "hold-1"), false);
});

test("the start of the caster's next turn ends the hold; a Paragon's next turn too, never another creature's", () => {
  const tick = (plan, boundaries) => buildEffectsMutationPlan(plan.states, [{ type: "effects:tick-boundaries", targetIds: ["boss", "goblin"], boundaries }]);
  // A Paragon readies on its first turn: its second turn of the round (boss::p2) is its next turn.
  const hold = holding("boss", "2:1:boss");
  assert.deepEqual(holdLeft(tick(hold, [{ phase: "start", actorId: "goblin", turnKey: "2:2:goblin" }]), "boss"), [1, 1, 1], "another creature's turn");
  assert.deepEqual(holdLeft(tick(hold, [{ phase: "start", actorId: "boss", turnKey: "2:1:boss" }]), "boss"), [1, 1, 1], "the turn it was readied in");
  assert.deepEqual(holdLeft(tick(hold, [{ phase: "start", actorId: "boss", turnKey: "2:3:boss::p2" }]), "boss"), [0, 0, 0],
    "the tracker's boundary names the base id (__conditionActorId): the Paragon's next turn ends it");
});

test("the log tells a hold that vanished from one released, in the summary and the details", () => {
  const hold = { name: "Palla di fuoco", instanceId: "hold-1", spellId: "fireball", castContext: held };
  const event = (overrides) => ({ id: "e", sequence: 1, at: 1, round: 2, kind: "spell", category: "spell", source: "automatic",
    turn: { id: "goblin", name: "Goblin" }, targets: [], payload: {},
    facets: { spells: { targets: [{ name: "Maga", added: [], removed: [hold], updated: [] }] },
      concentrations: { targets: [{ name: "Maga", added: [], removed: [{ ...hold, key: "palla di fuoco" }], updated: [] }] } }, ...overrides });
  const lines = (overrides) => buildCombatLogPresentation(null, [event(overrides)]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines({ label: "Concentrazione interrotta" }).includes("Maga: − Palla di fuoco (azione preparata, svanita)"));
  assert.ok(lines({ label: "Rilascio · Palla di fuoco" }).includes("Maga: − Palla di fuoco (azione preparata, rilasciata)"));
  assert.ok(lines({ label: "Rilascio: Benedizione" }).includes("Maga: − Palla di fuoco (azione preparata, rilasciata)"));
  assert.ok(lines({ label: "Aria: Raggio rovente", payload: { causality: { readiedRelease: { instanceId: "hold-1" } } } })
    .includes("Maga: − Palla di fuoco (azione preparata, rilasciata)"), "the console's release");
  const prepared = buildCombatLogPresentation(null, [event({ label: "Preparazione: Palla di fuoco",
    facets: { spells: { targets: [{ name: "Maga", added: [hold], removed: [], updated: [] }] } } })]).events[0];
  assert.ok(prepared.details.flatMap((section) => section.lines).includes("Maga: + Palla di fuoco (azione preparata)"));
});
