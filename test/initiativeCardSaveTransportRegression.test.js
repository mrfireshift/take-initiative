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
  maxCommandBytes: Infinity,
};

function tracePoint(point, fields = {}) {
  trace.push({ point, at: performance.now(), ...fields });
}

function emit(channel, data) {
  for (const listener of [...(listeners.get(channel) || [])]) {
    listener({ data: clone(data) });
  }
}

const notices = [];
// The kinds of the commands that built or recorded a History entry (lot R1b: a realignment records none).
const historyKinds = [];
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
      if (channel === COMMAND_CHANNEL && bytes > transport.maxCommandBytes) {
        throw new Error("injected-broadcast-payload-too-large");
      }
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
  notification: { show: async (message, variant) => { notices.push([message, variant]); } },
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
    suppressElevationHistory: () => false,
    buildEffectsMutationHistoryEntry: ({ command, plan }) => {
      historyKinds.push(command.kind);
      return { id: `history:${command.commandId}`, kind: command.kind, changes: clone(plan.changes) };
    },
    recordEffectsMutationHistory: async ({ command, plan }) => {
      historyKinds.push(command.kind);
      return { id: `history:${command.commandId}`, kind: command.kind, changes: clone(plan.changes) };
    },
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
    maxCommandBytes: Infinity,
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
// The Room holds the registry compressed (studio registro schede, C1–C5): the tests read it unpacked.
const { unpackInitiativeCardRegistryFromRoom } = await import("../src/initiativeCardRegistryCore.js");
const roomCardRegistry = () => unpackInitiativeCardRegistryFromRoom(room.metadata[ROOM_CARD_KEY]) || {};
// Compression shrinks the harness's repeated quick actions: a book of random spell ids is what still exceeds the budget.
function incompressibleSpellbook() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const spellIds = Array.from({ length: 64 }, () => Array.from({ length: 80 }, () => alphabet[Math.floor(Math.random() * 64)]).join(""));
  return { spellIds, pinnedIds: [] };
}
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

    const roomProfile = roomCardRegistry().hero.profile;
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
    const roomProfile = roomCardRegistry().hero.profile;
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
    assert.equal(room.metadata[ROOM_CARD_KEY].v, 2, "the Room value is the compressed registry");
    const roomCards = roomCardRegistry();
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

function localStorageStub() {
  const local = new Map();
  return {
    local,
    storage: {
      getItem: (key) => (local.has(key) ? local.get(key) : null),
      setItem: (key, value) => { local.set(key, String(value)); },
      removeItem: (key) => { local.delete(key); },
    },
  };
}

// The other warnings of the harness (the recovery journal without IndexedDB) are not the registry's.
const cardNotices = () => notices.filter(([message]) => message.startsWith("Registro delle schede"));

// Studio registro schede, D1: the GM's local copy holds the cards of every room; only this Room's go to the Room.
test("D1 registro schede: le schede di altre stanze restano nel browser, quella usata qui entra nella stanza", async () => {
  reset();
  notices.length = 0;
  storedProfile().quickActions = [];
  const { local, storage } = localStorageStub();
  const foreign = { name: "Zorya", profile: { armorClass: 13 }, updatedAt: 5 };
  local.set(`${ID}/initiativeCards/local`, JSON.stringify({ zorya: foreign }));
  room.metadata[ROOM_CARD_KEY] = { dars: { name: "Dars", profile: { armorClass: 15 }, updatedAt: 4 } };
  globalThis.localStorage = storage;
  const runtime = await startRuntime();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 17 }, { commandId: "scope-save", transportTimeoutMs: 100 });
    const roomCards = roomCardRegistry();
    assert.equal(roomCards.hero.profile.armorClass, 17, "the card used in this room enters the Room");
    assert.equal(roomCards.dars.profile.armorClass, 15, "the Room keeps its own cards");
    assert.equal(Object.hasOwn(roomCards, "zorya"), false, "a card of another room stays out");
    const localCards = JSON.parse(local.get(`${ID}/initiativeCards/local`));
    assert.deepEqual(Object.keys(localCards).sort(), ["dars", "hero", "zorya"], "the local copy keeps every card");

    // Opening Zorya's sheet here makes her a card of this room.
    scene.items.push({ id: "zorya-token", name: "Zorya", layer: "CHARACTER", metadata: { [META_KEY]: {} } });
    const profile = await runtime.cards.loadInitiativeCard(clone(scene.items.at(-1)), { hydrate: true });
    assert.equal(profile.armorClass, 13, "the local copy still gives her sheet");
    assert.equal(roomCardRegistry().zorya?.profile?.armorClass, 13, "and now she is in the Room");
    assert.deepEqual(cardNotices(), []);
  } finally {
    delete globalThis.localStorage;
    await stopRuntime(runtime);
  }
});

// Studio registro schede, D4: the same set of left-out cards is told once per room, a reload of the GM's page included.
test("D4 registro schede: l'avviso non torna dopo una ricarica, torna in un'altra stanza", async () => {
  reset();
  notices.length = 0;
  storedProfile().spellbook = incompressibleSpellbook();
  const { storage } = localStorageStub();
  globalThis.localStorage = storage;
  const save = async (runtime, armorClass, commandId) => {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass }, { commandId, transportTimeoutMs: 200 });
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  let runtime = await startRuntime();
  try {
    // The random spellbook alone exceeds the Room budget, compressed too.
    await save(runtime, 18, "notice-1");
    assert.equal(cardNotices().length, 1);
    await stopRuntime(runtime);
    runtime = await startRuntime();
    await save(runtime, 19, "notice-reload");
    assert.equal(cardNotices().length, 1, "a reload does not tell the same set again");
    await stopRuntime(runtime);
    sdkStub.room.id = "card-save-other-room";
    room.metadata = {};
    scene.metadata = {};
    runtime = await startRuntime();
    await save(runtime, 20, "notice-other-room");
    assert.equal(cardNotices().length, 2, "another room is told");
  } finally {
    sdkStub.room.id = "card-save-room";
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

// Decision D1 of the bugfix pass: a monster's card stays in the GM's local registry, where its namesakes find it by
// name. They share the stat block, never the actor identity (ActorVitals would give them the same hit points).
test("D1: un omonimo di un mostro non eredita l'actorProfileId della sua scheda né al salvataggio né all'apertura", async () => {
  reset();
  const goblin = (id, name, hp) => ({
    id, name, layer: "CHARACTER",
    metadata: { [META_KEY]: { attitude: "enemy", inInitiative: true, hp, hpMax: 7 } },
  });
  scene.items = [goblin("g1", "(1) Goblin", 7), goblin("g2", "(2) Goblin", 3), goblin("g3", "(3) Goblin", 0)];
  const local = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => local.has(key) ? local.get(key) : null,
    setItem: (key, value) => { local.set(key, String(value)); },
    removeItem: (key) => { local.delete(key); },
  };
  const runtime = await startRuntime();
  const actorOf = (id) => scene.items.find((item) => item.id === id).metadata[META_KEY].actorProfileId || "";
  try {
    const statblock = { monster: { source: "manual" }, armorClass: 15 };
    await runtime.cards.saveInitiativeCard("g1", "(1) Goblin", statblock, { commandId: "d1-save-g1", transportTimeoutMs: 100 });
    assert.ok(actorOf("g1"), "the saved monster keeps an identity of its own");
    assert.ok(local.get(`${ID}/initiativeCards/local`)?.includes(actorOf("g1")), "its card is in the local registry");

    // (2) saved last, exhausted: its registry entry is the one a new namesake finds.
    await runtime.cards.saveInitiativeCard("g2", "(2) Goblin", { ...statblock, exhaustion: 2 }, { commandId: "d1-save-g2", transportTimeoutMs: 100 });
    assert.notEqual(actorOf("g2"), actorOf("g1"), "the namesake's save does not take (1)'s identity");

    const profile = await runtime.cards.loadInitiativeCard(clone(scene.items[2]), { hydrate: true });
    assert.notEqual(profile.actorProfileId || "", actorOf("g1"), "the namesake's opening does not take it either");
    assert.notEqual(actorOf("g3"), actorOf("g1"));
    // Lot SB2 of docs/STUDIO_GIOCO_ONLINE.md: nor the identity or the exhaustion of the namesake saved last.
    assert.equal(profile.armorClass, 15, "the stat block does come");
    assert.notEqual(profile.actorProfileId || "", actorOf("g2"), "not (2)'s identity at the opening");
    assert.notEqual(actorOf("g3"), actorOf("g2"), "nor on the token");
    assert.ok(actorOf("g3"), "an identity of its own, as the namesakes the sheet's Salva reaches: hpMemory skips it");
    assert.equal(profile.exhaustion, 0, "nor (2)'s exhaustion");
    assert.doesNotMatch(JSON.stringify(scene.items[2].metadata[META_KEY].conditions || {}), /Indebolimento|Esaust/u);
    assert.deepEqual(scene.items.map((item) => item.metadata[META_KEY].hp), [7, 3, 0], "no hit points move");
  } finally {
    await stopRuntime(runtime);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

// Lot SB1 of docs/STUDIO_GIOCO_ONLINE.md: the sheet saves a monster's card before it renames the token with the stat
// block's name. The card goes into the registry under that final name: a new token named so finds it on another map, a
// token still named as before does not get it.
test("SB1: la scheda del mostro va nel registro col nome finale; un altro mostro la trova solo con quel nome", async () => {
  reset();
  const token = (id, name) => ({ id, name, layer: "CHARACTER", metadata: { [META_KEY]: { attitude: "enemy", inInitiative: true, hp: 11, hpMax: 11 } } });
  scene.items = [token("t1", "Goblin"), token("t2", "Hobgoblin"), token("t3", "Goblin")];
  const local = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => local.has(key) ? local.get(key) : null,
    setItem: (key, value) => { local.set(key, String(value)); },
    removeItem: (key) => { local.delete(key); },
  };
  const runtime = await startRuntime();
  try {
    const hobgoblin = { monster: { source: "manual", ref: "Hobgoblin|MM" }, armorClass: 18 };
    await runtime.cards.saveInitiativeCard("t1", "Goblin", hobgoblin, { commandId: "sb1-save", transportTimeoutMs: 100, registryName: "Hobgoblin" });
    const registry = JSON.parse(local.get(`${ID}/initiativeCards/local`) || "{}");
    assert.equal(registry.hobgoblin?.profile?.armorClass, 18, "under the final name");
    assert.equal(registry.hobgoblin?.name, "Hobgoblin");
    assert.equal(registry.goblin, undefined, "not under the name the token had");
    const named = await runtime.cards.loadInitiativeCard(clone(scene.items[1]), { hydrate: true });
    assert.equal(named.armorClass, 18, "a Hobgoblin finds it");
    const other = await runtime.cards.loadInitiativeCard(clone(scene.items[2]), { hydrate: true });
    assert.notEqual(other.armorClass, 18, "a Goblin does not");
  } finally {
    await stopRuntime(runtime);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

// Lot SB3 of docs/STUDIO_GIOCO_ONLINE.md (G19–G23): a monster that gets its card from the registry when it joins the
// initiative gets the import's hit points ("hp:set" through the coordinator, with History) and Legendary too; a wounded
// namesake keeps its hit points.
test("SB3: entrando nell'iniziativa il mostro idratato riceve i PF e il Leggendario dell'import", async () => {
  reset();
  // Image tokens on the Characters layer: the creatures the stat block's hit points are for.
  const token = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER",
    metadata: { [META_KEY]: { attitude: "enemy", inInitiative: true, ...meta } } });
  scene.items = [token("s1", "Hobgoblin", { hp: 11, hpMax: 11 }), token("s2", "(2) Hobgoblin"), token("s3", "(3) Hobgoblin", { hp: 4, hpMax: 11 })];
  const local = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => local.has(key) ? local.get(key) : null,
    setItem: (key, value) => { local.set(key, String(value)); },
    removeItem: (key) => { local.delete(key); },
  };
  const runtime = await startRuntime();
  const meta = (id) => scene.items.find((item) => item.id === id).metadata[META_KEY];
  try {
    const card = { armorClass: 18,
      monster: { source: "manual", ref: "Hobgoblin|MM", hitPoints: { value: 11, formula: "2d8+2" }, legendary: { actions: 3, resistances: 1 } },
      quickActions: [{ id: "q1", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+1" }] }] };
    await runtime.cards.saveInitiativeCard("s1", "Hobgoblin", card, { commandId: "sb3-save", transportTimeoutMs: 100 });
    await runtime.cards.restoreInitiativeCardQuickActionsFromMemory(["s2", "s3"], { isGM: true });
    assert.equal(meta("s2").initiativeCard?.armorClass, 18, "the card came");
    assert.deepEqual([meta("s2").hp, meta("s2").hpMax], [11, 11], "with the import's hit points");
    assert.deepEqual(meta("s2").legendary, { max: 3, current: 3 }, "and Legendary");
    assert.deepEqual(meta("s2").legendaryResistances, { max: 1, current: 1 });
    assert.deepEqual([meta("s3").hp, meta("s3").hpMax], [4, 11], "a wounded namesake keeps its hit points");
    assert.deepEqual([meta("s1").hp, meta("s1").hpMax], [11, 11], "the token of the sheet is not touched");
  } finally {
    await stopRuntime(runtime);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

// Lot L3 of the bugfix pass (HI-01): a command over Owlbear's 16 kB limit, from a page to the background coordinator,
// travels in chunks that the real background joins before its broker. An Undo of several History entries is the case
// at the table; a spell with a large cast context is one here.
test("L3: un comando oltre 16 kB arriva al background a frammenti e viene applicato", async () => {
  reset();
  transport.maxCommandBytes = 16 * 1024;
  const runtime = await startRuntime();
  try {
    const operation = {
      type: "spell:upsert",
      targetIds: ["hero"],
      name: "Scudo",
      turns: 1,
      source: "hero",
      instanceId: "l3-large-command",
      spellId: "shield",
      castContext: { summary: "x".repeat(9000), presentation: "y".repeat(9000) },
    };
    assert.ok(new TextEncoder().encode(JSON.stringify(operation)).length > 16 * 1024, "the command is over the limit");
    const result = await runtime.client.runEffectsMutation([operation], {
      kind: "spell",
      label: "Incantesimo: Scudo",
      targetIds: ["hero"],
      commandId: "l3-large-command",
      transportTimeoutMs: 1000,
    });
    assert.equal(result.status, "applied");
    assert.ok(scene.items[0].metadata[META_KEY][SPELLS_META_KEY].some((spell) => spell.instanceId === "l3-large-command"));
  } finally {
    await stopRuntime(runtime);
  }
});

// Lot L12 of the bugfix pass (EF-06): with Frenzy's levels active the sheet shows the effective level, capped at 5;
// its − saved that level minus one, less the contributions: two levels of base gone in one click.
test("L12: il − dell'Indebolimento con contributi attivi toglie un solo livello di base", async () => {
  reset();
  Object.assign(scene.items[0].metadata[META_KEY], {
    conditions: { version: 2, instances: [
      { id: "base", condition: "Indebolimento", level: 4, active: true },
      { id: "frenzy", condition: "Indebolimento", level: 2, active: true, exhaustionContribution: true },
    ] },
  });
  scene.items[0].metadata[META_KEY].initiativeCard.exhaustion = 4;
  const runtime = await startRuntime();
  try {
    const { getInitiativeCard, initiativeCardBaseExhaustion, saveInitiativeCard } = runtime.cards;
    assert.equal(getInitiativeCard(scene.items[0]).exhaustion, 5, "4 + 2, capped");
    assert.equal(initiativeCardBaseExhaustion(scene.items[0]), 4);
    await saveInitiativeCard("hero", "Hero", { ...getInitiativeCard(scene.items[0]), exhaustion: 4 }, {
      baseExhaustion: 3, commandId: "exhaustion-down", transportTimeoutMs: 200 });
    assert.equal(storedProfile().exhaustion, 3);
    const levels = scene.items[0].metadata[META_KEY].conditions.instances
      .filter((instance) => instance.condition === "Indebolimento").map((instance) => [instance.level, !!instance.exhaustionContribution]);
    assert.deepEqual(levels.sort(), [[2, true], [3, false]]);
  } finally {
    await stopRuntime(runtime);
  }
});

// Lot L12 of the bugfix pass (SC-05): the quick actions deleted on the sheet came back from a token left in another
// scene: the hydration took the first copy with a non-empty list, whatever the newer copy said.
test("L12: le azioni rapide cancellate non tornano da un token vecchio di un'altra scena", async () => {
  reset();
  room.metadata[ROOM_CARD_KEY] = {
    hero: {
      actorProfileId: "actor-hero",
      name: "Hero",
      profile: { actorProfileId: "actor-hero", armorClass: 16, quickActions: [] },
      updatedAt: 50,
    },
  };
  // The token of this scene still carries the actions of before the deletion (updatedAt 1).
  assert.ok(storedProfile().quickActions.length > 0);
  const runtime = await startRuntime();
  try {
    const profile = await runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true });
    assert.equal(profile.armorClass, 16);
    assert.deepEqual(profile.quickActions, []);
    assert.deepEqual(storedProfile().quickActions, [], "the old token is realigned to the deletion");
  } finally {
    await stopRuntime(runtime);
  }
});

// Lot L12 of the bugfix pass (SC-03, decision D9): a profile the Room budget leaves out disappeared without a word.
test("L12: il GM viene avvisato quando il registro della stanza scarta un profilo, una volta sola", async () => {
  reset();
  notices.length = 0;
  storedProfile().spellbook = incompressibleSpellbook();
  const runtime = await startRuntime();
  try {
    // The random spellbook alone exceeds the Room budget, compressed too.
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 18 }, { commandId: "budget-1", transportTimeoutMs: 200 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(roomCardRegistry().hero, undefined, "the Room could not keep the profile");
    assert.deepEqual(notices, [["Registro delle schede pieno: Hero resta solo in questo browser (non nella stanza).", "WARNING"]]);
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 19 }, { commandId: "budget-2", transportTimeoutMs: 200 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(notices.length, 1, "the same set is told once");
  } finally {
    await stopRuntime(runtime);
  }
});

// Trasformazioni, lotto W2a (docs/PIANO_TRASFORMAZIONI.md, G37): le forme rapide della Forma Selvatica stanno sulla
// scheda, passano dal registro della stanza a un'altra scena, e un salvataggio di un altro campo non le tocca.
test("W2a: le forme rapide della scheda vanno nel registro della stanza e seguono il personaggio in un'altra scena", async () => {
  reset();
  storedProfile().quickActions = [];
  const runtime = await startRuntime();
  try {
    const wolf = { name: "Wolf", ref: "Wolf|MM", source: "5etools", type: "beast", cr: "1/4", size: "medium",
      speeds: { walk: 12 }, actions: [], junk: true };
    await runtime.cards.saveInitiativeCard("hero", "Hero", { transformationForms: [wolf, wolf] },
      { commandId: "forms-save", transportTimeoutMs: 100 });
    assert.deepEqual(storedProfile().transformationForms.map((form) => form.name), ["Wolf"]);
    assert.equal(storedProfile().transformationForms[0].junk, undefined);
    assert.deepEqual(roomCardRegistry().hero.profile.transformationForms.map((form) => form.ref), ["Wolf|MM"]);
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 15 }, { commandId: "ac-save", transportTimeoutMs: 100 });
    assert.equal(storedProfile().armorClass, 15);
    assert.deepEqual(storedProfile().transformationForms.map((form) => form.name), ["Wolf"]);
    const profile = await runtime.cards.loadInitiativeCard(sceneTwoHero());
    assert.deepEqual(profile.transformationForms.map((form) => form.name), ["Wolf"]);
  } finally {
    await stopRuntime(runtime);
  }
});

// Studio archivio attori (docs/STUDIO_ARCHIVIO_ATTORI.md), lotto R1. The scene's token was prepared earlier (armor
// class 14, 2nd level, updatedAt 1); the registry holds the card saved since in another scene (updatedAt 50).
function newerRegistryHero(extra = {}) {
  return {
    hero: {
      actorProfileId: "actor-hero",
      name: "Hero",
      updatedAt: 50,
      profile: {
        actorProfileId: "actor-hero",
        armorClass: 18,
        spellSaveDC: 15,
        exhaustion: 2,
        characterBuild: [{ classId: "guerriero", level: 5 }],
        quickActions: [{ version: 2, id: "w1", label: "Spada +1", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+5" }] }],
        savingThrows: { str: 5, dex: 1, con: 4, int: 0, wis: 0, cha: 0 },
        ...extra,
      },
    },
  };
}
const OLD_TOKEN_ATTACK = { version: 2, id: "w1", label: "Spada", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const R1_WOLF = { name: "Wolf", ref: "Wolf|MM", source: "5etools", type: "beast", cr: "1/4", size: "medium", speeds: { walk: 12 }, actions: [] };

test("R1a: un salvataggio parziale da un token vecchio parte dalla scheda più nuova del registro", async () => {
  reset();
  room.metadata[ROOM_CARD_KEY] = newerRegistryHero();
  storedProfile().quickActions = [OLD_TOKEN_ATTACK];
  const runtime = await startRuntime();
  try {
    // As the console's «Usa e salva» does (pcAttackTransformationField.js), without opening the sheet.
    await runtime.cards.saveInitiativeCard("hero", "Hero", { transformationForms: [R1_WOLF] },
      { commandId: "r1a-forms", transportTimeoutMs: 100, preserveExhaustion: true });
    for (const [where, profile] of [["registry", roomCardRegistry().hero.profile], ["token", storedProfile()]]) {
      assert.equal(profile.armorClass, 18, `${where}: the newer armor class stays`);
      assert.equal(profile.spellSaveDC, 15, `${where}: the newer spell save DC stays`);
      assert.equal(profile.characterBuild[0].level, 5, `${where}: the newer level stays`);
      assert.equal(profile.savingThrows.str, 5, `${where}: the newer saving throws stay`);
      assert.equal(profile.exhaustion, 2, `${where}: the exhaustion base is the newer card's`);
      assert.equal(profile.quickActions[0].label, "Spada +1", `${where}: the newer quick actions stay`);
      assert.deepEqual(profile.transformationForms.map((form) => form.name), ["Wolf"], `${where}: the saved field is there`);
    }
  } finally {
    await stopRuntime(runtime);
  }
});

test("R1a: con il token più nuovo del registro, o con la scheda di un altro attore, il salvataggio parte dal token", async () => {
  for (const [name, arrange] of [
    ["token newer", () => { storedProfile().updatedAt = 100; }],
    ["another actor's card", () => { room.metadata[ROOM_CARD_KEY].hero.actorProfileId = "actor-other"; room.metadata[ROOM_CARD_KEY].hero.profile.actorProfileId = "actor-other"; }],
  ]) {
    reset();
    room.metadata[ROOM_CARD_KEY] = newerRegistryHero();
    storedProfile().quickActions = [OLD_TOKEN_ATTACK];
    arrange();
    const runtime = await startRuntime();
    try {
      await runtime.cards.saveInitiativeCard("hero", "Hero", { spellSaveDC: 13 }, { commandId: `r1a-${name}`, transportTimeoutMs: 100 });
      assert.equal(storedProfile().armorClass, 14, `${name}: the token's card is the base`);
      assert.equal(storedProfile().spellSaveDC, 13, name);
      assert.equal(storedProfile().characterBuild[0].level, 2, name);
      assert.equal(roomCardRegistry().hero.profile.armorClass, 14, `${name}: and it goes to the registry, as before`);
    } finally {
      await stopRuntime(runtime);
    }
  }
});

test("R1b: all'apertura della scena un token con azioni rapide e scheda vecchia prende la scheda del registro, senza Cronologia", async () => {
  reset();
  room.metadata[ROOM_CARD_KEY] = newerRegistryHero();
  storedProfile().quickActions = [OLD_TOKEN_ATTACK];
  const runtime = await startRuntime();
  try {
    historyKinds.length = 0;
    assert.deepEqual(await runtime.cards.realignStaleInitiativeCards(clone(scene.items)), ["hero"]);
    assert.equal(storedProfile().armorClass, 18);
    assert.equal(storedProfile().characterBuild[0].level, 5);
    assert.equal(storedProfile().quickActions[0].label, "Spada +1");
    assert.equal(storedProfile().updatedAt, 50, "the token takes the registry's stamp: the next opening finds it aligned");
    assert.equal(scene.items[0].metadata[META_KEY].actorProfileId, "actor-hero");
    assert.deepEqual(historyKinds, [], "no History entry for a realignment");
    assert.equal(roomCardRegistry().hero.profile.armorClass, 18, "the registry keeps its card");

    const writes = transport.itemWrites;
    assert.deepEqual(await runtime.cards.realignStaleInitiativeCards(clone(scene.items)), [], "an aligned token is left alone");
    assert.equal(transport.itemWrites, writes);

    // Control: in this harness a save from the sheet does reach the History.
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 19 }, { commandId: "r1b-control", transportTimeoutMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(historyKinds.includes("initiative-card"), "a save records its History entry");
  } finally {
    await stopRuntime(runtime);
  }
});

test("R1b: non tocca un token più nuovo, senza identità, senza scheda o con la scheda di un altro attore", async () => {
  for (const [name, arrange] of [
    ["token newer", () => { storedProfile().updatedAt = 100; }],
    ["no identity", () => { delete scene.items[0].metadata[META_KEY].actorProfileId; delete storedProfile().actorProfileId; }],
    ["no card", () => { delete scene.items[0].metadata[META_KEY].initiativeCard; }],
    ["another actor's card", () => { room.metadata[ROOM_CARD_KEY].hero.actorProfileId = "actor-other"; room.metadata[ROOM_CARD_KEY].hero.profile.actorProfileId = "actor-other"; }],
    ["a deleted card", () => { room.metadata[ROOM_CARD_KEY].hero.deleted = true; }],
  ]) {
    reset();
    room.metadata[ROOM_CARD_KEY] = newerRegistryHero();
    storedProfile().quickActions = [OLD_TOKEN_ATTACK];
    arrange();
    const before = clone(scene.items[0]);
    const runtime = await startRuntime();
    try {
      assert.deepEqual(await runtime.cards.realignStaleInitiativeCards(clone(scene.items)), [], name);
      assert.deepEqual(scene.items[0], before, `${name}: the token is untouched`);
      assert.equal(transport.itemWrites, 0, name);
    } finally {
      await stopRuntime(runtime);
    }
  }
});

// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A1: with the archive switched on in this browser the
// cards used in the room are kept in its working archive too (IndexedDB), one record per actor or per key.
const { createVersionedIndexedDB } = await import("../test-support/fakeVersionedIndexedDb.js");
const { ACTOR_ARCHIVE_DB_NAME, ACTOR_ARCHIVE_FLAG_KEY } = await import("../src/actorArchiveStore.js");
const { HISTORY_LOCAL_STORE_FLAG_KEY } = await import("../src/historyLocalStoreCore.js");
const OLD_LOCAL_CARDS_KEY = `${ID}/initiativeCards/local`;

// The browser of a GM: its localStorage and its IndexedDB. The History stays in the scene, as in the tests above.
function archiveBrowser({ archive = true } = {}) {
  const { local, storage } = localStorageStub();
  local.set(HISTORY_LOCAL_STORE_FLAG_KEY, "0");
  if (archive) local.set(ACTOR_ARCHIVE_FLAG_KEY, "1");
  const indexedDB = createVersionedIndexedDB();
  globalThis.localStorage = storage;
  globalThis.indexedDB = indexedDB;
  return {
    local,
    records: () => indexedDB.inspect(ACTOR_ARCHIVE_DB_NAME)?.stores.records.records || null,
    close: () => { delete globalThis.localStorage; delete globalThis.indexedDB; },
  };
}

test("A1: un salvataggio scrive la voce dell'attore nell'archivio della stanza, la vecchia copia locale e la stanza", async () => {
  reset();
  storedProfile().quickActions = [];
  const browser = archiveBrowser();
  const runtime = await startRuntime();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 17 }, { commandId: "a1-save", transportTimeoutMs: 100 });
    const records = browser.records();
    assert.deepEqual(records.map((record) => [record.roomId, record.kind, record.id, record.name]), [["card-save-room", "actor", "actor-hero", "Hero"]]);
    const card = records[0].sections.card;
    assert.equal(card.value.entry.profile.armorClass, 17);
    assert.deepEqual(card.value.keys, ["hero"], "the registry keys the actor answers to");
    assert.equal(card.dirty, true, "in the outbox, for the server of a later lot");
    assert.equal(JSON.parse(browser.local.get(OLD_LOCAL_CARDS_KEY)).hero.profile.armorClass, 17, "the old local copy is written too");
    assert.equal(roomCardRegistry().hero.profile.armorClass, 17, "the Room as before");

    // The registry read back gives the archive's card, also with the Room and the old copy emptied.
    room.metadata = {};
    browser.local.delete(OLD_LOCAL_CARDS_KEY);
    const { registry } = await runtime.cards.readInitiativeCardRegistry();
    assert.equal(registry.hero.profile.armorClass, 17);
    assert.equal((await runtime.cards.loadInitiativeCard(sceneTwoHero())).armorClass, 17, "a token of another scene finds it");

    // Opening the sheet with everything aligned writes nothing new in the archive.
    const at = browser.records()[0].sections.card.at;
    await runtime.cards.loadInitiativeCard(clone(scene.items[0]), { hydrate: true });
    assert.equal(browser.records()[0].sections.card.at, at);
  } finally {
    browser.close();
    await stopRuntime(runtime);
  }
});

test("A1: l'archivio di una stanza prende le schede usate lì e quelle già nella stanza, non le altre della vecchia copia", async () => {
  reset();
  storedProfile().quickActions = [];
  const browser = archiveBrowser();
  browser.local.set(OLD_LOCAL_CARDS_KEY, JSON.stringify({ zorya: { name: "Zorya", profile: { armorClass: 13 }, updatedAt: 5 } }));
  room.metadata[ROOM_CARD_KEY] = { dars: { name: "Dars", profile: { armorClass: 15 }, updatedAt: 4 } };
  const runtime = await startRuntime();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 17 }, { commandId: "a1-scope", transportTimeoutMs: 100 });
    const ids = () => browser.records().map((record) => `${record.kind}:${record.id}`).sort();
    assert.deepEqual(ids(), ["actor:actor-hero", "card-key:dars"], "the card saved here and the one the Room already held");
    assert.equal((await runtime.cards.readInitiativeCardRegistry()).registry.zorya.profile.armorClass, 13, "the old copy is still read");

    // Zorya's sheet opened here: she becomes a card of this room.
    scene.items.push({ id: "zorya-token", name: "Zorya", layer: "CHARACTER", metadata: { [META_KEY]: {} } });
    await runtime.cards.loadInitiativeCard(clone(scene.items.at(-1)), { hydrate: true });
    assert.equal(ids().length, 3);
    assert.equal(browser.records().some((record) => record.sections.card.value.entry.name === "Zorya"), true);
  } finally {
    browser.close();
    await stopRuntime(runtime);
  }
});

test("A1: due pagine che salvano due personaggi non si cancellano nell'archivio", async () => {
  reset();
  storedProfile().quickActions = [];
  scene.items.push({ id: "mira", name: "Mira", layer: "CHARACTER",
    metadata: { [META_KEY]: { actorProfileId: "actor-mira", initiativeCard: { actorProfileId: "actor-mira", armorClass: 12, updatedAt: 1 } } } });
  const browser = archiveBrowser();
  const runtime = await startRuntime();
  // A second page of the same browser: its own copy of the module, its own write queue.
  const secondPage = await import(`../src/initiativeCards.js?a1-second-page-${Date.now()}`);
  try {
    await Promise.all([
      runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 17 }, { commandId: "a1-page-1", transportTimeoutMs: 100 }),
      secondPage.saveInitiativeCard("mira", "Mira", { armorClass: 16 }, { commandId: "a1-page-2", transportTimeoutMs: 100 }),
    ]);
    const armorById = Object.fromEntries(browser.records().map((record) => [record.id, record.sections.card.value.entry.profile.armorClass]));
    assert.deepEqual(armorById, { "actor-hero": 17, "actor-mira": 16 });
  } finally {
    browser.close();
    await stopRuntime(runtime);
  }
});

test("A1: con l'interruttore spento l'archivio non viene aperto, e senza IndexedDB vale la copia di prima con un avviso", async () => {
  reset();
  storedProfile().quickActions = [];
  let browser = archiveBrowser({ archive: false });
  let runtime = await startRuntime();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 17 }, { commandId: "a1-off", transportTimeoutMs: 100 });
    assert.equal(browser.records(), null, "no database is created");
    assert.equal(JSON.parse(browser.local.get(OLD_LOCAL_CARDS_KEY)).hero.profile.armorClass, 17);
  } finally {
    browser.close();
    await stopRuntime(runtime);
  }

  reset();
  notices.length = 0;
  storedProfile().quickActions = [];
  browser = archiveBrowser();
  delete globalThis.indexedDB;
  runtime = await startRuntime();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 18 }, { commandId: "a1-no-idb", transportTimeoutMs: 100 });
    assert.equal(JSON.parse(browser.local.get(OLD_LOCAL_CARDS_KEY)).hero.profile.armorClass, 18, "the old local copy takes it");
    assert.equal(roomCardRegistry().hero.profile.armorClass, 18);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(notices.filter(([message]) => message.startsWith("Archivio delle schede non disponibile")).length, 1, "told once");
  } finally {
    browser.close();
    await stopRuntime(runtime);
  }
});

test("A1: togliere un personaggio dalla stanza («Giocatori») non lo toglie dall'archivio", async () => {
  reset();
  storedProfile().quickActions = [];
  const browser = archiveBrowser();
  const runtime = await startRuntime();
  try {
    await runtime.cards.saveInitiativeCard("hero", "Hero", { armorClass: 17 }, { commandId: "a1-forget", transportTimeoutMs: 100 });
    assert.equal(await runtime.cards.forgetInitiativeCardRegistryCharacter({ actorProfileId: "actor-hero" }), 1);
    assert.equal(Object.hasOwn(roomCardRegistry(), "hero"), false, "out of the Room");
    assert.equal(browser.records().length, 1, "this browser keeps its copy");
  } finally {
    browser.close();
    await stopRuntime(runtime);
  }
});
