import { ID } from "./constants.js";

// Contratti dei domini metadata condivisi tra runtime/iframe. Un writer può
// aggiornare soltanto il valore della chiave del proprio contratto.
export const METADATA_OWNERSHIP = Object.freeze({
  INITIATIVE_STATE: Object.freeze({
    key: `${ID}/state`,
    domain: "initiative-state",
    owners: Object.freeze(["initiativeList.js", "contextMenu.js"]),
  }),
  HISTORY: Object.freeze({
    key: `${ID}/history`,
    domain: "history",
    owners: Object.freeze(["history.js"]),
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

async function writeMetadataKey(api, contract, value, { scope, runtime = "unknown" } = {}) {
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
  try {
    await api.setMetadata({ [key]: value });
    reportDiagnostic({
      scope,
      runtime,
      domain,
      key,
      durationMs: timestamp() - startedAt,
      ok: true,
    });
  } catch (error) {
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

export function clearRoomMetadataKey(api, contract, options = {}) {
  return clearMetadataKey(api, contract, { ...options, scope: "room" });
}
