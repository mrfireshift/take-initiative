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

// The chunking before the linear byte count: a TextEncoder per character. Kept here as the reference the faster
// count must reproduce exactly.
function referenceChunkMessages(requestId, result) {
  const bytes = (value) => new TextEncoder().encode(String(value || "")).length;
  const serialized = JSON.stringify(result);
  const chunks = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of serialized) {
    const characterBytes = bytes(character);
    if (chunk && chunkBytes + characterBytes > 6 * 1024) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks.map((payload, chunkIndex) => ({
    requestId,
    type: EFFECTS_MUTATION_RESULT_CHUNK_TYPE,
    chunkIndex,
    chunkCount: chunks.length,
    payload,
  }));
}

test("la frammentazione conta i byte UTF-8 come TextEncoder, carattere per carattere", () => {
  // ASCII, accented letters (2 bytes), symbols (3 bytes), emoji (4 bytes, surrogate pairs) and escapes, mixed so
  // that chunk boundaries fall on every kind of character.
  const alphabet = ["a", "Z", "\"", "\\", "é", "à", "ß", "€", "—", "✨", "⚔", "🎲", "🔥", "🧙‍♀️", "\n"];
  for (let seed = 1; seed <= 12; seed += 1) {
    let state = seed;
    const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    const text = Array.from({ length: 4000 + seed * 900 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
    const result = { status: "applied", seed, changes: [{ id: `token-${seed}`, before: { note: text }, after: { note: text.split("").reverse().join("") } }] };
    const messages = buildEffectsMutationResultMessages(`request-${seed}`, result);
    assert.ok(messages.length > 1, `seed ${seed} must be chunked`);
    assert.deepEqual(messages, referenceChunkMessages(`request-${seed}`, result), `seed ${seed}`);
    const assembler = createEffectsMutationResultAssembler();
    const assembled = messages.map((message) => assembler.push(message)).at(-1);
    assert.deepEqual(assembled.result, result);
  }
});

test("la frammentazione di un ACK da 190 KB resta sotto i 120 ms", () => {
  const result = { status: "applied", filler: "x".repeat(190 * 1024), note: "Benedizione · è già lì 🎲" };
  const start = performance.now();
  const messages = buildEffectsMutationResultMessages("request-timing", result);
  const elapsed = performance.now() - start;
  assert.ok(messages.length > 30);
  assert.ok(elapsed < 120, `chunking took ${elapsed.toFixed(1)} ms`);
});
