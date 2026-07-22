import test from "node:test";
import assert from "node:assert/strict";
import {
  planEffectsLayout,
  planEffectsWidgetDiff,
} from "../src/effectsLayoutCore.js";

const measureText = (text) => String(text).length * 10;

function token(id, overrides = {}) {
  return {
    id,
    position: { x: 100, y: 100 },
    width: 70,
    height: 70,
    scale: { x: 1, y: 1 },
    conditionParts: [],
    concentrationKey: null,
    spellEntries: [],
    assignments: [],
    ...overrides,
  };
}

test("il planner unificato ordina spell e condizioni nello stesso stack", () => {
  const tokens = [
    token("caster", {
      assignments: [
        {
          key: "Velocita",
          displayName: "Velocità",
          targets: ["target"],
          color: { solid: "#c00000", fillOpacity: 0.88 },
        },
        {
          key: "Anatema",
          displayName: "Anatema",
          targets: ["target"],
          color: { solid: "#00c000", fillOpacity: 0.88 },
        },
      ],
    }),
    token("target", {
      conditionParts: [
        { key: "flag:Prono", label: "Prono" },
        { key: "flag:Accecato", label: "Accecato" },
      ],
    }),
  ];

  const rows = planEffectsLayout({ tokens, measureText })
    .filter((entry) => entry.targetId === "target" && entry.kind !== "dot")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), [
    "Anatema",
    "Velocità",
    "Accecato",
    "Prono",
  ]);
  assert.equal(new Set(rows.map((entry) => entry.x)).size, 1);
  assert.deepEqual(rows.map((entry) => entry.y), [75, 106, 138, 169]);
});

test("durata, larghezza e badge concentrazione sono calcolati nello stesso piano", () => {
  const tokens = [
    token("caster", {
      concentrationKey: "Trama Ipnotica",
      assignments: [{
        key: "Trama Ipnotica",
        displayName: "Trama Ipnotica",
        isConc: true,
        instanceId: "spell-1",
        targets: ["target"],
        color: { solid: "#663399", fillOpacity: 0.88 },
      }],
    }),
    token("target", {
      spellEntries: [{
        name: "Trama Ipnotica",
        instanceId: "spell-1",
        casterId: "caster",
        turns: 8,
      }],
    }),
  ];

  const desired = planEffectsLayout({ tokens, measureText });
  const dot = desired.find((entry) => entry.kind === "dot");
  const spell = desired.find((entry) => entry.kind === "spell");

  assert.equal(dot.identity, "dot|caster");
  assert.equal(dot.backgroundColor, "#663399");
  assert.equal(spell.text, "Trama Ipnotica (8)");
  assert.equal(spell.width, 204);
});

test("il layout usa le dimensioni IMAGE quando width e height non sono esposte alla radice", () => {
  const desired = planEffectsLayout({
    measureText,
    sceneDpi: 70,
    tokens: [token("image-token", {
      width: undefined,
      height: undefined,
      image: { width: 1120, height: 1120 },
      grid: { dpi: 560 },
      conditionParts: [{ key: "flag:Prono", label: "Prono" }],
    })],
  });

  const condition = desired.find((entry) => entry.kind === "condition");
  assert.equal(condition.x, 89);
  assert.equal(condition.y, 37);
});

test("un token IMAGE da una casella ancora pill e badge al suo ingombro di scena", () => {
  const desired = planEffectsLayout({
    measureText,
    sceneDpi: 70,
    tokens: [token("self-caster", {
      width: undefined,
      height: undefined,
      image: { width: 560, height: 560 },
      grid: { dpi: 560 },
      concentrationKey: "Scudo della fede",
      conditionParts: [{ key: "flag:Prono", label: "Prono" }],
      assignments: [{
        key: "Scudo della fede",
        displayName: "Scudo della fede",
        isConc: true,
        targets: ["self-caster"],
        color: { solid: "#1595c5", fillOpacity: 0.88 },
      }],
    })],
  });

  const dot = desired.find((entry) => entry.kind === "dot");
  const spell = desired.find((entry) => entry.kind === "spell");
  const condition = desired.find((entry) => entry.kind === "condition");
  assert.ok(Math.abs(dot.x - 71.75) < 0.01);
  assert.ok(Math.abs(dot.y - 71.75) < 0.01);
  assert.deepEqual({ x: spell.x, y: spell.y }, { x: 94, y: 75 });
  assert.deepEqual({ x: condition.x, y: condition.y }, { x: 94, y: 107 });
});

test("il diff puro conserva un solo widget per identità e raccoglie un batch finale", () => {
  const desired = [
    { identity: "condition|a|prono", text: "Prono" },
    { identity: "spell|a|b|velocita", text: "Velocità" },
  ];
  const existing = [
    { identity: "condition|a|prono", valid: true, item: { id: "keep", text: "old" } },
    { identity: "condition|a|prono", valid: true, item: { id: "duplicate", text: "old" } },
    { identity: "orphan", valid: true, item: { id: "orphan" } },
    { identity: null, valid: false, item: { id: "legacy" } },
  ];

  const diff = planEffectsWidgetDiff({
    desired,
    existing,
    needsUpdate: (item, spec) => item.text !== spec.text,
  });

  assert.deepEqual(diff.additions.map((entry) => entry.identity), ["spell|a|b|velocita"]);
  assert.deepEqual(diff.updates.map((entry) => entry.item.id), ["duplicate"]);
  assert.deepEqual(diff.deleteIds, ["keep", "legacy", "orphan"]);
});

test("20 piani rapidi convergono al solo stato finale senza residui", () => {
  let existing = [];
  for (let index = 0; index < 20; index += 1) {
    const active = index === 19 || index % 3 === 0;
    const desired = planEffectsLayout({
      measureText,
      tokens: [token("a", {
        conditionParts: active ? [{ key: "flag:Prono", label: "Prono" }] : [],
      })],
    });
    const diff = planEffectsWidgetDiff({ desired, existing, needsUpdate: () => false });
    const deleted = new Set(diff.deleteIds);
    existing = existing.filter((entry) => !deleted.has(entry.item.id));
    for (const spec of diff.additions) {
      existing.push({ identity: spec.identity, valid: true, item: { id: `w-${index}-${spec.identity}` } });
    }
  }

  assert.deepEqual(existing.map((entry) => entry.identity), ["condition|a|flag:Prono"]);
});
