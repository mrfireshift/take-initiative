const SDK_METHODS = Object.freeze([
  "getItems",
  "getItemBounds",
  "addItems",
  "updateItems",
  "deleteItems",
]);

const WIDGET_MUTATIONS = Object.freeze(["added", "updated", "deleted"]);

function zeroMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function createSdkCounters() {
  return {
    calls: zeroMap(SDK_METHODS),
    requestedItems: zeroMap(SDK_METHODS),
    returnedItems: zeroMap(SDK_METHODS),
    errors: zeroMap(SDK_METHODS),
  };
}

function createWidgetCounters() {
  return zeroMap(WIDGET_MUTATIONS);
}

function createEngineCounters() {
  return {
    started: 0,
    finished: 0,
    failed: 0,
    noChange: 0,
    lockSkipped: 0,
    staleRevisions: 0,
    duration: { count: 0, totalMs: 0, maxMs: 0 },
    sdk: createSdkCounters(),
    widgets: createWidgetCounters(),
  };
}

function createAggregate() {
  return {
    eventsTotal: 0,
    started: 0,
    finished: 0,
    failed: 0,
    noChange: 0,
    lockSkipped: 0,
    staleRevisions: 0,
    duration: { count: 0, totalMs: 0, maxMs: 0 },
    sdk: createSdkCounters(),
    widgets: createWidgetCounters(),
    engines: {},
  };
}

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function rounded(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function engineAggregate(aggregate, engine) {
  const key = String(engine || "unknown");
  aggregate.engines[key] ||= createEngineCounters();
  return aggregate.engines[key];
}

function addSdkCounter(target, section, method, amount) {
  target.sdk[section][method] = (target.sdk[section][method] || 0) + safeCount(amount);
}

export function createEffectsDiagnostics({
  enabled = false,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  maxEvents = 1500,
  clientId = "effects-client",
  logger = null,
} = {}) {
  let diagnosticsEnabled = enabled === true;
  let sequence = 0;
  let reconcileSequence = 0;
  let aggregate = createAggregate();
  const events = [];

  function emit(event, detail = {}) {
    if (!diagnosticsEnabled) return null;
    const entry = {
      seq: ++sequence,
      ms: rounded(now()),
      clientId,
      event,
      ...detail,
    };
    events.push(entry);
    aggregate.eventsTotal += 1;
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
    }
    if (typeof logger === "function") logger(entry);
    return entry;
  }

  function beginReconcile(engine, detail = {}) {
    if (!diagnosticsEnabled) return null;
    const engineName = String(engine || "unknown");
    const session = {
      id: `${engineName}:${++reconcileSequence}`,
      engine: engineName,
      revision: Number(detail.revision) || 0,
      startedAt: Number(now()) || 0,
      sdk: createSdkCounters(),
      widgets: createWidgetCounters(),
      lockSkipped: 0,
      staleRevision: false,
      finished: false,
    };
    aggregate.started += 1;
    engineAggregate(aggregate, engineName).started += 1;
    emit("reconcile:start", {
      reconcileId: session.id,
      engine: engineName,
      ...detail,
    });
    return session;
  }

  function sdkCall(session, method, { requestedItems = 0 } = {}) {
    if (!session || session.finished || !SDK_METHODS.includes(method)) return;
    session.sdk.calls[method] += 1;
    session.sdk.requestedItems[method] += safeCount(requestedItems);
    const engine = engineAggregate(aggregate, session.engine);
    addSdkCounter(aggregate, "calls", method, 1);
    addSdkCounter(engine, "calls", method, 1);
    addSdkCounter(aggregate, "requestedItems", method, requestedItems);
    addSdkCounter(engine, "requestedItems", method, requestedItems);
  }

  function sdkResult(session, method, { returnedItems = 0 } = {}) {
    if (!session || session.finished || !SDK_METHODS.includes(method)) return;
    session.sdk.returnedItems[method] += safeCount(returnedItems);
    const engine = engineAggregate(aggregate, session.engine);
    addSdkCounter(aggregate, "returnedItems", method, returnedItems);
    addSdkCounter(engine, "returnedItems", method, returnedItems);
  }

  function sdkError(session, method) {
    if (!session || session.finished || !SDK_METHODS.includes(method)) return;
    session.sdk.errors[method] += 1;
    const engine = engineAggregate(aggregate, session.engine);
    addSdkCounter(aggregate, "errors", method, 1);
    addSdkCounter(engine, "errors", method, 1);
  }

  function widgetMutation(session, action, count) {
    if (!session || session.finished || !WIDGET_MUTATIONS.includes(action)) return;
    const amount = safeCount(count);
    session.widgets[action] += amount;
    aggregate.widgets[action] += amount;
    engineAggregate(aggregate, session.engine).widgets[action] += amount;
  }

  function lockSkipped(session, detail = {}) {
    if (!session || session.finished) return;
    session.lockSkipped += 1;
    aggregate.lockSkipped += 1;
    engineAggregate(aggregate, session.engine).lockSkipped += 1;
    emit("reconcile:lock-skipped", {
      reconcileId: session.id,
      engine: session.engine,
      revision: session.revision,
      ...detail,
    });
  }

  function revisionStale(session, detail = {}) {
    if (!session || session.finished || session.staleRevision) return;
    session.staleRevision = true;
    aggregate.staleRevisions += 1;
    engineAggregate(aggregate, session.engine).staleRevisions += 1;
    emit("reconcile:revision-stale", {
      reconcileId: session.id,
      engine: session.engine,
      revision: session.revision,
      ...detail,
    });
  }

  function finishReconcile(session, detail = {}) {
    if (!session || session.finished) return null;
    session.finished = true;
    const durationMs = Math.max(0, (Number(now()) || 0) - session.startedAt);
    const outcome = String(detail.outcome || "completed");
    const engine = engineAggregate(aggregate, session.engine);

    aggregate.finished += 1;
    engine.finished += 1;
    aggregate.duration.count += 1;
    aggregate.duration.totalMs += durationMs;
    aggregate.duration.maxMs = Math.max(aggregate.duration.maxMs, durationMs);
    engine.duration.count += 1;
    engine.duration.totalMs += durationMs;
    engine.duration.maxMs = Math.max(engine.duration.maxMs, durationMs);

    if (outcome === "failed") {
      aggregate.failed += 1;
      engine.failed += 1;
    }
    if (outcome === "no-change") {
      aggregate.noChange += 1;
      engine.noChange += 1;
    }

    return emit("reconcile:finish", {
      reconcileId: session.id,
      engine: session.engine,
      revision: session.revision,
      durationMs: rounded(durationMs),
      outcome,
      staleRevision: session.staleRevision,
      lockSkipped: session.lockSkipped,
      sdk: clone(session.sdk),
      widgets: clone(session.widgets),
      ...detail,
    });
  }

  function durationSummary(duration) {
    return {
      count: duration.count,
      totalMs: rounded(duration.totalMs),
      averageMs: duration.count ? rounded(duration.totalMs / duration.count) : 0,
      maxMs: rounded(duration.maxMs),
    };
  }

  function summary() {
    const result = clone(aggregate);
    result.enabled = diagnosticsEnabled;
    result.clientId = clientId;
    result.eventsCaptured = events.length;
    result.duration = durationSummary(aggregate.duration);
    for (const counters of Object.values(result.engines)) {
      counters.duration = durationSummary(counters.duration);
    }
    const first = events[0];
    const last = events[events.length - 1];
    result.captureDurationMs = first && last ? rounded(last.ms - first.ms) : 0;
    return result;
  }

  function clear() {
    events.length = 0;
    sequence = 0;
    reconcileSequence = 0;
    aggregate = createAggregate();
  }

  return {
    get enabled() { return diagnosticsEnabled; },
    get clientId() { return clientId; },
    enable() {
      diagnosticsEnabled = true;
      emit("diagnostics:enabled");
    },
    disable() {
      emit("diagnostics:disabled");
      diagnosticsEnabled = false;
    },
    clear,
    dump: () => events.map((entry) => clone(entry)),
    summary,
    beginReconcile,
    sdkCall,
    sdkResult,
    sdkError,
    widgetMutation,
    lockSkipped,
    revisionStale,
    finishReconcile,
    event: emit,
  };
}

