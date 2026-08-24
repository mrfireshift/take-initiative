import assert from "node:assert/strict";
import test from "node:test";

import {
  getSpellSaveTargetMaximum,
  resolveSpellSaveTargeting,
} from "../src/spellSaveTargetingCore.js";
import {
  getSpellSaveWorkflowChoiceOptions,
  getSpellSaveWorkflowRule,
  validateSpellSaveWorkflowChoice,
} from "../src/spellSaveWorkflowRules.js";
import {
  getAreaSaveAutomation,
  getSpellDefinition,
} from "../src/spells-srd.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";

test("il contratto Lotto A dichiara TS, slot base e consenso", () => {
  const bane = getSpellSaveWorkflowRule("bane");
  const mindWhip = getSpellSaveWorkflowRule("legacy-tashas-mind-whip");

  assert.equal(Object.isFrozen(bane), true);
  assert.equal(Object.isFrozen(bane.targeting), true);
  assert.deepEqual(bane, {
    spellId: "bane",
    timing: "cast",
    ability: "cha",
    targeting: {
      mode: "selected",
      baseMaximum: 3,
      additionalPerSlotAbove: 1,
      baseSlot: 1,
      consent: "all-save",
    },
    choice: null,
  });
  assert.equal(mindWhip.ability, "int");
  assert.equal(mindWhip.targeting.baseSlot, 2);
  assert.equal(mindWhip.targeting.baseMaximum, 1);
});

test("calcola i limiti RAW in base allo slot", () => {
  assert.equal(getSpellSaveTargetMaximum("bane", 1), 3);
  assert.equal(getSpellSaveTargetMaximum("bane", 4), 6);
  assert.equal(getSpellSaveTargetMaximum("bane", 9), 11);
  assert.equal(getSpellSaveTargetMaximum("legacy-tashas-mind-whip", 2), 1);
  assert.equal(getSpellSaveTargetMaximum("legacy-tashas-mind-whip", 3), 2);
  assert.equal(getSpellSaveTargetMaximum("legacy-tashas-mind-whip", 9), 8);
  assert.equal(getSpellSaveTargetMaximum("command", 1), 1);
  assert.equal(getSpellSaveTargetMaximum("command", 2), 2);
  assert.equal(getSpellSaveTargetMaximum("command", 9), 9);
  assert.equal(getSpellSaveTargetMaximum("xanathar-anatema-elementale", 4), 1);
  assert.equal(getSpellSaveTargetMaximum("xanathar-anatema-elementale", 5), 2);
  assert.equal(getSpellSaveTargetMaximum("xanathar-anatema-elementale", 9), 6);
  assert.equal(getSpellSaveTargetMaximum("xanathar-aculeo-mentale", 2), 1);
  assert.equal(getSpellSaveTargetMaximum("xanathar-aculeo-mentale", 9), 1);
});

test("Aculeo Mentale dichiara TS Saggezza, gittata e un solo bersaglio", () => {
  const rule = getSpellSaveWorkflowRule("xanathar-aculeo-mentale");

  assert.equal(rule.ability, "wis");
  assert.deepEqual(rule.targeting.spatial, {
    mode: "caster-range",
    maxMeters: 18,
  });
  assert.equal(rule.targeting.baseSlot, 2);
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.additionalPerSlotAbove, 0);

  const valid = resolveSpellSaveTargeting({
    spellId: "xanathar-aculeo-mentale",
    slotLevel: 5,
    targetIds: ["target"],
    casterDistancesMeters: { target: 18 },
  });
  assert.equal(valid.valid, true);

  const tooMany = resolveSpellSaveTargeting({
    spellId: "xanathar-aculeo-mentale",
    slotLevel: 5,
    targetIds: ["target-a", "target-b"],
  });
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.includes("target-limit-exceeded"));
});

test("Aculeo Mentale non applica Localizzato a successi o immunità", () => {
  for (const [targetId, outcome, expectedApplications] of [
    ["failed", "failed", [["failed"]]],
    ["passed", "passed", []],
    ["immune", "immune", []],
  ]) {
    const resolution = resolveSaveSpellResolution({
      spell: getSpellDefinition("xanathar-aculeo-mentale"),
      casterId: "caster",
      targetIds: [targetId],
      outcomes: { [targetId]: outcome },
      automation: getAreaSaveAutomation("xanathar-aculeo-mentale"),
      saveWorkflowRule: getSpellSaveWorkflowRule("xanathar-aculeo-mentale"),
      slotLevel: 2,
      validateSpatial: false,
    });

    assert.equal(resolution.valid, true, outcome);
    assert.deepEqual(
      resolution.conditionApplications.map((application) => application.targetIds),
      expectedApplications,
      outcome,
    );
  }
});

test("Anatema Elementale dichiara una scelta condivisa e vincolo pairwise", () => {
  const rule = getSpellSaveWorkflowRule("xanathar-anatema-elementale");
  const options = getSpellSaveWorkflowChoiceOptions(rule);

  assert.equal(rule.ability, "con");
  assert.deepEqual(rule.targeting.spatial, {
    mode: "pairwise-distance",
    maxMeters: 9,
  });
  assert.deepEqual(options.map((option) => [option.value, option.label]), [
    ["acido", "Acido"],
    ["freddo", "Freddo"],
    ["fulmine", "Fulmine"],
    ["fuoco", "Fuoco"],
    ["tuono", "Tuono"],
  ]);
  assert.ok(Object.isFrozen(rule.choice));
  assert.ok(options.every((option) => Object.isFrozen(option)));

  const valid = resolveSpellSaveTargeting({
    spellId: "xanathar-anatema-elementale",
    slotLevel: 6,
    targetIds: ["a", "b", "c"],
    choiceValue: "fuoco",
    pairwiseDistancesMeters: [
      { targetIds: ["a", "b"], distanceMeters: 9 },
      { targetIds: ["a", "c"], distanceMeters: 8 },
      { targetIds: ["b", "c"], distanceMeters: 7 },
    ],
  });
  assert.equal(valid.valid, true);

  const tooFar = resolveSpellSaveTargeting({
    spellId: "xanathar-anatema-elementale",
    slotLevel: 6,
    targetIds: ["a", "b", "c"],
    choiceValue: "fuoco",
    pairwiseDistancesMeters: [
      { targetIds: ["a", "b"], distanceMeters: 9 },
      { targetIds: ["a", "c"], distanceMeters: 10 },
      { targetIds: ["b", "c"], distanceMeters: 8 },
    ],
  });
  assert.equal(tooFar.valid, false);
  assert.ok(tooFar.errors.includes("pairwise-distance-exceeded"));

  const incomplete = resolveSpellSaveTargeting({
    spellId: "xanathar-anatema-elementale",
    slotLevel: 6,
    targetIds: ["a", "b", "c"],
    choiceValue: "fuoco",
    pairwiseDistancesMeters: [{ targetIds: ["a", "b"], distanceMeters: 9 }],
  });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.includes("pairwise-distance-unavailable"));

  const deferred = resolveSpellSaveTargeting({
    spellId: "xanathar-anatema-elementale",
    slotLevel: 6,
    targetIds: ["a", "b", "c"],
    choiceValue: "fuoco",
    validateSpatial: false,
  });
  assert.equal(deferred.valid, true);
  assert.equal(deferred.spatial.deferred, true);
});

test("Comando dichiara una scelta di lancio congelata e valida solo le opzioni note", () => {
  const command = getSpellSaveWorkflowRule("command");
  const options = getSpellSaveWorkflowChoiceOptions(command);

  assert.equal(command.ability, "wis");
  assert.equal(command.choice.scope, "cast");
  assert.equal(command.choice.required, true);
  assert.equal(Object.isFrozen(command.choice), true);
  assert.equal(Object.isFrozen(command.choice.options), true);
  assert.ok(options.every((option) => Object.isFrozen(option)));
  assert.deepEqual(options.map((option) => [option.value, option.label]), [
    ["avvicinati", "Avvicinati"],
    ["fermo", "Fermo"],
    ["fuggi", "Fuggi"],
    ["lascia", "Lascia"],
    ["supplica", "Supplica"],
  ]);
  assert.deepEqual(validateSpellSaveWorkflowChoice(command, "").errors, ["choice-required"]);
  assert.deepEqual(validateSpellSaveWorkflowChoice(command, "non-esiste").errors, ["choice-invalid"]);
  assert.equal(validateSpellSaveWorkflowChoice(command, "supplica").valid, true);
});

test("rifiuta slot non validi, duplicati e bersagli oltre il massimo", () => {
  const tooMany = resolveSpellSaveTargeting({
    spellId: "bane",
    slotLevel: 1,
    targetIds: ["a", "b", "c", "d"],
  });
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.includes("target-limit-exceeded"));
  assert.equal(tooMany.maximumTargets, 3);

  const duplicate = resolveSpellSaveTargeting({
    spellId: "legacy-tashas-mind-whip",
    slotLevel: 3,
    targetIds: ["a", "a"],
  });
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.includes("duplicate-targets"));
  assert.deepEqual(duplicate.targetIds, ["a"]);

  const lowSlot = resolveSpellSaveTargeting({
    spellId: "legacy-tashas-mind-whip",
    slotLevel: 1,
    targetIds: ["a"],
  });
  assert.equal(lowSlot.valid, false);
  assert.ok(lowSlot.errors.includes("slot-level-invalid"));

  const missingChoice = resolveSpellSaveTargeting({
    spellId: "command",
    slotLevel: 2,
    targetIds: ["a", "b"],
  });
  assert.equal(missingChoice.valid, false);
  assert.ok(missingChoice.errors.includes("choice-required"));

  const invalidChoice = resolveSpellSaveTargeting({
    spellId: "command",
    slotLevel: 2,
    targetIds: ["a", "b"],
    choiceValue: "non-esiste",
  });
  assert.equal(invalidChoice.valid, false);
  assert.ok(invalidChoice.errors.includes("choice-invalid"));
});

test("la risoluzione conserva esiti indipendenti e applica gli effetti ai soli falliti", () => {
  const spell = getSpellDefinition("bane");
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["failed", "passed", "immune"],
    outcomes: {
      failed: "failed",
      passed: "passed",
      immune: "immune",
    },
    automation: getAreaSaveAutomation("bane"),
    saveWorkflowRule: getSpellSaveWorkflowRule("bane"),
    slotLevel: 1,
  });

  assert.equal(resolution.valid, true);
  assert.deepEqual(resolution.failedIds, ["failed"]);
  assert.deepEqual(resolution.passedIds, ["passed"]);
  assert.deepEqual(resolution.immuneIds, ["immune"]);
  assert.deepEqual(resolution.spellTargetIds, ["failed"]);
  assert.deepEqual(
    resolution.conditionApplications.map((application) => application.targetIds),
    [["failed"]],
  );
});

test("Anatema Elementale mantiene gli esiti indipendenti e applica il tipo scelto ai soli falliti", () => {
  const spell = getSpellDefinition("xanathar-anatema-elementale");
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["failed", "passed", "immune"],
    outcomes: {
      failed: "failed",
      passed: "passed",
      immune: "immune",
    },
    automation: getAreaSaveAutomation("xanathar-anatema-elementale", "fuoco"),
    saveWorkflowRule: getSpellSaveWorkflowRule("xanathar-anatema-elementale"),
    slotLevel: 6,
    choiceValue: "fuoco",
    pairwiseDistancesMeters: [
      { targetIds: ["failed", "passed"], distanceMeters: 9 },
      { targetIds: ["failed", "immune"], distanceMeters: 9 },
      { targetIds: ["passed", "immune"], distanceMeters: 9 },
    ],
  });

  assert.equal(resolution.valid, true);
  assert.deepEqual(resolution.failedIds, ["failed"]);
  assert.deepEqual(resolution.passedIds, ["passed"]);
  assert.deepEqual(resolution.immuneIds, ["immune"]);
  assert.deepEqual(resolution.spellTargetIds, ["failed"]);
  assert.deepEqual(
    resolution.conditionApplications.map((application) => application.targetIds),
    [["failed"]],
  );
});

test("Esilio dichiara limite, gittata e contesto del piano per bersaglio", () => {
  const rule = getSpellSaveWorkflowRule("banishment");
  const context = rule.targeting.context;

  assert.equal(rule.ability, "cha");
  assert.equal(getSpellSaveTargetMaximum(rule, 4), 1);
  assert.equal(getSpellSaveTargetMaximum(rule, 6), 1);
  assert.deepEqual(rule.targeting.spatial, {
    mode: "caster-range",
    maxMeters: 18,
  });
  assert.equal(context.scope, "target");
  assert.ok(Object.isFrozen(context));
  assert.deepEqual(context.fields[0].options.map((option) => [option.value, option.label]), [
    ["current-plane", "Nativo del piano corrente"],
    ["other-plane", "Originario di un altro piano"],
  ]);

  const valid = resolveSpellSaveTargeting({
    spellId: "banishment",
    rule,
    slotLevel: 6,
    ignoreTargetLimit: true,
    targetIds: ["native", "extraplanar", "third"],
    targetContexts: {
      native: { planeOrigin: "current-plane" },
      extraplanar: { planeOrigin: "other-plane" },
      third: { planeOrigin: "current-plane" },
    },
    casterDistancesMeters: { native: 18, extraplanar: 12, third: 3 },
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.targetContext.saveTargetIds, ["native", "extraplanar", "third"]);

  const tooFar = resolveSpellSaveTargeting({
    spellId: "banishment",
    rule,
    slotLevel: 4,
    targetIds: ["native"],
    targetContexts: { native: { planeOrigin: "current-plane" } },
    casterDistancesMeters: { native: 19 },
  });
  assert.ok(tooFar.errors.includes("caster-range-exceeded"));
});
