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
  assert.equal(aura.radiusMeters, 3);
  assert.equal(aura.style.fillColor, "#abcdef");
  assert.equal(aura.style.strokeWidth, 3);
  assert.equal(aura.pill.enabled, true);
  assert.equal(aura.pill.kind, "debuff");
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
