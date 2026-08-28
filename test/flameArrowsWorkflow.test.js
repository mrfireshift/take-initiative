import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition } from "../src/spells-srd.js";
import {
  getSpellCastPhaseOptions,
  getSpellCastPhasePlan,
  spellPreparedResolutionAvailable,
} from "../src/spellCastPhaseCore.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import {
  buildSpellActiveActionPlan,
  getSpellActiveAction,
  getSpellOverviewActions,
} from "../src/spellActiveActionCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { spellPillCounter } from "../src/spellExpiryCore.js";

const SPELL_ID = "xanathar-frecce-infuocate";

function spell() {
  return getSpellDefinition(SPELL_ID);
}

function castPlan(slotLevel) {
  const definition = spell();
  const intent = buildSpellApplicationIntent({
    spell: definition,
    enteredName: definition.displayName,
    turns: 600,
    casterId: "caster",
    targetIds: ["caster"],
    castContext: { slotLevel },
    requestedConcentration: true,
  });
  return buildSpellApplicationPlan({
    intent,
    instanceId: `flame-arrows-${slotLevel}`,
    casterName: "Mago",
  });
}

function activeSpell({ remaining = 12, slotLevel = 3 } = {}) {
  return {
    id: "flame-arrows-entry",
    name: "Frecce Infuocate",
    spellId: SPELL_ID,
    instanceId: "flame-arrows-instance",
    casterId: "caster",
    casterName: "Mago",
    turns: 600,
    conc: true,
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    castContext: {
      phase: "prepare",
      slotLevel,
      uses: {
        key: "ammunition",
        label: "munizioni",
        remaining,
        total: 12 + Math.max(0, slotLevel - 3) * 2,
        showInPill: true,
      },
    },
  };
}

test("Frecce Infuocate prepara sul caster senza una risoluzione preparata", () => {
  const definition = spell();
  assert.deepEqual(getSpellCastPhaseOptions(definition), [
    { value: "prepare", label: "Preparazione sul caster" },
  ]);
  assert.equal(spellPreparedResolutionAvailable(definition), false);

  const plan = getSpellCastPhasePlan(definition, "resolve", { slotLevel: 3 });
  assert.equal(plan.phase, "prepare");
  assert.equal(plan.subjectMode, "caster");
  assert.equal(plan.effects[0].id, "flame-arrows-ready");
  assert.deepEqual(plan.effects[0].summaryParts, [
    { id: "flame-arrows-extra-fire", label: "+1d6 fuoco" },
  ]);
  assert.deepEqual(plan.effects[0].mechanics.damageBonus, {
    dice: "1d6",
    type: "fuoco",
    sourceOnly: true,
  });
});

test("Frecce Infuocate inizializza 12 munizioni +2 per slot sopra il 3°", () => {
  for (const [slotLevel, expected] of [[3, 12], [4, 14], [5, 16], [9, 24]]) {
    const plan = castPlan(slotLevel);
    const upsert = plan.operations.find((operation) => operation.type === "spell:upsert");
    assert.ok(upsert, `slot ${slotLevel}`);
    assert.equal(upsert.conc, true);
    assert.equal(upsert.castContext.uses.key, "ammunition");
    assert.equal(upsert.castContext.uses.remaining, expected);
    assert.equal(upsert.castContext.uses.total, expected);
    assert.equal(spellPillCounter({ castContext: upsert.castContext }), String(expected));
  }
});

test("la pill preparata conserva il mini-promemoria +1d6 fuoco", () => {
  const plan = castPlan(3);
  const condition = plan.operations.find((operation) => operation.type === "condition:add");
  assert.ok(condition);
  assert.deepEqual(condition.options.summaryParts, [
    { id: "flame-arrows-extra-fire", label: "+1d6 fuoco" },
  ]);
  assert.deepEqual(condition.options.mechanics.damageBonus, {
    dice: "1d6",
    type: "fuoco",
    sourceOnly: true,
  });
});

test("il contatore si consuma con un'azione manuale senza attacco o target UI", () => {
  const definition = spell();
  const action = getSpellActiveAction(definition, "flame-arrows-consume");
  assert.ok(action);
  assert.equal(action.subjectMode, "none");
  assert.deepEqual(action.resource, {
    key: "ammunition",
    consume: 1,
    endSpellAtZero: true,
    endConcentrationAtZero: true,
  });
  assert.equal(action.repeatableThisTurn, true);

  const overview = getSpellOverviewActions({
    spell: definition,
    castContext: activeSpell().castContext,
    casterId: "caster",
    targetIds: ["caster"],
    currentTurnKey: "2:0:caster",
  });
  assert.equal(overview.some((entry) => entry.id === "resolve-prepared"), false);
  assert.equal(overview.some((entry) => entry.id === "flame-arrows-consume"), true);

  const plan = buildSpellActiveActionPlan({
    spell: definition,
    actionId: "flame-arrows-consume",
    group: activeSpell({ remaining: 12 }),
  });
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.subjectIds, ["caster"]);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, "spell:upsert");
  assert.equal(plan.operations[0].castContext.uses.remaining, 11);
});

test("l'ultima munizione chiude spell e concentrazione tramite il parent instance", () => {
  const definition = spell();
  const entry = activeSpell({ remaining: 1 });
  const actionPlan = buildSpellActiveActionPlan({
    spell: definition,
    actionId: "flame-arrows-consume",
    group: entry,
  });
  assert.equal(actionPlan.valid, true);
  assert.deepEqual(actionPlan.operations, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "flame-arrows-instance",
  }]);

  const mutation = buildEffectsMutationPlan([{
    id: "caster",
    name: "Caster",
    spells: [entry],
    concentrations: {
      "Frecce Infuocate": {
        name: "Frecce Infuocate",
        spellId: SPELL_ID,
        instanceId: "flame-arrows-instance",
        targets: ["caster"],
      },
    },
    conditions: [{
      id: "flame-arrows-effect",
      parentEffectId: "flame-arrows-instance",
      effectKind: "buff",
      condition: "Munizioni infuocate / +1d6 fuoco",
    }],
  }], actionPlan.operations);
  const next = mutation.states[0];
  assert.deepEqual(next.spells, []);
  assert.deepEqual(next.concentrations, {});
  assert.deepEqual(next.conditions, []);
});
