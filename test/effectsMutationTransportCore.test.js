import test from "node:test";
import assert from "node:assert/strict";

import {
  EFFECTS_MUTATION_RESULT_CHUNK_TYPE,
  buildEffectsMutationResultMessages,
  createEffectsMutationResultAssembler,
  effectsMutationTransportJsonBytes,
} from "../src/effectsMutationTransportCore.js";

test("le risposte piccole mantengono il formato diretto compatibile", () => {
  const result = { status: "applied", changes: [{ id: "hero" }] };
  assert.deepEqual(buildEffectsMutationResultMessages("request-small", result), [{
    requestId: "request-small",
    result,
  }]);
});

test("un ACK effetti grande viene frammentato sotto 16 KB e ricomposto senza perdita", () => {
  const result = {
    status: "applied",
    kind: "spell",
    changes: Array.from({ length: 18 }, (_, index) => ({
      id: `target-${index}`,
      before: { spells: [{ name: `Precedente ${index}`, note: `\\\"🔥${"x".repeat(1200)}` }] },
      after: { spells: [{ name: `Scudo ${index}`, note: `\\\"✨${"y".repeat(1200)}` }] },
    })),
  };
  const messages = buildEffectsMutationResultMessages("request-large", result);

  assert.ok(messages.length > 1);
  assert.ok(messages.every((message) => message.type === EFFECTS_MUTATION_RESULT_CHUNK_TYPE));
  assert.ok(messages.every((message) => effectsMutationTransportJsonBytes(message) <= 16 * 1024));

  const assembler = createEffectsMutationResultAssembler();
  let assembled = { complete: false };
  for (const message of [...messages].reverse()) assembled = assembler.push(message);
  assert.equal(assembled.complete, true);
  assert.deepEqual(assembled.result, result);
});
