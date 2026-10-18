import test from "node:test";
import assert from "node:assert/strict";
import { buildSharedHpPreview, sharedHpTargetItems, sharedHpCommittedUpdates } from "../src/sharedHpViewCore.js";
import { calculateQuickHPChange, createQuickHPVisualTransaction } from "../src/quickHpCore.js";
import * as sharedView from "../src/sharedHpViewCore.js";
const key = "com.thebigpicture.initiative/meta";
const items = ["auril", "hand", "head"].map((id, index) => ({ id, name: id, layer: "CHARACTER", type: "IMAGE",
  metadata: { [key]: { hp: 300, hpMax: 400, ...(index ? { sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true } : { inInitiative: true }) } } }));
const entries = (amounts = [28, 28]) => items.slice(1).map((item, index) => ({ item,
  change: calculateQuickHPChange({ mode: "damage", value: amounts[index], hp: 300, hpMax: 400 }), eventId: "effect" }));
test("manual effects include off-list group members, not attachment widgets", () => {
  const widget = { ...items[1], id: "widget", attachedTo: "hand" };
  assert.deepEqual(sharedHpTargetItems([...items, widget]).map(item => item.id), ["auril", "hand", "head"]);
});
test("one pure preview drives summary and optimistic values for the complete group", () => {
  const once = buildSharedHpPreview(items, entries(), {});
  assert.deepEqual(once.updates.map(update => update.hp), [272, 272, 272]);
  assert.equal(once.groups[0].requestedAmount, 28);
  const sum = buildSharedHpPreview(items, entries(), { policy: "per-token" });
  assert.deepEqual(sum.updates.map(update => update.hp), [244, 244, 244]);
  assert.equal(sum.groups[0].requestedAmount, 56);
});
test("discordant outcomes expose named options and require an explicit choice", () => {
  const preview = buildSharedHpPreview(items, entries([28, 0]), {});
  assert.equal(preview.conflicts[0].reason, "shared-hp-selection-required");
  assert.deepEqual(preview.choiceGroups[0].options.map(option => [option.targetId, option.amount]), [["hand", 28], ["head", 0]]);
  const chosen = buildSharedHpPreview(items, entries([28, 0]), { chosenTargetIds: { auril: "head" } });
  assert.deepEqual(chosen.updates.map(update => update.hp), [300, 300, 300]);
});
test("visual recovery includes all members and post-commit uses authoritative values", async () => {
  const preview = buildSharedHpPreview(items, entries(), {});
  const frames = [];
  const tx = createQuickHPVisualTransaction(preview.updates, { syncVisuals: updates => frames.push(updates) });
  await tx.recover(async ids => ids.map(tokenId => ({ tokenId, hp: 290, hpMax: 400 })));
  assert.equal(frames[1].length, 3); assert.ok(frames[1].every(update => update.hp === 290));
  const authoritative = sharedHpCommittedUpdates({ plan: { sharedHpGroups: [{ ...preview.groups[0], afterHP: 262 }] } }, entries());
  assert.deepEqual(authoritative.map(update => update.hp), [262, 262, 262]);
});

test("damage-based healing uses the pool damage once instead of multiplying secondary copies", () => {
  const once = buildSharedHpPreview(items, entries(), {});
  const effective = sharedView.sharedHpDamageEntries(entries(), once.groups);
  assert.deepEqual(effective.map(entry => entry.change.requested), [28]);
  const perToken = buildSharedHpPreview(items, entries(), { policy: "per-token" });
  assert.deepEqual(sharedView.sharedHpDamageEntries(entries(), perToken.groups).map(entry => entry.change.requested), [56]);
});
