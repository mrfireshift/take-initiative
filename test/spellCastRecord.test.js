// The cast of a spell the plugin does not automate is recorded with what it spends: which spells, the contract of
// the spell panel, the quick action plan, the lifecycle request and what the combat log shows. The real command,
// History and Undo are in spellSlotSpendUndo.test.js.
import test from "node:test";
import assert from "node:assert/strict";

import {
  getAreaSaveSpellOptions,
  getQuickActionSpellOptions,
  getRecordOnlySpellOptions,
  getSpellCatalog,
  getTrackableSpellOptions,
  isSpellCastRecordOnly,
} from "../src/spells-srd.js";
import { AREA_POPOVER_SPELL_ID_SET } from "../src/areaSaveSpellRules.js";
import {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildQuickActionSpellLaunchPlan } from "../src/quickActionSpellExecutionCore.js";
import {
  buildSpellUnifiedLifecycleRequest,
  executeSpellUnifiedLifecycle,
} from "../src/spellUnifiedLifecycleAdapter.js";
import {
  buildSpellCastRecordCausality,
  buildSpellCastRecordLogEntry,
  SPELL_CAST_RECORD_SOURCE,
  spellCastRecordLabel,
  withSpellCastCost,
} from "../src/spellCastRecordCore.js";
import { combatEventFromHistoryEntryV3 } from "../src/combatLogV3Core.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

function bookAction(spellId, overrides = {}) {
  return {
    version: 2,
    id: `book:${spellId}`,
    label: spellId,
    kind: "spell",
    spellId,
    targetMode: "selection",
    slotLevel: null,
    turns: null,
    applyAutomations: true,
    launchMode: "auto",
    ...overrides,
  };
}

test("the plugin only records the instantaneous spells it neither tracks nor places: 84 of the catalog", () => {
  const catalog = getSpellCatalog();
  const tracked = new Set(getTrackableSpellOptions().map((option) => option.id));
  const expected = catalog
    .filter((spell) => !tracked.has(spell.id) && !AREA_POPOVER_SPELL_ID_SET.has(spell.id))
    .map((spell) => spell.id);
  const recorded = getRecordOnlySpellOptions().map((option) => option.id);
  assert.deepEqual(recorded, expected);
  assert.equal(recorded.length, 84);
  for (const id of ["counterspell", "cure-wounds", "wish", "magic-missile", "mending", "identify"]) {
    assert.equal(isSpellCastRecordOnly(id), true, id);
  }
  for (const id of ["bless", "fireball", "shield", "hold-person", "mass-cure-wounds"]) {
    assert.equal(isSpellCastRecordOnly(id), false, id);
  }
  assert.equal(isSpellCastRecordOnly("Controincantesimo"), true, "by name too");
  assert.equal(isSpellCastRecordOnly("not-a-spell"), false);
  const areaIds = new Set(getAreaSaveSpellOptions().map((option) => option.id));
  assert.equal(recorded.some((id) => areaIds.has(id)), false);
});

test("every spell of the catalog is a quick action option, the recorded ones flagged", () => {
  const options = getQuickActionSpellOptions();
  assert.equal(options.length, getSpellCatalog().length);
  assert.equal(options.filter((option) => option.recordOnly).length, 84);
  assert.equal(options.find((option) => option.id === "counterspell").recordOnly, true);
  assert.equal(options.find((option) => option.id === "fireball").recordOnly, false);
});

test("the panel contract of a recorded spell: lifecycle lane, optional targets, Registra lancio", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "counterspell" });
  assert.equal(contract.execution.lane, "spell-lifecycle");
  assert.equal(contract.execution.recordOnly, true);
  assert.equal(contract.presentation.inputs.targets.visible, true);
  assert.equal(contract.presentation.inputs.targets.required, false);
  assert.equal(contract.presentation.slot.visible, true, "the slot level is chosen as for any spell");
  const session = createSpellPanelSession({ contract, casterId: "wizard" });
  const view = buildSpellPanelViewModel(contract, { ...session, executionGate: { allowed: true } });
  assert.equal(view.validation.valid, true, "no target needed");
  assert.equal(view.primaryAction.label, "Registra lancio");

  const bless = buildSpellUnifiedPanelContract({ spellId: "bless" });
  assert.equal(bless.execution.recordOnly, false);
  assert.equal(bless.presentation.inputs.targets.required, true);
});

test("a quick action records the spell at once, with no creature, one or several within its limit", () => {
  for (const [spellId, selectedTargetIds, slotLevel] of [
    ["counterspell", [], 3],
    ["counterspell", ["goblin"], 3],
    ["magic-missile", ["goblin", "orc"], 1],
  ]) {
    const plan = buildQuickActionSpellLaunchPlan({
      action: bookAction(spellId),
      sourceId: "wizard",
      selectedTargetIds,
    });
    assert.equal(plan.mode, "direct", JSON.stringify(selectedTargetIds));
    assert.equal(plan.recordOnly, true);
    assert.deepEqual(plan.lifecycleRequest.targetIds, selectedTargetIds);
    assert.equal(plan.lifecycleRequest.recordOnly, true);
    assert.equal(plan.lifecycleRequest.casterId, "wizard");
    assert.equal(plan.lifecycleRequest.castContext.slotLevel, slotLevel);
  }
  // Beyond the spell's targets the panel opens, where the GM may lift the limit.
  const twoCounterspells = buildQuickActionSpellLaunchPlan({
    action: bookAction("counterspell"),
    sourceId: "wizard",
    selectedTargetIds: ["goblin", "orc"],
  });
  assert.equal(twoCounterspells.mode, "review");
  assert.equal(twoCounterspells.reason, "target-limit-exceeded");
  const self = buildQuickActionSpellLaunchPlan({ action: bookAction("wish", { targetMode: "self" }), sourceId: "wizard" });
  assert.equal(self.mode, "direct");
  assert.deepEqual(self.lifecycleRequest.targetIds, ["wizard"]);

  // An automated spell still asks for its target.
  const bless = buildQuickActionSpellLaunchPlan({ action: bookAction("bless"), sourceId: "cleric", selectedTargetIds: [] });
  assert.equal(bless.mode, "review");
  assert.equal(bless.recordOnly, undefined);
});

test("the lifecycle hands the executor a recorded request and what the cast spends", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "cure-wounds", castContext: { slotLevel: 2 } });
  const session = { ...createSpellPanelSession({ contract, casterId: "cleric" }), slotLevel: 2, targetIds: ["fighter"] };
  const request = buildSpellUnifiedLifecycleRequest({ contract, session });
  assert.equal(request.recordOnly, true);
  assert.deepEqual(request.targetIds, ["fighter"]);
  let received = null;
  const result = await executeSpellUnifiedLifecycle({
    contract,
    session,
    runtime: {
      executor: async (input) => { received = input; return []; },
      extraOperations: [{ type: "class-feature:adjust-resource" }],
      castCost: "slot di 2° livello",
    },
  });
  assert.equal(result.status, "committed");
  assert.equal(received.recordOnly, true);
  assert.equal(received.castCost, "slot di 2° livello");
  assert.equal(received.castContext.slotLevel, 2);
  assert.equal(received.extraOperations.length, 1);
});

test("the causality of a recorded cast names the spell, its slot, its targets and what it spent", () => {
  assert.equal(spellCastRecordLabel("Controincantesimo"), "Incantesimo: Controincantesimo");
  const causality = buildSpellCastRecordCausality({
    spellId: "counterspell",
    spellName: "Controincantesimo",
    slotLevel: 5,
    casterId: "wizard",
    casterName: "Ilse",
    targets: [{ id: "mage", name: "Mago nemico" }, { id: "" }],
    cost: "slot di 5° livello",
  });
  assert.equal(causality.eventType, "application/cast");
  assert.deepEqual(causality.cause, { kind: "spell", spellId: "counterspell", spellName: "Controincantesimo", slotLevel: 5 });
  assert.deepEqual(causality.actor, { id: "wizard", name: "Ilse", role: "caster" });
  assert.deepEqual(causality.targets, [{ id: "mage", name: "Mago nemico" }]);
  assert.equal(causality.recorded, true);
  assert.deepEqual(causality.cost, { label: "slot di 5° livello" });

  const cantrip = buildSpellCastRecordCausality({ spellId: "mending", spellName: "Riparare", slotLevel: 0, casterId: "wizard" });
  assert.equal(cantrip.cause.slotLevel, undefined, "a cantrip has no slot");
  assert.equal(Object.hasOwn(cantrip, "cost"), false, "nothing spent, nothing named");
  assert.equal(Object.hasOwn(cantrip, "targets"), false);

  assert.deepEqual(withSpellCastCost({ version: 1 }, " slot del Patto (3°) "), { version: 1, cost: { label: "slot del Patto (3°)" } });
  const untouched = { version: 1 };
  assert.equal(withSpellCastCost(untouched, ""), untouched);
});

test("the combat log shows what a recorded cast spent and that the table resolves it", () => {
  const causality = buildSpellCastRecordCausality({
    spellId: "counterspell",
    spellName: "Controincantesimo",
    slotLevel: 3,
    casterId: "wizard",
    casterName: "Ilse",
    targets: [{ id: "mage", name: "Mago nemico" }],
    cost: "slot di 3° livello",
  });
  const entry = buildSpellCastRecordLogEntry({ label: spellCastRecordLabel("Controincantesimo"), causality, at: 1_700_000_000_000 });
  assert.equal(entry.id, "", "no History entry behind it");
  assert.equal(entry.provenance.recordingSource, SPELL_CAST_RECORD_SOURCE);
  const event = { ...combatEventFromHistoryEntryV3(entry, { round: 2 }), id: "event-1", sequence: 1 };
  assert.equal(event.category, "spell");
  assert.equal(event.historyEntryId, "");
  const [presented] = buildCombatLogPresentation({ id: "session" }, [event]).events;
  assert.equal(presented.title || presented.label, "Incantesimo: Controincantesimo");
  const details = presented.details.flatMap((section) => section.lines).join(" | ");
  assert.match(details, /Livello slot: 3/u);
  assert.match(details, /Speso: slot di 3° livello/u);
  assert.match(details, /Effetti: risolti al tavolo/u);
  assert.match(details, /Mago nemico/u);
});
