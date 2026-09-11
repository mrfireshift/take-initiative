import test from "node:test";
import assert from "node:assert/strict";
import { advanceInitiativeState } from "../src/initiativeRenderCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { buildHistoryUndoPlan } from "../src/historyUndoCore.js";

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const CONCENTRATION = "com.thebigpicture.initiative/concentration";

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function undoPlanForExpiration(before, after) {
  return buildHistoryUndoPlan({
    sceneItems: [{
      id: "caster",
      metadata: {
        [META]: {
          conditions: { version: 2, instances: after.conditions },
          [SPELLS]: after.spells,
        },
      },
    }],
    entryOrEntries: {
      id: "history-temporal-expiry",
      effectsMutation: {
        changes: [{
          id: "caster",
          fields: { conditions: true, spells: true },
          before: { conditions: before.conditions, spells: before.spells },
          after: { conditions: after.conditions, spells: after.spells },
        }],
      },
    },
    metadataKey: META,
    effectKeys: {
      conditions: "conditions",
      spells: SPELLS,
      concentrations: CONCENTRATION,
    },
    normalizeConditions: (value) => Array.isArray(value?.instances)
      ? value.instances
      : Array.isArray(value) ? value : [],
  });
}

test("ARCH-09: Previous naviga il cursore, non resuscita una scadenza; Undo è il ripristino canonico", () => {
  const active = {
    id: "caster",
    spells: [{
      id: "shield-entry",
      name: "Scudo",
      casterId: "caster",
      instanceId: "shield-instance",
      expiry: { mode: "turn-end", actor: "source", remaining: 1 },
    }],
    conditions: [{
      id: "shield-ac",
      condition: "+5 CA",
      active: true,
      sourceId: "caster",
      parentEffectId: "shield-instance",
      type: "spell",
      expiry: { mode: "turn-end", actor: "source", remaining: 1 },
    }],
    concentrations: {},
  };
  const initialCursor = { order: ["caster", "target"], current: 0, round: 1 };
  const advancedCursor = advanceInitiativeState(initialCursor, 1);
  const expiration = buildEffectsMutationPlan([active], [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "1:0:caster" }],
  }]);
  const expired = state(expiration, "caster");

  assert.deepEqual(advancedCursor, { order: ["caster", "target"], current: 1, round: 1 });
  assert.deepEqual(expired.spells, []);
  assert.deepEqual(expired.conditions, []);

  const previousCursor = advanceInitiativeState(advancedCursor, -1);
  assert.deepEqual(previousCursor, initialCursor, "Previous muove soltanto current/round");
  assert.deepEqual(expired.spells, [], "Previous non ricrea la spell scaduta");
  assert.deepEqual(expired.conditions, [], "Previous non ricrea la condition figlia");

  const forwardAgain = advanceInitiativeState(previousCursor, 1);
  const repeatedBoundary = buildEffectsMutationPlan([expired], [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "1:0:caster" }],
  }]);
  assert.deepEqual(forwardAgain, advancedCursor);
  assert.deepEqual(repeatedBoundary.changedIds, [], "Next non ripete una scadenza già terminale");

  const undo = undoPlanForExpiration(active, expired);
  assert.equal(undo.status, undefined, "la normale precondition History riconosce l'after della scadenza");
  const restored = undo.finalItems.find((entry) => entry.id === "caster")?.item.metadata;
  assert.deepEqual(restored?.[META]?.[SPELLS], active.spells);
  assert.deepEqual(restored?.[META]?.conditions?.instances, active.conditions);
});
