import test, { mock } from "node:test";
import assert from "node:assert/strict";

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const RESULT_CHANNEL = `${ID}/effects-mutation-result`;
const COMMAND_CHANNEL = `${ID}/effects-mutation-command`;
const clone = (value) => value === undefined ? undefined : structuredClone(value);

const listeners = new Map();
const scene = { metadata: {}, items: [] };
const room = { metadata: {} };
const trace = [];
const transport = {
  maxResponseBytes: 1400,
  maxBroadcastBytes: 16 * 1024,
  dropInitiativeCardResponses: false,
  responseDrops: 0,
  itemWrites: 0,
  failItemWrites: false,
};

function tracePoint(point, fields = {}) {
  trace.push({ point, at: performance.now(), ...fields });
}

function emit(channel, data) {
  for (const listener of [...(listeners.get(channel) || [])]) {
    listener({ data: clone(data) });
  }
}

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM", getId: async () => "card-save-gm" },
  room: {
    id: "card-save-room",
    getMetadata: async () => clone(room.metadata),
    setMetadata: async (update) => { room.metadata = { ...room.metadata, ...clone(update) }; },
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: () => () => {},
    getMetadata: async () => clone(scene.metadata),
    setMetadata: async (update) => { scene.metadata = { ...scene.metadata, ...clone(update) }; },
    items: {
      getItems: async (ids) => {
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        return scene.items.filter((item) => !wanted || wanted.has(item.id)).map(clone);
      },
      updateItems: async (ids, updater) => {
        if (transport.failItemWrites) throw new Error("injected-card-save-commit-failure");
        const wanted = new Set(ids || []);
        const drafts = scene.items.filter((item) => wanted.has(item.id)).map(clone);
        tracePoint("T2 canonical-mutation-begin", { itemIds: [...wanted] });
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        scene.items = scene.items.map((item) => byId.get(item.id) || item);
        transport.itemWrites += 1;
        tracePoint("T3 canonical-commit", { itemIds: [...wanted] });
      },
      addItems: async () => {},
      deleteItems: async () => {},
      getItemBounds: async () => ({}),
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1, unit: "m" } }),
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const entries = listeners.get(channel) || new Set();
      entries.add(listener);
      listeners.set(channel, entries);
      return () => entries.delete(listener);
    },
    async sendMessage(channel, data) {
      const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
      if (channel === COMMAND_CHANNEL) {
        tracePoint("T0 send", { requestId: data.requestId, kind: data.kind });
        tracePoint("T1 background-receive", { requestId: data.requestId, kind: data.kind });
      }
      if (channel === RESULT_CHANNEL) {
        if (bytes > transport.maxBroadcastBytes) {
          transport.responseDrops += 1;
          throw new Error("injected-broadcast-payload-too-large");
        }
        const isInitiativeCard = data?.result?.kind === "initiative-card";
        if (isInitiativeCard && (transport.dropInitiativeCardResponses || bytes > transport.maxResponseBytes)) {
          transport.responseDrops += 1;
          throw new Error("injected-broadcast-payload-rejected");
        }
        tracePoint("T4 response-emit", { requestId: data.requestId, bytes });
      }
      emit(channel, data);
      if (channel === RESULT_CHANNEL) tracePoint("T5 caller-receive", { requestId: data.requestId });
    },
  },
  notification: { show: async () => {} },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildImage: () => ({ build: () => ({ id: "image" }) }),
    buildPath: () => ({ build: () => ({ id: "path" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
    Command: class Command {},
  },
});

mock.module("../src/history.js", {
  exports: {
    suppressMovementHistory: () => false,
    buildEffectsMutationHistoryEntry: ({ command, plan }) => ({
      id: `history:${command.commandId}`,
      kind: command.kind,
      changes: clone(plan.changes),
    }),
    recordEffectsMutationHistory: async ({ command, plan }) => ({
      id: `history:${command.commandId}`,
      kind: command.kind,
      changes: clone(plan.changes),
    }),
  },
});

function quickActions() {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `feature-${index}`,
    label: `Azione ${index} ${"x".repeat(65)}`,
    kind: "feature",
    featureId: `feature-${index}-${"y".repeat(160)}`,
    targetMode: "self",
  }));
}

function oversizedSpellList() {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `spell-entry-${index}`,
    name: `Effetto persistente ${index}`,
    turns: 10,
    casterId: "hero",
    instanceId: `spell-instance-${index}`,
    spellId: `spell-${index}`,
    castContext: {
      summary: `Contesto ${index}: ${"x".repeat(1200)}`,
      presentation: `Dettaglio ${index}: ${"y".repeat(1200)}`,
    },
  }));
}

function initialItem() {
  return {
    id: "hero",
    name: "Hero",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        actorProfileId: "actor-hero",
        initiativeCard: {
          actorProfileId: "actor-hero",
          armorClass: 14,
          quickActions: quickActions(),
          characterBuild: [{ classId: "guerriero", level: 2 }],
          savingThrows: { str: 2, dex: 1, con: 1, int: 0, wis: 0, cha: 0 },
          updatedAt: 1,
        },
      },
    },
  };
}

function reset() {
  listeners.clear();
  scene.metadata = {};
  scene.items = [initialItem()];
  room.metadata = {};
  trace.length = 0;
  Object.assign(transport, {
    dropInitiativeCardResponses: false,
    responseDrops: 0,
    itemWrites: 0,
    failItemWrites: false,
  });
}

let sequence = 0;
async function startRuntime() {
  globalThis.location = { pathname: "/initiative-card-modal.html" };
  const cards = await import(`../src/initiativeCards.js?card-save-client-${++sequence}`);
  const client = await import("../src/effectsMutations.js");
  globalThis.location = { pathname: "/background.html" };
  const background = await import(`../src/effectsMutations.js?card-save-background-${sequence}`);
  assert.equal(await background.mountEffectsMutationCoordinatorService(), true);
  globalThis.location = { pathname: "/initiative-card-modal.html" };
  return { cards, client, background };
}

async function stopRuntime(runtime) {
  runtime.client.unmountEffectsMutationCoordinatorService();
  runtime.background.unmountEffectsMutationCoordinatorService();
}

function storedProfile() {
  return scene.items[0].metadata[META_KEY].initiativeCard;
}

test("R1/R2/R3: Character Sheet ACK compatto attraversa il broker async e chiude il save senza timeout", async () => {
  reset();
  const runtime = await startRuntime();
  try {
    const { saveInitiativeCard } = runtime.cards;
    assert.ok(
      new TextEncoder().encode(JSON.stringify(storedProfile())).length > transport.maxResponseBytes,
      "the pre-existing profile is large enough to reproduce the oversized full-result response",
    );
    const workflows = [
      ["R1 class", { characterBuild: [{ classId: "paladino", level: 5 }] }, (profile) => profile.characterBuild[0].classId === "paladino"],
      ["R2 quick-actions", { quickActions: quickActions().map((entry, index) => ({ ...entry, label: `Nuova ${index}` })) }, (profile) => profile.quickActions.every((entry) => entry.label.startsWith("Nuova"))],
      ["R3 stats", { armorClass: 19, savingThrows: { str: 4 } }, (profile) => profile.armorClass === 19 && profile.savingThrows.str === 4],
    ];
    for (const [name, value, matches] of workflows) {
      await saveInitiativeCard("hero", "Hero", value, { commandId: name, transportTimeoutMs: 100 });
      assert.equal(matches(storedProfile()), true, `${name} must be canonically persisted`);
      tracePoint("T6 caller-complete", { workflow: name });
    }
    assert.equal(transport.responseDrops, 0);
    assert.ok(trace.some((entry) => entry.point === "T2 canonical-mutation-begin"));
    assert.ok(trace.some((entry) => entry.point === "T3 canonical-commit"));
    assert.ok(trace.some((entry) => entry.point === "T4 response-emit"));
    assert.ok(trace.some((entry) => entry.point === "T5 caller-receive"));
    assert.equal(trace.filter((entry) => entry.point === "T6 caller-complete").length, 3);
    assert.ok(trace.filter((entry) => entry.point === "T4 response-emit").every((entry) => entry.bytes <= transport.maxResponseBytes));
    const applyRequests = trace
      .filter((entry) => entry.point === "T0 send" && entry.kind === "apply")
      .map((entry) => entry.requestId)
      .sort();
    const applyResponses = trace
      .filter((entry) => entry.point === "T4 response-emit")
      .map((entry) => entry.requestId)
      .filter((requestId) => applyRequests.includes(requestId))
      .sort();
    assert.deepEqual(applyResponses, applyRequests);
    const points = trace
      .filter((entry) => /^T[0-6] /u.test(entry.point))
      .map((entry) => entry.at);
    assert.ok(points.every((at, index) => index === 0 || at >= points[index - 1]));
  } finally {
    await stopRuntime(runtime);
  }
});

test("un ACK spell oltre 16 KB viene ricomposto dopo il commit senza timeout", async () => {
  reset();
  scene.items[0].metadata[META_KEY][SPELLS_META_KEY] = oversizedSpellList();
  const runtime = await startRuntime();
  try {
    const result = await runtime.client.runEffectsMutation([{
      type: "spell:upsert",
      targetIds: ["hero"],
      name: "Scudo",
      turns: 1,
      source: "hero",
      instanceId: "shield-large-ack",
      spellId: "shield",
    }], {
      kind: "spell",
      label: "Incantesimo: Scudo",
      targetIds: ["hero"],
      commandId: "shield-large-ack",
      transportTimeoutMs: 250,
    });

    assert.equal(result.status, "applied");
    assert.equal(transport.responseDrops, 0);
    assert.equal(transport.itemWrites, 1);
    assert.equal(
      scene.items[0].metadata[META_KEY][SPELLS_META_KEY]
        .some((spell) => spell.instanceId === "shield-large-ack"),
      true,
    );
    const applyRequestId = trace.find((entry) => (
      entry.point === "T0 send" && entry.kind === "apply"
    ))?.requestId;
    const responseMessages = trace.filter((entry) => (
      entry.point === "T4 response-emit" && entry.requestId === applyRequestId
    ));
    assert.ok(responseMessages.length > 1, "the oversized result must cross the broker in chunks");
    assert.ok(responseMessages.every((entry) => entry.bytes <= transport.maxBroadcastBytes));
  } finally {
    await stopRuntime(runtime);
  }
});

test("ACK perso dopo commit converge con reread canonico; retry utente non duplica il token", async () => {
  reset();
  const runtime = await startRuntime();
  try {
    const { saveInitiativeCard } = runtime.cards;
    transport.dropInitiativeCardResponses = true;
    await saveInitiativeCard("hero", "Hero", { armorClass: 20 }, {
      commandId: "ack-lost-card-save",
      transportTimeoutMs: 100,
    });
    assert.equal(storedProfile().armorClass, 20);
    assert.equal(transport.itemWrites, 1);
    assert.equal(transport.responseDrops, 2);

    transport.dropInitiativeCardResponses = false;
    await saveInitiativeCard("hero", "Hero", { armorClass: 20 }, {
      commandId: "user-retry-after-lost-ack",
      transportTimeoutMs: 100,
    });
    assert.equal(transport.itemWrites, 1);
  } finally {
    await stopRuntime(runtime);
  }
});

test("failure prima del commit non converge falsamente dopo il reread", async () => {
  reset();
  const runtime = await startRuntime();
  try {
    transport.failItemWrites = true;
    await assert.rejects(
      runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 21 }, {
        commandId: "real-card-save-failure",
        transportTimeoutMs: 100,
      }),
      /injected-card-save-commit-failure/,
    );
    assert.equal(storedProfile().armorClass, 14);
  } finally {
    await stopRuntime(runtime);
  }
});
