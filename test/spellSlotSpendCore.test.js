// Which slot a cast spends, and the operation that spends it.
import test from "node:test";
import assert from "node:assert/strict";
import {
  planSpellSlotSpend,
  spellSlotChoices,
  spellSlotLabel,
  spellSlotSpendOperation,
} from "../src/spellSlotSpendCore.js";

const wizard = [{ classId: "mago", level: 5 }];
const warlock = [{ classId: "warlock", level: 5 }];
const both = [{ classId: "mago", level: 5 }, { classId: "warlock", level: 3 }];
const plan = (options) => planSpellSlotSpend({ characterBuild: wizard, ...options });

test("nothing is spent for cantrips, other phases, free casts and casters without slots", () => {
  assert.equal(plan({ spellLevel: 0 }).reason, "cantrip");
  assert.equal(plan({ spellLevel: 3, phase: "resolve" }).reason, "phase");
  assert.equal(plan({ spellLevel: 3, source: "none" }).reason, "free");
  assert.equal(planSpellSlotSpend({ characterBuild: [], spellLevel: 3 }).reason, "no-slots");
  assert.equal(planSpellSlotSpend({ characterBuild: [{ classId: "barbaro", level: 9 }], spellLevel: 1 }).spend, null);
  assert.equal(plan({ spellLevel: 3, phase: "prepare" }).reason, "standard", "a prepared spell spends its slot when prepared");
});

test("a cast spends a slot of its level, or of the level it is cast at", () => {
  const base = plan({ spellLevel: 3 });
  assert.equal(base.spend.poolId, "spell-slot-3");
  assert.equal(base.slotLevel, 3);
  const upcast = plan({ spellLevel: 1, slotLevel: 2 });
  assert.equal(upcast.spend.poolId, "spell-slot-2");
  assert.equal(upcast.slotLevel, 2);
  assert.equal(plan({ spellLevel: 3, slotLevel: 1 }).slotLevel, 3, "never below the spell's level");
});

test("without slots left the cast is reported as exhausted, with what is missing", () => {
  const empty = plan({ spellLevel: 3, resources: { "spell-slot-3": { current: 0 } } });
  assert.equal(empty.spend, null);
  assert.equal(empty.exhausted, true);
  assert.equal(empty.message, "Nessuno slot di 3° livello disponibile.");
  const missing = plan({ spellLevel: 4 });
  assert.equal(missing.exhausted, true);
  assert.equal(missing.message, "Il personaggio non ha slot di 4° livello.");
});

test("a warlock casts with Pact Magic, at the pact slot level", () => {
  const cast = planSpellSlotSpend({ characterBuild: warlock, spellLevel: 1 });
  assert.equal(cast.spend.poolId, "spell-slot-pact");
  assert.equal(cast.slotLevel, 3);
  const spent = planSpellSlotSpend({ characterBuild: warlock, spellLevel: 1, resources: { "spell-slot-pact": { current: 0 } } });
  assert.equal(spent.exhausted, true);
  assert.equal(spent.message, "Nessuno slot del Patto (3°) disponibile.");
  assert.equal(planSpellSlotSpend({ characterBuild: warlock, spellLevel: 4 }).exhausted, true);
});

test("with both, a regular slot first; Pact Magic when asked or when the level has none left", () => {
  assert.equal(planSpellSlotSpend({ characterBuild: both, spellLevel: 1 }).spend.poolId, "spell-slot-1");
  const asked = planSpellSlotSpend({ characterBuild: both, spellLevel: 1, source: "pact" });
  assert.equal(asked.spend.poolId, "spell-slot-pact");
  assert.equal(asked.slotLevel, 2);
  const fallback = planSpellSlotSpend({ characterBuild: both, spellLevel: 2, resources: { "spell-slot-2": { current: 0 } } });
  assert.equal(fallback.spend.poolId, "spell-slot-pact");
});

test("the panel offers each castable level with what is left, then Pact Magic", () => {
  const choices = spellSlotChoices({ characterBuild: both, resources: { "spell-slot-2": { current: 1 } }, spellLevel: 2 });
  assert.deepEqual(choices.map((choice) => [choice.value, choice.label]), [
    ["2", "2° · 1/3"],
    ["3", "3° · 2/2"],
    ["pact", "Patto 2° · 2/2"],
  ]);
  assert.deepEqual(spellSlotChoices({ characterBuild: both, spellLevel: 0 }), []);
});

test("the spend is an ordinary class-feature resource adjustment on the caster", () => {
  const operation = spellSlotSpendOperation({ sourceId: "nyx", poolId: "spell-slot-3", characterBuild: wizard, operationId: "op" });
  assert.equal(operation.type, "class-feature:adjust-resource");
  assert.equal(operation.sourceId, "nyx");
  assert.equal(operation.pool.id, "spell-slot-3");
  assert.deepEqual(operation.adjustment, { delta: -1 });
  assert.equal(spellSlotSpendOperation({ sourceId: "nyx", poolId: "stregone-punti-stregoneria" }), null);
  assert.equal(spellSlotLabel({ level: 2, pact: true }), "slot del Patto (2°)");
});

test("the cost of a cast: a slot by default, the quick action's own uses, or nothing", async () => {
  const { planSpellCastCost } = await import("../src/spellSlotSpendCore.js");
  const { sanitizeQuickAction } = await import("../src/quickActionsCore.js");
  const misty = { id: "misty", label: "Passo velato", kind: "spell", spellId: "misty-step", cost: "uses", uses: 1 };
  const base = { sourceId: "nyx", characterBuild: wizard, spellLevel: 2 };
  assert.equal(planSpellCastCost(base).operation.pool.id, "spell-slot-2");
  assert.equal(planSpellCastCost({ ...base, action: { ...misty, cost: "slot" } }).spent, "slot di 2° livello");
  assert.deepEqual(planSpellCastCost({ ...base, action: { ...misty, cost: "free" } }),
    { operation: null, spent: "", exhausted: false, message: "", slotLevel: null });
  const uses = planSpellCastCost({ ...base, action: misty });
  assert.equal(uses.operation.pool.id, "quick-action-uses:misty");
  assert.deepEqual(uses.operation.adjustment, { delta: -1 });
  assert.equal(uses.spent, "uso di Passo velato (0/1)");
  const empty = planSpellCastCost({ ...base, action: misty, resources: { "quick-action-uses:misty": { current: 0, maximum: 1 } } });
  assert.equal(empty.exhausted, true);
  assert.equal(empty.message, "Nessun uso rimasto per Passo velato (0/1).");
  assert.equal(planSpellCastCost({ ...base, action: misty, phase: "resolve" }).operation, null);
  // The cost is stored only when it is not a slot: existing quick actions keep their shape.
  assert.equal(Object.hasOwn(sanitizeQuickAction({ ...misty, cost: "slot" }), "cost"), false);
  assert.deepEqual([sanitizeQuickAction(misty).cost, sanitizeQuickAction(misty).uses], ["uses", 1]);
  assert.equal(Object.hasOwn(sanitizeQuickAction({ ...misty, cost: "free", uses: 3 }), "uses"), false);
});
