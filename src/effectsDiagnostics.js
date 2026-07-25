import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createEffectsDiagnostics } from "./effectsDiagnosticsCore.js";
import { installEffectsLocalItemsProbe } from "./effectsLocalItemsProbe.js";

const STORAGE_KEY = `${ID}/effects-diagnostics`;
export const EFFECTS_DIAGNOSTICS_CONTROL_CHANNEL = `${ID}/effects-diagnostics-control`;
export const EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL = `${ID}/effects-diagnostics-response`;

function diagnosticsInitiallyEnabled() {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) === "1"; }
  catch { return false; }
}

function createClientId() {
  const path = String(globalThis.location?.pathname || "runtime").replace(/\s+/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${path}:${suffix}`;
}

const store = createEffectsDiagnostics({
  enabled: diagnosticsInitiallyEnabled(),
  clientId: createClientId(),
  logger: (entry) => console.debug("[effects-diag]", entry),
});

function requestBackgroundDiagnostics(command) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      callback(value);
    };
    const unsubscribe = OBR.broadcast.onMessage(EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL, (event) => {
      const data = event?.data;
      if (data?.requestId !== requestId) return;
      if (data.ok) finish(resolve, data.result);
      else finish(reject, new Error(data.error || "Background diagnostics failed"));
    });
    const timer = setTimeout(() => {
      finish(reject, new Error("Background diagnostics timed out"));
    }, 5000);

    OBR.broadcast.sendMessage(EFFECTS_DIAGNOSTICS_CONTROL_CHANNEL, {
      type: "request",
      requestId,
      command,
    }, { destination: "LOCAL" }).catch((error) => finish(reject, error));
  });
}

export const effectsDiagnostics = {
  get enabled() { return store.enabled; },
  get clientId() { return store.clientId; },
  beginReconcile: (...args) => store.beginReconcile(...args),
  sdkCall: (...args) => store.sdkCall(...args),
  sdkResult: (...args) => store.sdkResult(...args),
  sdkError: (...args) => store.sdkError(...args),
  widgetMutation: (...args) => store.widgetMutation(...args),
  lockSkipped: (...args) => store.lockSkipped(...args),
  revisionStale: (...args) => store.revisionStale(...args),
  finishReconcile: (...args) => store.finishReconcile(...args),
  event: (...args) => store.event(...args),
  enable() {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, "1"); } catch {}
    store.enable();
    return `Diagnostica effetti attiva (${store.clientId})`;
  },
  disable() {
    store.disable();
    try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch {}
    return "Diagnostica effetti disattivata";
  },
  clear() {
    store.clear();
    return "Eventi diagnostici effetti cancellati";
  },
  dump: () => store.dump(),
  summary: () => store.summary(),
  report: () => ({ summary: store.summary(), events: store.dump() }),
  export: () => JSON.stringify({ summary: store.summary(), events: store.dump() }, null, 2),
  background: (command = "report") => requestBackgroundDiagnostics(command),
  table() {
    const rows = store.dump().filter((entry) => entry.event === "reconcile:finish");
    console.table(rows);
    return rows.length;
  },
};

globalThis.__tbpEffectsDiagnostics = {
  enable: () => effectsDiagnostics.enable(),
  disable: () => effectsDiagnostics.disable(),
  clear: () => effectsDiagnostics.clear(),
  dump: () => effectsDiagnostics.dump(),
  summary: () => effectsDiagnostics.summary(),
  report: () => effectsDiagnostics.report(),
  export: () => effectsDiagnostics.export(),
  backgroundReset: () => effectsDiagnostics.background("reset"),
  backgroundState: () => effectsDiagnostics.background("state"),
  backgroundReport: () => effectsDiagnostics.background("report"),
  table: () => effectsDiagnostics.table(),
  help: () => ({
    enable: "__tbpEffectsDiagnostics.enable()",
    clear: "__tbpEffectsDiagnostics.clear()",
    summary: "__tbpEffectsDiagnostics.summary()",
    report: "__tbpEffectsDiagnostics.report()",
    export: "__tbpEffectsDiagnostics.export()",
    table: "__tbpEffectsDiagnostics.table()",
    backgroundReset: "await __tbpEffectsDiagnostics.backgroundReset()",
    backgroundState: "await __tbpEffectsDiagnostics.backgroundState()",
    backgroundReport: "await __tbpEffectsDiagnostics.backgroundReport()",
    disable: "__tbpEffectsDiagnostics.disable()",
  }),
};

installEffectsLocalItemsProbe();
