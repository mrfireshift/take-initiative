import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import { resolveSharedHpGroup, planSharedHpLinks, planSharedHpMutation,
  sharedHpScopeIds, isSharedHpInitiativeExcluded } from "../src/sharedHpCore.js";

const key = `${ID}/meta`;
const token = (id, meta = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: {
  unrelated: { keep: true }, [key]: { hp: 300, hpMax: 400, conditions: {}, ...meta },
} });
const scene = (hp = 300) => [token("auril", { hp, inInitiative: true }),
  ...["hand", "body", "head"].map(id => token(id, { hp,
    sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true }))];
const set = (itemId, hp, extra = {}) => ({ itemId, hp, hpMax: 400, ...extra });
const intent = (itemId, amount, eventId = "area", mode = "damage") => set(itemId, 300 - amount,
  { hpIntent: { mode, amount, eventId } });
const plan = (items, updates, sharedHp) => planSharedHpMutation({ items,
  operations: [{ type: "hp:set", updates }], sharedHp });
const values = result => Object.fromEntries(result.metadataPatches
  .filter(p => p.fields.hp).map(p => [p.id, p.fields.hp.value]));

test("shared HP resolves all real members from every member without modifying input", () => {
  const items = scene(); const before = structuredClone(items);
  for (const item of items) {
    assert.deepEqual(resolveSharedHpGroup(items, item.id).memberIds, ["auril", "body", "hand", "head"]);
    assert.deepEqual(values(plan(items, [set(item.id, 275)])), { auril: 275, body: 275, hand: 275, head: 275 });
  }
  assert.deepEqual(sharedHpScopeIds(items, ["hand"]), ["auril", "body", "hand", "head"]);
  assert.deepEqual(items, before);
  assert.equal(isSharedHpInitiativeExcluded(items[1]), true);
  assert.equal(isSharedHpInitiativeExcluded(items[0]), false);
});

test("area policy counts each event once by default and sums raw amounts per token", () => {
  const updates = ["hand", "body", "head"].map(id => intent(id, 28));
  assert.deepEqual(Object.values(values(plan(scene(), updates))), [272, 272, 272, 272]);
  assert.deepEqual(Object.values(values(plan(scene(), updates, { policy: "per-token" }))), [216, 216, 216, 216]);
  const result = plan(scene(100), [intent("hand", 80), intent("head", 80)], { policy: "per-token" });
  assert.equal(result.groups[0].requestedAmount, 160);
  assert.deepEqual(Object.values(values(result)), [0, 0, 0, 0]);
});

test("discordant saves require an explicit target amount including zero", () => {
  const updates = [intent("hand", 28), intent("body", 14), intent("head", 0)];
  assert.equal(plan(scene(), updates).conflicts[0].reason, "shared-hp-selection-required");
  assert.deepEqual(Object.values(values(plan(scene(), updates, {
    policy: "once", chosenTargetIds: { auril: "body" },
  }))), [286, 286, 286, 286]);
  assert.deepEqual(Object.values(values(plan(scene(), updates, {
    policy: "once", chosenTargetIds: { auril: "head" },
  }))), [300, 300, 300, 300]);
});

test("distinct attacks accumulate against live source HP and healing is not multiplied", () => {
  assert.deepEqual(Object.values(values(plan(scene(275), [intent("hand", 25, "a"), intent("head", 10, "b")]))),
    [240, 240, 240, 240]);
  assert.deepEqual(Object.values(values(plan(scene(275), [intent("hand", 10, "heal", "heal"),
    intent("head", 10, "heal", "heal")], { policy: "per-token" }))), [285, 285, 285, 285]);
  assert.deepEqual(Object.values(values(plan(scene(395), [intent("hand", 10, "heal", "heal")]))), [400, 400, 400, 400]);
  assert.deepEqual(Object.values(values(plan(scene(405), [intent("hand", 10, "temp", "temp")]))), [410, 410, 410, 410]);
});

test("absolute conflicts, stale expectations and invalid intentions never choose a last writer", () => {
  assert.equal(plan(scene(), [set("hand", 275), set("head", 280)]).status, "conflict");
  assert.equal(plan(scene(275), [set("hand", 270, { expectedHP: { present: true, value: 300 } })]).status, "conflict");
  assert.equal(plan(scene(), [intent("hand", -2)]).status, "conflict");
  const result = planSharedHpMutation({ items: scene(), operations: [], metadataPatches: [
    { id: "hand", fields: { hp: { value: 290 }, hpMax: { value: 450 }, bossResource: { value: 2 } } },
  ] });
  assert.deepEqual(Object.values(values(result)), [290, 290, 290, 290]);
  assert.equal(result.metadataPatches.find(p => p.id === "hand").fields.bossResource.value, 2);
  assert.equal(result.metadataPatches.find(p => p.id === "auril").fields.hpMax.value, 450);
});

test("link aligns values, excludes initiative, preserves metadata, unlink retains HP", () => {
  const items = [token("auril"), token("hand", { hp: 12, inInitiative: true })];
  const before = structuredClone(items);
  const linked = planSharedHpLinks(items, { type: "shared-hp:link", sourceId: "auril", targetIds: ["hand"] });
  const fields = linked.metadataPatches.find(p => p.id === "hand").fields;
  assert.equal(fields.hp.value, 300);
  assert.equal(fields.sharedHpSourceId.value, "auril");
  assert.equal(fields.sharedHpExcludeFromInitiative.value, true);
  assert.equal(fields.inInitiative.mode, "delete");
  assert.equal(fields.conditions, undefined);
  const unlinked = planSharedHpLinks(scene(), { type: "shared-hp:unlink", targetIds: ["hand"] });
  assert.deepEqual(Object.keys(unlinked.metadataPatches[0].fields).sort(), ["sharedHpExcludeFromInitiative", "sharedHpSourceId"]);
  assert.equal(unlinked.metadataPatches[0].fields.sharedHpSourceId.mode, "delete");
  assert.deepEqual(items, before);
});

test("broken links and invalid topology are rejected but orphan unlink is possible", () => {
  assert.equal(resolveSharedHpGroup(scene().slice(1), "hand").conflicts[0].reason, "shared-hp-broken-link");
  assert.equal(planSharedHpLinks(scene().slice(1), { type: "shared-hp:unlink", targetIds: ["hand"] }).status, undefined);
  for (const [items, sourceId, targetIds] of [
    [scene(), "auril", ["auril"]], [scene(), "hand", ["head"]],
    [scene(), "head", ["auril"]], [scene(), "missing", ["head"]],
    [[token("auril", { hpMax: 0 }), token("hand")], "auril", ["hand"]],
    [[token("auril"), { ...token("hand"), attachedTo: "auril" }], "auril", ["hand"]],
    [[token("auril"), token("__LAIR__")], "auril", ["__LAIR__"]],
  ]) assert.equal(planSharedHpLinks(items, { type: "shared-hp:link", sourceId, targetIds }).status, "conflict");
});

test("unlinked tokens keep legacy operations and arbitrary non-HP patches", () => {
  const operations = [{ type: "hp:set", updates: [set("other", 250)] }, { type: "condition:add", name: "prone" }];
  const patches = [{ id: "other", fields: { initiative: { value: 15 } } }];
  const result = planSharedHpMutation({ items: [token("other")], operations, metadataPatches: patches });
  assert.deepEqual(result.operations, operations);
  assert.deepEqual(result.metadataPatches, patches);
  assert.deepEqual(result.groups, []);
});

test("merged spell patches retain distinct hit intentions rather than overwriting damage", () => {
  const result = planSharedHpMutation({ items: scene(), operations: [], metadataPatches: [
    { id: "hand", fields: { hp: { value: 265 }, hpMax: { value: 400 } }, hpIntents: [
      { mode: "damage", amount: 25, eventId: "ray-1" }, { mode: "damage", amount: 10, eventId: "ray-2" },
    ] }, { id: "head", fields: { hp: { value: 280 }, hpMax: { value: 400 } },
      hpIntent: { mode: "damage", amount: 20, eventId: "ray-3" } },
  ] });
  assert.deepEqual(Object.values(values(result)), [245, 245, 245, 245]);
});
