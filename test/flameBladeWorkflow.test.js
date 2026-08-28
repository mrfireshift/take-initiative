import test from "node:test";
import assert from "node:assert/strict";

import { getSpellDefinition, getSpellEffects, getSpellSummaryParts } from "../src/spells-srd.js";
import { getSpellActiveResolutionActions } from "../src/spellActiveResolutionRules.js";
import { getSpellUnifiedActiveActionDeclarations } from "../src/spellUnifiedPanelCore.js";
import { getSpellCastResolutionRule } from "../src/spellCastResolutionRules.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { __compactEffectItems } from "../src/initiativeCardCompact.js";
import { planEffectsLayout } from "../src/effectsLayoutCore.js";
import { buildSpellAutomationAudit } from "../scripts/audit-spell-automation.mjs";

const BLADE_CASES = [
  {
    id: "flame-blade",
    summaryId: "flame-blade-fire-damage",
    expected: new Map([
      [2, "3d6 fuoco"],
      [3, "3d6 fuoco"],
      [4, "4d6 fuoco"],
      [5, "4d6 fuoco"],
      [6, "5d6 fuoco"],
      [7, "5d6 fuoco"],
      [8, "6d6 fuoco"],
      [9, "6d6 fuoco"],
    ]),
  },
  {
    id: "xanathar-lama-dombra",
    summaryId: "xanathar-lama-dombra-psychic-damage",
    expected: new Map([
      [2, "2d8 psichici"],
      [3, "3d8 psichici"],
      [4, "3d8 psichici"],
      [5, "4d8 psichici"],
      [6, "4d8 psichici"],
      [7, "5d8 psichici"],
      [8, "5d8 psichici"],
      [9, "5d8 psichici"],
    ]),
  },
];

function token(id, overrides = {}) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function buildBladeCast({ id, slotLevel }) {
  const spell = getSpellDefinition(id);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: spell.defaultTurns,
    casterId: "caster",
    targetIds: ["target"],
    castContext: { slotLevel },
    requestedConcentration: true,
  });
  const plan = buildSpellApplicationPlan({
    intent,
    instanceId: `${id}-instance`,
    appliedAt: { round: 2, actorId: "caster", phase: "turn", turnKey: "2:caster" },
    casterName: "Druido",
  });
  return { spell, intent, plan };
}

test("Lama Infuocata e Lama d’Ombra sono tracking-only senza effetti o azioni artificiali", () => {
  for (const { id } of BLADE_CASES) {
    const spell = getSpellDefinition(id);
    assert.equal(spell.concentration, true, id);
    assert.equal(spell.targetMode, "self", id);
    assert.equal(spell.effects.length, 0, id);
    assert.deepEqual(spell.activeActions, [], id);
    assert.deepEqual(getSpellEffects(spell, "", { slotLevel: 9 }), [], id);
    assert.deepEqual(getSpellActiveResolutionActions(id), [], id);
    assert.deepEqual(getSpellUnifiedActiveActionDeclarations(spell), [], id);
    assert.equal(getSpellCastResolutionRule(id), null, id);
  }
});

test("le micropill del danno scalano su tutti i breakpoint usando lo slot effettivo", () => {
  for (const { id, summaryId, expected } of BLADE_CASES) {
    const spell = getSpellDefinition(id);
    for (const [slotLevel, label] of expected) {
      assert.deepEqual(
        getSpellSummaryParts(spell, "", { slotLevel }),
        [{ id: summaryId, label }],
        `${id} slot ${slotLevel}`,
      );
    }
  }
});

test("il cast persistente conserva slot/castContext, durata e summaryParts senza condition", () => {
  for (const { id, summaryId, expected } of BLADE_CASES) {
    const slotLevel = 6;
    const { spell, intent, plan } = buildBladeCast({ id, slotLevel });
    const expectedSummary = [{ id: summaryId, label: expected.get(slotLevel) }];
    const operationTypes = plan.operations.map((operation) => operation.type);
    const upsert = plan.operations.find((operation) => operation.type === "spell:upsert");

    assert.deepEqual(intent.summaryParts, expectedSummary, id);
    assert.equal(intent.persistedCastContext.slotLevel, slotLevel, id);
    assert.equal(plan.initialDamage, null, id);
    assert.equal(plan.damageRequired, false, id);
    assert.deepEqual(operationTypes, [
      "concentration:break",
      "spell:upsert",
      "concentration:register",
    ], id);
    assert.deepEqual(upsert.summaryParts, expectedSummary, id);
    assert.deepEqual(upsert.castContext, intent.persistedCastContext, id);
    assert.equal(upsert.turns, spell.defaultTurns, id);
    assert.equal(upsert.conc, true, id);
    assert.equal(plan.operations.some((operation) => operation.type.startsWith("condition:")), false, id);

    const mutation = buildEffectsMutationPlan([
      token("caster"),
      token("target"),
    ], plan.operations);
    const persistedSpell = state(mutation, "target").spells[0];
    assert.deepEqual(persistedSpell.summaryParts, expectedSummary, id);
    assert.deepEqual(persistedSpell.castContext, intent.persistedCastContext, id);
    assert.equal(persistedSpell.turns, spell.defaultTurns, id);
    assert.equal(persistedSpell.conc, true, id);
    assert.deepEqual(state(mutation, "target").conditions, [], id);
    assert.equal(Object.keys(state(mutation, "caster").concentrations).length, 1, id);
  }
});

test("summaryParts resta presentation-only nella card e nel layout", () => {
  const summaryParts = [{ id: "flame-blade-fire-damage", label: "3d6 fuoco" }];
  const cardItems = __compactEffectItems([], [{
    name: "Lama infuocata",
    instanceId: "flame-blade-instance",
    turns: 100,
    conc: true,
    summaryParts,
  }], true);
  assert.deepEqual(cardItems[0].summaryParts, summaryParts);

  const rows = planEffectsLayout({
    expansionMode: "all",
    tokens: [
      token("caster", {
        position: { x: 0, y: 0 },
        width: 70,
        height: 70,
        assignments: [{
          key: "flame-blade",
          displayName: "Lama infuocata",
          instanceId: "flame-blade-instance",
          targets: ["target"],
          color: { solid: "#f97316", fillOpacity: 1 },
        }],
        spellEntries: [],
      }),
      token("target", {
        position: { x: 100, y: 0 },
        width: 70,
        height: 70,
        assignments: [],
        spellEntries: [{
          name: "Lama infuocata",
          instanceId: "flame-blade-instance",
          turns: 100,
          conc: true,
          summaryParts,
        }],
      }),
    ],
  });
  assert.ok(rows.some((row) => row.kind === "spell" && row.text === "Lama infuocata" && !row.summaryPart));
  assert.ok(rows.some((row) => row.kind === "spell" && row.text === "3d6 fuoco" && row.summaryPart === true));
});

test("l'audit chiude entrambe come TRACK_ONLY senza REPEATED_ACTION P1", () => {
  const audit = buildSpellAutomationAudit();
  for (const { id } of BLADE_CASES) {
    const row = audit.rows.find((entry) => entry.id === id);
    assert.ok(row, id);
    assert.equal(row.currentAutomationLevel, "TRACK_ONLY", id);
    assert.equal(row.targetAutomationLevel, "TRACK_ONLY", id);
    assert.equal(row.coverageStatus, "CLOSED", id);
    assert.equal(row.priority, "—", id);
    assert.deepEqual(row.gaps, [], id);
    assert.equal(row.integration.cast.mutationMode, "tracking", id);
    assert.deepEqual(row.integration.actions.declaredActionIds, [], id);
    assert.equal(row.integration.issues.length, 0, id);
    assert.match(row.curatedNote, /TRACK_ONLY\/CLOSED/iu, id);
  }
});
