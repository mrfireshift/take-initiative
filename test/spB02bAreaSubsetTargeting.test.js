import assert from "node:assert/strict";
import test from "node:test";
import { getSpellAreaRuleById, SPELL_AREA_SELECTION_MODES } from "../src/spellAreaRules.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import {
  buildSpellAreaResolutionCommand,
  SPELL_AREA_RESOLUTION_ERROR_CODES,
} from "../src/spellAreaResolutionCommandCore.js";
import { areaMembershipTargetIds } from "../src/spellAreaMembershipCore.js";

const TARGET_CANDIDATES = [
  { key: "caster-1", label: "Caster", hp: 50, hpMax: 50, faction: "pc" },
  { key: "enemy-a", label: "Enemy A", hp: 30, hpMax: 30, faction: "enemy" },
  { key: "enemy-b", label: "Enemy B", hp: 30, hpMax: 30, faction: "enemy" },
  { key: "ally-c", label: "Ally C", hp: 40, hpMax: 40, faction: "ally" },
  { key: "outside-token", label: "Outside Token", hp: 20, hpMax: 20, faction: "enemy" },
];

function contract(spellId) {
  return buildSpellUnifiedPanelContract({ spellId });
}

function modelFor(spellId, sessionPatch = {}, candidates = TARGET_CANDIDATES) {
  const currentContract = contract(spellId);
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster-1",
    ...sessionPatch,
  });
  return buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    selectedCatalogKey: spellId,
    casterOptions: [{ value: "caster-1", label: "Caster" }],
    targetCandidates: candidates,
  });
}

function commandFor(spellId, {
  targetIds = ["enemy-a"],
  candidateTargetIds = ["enemy-a", "enemy-b", "ally-c"],
  outcomes = { "enemy-a": "failed" },
  hpAmount = 30,
  slotLevel = 5,
  placement = null,
} = {}) {
  const currentContract = contract(spellId);
  return buildSpellAreaResolutionCommand({
    contract: currentContract,
    casterId: "caster-1",
    slotLevel,
    targetIds,
    candidateTargetIds,
    outcomes,
    hpAmount,
    placement: placement || {
      status: "confirmed",
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-1",
      preview: {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 0 },
        gridOrigin: { x: 0, y: 0 },
        targetIds: candidateTargetIds,
      },
    },
  });
}

// ============================================================================
// SP-B02B.1 CONTRACT & SPELL AREA RULE
// ============================================================================

test("SP-B02B.1: SPELL_AREA_SELECTION_MODES include 'area-subset'", () => {
  assert.ok(SPELL_AREA_SELECTION_MODES.includes("area-subset"), "area-subset must be a recognized selectionMode");
});

test("SP-B02B.1: Onda Distruttiva dichiara selectionMode: 'area-subset' preservando filter: 'all' e includeCaster: false", () => {
  const rule = getSpellAreaRuleById("phb2014-onda-distruttiva:cast");
  assert.ok(rule, "phb2014-onda-distruttiva:cast must exist");
  assert.equal(rule.targeting.selectionMode, "area-subset");
  assert.equal(rule.targeting.filter, "all");
  assert.equal(rule.targeting.includeCaster, false);
  assert.equal(rule.targeting.confirmTargets, true);

  const panelContract = contract("phb2014-onda-distruttiva");
  assert.equal(panelContract.presentation.targeting.selectionMode, "area-subset");
  assert.equal(panelContract.presentation.targeting.includeCaster, false);
});

// ============================================================================
// RED TEST R1: ARBITRARY SUBSET SELECTION & READINESS
// ============================================================================

test("SP-B02B.1 R1: Arbitrary subset - geometric [enemy-A, enemy-B, ally-C], select [enemy-A], CAST ready", () => {
  const spellId = "phb2014-onda-distruttiva";
  const view = modelFor(spellId, {
    targetIds: ["enemy-a"],
    outcomes: { "enemy-a": "failed" },
    hpValues: { damage: 30 },
    placement: {
      confirmed: true,
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-1",
      targetIds: ["enemy-a", "enemy-b", "ally-c"],
      preview: { targetIds: ["enemy-a", "enemy-b", "ally-c"] },
    },
  });

  assert.equal(view.workflow.validation.valid, true, `Validation errors: ${view.workflow.validation.errors.join(", ")}`);
  assert.equal(view.workflow.validation.firstInvalidField, null);
  assert.equal(view.workflow.primaryAction.disabled, false);
  assert.equal(view.workflow.primaryAction.label, "Applica a 1 bersaglio");

  const cmd = commandFor(spellId, {
    targetIds: ["enemy-a"],
    candidateTargetIds: ["enemy-a", "enemy-b", "ally-c"],
    outcomes: { "enemy-a": "failed" },
    hpAmount: 30,
  });
  assert.equal(cmd.valid, true, `Command errors: ${cmd.errors?.join(", ")}`);
  assert.deepEqual(cmd.targeting.targetIds, ["enemy-a"]);
  assert.deepEqual(cmd.hp.targetIds, ["enemy-a"]);
  assert.equal(cmd.hp.outcomeFactors["enemy-a"], "full");
  assert.equal(cmd.hp.outcomeFactors["enemy-b"], undefined);
  assert.equal(cmd.hp.outcomeFactors["ally-c"], undefined);
});

// ============================================================================
// RED TEST R2: ALLY SELECTION (PREVENTS 'HOSTILE-ONLY' SHORTCUT)
// ============================================================================

test("SP-B02B.1 R2: Ally selection - geometric [enemy-A, ally-C], select [ally-C], valid and targeted", () => {
  const spellId = "phb2014-onda-distruttiva";
  const view = modelFor(spellId, {
    targetIds: ["ally-c"],
    outcomes: { "ally-c": "failed" },
    hpValues: { damage: 30 },
    placement: {
      confirmed: true,
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-1",
      targetIds: ["enemy-a", "ally-c"],
      preview: { targetIds: ["enemy-a", "ally-c"] },
    },
  });

  assert.equal(view.workflow.validation.valid, true);
  assert.equal(view.workflow.primaryAction.disabled, false);

  const cmd = commandFor(spellId, {
    targetIds: ["ally-c"],
    candidateTargetIds: ["enemy-a", "ally-c"],
    outcomes: { "ally-c": "failed" },
    hpAmount: 30,
  });
  assert.equal(cmd.valid, true);
  assert.deepEqual(cmd.targeting.targetIds, ["ally-c"]);
  assert.deepEqual(cmd.hp.targetIds, ["ally-c"]);
  assert.equal(cmd.hp.outcomeFactors["ally-c"], "full");
  assert.equal(cmd.resolution?.conditionApplications?.[0]?.conditionName, "Prono");
  assert.deepEqual(cmd.resolution?.conditionApplications?.[0]?.targetIds, ["ally-c"]);
});

// ============================================================================
// RED TEST R3: HOSTILE DESELECTION
// ============================================================================

test("SP-B02B.1 R3: Hostile deselection - geometric [enemy-A, enemy-B], select [enemy-A], enemy-B requires no outcome and gets no mutation", () => {
  const spellId = "phb2014-onda-distruttiva";
  const view = modelFor(spellId, {
    targetIds: ["enemy-a"],
    outcomes: { "enemy-a": "passed" },
    hpValues: { damage: 30 },
    placement: {
      confirmed: true,
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-1",
      targetIds: ["enemy-a", "enemy-b"],
      preview: { targetIds: ["enemy-a", "enemy-b"] },
    },
  });

  assert.equal(view.workflow.validation.valid, true);
  assert.equal(view.workflow.primaryAction.disabled, false);

  const cmd = commandFor(spellId, {
    targetIds: ["enemy-a"],
    candidateTargetIds: ["enemy-a", "enemy-b"],
    outcomes: { "enemy-a": "passed" },
    hpAmount: 30,
  });
  assert.equal(cmd.valid, true);
  assert.deepEqual(cmd.targeting.targetIds, ["enemy-a"]);
  assert.equal(cmd.hp.outcomeFactors["enemy-a"], "half");
  assert.equal(cmd.hp.outcomeFactors["enemy-b"], undefined);
  assert.equal(cmd.resolution?.conditionApplications?.length || 0, 0);
});

// ============================================================================
// RED TEST R4: CASTER EXCLUSION
// ============================================================================

test("SP-B02B.1 R4: Caster exclusion - caster is not a candidate and not selectable", () => {
  const spellId = "phb2014-onda-distruttiva";
  const rule = getSpellAreaRuleById(`${spellId}:cast`);
  const metaKey = "com.thebigpicture.initiative/meta";
  const bounds = (x, y, size = 100) => ({ min: { x, y }, max: { x: x + size, y: y + size } });
  const token = (id, attitude = "enemy") => ({ id, metadata: { [metaKey]: { attitude } } });

  const geometricTargetIds = areaMembershipTargetIds({
    sourceId: "caster-1",
    rule,
    area: { cells: [{ x: 0, y: 0, width: 600, height: 600 }] },
    metaKey,
    candidates: [
      { item: token("caster-1", "pc"), bounds: bounds(0, 0) },
      { item: token("enemy-a", "enemy"), bounds: bounds(100, 0) },
      { item: token("ally-c", "ally"), bounds: bounds(200, 0) },
    ],
  });

  assert.equal(geometricTargetIds.includes("caster-1"), false);
  assert.deepEqual(geometricTargetIds, ["enemy-a", "ally-c"]);
});

// ============================================================================
// RED TEST R5: OUTSIDE GEOMETRY REJECTION (SECURITY / CORE CONTRACT)
// ============================================================================

test("SP-B02B.1 R5: Outside geometry rejection - command with targetIds not in candidateTargetIds is invalid", () => {
  const spellId = "phb2014-onda-distruttiva";
  const invalidCmd = commandFor(spellId, {
    targetIds: ["enemy-a", "outside-token"],
    candidateTargetIds: ["enemy-a", "enemy-b", "ally-c"],
    outcomes: { "enemy-a": "failed", "outside-token": "failed" },
    hpAmount: 30,
  });

  assert.equal(invalidCmd.valid, false);
  assert.ok(
    invalidCmd.errors.includes(SPELL_AREA_RESOLUTION_ERROR_CODES.PLACEMENT_TARGET_NOT_CANDIDATE),
    `Must have PLACEMENT_TARGET_NOT_CANDIDATE error, got: ${invalidCmd.errors.join(", ")}`,
  );
});

// ============================================================================
// RED TEST R6: MIXED OUTCOMES RESOLUTION
// ============================================================================

test("SP-B02B.1 R6: Mixed outcomes - enemy-A failed, ally-C passed -> A gets full + Prono, C gets half + no Prono", () => {
  const spellId = "phb2014-onda-distruttiva";
  const cmd = commandFor(spellId, {
    targetIds: ["enemy-a", "ally-c"],
    candidateTargetIds: ["enemy-a", "enemy-b", "ally-c"],
    outcomes: { "enemy-a": "failed", "ally-c": "passed" },
    hpAmount: 30,
  });

  assert.equal(cmd.valid, true);
  assert.equal(cmd.hp.outcomeFactors["enemy-a"], "full");
  assert.equal(cmd.hp.outcomeFactors["ally-c"], "half");
  assert.equal(cmd.hp.outcomeFactors["enemy-b"], undefined);

  assert.equal(cmd.resolution?.conditionApplications?.length, 1);
  assert.equal(cmd.resolution.conditionApplications[0].conditionName, "Prono");
  assert.deepEqual(cmd.resolution.conditionApplications[0].targetIds, ["enemy-a"]);
});

// ============================================================================
// RED TEST R7: NORMAL AREA REGRESSION (FIREBALL REMAINS LOCKED)
// ============================================================================

test("SP-B02B.1 R7: Fireball normal area regression - selectionMode: 'area' keeps targetLocked and all geometric targets", () => {
  const spellId = "fireball";
  const panelContract = contract(spellId);
  assert.equal(panelContract.presentation.targeting.selectionMode, "area");

  const view = modelFor(spellId, {
    targetIds: ["enemy-a", "enemy-b"],
    placement: {
      confirmed: true,
      targetLocked: true,
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-1",
      targetIds: ["enemy-a", "enemy-b"],
      preview: { targetIds: ["enemy-a", "enemy-b"] },
    },
  });

  // Normal area spell has candidates disabled (locked to geometry)
  assert.equal(view.workflow.placement.targetLocked, true);
  const candidateA = view.targets.candidates.find((c) => c.key === "enemy-a");
  assert.equal(candidateA.disabled, true);
});

// ============================================================================
// RED TEST R8: MANUAL REGRESSION (PHANTASMAL FORCE)
// ============================================================================

test("SP-B02B.1 R8: Phantasmal Force manual regression - selectionMode: 'manual' remains unchanged", () => {
  const spellId = "phb2014-allucinazione-di-forza";
  const rule = getSpellAreaRuleById(`${spellId}:cast`);
  assert.equal(rule.targeting.selectionMode, "manual");
  const panelContract = contract(spellId);
  assert.equal(panelContract.presentation.targeting.selectionMode, "manual");
});

// ============================================================================
// RED TEST EDGE CASE: RECONCILE / CANDIDATE REFRESH
// ============================================================================

test("SP-B02B.1 Edge Case: Candidate refresh removes target that is no longer within area geometry", () => {
  const spellId = "phb2014-onda-distruttiva";
  // Initial candidates [A, B, C], selected [A, C]
  // Refreshed candidates [A, B] -> C is outside geometry and cannot remain selected
  const view = modelFor(spellId, {
    targetIds: ["enemy-a"], // C is removed from selected
    outcomes: { "enemy-a": "failed" },
    hpValues: { damage: 30 },
    placement: {
      confirmed: true,
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-1",
      targetIds: ["enemy-a", "enemy-b"], // C is not in new placement
      preview: { targetIds: ["enemy-a", "enemy-b"] },
    },
  });

  const candidateC = view.targets.candidates.find((c) => c.key === "ally-c");
  assert.equal(candidateC.disabled, true, "Token outside placement geometry must be disabled");
  assert.equal(candidateC.eligible, false, "Token outside placement geometry must not be eligible");
  assert.equal(candidateC.selected, false, "Token outside placement geometry must not be selected");
});
