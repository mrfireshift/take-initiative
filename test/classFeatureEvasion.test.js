// M2 of the class features' defenses (08/11): Evasion read from the catalog, the rogue's, the monk's (7th level) and the
// hunter's Superior Hunter's Defense when Evasion is its option (PHB and Revised, 15th level), and a monster's from its card.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

// The area's commit asks the scene for its items once (the conditions at 0 HP): none here.
mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
  buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { actorHasEvasion, creatureHasEvasion, evasionForItem } = await import("../src/damageDefensesCore.js");
const { bossDefendedDamage } = await import("../src/bossActionsViewCore.js");
const { pcAttackTargetEvasion } = await import("../src/pcAttackCore.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { buildReminderResolutionPlan, buildZoneTriggerReminderResolution } = await import("../src/reminderResolutionCore.js");
const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js");
const { resolveSpellActiveResolutionDamage } = await import("../src/spellActiveResolutionCore.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");

const META = "com.thebigpicture.initiative/meta";
const card = (classId, level, subclassId = "", extra = {}) => ({ characterBuild: [{ classId, level, ...(subclassId ? { subclassId } : {}) }], ...extra });
const chosen = (base, ...ids) => ({ ...base, classFeaturesConfigured: true, enabledClassFeatureIds: ids });
const item = (initiativeCard) => ({ id: "x", name: "x", metadata: { [META]: { hp: 40, hpMax: 40, initiativeCard } } });
const HUNTER = "ranger-cacciatore-difesa-del-cacciatore-superiore";
const REVISED = "ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore";

test("the rogue and the monk from the 7th level, unless switched off on the sheet", () => {
  assert.equal(actorHasEvasion(card("ladro", 7)), true);
  assert.equal(actorHasEvasion(card("ladro", 6)), false);
  assert.equal(actorHasEvasion(card("monaco", 7)), true);
  assert.equal(actorHasEvasion(card("monaco", 6)), false);
  assert.equal(actorHasEvasion(chosen(card("monaco", 9))), false, "switched off");
  assert.equal(actorHasEvasion(chosen(card("monaco", 9), "monaco-elusione")), true);
});

test("the hunter at the 15th level, only when Evasion is the option chosen for its Superior Hunter's Defense", () => {
  const hunter = card("ranger", 15, "ranger-cacciatore");
  assert.equal(actorHasEvasion(hunter), false, "an option: nothing until chosen");
  assert.equal(actorHasEvasion(chosen(hunter, HUNTER, `${HUNTER}-elusione`)), true);
  assert.equal(actorHasEvasion(chosen(card("ranger", 14, "ranger-cacciatore"), HUNTER, `${HUNTER}-elusione`)), false);
  const revised = card("ranger-revised", 15, "ranger-revised-conclave-del-cacciatore");
  assert.equal(actorHasEvasion(chosen(revised, REVISED, `${REVISED}-elusione`)), true);
});

test("the consoles read it: a passed DEX save takes nothing, a failed one half", () => {
  const monk = item(card("monaco", 7));
  assert.equal(evasionForItem(monk, META), true);
  assert.equal(evasionForItem(item({ monster: { source: "manual", evasion: true } }), META), true, "a monster with the trait");
  assert.equal(creatureHasEvasion({}), false);
  const breath = [{ id: "c1", type: "fire" }];
  assert.equal(bossDefendedDamage(breath, { c1: 30 }, "passed", {}, [], false, evasionForItem(monk, META)), 0);
  assert.equal(bossDefendedDamage(breath, { c1: 30 }, "failed", {}, [], false, evasionForItem(monk, META)), 15);
  const dexBreath = { monster: { source: "manual" }, save: "dex", saveHalf: true };
  assert.equal(pcAttackTargetEvasion(dexBreath, monk), true);
  assert.equal(pcAttackTargetEvasion({ ...dexBreath, save: "con" }, monk), false, "not a Dexterity save");
});

// M4: the spell panel, its areas, the zones' reminders and the ⚡ actions read it too.
const creature = (id, initiativeCard = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 50, hpMax: 50, inInitiative: true, initiativeCard } } });

test("the panel's preview: a monk takes nothing on a passed Fireball and half on a failed one; the others as before", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  const targetIds = ["monk-passed", "monk-failed", "orc-passed", "orc-failed"];
  const session = createSpellPanelSession({ contract, casterId: "caster", targetIds, hpValues: { damage: 28 },
    outcomes: { "monk-passed": "passed", "monk-failed": "failed", "orc-passed": "passed", "orc-failed": "failed" } });
  const view = buildUnifiedPanelViewModel({ contract, session, selectedCatalogKey: "fireball", casterOptions: [{ value: "caster", label: "Caster" }],
    targetCandidates: targetIds.map((key) => ({ key, label: key, hp: 50, hpMax: 50, evasion: key.startsWith("monk") })) });
  assert.deepEqual(view.effects.preview.targets.map((t) => [t.key, t.factor, t.factorLabel, t.afterHP]), [
    ["monk-passed", "zero", "Elusione: nessun danno", 50],
    ["monk-failed", "half", "Elusione: metà", 36],
    ["orc-passed", "half", "Metà", 36],
    ["orc-failed", "full", "Pieno", 22],
  ]);
});

test("the area's commit: the same numbers, from the creature as it is now", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast", castContext: { slotLevel: 3 } });
  const items = [creature("caster"), creature("monk", card("monaco", 7)), creature("orc")];
  const targetIds = ["monk", "orc"];
  const command = buildSpellAreaResolutionCommand({
    contract, spellId: "fireball", phase: "cast", source: { kind: "cast", sceneEpoch: 3 }, casterId: "caster", slotLevel: 3,
    targetIds, candidateTargetIds: targetIds, outcomes: { monk: "passed", orc: "passed" }, hp: { mode: "damage", amount: 28 },
    placement: { status: "confirmed", spellId: "fireball", ruleId: "fireball:cast", casterId: "caster", sceneEpoch: 3,
      preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds, targetLocked: true } },
    targetLocked: true, sceneEpoch: 3, currentSceneEpoch: 3, validateSpatial: false,
  });
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3, isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)), readAllItems: async () => items,
    readSceneMetadata: async () => ({}), getInitiativeActorId: async () => null, createSpellInstanceId: async () => "fireball-1",
  });
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const after = (id) => plan.entries.find((entry) => entry.item.id === id)?.change?.afterHP ?? 50;
  assert.equal(after("monk"), 50, "Evasion: nothing on a success");
  assert.equal(after("orc"), 36);
});

test("a zone's reminder with a Dexterity save that halves: nothing or half for the monk", () => {
  const monk = creature("monk", card("monaco", 7));
  const caster = creature("caster");
  const plan = (outcome, target) => {
    const resolution = buildZoneTriggerReminderResolution({
      activation: { id: "activation", resolution: "manual-save", ability: "dex", zoneItemId: "zone", targetIds: [target.id], turnKey: "turn-1",
        spellId: "incendiary-cloud", damage: { dice: "10d8", type: "fuoco", onSave: "half" } },
      targetId: target.id, sourceId: "caster", sourceName: "Caster", dc: 15, metadataKey: SPELL_STATIC_ZONE_META_KEY,
    });
    const items = [target, caster, { id: "zone", name: "Zona", metadata: { [SPELL_STATIC_ZONE_META_KEY]: { triggerRuntime: { pending: [{ id: "activation", targetIds: [target.id] }] } } } }];
    return buildReminderResolutionPlan({ notice: { activationId: "activation", targets: [{ id: target.id, name: target.id }], resolution }, items, outcome,
      damageRoll: 9, sceneMetadata: { "com.thebigpicture.initiative/state": { round: 1, current: 0 } }, now: 100 });
  };
  assert.equal(plan("passed", monk).damage.amount, 0);
  assert.equal(plan("failed", monk).damage.amount, 4);
  assert.equal(plan("passed", creature("orc")).damage.amount, 4);
});

test("a ⚡ action with a Dexterity save that halves (Call Lightning): nothing or half with Evasion", () => {
  const action = getSpellDefinition("call-lightning").activeActions.find((entry) => entry.id === "call-lightning-strike");
  const damage = (outcome, evasion) => resolveSpellActiveResolutionDamage({ action, slotLevel: 3, outcome, roll: 22, evasion }).amount;
  assert.deepEqual([damage("passed", true), damage("failed", true), damage("passed", false), damage("failed", false)], [0, 11, 11, 22]);
});
