import {
  normalizeCombatLogEventV3,
  normalizeCombatLogSessionV3,
} from "./combatLogV3Core.js";

const STORAGE_FORMAT = "take-initiative-combat-log";
const STORAGE_BUNDLE_VERSION = 3;
const PAGE_CURSOR_VERSION = 1;

export const COMBAT_LOG_STORAGE_LIMITS = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 200,
  maxImportBytes: 12 * 1024 * 1024,
  maxImportEvents: 25_000,
  maxStringLength: 100_000,
});

export const COMBAT_LOG_STORAGE_ERROR_CODES = Object.freeze({
  INVALID_FILE: "invalid-file",
  UNSUPPORTED_VERSION: "unsupported-version",
  LIMIT_EXCEEDED: "limit-exceeded",
  COLLISION: "collision",
  QUOTA: "quota",
  BLOCKED: "blocked",
  UPGRADE: "upgrade",
  ABORTED: "aborted",
});

export class CombatLogStorageError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "CombatLogStorageError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneJson(value, seen = new Set()) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
      throw new CombatLogStorageError(
        COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
        "Il bundle contiene un valore non serializzabile.",
      );
    }
    return value;
  }
  if (seen.has(value)) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
      "Il bundle contiene riferimenti ciclici.",
    );
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((entry) => cloneJson(entry, seen))
    : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry, seen)]));
  seen.delete(value);
  return result;
}

function stableValue(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((entry) => stableValue(entry, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key], seen)]));
  seen.delete(value);
  return result;
}

export function stableCombatLogStorageJSON(value) {
  return JSON.stringify(stableValue(value));
}

function fnv1a(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintCombatLogBundle(bundle) {
  return `fnv1a-${fnv1a(stableCombatLogStorageJSON(bundle))}`;
}

function byteLength(value) {
  try {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
  } catch {}
  return value.length;
}

function assertStringLimits(value, maxStringLength, seen = new Set()) {
  if (typeof value === "string") {
    if (value.length > maxStringLength) {
      throw new CombatLogStorageError(
        COMBAT_LOG_STORAGE_ERROR_CODES.LIMIT_EXCEEDED,
        `Il bundle contiene una stringa oltre il limite di ${maxStringLength} caratteri.`,
      );
    }
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    assertStringLimits(entry, maxStringLength, seen);
  }
  seen.delete(value);
}

function parseInput(input) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch (error) {
      throw new CombatLogStorageError(
        COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
        "Il file non contiene JSON valido.",
        error,
      );
    }
  }
  return input;
}

function validateVersion(version, format) {
  if (version === 1 && (!format || format === STORAGE_FORMAT)) return;
  if ((version === 2 || version === STORAGE_BUNDLE_VERSION) && format === STORAGE_FORMAT) return;
  if (version > STORAGE_BUNDLE_VERSION) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION,
      `Versione bundle non supportata: ${version}.`,
    );
  }
  throw new CombatLogStorageError(
    COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
    "Formato Combat Log non riconosciuto.",
  );
}

export function normalizeCombatLogStorageBundle(input, options = {}) {
  const limits = { ...COMBAT_LOG_STORAGE_LIMITS, ...options };
  const parsed = parseInput(input);
  if (!isObject(parsed)) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
      "Il bundle Combat Log deve essere un oggetto JSON.",
    );
  }
  const version = finiteNumber(parsed.version);
  validateVersion(version, parsed.format);
  const source = cloneJson(parsed);
  const session = source.session;
  const events = source.events;
  if (!isObject(session) || !asText(session.id).trim()) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
      "Il bundle non contiene una sessione valida.",
    );
  }
  if (!Array.isArray(events)) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
      "Il bundle non contiene una lista eventi valida.",
    );
  }
  if (events.length > limits.maxImportEvents) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.LIMIT_EXCEEDED,
      `Il bundle contiene più di ${limits.maxImportEvents} eventi.`,
    );
  }
  const serialized = JSON.stringify(source);
  if (byteLength(serialized) > limits.maxImportBytes) {
    throw new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.LIMIT_EXCEEDED,
      `Il bundle supera il limite di ${limits.maxImportBytes} byte.`,
    );
  }
  assertStringLimits(source, limits.maxStringLength);
  const normalizedEvents = events.map((event, index) => {
    if (!isObject(event)) {
      throw new CombatLogStorageError(
        COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
        `Evento non valido alla posizione ${index}.`,
      );
    }
    const sequence = finiteNumber(event.sequence);
    return {
      ...normalizeCombatLogEventV3(event),
      ...(sequence === null ? { sequence: index + 1 } : { sequence }),
    };
  });
  const fingerprintSource = cloneJson(source);
  delete fingerprintSource.exportedAt;
  const fingerprint = fingerprintCombatLogBundle(fingerprintSource);
  return {
    format: STORAGE_FORMAT,
    version,
    normalizedVersion: STORAGE_BUNDLE_VERSION,
    source: cloneJson(source),
    session: normalizeCombatLogSessionV3(session),
    events: cloneJson(normalizedEvents),
    fingerprint,
  };
}

export function validateCombatLogStorageBundle(input, options = {}) {
  try {
    const bundle = normalizeCombatLogStorageBundle(input, options);
    return { valid: true, bundle, error: null };
  } catch (error) {
    return {
      valid: false,
      bundle: null,
      error: {
        code: error?.code || COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE,
        message: String(error?.message || error),
      },
    };
  }
}

export function normalizeCombatLogPageOptions(sessionId, options = {}) {
  const requestedLimit = finiteNumber(options.limit);
  const limit = Math.max(
    1,
    Math.min(
      COMBAT_LOG_STORAGE_LIMITS.maxPageSize,
      Math.floor(requestedLimit || COMBAT_LOG_STORAGE_LIMITS.defaultPageSize),
    ),
  );
  const direction = options.direction === "forward" ? "forward" : "backward";
  const beforeSequence = finiteNumber(options.beforeSequence);
  const afterSequence = finiteNumber(options.afterSequence);
  return {
    sessionId: asText(sessionId),
    limit,
    direction,
    ...(beforeSequence === null ? {} : { beforeSequence }),
    ...(afterSequence === null ? {} : { afterSequence }),
  };
}

export function encodeCombatLogPageCursor(cursor) {
  const normalized = {
    v: PAGE_CURSOR_VERSION,
    sessionId: asText(cursor?.sessionId),
    direction: cursor?.direction === "forward" ? "forward" : "backward",
    ...(finiteNumber(cursor?.beforeSequence) === null
      ? {}
      : { beforeSequence: finiteNumber(cursor.beforeSequence) }),
    ...(finiteNumber(cursor?.afterSequence) === null
      ? {}
      : { afterSequence: finiteNumber(cursor.afterSequence) }),
  };
  return `clp${PAGE_CURSOR_VERSION}:${encodeURIComponent(JSON.stringify(normalized))}`;
}

export function decodeCombatLogPageCursor(value) {
  if (!value) return null;
  try {
    const raw = String(value);
    if (!raw.startsWith(`clp${PAGE_CURSOR_VERSION}:`)) return null;
    const parsed = JSON.parse(decodeURIComponent(raw.slice(`clp${PAGE_CURSOR_VERSION}:`.length)));
    if (!isObject(parsed) || parsed.v !== PAGE_CURSOR_VERSION || !parsed.sessionId) return null;
    return normalizeCombatLogPageOptions(parsed.sessionId, parsed);
  } catch {
    return null;
  }
}

export function planCombatLogEventPage(sessionId, options = {}) {
  const cursor = decodeCombatLogPageCursor(options.cursor);
  const normalized = normalizeCombatLogPageOptions(
    sessionId || cursor?.sessionId,
    cursor ? { ...cursor, ...options } : options,
  );
  const next = normalized.direction === "backward"
    ? (normalized.beforeSequence === undefined ? null : encodeCombatLogPageCursor(normalized))
    : (normalized.afterSequence === undefined ? null : encodeCombatLogPageCursor(normalized));
  return { ...normalized, cursor: next };
}

export function planCombatLogImport(input, options = {}) {
  const bundle = normalizeCombatLogStorageBundle(input, options);
  const sequences = bundle.events.map((event, index) => finiteNumber(event.sequence) ?? index + 1);
  return {
    ...bundle,
    sourceSessionId: asText(bundle.session.id),
    eventCount: bundle.events.length,
    oldestSequence: sequences.length ? Math.min(...sequences) : null,
    newestSequence: sequences.length ? Math.max(...sequences) : null,
  };
}

function sessionSortKey(session) {
  return finiteNumber(session?.updatedAt)
    ?? finiteNumber(session?.startedAt)
    ?? 0;
}

export function planCombatLogRetention(sessions, {
  now = Date.now(),
  roomId = "",
  activeSessionId = "",
  olderThanMs,
  keepLastN,
  includeImported = false,
} = {}) {
  const list = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => isObject(session) && asText(session.id))
    .filter((session) => !roomId || asText(session.roomId) === asText(roomId))
    .filter((session) => asText(session.id) !== asText(activeSessionId))
    .filter((session) => session.active !== true)
    .filter((session) => includeImported || session.imported !== true)
    .sort((left, right) => sessionSortKey(right) - sessionSortKey(left));
  const candidates = new Map();
  const threshold = finiteNumber(olderThanMs);
  if (threshold !== null && threshold >= 0) {
    const cutoff = Number(now) - threshold;
    for (const session of list) {
      if (sessionSortKey(session) < cutoff) candidates.set(asText(session.id), session);
    }
  }
  const keep = finiteNumber(keepLastN);
  if (keep !== null && keep >= 0) {
    for (const session of list.slice(Math.floor(keep))) candidates.set(asText(session.id), session);
  }
  const selected = [...candidates.values()].sort((left, right) => sessionSortKey(left) - sessionSortKey(right));
  return {
    now: Number(now) || 0,
    activeSessionId: asText(activeSessionId),
    roomId: asText(roomId),
    candidates: selected.map((session) => ({
      id: asText(session.id),
      name: asText(session.name),
      updatedAt: session.updatedAt ?? null,
      startedAt: session.startedAt ?? null,
      eventCount: Number(session.eventCount) || 0,
      imported: session.imported === true,
    })),
    sessionCount: selected.length,
    eventCount: selected.reduce((total, session) => total + (Number(session.eventCount) || 0), 0),
  };
}

export function summarizeCombatLogStorage(sessions, {
  roomId = "",
  activeSessionId = "",
} = {}) {
  const local = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => !roomId || asText(session?.roomId) === asText(roomId));
  return {
    sessionCount: local.length,
    eventCount: local.reduce((total, session) => total + (Number(session?.eventCount) || 0), 0),
    activeSessionId: asText(activeSessionId),
    archivedSessionCount: local.filter((session) => asText(session?.id) !== asText(activeSessionId)).length,
    importedSessionCount: local.filter((session) => session?.imported === true).length,
  };
}

export function classifyCombatLogStorageError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  if (error?.code && Object.values(COMBAT_LOG_STORAGE_ERROR_CODES).includes(error.code)) return error.code;
  if (/quota|storage.?full/i.test(`${name} ${message}`)) return COMBAT_LOG_STORAGE_ERROR_CODES.QUOTA;
  if (/blocked|versionchange/i.test(`${name} ${message}`)) return COMBAT_LOG_STORAGE_ERROR_CODES.BLOCKED;
  if (/version|upgrade/i.test(`${name} ${message}`)) return COMBAT_LOG_STORAGE_ERROR_CODES.UPGRADE;
  if (/abort/i.test(`${name} ${message}`)) return COMBAT_LOG_STORAGE_ERROR_CODES.ABORTED;
  return COMBAT_LOG_STORAGE_ERROR_CODES.INVALID_FILE;
}

export {
  STORAGE_FORMAT as COMBAT_LOG_STORAGE_FORMAT,
  STORAGE_BUNDLE_VERSION as COMBAT_LOG_STORAGE_BUNDLE_VERSION,
};
