import test from "node:test";
import assert from "node:assert/strict";
import { reset, cleanup, items, meta, token, group, apply, sdk, history } from "../test-support/sharedHpHarness.js";
import { buildSpellUnifiedPanelContract, createSpellPanelSession, updateSpellPanelSession } from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { getAllSpellTargetItems } = await import("../src/spellUnifiedPanelSceneProvider.js");

test.beforeEach(() => reset([...group(), token("caster", { attitude: "pc", inInitiative: true })]));
test.after(cleanup);
function command(sharedHp, amounts = ["failed", "failed"]) {
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast" });
  const descriptor = contract.presentation.placement;
  const rule = getSpellAreaRuleById(descriptor.ruleId);
  return buildSpellAreaResolutionCommand({ contract, spellId: "fireball", casterId: "caster", slotLevel: 3,
    targetIds: ["hand", "head"], candidateTargetIds: ["hand", "head"], outcomes: { hand: amounts[0], head: amounts[1] },
    sharedHp, hp: { mode: "damage", amount: 28 }, targetLocked: true, validateSpatial: false,
    placement: { status: "confirmed", confirmed: true, ruleId: descriptor.ruleId, spellId: "fireball", casterId: "caster",
      targetLocked: true, targetIds: ["hand", "head"], preview: { type: rule.geometry.shape, start: { x: 0, y: 0 },
        end: { x: 150, y: 0 }, dpi: 150, targetIds: ["hand", "head"], targetLocked: true } } });
}
const runtime = () => ({ runEffectsMutation: apply,
  syncHPVisuals: async () => {}, syncHPBatchToMemory: async () => {},
  emitFireballVisual: async () => {}, emitMatchedSpellVisual: async () => {},
  getStaticZoneItems: async () => [], getBoardTokenItems: async () => [],
  getZeroHPConditionHistoryIds: async ids => ids, isCurrent: () => true,
  getHistoryEntries: history.getHistoryEntries,
});
test("spell sessions retain per-application shared HP choices", () => {
  const session = createSpellPanelSession({ spellId: "fireball", sharedHp: { policy: "per-token", chosenTargetIds: { auril: "hand" } } });
  assert.equal(session.sharedHp.policy, "per-token");
  assert.equal(updateSpellPanelSession(session, { hpValues: { damage: 28 } }).sharedHp.chosenTargetIds.auril, "hand");
  assert.equal(createSpellPanelSession({ spellId: "fireball" }).sharedHp.policy, "once");
  assert.equal(command(session.sharedHp).sharedHp.policy, "per-token");
});
test("spell target provider includes secondary tokens without adding them to initiative", async () => {
  const targets = await getAllSpellTargetItems(sdk, "fireball");
  assert.ok(targets.some(item => item.id === "hand"));
  assert.equal(meta("hand").inInitiative, undefined);
});
for (const [policy, hp] of [["once", 272], ["per-token", 244]]) test(`production area executor uses ${policy} policy for HP and Undo`, async () => {
  const input = command({ policy }); assert.equal(input.valid, true);
  const result = await executeSpellAreaResolution(input, runtime());
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.deepEqual(items.filter(item => item.id !== "caster").map(item => meta(item.id).hp), [hp, hp, hp, hp]);
  const entries = await history.getHistoryEntries();
  assert.ok(entries.some(entry => (entry.effectsMutation?.targetIds || entry.changes?.map(change => change.id) || []).includes("auril")));
});
test("discordant saves are rejected before any HP write until GM chooses an amount", async () => {
  const result = await executeSpellAreaResolution(command({ policy: "once" }, ["failed", "passed"]), runtime());
  assert.equal(result.status, "rejected"); assert.equal(meta("auril").hp, 300);
  const chosen = await executeSpellAreaResolution(command({ policy: "once", chosenTargetIds: { auril: "head" } }, ["failed", "passed"]), runtime());
  assert.equal(chosen.status, "applied", JSON.stringify(chosen.errors));
  assert.equal(meta("auril").hp, 286);
});

test("production boss attack aimed at a secondary damages the full group and remains undoable", async () => {
  const { readFile } = await import("node:fs/promises");
  const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
  const { createBossActionProfileStore } = await import("../src/bossActionProfileStore.js");
  const { createBossActionRuntime } = await import("../src/bossActionExecution.js");
  const profile = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
  const data = new Map();
  const store = createBossActionProfileStore({ storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
  store.put(profile);
  const boss = createBossActionRuntime({ api: sdk, store, postDamage: async () => [] });
  await boss.bindBossActionProfile("caster", profile);
  const action = profile.abilities.find(ability => ability.execution?.kind === "attack-damage" && ability.automation === "SUPPORTED");
  const result = await boss.executeBossAction({ sourceId: "caster", actionId: action.id, targetId: "hand",
    mode: "ranged", outcome: "hit", componentAmounts: { slashing: 18, cold: 7 } });
  assert.equal(result.status, "applied");
  assert.deepEqual(items.filter(item => item.id !== "caster").map(item => meta(item.id).hp), [275, 275, 275, 275]);
});

test("active area zero HP conditions follow the selected shared outcome", async () => {
  const { buildSpellActiveResolutionPayload, getSpellResolutionAction } = await import("../src/spellActiveResolutionCore.js");
  const { executeSpellActiveResolution } = await import("../src/spellApplicationExecutor.js");
  const { replaceItems } = await import("../test-support/sharedHpHarness.js");
  const key = "com.thebigpicture.initiative/meta";
  const spell = { id: "xanathar-arma-sacra", name: "Arma Sacra", level: 5 };
  const action = getSpellResolutionAction(spell.id, "holy-weapon-dismiss");
  replaceItems([...group(100).map(item => ({ ...item, metadata: { ...item.metadata,
    [key]: { ...item.metadata[key], attitude: "pc" } } })), token("caster", {
      ["com.thebigpicture.initiative/spells"]: [{ instanceId: "active-1", spellId: spell.id, casterId: "caster" }],
    })]);
  sdk.scene.grid = { getDpi: async () => 150, getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }) };
  sdk.scene.items.getItemBounds = async () => ({ min: { x: 0, y: 0 }, max: { x: 150, y: 150 }, center: { x: 75, y: 75 } });
  const payload = buildSpellActiveResolutionPayload({ spell, action,
    group: { instanceId: "active-1", casterId: "caster" }, sceneEpoch: 1 });
  await executeSpellActiveResolution({ payload, targetIds: ["hand", "head"], damageRoll: 150,
    placement: { type: "circle", start: { x: 75, y: 75 }, end: { x: 975, y: 75 }, gridOrigin: { x: 0, y: 0 }, dpi: 150 },
    outcomes: { hand: "failed", head: "passed" }, sharedHp: { policy: "once", chosenTargetIds: { auril: "head" } } });
  for (const id of ["auril", "body", "hand", "head"]) {
    assert.equal(meta(id).hp, 25);
    assert.ok(!(meta(id).conditions.instances || []).some(instance => ["Privo di sensi", "Prono"].includes(instance.condition)), id);
  }
});

for (const [policy, headOutcome, chosenTargetIds, expectedHP] of [
  ["once", "failed", {}, 280], ["per-token", "failed", {}, 273],
  ["once", "passed", { auril: "head" }, 284],
]) test(`Lightning Arrow separates its primary hit from shared area damage (${policy}, ${headOutcome})`, async () => {
  const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
  const { replaceItems } = await import("../test-support/sharedHpHarness.js");
  const spellId = "phb2014-freccia-folgorante";
  const parent = { instanceId: "arrow-1", spellId, casterId: "caster", name: "Freccia Folgorante" };
  replaceItems([...group(), token("caster", { ["com.thebigpicture.initiative/spells"]: [parent],
    ["com.thebigpicture.initiative/concentration"]: { [parent.instanceId]: parent } })]);
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "resolve" });
  const placement = { status: "confirmed", confirmed: true, targetLocked: true, ruleId: `${spellId}:cast`, spellId,
    casterId: "caster", targetIds: ["hand", "head"], anchorTargetId: "hand",
    preview: { type: "circle", start: { x: 75, y: 75 }, end: { x: 375, y: 75 }, dpi: 150,
      gridOrigin: { x: 0, y: 0 }, targetIds: ["hand", "head"], targetLocked: true, anchorTargetId: "hand", anchorOrigin: { x: 75, y: 75 } } };
  const sharedHp = { policy, chosenTargetIds };
  const outcomes = { hand: "failed", head: headOutcome };
  const session = createSpellPanelSession({ contract, phase: "resolve", casterId: "caster", slotLevel: 3,
    activeConcentration: parent, targetIds: ["hand", "head"], primaryTargetId: "hand", outcomes,
    hpValues: { primaryDamage: 13, damage: 7 }, placement, sharedHp });
  const view = buildUnifiedPanelViewModel({ contract, session, targetCandidates: items.filter(item => item.id !== "caster")
    .map(item => ({ key: item.id, label: item.name, hp: meta(item.id).hp, hpMax: meta(item.id).hpMax,
      sharedHpSourceId: meta(item.id).sharedHpSourceId })) });
  const preview = view.effects.preview.sharedHp;
  assert.deepEqual(preview.conflicts, []);
  assert.ok(preview.updates.every(update => update.hp === expectedHP), JSON.stringify(preview));
  assert.equal(preview.choiceGroups.length, headOutcome === "passed" && policy === "once" ? 1 : 0);
  const input = buildSpellAreaResolutionCommand({ contract, session, source: { kind: "prepared-resolution", parentInstanceId: parent.instanceId },
    casterId: "caster", parentInstanceId: parent.instanceId, targetIds: ["hand", "head"], candidateTargetIds: ["hand", "head"],
    primaryTargetId: "hand", outcomes, hp: { mode: "damage", amount: 7, primaryAmount: 13 }, placement,
    sharedHp, targetLocked: true, validateSpatial: false });
  assert.equal(input.valid, true, JSON.stringify(input.errors));
  const result = await executeSpellAreaResolution(input, runtime());
  assert.equal(result.status, "applied", JSON.stringify(result.errors));
  assert.equal(meta("auril").hp, expectedHP);
});
