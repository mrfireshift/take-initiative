import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ID } from "../src/constants.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import {
  buildSpellUnifiedPanelContract,
  changeSpellPanelVariant,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { resolveDamageEndsConditionRemovals } from "../src/hpConditionRulesCore.js";
import {
  getSpellResolutionAction,
  buildSpellActiveResolutionFailureOperations,
  buildSpellActiveResolutionSuccessOperations,
} from "../src/spellActiveResolutionCore.js";
import {
  buildEffectSaveReminderResolution,
} from "../src/reminderResolutionCore.js";
import {
  normalizeEffectSaveReminder,
} from "../src/effectSaveReminderCore.js";
import {
  spellTurnPromptRequests,
  spellTurnPromptSelectedCandidateId,
} from "../src/callLightningTurnPromptCore.js";
import { __compactEffectItems } from "../src/initiativeCardCompact.js";

const SPELL_ID = "eyebite";
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const TURN_CHOICE_SOURCE = readFileSync(new URL("../src/spell-turn-action-choice.js", import.meta.url), "utf8");
const TURN_CHOICE_HTML = readFileSync(new URL("../spell-turn-action-choice.html", import.meta.url), "utf8");
const TURN_CONTROLLER_SOURCE = readFileSync(new URL("../src/callLightningTurnPromptController.js", import.meta.url), "utf8");
const CONDITIONS_SOURCE = readFileSync(new URL("../src/conditions.js", import.meta.url), "utf8");

function contract(choice = "eyebite-asleep") {
  return buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    choiceValue: choice,
    castContext: { slotLevel: 6 },
  });
}

function castCommand({ choice = "eyebite-asleep", outcome = "" } = {}) {
  const outcomes = outcome ? { target: outcome } : {};
  return buildSpellAreaResolutionCommand({
    contract: contract(choice),
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 7 },
    casterId: "caster",
    slotLevel: 6,
    choiceValue: choice,
    targetIds: ["target"],
    candidateTargetIds: ["target"],
    outcomes,
    casterDistancesMeters: { target: 12 },
    sceneEpoch: 7,
    currentSceneEpoch: 7,
  });
}

test("SP-B06A.1 — cast: tre varianti e griglia TS a due esiti senza Immune", () => {
  const model = contract();
  const rule = getSpellSaveWorkflowRule(SPELL_ID);

  assert.equal(rule.ability, "wis");
  assert.equal(rule.manualSaveAtTable, true);
  assert.equal(rule.assumedOutcome, "failed");
  assert.deepEqual(rule.outcomeOptions, ["passed", "failed"]);
  assert.equal(rule.preserveTargetsOnChoiceChange, true);
  assert.deepEqual(rule.persistence, { owner: "caster" });
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.spatial.mode, "caster-range");
  assert.equal(rule.targeting.spatial.maxMeters, 18);

  assert.deepEqual(
    model.presentation.variant.options.map((option) => option.value),
    ["eyebite-asleep", "eyebite-panicked", "eyebite-sickened"],
  );
  assert.equal(model.presentation.variant.preserveTargets, true);
  assert.equal(model.presentation.inputs.targets.maximum, 1);
  assert.equal(model.presentation.inputs.outcomes.required, true);
  assert.equal(model.presentation.inputs.outcomes.visible, true);
  assert.deepEqual(model.presentation.outcomes.options, [
    { value: "passed", label: "Superato" },
    { value: "failed", label: "Fallito" },
  ]);
  assert.equal(model.presentation.inputs.damage.visible, false);
});

test("SP-B06A.1 — Fallito applica la variante; Superato applica il marker visibile di immunità", () => {
  const missing = castCommand({ choice: "eyebite-asleep" });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("outcomes-incomplete"));

  const asleep = castCommand({ choice: "eyebite-asleep", outcome: "failed" });
  assert.equal(asleep.valid, true, asleep.errors?.join(", "));
  assert.deepEqual(asleep.resolution.persistence, { owner: "caster" });
  assert.equal(asleep.resolution.conditionApplications.length, 1);
  assert.equal(asleep.resolution.conditionApplications[0].conditionName, "Privo di sensi");
  assert.equal(asleep.resolution.conditionApplications[0].options.mechanics.endsOnDamage, true);

  const passed = castCommand({ choice: "eyebite-panicked", outcome: "passed" });
  assert.equal(passed.valid, true, passed.errors?.join(", "));
  assert.equal(passed.resolution.conditionApplications.length, 1);
  assert.equal(passed.resolution.conditionApplications[0].conditionName, "Immune a Sguardo penetrante");
  assert.equal(passed.resolution.conditionApplications[0].options.effectId, "eyebite-resisted");
  assert.equal(passed.resolution.conditionApplications[0].options.effectKind, undefined);
  assert.equal(passed.resolution.conditionApplications[0].options.mapVisible, undefined);
  assert.deepEqual(passed.resolution.conditionApplications[0].options.expiry, { mode: "concentration" });
});

test("SP-B06A.1 — cambiare variante conserva il bersaglio selezionato", () => {
  const initialContract = contract("eyebite-asleep");
  const session = createSpellPanelSession({
    contract: initialContract,
    spellId: SPELL_ID,
    casterId: "caster",
    targetIds: ["target"],
    variant: "eyebite-asleep",
    slotLevel: 6,
  });
  const nextContract = contract("eyebite-panicked");
  const next = changeSpellPanelVariant(session, nextContract, "eyebite-panicked");
  assert.deepEqual(next.targetIds, ["target"]);
  assert.equal(next.variant, "eyebite-panicked");
  assert.deepEqual(next.outcomes, {});
});

test("SP-B06A.1 — il parent resta sul caster e la fine della concentrazione pulisce tutti i child effect", () => {
  const currentSpell = getSpellDefinition(SPELL_ID);
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell: currentSpell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    automation: getAreaSaveAutomation(currentSpell),
    saveWorkflowRule: rule,
    slotLevel: 6,
    choiceValue: "eyebite-asleep",
    casterDistancesMeters: { target: 12 },
    validateSpatial: false,
  });
  assert.equal(resolution.valid, true, resolution.errors?.join(", "));
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "eyebite-1",
    casterName: "Caster",
    turns: 10,
    spellExpiry: { mode: "concentration" },
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    castContext: { slotLevel: 6 },
  }).map((operation, index) => {
    const operationId = `eyebite-${index}`;
    const targetIds = operation.targetIds || [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:spell:${id}`])),
      };
    }
    if (operation.type === "condition:add") {
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:condition:${id}`])),
      };
    }
    return { ...operation, operationId };
  });
  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], concentrations: {}, conditions: [] },
    { id: "target", spells: [], concentrations: {}, conditions: [] },
  ], operations);
  const caster = initial.states.find((entry) => entry.id === "caster");
  const target = initial.states.find((entry) => entry.id === "target");
  assert.equal(caster.spells.length, 1);
  assert.equal(caster.spells[0].instanceId, "eyebite-1");
  assert.equal(target.spells.length, 0);
  const asleep = target.conditions.find((condition) => condition.effectId === "eyebite-asleep");
  assert.ok(asleep);
  assert.equal(asleep.parentEffectId, "eyebite-1");
  const prone = target.conditions.find((condition) => condition.condition === "Prono");
  assert.ok(prone);
  assert.equal(prone.parentEffectId || "", "");
  assert.equal(prone.effectId || "", "");
  assert.equal(prone.mechanics?.endsOnDamage, undefined);
  // Il vero percorso HP usa resolveDamageEndsConditionRemovals: soltanto
  // Privo di sensi deve essere selezionato, mai il Prono automatico.
  assert.deepEqual(resolveDamageEndsConditionRemovals(target.conditions), [asleep.id]);

  const wokeFromDamage = buildEffectsMutationPlan(initial.states, [{
    type: "condition:remove-instances",
    operationId: "eyebite-damage-wakeup",
    removals: [{ itemId: "target", instanceId: asleep.id }],
  }]);
  const wokeTarget = wokeFromDamage.states.find((entry) => entry.id === "target");
  assert.equal(wokeTarget.conditions.some((condition) => condition.condition === "Privo di sensi"), false);
  assert.equal(wokeTarget.conditions.some((condition) => condition.condition === "Prono"), true);

  const ended = buildEffectsMutationPlan(initial.states, [{
    type: "concentration:break",
    operationId: "end-eyebite",
    casterIds: ["caster"],
    reference: "eyebite-1",
  }]);
  const endedCaster = ended.states.find((entry) => entry.id === "caster");
  const endedTarget = ended.states.find((entry) => entry.id === "target");
  assert.equal(endedCaster.spells.length, 0);
  assert.equal(endedTarget.conditions.some((condition) => (
    condition.parentEffectId === "eyebite-1"
  )), false);
  // Prono è una conseguenza fisica di Privo di sensi e può restare dopo il risveglio.
  assert.equal(endedTarget.conditions.some((condition) => condition.condition === "Prono"), true);
});

test("SP-B06A.2 — le azioni successive includono TS superato e restano direct-action", () => {
  const ids = [
    "eyebite-saved",
    "eyebite-asleep",
    "eyebite-panicked",
    "eyebite-sickened",
  ];
  for (const id of ids) {
    const action = getSpellResolutionAction(SPELL_ID, id);
    assert.ok(action, id);
    assert.equal(action.resolutionKind, "single-save");
    assert.equal(action.manualSaveAtTable, true);
    assert.equal(action.assumedOutcome, id === "eyebite-saved" ? "passed" : "failed");
    assert.equal(action.turnStartPrompt, true);
    assert.equal(action.showInOverview, true);
    assert.equal(action.availableAfterCast, true);
    assert.equal(action.rangeOrigin, "caster");
    assert.equal(action.range.value, 18);
    assert.equal(action.maxTargets, 1);
    assert.equal(action.damage, undefined);
    assert.ok(action.excludedTargetEffectIds.includes("eyebite-resisted"));
  }
  const saved = getSpellResolutionAction(SPELL_ID, "eyebite-saved");
  assert.equal(saved.successEffects[0].id, "eyebite-resisted");
  assert.equal(saved.successEffects[0].label, "Immune a Sguardo penetrante");
});

test("SP-B06A.2 — le tre varianti applicano child condition standard", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const payload = {
    spellId: SPELL_ID,
    spellName: spell.displayName,
    instanceId: "eyebite-1",
    casterId: "caster",
    casterName: "Caster",
  };

  const expected = {
    "eyebite-asleep": "Privo di sensi",
    "eyebite-panicked": "Spaventato",
    "eyebite-sickened": "Nauseato",
  };

  for (const [actionId, conditionName] of Object.entries(expected)) {
    const action = getSpellResolutionAction(SPELL_ID, actionId);
    const operations = buildSpellActiveResolutionFailureOperations({
      action,
      payload: { ...payload, action },
      targetIds: ["target"],
      outcomes: { target: "failed" },
    });
    assert.equal(operations[0].type, "condition:add");
    assert.equal(operations[0].conditionName, conditionName);
    assert.equal(operations[0].options.parentEffectId, "eyebite-1");
    assert.equal(operations[0].options.effectKind, "");
  }
});

test("SP-B06A.2 — TS superato applica una pill standard visibile e linked alla singola istanza", () => {
  const action = getSpellResolutionAction(SPELL_ID, "eyebite-saved");
  const payload = {
    spellId: SPELL_ID,
    spellName: "Sguardo penetrante",
    instanceId: "eyebite-1",
    casterId: "caster",
    casterName: "Caster",
    action,
  };
  const operations = buildSpellActiveResolutionSuccessOperations({
    action,
    payload,
    targetIds: ["target"],
    outcomes: { target: "passed" },
  });
  assert.equal(operations[0].type, "condition:add");
  assert.equal(operations[0].conditionName, "Immune a Sguardo penetrante");
  assert.equal(operations[0].options.parentEffectId, "eyebite-1");
  assert.equal(operations[0].options.effectId, "eyebite-resisted");
  assert.equal(operations[0].options.effectKind, "");
  assert.equal(operations[0].options.mapVisible, undefined);
  assert.deepEqual(operations[0].options.expiry, { mode: "concentration" });

  const resisted = {
    id: "resisted-1",
    condition: "Immune a Sguardo penetrante",
    parentEffectId: "eyebite-1",
    effectId: "eyebite-resisted",
    expiry: { mode: "concentration" },
    type: "spell",
  };
  const pill = __compactEffectItems([resisted], [], false);
  assert.equal(pill.length, 1);
  assert.equal(pill[0].label, "Immune a Sguardo penetrante (C)");
  assert.match(CONDITIONS_SOURCE, /group\.effectId === "eyebite-resisted" \? "" : group\.parentEffectId/);
});

test("SP-B06A.3 — Panico produce un reminder informativo senza tiro", () => {
  const normalized = normalizeEffectSaveReminder({
    timing: "turn-start",
    mode: "consume",
    label: "Deve usare Scatto e allontanarsi dal caster lungo il percorso più breve e sicuro possibile.",
  });
  assert.ok(normalized);
  assert.equal(normalized.timing, "turn-start");
  assert.equal(normalized.mode, "consume");
  assert.equal(normalized.ability, undefined);
  assert.equal(normalized.damage, undefined);
});

test("SP-B06A.3 — Nauseato: TS superato rimuove l'effetto e applica il marker resistente alla stessa spell", () => {
  const reminder = {
    ability: "wis",
    timing: "turn-end",
    dcSource: "source-spell",
    resolution: {
      success: {
        mode: "remove-effect",
        actions: [{
          kind: "condition",
          action: "apply",
          targetId: "$target",
          parentEffectId: "$parent",
          name: "Immune a Sguardo penetrante",
          options: {
            effectId: "eyebite-resisted",
            type: "spell",
            expiry: { mode: "concentration" },
          },
        }],
      },
      failure: "keep-effect",
    },
  };
  const resolution = buildEffectSaveReminderResolution({
    item: { id: "target", metadata: { [META_KEY]: {} } },
    instance: {
      id: "nausea-1",
      sourceId: "caster",
      parentEffectId: "eyebite-1",
      spellId: SPELL_ID,
      spellName: "Sguardo penetrante",
      manualRemoval: true,
    },
    reminder,
    dc: 17,
    activationId: "nausea-1:turn-end:2:target",
    turnKey: "2:0:target",
  });
  assert.ok(resolution);
  const passedActions = resolution.outcomes.passed.actions;
  assert.ok(passedActions.some((action) => (
    action.kind === "condition"
    && action.action === "remove-instance"
    && action.instanceId === "nausea-1"
  )));
  const marker = passedActions.find((action) => action.action === "apply");
  assert.equal(marker.parentEffectId, "eyebite-1");
  assert.equal(marker.options.mapVisible, undefined);
});

test("SP-B06A.4 — dal turno successivo del caster compare un chooser con quattro azioni e candidati precomputati", () => {
  const castTurn = "1:0:caster";
  const caster = {
    id: "caster",
    name: "Caster",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        [SPELLS_KEY]: [{
          name: "Sguardo penetrante",
          spellId: SPELL_ID,
          instanceId: "eyebite-1",
          casterId: "caster",
          appliedAt: { round: 1, actorId: "caster", turnKey: castTurn },
          conc: true,
          castContext: { slotLevel: 6 },
        }],
      },
    },
  };
  const validTarget = {
    id: "target-valid",
    name: "Bersaglio valido",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { conditions: { version: 2, instances: [] } } },
  };
  const resistedTarget = {
    id: "target-resisted",
    name: "Bersaglio immune",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { conditions: { version: 2, instances: [{
      id: "resisted-1",
      active: true,
      parentEffectId: "eyebite-1",
      effectId: "eyebite-resisted",
    }] } } },
  };

  assert.deepEqual(spellTurnPromptRequests({
    items: [caster, validTarget, resistedTarget], actorId: "caster", sceneEpoch: 3, turnKey: castTurn,
  }), []);

  const requests = spellTurnPromptRequests({
    items: [caster, validTarget, resistedTarget], actorId: "caster", sceneEpoch: 3, turnKey: "2:0:caster",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "choice");
  assert.equal(requests[0].spellId, SPELL_ID);
  assert.deepEqual(requests[0].actions.map((payload) => payload.actionId), [
    "eyebite-saved",
    "eyebite-asleep",
    "eyebite-panicked",
    "eyebite-sickened",
  ]);
  assert.deepEqual(requests[0].candidateTargets, [{
    id: "target-valid",
    name: "Bersaglio valido",
  }]);
  assert.equal(spellTurnPromptSelectedCandidateId(requests[0], ["target-valid"]), "target-valid");
  assert.equal(spellTurnPromptSelectedCandidateId({
    ...requests[0],
    candidateTargets: [{ id: "target-valid::p2", name: "Parallelo" }],
  }, ["target-valid"]), "target-valid::p2");
  assert.equal(spellTurnPromptSelectedCandidateId(requests[0], ["target-resisted"]), "");
});


test("SP-B06A.4 — il chooser diretto ha quattro azioni visibili, chiusura separata dal drag e fallback target robusto", () => {
  assert.match(TURN_CHOICE_HTML, /id="targetField"/);
  assert.match(TURN_CHOICE_HTML, /class="header-copy"[^>]*data-drag-handle/);
  assert.doesNotMatch(TURN_CHOICE_HTML, /class="header"[^>]*data-drag-handle/);
  assert.match(TURN_CHOICE_HTML, /#app\[data-mode="direct"\] \.actions \{ grid-template-columns:repeat\(2/);
  assert.match(TURN_CHOICE_SOURCE, /request\.spellId === "eyebite"/);
  assert.match(TURN_CHOICE_SOURCE, /id === "eyebite-saved"/);
  assert.match(TURN_CHOICE_SOURCE, /initializePopoverDrag/);
  assert.match(TURN_CHOICE_SOURCE, /candidateTargets/);
  assert.match(TURN_CHOICE_SOURCE, /OBR\.player\.onChange/);
  assert.match(TURN_CHOICE_SOURCE, /OBR\.player\.getSelection/);
  assert.match(TURN_CHOICE_SOURCE, /OBR\.onReady/);
  assert.match(TURN_CHOICE_SOURCE, /await sdkReady/);
  assert.match(TURN_CHOICE_SOURCE, /setInterval\(\(\) => \{ void refreshSelection\(\); \}, 150\)/);
  assert.match(TURN_CHOICE_SOURCE, /params\.get\("requestKey"\)/);
  assert.match(TURN_CHOICE_SOURCE, /localStorage\.getItem\(requestKey\)/);
  assert.match(TURN_CHOICE_SOURCE, /type === "sync-choice-target"/);
  assert.match(TURN_CONTROLLER_SOURCE, /OBR\.player\.onChange/);
  assert.match(TURN_CONTROLLER_SOURCE, /OBR\.player\.getSelection/);
  assert.match(TURN_CONTROLLER_SOURCE, /spellTurnPromptSelectedCandidateId/);
  assert.match(TURN_CONTROLLER_SOURCE, /type: "sync-choice-target"/);
  assert.match(TURN_CONTROLLER_SOURCE, /localStorage\.setItem\(requestStorageKey/);
  assert.match(TURN_CONTROLLER_SOURCE, /requestKey: requestStorageKey/);
  assert.doesNotMatch(TURN_CONTROLLER_SOURCE, /spellTurnPromptChoiceViewRequest/);
  assert.match(TURN_CHOICE_SOURCE, /return filtered\.length \? filtered : candidates/);
  assert.match(TURN_CHOICE_SOURCE, /close\.addEventListener\("click"/);
  assert.match(TURN_CHOICE_SOURCE, /type: "dismiss-choice"/);
  assert.match(TURN_CHOICE_SOURCE, /popoverId: id/);
  assert.match(TURN_CHOICE_SOURCE, /close\.addEventListener\("pointerdown"/);
  assert.match(TURN_CONTROLLER_SOURCE, /data\.type === "dismiss-choice"/);
  assert.match(TURN_CONTROLLER_SOURCE, /opened\.get\(explicitPopoverId\)/);
  assert.match(TURN_CHOICE_SOURCE, /type: "apply-choice-action"/);
  assert.match(TURN_CONTROLLER_SOURCE, /EYEBITE_CHOICE_POPOVER_HEIGHT = 330/);
  assert.match(TURN_CONTROLLER_SOURCE, /const runtimeTurnKey = String\(request\?\.turnKey \|\| currentTurnKey/);
  assert.match(TURN_CONTROLLER_SOURCE, /dismissedChoiceKey\(runtime\.instanceId, runtimeTurnKey\)/);
  assert.match(TURN_CONTROLLER_SOURCE, /apply-choice-action/);
  assert.match(TURN_CONTROLLER_SOURCE, /executeSpellActiveResolution/);
  assert.match(TURN_CONTROLLER_SOURCE, /payload\.action\?\.assumedOutcome \|\| "failed"/);
  assert.doesNotMatch(TURN_CONTROLLER_SOURCE, /sceneEpoch:\s*Number\.isFinite\(Number\(data\.sceneEpoch\)\)/);
  assert.match(TURN_CONTROLLER_SOURCE, /const actionSceneEpoch = currentSceneEpoch\(\);/);
  assert.match(TURN_CONTROLLER_SOURCE, /const executionPayload = \{ \.\.\.payload, sceneEpoch: actionSceneEpoch/);
  assert.doesNotMatch(TURN_CHOICE_SOURCE, /Promise\.allSettled/);
  assert.match(TURN_CHOICE_SOURCE, /OBR\.popover\.close\(id\)/);
  assert.match(TURN_CHOICE_SOURCE, /params\.get\("popoverId"\)/);
  assert.match(TURN_CHOICE_HTML, /#app\[data-mode="direct"\] \.actions \{[^}]*margin-top:4px/s);
});
