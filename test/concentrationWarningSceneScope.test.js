import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";

const ID = "com.thebigpicture.initiative";
const CHANNEL = `${ID}/concentration-warning`;
const MODAL_ID = `${ID}/concentration-warning-modal`;
const UI_CHANNEL = `${CHANNEL}/ui`;
const HOST_CHANNEL = `${CHANNEL}/host`;

const sentMessages = [];
const sdkStub = {
  broadcast: {
    async sendMessage(channel, data, options) {
      sentMessages.push({ channel, data, options });
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdkStub },
});

const { broadcastConcentrationSaveWarnings } = await import(
  "../src/concentrationSaveReminder.js?concentration-warning-scene-scope"
);

const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

function createHostHarness(initialEpoch = 10, warningRuntimeScope = "") {
  const start = initiativeSource.indexOf("let __concentrationWarningListenerMounted");
  const end = initiativeSource.indexOf("let __turnNoticeSequence", start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  let currentEpoch = initialEpoch;
  let currentWarningRuntimeScope = warningRuntimeScope;
  let openCalls = 0;
  let closeCalls = 0;
  let updateCalls = 0;
  const uiRequests = [];
  const listeners = new Map();
  const OBR = {
    modal: {
      close: async () => { closeCalls += 1; },
    },
    popover: {
      close: async () => { closeCalls += 1; },
      open: async () => { openCalls += 1; },
      setHeight: async () => {},
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
      async sendMessage(channel, data) {
        if (channel === UI_CHANNEL && data?.type === "update-concentration-warnings") {
          updateCalls += 1;
          uiRequests.push(structuredClone(data));
        }
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
    "getEffectsMutationSceneContext",
    `${initiativeSource.slice(start, end)}\nreturn {
     mountConcentrationWarningBroadcast,
      dismissedCauseIds: __dismissedConcentrationWarningCauseIds,
     warnings: __concentrationWarningsByActivationId,
     reset: __resetConcentrationWarningRuntime,
     runtimeGeneration: () => __concentrationWarningRuntimeGeneration,
     runtimeSession: () => __concentrationWarningPopoverSession,
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
    warningRuntimeScope
      ? async () => ({ sceneIdentity: currentWarningRuntimeScope })
      : undefined,
  );
  runtime.mountConcentrationWarningBroadcast();

  return {
    warnings: runtime.warnings,
    dismissedCauseIds: runtime.dismissedCauseIds,
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
    setWarningRuntimeScope(scope) {
      currentWarningRuntimeScope = String(scope || "");
    },
    runtimeGeneration() {
      return runtime.runtimeGeneration();
    },
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    counts() {
      return { openCalls, closeCalls, updateCalls, uiRequests };
    },
    runtimeSession() {
      return runtime.runtimeSession();
    },
  };
}

function warning(causeHistoryEntryId, activationId = "activation-a") {
  return {
    name: "Caster",
    damage: 10,
    dc: 15,
    notice: { activationId, causeHistoryEntryId },
  };
}

function show(causeHistoryEntryId, sceneEpoch, activationId, warningRuntimeScope = "") {
  return {
    type: "show-concentration-warning",
    warnings: [warning(causeHistoryEntryId, activationId)],
    createdAt: 100,
    sceneEpoch,
    ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
  };
}

function showBatch(warnings, sceneEpoch) {
  return {
    type: "show-concentration-warning",
    warnings,
    createdAt: 100,
    sceneEpoch,
  };
}

function dismiss(historyEntryId, sceneEpoch, warningRuntimeScope = "") {
  return {
    type: "dismiss-concentration-warnings-by-history",
    historyEntryIds: [historyEntryId],
    sceneEpoch,
    ...(warningRuntimeScope ? { warningRuntimeScope } : {}),
  };
}

test("il dispatcher trasporta l'epoch d'origine e rifiuta l'assenza di epoch", async () => {
  sentMessages.length = 0;
  const items = [{
    id: "caster-1",
    name: "Caster",
    metadata: {
      [`${ID}/meta`]: {
        [`${ID}/concentration`]: { web: { instanceId: "spell-1", name: "Web" } },
      },
    },
  }];

  await broadcastConcentrationSaveWarnings([
    { itemId: "caster-1", damage: 10 },
  ], {
    items,
    eventId: "scene-scope-1",
    causeHistoryEntryId: "history-a",
    sceneEpoch: 10,
  });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].data.sceneEpoch, 10);

  await broadcastConcentrationSaveWarnings([
    { itemId: "caster-1", damage: 10 },
  ], {
    items,
    eventId: "scene-scope-missing",
    causeHistoryEntryId: "history-a",
  });
  assert.equal(sentMessages.length, 1);
});

test("consumer accetta show della scena corrente e chiude dismissal della stessa scena", async () => {
  const host = createHostHarness(10);
  host.receive(show("history-a", 10));
  assert.equal(host.warnings.size, 1);
  await host.settle();
  assert.equal(host.counts().openCalls, 1);

  const before = host.counts();
  host.receive(dismiss("history-a", 10));
  assert.equal(host.warnings.size, 0);
  assert.ok(host.dismissedCauseIds.has("history-a"));
  assert.ok(host.counts().closeCalls > before.closeCalls);
});

test("dismiss prima di show crea la tombstone e scarta il warning tardivo", async () => {
  const host = createHostHarness(10);
  host.receive(dismiss("history-a", 10));
  assert.ok(host.dismissedCauseIds.has("history-a"));

  host.receive(show("history-a", 10));
  await host.settle();

  assert.equal(host.warnings.size, 0);
  assert.equal(host.counts().openCalls, 0);
  assert.equal(host.counts().updateCalls, 0);
  assert.ok(host.dismissedCauseIds.has("history-a"));
});

test("una tombstone filtra solo A e lascia accettare B nello stesso batch", async () => {
  const host = createHostHarness(10);
  host.receive(dismiss("history-a", 10));
  host.receive(showBatch([
    warning("history-a", "activation-a"),
    warning("history-b", "activation-b"),
  ], 10));
  await host.settle();

  assert.equal(host.warnings.size, 1);
  assert.equal(host.warnings.get("activation-b")?.notice?.causeHistoryEntryId, "history-b");
  assert.equal(host.counts().openCalls, 1);
});

test("la dismissal della resolution R non blocca il replay della causa A", async () => {
  const host = createHostHarness(10);
  host.receive(show("history-a", 10, "same-activation"));
  host.receive(dismiss("history-r", 10));
  assert.ok(host.dismissedCauseIds.has("history-r"));
  assert.equal(host.dismissedCauseIds.has("history-a"), false);

  host.receive(show("history-a", 10, "same-activation"));
  assert.equal(host.warnings.size, 1);
  assert.equal(host.warnings.get("same-activation")?.notice?.causeHistoryEntryId, "history-a");
});

test("una nuova causa B è accettata anche con lo stesso activationId", async () => {
  const host = createHostHarness(10);
  host.receive(dismiss("history-a", 10));
  host.receive(show("history-b", 10, "same-activation"));

  assert.equal(host.warnings.size, 1);
  assert.equal(host.warnings.get("same-activation")?.notice?.causeHistoryEntryId, "history-b");
});

test("un warning senza causa valida mantiene il comportamento corrente", async () => {
  const host = createHostHarness(10);
  host.receive(dismiss("history-a", 10));
  host.receive(show("", 10, "without-cause"));
  await host.settle();

  assert.equal(host.warnings.size, 1);
  assert.equal(host.warnings.get("without-cause")?.notice?.causeHistoryEntryId, "");
  assert.equal(host.counts().openCalls, 1);
});

test("la tombstone resta dopo duplicate/retry e viene pulita dal reset runtime", () => {
  const host = createHostHarness(10);
  host.receive(dismiss("history-a", 10));
  host.receive(show("history-a", 10));
  assert.ok(host.dismissedCauseIds.has("history-a"));

  const resetStart = initiativeSource.indexOf("function __resetInitiativeSceneRuntime(");
  const resetEnd = initiativeSource.indexOf("async function __adoptInitiativeSceneBaseline(", resetStart);
  const resetSection = initiativeSource.slice(resetStart, resetEnd);
  assert.match(resetSection, /__resetConcentrationWarningRuntime\(\)/);
  const warningResetStart = initiativeSource.indexOf("function __resetConcentrationWarningRuntime(");
  const warningResetEnd = initiativeSource.indexOf("function normalizeConcentrationWarnings(", warningResetStart);
  const warningResetSection = initiativeSource.slice(warningResetStart, warningResetEnd);
  assert.match(warningResetSection, /__dismissedConcentrationWarningCauseIds\.clear\(\)/);

  host.setEpoch(11);
  host.receive(dismiss("history-a", 10));
  host.receive(show("history-a", 10));
  assert.ok(host.dismissedCauseIds.has("history-a"));

  host.dismissedCauseIds.clear();
  assert.equal(host.dismissedCauseIds.size, 0);
  host.receive(dismiss("history-a", 10));
  assert.equal(host.dismissedCauseIds.size, 0);
});

test("consumer ignora show senza epoch o di una scena precedente senza pump", async () => {
  const host = createHostHarness(11);
  host.receive(show("history-old", 10));
  host.receive({
    type: "show-concentration-warning",
    warnings: [warning("history-missing")],
    createdAt: 101,
  });
  await host.settle();

  assert.equal(host.warnings.size, 0);
  assert.equal(host.counts().openCalls, 0);
  assert.equal(host.counts().updateCalls, 0);
});

test("consumer ignora dismissal stale e accetta un nuovo show nello stesso token", async () => {
  const host = createHostHarness(10);
  host.receive(show("history-a", 10, "same-activation"));
  host.setEpoch(11);
  host.receive(dismiss("history-a", 10));
  assert.equal(host.warnings.size, 1);
  assert.equal(host.dismissedCauseIds.has("history-a"), false);

  host.receive(show("history-b", 11, "same-activation"));
  assert.equal(host.warnings.size, 1);
  assert.equal(host.warnings.get("same-activation")?.notice?.causeHistoryEntryId, "history-b");
});

test("un ritorno alla scena logica usa un nuovo epoch e rifiuta il messaggio dell'epoch vecchio", async () => {
  const host = createHostHarness(12);
  host.receive(show("history-epoch-10", 10));
  await host.settle();

  assert.equal(host.warnings.size, 0);
  assert.equal(host.counts().openCalls, 0);
});

test("lo scope opaco accetta il replay tra epoch locali divergenti e rifiuta il runtime precedente", async () => {
  const host = createHostHarness(0, "scene-runtime-a");
  host.receive(show("history-a", 1, "activation-a", "scene-runtime-a"));
  await host.settle();

  assert.equal(host.warnings.size, 1);
  host.receive(dismiss("history-a", 1, "scene-runtime-a"));
  await host.settle();
  assert.equal(host.warnings.size, 0);

  host.receive(show("history-old", 1, "activation-old", "scene-runtime-old"));
  await host.settle();
  assert.equal(host.warnings.size, 0);
});

test("il popup scoped aggiorna la sessione e il host reacquisisce lo scope corrente", async () => {
  const host = createHostHarness(10, "scene-runtime-a");
  host.receive(show("history-a", 10, "activation-a", "scene-runtime-a"));
  await host.settle();
  assert.equal(host.warnings.size, 1);

  host.receiveHost({
    type: "concentration-warning-ready",
    warningSceneEpoch: 10,
    runtimeGeneration: host.runtimeGeneration(),
    runtimeSession: host.runtimeSession(),
  });
  await host.settle();
  host.setWarningRuntimeScope("scene-runtime-b");
  host.receive(show("history-b", 10, "activation-b", "scene-runtime-b"));
  await host.settle();

  assert.equal(host.warnings.get("activation-b")?.notice?.causeHistoryEntryId, "history-b");
  assert.equal(
    host.counts().uiRequests.at(-1)?.warningRuntimeScope,
    "scene-runtime-b",
  );

  host.receive(show("history-old", 10, "activation-old", "scene-runtime-a"));
  await host.settle();
  assert.equal(host.warnings.has("activation-old"), false);
});
