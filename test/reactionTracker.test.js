import test from "node:test";
import assert from "node:assert/strict";

import {
  NEXT_OWN_TURN_START_EXPIRY,
  READIED_ACTION_CONDITION,
  REACTION_USED_CONDITION,
  conditionInstancesNamed,
  hasReactionUsed,
  hasReadiedAction,
  initiativeTurnCreatureId,
  isOffTurn,
  isReactionClassFeature,
  planReactionSpend,
  reactionAppliedAt,
  reactionConditionOptions,
  reactionTargetId,
} from "../src/reactionTrackerCore.js";
import {
  buildInitiativeCardContextMenuPayload,
  routeInitiativeCardContextMenuAction,
} from "../src/initiativeMenuActionsCore.js";
import { isAllowedInitiativeCardMenuAction } from "../src/menuPopoverProtocolCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

test("the card reads the reaction and the readied action from its active condition instances", () => {
  const conditions = {
    instances: [
      { id: "r1", condition: "Reazione usata" },
      { id: "x", condition: "Prono" },
      { id: "p0", condition: "azione preparata", active: false },
    ],
  };
  assert.equal(hasReactionUsed(conditions), true);
  assert.equal(hasReadiedAction(conditions), false, "an inactive instance does not count");
  assert.deepEqual(conditionInstancesNamed(conditions, REACTION_USED_CONDITION).map((instance) => instance.id), ["r1"]);
  assert.equal(hasReactionUsed(null), false);
});

test("a Paragon turn targets its base token", () => {
  assert.equal(reactionTargetId({ id: "boss::p2", __paragonBaseId: "boss" }), "boss");
  assert.equal(reactionTargetId({ id: "boss::p1" }), "boss");
  assert.equal(reactionTargetId({ id: "aria" }), "aria");
  assert.equal(reactionTargetId(null), null);
});

test("both conditions end at the start of the creature's next turn, counted from the current turn", () => {
  const state = { order: ["aria", "goblin"], current: 1, round: 3 };
  assert.deepEqual(reactionAppliedAt(state), { round: 3, actorId: "goblin", phase: "turn", turnKey: "3:1:goblin" });
  assert.deepEqual(reactionConditionOptions(state).expiry, { mode: "turn-start", actor: "target", remaining: 1 });
  assert.deepEqual(reactionAppliedAt(null), { round: 1, phase: "turn" });
  assert.equal(Object.isFrozen(NEXT_OWN_TURN_START_EXPIRY), true);
});

const aria = (conditions = []) => ({ id: "aria", name: "Aria", spells: [], concentrations: {}, conditions });
const stateOf = (plan) => plan.states.find((state) => state.id === "aria");
const tick = (state, actorId, turnKey) => stateOf(buildEffectsMutationPlan([state], [{
  type: "condition:tick-boundaries",
  targetIds: ["aria"],
  boundaries: [{ phase: "start", actorId, turnKey }],
}]));

test("the reaction comes back at the start of its own turn, not at another creature's", () => {
  const state = { order: ["goblin", "aria"], current: 0, round: 1 };
  let current = stateOf(buildEffectsMutationPlan([aria()], [{
    type: "condition:add",
    targetIds: ["aria"],
    conditionName: REACTION_USED_CONDITION,
    instanceIds: { aria: "reaction-1" },
    options: reactionConditionOptions(state),
  }]));
  assert.equal(current.conditions.length, 1);
  assert.deepEqual(current.conditions[0].expiry, { mode: "turn-start", remaining: 1, actor: "target", actorId: "aria" });

  // The goblin's next turn starts: the reaction is still used.
  current = tick(current, "goblin", "2:0:goblin");
  assert.equal(hasReactionUsed({ instances: current.conditions }), true);
  // Aria's turn starts: the reaction is back.
  current = tick(current, "aria", "1:1:aria");
  assert.equal(hasReactionUsed({ instances: current.conditions }), false);
});

test("the card menu offers the readied action to one creature and routes toggle and trigger", async () => {
  const goblin = { id: "goblin", name: "Goblin", attitude: "enemy", conditions: { instances: [{ id: "p1", condition: READIED_ACTION_CONDITION }] } };
  const payload = buildInitiativeCardContextMenuPayload({ sourceEntry: goblin, scopeIds: ["goblin"] });
  assert.equal(payload.showReadiedActionMenu, true);
  assert.equal(payload.hasReadiedAction, true);
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: goblin, scopeIds: ["goblin", "goblin-2"] }).showReadiedActionMenu, undefined);
  assert.equal(isAllowedInitiativeCardMenuAction("readied-action"), true);
  assert.equal(isAllowedInitiativeCardMenuAction("readied-action-trigger"), true);

  const calls = [];
  const handlers = {
    toggleReadiedAction: async (entry) => calls.push(["toggle", entry.id]),
    triggerReadiedAction: async (entry) => calls.push(["trigger", entry.id]),
  };
  const context = { sourceEntry: goblin, scopeIds: ["goblin"] };
  assert.equal(await routeInitiativeCardContextMenuAction(context, { action: "readied-action" }, handlers), true);
  assert.equal(await routeInitiativeCardContextMenuAction(context, { action: "readied-action-trigger" }, handlers), true);
  assert.deepEqual(calls, [["toggle", "goblin"], ["trigger", "goblin"]]);
});

test("an action taken with a reaction marks it in combat, once, and never out of combat", () => {
  const state = { order: ["mira", "goblin"], current: 1, round: 3 };
  const plan = planReactionSpend({ casterId: "mira", casterName: "Mira", conditions: { instances: [] }, initiativeState: state });
  assert.deepEqual([plan.applies, plan.alreadyUsed], [true, false]);
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["condition:add", "condition:automate"]);
  assert.equal(plan.operations[0].conditionName, REACTION_USED_CONDITION);
  assert.deepEqual(plan.operations[0].options.expiry, NEXT_OWN_TURN_START_EXPIRY);
  const again = planReactionSpend({ casterId: "mira", casterName: "Mira", initiativeState: state,
    conditions: { instances: [{ id: "r1", condition: "Reazione usata" }] } });
  assert.deepEqual([again.alreadyUsed, again.operations, again.message], [true, [], "Mira ha già usato la reazione in questo round."]);
  assert.equal(planReactionSpend({ casterId: "mira", initiativeState: { order: [] } }).applies, false, "no initiative order");
  assert.equal(planReactionSpend({ applies: false, casterId: "mira", initiativeState: state }).applies, false);
  assert.equal(isReactionClassFeature({ activation: { primary: "reazione" } }), true);
  assert.equal(isReactionClassFeature({ activation: { primary: "azione_bonus" } }), false);
  assert.equal(isReactionClassFeature(null), false);
});

test("off turn: another creature's turn, a Paragon's extra turn of someone else, the Lair, an Epic Action; never out of combat", () => {
  const at = (current) => ({ order: ["mira", "auril::p1", "__LAIR__", "__EPIC__::auril::after::mira", "goblin"], current, round: 2 });
  assert.equal(initiativeTurnCreatureId(at(0)), "mira");
  assert.equal(initiativeTurnCreatureId(at(1)), "auril", "a Paragon's extra turn is its creature's");
  assert.equal(initiativeTurnCreatureId(at(2)), "");
  assert.equal(initiativeTurnCreatureId(at(3)), "");
  assert.deepEqual([0, 1, 2, 3, 4].map((current) => isOffTurn(at(current), "mira")), [false, true, true, true, true]);
  assert.equal(isOffTurn(at(1), "auril"), false);
  assert.equal(isOffTurn({ order: [], current: 0 }, "mira"), false, "no initiative: no turn to be off");
  assert.equal(isOffTurn(at(4), ""), false);
});
