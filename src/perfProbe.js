import { ID } from "./constants.js";

// Opt-in performance probe. Off unless localStorage[PERF_PROBE_STORAGE_KEY] === "1" in this browser profile.
// When off every export is a no-op and the hooks never serialize anything. When on it only observes: it records
// timings and byte counts, never changes a write, a message or its ordering. The iframes of one browser share
// their events through a native BroadcastChannel (same origin, no Owlbear broadcast, no network), so the
// persistent background collects what short-lived popups recorded.
export const PERF_PROBE_STORAGE_KEY = `${ID}/perf-probe`;
const PERF_PROBE_CHANNEL = `${ID}/perf-probe`;
const PERF_PROBE_MAX_EVENTS = 5000;
const KEY_PREFIX = `${ID}/`;

const events = [];
const realm = realmName();
const instance = Math.random().toString(36).slice(2, 8);
let enabled = readFlag();
let channel = null;
let obrRef = null;
let booted = false;
let activeContext = null;

function readFlag() {
  try { return globalThis.localStorage?.getItem(PERF_PROBE_STORAGE_KEY) === "1"; }
  catch { return false; }
}

function writeFlag(value) {
  try {
    if (value) globalThis.localStorage?.setItem(PERF_PROBE_STORAGE_KEY, "1");
    else globalThis.localStorage?.removeItem(PERF_PROBE_STORAGE_KEY);
  } catch {}
}

function realmName() {
  const pathname = String(globalThis.location?.pathname || "");
  const page = pathname.split("/").pop()?.replace(/\.html$/u, "") || "";
  return page || (pathname ? "index" : "node");
}

function round(value) {
  return Math.round(Number(value) * 10) / 10;
}

export function perfProbeEnabled() {
  return enabled;
}

export function perfNow() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

export function perfSince(startedAt) {
  return round(perfNow() - startedAt);
}

function epochMs() {
  const perf = globalThis.performance;
  return perf && Number.isFinite(perf.timeOrigin) ? perf.timeOrigin + perf.now() : Date.now();
}

export function perfJsonBytes(value) {
  let serialized = "";
  try { serialized = JSON.stringify(value) || ""; }
  catch { return 0; }
  return typeof globalThis.TextEncoder === "function"
    ? new globalThis.TextEncoder().encode(serialized).length
    : serialized.length;
}

function shortKey(key) {
  const text = String(key || "");
  return text.startsWith(KEY_PREFIX) ? text.slice(KEY_PREFIX.length) : text;
}

export function perfKeySizes(metadata, limit = Infinity) {
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata)
    .map(([key, value]) => ({ key: shortKey(key), bytes: perfJsonBytes(value) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function store(event) {
  events.push(event);
  if (events.length > PERF_PROBE_MAX_EVENTS) events.splice(0, events.length - PERF_PROBE_MAX_EVENTS);
}

function ensureChannel() {
  if (channel || typeof globalThis.BroadcastChannel !== "function") return channel;
  try {
    channel = new globalThis.BroadcastChannel(PERF_PROBE_CHANNEL);
    channel.unref?.();
    channel.onmessage = (message) => {
      const event = message?.data;
      if (event && typeof event === "object" && typeof event.type === "string") store(event);
    };
  } catch {
    channel = null;
  }
  return channel;
}

// The effects command being executed in this realm: events recorded meanwhile carry its id, including SDK calls
// and writes of other background controllers that run in between (the coordinator itself is serial).
export function perfSetContext(context) {
  if (!enabled) return;
  activeContext = context && context.commandId ? context : null;
}

export function perfRecord(type, detail = {}) {
  if (!enabled) return;
  const event = {
    type,
    realm,
    instance,
    at: Math.round(epochMs()),
    ...(activeContext ? { cmd: activeContext.commandId, cmdKind: activeContext.commandKind || null } : {}),
    ...detail,
  };
  store(event);
  try { ensureChannel()?.postMessage(event); }
  catch {}
}

function observeEntries(type, onEntry) {
  if (typeof globalThis.PerformanceObserver !== "function") return;
  try {
    new globalThis.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) onEntry(entry);
    }).observe({ type, buffered: true });
  } catch {}
}

function recordBootResources() {
  const perf = globalThis.performance;
  if (typeof perf?.getEntriesByType !== "function") return;
  const navigation = perf.getEntriesByType("navigation")?.[0] || null;
  const scripts = perf.getEntriesByType("resource")
    .filter((entry) => /\.(?:js|ts)(?:\?|$)/u.test(String(entry.name || "")));
  perfRecord("boot-resources", {
    scripts: scripts.length,
    cachedScripts: scripts.filter((entry) => entry.transferSize === 0).length,
    transferBytes: scripts.reduce((sum, entry) => sum + (Number(entry.transferSize) || 0), 0),
    decodedBytes: scripts.reduce((sum, entry) => sum + (Number(entry.decodedBodySize) || 0), 0),
    htmlResponseEndMs: navigation ? round(navigation.responseEnd) : null,
  });
}

function observeSceneTraffic(obr) {
  // One listener per client, in the background only: what a client receives for every write.
  try {
    obr.scene?.onMetadataChange?.((metadata) => {
      perfRecord("scene-metadata-received", {
        bytes: perfJsonBytes(metadata),
        topKeys: perfKeySizes(metadata, 4),
      });
    });
    obr.scene?.items?.onChange?.((items) => {
      perfRecord("scene-items-received", {
        items: Array.isArray(items) ? items.length : 0,
        bytes: perfJsonBytes(items),
      });
    });
    obr.room?.onMetadataChange?.((metadata) => {
      perfRecord("room-metadata-received", { bytes: perfJsonBytes(metadata) });
    });
  } catch {}
}

const SDK_METHODS = Object.freeze([
  ["scene.items", ["getItems", "updateItems", "addItems", "deleteItems", "getItemBounds"]],
  ["scene.local", ["getItems", "updateItems", "addItems", "deleteItems"]],
  ["scene", ["getMetadata", "setMetadata"]],
  ["room", ["getMetadata", "setMetadata"]],
  ["broadcast", ["sendMessage"]],
]);

function sdkTarget(obr, path) {
  return path.split(".").reduce((target, key) => target?.[key], obr);
}

// Background only: times the SDK calls with a pass-through wrapper that returns the original promise unchanged.
// updateItems reads its items through getItems synchronously before its first await: that inner call is marked
// nested so its time is not counted twice.
function observeSdkCalls(obr) {
  let updating = false;
  for (const [path, methods] of SDK_METHODS) {
    const target = sdkTarget(obr, path);
    if (!target) continue;
    for (const method of methods) {
      const original = target[method];
      if (typeof original !== "function" || original.__tbpPerfWrapped) continue;
      const name = `${path}.${method}`;
      const wrapped = function perfObservedSdkCall(...args) {
        const nested = updating && method === "getItems";
        const startedAt = perfNow();
        const ids = Array.isArray(args[0]) ? args[0].length : null;
        if (method === "updateItems") updating = true;
        let result;
        try {
          result = original.apply(this, args);
        } catch (error) {
          perfRecord("sdk-call", { method: name, ids, nested, ok: false, durationMs: perfSince(startedAt) });
          throw error;
        } finally {
          if (method === "updateItems") updating = false;
        }
        Promise.resolve(result).then(
          () => perfRecord("sdk-call", { method: name, ids, nested, ok: true, durationMs: perfSince(startedAt) }),
          () => perfRecord("sdk-call", { method: name, ids, nested, ok: false, durationMs: perfSince(startedAt) }),
        );
        return result;
      };
      wrapped.__tbpPerfWrapped = true;
      try { target[method] = wrapped; }
      catch {}
    }
  }
}

// Call once at the top level of a page entry, right after its imports: at that point every static
// import of the page has been fetched and evaluated.
export function perfBootPage(obr, { observeTraffic = false, observeSdk = false } = {}) {
  obrRef ||= obr || null;
  if (!enabled || booted) return;
  booted = true;
  ensureChannel();
  // The measurement session's tracker side (src/perfSessionRunner.js): it acts only on an explicit command from the
  // background's console, never by itself.
  if (realm === "index") void import("./perfSessionRunner.js").then((module) => module.installPerfRunnerRemote()).catch(() => {});
  // The room check of the fluidity lots (src/fluidityRoomCheck.js): these pages answer its snapshots and commands.
  if (["index", "turn-notice", "boss-actions"].includes(realm)) {
    void import("./fluidityRoomCheck.js").then((module) => module.installFluidityCheckRemote({ realm, obr })).catch(() => {});
  }
  if (observeSdk && obr) observeSdkCalls(obr);
  perfRecord("boot", { stage: "module", sinceNavigationMs: round(perfNow()) });
  recordBootResources();
  observeEntries("paint", (entry) => {
    if (entry.name !== "first-contentful-paint") return;
    perfRecord("boot", { stage: "first-contentful-paint", sinceNavigationMs: round(entry.startTime) });
  });
  observeEntries("longtask", (entry) => {
    perfRecord("long-task", { durationMs: round(entry.duration), startMs: round(entry.startTime) });
  });
  try {
    obr?.onReady?.(() => {
      perfRecord("boot", { stage: "ready", sinceNavigationMs: round(perfNow()) });
      if (observeTraffic) observeSceneTraffic(obr);
    });
  } catch {}
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function numbers(list, field) {
  return list.map((event) => Number(event[field])).filter(Number.isFinite);
}

function stats(list, field) {
  const values = numbers(list, field);
  if (!values.length) return { p50: null, p95: null, max: null };
  return { p50: round(percentile(values, 0.5)), p95: round(percentile(values, 0.95)), max: round(Math.max(...values)) };
}

function sum(list, field) {
  return numbers(list, field).reduce((total, value) => total + value, 0);
}

function groupBy(list, keyOf) {
  const groups = new Map();
  for (const event of list) {
    const key = keyOf(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.entries()];
}

function ofType(list, type) {
  return list.filter((event) => event.type === type);
}

export function summarizePerfEvents(list = events) {
  const writes = groupBy(ofType(list, "metadata-write"), (event) => `${event.scope}:${shortKey(event.key)}`)
    .map(([key, group]) => ({
      key,
      writes: group.length,
      failed: group.filter((event) => event.ok === false).length,
      bytesTotal: sum(group, "bytes"),
      bytesMax: Math.max(0, ...numbers(group, "bytes")),
      setMetadataMs: stats(group, "setMetadataMs"),
    }))
    .sort((a, b) => b.bytesTotal - a.bytesTotal);
  const received = groupBy(
    list.filter((event) => /-received$/u.test(event.type)),
    (event) => event.type,
  ).map(([type, group]) => ({
    type,
    events: group.length,
    bytesTotal: sum(group, "bytes"),
    bytesMax: Math.max(0, ...numbers(group, "bytes")),
  }));
  const transport = groupBy(ofType(list, "effects-transport"), (event) => `${event.kind}:${event.commandKind || "-"}`)
    .map(([key, group]) => ({
      key,
      requests: group.length,
      failed: group.filter((event) => event.status === "failed").length,
      roundTripMs: stats(group, "durationMs"),
    }));
  const commands = groupBy(ofType(list, "effects-command"), (event) => `${event.kind}:${event.commandKind || "-"}`)
    .map(([key, group]) => ({
      key,
      commands: group.length,
      handleMs: stats(group, "handleMs"),
      totalMs: stats(group, "totalMs"),
      responseBytesMax: Math.max(0, ...numbers(group, "responseBytes")),
      chunksMax: Math.max(0, ...numbers(group, "chunks")),
    }));
  const historyActions = groupBy(ofType(list, "history-action"), (event) => event.kind || "-")
    .map(([kind, group]) => ({
      kind,
      actions: group.length,
      totalMs: stats(group, "totalMs"),
      actionMs: stats(group, "actionMs"),
      appendMs: stats(group, "appendMs"),
      entryBytesMax: Math.max(0, ...numbers(group, "entryBytes")),
    }));
  const historyReads = ofType(list, "history-read");
  const boot = groupBy(ofType(list, "boot"), (event) => `${event.realm}:${event.stage}`)
    .map(([key, group]) => ({ key, samples: group.length, sinceNavigationMs: stats(group, "sinceNavigationMs") }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const resources = groupBy(ofType(list, "boot-resources"), (event) => event.realm)
    .map(([page, group]) => ({
      page,
      samples: group.length,
      scripts: Math.max(0, ...numbers(group, "scripts")),
      cachedScripts: Math.min(...numbers(group, "cachedScripts")),
      transferBytesMax: Math.max(0, ...numbers(group, "transferBytes")),
      decodedBytesMax: Math.max(0, ...numbers(group, "decodedBytes")),
    }));
  const longTasks = groupBy(ofType(list, "long-task"), (event) => event.realm)
    .map(([page, group]) => ({ page, tasks: group.length, totalMs: round(sum(group, "durationMs")), maxMs: stats(group, "durationMs").max }));
  const commandEvents = ofType(list, "effects-command").filter((event) => event.kind === "apply" && event.commandId);
  const phasesByCommand = groupBy(ofType(list, "effects-phase"), (event) => event.commandId);
  const phaseMap = new Map(phasesByCommand);
  const sdkByCommand = new Map(groupBy(
    ofType(list, "sdk-call").filter((event) => event.cmd && !event.nested),
    (event) => event.cmd,
  ));
  const effectsPhases = groupBy(commandEvents, (event) => event.commandKind || "-").map(([kind, group]) => {
    const rows = group.map((command) => {
      const phases = phaseMap.get(command.commandId) || [];
      const byPhase = {};
      for (const phase of phases) byPhase[phase.phase] = (byPhase[phase.phase] || 0) + (Number(phase.durationMs) || 0);
      const phaseTotal = Object.values(byPhase).reduce((total, value) => total + value, 0);
      const sdkCalls = sdkByCommand.get(command.commandId) || [];
      return {
        ...byPhase,
        outsidePhases: Math.max(0, (Number(command.handleMs) || 0) - phaseTotal),
        sdkCalls: sdkCalls.length,
        sdkMs: sum(sdkCalls, "durationMs"),
      };
    });
    const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return {
      kind,
      commands: group.length,
      handleMs: stats(group, "handleMs"),
      ...Object.fromEntries(names.map((name) => [name, stats(rows, name).p50])),
    };
  });
  const sdkCalls = groupBy(ofType(list, "sdk-call").filter((event) => !event.nested), (event) => event.method)
    .map(([method, group]) => ({
      method,
      calls: group.length,
      duringCommands: group.filter((event) => event.cmd).length,
      failed: group.filter((event) => event.ok === false).length,
      totalMs: round(sum(group, "durationMs")),
      durationMs: stats(group, "durationMs"),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
  const ownerPhases = new Map(groupBy(ofType(list, "history-owner-phase"), (event) => event.commandId));
  const historyOwner = groupBy(ofType(list, "history-owner-command"), (event) => event.kind || "-").map(([kind, group]) => {
    const rows = group.map((command) => {
      const byPhase = {};
      for (const phase of ownerPhases.get(command.commandId) || []) {
        byPhase[phase.phase] = (byPhase[phase.phase] || 0) + (Number(phase.durationMs) || 0);
      }
      const phaseTotal = Object.values(byPhase).reduce((total, value) => total + value, 0);
      return { ...byPhase, queueAndOther: Math.max(0, (Number(command.handledMs) || 0) - phaseTotal) };
    });
    const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return {
      kind,
      commands: group.length,
      handledMs: stats(group, "handledMs"),
      ...Object.fromEntries(names.map((name) => [name, stats(rows, name).p50])),
    };
  });
  return {
    events: list.length,
    effectsPhases,
    sdkCalls,
    historyOwner,
    metadataWrites: writes,
    received,
    transport,
    commands,
    historyActions,
    historyReads: {
      reads: historyReads.length,
      durationMs: stats(historyReads, "durationMs"),
      sceneMetadataBytesMax: Math.max(0, ...numbers(historyReads, "sceneMetadataBytes")),
      historyBytesMax: Math.max(0, ...numbers(historyReads, "historyBytes")),
      historyEntriesMax: Math.max(0, ...numbers(historyReads, "historyEntries")),
    },
    recoveryWrites: groupBy(ofType(list, "recovery-write"), (event) => event.phase || "-")
      .map(([phase, group]) => ({ phase, writes: group.length, skipped: group.filter((event) => event.skipped).length })),
    rateLimited: ofType(list, "broadcast-rate-limited").length,
    boot,
    resources,
    longTasks,
  };
}

function flattenStats(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).flatMap(([key, value]) => (
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).map(([inner, innerValue]) => [`${key}.${inner}`, innerValue])
      : [[key, value]]
  ))));
}

async function metadataSizes() {
  if (!obrRef) throw new Error("perf-probe: pagina senza OBR (usa la console del background o del tracker).");
  const [scene, room] = await Promise.all([
    obrRef.scene.getMetadata(),
    obrRef.room.getMetadata(),
  ]);
  return {
    sceneBytes: perfJsonBytes(scene),
    roomBytes: perfJsonBytes(room),
    scene: perfKeySizes(scene),
    room: perfKeySizes(room),
  };
}

globalThis.__tbpPerf = {
  enable() {
    enabled = true;
    writeFlag(true);
    ensureChannel();
    return "Probe prestazioni attivo: ricarica le finestre di Owlbear per misurare anche l'avvio.";
  },
  disable() {
    enabled = false;
    writeFlag(false);
    return "Probe prestazioni disattivato.";
  },
  get enabled() {
    return enabled;
  },
  summary(list = events) {
    return summarizePerfEvents(list);
  },
  report(list = events) {
    const summary = summarizePerfEvents(list);
    for (const [name, value] of Object.entries(summary)) {
      if (Array.isArray(value) && value.length) {
        console.log(`[perf] ${name}`);
        console.table(flattenStats(value));
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        console.log(`[perf] ${name}`, value);
      }
    }
    return summary;
  },
  export(label = "") {
    return JSON.stringify({
      schema: 1,
      label: String(label || ""),
      exportedAt: new Date().toISOString(),
      collector: { realm, instance },
      userAgent: String(globalThis.navigator?.userAgent || ""),
      summary: summarizePerfEvents(events),
      events,
    });
  },
  reset() {
    events.splice(0, events.length);
    return "Eventi azzerati.";
  },
  metadataSizes,
  events,
  // Dev tool (docs/MISURA_CONSOLE_MOSTRI.md), from the background's console: the monster-console measurement blocks.
  async runMonsterSession(options = {}) {
    if (realm !== "background") return "Esegui dal contesto background.html della Console.";
    const { runMonsterSession } = await import("./perfSessionRunner.js");
    return runMonsterSession({ probe: globalThis.__tbpPerf, obr: obrRef, ...options });
  },
  // Dev tool (docs/PROVA_STANZA_FLUIDITA.md): the GM's guided room check, from the background's console.
  async runFluidityCheck(options = {}) {
    if (realm !== "background") return "Esegui dal contesto background.html della Console.";
    const { runFluidityCheck } = await import("./fluidityRoomCheck.js");
    return runFluidityCheck({ probe: globalThis.__tbpPerf, obr: obrRef, ...options });
  },
  // The table screen's side of the same check, started there before the GM's run.
  async watchFluidity(options = {}) {
    if (realm !== "background") return "Esegui dal contesto background.html della Console.";
    const { watchFluidity } = await import("./fluidityRoomCheck.js");
    return watchFluidity({ probe: globalThis.__tbpPerf, obr: obrRef, ...options });
  },
  async stopSession() {
    const { stopPerfSession } = await import("./perfSessionRunner.js");
    return stopPerfSession();
  },
};
