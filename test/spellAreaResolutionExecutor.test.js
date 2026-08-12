import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellAreaResolutionCommand,
} from "../src/spellAreaResolutionCommandCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executorSource = fs.readFileSync(
  path.join(root, "src", "spellAreaResolutionExecutor.js"),
  "utf8",
);
const consoleSource = fs.readFileSync(
  path.join(root, "src", "quick-hp-modal.js"),
  "utf8",
);

function placementFor(contract, spellId) {
  const descriptor = contract.presentation?.placement;
  if (!descriptor?.ruleId || descriptor.policy === "automatic") return null;
  const rule = getSpellAreaRuleById(descriptor.ruleId);
  return {
    status: "confirmed",
    confirmed: true,
    ruleId: descriptor.ruleId,
    spellId,
    casterId: "caster-1",
    targetLocked: true,
    targetIds: ["target-1"],
    preview: {
      type: rule?.geometry?.shape || "circle",
      start: { x: 0, y: 0 },
      end: { x: 150, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
      targetIds: ["target-1"],
      targetLocked: true,
    },
  };
}

function commandFor(spellId, extra = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast" });
  const placement = extra.placement === undefined
    ? placementFor(contract, spellId)
    : extra.placement;
  const needsHp = contract.presentation?.inputs?.hp?.required === true
    || contract.presentation?.inputs?.damage?.required === true
    || contract.presentation?.inputs?.healing?.required === true;
  const targetIds = extra.targetIds || ["target-1"];
  const outcomes = Object.fromEntries(targetIds.map((id) => [id, "failed"]));
  return buildSpellAreaResolutionCommand({
    contract,
    spellId,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster-1",
    slotLevel: extra.slotLevel || 6,
    targetIds,
    candidateTargetIds: targetIds,
    primaryTargetId: extra.primaryTargetId || "",
    outcomes,
    placement,
    targetLocked: true,
    hp: needsHp ? { mode: "damage", amount: 12 } : undefined,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
    ...extra.input,
  });
}

test("l'executor ha un confine runtime e un risultato serializzabile", () => {
  assert.match(executorSource, /export async function executeSpellAreaResolution/);
  assert.match(executorSource, /buildSpellAreaResolutionExecutionPlan/);
  for (const field of [
    "status",
    "commandType",
    "spellId",
    "instanceId",
    "casterId",
    "changedIds",
    "hpChanges",
    "effectChanges",
    "sceneItemChanges",
    "triggerChanges",
    "historyEntryId",
    "undoAvailable",
    "visualEvents",
    "warnings",
    "errors",
  ]) {
    assert.match(executorSource, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(executorSource, /document\.|window\.|areaCandidate|duration\s*[<>=]/);
  assert.doesNotMatch(executorSource, /applyOperation\s*\(/);
  assert.match(executorSource, /history\.some\(\(entry\) => entry\?\.id === recordedEntry\.id\)/);
  assert.doesNotMatch(executorSource, /history\[history\.length - 1\]\?\.id === recordedEntry\.id/);
  assert.match(executorSource, /buildCallLightningCloudPlacement: async \(_casterId, preview\)/);
  assert.match(executorSource, /buildCallLightningCloudPreview\(preview\)/);
});

test("Palla di fuoco produce il comando area-transaction con placement required", () => {
  const command = commandFor("fireball");
  assert.equal(command.valid, true);
  assert.equal(command.execution.lane, "area-transaction");
  assert.equal(command.placement.policy, "required");
  assert.equal(command.placement.status, "confirmed");
  assert.equal(command.hp.mode, "damage");
  assert.equal(command.hp.amount, 12);
});

test("Invocare il fulmine usa il danno del primo fulmine", () => {
  const command = commandFor("call-lightning", { slotLevel: 3 });
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.hp.mode, "damage");
  assert.equal(command.hp.amount, 12);
  assert.equal(command.hp.outcomeFactors["target-1"], "full");

  const passed = commandFor("call-lightning", {
    slotLevel: 3,
    input: { outcomes: { "target-1": "passed" } },
  });
  assert.equal(passed.valid, true, passed.errors?.join(", "));
  assert.equal(passed.hp.outcomeFactors["target-1"], "half");
});

test("Anatema resta discreto e non inventa un placement", () => {
  const command = commandFor("bane", { placement: null, slotLevel: 1 });
  assert.equal(command.valid, true);
  assert.equal(command.execution.lane, "area-transaction");
  assert.equal(command.targeting.mode, "discrete");
  assert.equal(command.placement, null);
  assert.equal(command.hp.mode, "none");
});

test("un nuovo cast in concentrazione sostituisce sempre l'istanza precedente", () => {
  const start = executorSource.indexOf("concentrationAction = command?.source?.kind");
  const end = executorSource.indexOf("spellInstanceId =", start);
  const decision = executorSource.slice(start, end);
  assert.match(
    decision,
    /automation\?\.concentrationAction === "dismiss"[\s\S]*?\? "dismiss"[\s\S]*?: "replace"/,
  );
  assert.doesNotMatch(decision, /activeConcentration|"extend"/);
});

test("Allucinazione di Forza conserva il bersaglio manuale dopo il placement", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "phb2014-allucinazione-di-forza",
  });
  const placement = placementFor(contract, "phb2014-allucinazione-di-forza");
  placement.targetIds = ["bystander"];
  placement.preview.targetIds = ["bystander"];
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "phb2014-allucinazione-di-forza",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster-1",
    slotLevel: 2,
    targetIds: ["target-1"],
    candidateTargetIds: ["target-1", "bystander"],
    outcomes: { "target-1": "failed" },
    placement,
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.deepEqual(command.targeting.targetIds, ["target-1"]);
  assert.deepEqual(command.placement.targetIds, ["bystander"]);
});

test("Freccia acida usa l'esito attacco per applicare danno pieno o dimezzato", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "acid-arrow",
    phase: "cast",
  });
  for (const [variant, factor] of [["hit", "full"], ["miss", "half"]]) {
    const command = buildSpellAreaResolutionCommand({
      contract,
      spellId: "acid-arrow",
      phase: "cast",
      source: { kind: "cast", sceneEpoch: 3 },
      casterId: "caster-1",
      slotLevel: 3,
      variant,
      targetIds: ["target-1"],
      candidateTargetIds: ["target-1"],
      targetLocked: false,
      hp: { mode: "damage", amount: 10 },
      sceneEpoch: 3,
      currentSceneEpoch: 3,
      validateSpatial: false,
    });
    assert.equal(command.valid, true, variant);
    assert.equal(command.outcomes.attack, variant);
    assert.equal(command.hp.outcomeFactors["target-1"], factor);
  }
});

test("Catena di fulmini conserva il bersaglio primario", () => {
  const command = commandFor("chain-lightning", {
    placement: null,
    primaryTargetId: "target-1",
    slotLevel: 6,
  });
  assert.equal(command.valid, true);
  assert.equal(command.targeting.primaryTargetId, "target-1");
  assert.equal(command.execution.lane, "area-transaction");
});

test("Catena di fulmini mantiene il collegamento al visual anche senza effetti persistenti", () => {
  const branchStart = executorSource.indexOf('const chainLightningVisualTargetIds = uniqueIds(command?.targeting?.targetIds);');
  const branchEnd = executorSource.indexOf('} else if (spell.id === "banishment"', branchStart);
  const branch = executorSource.slice(branchStart, branchEnd);

  assert.ok(branchStart >= 0);
  assert.match(branch, /spell\.id === "chain-lightning" && chainLightningVisualTargetIds\.length/);
  assert.match(branch, /targetIds: chainLightningVisualTargetIds/);
  assert.doesNotMatch(branch, /resolved\.spellTargetIds\.length/);
});

test("Investitura automatica e Sfera opzionale non richiedono una sagoma fittizia", () => {
  const automatic = commandFor("xanathar-investitura-della-fiamma", {
    placement: null,
    targetIds: [],
    slotLevel: 6,
  });
  const optional = commandFor("xanathar-sfera-della-tempesta", {
    placement: null,
    slotLevel: 4,
  });
  assert.equal(automatic.valid, true);
  assert.equal(automatic.placement.policy, "automatic");
  assert.equal(optional.valid, true);
  assert.equal(optional.placement, null);
});

test("le aure self non richiedono bersagli discreti e persistono lo spell sul caster", () => {
  for (const spellId of ["phb2014-aura-di-purezza", "phb2014-aura-di-vita"]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast" });
    assert.equal(contract.presentation.inputs.targets.required, false, spellId);
    const command = commandFor(spellId, {
      placement: null,
      targetIds: [],
    });
    assert.equal(command.valid, true, `${spellId}: ${command.errors?.join(", ")}`);
  }
  const branchStart = executorSource.indexOf("if ((mobileAura || boardToken) && casterId)");
  const branchEnd = executorSource.indexOf("const effectSubjectIds", branchStart);
  const branch = executorSource.slice(branchStart, branchEnd);
  assert.match(branch, /mobileAura && placementRule\?\.targeting\?\.confirmTargets === false/);
  assert.match(branch, /resolved\.spellTargetIds = .*\? \[casterId\]/s);
});

test("board token usa la lane lifecycle dichiarata dal contratto", () => {
  const command = commandFor("arcane-hand", { slotLevel: 5 });
  assert.equal(command.valid, true);
  assert.equal(command.execution.lane, "spell-lifecycle");
  assert.equal(command.execution.hasTokens, true);
  assert.equal(command.placement.ruleId, "arcane-hand:board-token");
});

test("Animare oggetti valida la composizione e serializza tutte le posizioni", () => {
  const castContext = {
    slotLevel: 5,
    animatedObjects: { counts: { tiny: 1, large: 1 } },
  };
  const contract = buildSpellUnifiedPanelContract({
    spellId: "animate-objects",
    phase: "cast",
    castContext,
  });
  const placement = {
    status: "confirmed",
    confirmed: true,
    ruleId: "animate-objects:board-token",
    spellId: "animate-objects",
    casterId: "caster-1",
    targetLocked: true,
    preview: {
      type: "square",
      start: { x: 0, y: 0 },
      end: { x: 150, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
      position: { x: 75, y: 75 },
      positions: [
        { objectSize: "tiny", ordinal: 0, position: { x: 75, y: 75 } },
        { objectSize: "large", ordinal: 1, position: { x: 300, y: 300 } },
      ],
    },
  };
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "animate-objects",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster-1",
    slotLevel: 5,
    castContext,
    targetIds: [],
    candidateTargetIds: [],
    targetLocked: true,
    placement,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.deepEqual(command.spell.castContext, castContext);
  assert.deepEqual(command.placement.preview.positions, placement.preview.positions);
  assert.equal(command.execution.hasTokens, true);

  const missingComposition = buildSpellAreaResolutionCommand({
    ...command,
    contract: buildSpellUnifiedPanelContract({ spellId: "animate-objects" }),
    spell: undefined,
    castContext: undefined,
  });
  assert.equal(missingComposition.valid, false);
  assert.ok(missingComposition.errors.includes("composition-required"));
});

test("il comando conserva il contesto di una zone trigger senza eseguirlo", () => {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "xanathar-sfera-della-tempesta",
    phase: "cast",
  });
  const command = buildSpellAreaResolutionCommand({
    contract,
    source: { kind: "zone-trigger", sceneEpoch: 7, activationId: "activation-1" },
    sceneEpoch: 7,
    expectedSceneEpoch: 7,
    expectedZoneInstanceId: "zone-instance-1",
    casterId: "caster-1",
    slotLevel: 4,
    zoneTrigger: {
      activationId: "activation-1",
      instanceId: "zone-instance-1",
      spellId: "xanathar-sfera-della-tempesta",
      casterId: "caster-1",
      zoneItemId: "zone-root",
      zoneItemIds: ["zone-root", "zone-geometry"],
      targetIds: ["target-1"],
      targetLocked: true,
      sceneEpoch: 7,
      ruleId: "xanathar-sfera-della-tempesta:cast",
      resolution: "manual-save",
    },
    outcomes: { "target-1": "failed" },
    hpAmount: 8,
  });
  assert.equal(command.valid, true);
  assert.deepEqual(command.execution.zoneTrigger.zoneItemIds, [
    "zone-root",
    "zone-geometry",
  ]);
  assert.equal(command.execution.zoneTrigger.zoneItemId, "zone-root");
});

test("la Console manuale non contiene più il ramo spell e mantiene le lane manuali", () => {
  assert.doesNotMatch(consoleSource, /executeSpellAreaResolution|buildSpellAreaResolutionCommand/);
  assert.match(consoleSource, /conditionMutationOperations/);
  assert.match(consoleSource, /QUICK_HP_MODES\.DAMAGE/);
  assert.match(consoleSource, /QUICK_HP_MODES\.HEAL/);
  assert.match(consoleSource, /undoHistoryThrough/);
});
