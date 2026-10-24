import OBR from "@owlbear-rodeo/sdk";
import {
  HISTORY_OWNER_COMMAND_CHANNEL,
  HISTORY_OWNER_RESULT_CHANNEL,
  ID,
} from "./constants.js";
import { recordHistoryInCombatLog } from "./combatLog.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { perfJsonBytes, perfNow, perfProbeEnabled, perfRecord, perfSince } from "./perfProbe.js";
import {
  createHistoryStorage,
  createLocalHistoryDatabase,
  localStoreFlagEnabled,
  migrateLegacyHistory,
} from "./historyLocalStore.js";
import {
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "./metadataKeyScoped.js";
import {
  createHistoryOwnerBroker,
  HISTORY_OWNER_MAX_ENTRIES,
  HISTORY_OWNER_STATUS,
  normalizeHistoryState,
} from "./historyOwnerCore.js";

const HISTORY_KEY = `${ID}/history`;
const HISTORY_CHANGE_CHANNEL = `${ID}/history-change`;
const HISTORY_OWNER_TRANSPORT_TIMEOUT_MS = 8000;

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function currentRoomId() {
  return String(OBR.room?.id || "").trim();
}

function normalizeOwnerHistory(value) {
  return normalizeHistoryState(value, {
    maxEntries: HISTORY_OWNER_MAX_ENTRIES,
    version: 1,
    roomId: currentRoomId(),
  });
}

function errorDetails(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Comando del gestore della cronologia non riuscito."),
  };
}

let ownerBroker = null;
let ownerCommandUnsubscribe = null;
let ownerSceneEpochUnsubscribe = null;
let ownerSceneLifecycle = null;
let ownerSceneLifecycleUnsubscribe = null;
let ownerMountPromise = null;
let ownerMountRevision = 0;
let ownerSceneIdentity = null;
let ownerSceneReady = false;
let ownerSceneEpoch = null;

function ownerSceneIsCurrent(captured) {
  return ownerSceneReady
    && ownerSceneIdentity === captured?.identity
    && ownerSceneEpoch === captured?.epoch
    && isCurrentSceneEpoch(captured?.epoch);
}

function setOwnerSceneContext(ready) {
  if (!ownerBroker) return;
  const nextReady = ready === true;
  const nextEpoch = nextReady ? currentSceneEpoch() : null;

  // Readiness notifications are not guaranteed to be unique. Preserve the
  // identity and generation while the owner is still ready in the same epoch;
  // a real epoch change or an unavailable -> ready transition gets one new
  // identity and invalidates the broker scope exactly once.
  if (nextReady && ownerSceneReady
    && ownerSceneIdentity
    && ownerSceneEpoch === nextEpoch) return;
  if (!nextReady && !ownerSceneReady && !ownerSceneIdentity) return;

  if (nextReady) {
    ownerSceneReady = true;
    ownerSceneIdentity = createId("history-scene");
    ownerSceneEpoch = nextEpoch;
  } else {
    ownerSceneReady = false;
    ownerSceneIdentity = null;
    ownerSceneEpoch = null;
  }
  ownerBroker.setSceneContext({
    ready: ownerSceneReady,
    sceneIdentity: ownerSceneIdentity,
    sceneEpoch: ownerSceneEpoch,
  });
  if (ownerSceneReady) scheduleLegacyHistoryMigration(ownerBroker, ownerSceneIdentity);
}

// ARCH-009 step 3, flag on only: move a History still whole in the scene to IndexedDB at owner start.
function scheduleLegacyHistoryMigration(broker, sceneIdentity) {
  if (!localHistoryStoreEnabled()) return;
  void migrateLegacyHistory({
    isEnabled: localHistoryStoreEnabled,
    readSceneValue: async () => (await OBR.scene.getMetadata())?.[HISTORY_KEY],
    handle: (command) => broker.handle(command),
    sceneIdentity,
    isCurrent: () => ownerBroker === broker && ownerSceneIdentity === sceneIdentity,
    createId: () => createId("history-migrate"),
  }).then((result) => {
    if (result?.status === HISTORY_OWNER_STATUS.FAILED || result?.status === HISTORY_OWNER_STATUS.REJECTED) {
      console.warn("[history-local-store] migration:", result?.error?.message || result?.reason || result?.status);
    }
  }).catch((error) => {
    console.warn("[history-local-store] migration:", error?.message || error);
  });
}

function refreshOwnerSceneEpoch() {
  if (!ownerBroker) return;
  setOwnerSceneContext(true);
}

// Perf probe only: time one owner phase of one command. Off, the phase runs exactly as before.
function probeOwnerPhase(phase, command, run) {
  if (!perfProbeEnabled()) return run();
  const startedAt = perfNow();
  const finish = () => perfRecord("history-owner-phase", {
    phase,
    commandId: String(command?.requestId || command?.commandId || ""),
    durationMs: perfSince(startedAt),
  });
  return Promise.resolve(run()).finally(finish);
}

function localHistoryStoreEnabled() {
  return localStoreFlagEnabled();
}

const localHistoryWarnings = new Set();

function warnLocalHistory(key, message) {
  if (localHistoryWarnings.has(key)) return;
  localHistoryWarnings.add(key);
  console.warn("[history-local-store]", message);
  try { void OBR.notification?.show?.(message, "WARNING")?.catch?.(() => {}); }
  catch {}
}

// Step 2 of ARCH-009: the scene, unless the GM-local flag moves the History to IndexedDB (off by default).
const localHistoryStorage = createHistoryStorage({
  database: createLocalHistoryDatabase(),
  readSceneValue: async () => (await OBR.scene.getMetadata())?.[HISTORY_KEY],
  isEnabled: localHistoryStoreEnabled,
  currentRoomId,
  onLocalHistoryUnavailable: ({ storeId }) => warnLocalHistory(
    `unavailable:${storeId}`,
    "Cronologia di questa scena non disponibile in questo browser: riparte vuota. La scena non è stata modificata.",
  ),
  onLocalStoreFailed: (error) => warnLocalHistory(
    "store-failed",
    `Archivio locale della cronologia non disponibile (${error?.message || error}): la cronologia resta nella scena.`,
  ),
});

function writeSceneHistoryValue(value) {
  return writeSceneMetadataKey(
    OBR.scene,
    METADATA_OWNERSHIP.HISTORY,
    value,
    { runtime: "historyOwner" },
  );
}

// Where the History value lives (ARCH-009). Every reader and the owner go through this storage; this file stays
// the only writer of the History key. Without a local head and with the flag off, read and write are the scene
// calls of before, with the same timing.
const historyStorage = Object.freeze({
  async read({ commandId = "", owner = false } = {}) {
    const probeStartedAt = perfProbeEnabled() ? perfNow() : 0;
    const metadata = await OBR.scene.getMetadata();
    if (perfProbeEnabled() && commandId) {
      perfRecord("history-read", {
        commandId,
        durationMs: perfSince(probeStartedAt),
        sceneMetadataBytes: perfJsonBytes(metadata),
        historyBytes: perfJsonBytes(metadata?.[HISTORY_KEY]),
        historyEntries: Array.isArray(metadata?.[HISTORY_KEY]?.entries) ? metadata[HISTORY_KEY].entries.length : 0,
      });
    }
    return localHistoryStorage.resolveRead(metadata?.[HISTORY_KEY], { owner });
  },
  write(history) {
    const value = localHistoryStorage.prepareWrite(history);
    return typeof value?.then === "function"
      ? value.then(writeSceneHistoryValue)
      : writeSceneHistoryValue(value);
  },
});

// The raw stored History value, for the readers in any GM iframe (getHistoryEntries, Undo).
export function readHistoryValue() {
  return historyStorage.read();
}

function createOwnerBroker() {
  ownerBroker = createHistoryOwnerBroker({
    maxEntries: HISTORY_OWNER_MAX_ENTRIES,
    readHistory: ({ command } = {}) => historyStorage.read({
      owner: true,
      commandId: String(command?.requestId || command?.commandId || ""),
    }),
    writeHistory: (history, { command } = {}) => probeOwnerPhase("write", command, () => historyStorage.write(history)),
    notify: (result, { command } = {}) => probeOwnerPhase("notify", command, async () => {
      await OBR.broadcast.sendMessage(
        HISTORY_CHANGE_CHANNEL,
        {
          type: "changed",
          sceneIdentity: result.sceneIdentity,
          sceneEpoch: result.sceneEpoch,
          entryId: result.entry?.id || null,
          status: result.status,
        },
        { destination: "LOCAL" },
      );
    }),
    recordCombatLog: (entry, { command, scene }) => probeOwnerPhase("combat-log", command, () => recordHistoryInCombatLog(entry, {
      sceneEpoch: scene.epoch,
    })),
    normalizeHistory: (value) => normalizeOwnerHistory(value),
    isSceneCurrent: ownerSceneIsCurrent,
  });
  return ownerBroker;
}

function respondToOwnerCommand(requestId, result) {
  return OBR.broadcast.sendMessage(
    HISTORY_OWNER_RESULT_CHANNEL,
    { requestId, result },
    { destination: "LOCAL" },
  );
}

export async function mountHistoryOwner() {
  if (ownerMountPromise) return ownerMountPromise;
  if (ownerCommandUnsubscribe) return true;
  if (typeof OBR?.broadcast?.onMessage !== "function") return false;
  const revision = ++ownerMountRevision;
  const mountPromise = (async () => {
    try {
      if (await OBR.player.getRole() !== "GM") return false;
      if (revision !== ownerMountRevision) return false;

      const broker = createOwnerBroker();
      const lifecycle = createSceneLifecycleAdapter({ obr: OBR });
      ownerBroker = broker;
      ownerSceneLifecycle = lifecycle;
      ownerCommandUnsubscribe = OBR.broadcast.onMessage(
        HISTORY_OWNER_COMMAND_CHANNEL,
        (event) => {
          const data = event?.data;
          if (!data?.requestId || !["context", "append", "remove", "clear"].includes(data.kind)) return;
          const probeStartedAt = perfProbeEnabled() ? perfNow() : 0;
          let probeHandledMs = null;
          const probeRecordResponse = (result) => {
            if (!perfProbeEnabled()) return;
            perfRecord("history-owner-command", {
              kind: data.kind,
              commandId: String(data.requestId),
              status: result?.status || null,
              handledMs: probeHandledMs,
              totalMs: perfSince(probeStartedAt),
            });
          };
          void broker.handle(data).then((result) => {
            if (perfProbeEnabled()) probeHandledMs = perfSince(probeStartedAt);
            return respondToOwnerCommand(data.requestId, result).then(() => probeRecordResponse(result));
          }).catch((error) => respondToOwnerCommand(data.requestId, {
            requestId: data.requestId,
            commandId: data.commandId || data.requestId,
            correlationId: data.correlationId || data.commandId || data.requestId,
            status: HISTORY_OWNER_STATUS.FAILED,
            changed: false,
            error: errorDetails(error),
          })).catch((error) => {
            console.warn("[history-owner] response:", error?.message || error);
          });
        },
      );

      ownerSceneEpochUnsubscribe = subscribeSceneEpoch(({ phase }) => {
        if (phase === "unload") {
          if (ownerSceneReady) setOwnerSceneContext(false);
          return;
        }
        if (phase === "ready") refreshOwnerSceneEpoch();
      });
      ownerSceneLifecycleUnsubscribe = lifecycle.subscribe((state) => {
        if (ownerSceneLifecycle !== lifecycle || state.disposed) return;
        setOwnerSceneContext(state.ready);
      });

      await lifecycle.mount();
      if (ownerSceneLifecycle !== lifecycle || lifecycle.disposed || revision !== ownerMountRevision) {
        return false;
      }
      return true;
    } catch (error) {
      if (revision === ownerMountRevision) unmountHistoryOwner();
      throw error;
    }
  })();
  ownerMountPromise = mountPromise;
  try {
    return await mountPromise;
  } finally {
    if (ownerMountPromise === mountPromise) ownerMountPromise = null;
  }
}

export function unmountHistoryOwner() {
  ownerMountRevision += 1;
  ownerMountPromise = null;
  ownerCommandUnsubscribe?.();
  ownerCommandUnsubscribe = null;
  ownerSceneLifecycleUnsubscribe?.();
  ownerSceneLifecycleUnsubscribe = null;
  ownerSceneLifecycle?.dispose();
  ownerSceneLifecycle = null;
  ownerSceneEpochUnsubscribe?.();
  ownerSceneEpochUnsubscribe = null;
  ownerBroker?.clear();
  ownerBroker = null;
  ownerSceneIdentity = null;
  ownerSceneReady = false;
  ownerSceneEpoch = null;
}

let clientResultUnsubscribe = null;
let clientSceneEpochUnsubscribe = null;
let clientGeneration = 0;
const clientPendingRequests = new Map();

class HistoryOwnerCommandError extends Error {
  constructor(message, result = null, details = {}) {
    super(message);
    this.name = "HistoryOwnerCommandError";
    this.result = result;
    Object.assign(this, details);
  }
}

function rejectPendingRequest(requestId, pending, message, code, result = null) {
  if (clientPendingRequests.get(requestId) !== pending) return;
  clientPendingRequests.delete(requestId);
  clearTimeout(pending.timer);
  pending.reject(new HistoryOwnerCommandError(
    message,
    result,
    {
      code,
      requestId,
      commandId: pending.commandId,
      correlationId: pending.correlationId,
      entryId: pending.entryId,
    },
  ));
}

function ensureClientTransport() {
  if (clientResultUnsubscribe || typeof OBR?.broadcast?.onMessage !== "function") return;
  clientResultUnsubscribe = OBR.broadcast.onMessage(
    HISTORY_OWNER_RESULT_CHANNEL,
    (event) => {
      const data = event?.data;
      const pending = clientPendingRequests.get(data?.requestId);
      if (!pending) return;
      if (pending.generation !== clientGeneration || !isCurrentSceneEpoch(pending.sceneEpoch)) {
        rejectPendingRequest(
          data.requestId,
          pending,
          "La risposta della cronologia appartiene a una scena obsoleta.",
          "stale-scene",
          data?.result || null,
        );
        return;
      }
      if (pending.sceneIdentity && data?.result?.sceneIdentity !== pending.sceneIdentity) {
        rejectPendingRequest(
          data.requestId,
          pending,
          "La risposta della cronologia appartiene a un'identità di scena del gestore obsoleta.",
          "stale-scene-identity",
          data?.result || null,
        );
        return;
      }
      clientPendingRequests.delete(data.requestId);
      clearTimeout(pending.timer);
      pending.resolve(data.result || {
        requestId: data.requestId,
        status: HISTORY_OWNER_STATUS.FAILED,
        changed: false,
        error: { name: "HistoryOwnerTransportError", message: "Risposta owner mancante." },
      });
    },
  );
  clientSceneEpochUnsubscribe = subscribeSceneEpoch(({ phase }) => {
    if (phase !== "unload") return;
    clientGeneration += 1;
    for (const [requestId, pending] of clientPendingRequests) {
      clientPendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      pending.reject(new HistoryOwnerCommandError(
        "La scena è cambiata durante la richiesta alla cronologia.",
        null,
        { code: "stale-scene", requestId, commandId: pending.commandId },
      ));
    }
  });
}

function sendOwnerRequest(payload, { sceneEpoch = currentSceneEpoch() } = {}) {
  ensureClientTransport();
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    return Promise.reject(new HistoryOwnerCommandError(
      "La richiesta alla cronologia appartiene a una scena obsoleta.",
      null,
      { code: "stale-scene", commandId: payload.commandId },
    ));
  }
  const requestId = String(payload.requestId || createId("history-request"));
  const generation = clientGeneration;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const pending = clientPendingRequests.get(requestId);
      if (!pending) return;
      clientPendingRequests.delete(requestId);
      reject(new HistoryOwnerCommandError(
        "Timeout del gestore della cronologia in background.",
        null,
        {
          code: "history-owner-timeout",
          requestId,
          commandId: payload.commandId,
          correlationId: payload.correlationId,
          entryId: payload.entry?.id || null,
        },
      ));
    }, HISTORY_OWNER_TRANSPORT_TIMEOUT_MS);
    clientPendingRequests.set(requestId, {
      resolve,
      reject,
      timer,
      generation,
      sceneEpoch,
      sceneIdentity: payload.sceneIdentity || null,
      commandId: payload.commandId,
      correlationId: payload.correlationId,
      entryId: payload.entry?.id || null,
    });
    void OBR.broadcast.sendMessage(
      HISTORY_OWNER_COMMAND_CHANNEL,
      { ...payload, requestId },
      { destination: "LOCAL" },
    ).catch((error) => {
      const pending = clientPendingRequests.get(requestId);
      if (!pending) return;
      clientPendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      pending.reject(new HistoryOwnerCommandError(
        String(error?.message || error || "Invio al gestore della cronologia fallito."),
        null,
        {
          code: "history-owner-transport",
          requestId,
          commandId: payload.commandId,
          correlationId: payload.correlationId,
          entryId: payload.entry?.id || null,
        },
      ));
    });
  });
}

async function requestOwnerContext(sceneEpoch) {
  const commandId = createId("history-context");
  const result = await sendOwnerRequest({
    kind: "context",
    commandId,
    correlationId: commandId,
    sourceSceneEpoch: sceneEpoch,
  }, { sceneEpoch });
  if (result?.status !== HISTORY_OWNER_STATUS.APPLIED || !result.sceneIdentity) {
    throw new HistoryOwnerCommandError(
      result?.error?.message || `Gestore della cronologia non pronto: ${result?.reason || "unknown"}.`,
      result,
      { code: result?.reason || "history-owner-not-ready", commandId },
    );
  }
  return result.sceneIdentity;
}

async function requestOwnerCommand(
  kind,
  payload = {},
  {
    sceneEpoch = currentSceneEpoch(),
    commandId = createId("history-command"),
    correlationId = commandId,
    sceneIdentity = null,
  } = {},
) {
  if (!isCurrentSceneEpoch(sceneEpoch)) {
    throw new HistoryOwnerCommandError(
      "La richiesta alla cronologia appartiene a una scena obsoleta.",
      null,
      { code: "stale-scene", commandId, correlationId },
    );
  }
  const identity = String(sceneIdentity || await requestOwnerContext(sceneEpoch) || "").trim();
  if (!identity) {
    throw new HistoryOwnerCommandError("Identità di scena della cronologia mancante.", null, {
      code: "history-owner-scene-identity",
      commandId,
      correlationId,
    });
  }
  return sendOwnerRequest({
    kind,
    commandId,
    correlationId,
    sceneIdentity: identity,
    sourceSceneEpoch: sceneEpoch,
    ...payload,
  }, { sceneEpoch });
}

function throwForOwnerResult(result, details = {}) {
  if (result?.status === HISTORY_OWNER_STATUS.CONFLICT) {
    throw new HistoryOwnerCommandError(
      "Voce della cronologia già presente con un payload differente.",
      result,
      { code: "history-entry-conflict", ...details },
    );
  }
  if ([
    HISTORY_OWNER_STATUS.APPLIED,
    HISTORY_OWNER_STATUS.DUPLICATE,
    HISTORY_OWNER_STATUS.REMOVED,
    HISTORY_OWNER_STATUS.NOOP,
    HISTORY_OWNER_STATUS.CLEARED,
  ].includes(result?.status)) return result;
  throw new HistoryOwnerCommandError(
    result?.error?.message || `Richiesta rifiutata dal gestore della cronologia: ${result?.reason || result?.status || "unknown"}.`,
    result,
    { code: result?.reason || "history-owner-failed", ...details },
  );
}

export async function requestHistoryOwnerAppend(
  entry,
  options = {},
) {
  const result = await requestOwnerCommand("append", { entry: clone(entry) }, options);
  try {
    return throwForOwnerResult(result, { entryId: entry?.id || null });
  } catch (error) {
    if (error && typeof error === "object") {
      // A failed owner write may still have reserved the entry's storeSeq.
      // Preserve that owner-enriched immutable entry for the retry lane.
      error.historyEntry = clone(error?.result?.entry || entry);
      error.entryId ||= entry?.id || null;
    }
    throw error;
  }
}

export async function requestHistoryOwnerRemove(ids, options = {}) {
  const result = await requestOwnerCommand("remove", {
    ids: Array.from(new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))),
  }, options);
  return throwForOwnerResult(result, { ids });
}

export async function requestHistoryOwnerClear(options = {}) {
  const result = await requestOwnerCommand("clear", {}, options);
  return throwForOwnerResult(result);
}

export function getHistoryOwnerState() {
  return ownerBroker?.getState() || {
    scene: { ready: false, identity: null, epoch: null, generation: null },
    pending: 0,
    cachedResults: 0,
  };
}

export { HistoryOwnerCommandError };
