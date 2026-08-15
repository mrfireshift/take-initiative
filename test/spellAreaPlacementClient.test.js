import test from "node:test";
import assert from "node:assert/strict";

import {
  cancelSpellAreaPlacementRequest,
  confirmSpellAreaPlacementRequest,
  createSpellAreaPlacementRequestId,
  requestSpellAreaPlacement,
} from "../src/spellAreaPlacementClient.js";
import { SPELL_AREA_PLACEMENT_CHANNEL } from "../src/spellAreaPlacementCore.js";

function fakeBroadcast() {
  let listener = null;
  const sent = [];
  return {
    sent,
    onMessage(channel, callback) {
      assert.equal(channel, SPELL_AREA_PLACEMENT_CHANNEL);
      listener = callback;
      return () => {
        listener = null;
      };
    },
    async sendMessage(channel, data, options) {
      sent.push({ channel, data, options });
    },
    emit(data) {
      listener?.({ data });
    },
  };
}

test("il client correla la risposta alla singola richiesta", async () => {
  const broadcast = fakeBroadcast();
  const pending = requestSpellAreaPlacement({
    requestId: "request-1",
    ruleId: "fireball:cast",
    casterId: "caster",
  }, {
    broadcast,
    windowRef: null,
  });

  await Promise.resolve();
  assert.deepEqual(broadcast.sent[0].data, {
    type: "start",
    requestId: "request-1",
    ruleId: "fireball:cast",
    casterId: "caster",
  });
  broadcast.emit({ type: "result", requestId: "other", status: "confirmed" });
  broadcast.emit({
    type: "result",
    requestId: "request-1",
    status: "confirmed",
    preview: { targetIds: ["target"] },
  });
  assert.equal((await pending).status, "confirmed");
});

test("il client inoltra soltanto l'avanzamento del placement batch correlato", async () => {
  const broadcast = fakeBroadcast();
  let progress = null;
  const pending = requestSpellAreaPlacement({
    requestId: "request-batch",
    ruleId: "animate-objects:board-token",
    casterId: "caster",
    context: { batch: { total: 2 } },
  }, {
    broadcast,
    windowRef: null,
    onProgress: (value) => { progress = value; },
  });

  await Promise.resolve();
  broadcast.emit({ type: "progress", requestId: "other", batchIndex: 1 });
  assert.equal(progress, null);
  broadcast.emit({
    type: "progress",
    requestId: "request-batch",
    batchIndex: 1,
    batchTotal: 2,
    preview: { positions: [{ objectSize: "tiny" }] },
  });
  assert.equal(progress.batchIndex, 1);
  assert.equal(progress.batchTotal, 2);
  broadcast.emit({ type: "result", requestId: "request-batch", status: "confirmed" });
  assert.equal((await pending).status, "confirmed");
});

test("il client ritenta il primo handoff finché il tool non conferma la presa in carico", async () => {
  const broadcast = fakeBroadcast();
  const pending = requestSpellAreaPlacement({
    requestId: "request-retry",
    ruleId: "fireball:cast",
    casterId: "caster",
  }, {
    broadcast,
    windowRef: null,
    retryDelaysMs: [0],
    requestTimeoutMs: 20,
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(broadcast.sent.length, 2);
  broadcast.emit({ type: "accepted", requestId: "request-retry" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  broadcast.emit({
    type: "result",
    requestId: "request-retry",
    status: "cancelled",
  });
  assert.equal((await pending).status, "cancelled");
});

test("il client termina con un errore esplicito se il background non risponde", async () => {
  const result = await requestSpellAreaPlacement({
    requestId: "request-timeout",
    ruleId: "fireball:cast",
    casterId: "caster",
  }, {
    broadcast: fakeBroadcast(),
    windowRef: null,
    retryDelaysMs: [],
    requestTimeoutMs: 5,
  });

  assert.equal(result.status, "error");
  assert.equal(result.error, "placement-transport-timeout");
});

test("gli id generati sono valorizzati e distinti", () => {
  const first = createSpellAreaPlacementRequestId();
  const second = createSpellAreaPlacementRequestId();
  assert.ok(first);
  assert.notEqual(first, second);
});

test("il client propaga la variante scelta della sagoma", async () => {
  const broadcast = fakeBroadcast();
  const pending = requestSpellAreaPlacement({
    requestId: "request-forcecage",
    ruleId: "forcecage:cast",
    casterId: "caster",
    ruleChoice: "box",
  }, {
    broadcast,
    windowRef: null,
  });

  await Promise.resolve();
  assert.equal(broadcast.sent[0].data.ruleChoice, "box");
  broadcast.emit({
    type: "result",
    requestId: "request-forcecage",
    status: "cancelled",
    ruleChoice: "box",
  });
  assert.equal((await pending).ruleChoice, "box");
});

test("il client non usa l'epoch numerica dell'altro realm come identità scena", async () => {
  const broadcast = fakeBroadcast();
  const pending = requestSpellAreaPlacement({
    requestId: "request-cross-realm-epoch",
    ruleId: "fireball:cast",
    casterId: "caster",
    context: {
      sceneEpoch: 41,
      nested: { sceneEpoch: 42, keep: true },
    },
  }, {
    broadcast,
    windowRef: null,
  });

  await Promise.resolve();
  assert.equal(broadcast.sent[0].data.context.sceneEpoch, undefined);
  assert.deepEqual(broadcast.sent[0].data.context.nested, { keep: true });
  broadcast.emit({
    type: "result",
    requestId: "request-cross-realm-epoch",
    status: "confirmed",
    preview: {
      sceneEpoch: 99,
      position: { x: 1, y: 2 },
    },
  });
  const result = await pending;
  assert.equal(result.preview.sceneEpoch, undefined);
  assert.deepEqual(result.preview.position, { x: 1, y: 2 });
});

test("il client annulla una richiesta pendente usando lo stesso canale", async () => {
  const broadcast = fakeBroadcast();
  const pending = requestSpellAreaPlacement({
    requestId: "request-cancel",
    ruleId: "arcane-hand:board-token",
    casterId: "caster",
  }, {
    broadcast,
    windowRef: null,
  });

  await Promise.resolve();
  assert.equal(await cancelSpellAreaPlacementRequest("request-cancel", { broadcast }), true);
  assert.deepEqual(broadcast.sent[1].data, {
    type: "cancel",
    requestId: "request-cancel",
  });
  broadcast.emit({ type: "result", requestId: "request-cancel", status: "cancelled" });
  assert.equal((await pending).status, "cancelled");
});

test("il client conferma una sagoma pendente usando lo stesso canale", async () => {
  const broadcast = fakeBroadcast();
  assert.equal(
    await confirmSpellAreaPlacementRequest("request-confirm", { broadcast }),
    true,
  );
  assert.deepEqual(broadcast.sent[0].data, {
    type: "confirm",
    requestId: "request-confirm",
  });
});
