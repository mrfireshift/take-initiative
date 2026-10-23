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
  rateLimitedResults: 0,
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
      if (channel === RESULT_CHANNEL && transport.rateLimitedResults > 0) {
        // Owlbear's answer to broadcasts sent too fast: an Error whose nested error says so.
        transport.rateLimitedResults -= 1;
        const error = new Error("[object Object]");
        error.error = { message: "Too many requests" };
        throw error;
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
    rateLimitedResults: 0,
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

const ROOM_CARD_KEY = `${ID}/initiativeCards`;
const BATTLE_MASTER_20 = [{ classId: "guerriero", level: 20, subclassId: "guerriero-maestro-di-battaglia" }];

async function battleMasterFeatureIds() {
  const { getAvailableClassFeatures, getEnabledClassFeatures } = await import("../src/classFeatureCatalog.js");
  const defaults = getEnabledClassFeatures({ characterBuild: BATTLE_MASTER_20 }).map((feature) => feature.id);
  const extra = getAvailableClassFeatures(BATTLE_MASTER_20)
    .find((feature) => !defaults.includes(feature.id)).id;
  return { defaults, extra, enabled: [...defaults.slice(1), extra] };
}

function sceneTwoHero() {
  return {
    id: "hero-scene-2",
    name: "Hero",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { actorProfileId: "actor-hero" } },
  };
}

test("registry Room: salva solo il delta delle capacità, token e nuova scena vedono l'elenco completo", async () => {
  reset();
  // Le quick action giganti dell'harness superano da sole il budget Room.
  storedProfile().quickActions = [];
  const runtime = await startRuntime();
  try {
    const { defaults, extra, enabled } = await battleMasterFeatureIds();
    await runtime.cards.saveInitiativeCard("hero", "Hero", {
      characterBuild: BATTLE_MASTER_20,
      enabledClassFeatureIds: enabled,
      classFeaturesConfigured: true,
    }, { commandId: "room-delta-save", transportTimeoutMs: 100 });

    assert.deepEqual(storedProfile().enabledClassFeatureIds, enabled);
    assert.equal(storedProfile().classFeaturesConfigured, true);

    const roomProfile = room.metadata[ROOM_CARD_KEY].hero.profile;
    assert.equal(roomProfile.classFeaturesConfigured, false);
    assert.deepEqual(roomProfile.enabledClassFeatureIds, [extra]);
    assert.deepEqual(roomProfile.disabledDefaultClassFeatureIds, [defaults[0]]);

    const profile = await runtime.cards.loadInitiativeCard(sceneTwoHero());
    assert.equal(profile.classFeaturesConfigured, true);
    assert.deepEqual([...profile.enabledClassFeatureIds].sort(), [...enabled].sort());
  } finally {
    await stopRuntime(runtime);
  }
});

test("registry Room: un profilo legacy con l'elenco completo resta leggibile e migra al delta", async () => {
  reset();
  const { defaults, extra, enabled } = await battleMasterFeatureIds();
  room.metadata[ROOM_CARD_KEY] = {
    hero: {
      actorProfileId: "actor-hero",
      name: "Hero",
      profile: {
        actorProfileId: "actor-hero",
        armorClass: 16,
        characterBuild: BATTLE_MASTER_20,
        enabledClassFeatureIds: enabled,
        classFeaturesConfigured: true,
      },
      updatedAt: 50,
    },
  };
  scene.items.push(sceneTwoHero());
  const runtime = await startRuntime();
  try {
    const profile = await runtime.cards.loadInitiativeCard(sceneTwoHero());
    assert.equal(profile.armorClass, 16);
    assert.equal(profile.classFeaturesConfigured, true);
    assert.deepEqual(profile.enabledClassFeatureIds, enabled);

    await runtime.cards.loadInitiativeCard(sceneTwoHero(), { hydrate: true });
    const roomProfile = room.metadata[ROOM_CARD_KEY].hero.profile;
    assert.equal(roomProfile.classFeaturesConfigured, false);
    assert.deepEqual(roomProfile.enabledClassFeatureIds, [extra]);
    assert.deepEqual(roomProfile.disabledDefaultClassFeatureIds, [defaults[0]]);
    const hydratedToken = scene.items.find((item) => item.id === "hero-scene-2")
      .metadata[META_KEY].initiativeCard;
    assert.equal(hydratedToken.classFeaturesConfigured, true);
    assert.deepEqual([...hydratedToken.enabledClassFeatureIds].sort(), [...enabled].sort());
  } finally {
    await stopRuntime(runtime);
  }
});

test("registry Room: la chiave nome diventa un alias, localStorage e token restano completi", async () => {
  reset();
  storedProfile().quickActions = [];
  scene.items[0].image = { url: "https://assets.test/hero.png?v=1" };
  const local = new Map();
  globalThis.localStorage = {
    getItem: (key) => (local.has(key) ? local.get(key) : null),
    setItem: (key, value) => { local.set(key, String(value)); },
  };
  const runtime = await startRuntime();
  try {
    const { enabled } = await battleMasterFeatureIds();
    await runtime.cards.saveInitiativeCard("hero", "Hero", {
      characterBuild: BATTLE_MASTER_20,
      enabledClassFeatureIds: enabled,
      classFeaturesConfigured: true,
    }, { commandId: "room-alias-save", transportTimeoutMs: 100 });

    const assetKey = "asset:https://assets.test/hero.png";
    const roomCards = room.metadata[ROOM_CARD_KEY];
    assert.deepEqual(Object.keys(roomCards).sort(), [assetKey, "hero"].sort());
    assert.deepEqual(roomCards.hero, { sameAs: assetKey, updatedAt: roomCards[assetKey].updatedAt });
    assert.equal(roomCards[assetKey].profile.armorClass, 14);

    const localCards = JSON.parse([...local.values()][0]);
    assert.equal(localCards.hero.profile.classFeaturesConfigured, true);
    assert.deepEqual(localCards.hero.profile.enabledClassFeatureIds, enabled);
    assert.equal(Object.hasOwn(localCards.hero, "sameAs"), false);
    assert.deepEqual(storedProfile().enabledClassFeatureIds, enabled);

    // Un altro dispositivo, senza copia locale: un token con immagine diversa
    // e senza actorProfileId risolve la scheda dall'alias del nome.
    delete globalThis.localStorage;
    const profile = await runtime.cards.loadInitiativeCard({
      id: "hero-other-device",
      name: "Hero",
      layer: "CHARACTER",
      image: { url: "https://assets.test/hero-alt.png" },
      metadata: {},
    });
    assert.equal(profile.armorClass, 14);
    assert.equal(profile.actorProfileId, "actor-hero");
    assert.deepEqual([...profile.enabledClassFeatureIds].sort(), [...enabled].sort());
  } finally {
    delete globalThis.localStorage;
    await stopRuntime(runtime);
  }
});

// Opening the character sheet (GM): the read-through realignment of the Room registry and of the token.
// Counts the Room writes; gate holds the token writes until released.
function countRoomWrites() {
  const originalRoom = sdkStub.room.setMetadata;
  const originalItems = sdkStub.scene.items.updateItems;
  const counter = { writes: 0, gate: null };
  sdkStub.room.setMetadata = async (update) => {
    counter.writes += 1;
    return originalRoom(update);
  };
  sdkStub.scene.items.updateItems = async (...args) => {
    if (counter.gate) await counter.gate;
    return originalItems(...args);
  };
  counter.restore = () => {
    sdkStub.room.setMetadata = originalRoom;
    sdkStub.scene.items.updateItems = originalItems;
  };
  return counter;
}

async function settled(promise, ms = 80) {
  return Promise.race([promise.then(() => "resolved"), new Promise((resolve) => setTimeout(() => resolve("pending"), ms))]);
}

test("apertura GM: con registro Room già allineato non scrive né la Room né il token", async () => {
  reset();
  storedProfile().quickActions = [];
  const runtime = await startRuntime();
  const room = countRoomWrites();
  try {
    await runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true });
    const firstWrites = room.writes;
    const itemWrites = transport.itemWrites;
    assert.ok(firstWrites >= 1, "the first opening aligns the Room");
    await runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true });
    await runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true });
    assert.equal(room.writes, firstWrites, "an aligned Room is not written again");
    assert.equal(transport.itemWrites, itemWrites, "nor the token");
  } finally {
    room.restore();
    await stopRuntime(runtime);
  }
});

test("apertura GM con deferWrites: il profilo arriva subito, la migrazione scrive lo stesso profilo dopo", async () => {
  reset();
  storedProfile().quickActions = [];
  const runtime = await startRuntime();
  const room = countRoomWrites();
  try {
    // The Room holds a newer card (AC 16) than the token (AC 12): the opening realigns the token.
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 16 }, { commandId: "newer-room", transportTimeoutMs: 100 });
    Object.assign(storedProfile(), { armorClass: 12, updatedAt: 1 });
    let release;
    room.gate = new Promise((resolve) => { release = resolve; });
    const loading = runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true, deferWrites: true });
    assert.equal(await settled(loading), "resolved", "the sheet does not wait for the token write");
    const profile = await loading;
    assert.equal(profile.armorClass, 16);
    assert.equal(storedProfile().armorClass, 12, "the token is written after the profile is returned");
    release();
    room.gate = null;
    const deadline = Date.now() + 2000;
    while (storedProfile().armorClass !== 16 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(storedProfile().armorClass, 16, "the deferred realignment writes the profile the sheet drew");
  } finally {
    room.restore();
    await stopRuntime(runtime);
  }
});

test("apertura GM senza deferWrites: chi carica la scheda aspetta ancora la migrazione", async () => {
  reset();
  storedProfile().quickActions = [];
  const runtime = await startRuntime();
  const room = countRoomWrites();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 16 }, { commandId: "newer-room-awaited", transportTimeoutMs: 100 });
    Object.assign(storedProfile(), { armorClass: 12, updatedAt: 1 });
    let release;
    room.gate = new Promise((resolve) => { release = resolve; });
    const loading = runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true });
    assert.equal(await settled(loading), "pending", "the default keeps awaiting the writes");
    release();
    room.gate = null;
    await loading;
    assert.equal(storedProfile().armorClass, 16);
  } finally {
    room.restore();
    await stopRuntime(runtime);
  }
});

test("Owlbear rate limit on the answer's chunks: the background waits and resends, the caller gets it without a retry", async () => {
  reset();
  scene.items[0].metadata[META_KEY][SPELLS_META_KEY] = oversizedSpellList();
  transport.rateLimitedResults = 2;
  const runtime = await startRuntime();
  try {
    const result = await runtime.client.runEffectsMutation([{
      type: "spell:upsert", targetIds: ["hero"], name: "Scudo", turns: 1, source: "hero",
      instanceId: "shield-rate-limited", spellId: "shield",
    }], { kind: "spell", label: "Incantesimo: Scudo", targetIds: ["hero"], commandId: "shield-rate-limited" });
    assert.equal(result.status, "applied");
    assert.equal(transport.rateLimitedResults, 0, "both refusals were met");
    assert.equal(transport.itemWrites, 1);
    assert.equal(trace.filter((entry) => entry.point === "T0 send" && entry.kind === "apply").length, 1, "no client retry");
  } finally {
    await stopRuntime(runtime);
  }
});
