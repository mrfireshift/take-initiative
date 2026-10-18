import test from "node:test";
import assert from "node:assert/strict";
import { reset, cleanup, apply, damage, group, items, meta, token, history, effects,
  replaceItems, setRole, failNextWrite } from "../test-support/sharedHpHarness.js";

test.beforeEach(() => reset());
test.after(cleanup);
test("production coordinator expands HP writes and metadata patches into all members", async () => {
  const result = await apply([damage("hand", 25)], { history: true });
  assert.equal(result.status, "applied");
  assert.deepEqual(items.map(item => meta(item.id).hp), [275, 275, 275, 275]);
  assert.equal(result.plan.sharedHpGroups[0].sourceId, "auril");
  assert.equal((await history.getHistoryEntries())[0].changes.length, 4);
  const patched = await apply([], { metadataPatches: [{ id: "head", fields: { hp: { value: 260 },
    hpMax: { value: 450 }, bossResource: { value: 2 } } }] });
  assert.equal(patched.status, "applied");
  assert.deepEqual(items.map(item => meta(item.id).hp), [260, 260, 260, 260]);
  assert.equal(meta("head").bossResource, 2);
  assert.ok(items.every(item => item.metadata.foreign === "keep"));
});

test("queued damage intents use live HP, duplicate command IDs do not apply twice", async () => {
  const [a, b] = await Promise.all([apply([damage("hand", 25)], { commandId: "a" }),
    apply([damage("head", 10)], { commandId: "b" })]);
  assert.equal(a.status, "applied"); assert.equal(b.status, "applied");
  assert.deepEqual(items.map(item => meta(item.id).hp), [265, 265, 265, 265]);
  await apply([damage("hand", 25)], { commandId: "a" });
  assert.equal(meta("auril").hp, 265);
  const stale = await apply([{ type: "hp:set", updates: [{ itemId: "hand", hp: 250, hpMax: 400,
    expectedHP: { present: true, value: 300 } }] }]);
  assert.equal(stale.status, "conflict");
});

test("zero HP reconciles all members but damage-ending conditions only affect true hits", async () => {
  const condition = id => ({ instanceId: id, id, condition: "Affascinato", active: true,
    expiry: { mode: "manual" }, endsOnDamage: true });
  replaceItems(group().map(item => ({ ...item, metadata: { ...item.metadata,
    "com.thebigpicture.initiative/meta": { ...meta(item.id), conditions: { instances: [condition(item.id)] } } } })));
  const plan = await effects.prepareEffectsMutation([damage("hand", 25)]);
  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.sharedHpGroups[0].hitIds, ["hand"]);
  const zero = await apply([damage("hand", 500)]);
  assert.equal(zero.status, "applied");
  assert.ok(items.every(item => meta(item.id).hp === 0));
});

test("Undo restores the captured group without touching members added afterwards", async () => {
  await apply([damage("hand", 25)], { history: true });
  const [entry] = await history.getHistoryEntries();
  replaceItems([...items, token("later", { hp: 275, sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true })]);
  const undo = await effects.undoEffectsMutation(entry, { transport: "background" });
  assert.equal(undo.status, "applied");
  assert.equal(meta("auril").hp, 300); assert.equal(meta("hand").hp, 300);
  assert.equal(meta("later").hp, 275);
});

test("link operations align canonical HP and unlink deletes only relationship fields", async () => {
  replaceItems([token("auril"), token("hand", { hp: 12, inInitiative: true })]);
  const linked = await apply([{ type: "shared-hp:link", sourceId: "auril", targetIds: ["hand"] }], { history: true });
  assert.equal(linked.status, "applied"); assert.equal(meta("hand").hp, 300);
  assert.equal(meta("hand").inInitiative, undefined);
  assert.equal(meta("hand").sharedHpSourceId, "auril");
  const unlinked = await apply([{ type: "shared-hp:unlink", targetIds: ["hand"] }]);
  assert.equal(unlinked.status, "applied"); assert.equal(meta("hand").hp, 300);
  assert.equal(meta("hand").sharedHpSourceId, undefined);
});

test("failed commits do not silently desynchronize the group", async () => {
  failNextWrite();
  const result = await apply([damage("hand", 25)]);
  assert.notEqual(result.status, "applied");
  assert.deepEqual(items.map(item => meta(item.id).hp), [300, 300, 300, 300]);
});

test("link management checks actual GM role", async () => {
  setRole("PLAYER");
  const result = await apply([{ type: "shared-hp:unlink", targetIds: ["hand"] }]);
  assert.equal(result.status, "rejected"); assert.equal(meta("hand").sharedHpSourceId, "auril");
});

test("linking reconciles automatic zero HP conditions and Undo restores the secondary", async () => {
  replaceItems([token("auril", { hp: 0, attitude: "pc" }), token("hand", { hp: 25, attitude: "pc" })]);
  const linked = await apply([{ type: "shared-hp:link", sourceId: "auril", targetIds: ["hand"] }], { history: true });
  assert.equal(linked.status, "applied");
  assert.equal(meta("hand").hp, 0);
  assert.ok(meta("hand").conditions.instances.some(instance => instance.condition === "Privo di sensi"));
  const [entry] = await history.getHistoryEntries();
  assert.equal((await effects.undoEffectsMutation(entry, { transport: "background" })).status, "applied");
  assert.equal(meta("hand").hp, 25);
  assert.equal(meta("hand").conditions?.instances?.length || 0, 0);
});

test("linking to a living source removes automatic unconsciousness", async () => {
  replaceItems([token("auril"), token("hand", { hp: 0, attitude: "pc" })]);
  await apply([{ type: "hp:set", updates: [{ itemId: "hand", hp: 0, hpMax: 400 }] }]);
  assert.ok(meta("hand").conditions.instances.some(instance => instance.condition === "Privo di sensi"));
  const linked = await apply([{ type: "shared-hp:link", sourceId: "auril", targetIds: ["hand"] }]);
  assert.equal(linked.status, "applied");
  assert.equal(meta("hand").hp, 300);
  assert.ok(!meta("hand").conditions.instances.some(instance => instance.condition === "Privo di sensi"));
});

test("link copies the principal faction while visibility is a separate GM-only setting", async () => {
  replaceItems([token("auril", { attitude: "ally" }), token("hand", { attitude: "enemy" })]);
  await apply([{ type: "shared-hp:link", sourceId: "auril", targetIds: ["hand"] }]);
  assert.equal(meta("hand").attitude, "ally");
  const result = await apply([{ type: "shared-hp:visibility", sourceId: "auril", visibility: "all" }]);
  assert.equal(result.status, "applied");
  assert.equal(meta("auril").sharedHpTrackerVisibility, "all");
  assert.equal(meta("hand").hp, 300);
  setRole("PLAYER");
  assert.equal((await apply([{ type: "shared-hp:visibility", sourceId: "auril", visibility: "gm" }])).status, "rejected");
});

test("faction reconciliation follows the current parent, preserves foreign metadata and becomes a no-op", async () => {
  const core = await import("../src/sharedHpCore.js");
  assert.equal(typeof core.planSharedHpFactions, "function");
  replaceItems(group().map(item => ({ ...item, metadata: { ...item.metadata,
    "com.thebigpicture.initiative/meta": { ...item.metadata["com.thebigpicture.initiative/meta"], attitude: item.id === "auril" ? "ally" : "enemy" } } })));
  const patches = core.planSharedHpFactions(items);
  assert.equal((await apply([], { metadataPatches: patches, history: false })).status, "applied");
  assert.ok(items.every(item => meta(item.id).attitude === "ally" && item.metadata.foreign === "keep"));
  assert.deepEqual(core.planSharedHpFactions(items), []);
});

test("linking an enemy secondary to a zero HP PC source reconciles the inherited PC faction", async () => {
  replaceItems([token("auril", { hp: 0, attitude: "pc" }), token("hand", { hp: 25, attitude: "enemy" })]);
  assert.equal((await apply([{ type: "shared-hp:link", sourceId: "auril", targetIds: ["hand"] }])).status, "applied");
  assert.equal(meta("hand").attitude, "pc");
  assert.ok(meta("hand").conditions.instances?.some(instance => instance.condition === "Privo di sensi"));
});
