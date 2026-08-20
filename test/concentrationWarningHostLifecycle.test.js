import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ID = "com.thebigpicture.initiative";
const CHANNEL = `${ID}/concentration-warning`;
const MODAL_ID = `${ID}/concentration-warning-modal`;
const UI_CHANNEL = `${CHANNEL}/ui`;
const HOST_CHANNEL = `${CHANNEL}/host`;

const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createHostHarness({ initialEpoch = 10, holdInitialCleanup = false } = {}) {
  const start = initiativeSource.indexOf("let __concentrationWarningListenerMounted");
  const end = initiativeSource.indexOf("let __turnNoticeSequence", start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  let currentEpoch = initialEpoch;
  const listeners = new Map();
  const openRequests = [];
  const setHeightRequests = [];
  const uiRequests = [];
  const closeIds = [];
  const openIds = new Set();
  const closeGate = holdInitialCleanup ? deferred() : null;

  const OBR = {
    modal: {
      close() {
        return closeGate?.promise || Promise.resolve();
      },
    },
    popover: {
      close(id) {
        closeIds.push(String(id));
        return (closeGate?.promise || Promise.resolve()).then(() => {
          openIds.delete(String(id));
        });
      },
      open(options) {
        const request = { options, gate: deferred() };
        openRequests.push(request);
        return request.gate.promise.then(() => {
          openIds.add(String(options.id));
        });
      },
      setHeight(id, height) {
        const request = { id: String(id), height, gate: deferred() };
        setHeightRequests.push(request);
        return request.gate.promise;
      },
    },
    viewport: {
      getWidth: async () => 900,
      getHeight: async () => 700,
    },
    broadcast: {
      onMessage(channel, listener) {
        listeners.set(channel, listener);
        return () => listeners.delete(channel);
      },
      sendMessage(channel, data) {
        if (channel === UI_CHANNEL && data?.type === "update-concentration-warnings") {
          uiRequests.push(structuredClone(data));
        }
        return Promise.resolve();
      },
    },
  };

  const factory = new Function(
    "OBR",
    "CONCENTRATION_WARNING_CHANNEL",
    "CONCENTRATION_WARNING_MODAL_ID",
    "CONCENTRATION_WARNING_UI_CHANNEL",
    "CONCENTRATION_WARNING_HOST_CHANNEL",
    "isCurrentSceneEpoch",
    "currentSceneEpoch",
    `${initiativeSource.slice(start, end)}
return {
  mountConcentrationWarningBroadcast,
  receiveRuntimeReset: __resetConcentrationWarningRuntime,
  receiveWarningMap: __concentrationWarningsByActivationId,
  dismissedCauseIds: __dismissedConcentrationWarningCauseIds,
  state: () => ({
    generation: __concentrationWarningRuntimeGeneration,
    popoverOpen: __concentrationWarningPopoverOpen,
    uiReady: __concentrationWarningUiReady,
    pumpRunning: __concentrationWarningPumpRunning,
    pumpRequested: __concentrationWarningPumpRequested,
    cleanupPending: !!__concentrationWarningCleanupPromise,
  }),
};`,
  );
  const runtime = factory(
    OBR,
    CHANNEL,
    MODAL_ID,
    UI_CHANNEL,
    HOST_CHANNEL,
    (epoch) => Number(epoch) === currentEpoch,
    () => currentEpoch,
  );
  runtime.mountConcentrationWarningBroadcast();

  return {
    runtime,
    openRequests,
    setHeightRequests,
    closeIds,
    openIds,
    uiRequests,
    releaseInitialCleanup() {
      closeGate?.resolve();
    },
    resolveOpen(index) {
      openRequests[index]?.gate.resolve();
    },
    resolveSetHeight(index) {
      setHeightRequests[index]?.gate.resolve();
    },
    resolveAllSetHeights() {
      for (const request of setHeightRequests) request.gate.resolve();
    },
    receive(payload) {
      const listener = listeners.get(CHANNEL);
      assert.ok(listener, "concentration warning listener mounted");
      listener({ data: structuredClone(payload) });
    },
    receiveHost(payload) {
      const listener = listeners.get(HOST_CHANNEL);
      assert.ok(listener, "concentration warning host listener mounted");
      listener({ data: structuredClone(payload) });
    },
    setEpoch(epoch) {
      currentEpoch = epoch;
    },
    reset() {
      runtime.receiveRuntimeReset();
    },
    async flush(turns = 8) {
      for (let index = 0; index < turns; index += 1) {
        await Promise.resolve();
      }
    },
    scope(index) {
      const url = new URL(openRequests[index].options.url, "https://example.test");
      return {
        sceneEpoch: Number(url.searchParams.get("sceneEpoch")),
        runtimeGeneration: Number(url.searchParams.get("runtimeGeneration")),
        runtimeSession: url.searchParams.get("runtimeSession"),
      };
    },
    state() {
      return runtime.state();
    },
  };
}

function warning(causeHistoryEntryId, activationId) {
  return {
    name: "Caster",
    damage: 10,
    dc: 15,
    notice: { activationId, causeHistoryEntryId },
  };
}

function show(causeHistoryEntryId, sceneEpoch, activationId) {
  return {
    type: "show-concentration-warning",
    warnings: [warning(causeHistoryEntryId, activationId)],
    createdAt: 100,
    sceneEpoch,
  };
}

function dismiss(historyEntryId, sceneEpoch) {
  return {
    type: "dismiss-concentration-warnings-by-history",
    historyEntryIds: [historyEntryId],
    sceneEpoch,
  };
}

function control(type, scope, extra = {}) {
  return { type, ...scope, ...extra };
}

test("reset pulisce map, tombstone, popup, UI e pump della generazione precedente", async () => {
  const host = createHostHarness();
  host.receive(show("cause-a", 10, "activation-a"));
  await host.flush();
  host.resolveOpen(0);
  await host.flush();
  const scope = host.scope(0);
  host.receiveHost(control("concentration-warning-ready", scope));
  await host.flush();
  host.receive(show("cause-c", 10, "activation-c"));
  await host.flush();
  host.receive(show("cause-d", 10, "activation-d"));
  host.receive(dismiss("cause-b", 10));

  assert.equal(host.state().popoverOpen, true);
  assert.equal(host.state().uiReady, true);
  assert.equal(host.state().pumpRequested, true);
  assert.ok(host.runtime.receiveWarningMap.size >= 2);
  assert.ok(host.runtime.dismissedCauseIds.has("cause-b"));

  const generationBefore = host.state().generation;
  host.reset();
  const state = host.state();
  assert.equal(state.generation, generationBefore + 1);
  assert.equal(host.runtime.receiveWarningMap.size, 0);
  assert.equal(host.runtime.dismissedCauseIds.size, 0);
  assert.equal(state.popoverOpen, false);
  assert.equal(state.uiReady, false);
  assert.equal(state.pumpRequested, false);
  assert.equal(state.pumpRunning, false);
  assert.equal(state.cleanupPending, false);
  await host.flush();
  assert.ok(host.closeIds.includes(host.openRequests[0].options.id));
});

test("un pump queued prima del reset non apre warning dopo la nuova generazione", async () => {
  const host = createHostHarness({ holdInitialCleanup: true });
  host.receive(show("cause-a", 10, "activation-a"));
  await host.flush();
  assert.equal(host.openRequests.length, 0);
  assert.equal(host.state().pumpRunning, true);
  assert.equal(host.state().pumpRequested, true);

  host.reset();
  assert.equal(host.state().pumpRunning, false);
  host.releaseInitialCleanup();
  await host.flush();

  assert.equal(host.openRequests.length, 0);
  assert.equal(host.runtime.receiveWarningMap.size, 0);
  assert.equal(host.state().pumpRunning, false);
});

test("open tardiva chiude solo la sessione stale e non può spegnere il pump nuovo", async () => {
  const host = createHostHarness();
  host.receive(show("cause-a", 10, "same-activation"));
  await host.flush();
  const staleId = host.openRequests[0].options.id;

  host.reset();
  host.setEpoch(11);
  host.receive(show("cause-b", 11, "same-activation"));
  await host.flush();
  assert.equal(host.openRequests.length, 2);
  assert.equal(host.state().pumpRunning, true);

  host.resolveOpen(0);
  await host.flush();
  assert.ok(host.closeIds.includes(staleId));
  assert.equal(host.state().pumpRunning, true);
  assert.equal(host.openIds.has(staleId), false);

  const currentId = host.openRequests[1].options.id;
  host.resolveOpen(1);
  await host.flush();
  assert.equal(host.state().popoverOpen, true);
  assert.equal(host.openIds.has(currentId), true);
  assert.equal(host.openIds.has(staleId), false);
  assert.equal(host.closeIds.includes(currentId), false);
});

test("setHeight iniziato prima del reset non invia update alla sessione nuova", async () => {
  const host = createHostHarness();
  host.receive(show("cause-a", 10, "activation-a"));
  await host.flush();
  host.resolveOpen(0);
  await host.flush();
  const scope = host.scope(0);
  host.receiveHost(control("concentration-warning-ready", scope));
  await host.flush();
  host.resolveAllSetHeights();
  await host.flush();
  host.uiRequests.length = 0;

  host.receive(show("cause-b", 10, "activation-b"));
  await host.flush();
  assert.ok(host.setHeightRequests.length >= 2);
  const beforeReset = host.uiRequests.length;
  host.reset();
  host.setEpoch(11);
  host.resolveAllSetHeights();
  await host.flush();

  assert.equal(host.uiRequests.length, beforeReset);
  assert.equal(host.runtime.receiveWarningMap.size, 0);
});

test("ready/resolved/closed di un iframe vecchio sono ignorati dalla nuova generazione", async () => {
  const host = createHostHarness();
  host.receive(show("cause-a", 10, "same-activation"));
  await host.flush();
  host.resolveOpen(0);
  await host.flush();
  const staleScope = host.scope(0);

  host.reset();
  host.setEpoch(11);
  host.receive(show("cause-b", 11, "same-activation"));
  await host.flush();
  host.resolveOpen(1);
  await host.flush();
  const currentScope = host.scope(1);
  host.receiveHost(control("concentration-warning-ready", currentScope));
  await host.flush();
  assert.equal(host.state().uiReady, true);
  assert.equal(host.runtime.receiveWarningMap.size, 1);

  host.receiveHost(control("concentration-warning-ready", staleScope));
  host.receiveHost(control("concentration-warning-resolved", staleScope, {
    activationId: "same-activation",
  }));
  host.receiveHost(control("concentration-warning-closed", staleScope));

  assert.equal(host.state().uiReady, true);
  assert.equal(host.state().popoverOpen, true);
  assert.equal(host.runtime.receiveWarningMap.size, 1);
  assert.equal(
    host.runtime.receiveWarningMap.get("same-activation")?.notice?.causeHistoryEntryId,
    "cause-b",
  );
});

test("dopo reset il runtime A/B/A usa epoch successive e parte pulito", async () => {
  const host = createHostHarness({ initialEpoch: 10 });
  host.receive(show("cause-a-old", 10, "same-activation"));
  await host.flush();
  host.resolveOpen(0);
  await host.flush();

  host.receive(dismiss("cause-a-old", 10));
  assert.ok(host.runtime.dismissedCauseIds.has("cause-a-old"));
  host.reset();
  host.setEpoch(11);
  host.receive(show("cause-b", 11, "same-activation"));
  await host.flush();
  host.resolveOpen(1);
  await host.flush();

  host.reset();
  host.setEpoch(12);
  host.receive(show("cause-a-new", 12, "same-activation"));
  await host.flush();
  host.resolveOpen(2);
  await host.flush();

  assert.equal(host.state().generation, 2);
  assert.equal(host.runtime.dismissedCauseIds.size, 0);
  assert.equal(host.runtime.receiveWarningMap.size, 1);
  assert.equal(
    host.runtime.receiveWarningMap.get("same-activation")?.notice?.causeHistoryEntryId,
    "cause-a-new",
  );
  assert.equal(host.state().popoverOpen, true);
});

