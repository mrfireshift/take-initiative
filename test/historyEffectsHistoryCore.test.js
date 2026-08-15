import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady() {},
      room: { id: "test-room" },
      player: { getRole: async () => "GM" },
      scene: {
        getMetadata: async () => ({}),
        items: { getItems: async () => [] },
      },
      broadcast: {
        onMessage: () => () => {},
        sendMessage: async () => {},
      },
    },
  },
});
const { buildEffectsMutationHistoryChanges } = await import("../src/history.js");

test("i cambi effects usano il nome di plan.states senza fallback Token", () => {
  const result = buildEffectsMutationHistoryChanges({
    states: [{ id: "target-1", name: "Ogre" }],
    changes: [{
      id: "target-1",
      fields: { conditions: true, spells: false, concentrations: false },
      before: { conditions: [{ id: "condition-1" }] },
      after: { conditions: [{ id: "condition-2" }] },
    }],
  });

  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].name, "Ogre");
  assert.notEqual(result.changes[0].name, "Token");
  assert.deepEqual(result.changes[0].before.conditions, [{ id: "condition-1" }]);
  assert.deepEqual(result.changes[0].after.conditions, [{ id: "condition-2" }]);
});
