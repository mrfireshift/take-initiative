import { ID } from "./constants.js";
import {
  ROOM_METADATA_DOMAIN_MAX_BYTES,
  ROOM_METADATA_HARD_LIMIT_BYTES,
  ROOM_METADATA_SAFE_LIMIT_BYTES,
  compactOwnedRoomMetadata,
  planRoomMetadataWrite,
  roomMetadataBytes,
  topOwnedRoomMetadataKeys,
} from "./roomMetadataBudget.js";

export {
  ROOM_METADATA_DOMAIN_MAX_BY_KEY,
  ROOM_METADATA_DOMAIN_MAX_BYTES,
  ROOM_METADATA_HARD_LIMIT_BYTES,
  ROOM_METADATA_SAFE_LIMIT_BYTES,
  ROOM_METADATA_SAFETY_MARGIN_BYTES,
  TAKE_INITIATIVE_ROOM_METADATA_KEYS,
  compactOwnedRoomMetadata,
  jsonBytes,
  planRoomMetadataWrite,
  roomMetadataBytes,
  roomMetadataCandidate,
  roomMetadataKeyBytes,
  roomMetadataValueBudget,
  topOwnedRoomMetadataKeys,
} from "./roomMetadataBudget.js";

// Contratti dei domini metadata condivisi tra runtime/iframe. Un writer può
// aggiornare soltanto il valore della chiave del proprio contratto.
export const METADATA_OWNERSHIP = Object.freeze({
  INITIATIVE_STATE: Object.freeze({
    key: `${ID}/state`,
    domain: "initiative-state",
    owners: Object.freeze(["initiativeStateGateway.js"]),
  }),
  HISTORY: Object.freeze({
    key: `${ID}/history`,
    domain: "history",
    owners: Object.freeze(["historyOwner.js"]),
  }),
  CLOCKS: Object.freeze({
    key: `${ID}/clocks`,
    domain: "clocks",
    owners: Object.freeze(["clocks.js"]),
  }),
  COMBAT_LOG_SESSION: Object.freeze({
    key: `${ID}/combat-log-state`,
    domain: "combat-log-session",
    owners: Object.freeze(["combatLog.js"]),
  }),
  SHARED_UI: Object.freeze({
    key: `${ID}/ui`,
    domain: "shared-ui",
    owners: Object.freeze(["action-launcher.js"]),
  }),
  ROOM_MEMORY: Object.freeze({
    key: `${ID}/hpMemory`,
    domain: "room-memory",
    owners: Object.freeze(["hpMemory.js"]),
  }),
  ACTOR_VITALS: Object.freeze({
    key: `${ID}/actorVitals`,
    domain: "actor-vitals",
    owners: Object.freeze(["actorVitalsStore.js"]),
  }),
  REGISTRY: Object.freeze({
    key: `${ID}/factionRegistry`,
    domain: "registry",
    owners: Object.freeze(["factionRegistry.js"]),
  }),
  INITIATIVE_CARDS: Object.freeze({
    key: `${ID}/initiativeCards`,
    domain: "initiative-cards",
    owners: Object.freeze(["initiativeCards.js"]),
  }),
  ROOM_OPTIONS: Object.freeze({
    key: `${ID}/options-room`,
    domain: "options-room",
    owners: Object.freeze(["options/roomOptionsStore.js"]),
  }),
  SPEED_CHECK_CONTROL: Object.freeze({
    key: `${ID}/speed-check-control`,
    domain: "speed-check-control",
    owners: Object.freeze(["speedCheck.js"]),
  }),
  SCENE_OPTIONS: Object.freeze({
    key: `${ID}/options-scene`,
    domain: "options-scene",
    owners: Object.freeze(["options/sceneOptionsStore.js"]),
  }),
});

export const METADATA_DIAGNOSTICS_GLOBAL = "__TBP_METADATA_KEY_DIAGNOSTICS__";
export const METADATA_CLEAR_TOMBSTONE = null;
let diagnosticsEnabled = false;

export function setMetadataDiagnosticsEnabled(enabled) {
  diagnosticsEnabled = enabled === true;
}

function isDiagnosticsEnabled() {
  return diagnosticsEnabled || globalThis?.[METADATA_DIAGNOSTICS_GLOBAL] === true;
}

function timestamp() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function errorText(error) {
  return String(error?.message || error || "Errore sconosciuto");
}

function reportDiagnostic({ scope, runtime, domain, key, durationMs, ok, error }) {
  if (!isDiagnosticsEnabled() || typeof console?.debug !== "function") return;
  const details = {
    scope,
    runtime,
    domain,
    key,
    durationMs: Math.max(0, Math.round(durationMs)),
    ok,
  };
  if (error) details.error = errorText(error);
  console.debug("[metadata-key]", details);
}

function contextualWriteError(error, { scope, runtime, domain, key }) {
  const contextual = new Error(
    `[metadata-key:${scope}/${domain}] Scrittura fallita per la chiave "${key}" `
    + `(runtime ${runtime}): ${errorText(error)}`,
  );
  contextual.name = "MetadataKeyWriteError";
  contextual.cause = error;
  return contextual;
}

function roomBudgetLogger(options = {}) {
  return options?.logger && typeof options.logger.warn === "function"
    ? options.logger
    : console;
}

function roomBudgetDetails(domain, key, plan) {
  return {
    domain,
    key,
    totalBeforeBytes: plan?.totalBeforeBytes ?? 0,
    requestedValueBytes: plan?.requestedValueBytes ?? 0,
    persistedValueBytes: plan?.persistedValueBytes ?? 0,
    candidateTotalBytes: plan?.candidateTotalBytes ?? 0,
    limitBytes: ROOM_METADATA_SAFE_LIMIT_BYTES,
    pruned: plan?.pruned === true,
  };
}

function reportRoomBudget(
  metadata,
  contract,
  plan,
  options = {},
  { failure = false } = {},
) {
  const logger = roomBudgetLogger(options);
  const details = roomBudgetDetails(
    String(contract?.domain || "unknown-domain"),
    String(contract?.key || ""),
    plan,
  );
  if (failure) details.topOwnedKeys = topOwnedRoomMetadataKeys(metadata);
  logger.warn("[room-metadata-budget]", details);
}

function roomBudgetError(plan, contract) {
  const error = new Error(
    `Room metadata oltre il budget per la chiave "${String(contract?.key || "")}" `
    + `(candidate ${plan?.candidateTotalBytes ?? "?"} B; hard limit ${ROOM_METADATA_HARD_LIMIT_BYTES} B).`,
  );
  error.name = "MetadataRoomBudgetError";
  error.roomBudgetReported = true;
  error.roomBudget = plan;
  return error;
}

async function writeMetadataKey(
  api,
  contract,
  value,
  {
    scope,
    runtime = "unknown",
    roomBudget = {},
    logger = console,
  } = {},
) {
  const domain = String(contract?.domain || "unknown-domain");
  const key = String(contract?.key || "");
  if (!key) throw new TypeError(`[metadata-key:${scope || "metadata"}/${domain}] Chiave metadata mancante.`);
  if (value === undefined) {
    throw new TypeError(
      `[metadata-key:${scope || "metadata"}/${domain}] Valore undefined non JSON-safe per la chiave "${key}"; `
      + "usare l'helper di clear key-scoped.",
    );
  }
  if (!api || typeof api.setMetadata !== "function") {
    throw new TypeError(
      `[metadata-key:${scope || "metadata"}/${domain}] API setMetadata mancante per la chiave "${key}".`,
    );
  }

  const startedAt = timestamp();
  let metadataSnapshot = null;
  let roomPlan = null;
  try {
    let valueToWrite = value;
    if (scope === "room" && typeof api.getMetadata === "function") {
      metadataSnapshot = await api.getMetadata();
      roomPlan = planRoomMetadataWrite(
        metadataSnapshot,
        key,
        value,
        {
          domainMaxBytes: roomBudget.domainMaxBytes
            ?? ROOM_METADATA_DOMAIN_MAX_BYTES[domain]
            ?? Number.MAX_SAFE_INTEGER,
          retain: roomBudget.retain,
        },
      );
      if (!roomPlan.fitsHard) {
        reportRoomBudget(metadataSnapshot, contract, roomPlan, { logger }, { failure: true });
        throw roomBudgetError(roomPlan, contract);
      }
      if (roomPlan.pruned || !roomPlan.fitsSafe || roomPlan.recoveryWrite) {
        reportRoomBudget(metadataSnapshot, contract, roomPlan, { logger });
      }
      valueToWrite = roomPlan.persistedValue;
    }
    await api.setMetadata({ [key]: valueToWrite });
    reportDiagnostic({
      scope,
      runtime,
      domain,
      key,
      durationMs: timestamp() - startedAt,
      ok: true,
    });
  } catch (error) {
    if (scope === "room" && !error?.roomBudgetReported && roomPlan) {
      reportRoomBudget(metadataSnapshot || {}, contract, roomPlan, { logger }, { failure: true });
    }
    const contextual = contextualWriteError(error, { scope, runtime, domain, key });
    reportDiagnostic({
      scope,
      runtime,
      domain,
      key,
      durationMs: timestamp() - startedAt,
      ok: false,
      error: contextual,
    });
    throw contextual;
  }
}

function clearMetadataKey(api, contract, options = {}) {
  return writeMetadataKey(api, contract, METADATA_CLEAR_TOMBSTONE, options);
}

export function writeSceneMetadataKey(api, contract, value, options = {}) {
  return writeMetadataKey(api, contract, value, { ...options, scope: "scene" });
}

export function clearSceneMetadataKey(api, contract, options = {}) {
  return clearMetadataKey(api, contract, { ...options, scope: "scene" });
}

export function writeRoomMetadataKey(api, contract, value, options = {}) {
  return writeMetadataKey(api, contract, value, { ...options, scope: "room" });
}

/**
 * Self-heal one-shot per le Room già oltre il limite. Il caller fornisce
 * esclusivamente chiavi di proprietà Take Initiative; tutte le altre chiavi
 * vengono copiate byte-for-byte nel candidato e non vengono mai riscritte.
 */
export async function reconcileOwnedRoomMetadataBudget(
  api,
  entries = [],
  { logger = console, runtime = "roomMetadataBudget" } = {},
) {
  if (!api || typeof api.getMetadata !== "function" || typeof api.setMetadata !== "function") {
    throw new TypeError(`[metadata-key:room/${runtime}] API Room incompleta.`);
  }
  const metadata = await api.getMetadata();
  const plan = compactOwnedRoomMetadata(metadata, entries);
  if (!plan.fitsHard) {
    const details = {
      domain: "aggregate",
      key: "<owned-room-metadata>",
      totalBeforeBytes: plan.totalBeforeBytes,
      requestedValueBytes: plan.totalBeforeBytes,
      persistedValueBytes: plan.candidateTotalBytes,
      candidateTotalBytes: plan.candidateTotalBytes,
      limitBytes: ROOM_METADATA_SAFE_LIMIT_BYTES,
      pruned: false,
      topOwnedKeys: topOwnedRoomMetadataKeys(metadata),
    };
    logger?.warn?.("[room-metadata-budget]", details);
    const error = new Error(
      `Impossibile compattare i metadata Room sotto ${ROOM_METADATA_HARD_LIMIT_BYTES} B.`,
    );
    error.name = "MetadataRoomBudgetError";
    throw error;
  }
  if (!Object.keys(plan.updates).length) return plan;
  try {
    await api.setMetadata(plan.updates);
  } catch (error) {
    logger?.warn?.("[room-metadata-budget]", {
      domain: "aggregate",
      key: "<owned-room-metadata>",
      totalBeforeBytes: plan.totalBeforeBytes,
      requestedValueBytes: plan.totalBeforeBytes,
      persistedValueBytes: plan.candidateTotalBytes,
      candidateTotalBytes: plan.candidateTotalBytes,
      limitBytes: ROOM_METADATA_SAFE_LIMIT_BYTES,
      pruned: true,
      topOwnedKeys: topOwnedRoomMetadataKeys(metadata),
    });
    throw error;
  }
  logger?.warn?.("[room-metadata-budget]", {
    domain: "aggregate",
    key: "<owned-room-metadata>",
    totalBeforeBytes: plan.totalBeforeBytes,
    requestedValueBytes: plan.totalBeforeBytes,
    persistedValueBytes: plan.candidateTotalBytes,
    candidateTotalBytes: plan.candidateTotalBytes,
    limitBytes: ROOM_METADATA_SAFE_LIMIT_BYTES,
    pruned: plan.pruned,
  });
  return plan;
}

export function clearRoomMetadataKey(api, contract, options = {}) {
  return clearMetadataKey(api, contract, { ...options, scope: "room" });
}
