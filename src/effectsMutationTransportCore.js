export const EFFECTS_MUTATION_RESULT_CHUNK_TYPE = "effects-mutation-result-chunk-v1";
export const EFFECTS_MUTATION_COMMAND_CHUNK_TYPE = "effects-mutation-command-chunk-v1";

const BROADCAST_MESSAGE_MAX_BYTES = 16 * 1024;
const DIRECT_MESSAGE_MAX_BYTES = 15 * 1024;
const CHUNK_PAYLOAD_TARGET_BYTES = 6 * 1024;

function utf8Bytes(value) {
  const serialized = String(value || "");
  if (typeof globalThis.TextEncoder === "function") {
    return new globalThis.TextEncoder().encode(serialized).length;
  }
  try {
    return encodeURIComponent(serialized).replace(/%[0-9A-F]{2}|./gu, "x").length;
  } catch {
    return serialized.length;
  }
}

export function effectsMutationTransportJsonBytes(value) {
  try {
    return utf8Bytes(JSON.stringify(value) || "");
  } catch {
    return 0;
  }
}

// The UTF-8 length of one character (a whole code point, as for...of yields it), without encoding it: a lone
// surrogate counts 3, as the replacement character TextEncoder writes for it.
function codePointUtf8Bytes(character) {
  const codePoint = character.codePointAt(0);
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function splitUtf8(serialized, targetBytes = CHUNK_PAYLOAD_TARGET_BYTES) {
  const chunks = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of serialized) {
    const characterBytes = codePointUtf8Bytes(character);
    if (chunk && chunkBytes + characterBytes > targetBytes) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks;
}

// A message travels whole when it fits one broadcast, else as chunks of value's JSON: Owlbear refuses a broadcast over
// 16 kB. The receiver's assembler (createChunkedTransportAssembler, same type) gives back what the whole message carried.
export function buildChunkedTransportMessages(requestId, directMessage, value, type, tooLargeError = `${type}-too-large`) {
  if (effectsMutationTransportJsonBytes(directMessage) <= DIRECT_MESSAGE_MAX_BYTES) {
    return [directMessage];
  }

  const serialized = JSON.stringify(value);
  const payloads = splitUtf8(serialized);
  const messages = payloads.map((payload, chunkIndex) => ({
    requestId,
    type,
    chunkIndex,
    chunkCount: payloads.length,
    payload,
  }));
  if (messages.some((message) => (
    effectsMutationTransportJsonBytes(message) > BROADCAST_MESSAGE_MAX_BYTES
  ))) {
    throw new RangeError(tooLargeError);
  }
  return messages;
}

// direct: what a whole message delivers; assembled: what the joined chunks deliver (value and requestId); errors: the
// texts of an invalid chunk, an incoherent sequence and an unreadable join. At most maxOpen assemblies stay open: the
// oldest is dropped (a sender that gave up never sends the rest).
export function createChunkedTransportAssembler(type, {
  direct = (message) => message,
  assembled = (value) => value,
  errors = {},
  maxOpen = Infinity,
} = {}) {
  const assemblies = new Map();

  const clear = (requestId) => assemblies.delete(String(requestId || ""));
  const clearAll = () => assemblies.clear();

  const push = (message) => {
    if (message?.type !== type) {
      return { complete: true, result: direct(message) };
    }

    const requestId = String(message?.requestId || "");
    const chunkIndex = Number(message?.chunkIndex);
    const chunkCount = Number(message?.chunkCount);
    if (
      !requestId
      || !Number.isInteger(chunkIndex)
      || !Number.isInteger(chunkCount)
      || chunkIndex < 0
      || chunkCount < 1
      || chunkIndex >= chunkCount
      || typeof message?.payload !== "string"
    ) {
      clear(requestId);
      return { complete: true, requestId, error: errors.invalid || "Frammento non valido." };
    }

    let assembly = assemblies.get(requestId);
    if (!assembly) {
      assembly = { chunkCount, chunks: new Array(chunkCount), received: 0 };
      assemblies.set(requestId, assembly);
      while (assemblies.size > maxOpen) assemblies.delete(assemblies.keys().next().value);
    } else if (assembly.chunkCount !== chunkCount) {
      clear(requestId);
      return { complete: true, requestId, error: errors.incoherent || "Sequenza di frammenti incoerente." };
    }

    if (assembly.chunks[chunkIndex] === undefined) {
      assembly.chunks[chunkIndex] = message.payload;
      assembly.received += 1;
    }
    if (assembly.received < chunkCount) return { complete: false };

    clear(requestId);
    try {
      return { complete: true, requestId, result: assembled(JSON.parse(assembly.chunks.join("")), requestId) };
    } catch {
      return { complete: true, requestId, error: errors.unparsable || "Messaggio frammentato non valido." };
    }
  };

  return { push, clear, clearAll };
}

export function buildEffectsMutationResultMessages(requestId, result) {
  return buildChunkedTransportMessages(
    requestId,
    { requestId, result },
    result,
    EFFECTS_MUTATION_RESULT_CHUNK_TYPE,
    "effects-mutation-result-chunk-too-large",
  );
}

export function createEffectsMutationResultAssembler() {
  return createChunkedTransportAssembler(EFFECTS_MUTATION_RESULT_CHUNK_TYPE, {
    direct: (message) => message?.result,
    errors: {
      invalid: "Frammento risposta coordinatore non valido.",
      incoherent: "Sequenza risposta coordinatore incoerente.",
      unparsable: "Risposta coordinatore frammentata non valida.",
    },
  });
}

// A command too large for one broadcast, from a client page to the background coordinator: an Undo of several History
// entries, or of one large entry. The background joins it before the broker; under the limit it travels as before.
export function buildEffectsMutationCommandMessages(requestId, command) {
  return buildChunkedTransportMessages(
    requestId,
    { requestId, ...command },
    command,
    EFFECTS_MUTATION_COMMAND_CHUNK_TYPE,
  );
}

export function createEffectsMutationCommandAssembler() {
  return createChunkedTransportAssembler(EFFECTS_MUTATION_COMMAND_CHUNK_TYPE, {
    assembled: (command, requestId) => ({ ...command, requestId }),
    maxOpen: 16,
  });
}

// Owlbear refuses broadcasts sent too fast ("Too many requests"): chunks wait and the same one goes again.
export const CHUNKED_TRANSPORT_RATE_LIMIT_DELAYS_MS = Object.freeze([250, 500, 1000, 2000]);

function isRateLimitError(error) {
  const nested = error?.error && typeof error.error === "object" ? error.error : null;
  return /too many requests/iu.test(String(nested?.message || error?.message || ""));
}

// Sends the messages in order with send(message); a rate-limited one waits and goes again, any other error stops.
export async function sendChunkedTransportMessages(
  send,
  messages,
  { delays = CHUNKED_TRANSPORT_RATE_LIMIT_DELAYS_MS, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  for (const message of messages) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await send(message);
        break;
      } catch (error) {
        if (!isRateLimitError(error) || attempt >= delays.length) throw error;
        await wait(delays[attempt]);
      }
    }
  }
}
