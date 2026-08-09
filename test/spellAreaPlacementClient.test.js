import test from "node:test";
import assert from "node:assert/strict";

import {
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
