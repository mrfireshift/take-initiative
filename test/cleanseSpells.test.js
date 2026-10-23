// CAP-CLEANSE of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: Heal, Power Word Heal, Lesser Restoration and Dispel Magic.
// The expectations below are read from the 2014 texts, not from the definitions under test.
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

const SPELLS = "com.thebigpicture.initiative/spells";
const pill = (id, condition, extra = {}) => ({ id, condition, active: true, targetId: "target", ...extra });
const withPills = (item, instances) => { item.metadata[META_KEY].conditions = { version: 2, instances }; return item; };
const healed = (result, id) => result.entries.find((entry) => entry.item.id === id)?.change;
const removed = (result) => result.effectOperations
  .filter((operation) => operation.type === "condition:remove-instances")
  .flatMap((operation) => operation.removals.map((removal) => removal.instanceId)).sort();
const endedSpells = (result) => result.effectOperations
  .filter((operation) => operation.type === "spell:remove-requested").map((operation) => operation.instanceId).sort();

test("the four spells resolve in the area command on one creature, without a save or a healing to enter", () => {
  for (const [spellId, slot, context] of [
    ["heal", 6, false], ["phb2014-parola-del-potere-guarire", 9, false], ["lesser-restoration", 2, true], ["dispel-magic", 3, true],
  ]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: slot } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(isSpellCastRecordOnly(spellId), false, spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, false, `${spellId}: no save`);
    assert.equal(contract.presentation.inputs.healing.required, false, `${spellId}: no healing to enter`);
    assert.equal(contract.presentation.inputs.targetContext.visible, context, `${spellId}: its field`);
    assert.equal(contract.presentation.targeting.limit.maximum, 1, spellId);
  }
  assert.equal(getSpellSaveWorkflowRule("heal").targeting.spatial.maxMeters, 18);
  assert.equal(getSpellSaveWorkflowRule("dispel-magic").targeting.spatial.maxMeters, 36);
});

test("Heal: 70 hit points, 10 more per slot above 6th; it ends blindness, deafness and diseases", async () => {
  const target = () => withPills(token("target", 10, { hpMax: 120 }), [
    pill("blind", "Accecato"), pill("deaf", "Assordato"),
    pill("sick", "Contagio · Febbre lurida", { mechanics: { contagionDiseaseId: "filth-fever" } }),
    pill("poisoned", "Avvelenato"),
  ]);
  const sixth = await plan(command("heal", { slotLevel: 6 }), [target()]);
  assert.equal(healed(sixth, "target").afterHP, 80);
  assert.deepEqual(removed(sixth), ["blind", "deaf", "sick"], "poisoned stays");
  const eighth = await plan(command("heal", { slotLevel: 8 }), [target()]);
  assert.equal(healed(eighth, "target").afterHP, 100);
  const full = await plan(command("heal", { slotLevel: 6 }), [token("target", 25, { hpMax: 30 })]);
  assert.equal(healed(full, "target").afterHP, 30, "never above the maximum");
});

test("Heal and Power Word Heal do nothing to constructs and undead", async () => {
  const zombie = withPills(token("target", 5, { hpMax: 22, creatureType: "Non morto" }), [pill("blind", "Accecato")]);
  const result = await plan(command("heal", { slotLevel: 6 }), [zombie]);
  assert.equal(healed(result, "target"), undefined);
  assert.deepEqual(removed(result), []);
  assert.match(result.notes[0], /costrutti e non morti/u);
});

test("Power Word Heal: all its hit points, and charmed, frightened, paralyzed and stunned end", async () => {
  const target = withPills(token("target", 12, { hpMax: 90 }), [
    pill("charmed", "Affascinato"), pill("frightened", "Spaventato"), pill("paralyzed", "Paralizzato"), pill("stunned", "Stordito"),
    pill("prone", "Prono"), pill("blind", "Accecato"),
  ]);
  const result = await plan(command("phb2014-parola-del-potere-guarire", { slotLevel: 9 }), [target]);
  assert.equal(healed(result, "target").afterHP, 90);
  assert.deepEqual(removed(result), ["charmed", "frightened", "paralyzed", "stunned"], "prone and blinded stay");
  const tempHp = await plan(command("phb2014-parola-del-potere-guarire", { slotLevel: 9 }), [token("target", 95, { hpMax: 90 })]);
  assert.equal(healed(tempHp, "target"), undefined, "already at its maximum, temporary hit points untouched");
});

test("Lesser Restoration ends the condition the GM chooses, or a disease", async () => {
  const target = () => withPills(token("target", 20), [
    pill("blind", "Accecato"), pill("poisoned", "Avvelenato"),
    pill("sick", "Contagio · Morbo accecante", { effectId: "contagion-blinding-sickness" }),
  ]);
  const poison = await plan(command("lesser-restoration", { slotLevel: 2, targetContexts: { target: { cleanseCondition: "Avvelenato" } } }), [target()]);
  assert.deepEqual(removed(poison), ["poisoned"]);
  const disease = await plan(command("lesser-restoration", { slotLevel: 2, targetContexts: { target: { cleanseCondition: "disease" } } }), [target()]);
  assert.deepEqual(removed(disease), ["sick"]);
  assert.equal(command("lesser-restoration", { slotLevel: 2 }).valid, false, "the condition to end is required");
});

test("Dispel Magic ends the spells of 3rd level or lower on the creature; above, the check decides", async () => {
  const target = () => {
    const item = token("target", 20);
    item.metadata[META_KEY][SPELLS] = [
      { instanceId: "armor", spellId: "mage-armor", name: "Armatura magica" },
      { instanceId: "haste", spellId: "haste", name: "Velocità", castContext: { slotLevel: 3 } },
      { instanceId: "bless-up", spellId: "bless", name: "Benedizione", castContext: { slotLevel: 4 } },
      { instanceId: "hold", spellId: "hold-monster", name: "Blocca mostri" },
      { instanceId: "zone", spellId: "wall-of-fire", name: "Muro di fuoco", castContext: { staticZoneOwner: true } },
    ];
    return item;
  };
  const third = await plan(command("dispel-magic", { slotLevel: 3 }), [target()]);
  assert.deepEqual(endedSpells(third), ["armor", "haste"], "Bless cast at 4th and Hold Monster need the check; a zone it owns stays");
  assert.match(third.notes[0], /Benedizione \(CD 14\), Blocca mostri \(CD 15\)/u);
  const fourth = await plan(command("dispel-magic", { slotLevel: 4 }), [target()]);
  assert.deepEqual(endedSpells(fourth), ["armor", "bless-up", "haste"]);
  const passed = await plan(command("dispel-magic", { slotLevel: 3, targetContexts: { target: { dispelCheck: "passed" } } }), [target()]);
  assert.deepEqual(endedSpells(passed), ["armor", "bless-up", "haste", "hold"]);
  assert.deepEqual(passed.notes, []);
  const failed = await plan(command("dispel-magic", { slotLevel: 3, targetContexts: { target: { dispelCheck: "failed" } } }), [target()]);
  assert.deepEqual(endedSpells(failed), ["armor", "haste"]);
  assert.match(failed.notes[0], /prova è fallita/u);
});
