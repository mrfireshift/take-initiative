import test from "node:test";
import assert from "node:assert/strict";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { ID } from "../src/constants.js";
import {
  CUSTOM_AURA_EFFECT_TYPE,
  collectActiveCustomAuras,
  customAuraMembershipPlan,
  customAuraRule,
  customAuraTargetIds,
  normalizeCustomAura,
  normalizeCustomAuraDefinition,
  staleCustomAuraEffectRemovals,
} from "../src/customAuraCore.js";

const META_KEY = `${ID}/meta`;

function auraSource(overrides = {}) {
  return {
    id: "source",
    name: "Custode",
    metadata: {
      [META_KEY]: {
        attitude: "ally",
        customAuras: [{
          id: "ward",
          enabled: true,
          name: "Aura del Custode",
          radiusMeters: 3,
          targeting: { filter: "friendly", includeSource: true },
          pill: {
            enabled: true,
            label: "Protetto dall'aura",
            detail: "Resta vicino al Custode.",
            kind: "buff",
          },
          warnings: {
            start: { enabled: true, label: "Inizio turno protetto." },
            end: { enabled: true, label: "Fine turno protetto." },
          },
          ...overrides,
        }],
      },
    },
  };
}

test("normalizza dimensione, stile e testi dell'aura personalizzata", () => {
  const aura = normalizeCustomAura({
    id: "ward",
    radiusMeters: 0,
    style: { fillColor: "#ABCDEF", strokeWidth: 20 },
    pill: { enabled: true, kind: "debuff" },
  });
  assert.equal(aura.id, "ward");
  assert.equal(aura.radiusMeters, 0);
  assert.equal(aura.style.fillColor, "#abcdef");
  assert.equal(aura.style.strokeWidth, 3);
  assert.equal(aura.pills.length, 1);
  assert.equal(aura.pills[0].enabled, true);
  assert.equal(aura.pills[0].kind, "debuff");
  assert.equal(aura.pill, undefined);
  assert.equal(aura.warnings, undefined);
});

test("quantizza il raggio Custom Aura al multiplo canonico di 1.5", () => {
  const cases = [
    [0, 0],
    [0.4, 0],
    [0.8, 1.5],
    [1.5, 1.5],
    [3, 3],
    [4.5, 4.5],
    [8, 7.5],
    [8.4, 9],
  ];

  for (const [input, expected] of cases) {
    assert.equal(
      normalizeCustomAura({ radiusMeters: input }).radiusMeters,
      expected,
    );
  }

  assert.equal(normalizeCustomAura({ radiusMeters: "not-a-number" }).radiusMeters, 3);
  assert.equal(normalizeCustomAura({ radiusMeters: Number.NaN }).radiusMeters, 3);
  assert.equal(normalizeCustomAura({ radiusMeters: Number.POSITIVE_INFINITY }).radiusMeters, 3);
  assert.equal(normalizeCustomAura({ radiusMeters: 300 }).radiusMeters, 300);
});

test("la normalizzazione della definizione espone solo il contratto canonico", () => {
  const definition = normalizeCustomAuraDefinition({
    id: "ignored-id",
    enabled: false,
    name: "Aura canonica",
    pill: { label: "Legacy" },
    warnings: { start: { enabled: true } },
  });
  assert.deepEqual(Object.keys(definition).sort(), [
    "name",
    "pills",
    "radiusMeters",
    "reminders",
    "style",
    "targeting",
  ]);
  assert.equal(definition.pills[0].label, "Legacy");
  assert.equal(definition.reminders[0].event, "turn-start");
});

test("raccoglie solo aure abilitate e assegna un'identita per sorgente", () => {
  const items = [auraSource(), auraSource({ id: "off", enabled: false })];
  items[1].id = "second";
  const auras = collectActiveCustomAuras(items, { metaKey: META_KEY });
  assert.equal(auras.length, 1);
  assert.equal(auras[0].instanceId, "source:ward");
  assert.equal(auras[0].sourceName, "Custode");
});

test("filtra la membership e crea la pill finche il token resta nell'aura", () => {
  const source = auraSource();
  const ally = {
    id: "ally",
    metadata: { [META_KEY]: { attitude: "pc" } },
  };
  const enemy = {
    id: "enemy",
    metadata: { [META_KEY]: { attitude: "enemy" } },
  };
  const [aura] = collectActiveCustomAuras([source], { metaKey: META_KEY });
  const area = buildCircleArea(
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    1,
    { x: 0, y: 0 },
  );
  const targetIds = customAuraTargetIds({
    aura,
    area,
    candidates: [
      { item: source, bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } },
      { item: ally, bounds: { min: { x: 1, y: 0 }, max: { x: 2, y: 1 } } },
      { item: enemy, bounds: { min: { x: 1, y: 1 }, max: { x: 2, y: 2 } } },
    ],
    metaKey: META_KEY,
  });
  assert.deepEqual(targetIds, ["source", "ally"]);

  const plan = customAuraMembershipPlan({
    aura,
    desiredTargetIds: targetIds,
    items: [source, ally, enemy],
    metaKey: META_KEY,
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, "condition:add");
  assert.deepEqual(plan.operations[0].targetIds, ["source", "ally"]);
  assert.equal(plan.operations[0].conditionName, "Protetto dall'aura");
  assert.equal(plan.operations[0].options.type, CUSTOM_AURA_EFFECT_TYPE);
  assert.equal(plan.operations[0].options.theme.accent, aura.style.strokeColor);
});

test("produce warning separati per inizio e fine turno", () => {
  const [aura] = collectActiveCustomAuras([auraSource()], { metaKey: META_KEY });
  const rule = customAuraRule(aura);
  assert.deepEqual(
    rule.triggerPolicy.triggers.map(({ event, label }) => ({ event, label })),
    [
      { event: "turn-start", label: "Inizio turno protetto." },
      { event: "turn-end", label: "Fine turno protetto." },
    ],
  );
});

test("rimuove solo pill di aure personalizzate non piu attive", () => {
  const removals = staleCustomAuraEffectRemovals([{
    id: "ally",
    metadata: {
      [META_KEY]: {
        conditions: { instances: [
          {
            id: "stale-pill",
            active: true,
            type: CUSTOM_AURA_EFFECT_TYPE,
            parentEffectId: "source:old",
          },
          {
            id: "active-pill",
            active: true,
            type: CUSTOM_AURA_EFFECT_TYPE,
            parentEffectId: "source:ward",
          },
          {
            id: "foreign-pill",
            active: true,
            type: "spell",
            parentEffectId: "source:old",
          },
        ] },
      },
    },
  }], {
    activeInstanceIds: ["source:ward"],
    metaKey: META_KEY,
  });
  assert.deepEqual(removals, [{ itemId: "ally", instanceId: "stale-pill" }]);
});

test("rimuove la pill applicata quando viene disabilitata o rimossa lasciando l'aura attiva", () => {
  const removals = staleCustomAuraEffectRemovals([{
    id: "ally",
    metadata: {
      [META_KEY]: {
        conditions: { instances: [
          {
            id: "removed-pill",
            active: true,
            type: CUSTOM_AURA_EFFECT_TYPE,
            parentEffectId: "source:ward",
            effectId: "ward:pill",
          },
        ] },
      },
    },
  }], {
    activeInstanceIds: ["source:ward"],
    activeEffectKeys: new Set(),
    metaKey: META_KEY,
  });
  assert.deepEqual(removals, [{ itemId: "ally", instanceId: "removed-pill" }]);
});

test("migra formato legacy a pills[], reminders[] e genera ID persistenti", () => {
  const legacy = {
    id: "holy-aura",
    name: "Aura Sacra",
    pill: { enabled: true, label: "Benedetto", detail: "Bonus ai TS", kind: "buff" },
    warnings: {
      start: { enabled: true, label: "Inizia nel sacro" },
      end: { enabled: false, label: "Fine nel sacro" },
    },
  };
  const normalized = normalizeCustomAura(legacy);
  assert.equal(normalized.pills.length, 1);
  assert.equal(normalized.pills[0].id, "pill");
  assert.equal(normalized.pills[0].label, "Benedetto");
  assert.equal(normalized.pills[0].kind, "buff");

  assert.equal(normalized.reminders.length, 2);
  assert.equal(normalized.reminders[0].id, "warning-start");
  assert.equal(normalized.reminders[0].enabled, true);
  assert.equal(normalized.reminders[0].event, "turn-start");
  assert.equal(normalized.reminders[0].label, "Inizia nel sacro");
  assert.equal(normalized.reminders[0].resolution, "informational");

  assert.equal(normalized.reminders[1].id, "warning-end");
  assert.equal(normalized.reminders[1].enabled, false);

  assert.equal(normalized.pill, undefined);
  assert.equal(normalized.warnings, undefined);
});

test("proietta piu pills indipendenti nella membership", () => {
  const aura = normalizeCustomAura({
    id: "paladin-aura",
    name: "Aura di Protezione",
    pills: [
      { id: "p1", enabled: true, label: "Coraggio", kind: "buff" },
      { id: "p2", enabled: true, label: "Devozione", kind: "buff" },
      { id: "p3", enabled: false, label: "Disattivata", kind: "buff" },
    ],
  });
  const rule = customAuraRule(aura);
  assert.equal(rule.effectPolicy.effects.length, 2);
  assert.deepEqual(
    rule.effectPolicy.effects.map((e) => ({ id: e.id, label: e.label })),
    [
      { id: "paladin-aura:p1", label: "Coraggio" },
      { id: "paladin-aura:p2", label: "Devozione" },
    ],
  );
});

test("compila reminder manual-save con TS Des, CD fissa, danno dimezzato e condizione su fallimento", () => {
  const aura = normalizeCustomAura({
    id: "fire-aura",
    name: "Aura di Fuoco",
    reminders: [
      {
        id: "burn",
        enabled: true,
        event: "turn-start",
        label: "TS Destrezza per evitare bruciature",
        resolution: "manual-save",
        ability: "dex",
        dcMode: "fixed",
        dc: 14,
        damage: { dice: "2d6", type: "fuoco", onSave: "half" },
        failureCondition: { condition: "Prono" },
      },
    ],
  });
  const rule = customAuraRule(aura);
  assert.equal(rule.triggerPolicy.triggers.length, 1);
  const trigger = rule.triggerPolicy.triggers[0];
  assert.equal(trigger.id, "fire-aura:burn");
  assert.equal(trigger.event, "turn-start");
  assert.equal(trigger.resolution, "manual-save");
  assert.equal(trigger.ability, "dex");
  assert.equal(trigger.dc, 14);
  assert.equal(trigger.resolutionData.dc, 14);
  assert.equal(trigger.damage.dice, "2d6");
  assert.equal(trigger.damage.onPassed, "half");
  assert.equal(trigger.damage.onFailed, "full");
  assert.equal(trigger.failureCondition.condition, "Prono");
});
