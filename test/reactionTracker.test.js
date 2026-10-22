import test from "node:test";
import assert from "node:assert/strict";

import {
  NEXT_OWN_TURN_START_EXPIRY,
  READIED_ACTION_CONDITION,
  REACTION_USED_CONDITION,
  conditionInstancesNamed,
  hasReactionUsed,
  hasReadiedAction,
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
