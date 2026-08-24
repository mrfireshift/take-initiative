import test from "node:test";
import assert from "node:assert/strict";

import {
  auditTargetingCapacityEntries,
  resolveTargetingCapacity,
} from "../src/spellTargetingCapacityCore.js";
import {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
  changeSpellPanelSpell,
  createSpellPanelSession,
  updateSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import {
  buildSpellAreaResolutionCommand,
} from "../src/spellAreaResolutionCommandCore.js";
import { getSpellDefinition, getSpellCatalog } from "../src/spells-srd.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";

const targets = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
  { key: "d", label: "D" },
  { key: "e", label: "E" },
];

function contract(spellId, options = {}) {
  return buildSpellUnifiedPanelContract({ spellId, ...options });
}

function view(spellId, sessionPatch = {}, options = {}) {
  const currentContract = contract(spellId, options.contractOptions);
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster",
    ...sessionPatch,
  });
  return {
    contract: currentContract,
    session,
    model: buildUnifiedPanelViewModel({
      contract: currentContract,
      session,
      targetCandidates: targets,
    }),
  };
}

test("un discrete senza override deriva il massimo RAW 1", () => {
  const model = contract("charm-person");
  assert.equal(getSpellDefinition("charm-person").targeting, undefined);
  assert.equal(model.presentation.targeting.limit.maximum, 1);
  assert.equal(model.presentation.targeting.limit.classification, "single-target-default");
});

test("un fixed multi-target dichiara il cap numerico", () => {
  const model = contract("aid");
  assert.equal(model.presentation.targeting.limit.maximum, 3);
  assert.equal(model.presentation.targeting.limit.classification, "fixed-multi-target");
  const massPolymorph = contract("xanathar-metamorfosi-di-massa");
  assert.equal(massPolymorph.presentation.targeting.limit.maximum, 10);
  assert.equal(massPolymorph.presentation.targeting.limit.classification, "fixed-multi-target");
});

test("lo scaling lineare usa slot e resolver centrale", () => {
  assert.equal(contract("bless", { castContext: { slotLevel: 1 } })
    .presentation.targeting.limit.maximum, 3);
  assert.equal(contract("bless", { castContext: { slotLevel: 3 } })
    .presentation.targeting.limit.maximum, 5);
  assert.equal(contract("magic-missile", { castContext: { slotLevel: 4 } })
    .presentation.targeting.limit.maximum, 6);
});

test("Etherealness usa il resolver special/non-lineare dei passeggeri", () => {
  assert.equal(contract("etherealness", { castContext: { slotLevel: 7 } })
    .presentation.targeting.limit.maximum, 1);
  assert.equal(contract("etherealness", { castContext: { slotLevel: 8 } })
    .presentation.targeting.limit.maximum, 3);
  assert.equal(contract("etherealness", { castContext: { slotLevel: 9 } })
    .presentation.targeting.limit.maximum, 6);
  assert.equal(contract("etherealness", { castContext: { slotLevel: 9 } })
    .presentation.targeting.limit.classification, "special/non-linear");
});

test("unbounded e maximum null esplicito non sono la stessa cosa", () => {
  assert.equal(contract("compulsion").presentation.targeting.limit.maximum, null);
  assert.equal(contract("compulsion").presentation.targeting.limit.classification, "unbounded");
  const ambiguous = resolveTargetingCapacity({
    mode: "discrete",
    declaration: { maximum: null },
  });
  assert.equal(ambiguous.maximum, null);
  assert.ok(ambiguous.errors.includes("maximum-null-without-unbounded"));
});

test("un'area senza cap numerico non riceve il default discreto", () => {
  const model = contract("fireball");
  assert.equal(model.presentation.targeting.mode, "geometric");
  assert.equal(model.presentation.targeting.limit.maximum, null);
  assert.equal(model.presentation.targeting.limit.bypassable, false);
});

test("Slow conserva geometria area-subset e massimo 6 insieme", () => {
  const model = contract("slow", { castContext: { slotLevel: 3 } });
  assert.equal(model.presentation.targeting.mode, "geometric");
  assert.equal(model.presentation.targeting.selectionMode, "area-subset");
  assert.equal(model.presentation.targeting.limit.maximum, 6);
});

test("Ice Knife mantiene il primario discreto senza trasformare lo splash in cap", () => {
  const model = contract("xanathar-coltello-di-ghiaccio");
  assert.equal(model.presentation.targeting.primaryTarget.required, true);
  assert.equal(model.presentation.targeting.primaryTarget.maximum, 1);
  assert.equal(model.presentation.targeting.limit.maximum, null);
});

test("Magic Missile, Scorching Ray ed Eldritch Blast contano token unici", () => {
  assert.equal(contract("magic-missile", { castContext: { slotLevel: 3 } })
    .presentation.targeting.limit.maximum, 5);
  assert.equal(contract("scorching-ray", { castContext: { slotLevel: 4 } })
    .presentation.targeting.limit.maximum, 5);
  assert.equal(contract("eldritch-blast", { castContext: { characterLevel: 17 } })
    .presentation.targeting.limit.maximum, 4);
});

test("a cap raggiunto disabilita solo i candidati nuovi", () => {
  const result = view("charm-person", { targetIds: ["a"] });
  assert.equal(result.model.targets.candidates.find((target) => target.key === "a").disabled, false);
  assert.equal(result.model.targets.candidates.find((target) => target.key === "b").disabled, true);
});

test("il bypass ON riabilita i candidati senza alterare quelli già scelti", () => {
  const result = view("charm-person", {
    targetIds: ["a", "b"],
    ignoreTargetLimit: true,
  });
  assert.equal(result.model.targets.limit.effectiveMaximum, null);
  assert.equal(result.model.targets.candidates.find((target) => target.key === "a").selected, true);
  assert.equal(result.model.targets.candidates.find((target) => target.key === "b").disabled, false);
  assert.equal(result.model.workflow.validation.errors.includes("target-limit-exceeded"), false);
});

function baneCommand(ignoreTargetLimit) {
  const spellContract = contract("bane");
  return buildSpellAreaResolutionCommand({
    contract: spellContract,
    spellId: "bane",
    phase: "cast",
    sourceKind: "cast",
    casterId: "caster",
    slotLevel: 1,
    targetIds: ["a", "b", "c", "d"],
    outcomes: { a: "failed", b: "failed", c: "failed", d: "failed" },
    ignoreTargetLimit,
  });
}

test("command validation rifiuta oltre cap con bypass OFF", () => {
  const command = baneCommand(false);
  assert.equal(command.valid, false);
  assert.ok(command.errors.includes("target-limit-exceeded"));
});

test("la stessa command validation passa oltre cap con bypass ON", () => {
  const command = baneCommand(true);
  assert.equal(command.valid, true);
  assert.equal(command.targeting.ignoreTargetLimit, true);
  assert.equal(command.targeting.capacity.effectiveMaximum, null);
});

test("disattivare il bypass non deseleziona e blocca la conferma", () => {
  const result = view("charm-person", {
    targetIds: ["a", "b"],
    ignoreTargetLimit: false,
  });
  assert.deepEqual(result.session.targetIds, ["a", "b"]);
  assert.equal(result.model.targets.countLabel, "2/1 bersagli");
  assert.match(result.model.targets.limitWarning, /Riduci/);
  assert.equal(result.model.workflow.validation.valid, false);
  assert.ok(result.model.workflow.validation.errors.includes("target-limit-exceeded"));
});

test("ridurre lo slot conserva la selezione eccedente e rende la conferma invalida", () => {
  const slotThree = contract("bless", { castContext: { slotLevel: 3 } });
  const slotOne = contract("bless", { castContext: { slotLevel: 1 } });
  const session = createSpellPanelSession({
    contract: slotThree,
    casterId: "caster",
    slotLevel: 3,
    targetIds: ["a", "b", "c", "d", "e"],
  });
  const reduced = updateSpellPanelSession(session, {
    contract: slotOne,
    slotLevel: 1,
    castContext: { slotLevel: 1 },
  });
  const model = buildUnifiedPanelViewModel({
    contract: slotOne,
    session: reduced,
    targetCandidates: targets,
  });
  assert.deepEqual(reduced.targetIds, ["a", "b", "c", "d", "e"]);
  assert.equal(model.targets.countLabel, "5/3 bersagli");
  assert.equal(model.workflow.validation.valid, false);
});

test("una nuova resolution parte sempre con ignoreTargetLimit false", () => {
  const currentContract = contract("charm-person");
  const current = createSpellPanelSession({
    contract: currentContract,
    ignoreTargetLimit: true,
    targetIds: ["a", "b"],
  });
  const next = changeSpellPanelSpell(current, contract("aid"));
  assert.equal(current.ignoreTargetLimit, true);
  assert.equal(next.ignoreTargetLimit, false);
});

test("single-target e AoE mantengono i loro picker distinti", () => {
  const single = view("charm-person", { targetIds: ["a"] });
  const area = view("fireball", { targetIds: ["a", "b"] });
  assert.equal(single.model.targets.mode, "discrete");
  assert.equal(single.model.targets.candidates.find((target) => target.key === "b").disabled, true);
  assert.equal(area.model.targets.mode, "geometric");
  assert.equal(area.model.targets.limit.bypassable, false);
});

test("l'audit catalogo garantisce il bounded-by-default delle discrete", () => {
  const entries = getSpellCatalog().map((spell) => {
    const model = contract(spell.id, { castContext: { slotLevel: 9, characterLevel: 20 } });
    const targeting = model.presentation.targeting;
    const workflow = getSpellSaveWorkflowRule(spell.id);
    return {
      id: spell.id,
      mode: targeting.mode,
      initialTargeting: targeting.mode === "discrete",
      targeting: workflow || spell.targeting
        || (targeting.mode === "discrete" ? targeting.limit : null),
    };
  });
  const audit = auditTargetingCapacityEntries(entries);
  assert.equal(audit.valid, true, JSON.stringify(audit.violations));
  assert.equal(audit.violations.length, 0);
});
