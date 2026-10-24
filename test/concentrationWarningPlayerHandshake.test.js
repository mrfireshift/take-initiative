import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ID = "com.thebigpicture.initiative";
const CHANNEL = `${ID}/concentration-warning`;
const MODAL_ID = `${ID}/concentration-warning-modal`;
const UI_CHANNEL = `${CHANNEL}/ui`;
const HOST_CHANNEL = `${CHANNEL}/host`;
const SCENE_EPOCH = 10;

const initiativeSource = readFileSync(
  new URL("../src/initiativeList.js", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

function createHost({ player } = {}) {
  const start = initiativeSource.indexOf("let __concentrationWarningListenerMounted");
  const end = initiativeSource.indexOf("let __turnNoticeSequence", start);
  assert.ok(start >= 0 && end > start);

  const contextRequests = [];
  let openCalls = 0;
  const listeners = new Map();
  const OBR = {
    ...(player ? { player } : {}),
    modal: { close: async () => {} },
    popover: {
      close: async () => {},
      open: async () => { openCalls += 1; },
      setHeight: async () => {},
    },
    viewport: { getWidth: async () => 900, getHeight: async () => 700 },
    broadcast: {
      onMessage(channel, listener) {
        listeners.set(channel, listener);
        return () => listeners.delete(channel);
      },
      async sendMessage() {},
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
      warnings: __concentrationWarningsByActivationId,
    };`,
  );
  const runtime = factory(
    OBR,
    CHANNEL,
    MODAL_ID,
    UI_CHANNEL,
    HOST_CHANNEL,
    (epoch) => Number(epoch) === SCENE_EPOCH,
    () => SCENE_EPOCH,
    async ({ commandId }) => {
      contextRequests.push(commandId);
      return { sceneIdentity: "scope-a" };
    },
  );
  runtime.mountConcentrationWarningBroadcast();
  return {
    warnings: runtime.warnings,
    contextRequests,
    openCalls: () => openCalls,
    receive(payload) {
      listeners.get(CHANNEL)({ data: structuredClone(payload) });
    },
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}

function show(warningRuntimeScope = "scope-a") {
  return {
    type: "show-concentration-warning",
    warnings: [{
      name: "Caster",
      damage: 10,
      dc: 15,
      notice: { activationId: "activation-a", causeHistoryEntryId: "history-a" },
    }],
    createdAt: 100,
    sceneEpoch: SCENE_EPOCH,
    warningRuntimeScope,
  };
}

function dismiss(warningRuntimeScope) {
  return {
    type: "dismiss-concentration-warnings-by-history",
    historyEntryIds: ["history-a"],
    sceneEpoch: SCENE_EPOCH,
    warningRuntimeScope,
  };
}

test("tracker Player: nessun handshake col coordinatore, avviso scartato come prima", async () => {
  const host = createHost({ player: { getRole: async () => "PLAYER" } });
  await host.settle();
  host.receive(show());
  await host.settle();
  host.receive(dismiss("scope-b"));
  await host.settle();
  assert.deepEqual(host.contextRequests, []);
  assert.equal(host.warnings.size, 0);
  assert.equal(host.openCalls(), 0);
});

test("tracker GM: handshake invariato e avviso aperto", async () => {
  const host = createHost({ player: { getRole: async () => "GM" } });
  await host.settle();
  host.receive(show());
  await host.settle();
  assert.ok(host.contextRequests.length >= 1);
  assert.ok(host.contextRequests.every((commandId) => commandId.startsWith("concentration-warning-")));
  assert.equal(host.warnings.size, 1);
  assert.equal(host.openCalls(), 1);
});

test("ruolo non leggibile: l'handshake resta, nessun avviso perso per un errore transitorio", async () => {
  const host = createHost({ player: { getRole: async () => { throw new Error("not ready"); } } });
  await host.settle();
  host.receive(show());
  await host.settle();
  assert.ok(host.contextRequests.length >= 1);
  assert.equal(host.warnings.size, 1);
  assert.equal(host.openCalls(), 1);
});
