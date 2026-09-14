export const EFFECTS_MUTATION_RESULT_CHUNK_TYPE = "effects-mutation-result-chunk-v1";

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

function splitUtf8(serialized, targetBytes = CHUNK_PAYLOAD_TARGET_BYTES) {
  const chunks = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of serialized) {
    const characterBytes = utf8Bytes(character);
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

export function buildEffectsMutationResultMessages(requestId, result) {
  const directMessage = { requestId, result };
  if (effectsMutationTransportJsonBytes(directMessage) <= DIRECT_MESSAGE_MAX_BYTES) {
    return [directMessage];
  }

  const serialized = JSON.stringify(result);
  const payloads = splitUtf8(serialized);
  const messages = payloads.map((payload, chunkIndex) => ({
    requestId,
    type: EFFECTS_MUTATION_RESULT_CHUNK_TYPE,
    chunkIndex,
    chunkCount: payloads.length,
    payload,
  }));
  if (messages.some((message) => (
    effectsMutationTransportJsonBytes(message) > BROADCAST_MESSAGE_MAX_BYTES
  ))) {
    throw new RangeError("effects-mutation-result-chunk-too-large");
  }
  return messages;
}

export function createEffectsMutationResultAssembler() {
  const assemblies = new Map();

  const clear = (requestId) => assemblies.delete(String(requestId || ""));
  const clearAll = () => assemblies.clear();

  const push = (message) => {
    if (message?.type !== EFFECTS_MUTATION_RESULT_CHUNK_TYPE) {
      return { complete: true, result: message?.result };
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
      return { complete: true, error: "Frammento risposta coordinatore non valido." };
    }

    let assembly = assemblies.get(requestId);
    if (!assembly) {
      assembly = { chunkCount, chunks: new Array(chunkCount), received: 0 };
      assemblies.set(requestId, assembly);
    } else if (assembly.chunkCount !== chunkCount) {
      clear(requestId);
      return { complete: true, error: "Sequenza risposta coordinatore incoerente." };
    }

    if (assembly.chunks[chunkIndex] === undefined) {
      assembly.chunks[chunkIndex] = message.payload;
      assembly.received += 1;
    }
    if (assembly.received < chunkCount) return { complete: false };

    clear(requestId);
    try {
      return { complete: true, result: JSON.parse(assembly.chunks.join("")) };
    } catch {
      return { complete: true, error: "Risposta coordinatore frammentata non valida." };
    }
  };

  return { push, clear, clearAll };
}
