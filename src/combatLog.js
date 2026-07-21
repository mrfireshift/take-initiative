import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { combatEventFromHistoryEntry, serializeCombatLogText } from "./combatLogCore.js";

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

async function getStoredSession(id) {
  const db = await openDatabase();
  return requestResult(db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).get(id));
}

async function putStoredSession(session) {
  const db = await openDatabase();
  const tx = db.transaction(SESSION_STORE, "readwrite");
  tx.objectStore(SESSION_STORE).put(session);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Salvataggio sessione fallito."));
    tx.onabort = () => reject(tx.error || new Error("Salvataggio sessione annullato."));
  });
}

async function getSessionState() {
  const metadata = await OBR.scene.getMetadata();
  const state = metadata?.[SESSION_STATE_KEY];
  return state && typeof state === "object" ? state : null;
}

async function setSessionState(session) {
  const metadata = await OBR.scene.getMetadata();
  await OBR.scene.setMetadata({
    ...metadata,
    [SESSION_STATE_KEY]: {
      version: 1,
      sessionId: session.id,
      name: session.name,
      startedAt: session.startedAt,
    },
  });
}

export async function startCombatLogSession(name = "") {
  if (await OBR.player.getRole() !== "GM") throw new Error("Solo il GM può creare un registro.");
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
  await putStoredSession(session);
  await setSessionState(session);
  await notifyChange("session", session.id);
  return session;
}

export async function ensureCombatLogSession() {
  if (await OBR.player.getRole() !== "GM") return null;
  const state = await getSessionState();
  if (state?.sessionId) {
    const stored = await getStoredSession(state.sessionId);
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
    await putStoredSession(recovered);
    return recovered;
  }
  return startCombatLogSession();
}

async function appendEventsNow(sessionId, inputs, sessionPatch = {}) {
  const db = await openDatabase();
  const created = [];
  await new Promise((resolve, reject) => {
    const tx = db.transaction([SESSION_STORE, EVENT_STORE], "readwrite");
    const sessions = tx.objectStore(SESSION_STORE);
    const events = tx.objectStore(EVENT_STORE);
    const request = sessions.get(sessionId);
    request.onsuccess = () => {
      const session = request.result;
      if (!session) {
        tx.abort();
        return;
      }
      let sequence = Math.max(1, Number(session.nextSequence) || 1);
      for (const input of inputs) {
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
      sessions.put({
        ...session,
        ...sessionPatch,
        nextSequence: sequence,
        updatedAt: Date.now(),
      });
    };
    request.onerror = () => reject(request.error || new Error("Lettura sessione fallita."));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Scrittura Combat Log fallita."));
    tx.onabort = () => reject(tx.error || new Error("Scrittura Combat Log annullata."));
  });
  if (created.length) await notifyChange("events", sessionId);
  return created;
}

function queueWrite(action) {
  writeQueue = writeQueue.then(action, action);
  return writeQueue;
}

async function currentContext() {
  const metadata = await OBR.scene.getMetadata();
  const state = metadata?.[STATE_KEY] || {};
  const round = Math.max(1, Number(state.round) || 1);
  const activeId = Array.isArray(state.order) ? state.order[state.current] : null;
  return { round, turn: await resolveTurn(activeId) };
}

function realActorId(value) {
  const id = String(value || "");
  const paragonIndex = id.indexOf("::p");
  return paragonIndex >= 0 ? id.slice(0, paragonIndex) : id;
}

async function resolveTurn(activeId) {
  const rawId = String(activeId || "");
  if (!rawId) return null;
  if (rawId === LAIR_ID) return { id: rawId, name: "Azioni di Tana" };
  if (rawId.startsWith("__EPIC__")) return { id: rawId, name: "Azione Epica" };
  const id = realActorId(rawId);
  try {
    const [item] = await OBR.scene.items.getItems([id]);
    return { id: rawId, tokenId: id, name: String(item?.name || "Token") };
  } catch {
    return { id: rawId, tokenId: id, name: "Token" };
  }
}

export async function appendCombatLogEvent(input) {
  return queueWrite(async () => {
    const session = await ensureCombatLogSession();
    if (!session) return [];
    const context = await currentContext();
    return appendEventsNow(session.id, [{
      source: "automatic",
      round: context.round,
      turn: context.turn,
      ...input,
    }]);
  });
}

export async function recordHistoryInCombatLog(entry) {
  try {
    const context = await currentContext();
    return appendCombatLogEvent(combatEventFromHistoryEntry(entry, context));
  } catch (error) {
    console.warn("[combat-log] history event:", error?.message || error);
    return [];
  }
}

export async function recordCombatUndo(entries) {
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
  });
}

export async function recordNativeMovementUndo(changes) {
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
  });
}

export async function recordCombatTurn(state) {
  if (!state || !Array.isArray(state.order) || !state.order.length) return [];
  return queueWrite(async () => {
    const session = await ensureCombatLogSession();
    if (!session) return [];
    const round = Math.max(1, Number(state.round) || 1);
    const activeId = String(state.order[state.current] || "");
    const turnKey = `${round}:${activeId}`;
    const latest = await getStoredSession(session.id) || session;
    if (latest.lastTurnKey === turnKey) return [];
    const turn = await resolveTurn(activeId);
    const inputs = [];
    if (Number(latest.lastRound) !== round) {
      inputs.push({
        source: "automatic",
        round,
        turn,
        kind: "round",
        action: "start",
        label: `Inizio Round ${round}`,
        targets: [],
        payload: {},
      });
    }
    inputs.push({
      source: "automatic",
      round,
      turn,
      kind: "turn",
      action: "start",
      label: `Turno di ${turn?.name || "Token"}`,
      targets: turn ? [turn] : [],
      payload: { actorId: activeId, actorName: turn?.name || "Token" },
    });
    return appendEventsNow(session.id, inputs, { lastRound: round, lastTurnKey: turnKey });
  });
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
      const metadata = await OBR.scene.getMetadata();
      if (next) {
        await OBR.scene.setMetadata({
          ...metadata,
          [SESSION_STATE_KEY]: {
            version: 1,
            sessionId: next.id,
            name: next.name,
            startedAt: next.startedAt,
          },
        });
      } else {
        const nextMetadata = { ...metadata };
        delete nextMetadata[SESSION_STATE_KEY];
        await OBR.scene.setMetadata(nextMetadata);
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

async function notifyChange(type, sessionId) {
  try {
    await OBR.broadcast.sendMessage(CHANNEL, { type, sessionId }, { destination: "LOCAL" });
  } catch {}
}

export function subscribeCombatLog(handler) {
  return OBR.broadcast.onMessage(CHANNEL, () => handler());
}
