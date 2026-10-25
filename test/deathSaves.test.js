import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDeathSaveRoll,
  DEATH_SAVE_OUTCOMES,
  deathSaveTallyText,
  planDeathSaveHpChange,
} from "../src/deathSaveCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";
import { resolveZeroHPUnconsciousAction } from "../src/hpConditionRulesCore.js";

const META_KEY = "com.thebigpicture.initiative/meta";
const { SUCCESS, FAILURE, NAT1, NAT20 } = DEATH_SAVE_OUTCOMES;
const pill = (id, condition, type = "") => ({ id, condition, active: true, targetId: "aria", ...(type ? { type } : {}) });
const pc = (extra = {}, conditions = [pill("ko", "Privo di sensi", "hp-zero")]) => ({
  id: "aria", name: "Aria", type: "IMAGE", layer: "CHARACTER",
  metadata: { [META_KEY]: { attitude: "pc", hp: 0, hpMax: 30, conditions: { version: 2, instances: conditions }, ...extra } },
});
const state = (current) => ({ round: 2, order: ["aria", "ghoul"], current });
const ghoul = { id: "ghoul", name: "Ghoul", metadata: { [META_KEY]: { attitude: "enemy", hp: 0, hpMax: 20 } } };
const turnStart = (item) => planEffectSaveReminderNotices({
  items: [item, ghoul], previousInitiativeState: state(1), initiativeState: { ...state(0), round: 3 }, includeCurrentTurnStart: false,
}).filter((notice) => notice.resolution?.mode === "death-save");

test("the d20: successes, failures, a natural 1, a natural 20", () => {
  assert.deepEqual(applyDeathSaveRoll({}, SUCCESS), { successes: 1, failures: 0, result: "dying" });
  assert.deepEqual(applyDeathSaveRoll({ successes: 2, failures: 1 }, SUCCESS), { successes: 0, failures: 0, result: "stable" });
  assert.deepEqual(applyDeathSaveRoll({ successes: 1, failures: 1 }, FAILURE), { successes: 1, failures: 2, result: "dying" });
  assert.deepEqual(applyDeathSaveRoll({ failures: 1 }, NAT1), { successes: 0, failures: 3, result: "dead" });
  assert.deepEqual(applyDeathSaveRoll({ failures: 2 }, FAILURE), { successes: 0, failures: 3, result: "dead" });
  assert.deepEqual(applyDeathSaveRoll({ successes: 1, failures: 2 }, NAT20), { successes: 0, failures: 0, result: "revived" });
  assert.equal(deathSaveTallyText({ successes: 1, failures: 2 }), "Successi ●○○ · Fallimenti ✕✕○");
});

test("the reminder comes at the start of the dying PC's turn, never for a monster, a stable or a dead PC", () => {
  const [notice] = turnStart(pc({ deathSaves: { successes: 1, failures: 0 } }));
  assert.equal(notice.target.id, "aria");
  assert.equal(notice.eyebrow, "TS contro la morte");
  assert.match(notice.instruction, /Successi ●○○ · Fallimenti ○○○/u);
  assert.deepEqual(turnStart(pc({}, [pill("ko", "Privo di sensi", "hp-zero"), pill("st", "Stabile", "death-save")])), []);
  assert.deepEqual(turnStart(pc({}, [pill("dead", "Morto", "death-save")])), []);
  assert.deepEqual(turnStart(pc({ hp: 5 })), []);
  assert.deepEqual(turnStart(pc({ attitude: "enemy" })), []);
  assert.deepEqual(turnStart(pc({ reminderResolutions: { [notice.activationId]: { outcome: SUCCESS } } })), [],
    "a resolved roll does not come back");
});

function resolve(item, outcome) {
  const [notice] = turnStart(item);
  return buildReminderResolutionPlan({ notice, items: [item, ghoul], outcome, now: 1 });
}

test("a roll writes the tally and the reminder's marker in one plan", () => {
  const plan = resolve(pc({ deathSaves: { successes: 1, failures: 1 } }), FAILURE);
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.operations, []);
  const fields = plan.metadataPatches[0].fields;
  assert.deepEqual(fields.deathSaves.value, { successes: 1, failures: 2 });
  assert.deepEqual(fields.deathSaves.expected, { present: true, value: { successes: 1, failures: 1 } });
  assert.ok(fields.reminderResolutions.value[plan.activationId]);
  assert.equal(plan.hpChange, null);
});

test("the third success: Stabile, the tally goes back to zero, Privo di sensi stays", () => {
  const plan = resolve(pc({ deathSaves: { successes: 2, failures: 1 } }), SUCCESS);
  assert.equal(plan.deathSaveResult, "stable");
  assert.deepEqual(plan.operations.map((operation) => [operation.type, operation.conditionName]), [["condition:add", "Stabile"]]);
  assert.equal(plan.metadataPatches[0].fields.deathSaves.mode, "delete");
});

test("the third failure: Morto takes the place of Privo di sensi", () => {
  const plan = resolve(pc({ deathSaves: { successes: 0, failures: 2 } }), NAT1);
  assert.equal(plan.deathSaveResult, "dead");
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["condition:add", "condition:remove-instances"]);
  assert.equal(plan.operations[0].conditionName, "Morto");
  assert.deepEqual(plan.operations[1].removals, [{ itemId: "aria", instanceId: "ko" }]);
  assert.deepEqual(plan.metadataPatches[0].fields.deathSaves.value, { successes: 0, failures: 3 });
});

test("a natural 20: back to 1 HP and awake", () => {
  const plan = resolve(pc({ deathSaves: { successes: 1, failures: 2 } }), NAT20);
  assert.deepEqual(plan.hpChange, { before: 0, after: 1, hpMax: 30 });
  assert.equal(plan.metadataPatches[0].fields.hp.value, 1);
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["condition:remove-instances"]);
  assert.equal(plan.operations[0].removals[0].instanceId, "ko");
});

test("a roll on a PC no longer dying is refused", () => {
  const [notice] = turnStart(pc());
  const healed = pc({ hp: 4 });
  assert.equal(buildReminderResolutionPlan({ notice, items: [healed, ghoul], outcome: SUCCESS }).status, "stale");
});

test("HP changes: healing resets the tally and ends Stabile; leftover damage of the HP maximum is instant death", () => {
  const stable = [pill("ko", "Privo di sensi", "hp-zero"), pill("st", "Stabile", "death-save")];
  assert.deepEqual(planDeathSaveHpChange({ meta: { attitude: "pc", hp: 0, hpMax: 30, deathSaves: { successes: 1 } },
    instances: stable, hpAfter: 5, hpMax: 30 }), { deathSaves: { mode: "delete" }, removeInstanceIds: ["st"], addCondition: "" });
  assert.equal(planDeathSaveHpChange({ meta: { attitude: "pc", hp: 0, hpMax: 30 }, instances: [], hpAfter: 5, hpMax: 30 }), null);
  const death = planDeathSaveHpChange({ meta: { attitude: "pc", hp: 10, hpMax: 30 }, instances: [], hpAfter: 0, hpMax: 30, damage: 40 });
  assert.equal(death.addCondition, "Morto");
  assert.equal(death.instantDeath, true);
  assert.equal(planDeathSaveHpChange({ meta: { attitude: "pc", hp: 10, hpMax: 30 }, instances: [], hpAfter: 0, hpMax: 30, damage: 39 }), null);
  assert.equal(planDeathSaveHpChange({ meta: { attitude: "enemy", hp: 10, hpMax: 30 }, instances: [], hpAfter: 0, hpMax: 30, damage: 90 }), null);
});

test("Morto ends the automatic Privo di sensi and keeps it from coming back", () => {
  const action = resolveZeroHPUnconsciousAction({ attitude: "pc", hp: 0, hpMax: 30 },
    [pill("ko", "Privo di sensi", "hp-zero"), pill("dead", "Morto", "death-save")]);
  assert.deepEqual(action, { shouldHave: false, add: false, removeInstanceIds: ["ko"] });
});

test("the Privo di sensi a reminder's damage once added (zero-hp-unconscious) is still the automatic one", () => {
  const healed = resolveZeroHPUnconsciousAction({ attitude: "pc", hp: 5, hpMax: 30 }, [pill("ko", "Privo di sensi", "zero-hp-unconscious")]);
  assert.deepEqual(healed.removeInstanceIds, ["ko"]);
  assert.equal(resolveZeroHPUnconsciousAction({ attitude: "pc", hp: 0, hpMax: 30 }, [pill("ko", "Privo di sensi", "zero-hp-unconscious")]).add, false);
});

test("an HP writer lets a hit on a PC at 0 HP through (deathSaveDamage), never a heal or another creature", async () => {
  const { calculateQuickHPChange } = await import("../src/quickHpCore.js");
  const { takesDeathSaveDamage } = await import("../src/deathSaveCore.js");
  const dying = { attitude: "pc", hp: 0, hpMax: 30, conditions: { version: 2, instances: [] } };
  assert.equal(takesDeathSaveDamage(dying), true);
  assert.equal(takesDeathSaveDamage({ ...dying, attitude: "enemy" }), false);
  assert.equal(takesDeathSaveDamage({ ...dying, conditions: { version: 2, instances: [pill("d", "Morto", "death-save")] } }), false);
  const hit = calculateQuickHPChange({ value: 7, hp: 0, hpMax: 30, deathSaveDamage: true });
  assert.deepEqual([hit.afterHP, hit.delta, hit.changed, hit.deathSaveDamage], [0, 0, true, true]);
  assert.equal(calculateQuickHPChange({ value: 7, hp: 0, hpMax: 30 }).changed, false, "without the flag nothing changes");
  assert.equal(calculateQuickHPChange({ value: 0, hp: 0, hpMax: 30, deathSaveDamage: true }).changed, false);
  assert.equal(calculateQuickHPChange({ mode: "heal", value: 0, hp: 0, hpMax: 30, deathSaveDamage: true }).changed, false);
});

test("damage at 0 HP: one failure, two on a critical, a stable PC starts again, the third failure or the HP maximum kill", () => {
  const meta = (extra = {}) => ({ attitude: "pc", hp: 0, hpMax: 30, ...extra });
  const ko = pill("ko", "Privo di sensi", "hp-zero");
  const hit = (extra, instances = [ko], options = {}) => planDeathSaveHpChange({
    meta: meta(extra), instances, hpAfter: 0, hpMax: 30, damage: 5, ...options });
  assert.deepEqual(hit({ deathSaves: { successes: 2, failures: 0 } }),
    { deathSaves: { value: { successes: 2, failures: 1 } }, removeInstanceIds: [], addCondition: "" });
  assert.deepEqual(hit({}, [ko], { critical: true }).deathSaves.value, { successes: 0, failures: 2 });
  const stable = hit({}, [ko, pill("st", "Stabile", "death-save")]);
  assert.deepEqual(stable.removeInstanceIds, ["st"]);
  assert.deepEqual(stable.deathSaves.value, { successes: 0, failures: 1 });
  const third = hit({ deathSaves: { successes: 1, failures: 2 } });
  assert.equal(third.addCondition, "Morto");
  assert.deepEqual(third.removeInstanceIds, ["ko"]);
  assert.deepEqual(third.deathSaves.value, { successes: 1, failures: 3 });
  assert.equal(hit({}, [ko], { damage: 30 }).addCondition, "Morto", "damage of the HP maximum at 0 HP");
  assert.equal(hit({}, [pill("dead", "Morto", "death-save")]), null, "a dead PC counts nothing");
  assert.equal(hit({}, [ko], { damage: 0 }), null);
});

test("the death save comes only when the dying PC's turn really starts", () => {
  const dying = pc({ deathSaves: { successes: 0, failures: 0 } });
  const deathSaves = (options) => planEffectSaveReminderNotices({ items: [dying, ghoul], ...options })
    .filter((notice) => notice.resolution?.mode === "death-save");
  // Advancing to Aria's turn: the save.
  assert.equal(deathSaves({ previousInitiativeState: state(1), initiativeState: { ...state(0), round: 3 } }).length, 1);
  // Aria drops to 0 during her own turn (the state does not move): she rolls at the start of her next turn.
  assert.equal(deathSaves({ previousInitiativeState: state(0), initiativeState: state(0) }).length, 0);
  assert.equal(deathSaves({ previousInitiativeState: null, initiativeState: state(0) }).length, 0);
  // Several turns skipped at once: Aria's skipped turn gives no save, only the turn now current would.
  assert.equal(deathSaves({ previousInitiativeState: state(1), initiativeState: { ...state(1), round: 3 } }).length, 0);
  // A paragon PC rolls on its first pass only (its second pass is "::p1", expandParagonEntries).
  const paragon = { round: 1, order: ["ghoul", "aria", "aria::p1", "aria::p2"] };
  assert.equal(deathSaves({ previousInitiativeState: { ...paragon, current: 0 }, initiativeState: { ...paragon, current: 1 } }).length, 1);
  assert.equal(deathSaves({ previousInitiativeState: { ...paragon, current: 1 }, initiativeState: { ...paragon, current: 2 } }).length, 0);
  assert.equal(deathSaves({ previousInitiativeState: { ...paragon, current: 2 }, initiativeState: { ...paragon, current: 3 } }).length, 0);
});

test("the death save survives an HP write landing just after the turn change, and an order changed with it", () => {
  const dying = pc({ deathSaves: { successes: 0, failures: 0 } });
  const deathSaves = (options) => planEffectSaveReminderNotices({ items: [dying, ghoul], ...options })
    .filter((notice) => notice.resolution?.mode === "death-save");
  // The turn was reached a moment ago (the controller's recent turn), the PC's 0 HP arrives now.
  assert.equal(deathSaves({ previousInitiativeState: state(0), initiativeState: state(0), recentDeathSaveTurnKey: "2:0:aria" }).length, 1);
  assert.equal(deathSaves({ previousInitiativeState: state(0), initiativeState: state(0), recentDeathSaveTurnKey: "1:0:aria" }).length, 0,
    "another turn's key gives nothing");
  // A creature leaves the order as the GM advances to Aria's turn.
  assert.equal(deathSaves({
    previousInitiativeState: { round: 2, order: ["aria", "wolf", "ghoul"], current: 2 },
    initiativeState: { round: 3, order: ["aria", "ghoul"], current: 0 },
  }).length, 1);
  assert.equal(deathSaves({
    previousInitiativeState: { round: 2, order: ["ghoul", "wolf", "aria"], current: 0 },
    initiativeState: { round: 2, order: ["ghoul", "aria"], current: 1 },
  }).length, 1);
  // A creature joins while the turn stays Aria's, or the GM goes back to her: no save.
  assert.equal(deathSaves({
    previousInitiativeState: { round: 2, order: ["ghoul", "aria"], current: 1 },
    initiativeState: { round: 2, order: ["wolf", "ghoul", "aria"], current: 2 },
  }).length, 0);
  assert.equal(deathSaves({
    previousInitiativeState: { round: 2, order: ["ghoul", "aria", "wolf"], current: 2 },
    initiativeState: { round: 2, order: ["ghoul", "aria"], current: 1 },
  }).length, 0);
});
