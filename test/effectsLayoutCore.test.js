import test from "node:test";
import assert from "node:assert/strict";
import {
  effectsLayoutDesiredInScope,
  effectsLayoutSceneSnapshotItems,
  effectsLayoutTargetScope,
  expandEffectsLayoutTargetScope,
  planEffectsLayout,
  planEffectsWidgetDiff,
  resolveEffectsLayoutSceneItems,
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
  assert.deepEqual(rows.map((entry) => entry.y), [74, 102, 131, 159]);
});

test("la vista compatta mostra icone di condizione e un conteggio distinto", () => {
  const rows = planEffectsLayout({
    measureText,
    compact: true,
    tokens: [
      token("caster", {
        assignments: [{
          key: "Ragnatela",
          displayName: "Ragnatela",
          targets: ["target"],
          color: { solid: "#7e22ce", fillOpacity: 0.84 },
        }],
      }),
      token("target", {
        conditionParts: [
          { key: "flag:Prono", label: "Prono", icon: "⬇️", kind: "condition" },
          { key: "flag:Accecato", label: "Accecato", icon: "👁️", kind: "condition" },
          { key: "flag:Spaventato", label: "Spaventato", icon: "😨", kind: "condition" },
          { key: "flag:Stordito", label: "Stordito", icon: "💥", kind: "condition" },
          {
            key: "spell-effect:web",
            label: "Terreno difficile",
            kind: "spell-effect",
            tone: "debuff",
          },
        ],
      }),
    ],
  }).filter((entry) => entry.targetId === "target")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), [
    "⬇️",
    "👁️",
    "😨",
    "+1 · ✨1 · ✦1",
  ]);
  assert.ok(rows.every((entry) => entry.x + entry.width <= 135));
  assert.ok(rows.every((entry) => entry.x >= 65));
  assert.ok(rows.every((entry) => entry.x + entry.width === 135));
  assert.equal(rows.some((entry) => entry.text === "Prono"), false);
  assert.equal(rows.find((entry) => entry.compactMode === "effect-count").key, "compact:count");
});

test("la selezione del token mantiene tutte le label estese", () => {
  const rows = planEffectsLayout({
    measureText,
    compact: true,
    expandedTargetIds: new Set(["target"]),
    tokens: [
      token("caster", {
        assignments: [{
          key: "Ragnatela",
          displayName: "Ragnatela",
          targets: ["target"],
          color: { solid: "#7e22ce", fillOpacity: 0.84 },
        }],
      }),
      token("target", {
        conditionParts: [
          { key: "flag:Prono", label: "Prono", icon: "⬇️", kind: "condition" },
          {
            key: "spell-effect:web",
            label: "Terreno difficile",
            kind: "spell-effect",
            tone: "debuff",
          },
        ],
      }),
    ],
  }).filter((entry) => entry.targetId === "target" && entry.kind !== "dot")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), [
    "Terreno difficile",
    "Ragnatela",
    "Prono",
  ]);
  assert.equal(new Set(rows.map((entry) => entry.x)).size, 1);
  assert.equal(rows[0].x, 94);
  assert.equal(rows.some((entry) => entry.compactMode), false);
});

test("la modalità globale tutte espanse ignora il filtro di selezione", () => {
  const rows = planEffectsLayout({
    measureText,
    compact: true,
    expansionMode: "all",
    tokens: [token("target", {
      conditionParts: [
        { key: "flag:Prono", label: "Prono", icon: "⬇️", kind: "condition" },
        { key: "flag:Accecato", label: "Accecato", icon: "👁️", kind: "condition" },
      ],
    })],
  }).filter((entry) => entry.targetId === "target" && entry.kind !== "dot")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), ["Accecato", "Prono"]);
  assert.equal(rows.some((entry) => entry.compactMode), false);
});

test("la modalità globale compatta prevale anche su un token selezionato", () => {
  const rows = planEffectsLayout({
    measureText,
    compact: true,
    expansionMode: "compact",
    expandedTargetIds: new Set(["target"]),
    tokens: [token("target", {
      conditionParts: [
        { key: "flag:Prono", label: "Prono", icon: "⬇️", kind: "condition" },
        { key: "flag:Accecato", label: "Accecato", icon: "👁️", kind: "condition" },
      ],
    })],
  }).filter((entry) => entry.targetId === "target" && entry.kind !== "dot");

  assert.equal(rows.some((entry) => entry.text === "Prono"), false);
  assert.ok(rows.every((entry) => entry.compactMode));
});

test("le pill compatte restano dentro la footprint anche su un token multicasella", () => {
  const rows = planEffectsLayout({
    measureText,
    compact: true,
    tokens: [token("large-target", {
      position: { x: 200, y: 200 },
      width: 140,
      height: 210,
      conditionParts: [
        { key: "condition:a", label: "A", icon: "A", kind: "condition" },
        { key: "condition:b", label: "B", icon: "B", kind: "condition" },
        { key: "condition:c", label: "C", icon: "C", kind: "condition" },
        { key: "condition:d", label: "D", icon: "D", kind: "condition" },
      ],
    })],
  }).filter((entry) => entry.targetId === "large-target");

  assert.ok(rows.every((entry) => entry.x >= 130));
  assert.ok(rows.every((entry) => entry.x + entry.width <= 270));
  assert.ok(rows.every((entry) => entry.x + entry.width === 270));
  const topmost = Math.min(...rows.map((entry) => entry.y - entry.height / 2));
  assert.ok(topmost >= 95 && topmost < 96);
});

test("il pallino C resta invariato nella vista compatta", () => {
  const tokens = [token("caster", {
    concentrationKey: "Ragnatela",
    assignments: [{
      key: "Ragnatela",
      displayName: "Ragnatela",
      isConc: true,
      targets: ["target"],
      color: { solid: "#7e22ce", fillOpacity: 0.84 },
    }],
  }), token("target")];

  const fullDot = planEffectsLayout({ tokens, measureText })
    .find((entry) => entry.kind === "dot");
  const compactDot = planEffectsLayout({ tokens, measureText, compact: true })
    .find((entry) => entry.kind === "dot");

  assert.deepEqual(compactDot, fullDot);
});

test("le pill buff e debuff precedono lo stack senza cambiare il colore della spell", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [
      token("caster", {
        assignments: [{
          key: "Benedizione",
          displayName: "Benedizione",
          targets: ["target"],
          color: { solid: "#6d28d9", fillOpacity: 0.88 },
        }],
      }),
      token("target", {
        conditionParts: [
          {
            key: "spell-effect:buff-1",
            label: "+1d4 Att/TS",
            kind: "spell-effect",
            tone: "buff",
          },
          {
            key: "spell-effect:debuff-1",
            label: "-1d4 Att/TS",
            kind: "spell-effect",
            tone: "debuff",
          },
          { key: "flag:Prono", label: "Prono", kind: "condition" },
        ],
      }),
    ],
  }).filter((entry) => entry.targetId === "target" && entry.kind !== "dot")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), [
    "+1d4 Att/TS",
    "-1d4 Att/TS",
    "Benedizione",
    "Prono",
  ]);
  assert.equal(rows[0].backgroundColor, "#15803d");
  assert.equal(rows[1].backgroundColor, "#b91c1c");
  assert.equal(rows[2].backgroundColor, "#6d28d9");
});

test("le pill delle Feature usano il tema invece del fallback buff verde", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [token("target", {
      conditionParts: [{
        key: "spell-effect:twilight-area",
        label: "🌙 Santuario del Crepuscolo",
        kind: "spell-effect",
        tone: "buff",
        theme: {
          emoji: "🌙",
          accent: "#a78bfa",
          background: "#312e81",
          text: "#f5f3ff",
        },
      }],
    })],
  }).filter((entry) => entry.targetId === "target");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].backgroundColor, "#312e81");
  assert.equal(rows[0].textFill, "#f5f3ff");
});

test("le pill di una Feature condizione usano il tema invece dello sfondo nero", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [token("target", {
      conditionParts: [{
        key: "custom:giuramento-di-inimicizia",
        label: "âš”ï¸ Giuramento di Inimicizia",
        kind: "condition",
        theme: {
          emoji: "âš”ï¸",
          accent: "#f59e0b",
          background: "#78350f",
          text: "#fffbeb",
        },
      }],
    })],
  }).filter((entry) => entry.targetId === "target");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].backgroundColor, "#78350f");
  assert.equal(rows[0].textFill, "#fffbeb");
});

test("gli effetti collegati seguono la spell, ne usano il colore e accorciano la label", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [
      token("caster", {
        assignments: [{
          key: "Crescita di Spine",
          displayName: "Crescita di Spine",
          instanceId: "spell-1",
          targets: ["target"],
          color: { solid: "#6d28d9", fillOpacity: 0.82 },
        }],
      }),
      token("target", {
        conditionParts: [
          {
            key: "spell-effect:difficult-terrain",
            label: "Terreno difficile / Crescita di Spine",
            kind: "spell-effect",
            tone: "debuff",
            parentEffectId: "spell-1",
          },
          {
            key: "flag:Assordato",
            label: "Assordato",
            kind: "condition",
            parentEffectId: "spell-1",
          },
          { key: "flag:Prono", label: "Prono", kind: "condition" },
        ],
      }),
    ],
  }).filter((entry) => entry.targetId === "target" && entry.kind !== "dot")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), [
    "Crescita di Spine",
    "Assordato",
    "Terreno difficile",
    "Prono",
  ]);
  assert.deepEqual(
    rows.slice(0, 3).map((entry) => entry.backgroundColor),
    ["#6d28d9", "#6d28d9", "#6d28d9"],
  );
  assert.equal(rows[1].backgroundOpacity, 0.82);
});

test("l'ingresso in una zona ricostruisce la pill spell prima dell'effetto collegato", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [
      token("caster", {
        spellEntries: [{
          name: "Ragnatela",
          instanceId: "web-zone",
          casterId: "caster",
          turns: 9,
        }],
        assignments: [{
          key: "Ragnatela",
          displayName: "Ragnatela",
          instanceId: "web-zone",
          targets: ["caster"],
          color: { solid: "#7e22ce", fillOpacity: 0.84 },
        }],
      }),
      token("entrant", {
        conditionParts: [{
          key: "spell-effect:web-terrain",
          label: "Terreno difficile / Ragnatela",
          kind: "spell-effect",
          tone: "debuff",
          parentEffectId: "web-zone",
        }],
      }),
    ],
  }).filter((entry) => entry.targetId === "entrant" && entry.kind !== "dot")
    .sort((left, right) => left.y - right.y);

  assert.deepEqual(rows.map((entry) => entry.text), [
    "Ragnatela (9)",
    "Terreno difficile",
  ]);
  assert.deepEqual(
    rows.map((entry) => entry.backgroundColor),
    ["#7e22ce", "#7e22ce"],
  );
});

test("Folata di vento non mostra la durata sulla pill dei bersagli", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [
      token("caster", {
        spellEntries: [{
          name: "Folata di vento",
          instanceId: "gust-zone",
          casterId: "caster",
          turns: 3,
        }],
        assignments: [{
          key: "Folata di vento",
          displayName: "Folata di vento",
          instanceId: "gust-zone",
          targets: ["caster", "target"],
          color: { solid: "#b91c1c", fillOpacity: 0.88 },
        }],
      }),
      token("target", {
        spellEntries: [{
          name: "Folata di vento",
          instanceId: "gust-zone",
          casterId: "caster",
          turns: 10,
        }],
      }),
    ],
  });

  assert.equal(
    rows.find((entry) => entry.kind === "spell" && entry.targetId === "caster").text,
    "Folata di vento (3)",
  );
  assert.equal(
    rows.find((entry) => entry.kind === "spell" && entry.targetId === "target").text,
    "Folata di vento",
  );
});

test("le pill mappa nascondono i contatori superiori a dieci round", () => {
  const rows = planEffectsLayout({
    measureText,
    tokens: [
      token("caster", {
        spellEntries: [{
          name: "Ragnatela",
          instanceId: "web-zone",
          casterId: "caster",
          turns: 600,
        }],
        assignments: [{
          key: "Ragnatela",
          displayName: "Ragnatela",
          instanceId: "web-zone",
          targets: ["target"],
          color: { solid: "#7e22ce", fillOpacity: 0.84 },
        }],
      }),
      token("target"),
    ],
  });

  assert.equal(
    rows.find((entry) => entry.kind === "spell" && entry.targetId === "target").text,
    "Ragnatela",
  );
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

test("il layout espone la scadenza esatta legata al turno", () => {
  const desired = planEffectsLayout({
    tokens: [
      token("caster", {
        assignments: [{
          key: "Scudo",
          displayName: "Scudo",
          instanceId: "shield",
          targets: ["target"],
          color: { solid: "#663399", fillOpacity: 0.88 },
        }],
      }),
      token("target", {
        spellEntries: [{
          name: "Scudo",
          instanceId: "shield",
          casterId: "caster",
          turns: 1,
          expiry: { mode: "turn-start", actor: "source", remaining: 1 },
        }],
      }),
    ],
    measureText,
  });

  assert.equal(desired.find((entry) => entry.kind === "spell").text, "Scudo (I C)");
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
  assert.equal(condition.y, 36);
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
  assert.deepEqual({ x: spell.x, y: spell.y }, { x: 94, y: 74 });
  assert.deepEqual({ x: condition.x, y: condition.y }, { x: 94, y: 103 });
});

test("le pill effetto molto lunghe hanno una larghezza massima", () => {
  const desired = planEffectsLayout({
    measureText,
    tokens: [token("target", {
      conditionParts: [{
        key: "spell-effect:long",
        label: "Effetto meccanico molto lungo / con più modificatori / e una durata",
        kind: "spell-effect",
        tone: "buff",
      }],
    })],
  });

  assert.equal(desired.find((entry) => entry.kind === "spell-effect").width, 300);
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

test("lo scope incrementale limita il piano ai soli token invalidati", () => {
  const scope = effectsLayoutTargetScope({
    conditions: ["target-a", "target-a"],
    concentration: ["caster"],
  });
  assert.deepEqual([...scope].sort(), ["caster", "target-a"]);
  assert.equal(effectsLayoutTargetScope({ full: true, conditions: ["target-a"] }), null);

  const desired = [
    { identity: "condition|target-a|prono", targetId: "target-a" },
    { identity: "condition|target-b|accecato", targetId: "target-b" },
    { identity: "dot|caster", targetId: "caster" },
  ];
  assert.deepEqual(
    effectsLayoutDesiredInScope(desired, scope).map((entry) => entry.identity),
    ["condition|target-a|prono", "dot|caster"],
  );
});

test("lo scope del caster include i suoi bersagli senza espandere spell non correlate", () => {
  const scope = expandEffectsLayoutTargetScope([
    {
      id: "caster",
      assignments: [{ targets: ["target-a", "target-b"] }],
    },
    {
      id: "target-a",
      assignments: [{ targets: ["unrelated"] }],
    },
  ], new Set(["caster"]));

  assert.deepEqual([...scope].sort(), ["caster", "target-a", "target-b"]);
  assert.equal(scope.has("unrelated"), false);
});

test("lo snapshot corrente evita la lettura SDK nel batch nato dall'evento", async () => {
  const items = [{ id: "token-a" }, { id: "token-b" }];
  let sdkReads = 0;
  const result = await resolveEffectsLayoutSceneItems({
    snapshot: {
      complete: true,
      sceneEpoch: 8,
      generation: 12,
      items,
    },
    sceneEpoch: 8,
    minimumGeneration: 11,
    readItems: async () => {
      sdkReads += 1;
      return [];
    },
  });

  assert.equal(result.source, "snapshot");
  assert.equal(result.items, items);
  assert.equal(sdkReads, 0);
});

test("snapshot obsoleti o non autorizzati usano il fallback SDK", async () => {
  const snapshot = {
    complete: true,
    sceneEpoch: 8,
    generation: 10,
    items: [{ id: "stale" }],
  };
  let sdkReads = 0;
  const readItems = async () => {
    sdkReads += 1;
    return [{ id: "authoritative" }];
  };

  for (const options of [
    { sceneEpoch: 9, minimumGeneration: 10 },
    { sceneEpoch: 8, minimumGeneration: 11 },
    { sceneEpoch: 8, minimumGeneration: null },
  ]) {
    const result = await resolveEffectsLayoutSceneItems({ snapshot, readItems, ...options });
    assert.equal(result.source, "sdk");
    assert.deepEqual(result.items, [{ id: "authoritative" }]);
  }
  assert.equal(sdkReads, 3);
  assert.equal(effectsLayoutSceneSnapshotItems(snapshot, {
    sceneEpoch: 8,
    minimumGeneration: 10,
  }), snapshot.items);
});
