import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition } from "../src/spells-srd.js";
import { getSpellCastPhasePlan } from "../src/spellCastPhaseCore.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";

const appliedAt = {
  round: 2,
  actorId: "active",
  phase: "turn",
  turnKey: "2:active",
};

function intentFor(name, overrides = {}) {
  const spell = getSpellDefinition(name);
  return buildSpellApplicationIntent({
    spell,
    enteredName: name,
    turns: 10,
    casterId: "caster",
    targetIds: ["target"],
    castContext: {},
    requestedConcentration: true,
    ...overrides,
  });
}

function planFor(intent, overrides = {}) {
  return buildSpellApplicationPlan({
    intent,
    instanceId: "spell-instance",
    appliedAt,
    casterName: "Chierico",
    ...overrides,
  });
}

test("una richiesta senza bersagli termina prima della pianificazione", () => {
  assert.equal(intentFor("Benedizione", { targetIds: [] }), null);
  assert.equal(buildSpellApplicationPlan(), null);
});

test("il cast standard normalizza bersagli e conserva contesto e fonti", () => {
  const intent = intentFor("Benedizione", {
    targetIds: ["ally", "ally", ""],
    castContext: { slotLevel: 2 },
  });
  const plan = planFor(intent);

  assert.deepEqual(intent.subjects, ["ally"]);
  assert.equal(intent.phasePlan.phase, "cast");
  assert.equal(intent.wantsConcentration, true);
  assert.deepEqual(intent.persistedCastContext, {
    slotLevel: 2,
    phase: "cast",
    choice: "",
    applyAutomatedConditions: true,
  });
  assert.deepEqual(plan.operations.map((operation) => operation.type), [
    "concentration:break",
    "spell:upsert",
    "condition:add",
    "concentration:register",
    "condition:automate",
  ]);
  const upsert = plan.operations.find((operation) => operation.type === "spell:upsert");
  assert.equal(upsert.instanceId, "spell-instance");
  assert.deepEqual(upsert.targetIds, ["ally"]);
  assert.deepEqual(upsert.appliedAt, appliedAt);
  assert.deepEqual(upsert.castContext, intent.persistedCastContext);
  const condition = plan.operations.find((operation) => operation.type === "condition:add");
  assert.equal(condition.options.sourceId, "caster");
  assert.equal(condition.options.sourceName, "Chierico");
  assert.deepEqual(condition.options.expiry, { mode: "concentration" });
  assert.equal(plan.historyLabel, "Incantesimo: Benedizione");
});

test("la preparazione usa gli effetti di fase e la relativa history", () => {
  const intent = intentFor("Punizione Collerica", {
    targetIds: ["caster"],
    castContext: { slotLevel: 1 },
  });
  const plan = planFor(intent);

  assert.equal(intent.phasePlan.phase, "prepare");
  assert.equal(intent.castAutomationPlan.usedSaveAutomation, false);
  assert.equal(intent.castAutomationPlan.effects[0].id, "wrathful-smite-ready");
  assert.equal(plan.historyLabel, "Preparazione: Punizione Collerica");
  assert.equal(
    plan.operations.find((operation) => operation.type === "spell:upsert")
      .castContext.phase,
    "prepare",
  );
});

test("la risoluzione extend richiede e trasferisce l'istanza preparata", () => {
  const spell = getSpellDefinition("Punizione Collerica");
  const castContext = { slotLevel: 1, phase: "resolve" };
  const phasePlan = getSpellCastPhasePlan(spell, "resolve", castContext);

  assert.throws(() => buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["enemy"],
    castContext,
    phasePlan,
    requestedConcentration: true,
  }), /prepared-instance-required/);

  const activeConcentration = {
    instanceId: "wrathful",
    targets: ["caster"],
  };
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["enemy"],
    castContext,
    phasePlan,
    activeConcentration,
    requestedConcentration: true,
  });
  const plan = planFor(intent, { instanceId: "wrathful" });

  assert.equal(intent.concentrationAction, "extend");
  assert.deepEqual(plan.operations[0], {
    type: "concentration:break-targets",
    casterIds: ["caster"],
    reference: "wrathful",
    targetIds: ["caster"],
  });
  assert.equal(
    plan.operations.find((operation) => operation.type === "spell:upsert").instanceId,
    "wrathful",
  );
  assert.equal(plan.historyLabel, "Risoluzione: Punizione Collerica");
});

test("la risoluzione dismiss interrompe senza ricreare spell o concentrazione", () => {
  const spell = getSpellDefinition("Punizione Tonante");
  const castContext = { slotLevel: 1, phase: "resolve" };
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["enemy"],
    castContext,
    phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
    activeConcentration: {
      instanceId: "thunderous",
      targets: ["caster"],
    },
    historyLabel: "Colpo tonante risolto",
    requestedConcentration: true,
  });
  const plan = planFor(intent, { instanceId: "thunderous" });
  const operationTypes = plan.operations.map((operation) => operation.type);

  assert.equal(intent.concentrationAction, "dismiss");
  assert.deepEqual(operationTypes, [
    "concentration:break",
    "condition:add",
    "condition:automate",
  ]);
  assert.equal(operationTypes.includes("spell:upsert"), false);
  assert.equal(operationTypes.includes("concentration:register"), false);
  assert.equal(plan.historyLabel, "Colpo tonante risolto");
});

test("la risoluzione prepared usa esito TS esplicito e dismiss scoped", () => {
  const spell = getSpellDefinition("Colpo Intrappolante");
  const castContext = { slotLevel: 1, phase: "resolve" };
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["enemy"],
    castContext,
    phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
    activeConcentration: {
      instanceId: "ensnaring-instance",
      targets: ["caster"],
    },
    attackOutcome: "hit",
    saveOutcome: "passed",
    manualAttackOutcomeRequired: true,
    requestedConcentration: true,
  });
  const plan = planFor(intent, { instanceId: "ensnaring-instance" });

  assert.equal(intent.attackOutcome, "hit");
  assert.deepEqual(intent.saveOutcomes, { enemy: "passed" });
  assert.equal(plan.concentrationAction, "dismiss");
  assert.deepEqual(plan.operations, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "ensnaring-instance",
  }]);
});

test("Searing usa lo scaling dello slot solo sul danno iniziale e accetta critical", () => {
  const spell = getSpellDefinition("Punizione Incandescente");
  const castContext = { slotLevel: 3, phase: "resolve" };
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["enemy"],
    castContext,
    phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
    activeConcentration: {
      instanceId: "searing-instance",
      targets: ["caster"],
    },
    attackOutcome: "critical",
    damageValue: 12,
    manualAttackOutcomeRequired: true,
    requestedConcentration: true,
  });
  const plan = planFor(intent, { instanceId: "searing-instance" });

  assert.equal(intent.attackOutcome, "critical");
  assert.deepEqual(plan.initialDamage, { dice: "3d6", type: "fuoco" });
  assert.equal(plan.damageRequired, true);
  assert.equal(
    getSpellCastPhasePlan(spell, "prepare", { slotLevel: 3 })
      .effects[0].mechanics.ongoingDamage.dice,
    "1d6",
  );
});

test("Punizione Marchiante trasferisce il marker persistente e il danno scalato", () => {
  const spell = getSpellDefinition("Punizione Marchiante");
  const castContext = { slotLevel: 4, phase: "resolve" };
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: 9,
    casterId: "caster",
    targetIds: ["enemy"],
    castContext,
    phasePlan: getSpellCastPhasePlan(spell, "resolve", castContext),
    activeConcentration: {
      instanceId: "branding-instance",
      targets: ["caster"],
    },
    attackOutcome: "hit",
    damageValue: 12,
    manualAttackOutcomeRequired: true,
    requestedConcentration: true,
  });
  const plan = planFor(intent, { instanceId: "branding-instance" });
  const upsert = plan.operations.find((operation) => operation.type === "spell:upsert");
  const condition = plan.operations.find((operation) => operation.type === "condition:add");

  assert.equal(intent.concentrationAction, "extend");
  assert.deepEqual(plan.initialDamage, { dice: "4d6", type: "radiosi" });
  assert.equal(plan.damageRequired, true);
  assert.deepEqual(upsert.targetIds, ["enemy"]);
  assert.equal(condition.conditionName, "Bagliore astrale / no invisibilità");
  assert.deepEqual(condition.options.expiry, { mode: "concentration" });
  assert.deepEqual(condition.options.mechanics, {
    visibility: "visible",
    invisibilityBlocked: true,
    dimLightRadiusMeters: 1.5,
  });
  assert.equal(plan.historyLabel, "Risoluzione: Punizione Marchiante");
});

test("Parola del potere stordire persiste il TS ricorrente senza TS iniziale", () => {
  const intent = intentFor("Parola del potere stordire", {
    turns: 1,
    requestedConcentration: false,
  });
  const plan = planFor(intent);
  const operationTypes = plan.operations.map((operation) => operation.type);
  const spellUpsert = plan.operations.find((operation) => operation.type === "spell:upsert");
  const condition = plan.operations.find((operation) => operation.type === "condition:add");

  assert.equal(intent.castAutomationPlan.usedSaveAutomation, false);
  assert.deepEqual(operationTypes, [
    "spell:upsert",
    "condition:add",
    "condition:automate",
  ]);
  assert.deepEqual(spellUpsert.expiry, { mode: "manual" });
  assert.equal(condition.conditionName, "Stordito");
  assert.equal(condition.options.sourceId, "caster");
  assert.equal(condition.options.sourceName, "Chierico");
  assert.equal(condition.options.parentEffectId, "spell-instance");
  assert.deepEqual(condition.options.expiry, { mode: "manual" });
  assert.equal(condition.options.manualRemoval, true);
  assert.equal(condition.options.endsParentOnRemoval, true);
  assert.equal(condition.options.parentRemoval, "target");
  assert.deepEqual(condition.options.saveReminder, {
    ability: "con",
    timing: "turn-end",
    dcSource: "source-spell",
    label: "Se supera il TS, termina Stordito su di sé.",
  });
});
