import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { combatEventFromHistoryEntry, serializeCombatLogText } from "./combatLogCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { recordCombatTurnForEpoch } from "./combatLogTurnCore.js";
import {
  clearSceneMetadataKey,
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "./metadataKeyScoped.js";

const DB_NAME = `${ID}.combat-log`;
const DB_VERSION = 1;
const SESSION_STORE = "sessions";
const EVENT_STORE = "events";
const SESSION_STATE_KEY = `${ID}/combat-log-state`;
const STATE_KEY = `${ID}/state`;
const CHANNEL = `${ID}/combat-log-change`;
const LAIR_ID = "__LAIR__";
let writeQueue = Promise.resolve();
let dbPromise = null;

function isSceneEpochCurrent(sceneEpoch) {
  return sceneEpoch == null || isCurrentSceneEpoch(sceneEpoch);
}

function normalizeSessionState(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "object" ? value : null;
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
    request.onerror = () => reject(request.error || new Error("Operazione IndexedDB fallita."));
  });
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const events = db.createObjectStore(EVENT_STORE, { keyPath: "id" });
        events.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossibile aprire il Combat Log."));
  });
  return dbPromise;
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
    tx.onerror = () => reject(tx.error || new Error("Salvataggio sessione fallito."));
    tx.onabort = () => reject(tx.error || new Error("Salvataggio sessione annullato."));
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
  await writeSceneMetadataKey(
    OBR.scene,
    METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
    {
      version: 1,
      sessionId: session.id,
      name: session.name,
      startedAt: session.startedAt,
    },
    { runtime: "combatLog" },
  );
  return isSceneEpochCurrent(sceneEpoch);
}

export async function startCombatLogSession(name = "", { sceneEpoch = currentSceneEpoch() } = {}) {
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

export async function ensureCombatLogSession({ sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (await OBR.player.getRole() !== "GM") return null;
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  const state = await getSessionState({ sceneEpoch });
  if (!isSceneEpochCurrent(sceneEpoch)) return null;
  if (state?.sessionId) {
    const stored = await getStoredSession(state.sessionId, { sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return null;
    if (stored) return stored;
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
  return startCombatLogSession("", { sceneEpoch });
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
  await new Promise((resolve, reject) => {
    let stale = false;
    const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
    const sessions = tx.objectStore(SESSION_STORE);
    const events = tx.objectStore(EVENT_STORE);
    const request = sessions.get(sessionId);
    request.onsuccess = () => {
      if (!isSceneEpochCurrent(sceneEpoch)) {
        stale = true;
        tx.abort();
        return;
      }
      const session = request.result;
      if (!session) {
        tx.abort();
        return;
      }
      let sequence = Math.max(1, Number(session.nextSequence) || 1);
      for (const input of inputs) {
        if (!isSceneEpochCurrent(sceneEpoch)) {
          stale = true;
          tx.abort();
          return;
        }
        const event = {
          ...input,
          id: createId(),
          version: 1,
          sessionId,
          sequence: sequence++,
          at: Number(input?.at) || Date.now(),
        };
        events.put(event);
        created.push(event);
      }
      if (!isSceneEpochCurrent(sceneEpoch)) {
        stale = true;
        tx.abort();
        return;
      }
      sessions.put({
        ...session,
        ...sessionPatch,
        nextSequence: sequence,
        updatedAt: Date.now(),
      });
    };
    request.onerror = () => {
      if (!stale) reject(request.error || new Error("Lettura sessione fallita."));
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Scrittura Combat Log fallita."));
    tx.onabort = () => {
      if (stale) resolve();
      else reject(tx.error || new Error("Scrittura Combat Log annullata."));
    };
  });
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  if (created.length) await notifyChange("events", sessionId, { sceneEpoch });
  return isSceneEpochCurrent(sceneEpoch) ? created : [];
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

export async function appendCombatLogEvent(input, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  return queueWrite(async () => {
    if (!isSceneEpochCurrent(sceneEpoch)) return [];
    const session = await ensureCombatLogSession({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch) || !session) return [];
    const context = await currentContext({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return [];
    return appendEventsNow(session.id, [{
      source: "automatic",
      round: context.round,
      turn: context.turn,
      ...input,
    }], {}, { sceneEpoch });
  });
}

export async function recordHistoryInCombatLog(entry, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isSceneEpochCurrent(sceneEpoch)) return [];
  try {
    const context = await currentContext({ sceneEpoch });
    if (!isSceneEpochCurrent(sceneEpoch)) return [];
    return appendCombatLogEvent(combatEventFromHistoryEntry(entry, context), { sceneEpoch });
  } catch (error) {
    console.warn("[combat-log] history event:", error?.message || error);
    return [];
  }
}

export async function recordCombatUndo(entries, { sceneEpoch = currentSceneEpoch() } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return [];
  const labels = list.map((entry) => String(entry?.label || "Modifica"));
  return appendCombatLogEvent({
    kind: "undo",
    action: "undo",
    label: list.length === 1 ? `Annullato: ${labels[0]}` : `Annullate ${list.length} azioni`,
    payload: {
      historyEntryIds: list.map((entry) => entry?.id).filter(Boolean),
      description: labels.join(" | "),
    },
  }, { sceneEpoch });
}

export async function recordNativeMovementUndo(changes, { sceneEpoch = currentSceneEpoch() } = {}) {
  const targets = (Array.isArray(changes) ? changes : [])
    .map((change) => ({
      id: String(change?.id || ""),
      name: String(change?.name || "Token"),
      cells: -Math.abs(Math.round((Number(change?.cells) || 0) * 100) / 100),
      from: change?.beforePosition,
      to: change?.afterPosition,
    }))
    .filter((target) => target.id && target.cells < -0.01);
  if (!targets.length) return [];
  return appendCombatLogEvent({
    kind: "move",
    action: "move-undo",
    label: targets.length === 1
      ? `Movimento annullato: ${targets[0].name}`
      : `Movimento annullato: ${targets.length} token`,
    targets,
    payload: { targets, nativeUndo: true },
  }, { sceneEpoch });
}

export async function recordCombatTurn(state, { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!state || !Array.isArray(state.order) || !state.order.length) return [];
  return queueWrite(() => recordCombatTurnForEpoch({
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
  }));
}

export async function addCombatLogNote(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  return appendCombatLogEvent({
    kind: "note",
    action: "note",
    source: "manual",
    label: "Nota del DM",
    targets: [],
    payload: { text: value },
  });
}

export async function getCombatLogEvents(sessionId) {
  if (!sessionId) return [];
  const db = await openDatabase();
  const tx = db.transaction(EVENT_STORE, "readonly");
  const index = tx.objectStore(EVENT_STORE).index("sessionId");
  const events = await requestResult(index.getAll(sessionId));
  return (Array.isArray(events) ? events : []).sort((a, b) => Number(a.sequence) - Number(b.sequence));
}

export async function listCombatLogSessions() {
  const db = await openDatabase();
  const sessions = await requestResult(
    db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).getAll()
  );
  const roomId = String(OBR.room.id || "");
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => !roomId || session?.roomId === roomId)
    .sort((a, b) => Number(b.startedAt) - Number(a.startedAt));
}

export async function activateCombatLogSession(sessionId) {
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM può aprire un registro.");
  const session = await getStoredSession(sessionId);
  if (!session) throw new Error("Registro non trovato.");
  await setSessionState(session);
  await notifyChange("session", session.id);
  return session;
}

export async function clearCombatLogSession(sessionId) {
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM può cancellare un registro.");
  if (!sessionId) throw new Error("Registro non valido.");
  return queueWrite(async () => {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
      const sessions = tx.objectStore(SESSION_STORE);
      const events = tx.objectStore(EVENT_STORE);
      const sessionRequest = sessions.get(sessionId);
      sessionRequest.onsuccess = () => {
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
      sessionRequest.onerror = () => reject(sessionRequest.error || new Error("Lettura registro fallita."));
      const cursorRequest = events.index("sessionId").openCursor(IDBKeyRange.only(sessionId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error || new Error("Cancellazione eventi fallita."));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Cancellazione registro fallita."));
      tx.onabort = () => reject(tx.error || new Error("Cancellazione registro annullata."));
    });
    await notifyChange("clear", sessionId);
  });
}

export async function deleteCombatLogSession(sessionId) {
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM puÃ² eliminare un registro.");
  if (!sessionId) throw new Error("Registro non valido.");
  return queueWrite(async () => {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
      const sessions = tx.objectStore(SESSION_STORE);
      const events = tx.objectStore(EVENT_STORE);
      sessions.delete(sessionId);
      const cursorRequest = events.index("sessionId").openCursor(IDBKeyRange.only(sessionId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error || new Error("Cancellazione eventi fallita."));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Eliminazione registro fallita."));
      tx.onabort = () => reject(tx.error || new Error("Eliminazione registro annullata."));
    });

    const state = await getSessionState();
    if (state?.sessionId === sessionId) {
      const remaining = await listCombatLogSessions();
      const next = remaining[0] || null;
      if (next) {
        await writeSceneMetadataKey(
          OBR.scene,
          METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
          {
            version: 1,
            sessionId: next.id,
            name: next.name,
            startedAt: next.startedAt,
          },
          { runtime: "combatLog" },
        );
      } else {
        // L'SDK non documenta una cancellazione fisica key-scoped: null è il
        // tombstone JSON-safe che rappresenta semanticamente nessuna sessione.
        await clearSceneMetadataKey(
          OBR.scene,
          METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
          { runtime: "combatLog" },
        );
      }
    }
    await notifyChange("delete", sessionId);
  });
}

export async function getActiveCombatLogData() {
  const session = await ensureCombatLogSession();
  if (!session) return { session: null, events: [] };
  return { session, events: await getCombatLogEvents(session.id) };
}

export function exportCombatLogText(session, events) {
  return serializeCombatLogText(session, events);
}

export function exportCombatLogJSON(session, events) {
  return JSON.stringify({ version: 1, session, events }, null, 2);
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
