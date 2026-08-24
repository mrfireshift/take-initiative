import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { normalizeEffectSaveReminder } from "../src/effectSaveReminderCore.js";
import { spellEffectConditionOptions } from "../src/spellEffectCore.js";
import { normalizeSaveSpellAutomation } from "../src/saveSpellCore.js";
import {
  areaMembershipPlan,
} from "../src/spellAreaMembershipCore.js";
import {
  getAreaSaveAutomation,
  getProposedConditions,
  getSpellDefinition,
  getSpellEffects,
} from "../src/spells-srd.js";
import { __compactEffectItems } from "../src/initiativeCardCompact.js";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {},
    buildLabel: () => ({}),
  },
});

const { getConditionWidgetLayoutParts } = await import(
  "../src/conditions.js?summary-parts-tranche1"
);

function applyCondition(conditionName, options, instanceId) {
  const plan = buildEffectsMutationPlan(
    [{ id: "target", conditions: [] }],
    [{
      type: "condition:add",
      targetIds: ["target"],
      instanceIds: { target: instanceId },
      conditionName,
      options,
    }],
  );
  const state = plan.states.find((entry) => entry.id === "target");
  assert.equal(state.conditions.length, 1);
  return state.conditions[0];
}

function project(instance, spellName) {
  const card = __compactEffectItems(
    [instance],
    [{
      name: spellName,
      instanceId: instance.parentEffectId,
      turns: 10,
    }],
    false,
    { formatConditionInstance: (value) => value.condition },
  );
  const map = getConditionWidgetLayoutParts({ instances: [instance] });

  assert.equal(card.length, 1);
  assert.deepEqual(card[0].summaryParts, instance.summaryParts);
  assert.equal(map.length, 1);
  assert.deepEqual(map[0].summaryParts, instance.summaryParts);
  return { card, map };
}

test("la tranche 1 dichiara summaryParts esatte e mantiene detail/reminder", () => {
  assert.deepEqual(
    getAreaSaveAutomation("slow").failed[0].summaryParts,
    [
      { id: "speed-half", label: "Vel ½" },
      { id: "ac-dex-save-penalty", label: "CA −2 / TS Des −2" },
      { id: "no-reactions", label: "No reaz." },
      { id: "action-or-bonus", label: "Azione o Bonus" },
      { id: "attack-limit", label: "Max 1 att." },
    ],
  );
  const slow = getAreaSaveAutomation("slow").failed[0];
  assert.match(slow.effectDetail, /d20/u);
  assert.equal(slow.summaryParts.some((part) => part.label.includes("d20")), false);

  assert.deepEqual(
    getSpellEffects("Parola del Potere Dolore")[0].summaryParts,
    [
      { id: "power-word-pain-speed-limit", label: "Vel max 3m" },
      { id: "power-word-pain-penalties", label: "Att/prove/TS −" },
    ],
  );
  assert.deepEqual(
    getSpellEffects("Scossa Sinaptica")[0].summaryParts,
    [
      { id: "synaptic-attack-penalty", label: "Att −1d6" },
      { id: "synaptic-check-penalty", label: "Prove −1d6" },
      { id: "synaptic-concentration-save-penalty", label: "TS concentrazione −1d6" },
    ],
  );

  const dance = getProposedConditions(
    getSpellDefinition("irresistible-dance"),
  )[0];
  assert.deepEqual(dance.options.summaryParts, [
    { id: "irresistible-dance-in-place", label: "Danza sul posto" },
    { id: "irresistible-dance-penalties", label: "TS Des/att. −" },
    { id: "irresistible-dance-incoming-advantage", label: "Attacchi contro vant." },
  ]);

  assert.deepEqual(
    getSpellEffects("enlarge-reduce", "enlarge")[0].summaryParts,
    [
      { id: "enlarged-size", label: "Taglia +1" },
      { id: "enlarged-strength", label: "Vant. For/TS" },
      { id: "enlarged-weapon-damage", label: "+1d4 armi" },
    ],
  );
  assert.deepEqual(
    getSpellEffects("enlarge-reduce", "reduce")[0].summaryParts,
    [
      { id: "reduced-size", label: "Taglia −1" },
      { id: "reduced-strength", label: "Svant. For/TS" },
      { id: "reduced-weapon-damage", label: "−1d4 armi" },
    ],
  );

  for (const type of ["acido", "freddo", "fulmine", "fuoco", "tuono"]) {
    assert.deepEqual(
      getSpellEffects("xanathar-anatema-elementale", type)[0].summaryParts,
      [
        {
          id: "elemental-bane-resistance-" + type,
          label: "No res. " + type,
        },
        { id: "elemental-bane-damage", label: "+2d6/turno" },
      ],
      type,
    );
  }

  assert.deepEqual(
    getSpellEffects("Ombra di Moil")[0].summaryParts,
    [
      { id: "shadow-of-moil-obscured", label: "Oscurato" },
      { id: "shadow-of-moil-radiant-resistance", label: "Res. radiosi" },
      { id: "shadow-of-moil-melee-retaliation", label: "Ritorsione mischia" },
    ],
  );
});

test("effectSaveRule conserva summaryParts, identity e metadati fino a card e mappa", () => {
  const rule = getAreaSaveAutomation("xanathar-scossa-sinaptica")
    .failed
    .find((entry) => entry.effectId === "synaptic-static-penalty");
  const normalized = normalizeSaveSpellAutomation({ failed: [rule] })
    .rulesByOutcome
    .failed[0];
  const instance = applyCondition(
    normalized.conditionName,
    {
      ...normalized.options,
      sourceId: "caster",
      parentEffectId: "synaptic-cast",
      type: "spell",
    },
    "synaptic-effect",
  );

  assert.deepEqual(instance.summaryParts, rule.summaryParts);
  assert.equal(instance.effectId, rule.effectId);
  assert.equal(instance.effectKind, rule.effectKind);
  assert.equal(instance.effectDetail, rule.effectDetail);
  assert.deepEqual(instance.expiry, rule.expiry);
  assert.deepEqual(instance.saveReminder, normalizeEffectSaveReminder(rule.saveReminder));
  assert.equal(instance.parentEffectId, "synaptic-cast");
  assert.equal(instance.id, "synaptic-effect");

  const { card, map } = project(instance, "Scossa Sinaptica");
  assert.deepEqual(card[0].summaryParts, rule.summaryParts);
  assert.deepEqual(map[0].summaryParts, rule.summaryParts);
});

test("spellEffectConditionOptions conserva una sola instance direct effect fino a card e mappa", () => {
  const effect = getSpellEffects("Parola del Potere Dolore")[0];
  const instance = applyCondition(
    effect.label,
    spellEffectConditionOptions(
      effect,
      { sourceId: "caster" },
      "power-word-cast",
    ),
    "power-word-effect",
  );

  assert.deepEqual(instance.summaryParts, effect.summaryParts);
  assert.equal(instance.effectId, effect.id);
  assert.equal(instance.effectKind, effect.kind);
  assert.equal(instance.effectDetail, effect.detail);
  assert.deepEqual(instance.mechanics, effect.mechanics);
  assert.deepEqual(instance.expiry, effect.expiry);
  assert.deepEqual(instance.saveReminder, normalizeEffectSaveReminder(effect.saveReminder));
  assert.equal(instance.parentEffectId, "power-word-cast");
  assert.equal(instance.id, "power-word-effect");

  const { card, map } = project(instance, "Parola del Potere Dolore");
  assert.deepEqual(card[0].summaryParts, effect.summaryParts);
  assert.deepEqual(map[0].summaryParts, effect.summaryParts);
});

test("areaMembershipPlan inoltra summaryParts senza creare una seconda instance", () => {
  const rule = {
    effectPolicy: {
      mode: "while-inside",
      effect: {
        id: "area-speed-zero",
        kind: "debuff",
        label: "Velocità nulla nell'aura",
        detail: "La velocità è 0 finché il bersaglio resta nell'aura.",
        summaryParts: [{ id: "speed-zero", label: "Vel 0" }],
      },
    },
  };
  const membership = areaMembershipPlan({
    instanceId: "aura-cast",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["target"],
    items: [],
    metaKey: "meta",
  });
  const addition = membership.operations.find(
    (operation) => operation.type === "condition:add",
  );

  assert.deepEqual(addition.options.summaryParts, [
    { id: "speed-zero", label: "Vel 0" },
  ]);
  const instance = applyCondition(
    addition.conditionName,
    {
      ...addition.options,
      instanceId: undefined,
    },
    "area-effect",
  );

  assert.equal(instance.id, "area-effect");
  assert.equal(instance.parentEffectId, "aura-cast");
  assert.deepEqual(instance.summaryParts, addition.options.summaryParts);
  const { card, map } = project(instance, "Aura test");
  assert.deepEqual(card[0].summaryParts, addition.options.summaryParts);
  assert.deepEqual(map[0].summaryParts, addition.options.summaryParts);
});

test("un effect senza summaryParts mantiene la projection legacy senza mini-pill", () => {
  const instance = applyCondition(
    "Effetto legacy",
    {
      sourceId: "caster",
      parentEffectId: "legacy-cast",
      type: "spell",
      effectId: "legacy-effect",
      effectKind: "debuff",
      effectDetail: "Dettaglio legacy.",
      expiry: { mode: "manual" },
    },
    "legacy-effect-instance",
  );

  assert.equal("summaryParts" in instance, false);
  const card = __compactEffectItems(
    [instance],
    [{ name: "Legacy", instanceId: "legacy-cast", turns: 1 }],
    false,
  );
  assert.equal("summaryParts" in card[0], false);
  assert.equal(
    "summaryParts" in getConditionWidgetLayoutParts({ instances: [instance] })[0],
    false,
  );
});
