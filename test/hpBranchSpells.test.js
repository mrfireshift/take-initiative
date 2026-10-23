// CAP-HP-BRANCH of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: Power Word Kill, Divine Word, Disintegrate, Finger of Death
// and Feeblemind. The expectations below are read from the 2014 texts, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}),
    buildLabel: () => ({}),
    buildImage: () => ({}),
    buildText: () => ({}),
    buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { isSpellCastRecordOnly } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { getSpellSaveWorkflowRule } = await import("../src/spellSaveWorkflowRules.js");
const { spellSaveDamageFactor, spellSaveDamageFormula } = await import("../src/spellCastResolutionRules.js");
const { currentHitPointsForBranch, planHpBranchBeforeDamage } = await import("../src/hpBranchSpellRules.js");
const { planDeathSaveHpChange } = await import("../src/deathSaveCore.js");

const META_KEY = "com.thebigpicture.initiative/meta";
const token = (id, hp, { hpMax = 30, ...extra } = {}) => ({
  id,
  name: id,
  type: "IMAGE",
  layer: "CHARACTER",
  position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, inInitiative: true, ...extra } },
});

function command(spellId, { slotLevel, targetIds = ["target"], outcomes = {}, amount, targetContexts, placement } = {}) {
  return buildSpellAreaResolutionCommand({
    contract: buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } }),
    spellId,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes,
    hpAmount: amount,
    ...(targetContexts ? { targetContexts } : {}),
    ...(placement ? { placement } : {}),
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
}

async function plan(areaCommand, items) {
  assert.equal(areaCommand.valid, true, JSON.stringify(areaCommand.errors));
  return buildSpellAreaResolutionExecutionPlan(areaCommand, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "instance",
  });
}

const death = (result, id) => result.entries.find((entry) => entry.item.id === id)?.change;
const pills = (result, id) => result.effectOperations
  .filter((operation) => operation.type === "condition:add" && operation.targetIds.includes(id))
  .map((operation) => [operation.conditionName, operation.options?.expiry?.remaining ?? operation.options?.expiry?.mode]);

test("the five spells resolve in the area command: one creature each, Divine Word on any number in its area", () => {
  for (const [spellId, slot, save, damage] of [
    ["disintegrate", 6, true, true],
    ["finger-of-death", 7, true, true],
    ["feeblemind", 8, true, true],
    ["power-word-kill", 9, false, false],
    ["divine-word", 7, true, false],
  ]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: slot } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(isSpellCastRecordOnly(spellId), false, spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, save, `${spellId}: save`);
    assert.equal(contract.presentation.inputs.damage?.required === true, damage, `${spellId}: damage`);
    if (spellId !== "divine-word") assert.equal(contract.presentation.targeting.limit.maximum, 1, spellId);
  }
  assert.deepEqual(["disintegrate", "finger-of-death", "feeblemind", "divine-word"].map((id) => getSpellSaveWorkflowRule(id).ability),
    ["dex", "con", "int", "cha"]);
  assert.equal(spellSaveDamageFormula("disintegrate", "failed", 6), "10d6+40");
  assert.equal(spellSaveDamageFormula("disintegrate", "failed", 8), "16d6+40", "3d6 for each slot above 6th");
  assert.equal(spellSaveDamageFactor("disintegrate", "passed"), "zero");
  assert.equal(spellSaveDamageFormula("finger-of-death", "failed", 7), "7d8+30");
  assert.equal(spellSaveDamageFactor("finger-of-death", "passed"), null, "half on a success");
  assert.equal(spellSaveDamageFactor("feeblemind", "passed"), "full", "the 4d6 whatever the save");
});

test("current hit points leave the temporary ones out", () => {
  assert.equal(currentHitPointsForBranch({ hp: 110, hpMax: 90 }), 90);
  assert.equal(currentHitPointsForBranch({ hp: 12, hpMax: 90 }), 12);
  assert.equal(currentHitPointsForBranch({ hp: 12 }), null);
  const tempHp = planHpBranchBeforeDamage({ spellId: "power-word-kill", item: token("t", 115, { hpMax: 95 }) });
  assert.ok(tempHp.death, "95 hit points and 20 temporary: it dies");
});

test("Power Word Kill: 100 hit points or fewer, the creature dies; above, nothing", async () => {
  const kill = await plan(command("power-word-kill", { slotLevel: 9 }), [token("target", 100, { hpMax: 120 })]);
  assert.equal(death(kill, "target").afterHP, 0);
  assert.equal(death(kill, "target").instantDeath, true);
  const spared = await plan(command("power-word-kill", { slotLevel: 9 }), [token("target", 101, { hpMax: 120 })]);
  assert.equal(death(spared, "target"), undefined);
  assert.deepEqual(pills(spared, "target"), []);
});

test("Divine Word: the hit points at the failed save choose the effect; a success, none", async () => {
  const ids = ["dead", "stunned", "blinded", "deafened", "healthy", "saved", "fiend"];
  const items = [20, 30, 40, 50, 51, 10, 60].map((hp, index) => token(ids[index], hp, { hpMax: 80 }));
  const outcomes = Object.fromEntries(ids.map((id) => [id, id === "saved" ? "passed" : "failed"]));
  const result = await plan(command("divine-word", {
    slotLevel: 7,
    targetIds: ids,
    outcomes,
    targetContexts: { fiend: { creatureKind: "outsider" } },
    placement: { status: "confirmed", spellId: "divine-word", ruleId: "divine-word:cast", casterId: "caster", sceneEpoch: 3,
      preview: { start: { x: 0, y: 0 }, end: { x: 3, y: 0 }, gridOrigin: { x: 0, y: 0 }, targetIds: ids } },
  }), items);
  assert.equal(death(result, "dead").instantDeath, true, "20 hit points or fewer: killed");
  assert.deepEqual(pills(result, "dead"), [["Morto", "manual"]], "no other pill: Morto from the death");
  assert.deepEqual(pills(result, "stunned"), [["Assordato", 600], ["Accecato", 600], ["Stordito", 600]], "1 hour");
  assert.deepEqual(pills(result, "blinded"), [["Assordato", 100], ["Accecato", 100]], "10 minutes");
  assert.deepEqual(pills(result, "deafened"), [["Assordato", 10]], "1 minute");
  assert.deepEqual(pills(result, "healthy"), []);
  assert.deepEqual(pills(result, "saved"), []);
  assert.equal(death(result, "saved"), undefined);
  assert.deepEqual(pills(result, "fiend"), [["Respinto sul piano d'origine", 14400]], "sent home for 24 hours, whatever its HP");
  assert.equal(result.effectOperations.find((operation) => operation.conditionName === "Stordito").options.parentEffectId, "",
    "the pills outlast the instantaneous spell");
});

test("Divine Word reads the creature type of the token when the GM leaves it empty", () => {
  const demon = token("demon", 70, { hpMax: 80, creatureType: "Immondo (demone)" });
  assert.deepEqual(planHpBranchBeforeDamage({ spellId: "divine-word", outcome: "failed", item: demon }).pills.map((pill) => pill.condition),
    ["Respinto sul piano d'origine"]);
});

test("Disintegrate: a failed save that brings the creature to 0 HP turns it to dust; a success deals nothing", async () => {
  const dust = await plan(command("disintegrate", { slotLevel: 6, outcomes: { target: "failed" }, amount: 75 }), [token("target", 30)]);
  assert.equal(death(dust, "target").instantDeath, true);
  assert.match(death(dust, "target").deathDetail, /Disintegrato/u);
  const standing = await plan(command("disintegrate", { slotLevel: 6, outcomes: { target: "failed" }, amount: 75 }),
    [token("target", 90, { hpMax: 120 })]);
  assert.equal(death(standing, "target").afterHP, 15);
  assert.equal(death(standing, "target").instantDeath, undefined);
  const saved = await plan(command("disintegrate", { slotLevel: 6, outcomes: { target: "passed" }, amount: 75 }), [token("target", 30)]);
  assert.equal(death(saved, "target"), undefined);
});

test("Finger of Death: a humanoid it kills rises as a zombie at the start of the caster's next turn", async () => {
  const kill = await plan(command("finger-of-death", { slotLevel: 7, outcomes: { target: "failed" }, amount: 60,
    targetContexts: { target: { creatureKind: "humanoid" } } }), [token("target", 30)]);
  const zombie = kill.effectOperations.find((operation) => operation.conditionName === "Si rianima come zombi");
  assert.deepEqual(zombie.targetIds, ["target"]);
  const [deferred] = [].concat(zombie.options.deferredEffects);
  assert.deepEqual([deferred.timing, deferred.actor, deferred.anchor], ["turn-start", "source", "next-turn"]);
  assert.equal(death(kill, "target").instantDeath, undefined, "a monster at 0 HP is dead as ever");
  const beast = await plan(command("finger-of-death", { slotLevel: 7, outcomes: { target: "failed" }, amount: 60,
    targetContexts: { target: { creatureKind: "other" } } }), [token("target", 30)]);
  assert.deepEqual(pills(beast, "target"), []);
  const pc = await plan(command("finger-of-death", { slotLevel: 7, outcomes: { target: "failed" }, amount: 40,
    targetContexts: { target: { creatureKind: "humanoid" } } }), [token("target", 30, { attitude: "pc" })]);
  assert.deepEqual(pills(pc, "target"), [], "a PC at 0 HP is dying, not dead");
  const survivor = await plan(command("finger-of-death", { slotLevel: 7, outcomes: { target: "passed" }, amount: 60 }),
    [token("target", 50, { hpMax: 60 })]);
  assert.equal(death(survivor, "target").afterHP, 20, "half on a success");
});

test("Feeblemind: the 4d6 whatever the save, Regressione mentale on a failure", async () => {
  const failed = await plan(command("feeblemind", { slotLevel: 8, outcomes: { target: "failed" }, amount: 14 }), [token("target", 30)]);
  assert.equal(death(failed, "target").afterHP, 16);
  assert.deepEqual(pills(failed, "target"), [["Regressione mentale", "manual"]]);
  const passed = await plan(command("feeblemind", { slotLevel: 8, outcomes: { target: "passed" }, amount: 14 }), [token("target", 30)]);
  assert.equal(death(passed, "target").afterHP, 16);
  assert.deepEqual(pills(passed, "target"), []);
});

test("an instant death: Morto for any creature, the three failures for a PC", () => {
  const ko = { id: "ko", condition: "Privo di sensi", active: true, type: "hp-zero" };
  const monster = planDeathSaveHpChange({ meta: { attitude: "enemy", hp: 40, hpMax: 60 }, instances: [], hpAfter: 0, hpMax: 60,
    instantDeath: true, deathDetail: "Disintegrato" });
  assert.deepEqual(monster, { removeInstanceIds: [], addCondition: "Morto", deathDetail: "Disintegrato", instantDeath: true });
  const pc = planDeathSaveHpChange({ meta: { attitude: "pc", hp: 0, hpMax: 60 }, instances: [ko], hpAfter: 0, hpMax: 60, instantDeath: true });
  assert.deepEqual(pc.deathSaves.value, { successes: 0, failures: 3 });
  assert.deepEqual(pc.removeInstanceIds, ["ko"]);
});
