import test from "node:test";
import assert from "node:assert/strict";

import {
  executeSpellUnifiedBoardTokenRecreate,
  executeSpellUnifiedBoardTokenStateUpdate,
  SPELL_UNIFIED_PERSISTENT_STATUS,
} from "../src/spellUnifiedPersistentAdapter.js";

const overview = {
  name: "Mano arcana",
  persistent: {
    kind: "board-token",
    spellId: "arcane-hand",
    instanceId: "instance-1",
    casterId: "caster-1",
    castContext: { slotLevel: 5 },
  },
};

test("l'adapter HP delega al percorso board-token senza duplicarlo", async () => {
  let received = null;
  const result = await executeSpellUnifiedBoardTokenStateUpdate({
    overview,
    hp: 7,
    runtime: {
      executor: async (input) => {
        received = input;
        return [{ id: "token-1", entityId: "token-1" }];
      },
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_PERSISTENT_STATUS.UPDATED);
  assert.equal(received.group.instanceId, "instance-1");
  assert.equal(received.group.casterId, "caster-1");
  assert.equal(received.group.castContext.slotLevel, 5);
  assert.equal(received.hp, 7);
  assert.deepEqual(result.changedIds, ["token-1"]);
});

test("la ricreazione richiede il placement già confermato e delega posizione e contesto", async () => {
  let received = null;
  const result = await executeSpellUnifiedBoardTokenRecreate({
    overview,
    position: { x: 20, y: 40 },
    runtime: {
      executor: async (input) => {
        received = input;
        return [{ entityId: "token-new" }];
      },
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_PERSISTENT_STATUS.RECREATED);
  assert.deepEqual(received.position, { x: 20, y: 40 });
  assert.equal(received.group.spellId, "arcane-hand");
  assert.deepEqual(result.changedIds, ["token-new"]);
});

test("un contesto incompleto resta rifiutato senza invocare executor", async () => {
  let calls = 0;
  const result = await executeSpellUnifiedBoardTokenStateUpdate({
    overview: { persistent: { kind: "board-token" } },
    hp: 1,
    runtime: { executor: async () => { calls += 1; } },
  });

  assert.equal(result.status, SPELL_UNIFIED_PERSISTENT_STATUS.REJECTED);
  assert.equal(result.errors[0].code, "board-token-context-required");
  assert.equal(calls, 0);
});
