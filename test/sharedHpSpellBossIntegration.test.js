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
