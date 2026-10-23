// The spells cast with a reaction spend the caster's reaction (spellReactionCore.js), with their slot.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const sceneItems = new Map();
let sceneMetadata = {};
const executorCalls = [];

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      player: { getSelection: async () => [] },
      scene: {
        getMetadata: async () => clone(sceneMetadata),
        items: {
          getItems: async (ids) => (Array.isArray(ids) ? ids.map((id) => sceneItems.get(id)).filter(Boolean) : [...sceneItems.values()])
            .map(clone),
        },
      },
    },
  },
});
mock.module("../src/conditionApplicationExecutor.js", { exports: { executeConditionApplication: async () => [] } });
mock.module("../src/spellApplicationExecutor.js", {
  exports: {
    executeSpellApplication: async (input) => {
      executorCalls.push(input);
      return { status: "applied", changedIds: [input.casterId] };
    },
    getCurrentSpellAppliedAt: async () => ({ round: 2, actorId: "orc", phase: "turn", turnKey: "2:1:orc" }),
  },
});
mock.module("../src/spellUnifiedPanelSceneProvider.js", {
  exports: {
    getSpellAreaSpatialValidation: async () => ({}),
    validateSpellAreaSceneSpatial: async () => ({ valid: true, errors: [] }),
  },
});

const { REACTION_SPELL_IDS, isReactionSpell, planSpellReactionSpend } = await import("../src/spellReactionCore.js");
const { executeDirectQuickAction } = await import("../src/quickActionExecution.js?spell-reaction");

const inCombat = { [STATE_KEY]: { round: 2, order: ["wizard", "orc"], current: 1 } };
const used = { version: 2, instances: [{ id: "r1", condition: "Reazione usata", active: true }] };
const wizard = (conditions = { version: 2, instances: [] }) => ({
  id: "wizard", name: "Ilse", layer: "CHARACTER", metadata: { [META_KEY]: { inInitiative: true, conditions } },
});

test("the reaction spells are the catalog's spells cast with a reaction", () => {
  const ids = new Set();
  for (const file of readdirSync("src").filter((name) => name.endsWith(".json"))) {
    let data;
    try { data = JSON.parse(readFileSync(`src/${file}`, "utf8")); } catch { continue; }
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      if (value.id && typeof value.castingTime === "string" && /reazion|reaction/iu.test(value.castingTime)) ids.add(value.id);
      Object.values(value).forEach(walk);
    };
    walk(data);
  }
  assert.deepEqual([...ids].sort(), [...REACTION_SPELL_IDS].sort());
  assert.equal(isReactionSpell("shield"), true);
  assert.equal(isReactionSpell("fireball"), false);
});

test("in combat, a reaction spell spends the caster's reaction until the start of its next turn", () => {
  const plan = planSpellReactionSpend({ spellId: "shield", caster: wizard(), initiativeState: inCombat[STATE_KEY] });
  assert.equal(plan.applies, true);
  assert.equal(plan.alreadyUsed, false);
  const [add, automate] = plan.operations;
  assert.deepEqual([add.type, add.targetIds, add.conditionName], ["condition:add", ["wizard"], "Reazione usata"]);
  assert.deepEqual(add.options.expiry, { mode: "turn-start", actor: "target", remaining: 1 });
  assert.equal(add.options.appliedAt.actorId, "orc", "counted from the turn it is cast in");
  assert.deepEqual(automate, { type: "condition:automate", subjectIds: ["wizard"] });
});

test("out of combat, or for a spell cast otherwise, nothing is spent; a used reaction asks first", () => {
  assert.deepEqual(planSpellReactionSpend({ spellId: "shield", caster: wizard(), initiativeState: null }).operations, []);
  assert.equal(planSpellReactionSpend({ spellId: "fireball", caster: wizard(), initiativeState: inCombat[STATE_KEY] }).applies, false);
  const again = planSpellReactionSpend({ spellId: "counterspell", caster: wizard(used), initiativeState: inCombat[STATE_KEY] });
  assert.equal(again.alreadyUsed, true);
  assert.deepEqual(again.operations, []);
  assert.match(again.message, /Ilse ha già usato la reazione/u);
});

const counterspell = { id: "quick-counterspell", label: "Controincantesimo", kind: "spell", spellId: "counterspell",
  targetMode: "self", slotLevel: 3, launchMode: "auto" };

test("a quick action casting Counterspell spends the reaction in the cast's own command", async () => {
  sceneItems.clear();
  sceneItems.set("wizard", wizard());
  sceneMetadata = inCombat;
  executorCalls.length = 0;
  const result = await executeDirectQuickAction({ action: counterspell, sourceItem: sceneItems.get("wizard") });
  assert.equal(result.mode, "executed", JSON.stringify(result));
  const operations = executorCalls[0].extraOperations;
  assert.ok(operations.some((operation) => operation.type === "condition:add" && operation.conditionName === "Reazione usata"));
});

test("with the reaction already used, the quick action asks; declining cancels the cast", async () => {
  sceneItems.clear();
  sceneItems.set("wizard", wizard(used));
  sceneMetadata = inCombat;
  executorCalls.length = 0;
  const asked = [];
  const cancelled = await executeDirectQuickAction({ action: counterspell, sourceItem: sceneItems.get("wizard"),
    confirmSpellSlot: async (message) => { asked.push(message); return false; } });
  assert.equal(cancelled.mode, "cancelled");
  assert.equal(cancelled.reason, "spell-reaction-cancelled");
  assert.match(asked[0], /già usato la reazione/u);
  assert.equal(executorCalls.length, 0);
  const cast = await executeDirectQuickAction({ action: counterspell, sourceItem: sceneItems.get("wizard"),
    confirmSpellSlot: async () => true });
  assert.equal(cast.mode, "executed");
  assert.equal((executorCalls[0].extraOperations || []).some((operation) => operation.conditionName === "Reazione usata"), false,
    "nothing more to spend");
});
