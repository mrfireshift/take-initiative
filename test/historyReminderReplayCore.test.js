import assert from "node:assert/strict";
import test from "node:test";
import { HISTORY_UNDO_REMINDERS_MESSAGE, historyReminderReplayWithdrawal } from "../src/historyReminderReplayCore.js";

const undo = (activationIds) => ({ type: HISTORY_UNDO_REMINDERS_MESSAGE, activationIds });

test("each Undo closes the popups the previous one reopened, and keeps the ones it reopens", () => {
  let reopened = new Set();
  // Undo of B's save: B comes back.
  let step = historyReminderReplayWithdrawal(reopened, undo(["save-b"]));
  assert.deepEqual(step.withdraw, []);
  reopened = step.next;
  // Undo of a damage before it: B goes.
  step = historyReminderReplayWithdrawal(reopened, undo([]));
  assert.deepEqual(step.withdraw, ["save-b"]);
  reopened = step.next;
  // Undo of A's save: only A, nothing piles up.
  step = historyReminderReplayWithdrawal(reopened, undo(["save-a"]));
  assert.deepEqual(step.withdraw, []);
  step = historyReminderReplayWithdrawal(step.next, undo(["save-a", "save-z"]));
  assert.deepEqual(step.withdraw, []);
  assert.deepEqual([...step.next], ["save-a", "save-z"]);
});

test("any other message on the channel is not an Undo", () => {
  assert.equal(historyReminderReplayWithdrawal(new Set(["save-b"]), { type: "restore-reminder-activation" }), null);
});
