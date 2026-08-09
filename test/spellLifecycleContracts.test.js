import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDeferredEffect,
  normalizeDeferredEffects,
  normalizeSpellEndConsequences,
} from "../src/spellLifecycleContracts.js";

test("il contratto deferred effect valida timing, reminder e opzioni di risoluzione", () => {
  assert.deepEqual(normalizeDeferredEffect({
    id: "acid-delay",
    timing: "turn-end",
    actor: "target",
    anchor: "next-turn",
    reminder: "5d4 danni da acido",
    damage: { dice: "5d4", type: "acido" },
    save: { ability: "con", dc: 15 },
  }), {
    id: "acid-delay",
    timing: "turn-end",
    actor: "target",
    anchor: "next-turn",
    reminder: "5d4 danni da acido",
    damage: { dice: "5d4", type: "acido" },
    save: { ability: "con", dc: 15 },
    once: true,
  });
  assert.equal(normalizeDeferredEffect({
    id: "unknown",
    timing: "round-end",
    reminder: "non valido",
  }), null);
  assert.equal(normalizeDeferredEffect({
    id: "unknown",
    timing: "immediate",
    reminder: "",
  }), null);
});

test("le scelte deferred vengono deduplicate solo per contratto locale", () => {
  assert.deepEqual(
    normalizeDeferredEffects([
      { id: "same", timing: "immediate", reminder: "prima" },
      { id: "same", timing: "immediate", reminder: "seconda" },
      { id: "other", timing: "turn-end", reminder: "al turno" },
    ]).map((entry) => entry.reminder),
    ["seconda", "al turno"],
  );
});

test("onSpellEnd espone conseguenze indipendenti con target e opzioni dichiarative", () => {
  assert.deepEqual(normalizeSpellEndConsequences({
    conditions: [{
      id: "haste-fatigue",
      target: "self",
      condition: "Spossatezza da Velocità",
      effectKind: "debuff",
      options: { expiry: { mode: "manual" } },
    }],
  }), [{
    id: "haste-fatigue",
    target: "self",
    condition: "Spossatezza da Velocità",
    options: {
      expiry: { mode: "manual" },
      effectKind: "debuff",
    },
  }]);
});

