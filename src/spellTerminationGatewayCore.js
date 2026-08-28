// Shared, spell-agnostic lifecycle gateway for persistent effects that need a
// terminal resolution before their normal cleanup can continue.
//
// The gateway deliberately treats terminalResolution as an opaque descriptor.
// Area, save, damage, UI and spell-specific rules stay outside this module.

export const TERMINAL_RESOLUTION_PENDING_KEY = "pendingTermination";
export const TERMINAL_RESOLUTION_DESCRIPTOR_KEY = "terminalResolution";

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export function normalizeTerminationReason(value) {
  const reason = String(value || "termination").trim();
  return reason || "termination";
}

export function normalizeTerminationContinuation(value) {
  const normalizeOperation = (operation) => {
    const next = clone(operation);
    if (!next || typeof next !== "object" || Array.isArray(next)) return next;
    // A resumed continuation is a new mutation command. Preserve semantic
    // instance/entry IDs, but never replay the original operation timestamps
    // or command identity into History/stale guards.
    delete next.operationId;
    delete next.commandId;
    delete next.correlationId;
    delete next.createdAt;
    return next;
  };
  if (Array.isArray(value)) {
    return { operations: value.map(normalizeOperation) };
  }
  if (!value || typeof value !== "object") return null;
  const operations = Array.isArray(value.operations)
    ? value.operations.map(normalizeOperation)
    : [];
  const options = value.options && typeof value.options === "object"
    ? clone(value.options)
    : undefined;
  return {
    operations,
    ...(options ? { options } : {}),
  };
}

export function terminalResolutionDescriptor(entry, spell = null) {
  const candidates = [
    entry?.[TERMINAL_RESOLUTION_DESCRIPTOR_KEY],
    entry?.castContext?.[TERMINAL_RESOLUTION_DESCRIPTOR_KEY],
    spell?.[TERMINAL_RESOLUTION_DESCRIPTOR_KEY],
    spell?.castContext?.[TERMINAL_RESOLUTION_DESCRIPTOR_KEY],
  ];
  const descriptor = candidates.find((value) => (
    value && typeof value === "object" && !Array.isArray(value)
  ));
  return descriptor ? clone(descriptor) : null;
}

export function pendingTerminationForEntry(entry) {
  const pending = entry?.[TERMINAL_RESOLUTION_PENDING_KEY];
  return pending && typeof pending === "object" && !Array.isArray(pending)
    ? clone(pending)
    : null;
}

export function createPendingTermination({
  instanceId,
  reason,
  requestId,
  terminalResolution,
  continuation = null,
  createdAt = null,
} = {}) {
  const normalizedInstanceId = String(instanceId || "").trim();
  if (!normalizedInstanceId) return null;
  const normalizedRequestId = String(requestId || "").trim()
    || `termination:${normalizedInstanceId}`;
  const pending = {
    instanceId: normalizedInstanceId,
    reason: normalizeTerminationReason(reason),
    requestId: normalizedRequestId,
    terminalResolution: clone(terminalResolution || {}),
  };
  const normalizedContinuation = normalizeTerminationContinuation(continuation);
  if (
    normalizedContinuation
    && (normalizedContinuation.operations?.length || normalizedContinuation.options)
  ) {
    pending.continuation = normalizedContinuation;
  }
  const timestamp = Number(createdAt);
  if (Number.isFinite(timestamp) && timestamp > 0) pending.createdAt = timestamp;
  return pending;
}

export function buildTerminationRequestOperation({
  casterId,
  reference = null,
  reason = "termination",
  requestId = "",
  continuation = null,
} = {}) {
  return {
    type: "concentration:break",
    casterIds: [String(casterId || "").trim()].filter(Boolean),
    ...(reference ? { reference: String(reference).trim() } : {}),
    reason: normalizeTerminationReason(reason),
    ...(requestId ? { requestId: String(requestId).trim() } : {}),
    ...(continuation ? { continuation: normalizeTerminationContinuation(continuation) } : {}),
  };
}

export function buildTerminationResumeOperation({
  casterId,
  reference = null,
  instanceId = null,
  requestId = "",
} = {}) {
  return {
    type: "termination:resume",
    casterId: String(casterId || "").trim(),
    ...(reference ? { reference: String(reference).trim() } : {}),
    ...(instanceId ? { instanceId: String(instanceId).trim() } : {}),
    ...(requestId ? { requestId: String(requestId).trim() } : {}),
  };
}

export function terminationRequestId({ casterId, instanceId, operationId } = {}) {
  const explicit = String(operationId || "").trim();
  if (explicit) return explicit;
  const caster = String(casterId || "").trim();
  const instance = String(instanceId || "").trim();
  return `termination:${caster}:${instance}`;
}
