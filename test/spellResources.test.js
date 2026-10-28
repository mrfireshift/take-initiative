// CAP-RESOURCE of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: Mirror Image, Goodberry, Cordon of Arrows and Guardian of
// Faith, a counter each use consumes. The expectations below are read from the 2014 texts, not from the definitions
// under test.
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

const { getSpellDefinition, getTrackableSpellOptions, isSpellCastRecordOnly } = await import("../src/spells-srd.js");
const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
const { buildSpellActiveActionPlan, getSpellActiveAction } = await import("../src/spellActiveActionCore.js");
const {
  buildSpellActiveResolutionResourceOperations,
  validateSpellActiveResolutionAction,
} = await import("../src/spellActiveResolutionCore.js");
const { spellPillCounter } = await import("../src/spellExpiryCore.js");
const { zoneTriggerResourceSpend } = await import("../src/zoneResourceCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { getSpellAreaRules } = await import("../src/spellAreaRules.js");

const META_KEY = "com.thebigpicture.initiative/meta";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";

function castUses(spellId, slotLevel, targetIds = ["caster"]) {
  const spell = getSpellDefinition(spellId);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: spell.defaultTurns,
    casterId: "caster",
    targetIds,
    castContext: { slotLevel },
  });
  const plan = buildSpellApplicationPlan({ intent, instanceId: `${spellId}-1`, casterName: "Mago" });
  return plan.operations.find((operation) => operation.type === "spell:upsert");
}

const LABELS = { duplicates: "duplicati", berries: "bacche", ammunition: "munizioni", damage: "danni" };
const entry = (spellId, remaining, total, key, extra = {}) => ({
  name: getSpellDefinition(spellId).displayName,
  spellId,
  instanceId: `${spellId}-1`,
  casterId: "caster",
  turns: 10,
  conc: false,
  castContext: { slotLevel: 2, uses: { key, label: LABELS[key] || "", remaining, total, showInPill: true }, ...extra },
});

test("Mirror Image: three duplicates; each hit destroys one, the spell ends with the last", () => {
  const upsert = castUses("mirror-image", 2);
  assert.deepEqual([upsert.castContext.uses.remaining, upsert.castContext.uses.total], [3, 3]);
  assert.equal(spellPillCounter({ castContext: upsert.castContext }), "3");
  const spell = getSpellDefinition("mirror-image");
  const action = getSpellActiveAction(spell, "mirror-image-duplicate-destroyed");
  assert.equal(action.subjectMode, "none");
  assert.match(action.detail, /6 o più[\s\S]*8 o più[\s\S]*11 o più/u, "the d20 thresholds of the 2014 text");
  const hit = buildSpellActiveActionPlan({
    spell, actionId: action.id, group: entry("mirror-image", 3, 3, "duplicates"),
  });
  assert.equal(hit.valid, true, hit.errors?.join(", "));
  assert.equal(hit.operations[0].castContext.uses.remaining, 2);
  const last = buildSpellActiveActionPlan({ spell, actionId: action.id, group: entry("mirror-image", 1, 3, "duplicates") });
  assert.deepEqual(last.operations, [{ type: "spell:remove-instance", targetIds: ["caster"], instanceId: "mirror-image-1" }]);
});

test("Goodberry: ten berries on the caster for 24 hours; eating one heals any creature by 1 hit point", () => {
  assert.equal(isSpellCastRecordOnly("goodberry"), false);
  assert.ok(getTrackableSpellOptions().some((option) => option.id === "goodberry"));
  const spell = getSpellDefinition("goodberry");
  assert.equal(spell.defaultTurns, 14400, "24 hours");
  assert.equal(spell.targetMode, "self");
  const upsert = castUses("goodberry", 1);
  assert.deepEqual([upsert.castContext.uses.remaining, upsert.castContext.uses.total], [10, 10]);
  const action = getSpellActiveAction(spell, "goodberry-eat");
  assert.equal(action.resolutionKind, "single-heal");
  assert.equal(action.anyCreature, true);
  assert.equal(action.healing.formula, "1");
  assert.deepEqual(validateSpellActiveResolutionAction(action).errors || [], [], "no aura needed");
  const eaten = buildSpellActiveResolutionResourceOperations({
    action, payload: { instanceId: "goodberry-1", casterId: "caster" }, spellEntry: entry("goodberry", 10, 10, "berries"),
  });
  assert.equal(eaten.operations[0].castContext.uses.remaining, 9);
  const lastBerry = buildSpellActiveResolutionResourceOperations({
    action, payload: { instanceId: "goodberry-1", casterId: "caster" }, spellEntry: entry("goodberry", 1, 10, "berries"),
  });
  assert.equal(lastBerry.operations[0].type, "spell:remove-instance");
});

test("Cordon of Arrows: four pieces, two more per slot above 2nd; one flies at each creature, saved or not", () => {
  const owner = (remaining, total = 4) => entry("phb2014-cordone-di-frecce", remaining, total, "ammunition",
    { staticZoneOwner: true });
  const one = zoneTriggerResourceSpend({ spellId: "phb2014-cordone-di-frecce", spellName: "Cordone di Frecce",
    ownerEntry: owner(4), casterId: "caster", targetIds: ["goblin"] });
  assert.equal(one.remainingAfter, 3);
  assert.equal(one.operations[0].type, "spell:upsert");
  assert.deepEqual(one.sideEffects, []);
  assert.equal(one.note, "Cordone di Frecce: 3/4 munizioni.");
  const last = zoneTriggerResourceSpend({ spellId: "phb2014-cordone-di-frecce", spellName: "Cordone di Frecce",
    ownerEntry: owner(1), casterId: "caster", targetIds: ["goblin"] });
  assert.equal(last.ended, true);
  assert.deepEqual(last.operations, [{ type: "spell:remove-instance", targetIds: ["caster"], instanceId: "phb2014-cordone-di-frecce-1" }]);
  assert.deepEqual(last.sideEffects, [{ type: "static-zone:remove-ended", selectors: [{ instanceId: "phb2014-cordone-di-frecce-1" }] }]);
  assert.equal(zoneTriggerResourceSpend({ spellId: "phb2014-cordone-di-frecce",
    ownerEntry: { ...owner(4), castContext: { staticZoneOwner: true } }, targetIds: ["goblin"] }), null,
  "a zone cast before CAP-RESOURCE keeps no counter");
});

test("Guardian of Faith: it vanishes once it has dealt 60 damage, the last hit in full", () => {
  const owner = (remaining) => entry("guardian-of-faith", remaining, 60, "damage", { staticZoneOwner: true });
  const spend = (remaining, damages) => zoneTriggerResourceSpend({ spellId: "guardian-of-faith",
    spellName: "Guardiano della fede", ownerEntry: owner(remaining), casterId: "caster", targetIds: ["orc"], damages });
  assert.equal(spend(60, [20]).remainingAfter, 40);
  assert.equal(spend(60, [10]).note, "Guardiano della fede: 50/60 danni.");
  const last = spend(10, [20]);
  assert.equal(last.ended, true);
  assert.equal(last.note, "Guardiano della fede: ha inflitto 60 danni e svanisce.");
  assert.equal(spend(60, [0]), null, "no damage, nothing dealt");
});

const zoneToken = (id, hp, extra = {}) => ({
  id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax: hp, inInitiative: true, ...extra } },
});

async function zonePlan(spellId, { castContext, amount, outcome = "failed", slotLevel }) {
  const ruleId = getSpellAreaRules(spellId, { triggerType: "cast" })[0].id;
  const caster = zoneToken("caster", 30, { [SPELLS_KEY]: [{ ...entry(spellId, 0, 0, ""), castContext }] });
  const items = [caster, zoneToken("orc", 40)];
  const root = { id: "zone-root", type: "SHAPE", layer: "DRAWING", metadata: {} };
  const command = buildSpellAreaResolutionCommand({
    contract: buildSpellUnifiedPanelContract({ spellId, phase: "cast" }),
    source: { kind: "zone-trigger", sceneEpoch: 3, activationId: "activation-1" },
    sceneEpoch: 3,
    expectedSceneEpoch: 3,
    expectedZoneInstanceId: `${spellId}-1`,
    casterId: "caster",
    slotLevel,
    zoneTrigger: {
      activationId: "activation-1", instanceId: `${spellId}-1`, spellId, casterId: "caster",
      zoneItemId: "zone-root", zoneItemIds: ["zone-root"], targetIds: ["orc"], targetLocked: true,
      sceneEpoch: 3, ruleId, resolution: "manual-save",
    },
    outcomes: { orc: outcome },
    hp: { mode: "damage", amount },
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  return buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "instance",
    zoneTriggerRootItems: async () => [root],
  });
}

test("the zone trigger consumes the counter of the owner instance in the area command", async () => {
  const guardian = await zonePlan("guardian-of-faith", {
    amount: 20, slotLevel: 4,
    castContext: { staticZoneOwner: true, uses: { key: "damage", label: "danni", remaining: 30, total: 60, showInPill: true } },
  });
  assert.equal(guardian.valid !== false, true, JSON.stringify(guardian.errors));
  const upsert = guardian.effectOperations.find((operation) => operation.type === "spell:upsert");
  assert.equal(upsert.castContext.uses.remaining, 10);
  assert.ok(guardian.historyIds.includes("caster"), "Undo restores the counter");
  assert.ok(guardian.notes.includes("Guardiano della fede: 10/60 danni."), JSON.stringify(guardian.notes));
  assert.deepEqual(guardian.zoneResourceSideEffects, []);

  const lastArrow = await zonePlan("phb2014-cordone-di-frecce", {
    amount: 4, slotLevel: 2, outcome: "passed",
    castContext: { staticZoneOwner: true, uses: { key: "ammunition", label: "munizioni", remaining: 1, total: 4, showInPill: true } },
  });
  assert.ok(lastArrow.effectOperations.some((operation) => operation.type === "spell:remove-instance"),
    "the last piece flies even on a save");
  assert.deepEqual(lastArrow.zoneResourceSideEffects, [{ type: "static-zone:remove-ended",
    selectors: [{ instanceId: "phb2014-cordone-di-frecce-1" }] }]);
});

test("the cast of a zone sets its counter on the owner instance: 60 damage, 4 pieces + 2 per slot above 2nd", async () => {
  const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
  for (const [spellId, slotLevel, expected] of [["guardian-of-faith", 4, 60], ["phb2014-cordone-di-frecce", 2, 4],
    ["phb2014-cordone-di-frecce", 4, 8]]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
    const ruleId = contract.presentation.placement.ruleId;
    const rule = getSpellAreaRuleById(ruleId);
    const items = [zoneToken("caster", 30)];
    const command = buildSpellAreaResolutionCommand({
      contract, spellId, phase: "cast", source: { kind: "cast", sceneEpoch: 3 }, casterId: "caster", slotLevel,
      targetIds: [], candidateTargetIds: [], targetLocked: true,
      placement: { status: "confirmed", confirmed: true, ruleId, spellId, casterId: "caster", targetLocked: true,
        targetIds: [], preview: { type: rule?.geometry?.shape || "circle", start: { x: 0, y: 0 }, end: { x: 150, y: 0 },
          gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: [], targetLocked: true } },
      sceneEpoch: 3, currentSceneEpoch: 3, validateSpatial: false,
    });
    assert.equal(command.valid, true, `${spellId}: ${JSON.stringify(command.errors)}`);
    const plan = await buildSpellAreaResolutionExecutionPlan(command, {
      sceneEpoch: 3, isCurrent: () => true,
      readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
      readAllItems: async () => items, readSceneMetadata: async () => ({}),
      getInitiativeActorId: async () => null, createSpellInstanceId: async () => "instance",
      getStaticZoneItems: async () => [], buildStaticZoneItems: () => [],
    });
    assert.equal(plan.valid !== false, true, `${spellId}: ${JSON.stringify(plan.errors)}`);
    const owner = plan.effectOperations.find((operation) => operation.type === "spell:upsert" && operation.castContext?.staticZoneOwner);
    assert.ok(owner, spellId);
    assert.deepEqual([owner.castContext.uses.remaining, owner.castContext.uses.total], [expected, expected], `${spellId} ${slotLevel}`);
  }
});
