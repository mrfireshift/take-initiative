// CAP-LINK of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md (first batch): links kept with an action or moved, and their ends
// on an event. The expectations below are read from the 2014 texts, not from the definitions under test.
import test from "node:test";
import assert from "node:assert/strict";

import { getAreaSaveAutomation, getSpellChoiceTiming, getSpellDefinition } from "../src/spells-srd.js";
import { buildSpellApplicationIntent, buildSpellApplicationPlan } from "../src/spellApplicationPlanCore.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { buildSpellActiveActionPlan } from "../src/spellActiveActionCore.js";
import { getSpellResolutionAction, spellActiveResolutionDamageFormula, validateSpellActiveResolutionAction } from "../src/spellActiveResolutionCore.js";
import { normalizeEffectSaveReminders } from "../src/effectSaveReminderCore.js";
import { buildEffectSaveReminderResolution } from "../src/reminderResolutionCore.js";
import { spellTurnPromptRequests } from "../src/callLightningTurnPromptCore.js";
import { spellOverviewGroups } from "../src/spellsPanelViewCore.js";

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";

function cast(spellId, { targetIds = ["target"], choice = "", slotLevel = null, turnKey = "1:0:caster" } = {}) {
  const spell = getSpellDefinition(spellId);
  const intent = buildSpellApplicationIntent({ spell, enteredName: spell.displayName, turns: spell.defaultTurns, casterId: "caster",
    targetIds, castContext: { choice, ...(slotLevel ? { slotLevel } : {}) }, selectedChoice: choice, requestedConcentration: spell.concentration === true });
  return buildSpellApplicationPlan({ intent, instanceId: `${spellId}-1`, appliedAt: { round: 1, turnKey }, casterName: "Caster" });
}
// The ids the runtime gives each operation before planning it (effectsMutations.js prepareOperation).
const prepared = (operations) => operations.map((operation, index) => ({ ...operation, operationId: `op-${index}`, createdAt: 100 + index,
  ...(operation.type === "condition:add" ? { instanceIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `${id}-c${index}`])) } : {}),
  ...(operation.type === "spell:upsert" ? { entryIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `${id}-s${index}`])) } : {}) }));
const ids = ["caster", "target", "other"];
const apply = (states, operations) => buildEffectsMutationPlan(states, prepared(operations));
const castOnField = (spellId, options) => apply(ids.map((id) => ({ id, spells: [], conditions: [], concentrations: {} })), cast(spellId, options).operations);
const stateOf = (plan, id) => plan.states.find((entry) => entry.id === id);
const items = (plan, hp = {}) => plan.states.map((state) => ({ id: state.id, name: state.id, layer: "CHARACTER",
  metadata: { [META]: { hp: hp[state.id] ?? 20, hpMax: 20, conditions: state.conditions, [SPELLS]: state.spells, [CONCENTRATION]: state.concentrations } } }));

test("Invisibility ends for the target whose pill is removed, and takes one more creature per slot above 2nd", () => {
  const plan = castOnField("invisibility", { targetIds: ["target", "other"] });
  for (const id of ["target", "other"]) {
    const [pill] = stateOf(plan, id).conditions;
    assert.deepEqual([pill.condition, pill.manualRemoval, pill.endsParentOnRemoval, pill.parentRemoval], ["Invisibile", true, true, "target"], id);
  }
  const removed = buildEffectsMutationPlan(plan.states, [{ type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: stateOf(plan, "target").conditions[0].id }] }]);
  assert.equal(stateOf(removed, "target").spells.length, 0);
  assert.equal(stateOf(removed, "other").conditions[0].condition, "Invisibile", "the other stays invisible");
  const limit = (slotLevel) => buildSpellUnifiedPanelContract({ spellId: "invisibility", castContext: { slotLevel } }).presentation.targeting.limit.maximum;
  assert.deepEqual([limit(2), limit(3), limit(5)], [1, 2, 4]);
});

test("Hunter's Mark lasts 1 hour, 8 hours from a 3rd-level slot, 24 hours from a 5th", () => {
  const spell = getSpellDefinition("hunters-mark");
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((slotLevel) => getSpellChoiceTiming(spell, "", { slotLevel }).defaultTurns),
    [600, 600, 4800, 4800, 14400, 14400]);
});

test("Witch Bolt: the action on the next turns deals 1d12 lightning to the linked creature, never more dice", () => {
  const action = getSpellResolutionAction("phb2014-dardo-stregato", "witch-bolt-repeat");
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
  assert.deepEqual([action.economy, action.availableAfterCast, action.requiredTargetEffectId, action.range.value], ["action", true, "witch-bolt-link", 9]);
  assert.equal(spellActiveResolutionDamageFormula({ action, slotLevel: 4 }).scaledFormula, "1d12");
  assert.equal(action.casterHealingFromAppliedDamage, undefined);
});

function choiceReminder(spellId, effectId) {
  const rule = getAreaSaveAutomation(spellId).failed.find((entry) => entry.effectId === effectId);
  const [reminder] = normalizeEffectSaveReminders(rule.saveReminder);
  return { reminder, resolution: buildEffectSaveReminderResolution({ item: { id: "target" },
    instance: { id: "pill", sourceId: "caster", parentEffectId: `${spellId}-1`, effectId, saveReminder: reminder }, reminder,
    activationId: "a1", turnKey: "2:0:caster" }) };
}

test("Crown of Madness asks the caster to spend its action at the start of each turn, or the spell ends", () => {
  const { reminder, resolution } = choiceReminder("phb2014-corona-di-follia", "crown-of-madness-commanded-attack");
  assert.deepEqual([reminder.timing, reminder.actor, reminder.mode], ["turn-start", "source", "choice"]);
  assert.deepEqual(resolution.choiceLabels, { passed: "Mantieni (azione)", failed: "Termina" });
  assert.equal(resolution.outcomes.passed.mode, "keep-effect");
  assert.equal(resolution.outcomes.failed.mode, "remove-effect");
  // The target's own save at the end of its turn stays on the charm.
  const charm = getAreaSaveAutomation("phb2014-corona-di-follia").failed.find((entry) => entry.condition === "Affascinato");
  assert.equal(charm.saveReminder.ability, "wis");
});

test("Compelled Duel asks at the end of the caster's turn whether it is still within 9 m", () => {
  const { reminder, resolution } = choiceReminder("phb2014-duello-obbligato", "compelled-duel-restrictions");
  assert.deepEqual([reminder.timing, reminder.actor], ["turn-end", "source"]);
  assert.deepEqual(resolution.choiceLabels, { passed: "Entro 9 m", failed: "Termina" });
  assert.equal(resolution.outcomes.failed.mode, "remove-effect");
});

test("Hex moves to a new creature with the ability chosen at cast; the old one leaves the concentration", () => {
  const plan = castOnField("phb2014-sortilegio", { choice: "forza" });
  assert.deepEqual(stateOf(plan, "target").conditions.map((entry) => entry.effectId), ["hex-forza"]);
  const group = spellOverviewGroups(items(plan, { target: 0 })).find((entry) => entry.spellId === "phb2014-sortilegio");
  const move = buildSpellActiveActionPlan({ spell: getSpellDefinition("phb2014-sortilegio"), actionId: "hex-move", group,
    selectedTargetIds: ["other"], appliedAt: { round: 2, turnKey: "2:0:caster" }, casterName: "Caster" });
  assert.equal(move.valid, true, move.errors.join(", "));
  const moved = apply(plan.states, move.operations);
  assert.deepEqual(stateOf(moved, "other").conditions.map((entry) => [entry.effectId, entry.expiry?.mode]), [["hex-forza", "concentration"]]);
  assert.equal(stateOf(moved, "other").spells.length, 1);
  assert.deepEqual(stateOf(moved, "target").conditions, []);
  assert.deepEqual(Object.values(stateOf(moved, "caster").concentrations)[0].targets, ["other"]);
  // Never on the caster, one creature at a time.
  assert.equal(buildSpellActiveActionPlan({ spell: getSpellDefinition("phb2014-sortilegio"), actionId: "hex-move", group,
    selectedTargetIds: ["caster"] }).valid, false);
});

test("Hunter's Mark moves too; the turn prompt offers it only once the marked creature is at 0 HP or gone", () => {
  const plan = castOnField("hunters-mark");
  const prompt = (hp, extra = []) => spellTurnPromptRequests({ items: [...items(plan, hp), ...extra].filter((item) => !extra.includes(item.id)),
    actorId: "caster", sceneEpoch: 1, turnKey: "2:0:caster" }).filter((request) => request.spellId === "hunters-mark");
  assert.deepEqual(prompt({}), [], "the marked creature still stands");
  const [request] = prompt({ target: 0 });
  assert.equal(request.kind, "choice");
  assert.equal(request.actions[0].actionId, "hunters-mark-move");
  assert.ok(request.candidateTargets.some((entry) => entry.id === "other"));
  // The marked token removed from the scene frees the mark as well.
  const gone = spellTurnPromptRequests({ items: items(plan).filter((item) => item.id !== "target"), actorId: "caster", sceneEpoch: 1, turnKey: "2:0:caster" })
    .filter((entry) => entry.spellId === "hunters-mark");
  assert.equal(gone.length, 1);
  const group = spellOverviewGroups(items(plan, { target: 0 })).find((entry) => entry.spellId === "hunters-mark");
  const moved = apply(plan.states, buildSpellActiveActionPlan({ spell: getSpellDefinition("hunters-mark"), actionId: "hunters-mark-move", group,
    selectedTargetIds: ["other"] }).operations);
  assert.deepEqual(stateOf(moved, "other").conditions.map((entry) => entry.effectId), ["weapon-damage-bonus"]);
});

test("Witch Bolt's action is offered at the start of the caster's next turns", () => {
  const plan = castOnField("phb2014-dardo-stregato");
  assert.deepEqual(stateOf(plan, "target").conditions.map((entry) => entry.effectId), ["witch-bolt-link"]);
  const requests = (turnKey) => spellTurnPromptRequests({ items: items(plan), actorId: "caster", sceneEpoch: 1, turnKey })
    .filter((request) => request.payload?.spellId === "phb2014-dardo-stregato" || request.spellId === "phb2014-dardo-stregato");
  assert.equal(requests("1:0:caster").length, 0, "not on the turn of the cast");
  const [request] = requests("2:0:caster");
  assert.equal(request.kind, "action");
  assert.equal(request.payload.actionId, "witch-bolt-repeat");
});

// Second batch: the links an event ends by itself.
import { planBoomingBladeMovementNotices } from "../src/compulsionMovementReminderCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";
import { buildPcAttackMutation, pcAttackLinkEnds } from "../src/pcAttackCore.js";
import { damageDefensesForItem } from "../src/damageDefensesCore.js";

const STATE = "com.thebigpicture.initiative/state";
const moved = (id) => [{ flags: { movement: true }, after: { item: { id } } }];

test("Booming Blade: the creature with the pill moves in its turn; the GM's damage ends the pill and the spell", () => {
  const pill = { id: "bb-pill", condition: "Movimento: danni tuono", active: true, effectId: "movement-triggered-thunder-damage",
    sourceId: "caster", parentEffectId: "bb-1", mechanics: { movementDamage: { dice: "2d8", type: "tuono" } } };
  const target = { id: "target", name: "Orco", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, conditions: [pill] } } };
  const initiativeState = { order: ["caster", "target"], current: 1, round: 2 };
  const notices = planBoomingBladeMovementNotices({ items: [target], changedRecords: moved("target"), initiativeState });
  assert.equal(notices.length, 1);
  assert.match(notices[0].instruction, /2d8 danni da tuono/u);
  assert.equal(notices[0].resolution.mode, "manual-damage");
  assert.deepEqual(planBoomingBladeMovementNotices({ items: [target], changedRecords: moved("target"),
    initiativeState: { ...initiativeState, current: 0 } }), [], "moved outside its own turn: no notice");
  const caster = { id: "caster", name: "Lama", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 20 } } };
  const plan = buildReminderResolutionPlan({ notice: notices[0], items: [caster, target], outcome: "confirmed", damageRoll: 9,
    sceneMetadata: { [STATE]: initiativeState } });
  assert.equal(plan.status, "ready");
  const hp = plan.operations.find((operation) => operation.type === "hp:set") || plan.metadataPatches?.find((patch) => patch.fields?.hp);
  assert.ok(hp, "the thunder damage is applied");
  assert.ok(plan.operations.some((operation) => operation.type === "condition:remove-instances"
    && operation.removals.some((removal) => removal.instanceId === "bb-pill")), "the pill goes, and the spell with it");
});

const creatureItem = (id, attitude, state) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER",
  metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, attitude, conditions: state?.conditions || [], [SPELLS]: state?.spells || [],
    [CONCENTRATION]: state?.concentrations || {}, initiativeCard: { quickActions: [{ id: "sword", label: "Spada", kind: "attack", range: "melee",
      components: [{ type: "slashing" }] }] } } } });

test("Invisibility ends when its bearer attacks, in the attack's command; Greater Invisibility goes on", () => {
  const field = castOnField("invisibility", { targetIds: ["target"] });
  const rogue = creatureItem("target", "pc", stateOf(field, "target"));
  const orc = creatureItem("other", "enemy");
  const ends = pcAttackLinkEnds({ sourceItem: rogue, targetItem: orc });
  assert.deepEqual(ends.map((end) => [end.itemId, end.spellId]), [["target", "invisibility"]]);
  const attack = buildPcAttackMutation({ action: rogue.metadata[META].initiativeCard.quickActions[0], sourceItem: rogue, targetItem: orc,
    outcome: "miss", attackInstanceId: "a1", expectedDefenses: damageDefensesForItem(orc, META) });
  assert.ok(attack.operations.some((operation) => operation.type === "condition:remove-instances"), "a miss ends it too");
  assert.equal(attack.causality.linkEnds[0].spellId, "invisibility");
  // An "Invisibile" pill of another spell is not touched.
  const greater = creatureItem("target", "pc", { conditions: [{ id: "gi", condition: "Invisibile", active: true, parentEffectId: "gi-1" }],
    spells: [{ instanceId: "gi-1", spellId: "greater-invisibility" }] });
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: greater, targetItem: orc }), []);
});

test("Compelled Duel ends when its caster attacks another creature, or an ally of the caster damages the duel's target", () => {
  const field = castOnField("phb2014-duello-obbligato", { targetIds: ["target"] });
  const paladin = creatureItem("caster", "pc", stateOf(field, "caster"));
  const dueled = creatureItem("target", "enemy", stateOf(field, "target"));
  const goblin = creatureItem("other", "enemy");
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: paladin, targetItem: dueled, linkItems: [goblin] }), [], "attacking the duel's target keeps it");
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: paladin, targetItem: goblin, linkItems: [dueled] }).map((end) => [end.itemId, end.spellId]),
    [["target", "phb2014-duello-obbligato"]]);
  const ranger = creatureItem("ranger", "pc");
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: ranger, targetItem: dueled, linkItems: [paladin], damaged: false }), [], "a miss of an ally keeps it");
  assert.equal(pcAttackLinkEnds({ sourceItem: ranger, targetItem: dueled, linkItems: [paladin], damaged: true }).length, 1);
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: goblin, targetItem: dueled, linkItems: [paladin], damaged: true }), [], "an enemy of the caster keeps it");
});
