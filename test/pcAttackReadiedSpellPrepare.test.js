// A spell readied straight from the attack console (docs/STUDIO_AZIONI_DI_TURNO.md §9, after lot T6e): Preparare → Un
// incantesimo holds it in one command, without the spell panel, which asked nothing but the slot (P2): the hold, the slot,
// the other concentrations (P3, P4), the GM's pill for an enemy (P10); Counterspell asked in the console's reaction box (P9).
// The command itself: test/pcAttackExecutionIntegration.test.js; the console's row: test/pcAttackPopover.test.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
  buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}), Command: class {} } });

const { buildPcReadiedSpellMutation } = await import("../src/pcAttackTurnActionCore.js");
const { reactionPromptCandidates } = await import("../src/reactionPromptView.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");

const META = "com.thebigpicture.initiative/meta";
const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const wizard = (meta = {}) => ({ id: "maga", name: "Maga", metadata: { [META]: { attitude: "pc", conditions: { version: 2, instances: [] },
  initiativeCard: { characterBuild: [{ classId: "mago", level: 5 }] }, ...meta } } });
const ownTurn = { round: 2, order: ["maga", "goblin"], current: 0 };
const hold = (item = wizard(), extra = {}) => buildPcReadiedSpellMutation({ sourceItem: item, spellId: "fireball", slotLevel: 3, turnState: ownTurn,
  instanceId: "hold-1", attackInstanceId: "ready-1", ...extra });

test("the hold in one command: the panel's hold, the slot, the other concentrations; one History entry", () => {
  const plan = hold();
  assert.deepEqual(plan.operations.map((operation) => operation.type),
    ["concentration:break", "spell:upsert", "condition:add", "concentration:register", "condition:automate", "class-feature:adjust-resource"]);
  assert.deepEqual(plan.hold, { instanceId: "hold-1", spellId: "fireball", name: "Palla di fuoco", slotLevel: 3 });
  assert.equal(plan.spent, "slot di 3° livello");
  assert.deepEqual([plan.options.label, plan.options.history.label, plan.options.kind], ["Preparazione: Palla di fuoco", "Preparazione: Palla di fuoco", "spell"]);
  const causality = plan.options.history.payload.causality;
  assert.deepEqual([causality.eventType, causality.cause.spellId, causality.cause.slotLevel, causality.cost.label], ["prepare", "fireball", 3, "slot di 3° livello"]);
  // Applied: the record held on the caster, its pill, its concentration; Bless held before ends.
  const caster = { id: "maga", name: "Maga", spells: [], conditions: [],
    concentrations: { benedizione: { name: "Benedizione", instanceId: "bless-1", spellId: "bless", targets: [] } } };
  const applied = buildEffectsMutationPlan([caster], plan.operations.filter((operation) => operation.type !== "class-feature:adjust-resource")
    .map((operation, index) => ({ ...operation, operationId: `op-${index}`, createdAt: 100 + index,
      ...(operation.type === "condition:add" ? { instanceIds: { maga: "pill-1" } } : {}),
      ...(operation.type === "spell:upsert" ? { entryIds: { maga: "entry-1" } } : {}) })));
  const state = applied.states[0];
  assert.deepEqual(Object.values(state.concentrations).map((entry) => entry.instanceId), ["hold-1"], "Bless ended (P4)");
  assert.deepEqual(state.conditions.map((instance) => instance.displayLabel), ["Azione preparata · Palla di fuoco (3°)"]);
});

test("the cost: a cantrip spends nothing (P11), a slot left or not, an enemy's pill is the GM's (P10)", () => {
  const cantrip = hold(wizard(), { spellId: "fire-bolt", slotLevel: null });
  assert.deepEqual([cantrip.spent, cantrip.hold.slotLevel, cantrip.operations.some((operation) => operation.type === "class-feature:adjust-resource")],
    ["", undefined, false]);
  const spent = wizard({ classFeatureState: { resources: { "spell-slot-3": { current: 0 } } } });
  assert.throws(() => hold(spent), /Conferma la preparazione senza slot/u, "no slot left: the console asks first");
  const anyway = hold(spent, { castWithoutSlot: true });
  assert.deepEqual([anyway.spent, anyway.hold.slotLevel], ["", 3]);
  const enemy = hold(wizard({ attitude: "enemy" }));
  assert.deepEqual(enemy.operations.find((operation) => operation.type === "condition:add").options.mechanics, { gmOnly: true });
  assert.throws(() => hold(wizard(), { turnState: { ...ownTurn, current: 1 } }), /Solo nel turno della creatura/u);
  assert.throws(() => hold(wizard(), { spellId: "misty-step" }), /Si prepara solo un incantesimo da 1 azione/u);
});

test("Counterspell at the hold (P9): the console's spell-cast event names the readied spell, and the box offers the reaction", () => {
  const console = source("pc-attack.js");
  assert.ok(console.includes('return [{trigger:"spell-cast",casterId:presentation.item?.id || sourceId,spellId:row.spellId,spellName:row.label,'));
  assert.ok(console.includes('if(candidate.flow==="counterspell") return useHoldCounterspell(candidate);'));
  assert.ok(console.includes("await openCounterspellPopover({sourceId:candidate.reactorId,targetId:presentation?.item?.id || sourceId,spellId:row.spellId,"));
  assert.ok(console.includes('ignoreHint:()=>readyHoldPromptEvent()?"Prepara senza usarla vale come Ignora.":REACTION_PROMPT_CONSOLE_HINT'),
    "the hint names the console's button");
  // The same event, read by the reaction core: a PC who knows Counterspell, 12 m from the enemy caster who readies Fireball.
  const mage = { id: "mira", name: "Mira", layer: "CHARACTER", metadata: { [META]: { attitude: "pc", inInitiative: true, conditions: { version: 2, instances: [] },
    initiativeCard: { characterBuild: [{ classId: "mago", level: 5 }], spellbook: { spellIds: ["counterspell"] } } } } };
  const caster = { id: "orc", name: "Sciamano", layer: "CHARACTER", metadata: { [META]: { attitude: "enemy", inInitiative: true, conditions: { version: 2, instances: [] } } } };
  const event = [{ trigger: "spell-cast", casterId: "orc", spellId: "fireball", spellName: "Palla di fuoco", spellLevel: 3, spellTargetIds: [] }];
  const candidates = reactionPromptCandidates({ event, items: [caster, mage], state: { round: 2, order: ["orc", "mira"], current: 0 }, distance: () => 12 });
  assert.deepEqual(candidates.map((candidate) => [candidate.reactorId, candidate.flow]), [["mira", "counterspell"]]);
});

test("the hold's pill names «Incantesimo preparato», which agrees whatever the spell's name", async () => {
  const { getSpellDefinition } = await import("../src/spells-srd.js");
  const { getSpellCastPhasePlan } = await import("../src/spellCastPhaseCore.js");
  const pill = getSpellCastPhasePlan(getSpellDefinition("fireball"), "prepare", { readied: true, phase: "prepare", slotLevel: 3 }).effects[0];
  assert.match(pill.detail, /^Incantesimo preparato \(Palla di fuoco\): si rilascia con la reazione/u);
  assert.doesNotMatch(pill.detail, /Palla di fuoco preparato/u, "«Palla di fuoco» is feminine");
});

test("the tracker no longer opens the spell panel for a hold: the console's request goes back to its cast", () => {
  const tracker = source("initiativeList.js");
  assert.equal(tracker.includes("__openTrackerReadiedSpell"), false);
  assert.ok(tracker.includes("const result = await __runTrackerQuickAction(sourceEntry, action, { fromConsole: true });"));
  const console = source("pc-attack.js");
  assert.ok(console.includes("{type:\"launch\",requestId,sourceId,actionId:entry.actionId},{destination:\"LOCAL\"}"), "no phase sent any more");
  assert.ok(console.includes("const result=await runtime.executePcReadiedSpell({sourceId,spellId:row.spellId,slotLevel:slot.slotLevel ?? null,"));
});
