import assert from "node:assert/strict";
import test from "node:test";
import {
  getSpellCastResolutionRule,
  spellHasExplicitInitialHP,
  spellHasExplicitInitialHPPolicy,
  spellSaveDamageFactor,
} from "../src/spellCastResolutionRules.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";
import { areaMembershipTargetIds } from "../src/spellAreaMembershipCore.js";

const TARGET_CANDIDATES = [
  { key: "target-failed", label: "Target Fallito", hp: 50, hpMax: 50 },
  { key: "target-passed", label: "Target Superato", hp: 50, hpMax: 50 },
  { key: "target-immune", label: "Target Immune", hp: 50, hpMax: 50 },
];

function contract(spellId) {
  return buildSpellUnifiedPanelContract({ spellId });
}

function modelFor(spellId, sessionPatch = {}) {
  const currentContract = contract(spellId);
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster-a",
    ...sessionPatch,
  });
  return buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    selectedCatalogKey: spellId,
    casterOptions: [{ value: "caster-a", label: "Caster A" }],
    targetCandidates: TARGET_CANDIDATES,
  });
}

function commandFor(spellId, {
  targetIds = ["target-failed", "target-passed"],
  outcomes = { "target-failed": "failed", "target-passed": "passed" },
  hpAmount = 20,
  placement = null,
} = {}) {
  const currentContract = contract(spellId);
  return buildSpellAreaResolutionCommand({
    contract: currentContract,
    casterId: "caster-a",
    slotLevel: currentContract.spell.level || 1,
    targetIds,
    outcomes,
    hpAmount,
    placement: placement || {
      status: "confirmed",
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster-a",
      preview: {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 0 },
        gridOrigin: { x: 0, y: 0 },
        targetIds,
      },
    },
  });
}

// ============================================================================
// SP-B02A CONTRACT TESTS: SPELL CAST RESOLUTION RULES
// ============================================================================

test("SP-B02A: Snilloc possiede initialHP: true nel runtime di risoluzione", () => {
  const spellId = "xanathar-sciame-di-palle-di-neve-di-snilloc";
  assert.equal(spellHasExplicitInitialHPPolicy(spellId), true);
  assert.equal(spellHasExplicitInitialHP(spellId), true);
  assert.equal(spellSaveDamageFactor(spellId, "passed"), null); // default save-for-half
});

test("SP-B02A: Aganazzar possiede initialHP: true nel runtime di risoluzione", () => {
  const spellId = "xanathar-vampa-di-aganazzar";
  assert.equal(spellHasExplicitInitialHPPolicy(spellId), true);
  assert.equal(spellHasExplicitInitialHP(spellId), true);
  assert.equal(spellSaveDamageFactor(spellId, "passed"), null); // default save-for-half
});

test("SP-B02A: Parola Radiosa possiede initialHP: true e successfulSaveDamage: 'none' (save-or-suck)", () => {
  const spellId = "xanathar-parola-radiosa";
  const rule = getSpellCastResolutionRule(spellId);
  assert.equal(rule?.initialHP, true);
  assert.equal(rule?.successfulSaveDamage, "none");
  assert.equal(spellHasExplicitInitialHPPolicy(spellId), true);
  assert.equal(spellHasExplicitInitialHP(spellId), true);
  assert.equal(spellSaveDamageFactor(spellId, "passed"), "zero");
});

test("SP-B02A: Rombo di Tuono possiede initialHP: true e successfulSaveDamage: 'none' (save-or-suck)", () => {
  const spellId = "xanathar-rombo-di-tuono";
  const rule = getSpellCastResolutionRule(spellId);
  assert.equal(rule?.initialHP, true);
  assert.equal(rule?.successfulSaveDamage, "none");
  assert.equal(spellHasExplicitInitialHPPolicy(spellId), true);
  assert.equal(spellHasExplicitInitialHP(spellId), true);
  assert.equal(spellSaveDamageFactor(spellId, "passed"), "zero");
});

// ============================================================================
// SP-B02A CONTRACT TESTS: UNIFIED PANEL VIEW (DAMAGE INPUT VISIBILITY)
// ============================================================================

test("SP-B02A: Tutte e quattro le spell espongono il campo danno visibile e richiesto", () => {
  const spells = [
    "xanathar-sciame-di-palle-di-neve-di-snilloc",
    "xanathar-vampa-di-aganazzar",
    "xanathar-parola-radiosa",
    "xanathar-rombo-di-tuono",
  ];

  for (const spellId of spells) {
    const currentContract = contract(spellId);
    assert.equal(currentContract.presentation.inputs.damage?.visible, true, `${spellId} inputs.damage.visible`);
    assert.equal(currentContract.presentation.inputs.damage?.required, true, `${spellId} inputs.damage.required`);
    assert.equal(currentContract.execution.hasHP, true, `${spellId} execution.hasHP`);

    const view = modelFor(spellId);
    assert.equal(view.effects.visible, true, `${spellId} view.effects.visible`);
    const damageField = view.effects.fields.find((f) => f.id === "damage");
    assert.ok(damageField, `${spellId} must have damage field in effects.fields`);
    assert.equal(damageField.type, "number");
    assert.equal(damageField.label, "Danno");
  }
});

// ============================================================================
// SP-B02A CONTRACT TESTS: HP PREVIEW
// ============================================================================

test("SP-B02A: HP Preview per Snilloc e Aganazzar applica full damage su failed e half damage su passed", () => {
  const halfSpells = [
    "xanathar-sciame-di-palle-di-neve-di-snilloc",
    "xanathar-vampa-di-aganazzar",
  ];

  for (const spellId of halfSpells) {
    const view = modelFor(spellId, {
      targetIds: ["target-failed", "target-passed", "target-immune"],
      outcomes: {
        "target-failed": "failed",
        "target-passed": "passed",
        "target-immune": "immune",
      },
      hpValues: { damage: 20 },
    });

    assert.equal(view.effects.preview.visible, true, `${spellId} preview visible`);
    assert.equal(view.effects.preview.mode, "damage", `${spellId} preview mode`);
    assert.deepEqual(
      view.effects.preview.targets.map((t) => ({
        key: t.key,
        factor: t.factor,
        factorLabel: t.factorLabel,
        beforeHP: t.beforeHP,
        afterHP: t.afterHP,
        delta: t.delta,
      })),
      [
        { key: "target-failed", factor: "full", factorLabel: "Pieno", beforeHP: 50, afterHP: 30, delta: -20 },
        { key: "target-passed", factor: "half", factorLabel: "Metà", beforeHP: 50, afterHP: 40, delta: -10 },
        { key: "target-immune", factor: "immune", factorLabel: "Immune", beforeHP: 50, afterHP: 50, delta: 0 },
      ],
      `${spellId} preview targets calculation`,
    );
  }
});

test("SP-B02A: HP Preview per Parola Radiosa e Rombo di Tuono applica full su failed e zero su passed (NON nasconde damage input)", () => {
  const zeroSpells = [
    "xanathar-parola-radiosa",
    "xanathar-rombo-di-tuono",
  ];

  for (const spellId of zeroSpells) {
    const view = modelFor(spellId, {
      targetIds: ["target-failed", "target-passed", "target-immune"],
      outcomes: {
        "target-failed": "failed",
        "target-passed": "passed",
        "target-immune": "immune",
      },
      hpValues: { damage: 20 },
    });

    assert.equal(view.effects.preview.visible, true, `${spellId} preview visible`);
    assert.equal(view.effects.preview.mode, "damage", `${spellId} preview mode`);
    assert.deepEqual(
      view.effects.preview.targets.map((t) => ({
        key: t.key,
        factor: t.factor,
        factorLabel: t.factorLabel,
        beforeHP: t.beforeHP,
        afterHP: t.afterHP,
        delta: t.delta,
      })),
      [
        { key: "target-failed", factor: "full", factorLabel: "Pieno", beforeHP: 50, afterHP: 30, delta: -20 },
        { key: "target-passed", factor: "zero", factorLabel: "No danno", beforeHP: 50, afterHP: 50, delta: 0 },
        { key: "target-immune", factor: "immune", factorLabel: "Immune", beforeHP: 50, afterHP: 50, delta: 0 },
      ],
      `${spellId} preview targets calculation`,
    );
  }
});

// ============================================================================
// SP-B02A CONTRACT TESTS: COMMAND CORE VALIDATION & OUTCOME FACTORS
// ============================================================================

test("SP-B02A: Resolution command richiede hpAmount e calcola outcomeFactors corretti per tutte e quattro le spell", () => {
  const cases = [
    {
      spellId: "xanathar-sciame-di-palle-di-neve-di-snilloc",
      expectedPassedFactor: "half",
    },
    {
      spellId: "xanathar-vampa-di-aganazzar",
      expectedPassedFactor: "half",
    },
    {
      spellId: "xanathar-parola-radiosa",
      expectedPassedFactor: "zero",
    },
    {
      spellId: "xanathar-rombo-di-tuono",
      expectedPassedFactor: "zero",
    },
  ];

  for (const { spellId, expectedPassedFactor } of cases) {
    // 1. Senza hpAmount valido -> errore di validazione hp-required
    const invalidCommand = commandFor(spellId, { hpAmount: null });
    assert.equal(invalidCommand.valid, false, `${spellId} without hpAmount must be invalid`);
    assert.ok(invalidCommand.errors.includes("hp-required"), `${spellId} must have hp-required error`);

    // 2. Con hpAmount valido -> comando valido con outcomeFactors
    const validCommand = commandFor(spellId, { hpAmount: 18 });
    assert.equal(validCommand.valid, true, `${spellId} with hpAmount must be valid`);
    assert.equal(validCommand.hp.mode, "damage", `${spellId} command.hp.mode`);
    assert.equal(validCommand.hp.amount, 18, `${spellId} command.hp.amount`);
    assert.equal(validCommand.hp.outcomeFactors["target-failed"], "full", `${spellId} failed factor`);
    assert.equal(validCommand.hp.outcomeFactors["target-passed"], expectedPassedFactor, `${spellId} passed factor`);
  }
});

// ============================================================================
// REGRESSION CONTROL: FIREBALL & BURNING HANDS
// ============================================================================

test("SP-B02A Regression: Palla di Fuoco e Mani Brucianti mantengono damage input e save-for-half", () => {
  const controlSpells = ["fireball", "burning-hands"];

  for (const spellId of controlSpells) {
    const currentContract = contract(spellId);
    assert.equal(currentContract.presentation.inputs.damage?.visible, true);
    assert.equal(currentContract.presentation.inputs.damage?.required, true);

    const view = modelFor(spellId, {
      targetIds: ["target-failed", "target-passed"],
      outcomes: { "target-failed": "failed", "target-passed": "passed" },
      hpValues: { damage: 28 },
    });
    assert.equal(view.effects.visible, true);
    assert.ok(view.effects.fields.some((f) => f.id === "damage"));
    assert.equal(view.effects.preview.targets[0].delta, -28);
    assert.equal(view.effects.preview.targets[1].delta, -14);

    const cmd = commandFor(spellId, { hpAmount: 28 });
    assert.equal(cmd.valid, true);
    assert.equal(cmd.hp.outcomeFactors["target-failed"], "full");
    assert.equal(cmd.hp.outcomeFactors["target-passed"], "half");
  }
});

// ============================================================================
// SP-B02A.1: PAROLA RADIOSA CASTER EXCLUSION
// ============================================================================

test("SP-B02A.1: Parola Radiosa dichiara includeCaster: false nel targeting della regola area", () => {
  const rule = getSpellAreaRuleById("xanathar-parola-radiosa:cast");
  assert.ok(rule, "xanathar-parola-radiosa:cast rule must exist");
  assert.equal(rule.targeting.includeCaster, false);
});

test("SP-B02A.1: Parola Radiosa esclude il caster dal contratto unificato", () => {
  const currentContract = contract("xanathar-parola-radiosa");
  assert.equal(currentContract.presentation.targeting.includeCaster, false);
});

test("SP-B02A.1: Parola Radiosa esclude il caster dalla risoluzione spaziale dei target e include due creature nell'area", () => {
  const rule = getSpellAreaRuleById("xanathar-parola-radiosa:cast");
  const area = { cells: [{ x: 0, y: 0, width: 300, height: 300 }] };
  const bounds = (x, y, size = 100) => ({ min: { x, y }, max: { x: x + size, y: y + size } });
  const metaKey = "com.thebigpicture.initiative/meta";
  const token = (id, attitude = "enemy") => ({
    id,
    metadata: { [metaKey]: { attitude } },
  });

  const caster = token("caster-token", "pc");
  const creatureA = token("creature-a", "enemy");
  const creatureB = token("creature-b", "enemy");
  const outsideCreature = token("creature-outside", "enemy");

  const targetIds = areaMembershipTargetIds({
    sourceId: "caster-token",
    rule,
    area,
    metaKey,
    candidates: [
      { item: caster, bounds: bounds(0, 0) },
      { item: creatureA, bounds: bounds(100, 0) },
      { item: creatureB, bounds: bounds(200, 0) },
      { item: outsideCreature, bounds: bounds(400, 0) },
    ],
  });

  assert.deepEqual(targetIds, ["creature-a", "creature-b"]);
  assert.equal(targetIds.includes("caster-token"), false, "caster must be excluded from targetIds");
});

test("SP-B02A.1: Parola Radiosa esclude il caster da hpPreview, applicando full su failed e zero su passed", () => {
  const spellId = "xanathar-parola-radiosa";
  const currentContract = contract(spellId);
  const session = createSpellPanelSession({
    contract: currentContract,
    casterId: "caster-token",
    targetIds: ["creature-a", "creature-b"],
    outcomes: {
      "creature-a": "failed",
      "creature-b": "passed",
    },
    hpValues: { damage: 20 },
  });

  const view = buildUnifiedPanelViewModel({
    contract: currentContract,
    session,
    selectedCatalogKey: spellId,
    casterOptions: [{ value: "caster-token", label: "Caster" }],
    targetCandidates: [
      { key: "caster-token", label: "Caster", hp: 50, hpMax: 50 },
      { key: "creature-a", label: "Creatura A (failed)", hp: 50, hpMax: 50 },
      { key: "creature-b", label: "Creatura B (passed)", hp: 50, hpMax: 50 },
    ],
  });

  assert.equal(view.effects.preview.visible, true);
  assert.equal(view.effects.preview.mode, "damage");
  // Caster non deve apparire nei target della preview
  assert.deepEqual(
    view.effects.preview.targets.map((t) => ({
      key: t.key,
      factor: t.factor,
      factorLabel: t.factorLabel,
      delta: t.delta,
    })),
    [
      { key: "creature-a", factor: "full", factorLabel: "Pieno", delta: -20 },
      { key: "creature-b", factor: "zero", factorLabel: "No danno", delta: 0 },
    ],
  );
});

test("SP-B02A.1: Parola Radiosa esclude il caster da command.hp con esiti corretti per le due creature", () => {
  const spellId = "xanathar-parola-radiosa";
  const cmd = commandFor(spellId, {
    targetIds: ["creature-a", "creature-b"],
    outcomes: { "creature-a": "failed", "creature-b": "passed" },
    hpAmount: 20,
  });

  assert.equal(cmd.valid, true);
  assert.deepEqual(cmd.targeting.targetIds, ["creature-a", "creature-b"]);
  assert.equal(cmd.hp.targetIds.includes("caster-a"), false);
  assert.equal(cmd.hp.outcomeFactors["creature-a"], "full");
  assert.equal(cmd.hp.outcomeFactors["creature-b"], "zero");
});

test("SP-B02A.1 Regression: Rombo di Tuono esclude caster, Snilloc e Aganazzar includono caster", () => {
  assert.equal(getSpellAreaRuleById("xanathar-rombo-di-tuono:cast").targeting.includeCaster, false);
  assert.equal(getSpellAreaRuleById("xanathar-sciame-di-palle-di-neve-di-snilloc:cast").targeting.includeCaster, true);
  assert.equal(getSpellAreaRuleById("xanathar-vampa-di-aganazzar:cast").targeting.includeCaster, true);
});
