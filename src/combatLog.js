import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  combatEventFromHistoryEntry,
  normalizeCombatLogEvent,
  serializeCombatLogText,
} from "./combatLogCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { recordCombatTurnForEpoch } from "./combatLogTurnCore.js";
import {
  clearSceneMetadataKey,
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "./metadataKeyScoped.js";
import {
  COMBAT_LOG_STORAGE_BUNDLE_VERSION,
  COMBAT_LOG_STORAGE_ERROR_CODES,
  COMBAT_LOG_STORAGE_FORMAT,
  COMBAT_LOG_STORAGE_LIMITS,
  CombatLogStorageError,
  classifyCombatLogStorageError,
  encodeCombatLogPageCursor,
  normalizeCombatLogStorageBundle,
  normalizeCombatLogPageOptions,
  planCombatLogEventPage,
  planCombatLogImport,
  planCombatLogRetention,
  summarizeCombatLogStorage,
} from "./combatLogStorageCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectCombatLogEnabled } from "./options/optionsSelectors.js";

const DB_NAME = `${ID}.combat-log`;
const DB_VERSION = 2;
const SESSION_STORE = "sessions";
const EVENT_STORE = "events";
const EVENT_SESSION_INDEX = "sessionId";
const EVENT_SEQUENCE_INDEX = "sessionSequence";
const SESSION_STATE_KEY = `${ID}/combat-log-state`;
const STATE_KEY = `${ID}/state`;
const CHANNEL = `${ID}/combat-log-change`;
const LAIR_ID = "__LAIR__";
let writeQueue = Promise.resolve();
let dbPromise = null;
let eventSinkEnabled = true;
let unsubscribeEventSinkOption = null;

export const COMBAT_LOG_DATABASE_NAME = DB_NAME;
export const COMBAT_LOG_DATABASE_VERSION = DB_VERSION;
export const COMBAT_LOG_EVENT_PAGE_SIZE = COMBAT_LOG_STORAGE_LIMITS.defaultPageSize;

export function mountCombatLogEventSink() {
  eventSinkEnabled = runtimeOptionsService.get(selectCombatLogEnabled);
  unsubscribeEventSinkOption ||= runtimeOptionsService.subscribe(
    selectCombatLogEnabled,
    (enabled) => { eventSinkEnabled = enabled === true; },
    { emitCurrent: false },
  );
  void startRuntimeOptions().catch(() => {});
  return eventSinkEnabled;
}

export function unmountCombatLogEventSink() {
  unsubscribeEventSinkOption?.();
  unsubscribeEventSinkOption = null;
  eventSinkEnabled = false;
}

export function isCombatLogEventSinkEnabled() {
  return eventSinkEnabled;
}

function isSceneEpochCurrent(sceneEpoch) {
  return sceneEpoch == null || isCurrentSceneEpoch(sceneEpoch);
}

function normalizeSessionState(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "object" ? value : null;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultSessionName() {
  return `Combattimento ${new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageFailure(request.error, "Operazione IndexedDB fallita."));
  });
}

function storageFailure(error, fallbackMessage) {
  if (error instanceof CombatLogStorageError) return error;
  const code = classifyCombatLogStorageError(error);
  const messages = {
    [COMBAT_LOG_STORAGE_ERROR_CODES.QUOTA]: "Spazio IndexedDB esaurito: esporta il registro o libera spazio e riprova.",
    [COMBAT_LOG_STORAGE_ERROR_CODES.BLOCKED]: "Aggiornamento Combat Log bloccato da un'altra scheda: chiudila e riprova.",
    [COMBAT_LOG_STORAGE_ERROR_CODES.UPGRADE]: "Aggiornamento del database Combat Log non riuscito.",
    [COMBAT_LOG_STORAGE_ERROR_CODES.ABORTED]: "Operazione Combat Log annullata senza modifiche parziali.",
  };
  return new CombatLogStorageError(code, messages[code] || fallbackMessage, error);
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  let databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (dbPromise === databasePromise) dbPromise = null;
      reject(storageFailure(error, "Impossibile aprire il Combat Log."));
    };
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const events = db.createObjectStore(EVENT_STORE, { keyPath: "id" });
        events.createIndex(EVENT_SESSION_INDEX, "sessionId", { unique: false });
        events.createIndex(EVENT_SEQUENCE_INDEX, ["sessionId", "sequence"], { unique: false });
        return;
      }
      const events = request.transaction?.objectStore(EVENT_STORE);
      if (events && !events.indexNames?.contains?.(EVENT_SESSION_INDEX)) {
        events.createIndex(EVENT_SESSION_INDEX, "sessionId", { unique: false });
      }
      if (events && !events.indexNames?.contains?.(EVENT_SEQUENCE_INDEX)) {
        events.createIndex(EVENT_SEQUENCE_INDEX, ["sessionId", "sequence"], { unique: false });
      }
    };
    request.onblocked = () => fail(new CombatLogStorageError(
      COMBAT_LOG_STORAGE_ERROR_CODES.BLOCKED,
      "Aggiornamento Combat Log bloccato da un'altra scheda: chiudila e riprova.",
    ));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try { db.close(); } catch {}
        if (dbPromise === databasePromise) dbPromise = null;
      };
      db.onclose = () => {
        if (dbPromise === databasePromise) dbPromise = null;
      };
      settled = true;
      resolve(db);
    };
    request.onerror = () => fail(request.error || new Error("Impossibile aprire il Combat Log."));
  });
  dbPromise = databasePromise;
  return databasePromise;
}

async function getStoredSession(id, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const session = await requestResult(db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).get(id));
  return isSceneEpochCurrent(sceneEpoch) ? session : null;
}

async function putStoredSession(session, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  const tx = db.transaction(SESSION_STORE, "readwrite");
  if (!isSceneEpochCurrent(sceneEpoch)) {
    tx.abort();
    return false;
  }
  tx.objectStore(SESSION_STORE).put(session);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(storageFailure(tx.error, "Salvataggio sessione fallito."));
    tx.onabort = () => reject(storageFailure(tx.error, "Salvataggio sessione annullato."));
  });
  return isSceneEpochCurrent(sceneEpoch);
}

async function getSessionState({ sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const metadata = await OBR.scene.getMetadata();
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  return normalizeSessionState(metadata?.[SESSION_STATE_KEY]);
}

async function setSessionState(session, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  const state = {
    version: 1,
    sessionId: session.id,
    name: session.name,
    startedAt: session.startedAt,
  };
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  await writeSceneMetadataKey(
    OBR.scene,
    METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
    state,
    { runtime: "combatLog" },
  );
  return isSceneEpochCurrent(sceneEpoch);
}

export async function startCombatLogSession(name = "", { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!eventSinkEnabled) throw new Error("Combat Log disattivato nelle opzioni.");
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM può creare un registro.");
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const now = Date.now();
  const session = {
    id: createId(),
    version: 1,
    roomId: String(OBR.room.id || ""),
    name: String(name || "").trim() || defaultSessionName(),
    startedAt: now,
    updatedAt: now,
    nextSequence: 1,
    lastRound: null,
    lastTurnKey: "",
  };
  if (!await putStoredSession(session, { sceneEpoch })) return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (!await setSessionState(session, { sceneEpoch })) return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  await notifyChange("session", session.id, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch) ? session : null;
}

export async function ensureCombatLogSession({
  sceneEpoch = currentSceneEpoch(),
  peek = false,
} = {}) {
  if (!eventSinkEnabled && !peek) return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (await OBR.player.getRole() !== "GM") return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const state = await getSessionState({ sceneEpoch });
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (state?.sessionId) {
    const stored = await getStoredSession(state.sessionId, { sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return null;
    if (stored) return stored;
    if (peek) return null;
    const recovered = {
      id: state.sessionId,
      version: 1,
      roomId: String(OBR.room.id || ""),
      name: String(state.name || "").trim() || defaultSessionName(),
      startedAt: Number(state.startedAt) || Date.now(),
      updatedAt: Date.now(),
      nextSequence: 1,
      lastRound: null,
      lastTurnKey: "",
    };
    if (!await putStoredSession(recovered, { sceneEpoch })) return null;
    return isSceneEpochCurrent(sceneEpoch) ? recovered : null;
  }
  if (peek) return null;
  return startCombatLogSession("", { sceneEpoch });
}

function stableEventValue(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((item) => stableEventValue(item, seen));
    seen.delete(value);
    return output;
  }
  const output = Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableEventValue(value[key], seen)]),
  );
  seen.delete(value);
  return output;
}

function comparableEvent(event) {
  const normalized = normalizeCombatLogEvent(event);
  delete normalized.sequence;
  return stableEventValue(normalized);
}

function sameStoredEvent(left, right) {
  try {
    return JSON.stringify(comparableEvent(left)) === JSON.stringify(comparableEvent(right));
  } catch {
    return left === right;
  }
}

function storageEventId(sessionId, input) {
  const session = String(sessionId || "");
  const encode = (value) => encodeURIComponent(String(value || ""));
  const historyEntryId = String(input?.historyEntryId || "").trim();
  if (historyEntryId) return `${session}:history:${encode(historyEntryId)}`;
  const commandId = String(input?.commandId || "").trim();
  if (String(input?.kind || "") === "undo" && commandId) {
    return `${session}:undo:${encode(commandId)}`;
  }
  const dedupeKey = String(input?.dedupeKey || "").trim();
  if (dedupeKey) return `${session}:dedupe:${encode(dedupeKey)}`;
  const explicitId = String(input?.id || "").trim();
  return explicitId || createId();
}

function appendDiagnostics(target, { duplicates = [], conflicts = [] } = {}) {
  Object.defineProperties(target, {
    duplicates: { value: duplicates, enumerable: false, configurable: true },
    conflicts: { value: conflicts, enumerable: false, configurable: true },
  });
  return target;
}

async function appendEventsNow(
  sessionId,
  inputs,
  sessionPatch = {},
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  const created = [];
  const duplicates = [];
  const conflicts = [];
  await new Promise((resolve, reject) => {
    let stale = false;
    let settled = false;
    const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
    const sessions = tx.objectStore(SESSION_STORE);
    const events = tx.objectStore(EVENT_STORE);
    const request = sessions.get(sessionId);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(storageFailure(error, "Scrittura Combat Log fallita."));
    };
    const abortAsStale = () => {
      stale = true;
      try { tx.abort(); } catch {}
    };
    request.onsuccess = () => {
      if (!isSceneEpochCurrent(sceneEpoch)) {
        abortAsStale();
        return;
      }
      const session = request.result;
      if (!session) {
        fail(new Error("Sessione Combat Log non trovata."));
        return;
      }
      let sequence = Math.max(1, Number(session.nextSequence) || 1);
      let inputIndex = 0;
      const processNext = () => {
        if (settled || stale) return;
        if (!isSceneEpochCurrent(sceneEpoch)) {
          abortAsStale();
          return;
        }
        if (inputIndex >= (Array.isArray(inputs) ? inputs.length : 0)) {
          if (!created.length) {
            return;
          }
          if (!isSceneEpochCurrent(sceneEpoch)) {
            abortAsStale();
            return;
          }
          sessions.put({
            ...session,
            ...sessionPatch,
            nextSequence: sequence,
            updatedAt: Date.now(),
          });
          return;
        }
        const input = inputs[inputIndex++];
        const event = normalizeCombatLogEvent({
          ...input,
          version: input?.version ?? 2,
          id: storageEventId(sessionId, input),
          sessionId,
          at: Number(input?.at) || Date.now(),
        });
        const existingRequest = events.get(event.id);
        existingRequest.onsuccess = () => {
          if (!isSceneEpochCurrent(sceneEpoch)) {
            abortAsStale();
            return;
          }
          const existing = existingRequest.result;
          if (existing) {
            if (sameStoredEvent(existing, event)) {
              duplicates.push({ id: event.id, sequence: existing.sequence });
            } else {
              conflicts.push({
                id: event.id,
                reason: "event-id-payload-mismatch",
                existing: clone(existing),
                incoming: clone(event),
              });
            }
            processNext();
            return;
          }
          const createdEvent = { ...event, sequence };
          const addRequest = events.add(createdEvent);
          addRequest.onsuccess = () => {
            sequence += 1;
            created.push(createdEvent);
            processNext();
          };
          addRequest.onerror = (errorEvent) => {
            if (errorEvent?.preventDefault) errorEvent.preventDefault();
            if (String(addRequest.error?.name || "") === "ConstraintError") {
              conflicts.push({
                id: event.id,
                reason: "event-id-race",
                incoming: clone(event),
              });
              processNext();
              return;
            }
            fail(addRequest.error || new Error("Scrittura evento Combat Log fallita."));
          };
        };
        existingRequest.onerror = () => fail(existingRequest.error || new Error("Lettura evento Combat Log fallita."));
      };
      processNext();
    };
    request.onerror = () => fail(request.error || new Error("Lettura sessione fallita."));
    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    tx.onerror = () => {
      if (!stale) fail(tx.error || new Error("Scrittura Combat Log fallita."));
    };
    tx.onabort = () => {
      if (settled) return;
      settled = true;
      if (stale) resolve();
      else reject(storageFailure(tx.error, "Scrittura Combat Log annullata."));
    };
  });
  if (!isSceneEpochCurrent(sceneEpoch)) return appendDiagnostics([], { duplicates, conflicts });
  if (created.length) await notifyChange("events", sessionId, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch)
    ? appendDiagnostics(created, { duplicates, conflicts })
    : appendDiagnostics([], { duplicates, conflicts });
}

function queueWrite(action) {
  writeQueue = writeQueue.then(action, action);
  return writeQueue;
}

async function currentContext({ sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return { round: 1, turn: null };
  const metadata = await OBR.scene.getMetadata();
  if (!isSceneEpochCurrent(sceneEpoch)) return { round: 1, turn: null };
  const state = metadata?.[STATE_KEY] || {};
  const round = Math.max(1, Number(state.round) || 1);
  const activeId = Array.isArray(state.order) ? state.order[state.current] : null;
  const turn = await resolveTurn(activeId, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch) ? { round, turn } : { round: 1, turn: null };
}

function realActorId(value) {
  const id = String(value || "");
  const paragonIndex = id.indexOf("::p");
  return paragonIndex >= 0 ? id.slice(0, paragonIndex) : id;
}

async function resolveTurn(activeId, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const rawId = String(activeId || "");
  if (!rawId) return null;
  if (rawId === LAIR_ID) return { id: rawId, name: "Azioni di Tana" };
  if (rawId.startsWith("__EPIC__")) return { id: rawId, name: "Azione Epica" };
  const id = realActorId(rawId);
  try {
    const [item] = await OBR.scene.items.getItems([id]);
    if (!isSceneEpochCurrent(sceneEpoch)) return null;
    return { id: rawId, tokenId: id, name: String(item?.name || "Token") };
  } catch {
    return isSceneEpochCurrent(sceneEpoch)
      ? { id: rawId, tokenId: id, name: "Token" }
      : null;
  }
}

export async function appendCombatLogEvent(
  input,
  { sceneEpoch = currentSceneEpoch(), context = null } = {},
) {
  if (!eventSinkEnabled || !isSceneEpochCurrent(sceneEpoch)) return [];
  return queueWrite(async () => {
    if (!eventSinkEnabled || !isSceneEpochCurrent(sceneEpoch)) return [];
    const session = await ensureCombatLogSession({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch) || !session) return [];
    const eventContext = context && typeof context === "object"
      ? context
      : await currentContext({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return [];
    return appendEventsNow(session.id, [{
      source: "automatic",
      round: eventContext.round,
      turn: eventContext.turn,
      ...input,
      version: input?.version ?? 2,
    }], {}, { sceneEpoch });
  });
}

export async function recordHistoryInCombatLog(entry, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!eventSinkEnabled || !isSceneEpochCurrent(sceneEpoch)) return [];
  try {
    const context = await currentContext({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return [];
    return appendCombatLogEvent(combatEventFromHistoryEntry(entry, context), { sceneEpoch, context });
  } catch (error) {
    console.warn("[combat-log] history event:", error?.message || error);
    return [];
  }
}

export async function recordCombatUndo(
  entries,
  { sceneEpoch = currentSceneEpoch(), commandId = "", correlationId = "" } = {},
) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return [];
  const labels = list.map((entry) => String(entry?.label || "Modifica"));
  const logicalCommandId = String(commandId || "").trim();
  return appendCombatLogEvent({
    ...(logicalCommandId ? { commandId: logicalCommandId } : {}),
    ...(logicalCommandId || correlationId
      ? { correlationId: String(correlationId || logicalCommandId) }
      : {}),
    kind: "undo",
    action: "undo",
    label: list.length === 1 ? `Annullato: ${labels[0]}` : `Annullate ${list.length} azioni`,
    payload: {
      historyEntryIds: list.map((entry) => entry?.id).filter(Boolean),
      description: labels.join(" | "),
    },
  }, { sceneEpoch });
}

export async function recordNativeMovementUndo(
  changes,
  {
    sceneEpoch = currentSceneEpoch(),
    commandId = "",
    correlationId = "",
    dedupeKey = "",
    undoSource = "obr-native",
  } = {},
) {
  const logicalCommandId = String(commandId || "").trim();
  const logicalDedupeKey = String(dedupeKey || "").trim();
  const logicalUndoSource = String(undoSource || "").trim() || "obr-native";
  const targets = (Array.isArray(changes) ? changes : [])
    .map((change) => {
      const undoOfHistoryEntryId = String(change?.historyEntryId || "").trim();
      return {
        id: String(change?.id || ""),
        name: String(change?.name || "Token"),
        cells: -Math.abs(Math.round((Number(change?.cells) || 0) * 100) / 100),
        from: change?.beforePosition,
        to: change?.afterPosition,
        ...(undoOfHistoryEntryId ? { undoOfHistoryEntryId } : {}),
      };
    })
    .filter((target) => target.id && Math.abs(Number(target.cells) || 0) >= 0.01);
  if (!targets.length) return [];
  const historyEntryIds = Array.from(new Set(
    targets.map((target) => target.undoOfHistoryEntryId).filter(Boolean),
  ));
  return appendCombatLogEvent({
    ...(logicalCommandId ? { commandId: logicalCommandId } : {}),
    ...(logicalCommandId || correlationId
      ? { correlationId: String(correlationId || logicalCommandId) }
      : {}),
    ...(logicalDedupeKey ? { dedupeKey: logicalDedupeKey } : {}),
    kind: "move",
    action: "move-undo",
    label: targets.length === 1
      ? `Movimento annullato: ${targets[0].name}`
      : `Movimento annullato: ${targets.length} token`,
    targets,
    payload: {
      targets,
      movementCorrection: true,
      undoSource: logicalUndoSource,
      nativeUndo: logicalUndoSource === "obr-native",
      ...(historyEntryIds.length ? { historyEntryIds } : {}),
    },
  }, { sceneEpoch });
}

export async function recordCombatTurn(state, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!eventSinkEnabled || !state || !Array.isArray(state.order) || !state.order.length) return [];
  return queueWrite(() => eventSinkEnabled ? recordCombatTurnForEpoch({
    state,
    sceneEpoch,
    isCurrent: isCurrentSceneEpoch,
    ensureSession: ({ sceneEpoch: epoch }) => ensureCombatLogSession({ sceneEpoch: epoch }),
    getStoredSession: (sessionId, { sceneEpoch: operationEpoch = sceneEpoch } = {}) =>
      getStoredSession(sessionId, { sceneEpoch: operationEpoch }),
    resolveTurn: (activeId, { sceneEpoch: operationEpoch = sceneEpoch } = {}) =>
      resolveTurn(activeId, { sceneEpoch: operationEpoch }),
    appendEvents: (sessionId, inputs, patch, { sceneEpoch: operationEpoch = sceneEpoch } = {}) =>
      appendEventsNow(sessionId, inputs, patch, { sceneEpoch: operationEpoch }),
  }) : []);
}

export async function addCombatLogNote(text, { sceneEpoch = currentSceneEpoch() } = {}) {
  const value = String(text || "").trim();
  if (!value) return [];
  return appendCombatLogEvent({
    kind: "note",
    action: "note",
    source: "manual",
    label: "Nota del DM",
    targets: [],
    payload: { text: value },
  }, { sceneEpoch });
}

export async function getCombatLogEvents(sessionId, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!sessionId || !isSceneEpochCurrent(sceneEpoch)) return [];
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  const tx = db.transaction(EVENT_STORE, "readonly");
  const index = tx.objectStore(EVENT_STORE).index(EVENT_SESSION_INDEX);
  const events = await requestResult(index.getAll(sessionId));
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  return (Array.isArray(events) ? events : [])
    .map(normalizeCombatLogEvent)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
}

function compositeSessionRange(sessionId, lower = -Number.MAX_SAFE_INTEGER, upper = Number.MAX_SAFE_INTEGER, lowerOpen = false, upperOpen = false) {
  return IDBKeyRange.bound(
    [String(sessionId), lower],
    [String(sessionId), upper],
    lowerOpen,
    upperOpen,
  );
}

async function countPageRange(index, range) {
  if (typeof index?.count !== "function") return 0;
  return Number(await requestResult(index.count(range))) || 0;
}

async function countCombatLogEventRange(db, range) {
  const tx = db.transaction(EVENT_STORE, "readonly");
  return countPageRange(tx.objectStore(EVENT_STORE).index(EVENT_SEQUENCE_INDEX), range);
}

function readEventCursorPage(index, range, direction, limit, sceneEpoch) {
  return new Promise((resolve, reject) => {
    const events = [];
    let request;
    try {
      request = index.openCursor(range, direction === "backward" ? "prev" : "next");
    } catch (error) {
      reject(storageFailure(error, "Lettura pagina Combat Log fallita."));
      return;
    }
    request.onsuccess = () => {
      if (!isSceneEpochCurrent(sceneEpoch)) {
        resolve([]);
        return;
      }
      const cursor = request.result;
      if (!cursor || events.length >= limit) {
        resolve(events);
        return;
      }
      events.push(cursor.value);
      if (events.length >= limit) resolve(events);
      else cursor.continue();
    };
    request.onerror = () => reject(storageFailure(request.error, "Lettura pagina Combat Log fallita."));
  });
}

function emptyCombatLogEventPage(sessionId, options = {}) {
  const planned = planCombatLogEventPage(sessionId, options);
  return {
    events: [],
    totalCount: 0,
    hasOlder: false,
    hasNewer: false,
    oldestSequence: null,
    newestSequence: null,
    next: null,
    cursor: planned.cursor,
  };
}

export async function getCombatLogEventPage(
  sessionId,
  options = {},
) {
  const planned = planCombatLogEventPage(sessionId, options);
  if (!planned.sessionId || !isSceneEpochCurrent(options.sceneEpoch ?? currentSceneEpoch())) {
    return emptyCombatLogEventPage(sessionId, options);
  }
  const sceneEpoch = options.sceneEpoch ?? currentSceneEpoch();
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return emptyCombatLogEventPage(sessionId, options);
  const tx = db.transaction(EVENT_STORE, "readonly");
  const store = tx.objectStore(EVENT_STORE);
  const index = store.index(EVENT_SEQUENCE_INDEX);
  const range = planned.direction === "backward" && planned.beforeSequence !== undefined
    ? compositeSessionRange(planned.sessionId, -Number.MAX_SAFE_INTEGER, planned.beforeSequence, false, true)
    : planned.direction === "forward" && planned.afterSequence !== undefined
      ? compositeSessionRange(planned.sessionId, planned.afterSequence, Number.MAX_SAFE_INTEGER, true, false)
      : compositeSessionRange(planned.sessionId);
  const fullRange = compositeSessionRange(planned.sessionId);
  const pagePromise = readEventCursorPage(index, range, planned.direction, planned.limit, sceneEpoch);
  const totalPromise = countPageRange(index, fullRange);
  const rawEvents = await pagePromise;
  const totalCount = await totalPromise;
  if (!isSceneEpochCurrent(sceneEpoch)) return emptyCombatLogEventPage(sessionId, options);
  const events = rawEvents
    .map(normalizeCombatLogEvent)
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
  const oldestSequence = events.length ? Number(events[0].sequence) : null;
  const newestSequence = events.length ? Number(events[events.length - 1].sequence) : null;
  const olderCount = oldestSequence === null
    ? 0
    : await countCombatLogEventRange(db, compositeSessionRange(planned.sessionId, -Number.MAX_SAFE_INTEGER, oldestSequence, false, true));
  const newerCount = newestSequence === null
    ? 0
    : await countCombatLogEventRange(db, compositeSessionRange(planned.sessionId, newestSequence, Number.MAX_SAFE_INTEGER, true, false));
  const hasOlder = olderCount > 0;
  const hasNewer = newerCount > 0;
  const next = planned.direction === "backward" && hasOlder && oldestSequence !== null
    ? encodeCombatLogPageCursor({ sessionId: planned.sessionId, direction: "backward", beforeSequence: oldestSequence })
    : planned.direction === "forward" && hasNewer && newestSequence !== null
      ? encodeCombatLogPageCursor({ sessionId: planned.sessionId, direction: "forward", afterSequence: newestSequence })
      : null;
  return {
    events,
    totalCount,
    hasOlder,
    hasNewer,
    oldestSequence,
    newestSequence,
    next,
    cursor: planned.cursor,
  };
}

export async function listCombatLogSessions({
  sceneEpoch = currentSceneEpoch(),
  includeStats = false,
} = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  const sessions = await requestResult(
    db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).getAll()
  );
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  const roomId = String(OBR.room.id || "");
  const list = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => !roomId || session?.roomId === roomId)
    .sort((a, b) => Number(b.startedAt) - Number(a.startedAt));
  if (!includeStats || !list.length) return list;
  const eventTx = db.transaction(EVENT_STORE, "readonly");
  const eventIndex = eventTx.objectStore(EVENT_STORE).index(EVENT_SESSION_INDEX);
  const counts = await Promise.all(list.map((session) => (
    typeof eventIndex.count === "function"
      ? requestResult(eventIndex.count(session.id)).catch(() => 0)
      : Promise.resolve(0)
  )));
  return list.map((session, index) => ({
    ...session,
    eventCount: Number(counts[index]) || 0,
  }));
}

export async function activateCombatLogSession(
  sessionId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!eventSinkEnabled) return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM può aprire un registro.");
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const session = await getStoredSession(sessionId, { sceneEpoch });
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (!session) throw new Error("Registro non trovato.");
  if (!await setSessionState(session, { sceneEpoch })) return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  await notifyChange("session", session.id, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch) ? session : null;
}

export async function clearCombatLogSession(
  sessionId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!eventSinkEnabled) return false;
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM può cancellare un registro.");
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  if (!sessionId) throw new Error("Registro non valido.");
  return queueWrite(async () => {
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    const db = await openDatabase();
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    await new Promise((resolve, reject) => {
      let stale = false;
      const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
      const sessions = tx.objectStore(SESSION_STORE);
      const events = tx.objectStore(EVENT_STORE);
      const sessionRequest = sessions.get(sessionId);
      sessionRequest.onsuccess = () => {
        if (!isSceneEpochCurrent(sceneEpoch)) {
          stale = true;
          try { tx.abort(); } catch { resolve(); }
          return;
        }
        const session = sessionRequest.result;
        if (!session) {
          tx.abort();
          return;
        }
        sessions.put({
          ...session,
          nextSequence: 1,
          lastRound: null,
          lastTurnKey: "",
          updatedAt: Date.now(),
        });
      };
      sessionRequest.onerror = () => reject(storageFailure(sessionRequest.error, "Lettura registro fallita."));
      const cursorRequest = events.index(EVENT_SESSION_INDEX).openCursor(IDBKeyRange.only(sessionId));
      cursorRequest.onsuccess = () => {
        if (!isSceneEpochCurrent(sceneEpoch)) {
          stale = true;
          try { tx.abort(); } catch { resolve(); }
          return;
        }
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(storageFailure(cursorRequest.error, "Cancellazione eventi fallita."));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(storageFailure(tx.error, "Cancellazione registro fallita."));
      tx.onabort = () => stale
        ? resolve()
        : reject(storageFailure(tx.error, "Cancellazione registro annullata."));
    });
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    await notifyChange("clear", sessionId, { sceneEpoch });
    return isSceneEpochCurrent(sceneEpoch);
  });
}

export async function deleteCombatLogSession(
  sessionId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!eventSinkEnabled) return false;
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM puÃ² eliminare un registro.");
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  if (!sessionId) throw new Error("Registro non valido.");
  return queueWrite(async () => {
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    const db = await openDatabase();
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    await new Promise((resolve, reject) => {
      let stale = false;
      const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
      const sessions = tx.objectStore(SESSION_STORE);
      const events = tx.objectStore(EVENT_STORE);
      if (!isSceneEpochCurrent(sceneEpoch)) {
        stale = true;
        try { tx.abort(); } catch { resolve(); }
        return;
      }
      sessions.delete(sessionId);
      const cursorRequest = events.index(EVENT_SESSION_INDEX).openCursor(IDBKeyRange.only(sessionId));
      cursorRequest.onsuccess = () => {
        if (!isSceneEpochCurrent(sceneEpoch)) {
          stale = true;
          try { tx.abort(); } catch { resolve(); }
          return;
        }
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(storageFailure(cursorRequest.error, "Cancellazione eventi fallita."));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(storageFailure(tx.error, "Eliminazione registro fallita."));
      tx.onabort = () => stale
        ? resolve()
        : reject(storageFailure(tx.error, "Eliminazione registro annullata."));
    });

    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    const state = await getSessionState({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    if (state?.sessionId === sessionId) {
      const remaining = await listCombatLogSessions({ sceneEpoch });
      if (!isSceneEpochCurrent(sceneEpoch)) return false;
      const next = remaining[0] || null;
      if (next) {
        if (!await setSessionState(next, { sceneEpoch })) return false;
      } else {
        // L'SDK non documenta una cancellazione fisica key-scoped: null è il
        // tombstone JSON-safe che rappresenta semanticamente nessuna sessione.
        if (!isSceneEpochCurrent(sceneEpoch)) return false;
        await clearSceneMetadataKey(
          OBR.scene,
          METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
          { runtime: "combatLog" },
        );
        if (!isSceneEpochCurrent(sceneEpoch)) return false;
      }
    }
    if (!isSceneEpochCurrent(sceneEpoch)) return false;
    await notifyChange("delete", sessionId, { sceneEpoch });
    return isSceneEpochCurrent(sceneEpoch);
  });
}

export async function getActiveCombatLogData({
  sceneEpoch = currentSceneEpoch(),
  loadAll = true,
  pageSize,
  direction,
  beforeSequence,
  afterSequence,
  cursor,
} = {}) {
  let session;
  if (eventSinkEnabled) {
    session = await ensureCombatLogSession({ sceneEpoch, peek: true });
  } else {
    const state = await getSessionState({ sceneEpoch });
    session = state?.sessionId
      ? await getStoredSession(state.sessionId, { sceneEpoch })
      : null;
  }
  if (!isSceneEpochCurrent(sceneEpoch)) return { session: null, events: [], page: null };
  if (!session) return { session: null, events: [], page: null };
  const wantsPage = loadAll === false
    || pageSize !== undefined
    || direction !== undefined
    || beforeSequence !== undefined
    || afterSequence !== undefined
    || cursor !== undefined;
  if (!wantsPage) return { session, events: await getCombatLogEvents(session.id, { sceneEpoch }), page: null };
  const page = await getCombatLogEventPage(session.id, {
    sceneEpoch,
    limit: pageSize,
    direction,
    beforeSequence,
    afterSequence,
    cursor,
  });
  return isSceneEpochCurrent(sceneEpoch)
    ? { session, events: page.events, page }
    : { session: null, events: [], page: null };
}

export async function peekActiveCombatLogData(options = {}) {
  return getActiveCombatLogData(options);
}

export function exportCombatLogText(session, events) {
  return serializeCombatLogText(session, events);
}

export function exportCombatLogJSON(session, events) {
  return JSON.stringify({ version: 1, session, events }, null, 2);
}

export async function getCombatLogExportData(
  sessionId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!sessionId || !isSceneEpochCurrent(sceneEpoch)) return null;
  const session = await getStoredSession(sessionId, { sceneEpoch });
  if (!session || !isSceneEpochCurrent(sceneEpoch)) return null;
  const events = await getCombatLogEvents(sessionId, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch) ? { session, events } : null;
}

export async function exportCombatLogJSONFromStorage(
  sessionId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  const data = await getCombatLogExportData(sessionId, { sceneEpoch });
  if (!data) return "";
  return JSON.stringify({
    format: COMBAT_LOG_STORAGE_FORMAT,
    version: COMBAT_LOG_STORAGE_BUNDLE_VERSION,
    exportedAt: Date.now(),
    source: { roomId: String(OBR.room.id || "") },
    session: data.session,
    events: data.events,
  }, null, 2);
}

export async function exportCombatLogTextFromStorage(
  sessionId,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  const data = await getCombatLogExportData(sessionId, { sceneEpoch });
  return data ? serializeCombatLogText(data.session, data.events) : "";
}

function importEventId(baseId, targetSessionId, index, usedIds) {
  const originalId = String(baseId || "").trim() || `source-event-${index + 1}`;
  let candidate = originalId;
  if (usedIds.has(candidate)) {
    candidate = `${targetSessionId}:event:${index + 1}:${encodeURIComponent(originalId)}`;
    let suffix = 2;
    while (usedIds.has(candidate)) candidate = `${targetSessionId}:event:${index + 1}:${encodeURIComponent(originalId)}:${suffix++}`;
  }
  usedIds.add(candidate);
  return { id: candidate, originalId, remapped: candidate !== originalId };
}

function importSequence(event, index, usedSequences) {
  const sourceSequence = Number(event?.sequence);
  if (Number.isFinite(sourceSequence) && sourceSequence > 0 && !usedSequences.has(sourceSequence)) {
    usedSequences.add(sourceSequence);
    return sourceSequence;
  }
  let sequence = Math.max(1, index + 1);
  while (usedSequences.has(sequence)) sequence += 1;
  usedSequences.add(sequence);
  return sequence;
}

function allocateImportSessionId(fingerprint, sessions) {
  const occupied = new Set(sessions.map((session) => String(session?.id || "")));
  const base = `import:${fingerprint}`;
  let id = base;
  let suffix = 2;
  while (occupied.has(id)) id = `${base}:${suffix++}`;
  return id;
}

export async function importCombatLogBundle(
  input,
  { sceneEpoch = currentSceneEpoch() } = {},
) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM puÃ² importare un registro.");
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const plan = planCombatLogImport(input, COMBAT_LOG_STORAGE_LIMITS);
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const db = await openDatabase();
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const roomId = String(OBR.room.id || "");
  const result = await new Promise((resolve, reject) => {
    let settled = false;
    let failure = null;
    let readySessions = null;
    let readyEvents = null;
    const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
    const sessionsStore = tx.objectStore(SESSION_STORE);
    const eventsStore = tx.objectStore(EVENT_STORE);
    const sessionRequest = sessionsStore.getAll();
    const eventRequest = eventsStore.getAll();
    const fail = (error) => {
      if (settled || failure) return;
      failure = storageFailure(error, "Importazione Combat Log fallita.");
      try { tx.abort(); } catch {}
    };
    const maybeImport = () => {
      if (settled || !readySessions || !readyEvents) return;
      if (!isSceneEpochCurrent(sceneEpoch)) {
        fail(new CombatLogStorageError(COMBAT_LOG_STORAGE_ERROR_CODES.ABORTED, "Importazione annullata: la scena Ã¨ cambiata."));
        return;
      }
      try {
        const sessions = Array.isArray(readySessions) ? readySessions : [];
        const existing = sessions.find((session) => (
          session?.roomId === roomId && session?.importFingerprint === plan.fingerprint
        ));
        if (existing) {
          resultValue = {
            status: "reused",
            session: existing,
            importedCount: 0,
            fingerprint: plan.fingerprint,
            sourceSessionId: plan.sourceSessionId,
          };
          return;
        }
        const targetId = allocateImportSessionId(plan.fingerprint, sessions);
        const sourceEvents = plan.events
          .map((event, index) => ({ event, index }))
          .sort((left, right) => {
            const sequenceDelta = Number(left.event.sequence) - Number(right.event.sequence);
            return Number.isFinite(sequenceDelta) && sequenceDelta !== 0
              ? sequenceDelta
              : left.index - right.index;
          });
        const usedIds = new Set((Array.isArray(readyEvents) ? readyEvents : [])
          .map((event) => String(event?.id || "")));
        const usedSequences = new Set();
        const importedEvents = sourceEvents.map(({ event, index }) => {
          const eventId = importEventId(event.id, targetId, index, usedIds);
          const sequence = importSequence(event, index, usedSequences);
          return {
            ...event,
            id: eventId.id,
            sessionId: targetId,
            sequence,
            importFingerprint: plan.fingerprint,
            sourceSessionId: plan.sourceSessionId,
            ...(eventId.remapped ? { sourceEventId: eventId.originalId } : {}),
          };
        });
        const maxSequence = importedEvents.reduce(
          (max, event) => Math.max(max, Number(event.sequence) || 0),
          0,
        );
        const now = Date.now();
        const importedSession = {
          ...plan.session,
          id: targetId,
          roomId,
          name: String(plan.session.name || "Registro importato"),
          startedAt: Number(plan.session.startedAt) || now,
          updatedAt: now,
          nextSequence: maxSequence + 1,
          eventCount: importedEvents.length,
          imported: true,
          archived: true,
          active: false,
          importedAt: now,
          importFingerprint: plan.fingerprint,
          sourceSessionId: plan.sourceSessionId,
          sourceRoomId: String(plan.source?.source?.roomId || plan.source?.roomId || ""),
        };
        sessionsStore.add(importedSession);
        for (const event of importedEvents) eventsStore.add(event);
        resultValue = {
          status: "imported",
          session: importedSession,
          importedCount: importedEvents.length,
          fingerprint: plan.fingerprint,
          sourceSessionId: plan.sourceSessionId,
          remappedEventCount: importedEvents.filter((event) => event.sourceEventId).length,
        };
      } catch (error) {
        fail(error);
      }
    };
    let resultValue = null;
    sessionRequest.onsuccess = () => { readySessions = sessionRequest.result; maybeImport(); };
    eventRequest.onsuccess = () => { readyEvents = eventRequest.result; maybeImport(); };
    sessionRequest.onerror = () => fail(sessionRequest.error || new Error("Lettura sessioni fallita."));
    eventRequest.onerror = () => fail(eventRequest.error || new Error("Lettura eventi fallita."));
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(resultValue);
    };
    tx.onerror = () => {
      if (!failure && !settled) failure = storageFailure(tx.error, "Importazione Combat Log fallita.");
    };
    tx.onabort = () => {
      if (settled) return;
      settled = true;
      reject(failure || storageFailure(tx.error, "Importazione Combat Log annullata."));
    };
  });
  if (!result || !isSceneEpochCurrent(sceneEpoch)) return null;
  if (result.status === "imported") await notifyChange("import", result.session.id, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch) ? result : null;
}

export async function importCombatLogJSON(text, options = {}) {
  return importCombatLogBundle(text, options);
}

export async function getCombatLogStorageStats({ sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const sessions = await listCombatLogSessions({ sceneEpoch, includeStats: true });
  const state = await getSessionState({ sceneEpoch });
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  let estimate = null;
  try { estimate = await globalThis.navigator?.storage?.estimate?.(); } catch {}
  return {
    ...summarizeCombatLogStorage(sessions, {
      roomId: String(OBR.room.id || ""),
      activeSessionId: state?.sessionId || "",
    }),
    sessions,
    estimate: estimate ? {
      usage: Number(estimate.usage) || 0,
      quota: Number(estimate.quota) || 0,
    } : null,
  };
}

export async function previewCombatLogRetention({
  sceneEpoch = currentSceneEpoch(),
  olderThanMs,
  keepLastN,
} = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM puÃ² gestire la conservazione del Combat Log.");
  const sessions = await listCombatLogSessions({ sceneEpoch, includeStats: true });
  const state = await getSessionState({ sceneEpoch });
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  return planCombatLogRetention(sessions, {
    roomId: String(OBR.room.id || ""),
    activeSessionId: state?.sessionId || "",
    olderThanMs,
    keepLastN,
  });
}

export async function pruneCombatLogRetention(options = {}) {
  const preview = await previewCombatLogRetention(options);
  if (!preview) return null;
  const deletedIds = [];
  const failed = [];
  for (const candidate of preview.candidates) {
    try {
      const deleted = await deleteCombatLogSession(candidate.id, options);
      if (deleted) deletedIds.push(candidate.id);
      else failed.push({ id: candidate.id, message: "Scena cambiata prima della cancellazione." });
    } catch (error) {
      failed.push({ id: candidate.id, message: String(error?.message || error) });
    }
  }
  return {
    status: failed.length ? "partial" : "applied",
    preview,
    deletedIds,
    failed,
  };
}

async function notifyChange(type, sessionId, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return false;
  try {
    await OBR.broadcast.sendMessage(CHANNEL, { type, sessionId }, { destination: "LOCAL" });
  } catch {}
  return isSceneEpochCurrent(sceneEpoch);
}

export function subscribeCombatLog(handler) {
  return OBR.broadcast.onMessage(CHANNEL, () => handler());
}
