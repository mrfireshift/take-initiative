import assert from "node:assert/strict";
import test from "node:test";

import { ID } from "../src/constants.js";
import {
  ACTOR_VITALS_DEFAULT_ROOM_MAX_BYTES,
  normalizeActorVitalsRegistry,
  retainActorVitalsRegistryWithinByteBudget,
} from "../src/actorVitalsCore.js";
import {
  normalizeFactionRegistry,
  retainFactionRegistryWithinByteBudget,
} from "../src/factionRegistryCore.js";
import { retainHPMapWithinByteBudget } from "../src/hpMemoryRetention.js";
import {
  normalizeInitiativeCardRegistry,
  retainInitiativeCardRegistryWithinByteBudget,
} from "../src/initiativeCardRegistryCore.js";
import { compactRoomOptionsForStorage } from "../src/options/optionsNormalize.js";
import { createDefaultRoomOptions } from "../src/options/optionsDefaults.js";
import {
  METADATA_OWNERSHIP,
  reconcileOwnedRoomMetadataBudget,
  writeRoomMetadataKey,
} from "../src/metadataKeyScoped.js";
import {
  ROOM_METADATA_DOMAIN_MAX_BYTES,
  ROOM_METADATA_HARD_LIMIT_BYTES,
  ROOM_METADATA_SAFE_LIMIT_BYTES,
  compactOwnedRoomMetadata,
  jsonBytes,
  planRoomMetadataWrite,
  roomMetadataBytes,
} from "../src/roomMetadataBudget.js";

const KEYS = Object.freeze({
  actorVitals: METADATA_OWNERSHIP.ACTOR_VITALS.key,
  hpMemory: METADATA_OWNERSHIP.ROOM_MEMORY.key,
  cards: METADATA_OWNERSHIP.INITIATIVE_CARDS.key,
  faction: METADATA_OWNERSHIP.REGISTRY.key,
  options: METADATA_OWNERSHIP.ROOM_OPTIONS.key,
  ui: METADATA_OWNERSHIP.SHARED_UI.key,
  speed: METADATA_OWNERSHIP.SPEED_CHECK_CONTROL.key,
});

function actorVitalsFixture(count = 30) {
  return normalizeActorVitalsRegistry({
    schemaVersion: 1,
    actors: Object.fromEntries(Array.from({ length: count }, (_, index) => [
      `actor-${index}`,
      {
        hp: 10 + index,
        hpMax: 20,
        updatedAt: 1_700_000_000_000 + index,
        revision: index + 1,
      },
    ])),
  });
}

function hpMemoryFixture(count = 25) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `Hero ${index}||https://cdn.example.test/portrait-${index}.png`,
    {
      hp: 10 + index,
      hpMax: 20,
      attitude: "pc",
      t: 1_700_000_000_000 + index,
    },
  ]));
}

function initiativeCardsFixture(count = 10) {
  const profile = {
    armorClass: 16,
    passivePerception: 14,
    speed: 9,
    spellSaveDC: 15,
    spellAttackBonus: 7,
    notes: "Una nota di combattimento realistica",
    exhaustion: 1,
    quickActions: [
      { id: "dash", label: "Scatto", kind: "action" },
      {
        id: "spell",
        label: "Incantesimo",
        kind: "spell",
        spellId: "fireball",
        launchMode: "prepared",
      },
    ],
    characterBuild: ["fighter", "second-wind"],
    enabledClassFeatureIds: ["action-surge", "indomitable"],
    classFeaturesConfigured: true,
    savingThrows: { str: 5, dex: 2, con: 4, int: 0, wis: 1, cha: -1 },
  };
  return normalizeInitiativeCardRegistry(Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `asset:https://cdn.example.test/token-${index}.png`,
      {
        actorProfileId: `actor-${index}`,
        name: `Character ${index}`,
        profile: { ...profile, notes: `${profile.notes} ${index}` },
        updatedAt: 1_700_000_000_000 + index,
      },
    ]),
  ));
}

function factionFixture(count = 35) {
  return normalizeFactionRegistry(Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `https://cdn.example.test/faction-${index}.png`,
      {
        attitude: ["ally", "enemy", "neutral", "pc"][index % 4],
        name: `Creature ${index}`,
        updatedAt: 1_700_000_000_000 + index,
      },
    ]),
  ));
}

function optionsFixture() {
  const defaults = createDefaultRoomOptions();
  return compactRoomOptionsForStorage({
    ...defaults,
    playerView: {
      ...defaults.playerView,
      reminders: { visibility: "summary", showDc: false, showCaster: false },
    },
    turn: { popup: false, directReminderResolution: "informational", movementReminder: false },
  });
}

function cacheEntries() {
  return [
    { key: KEYS.actorVitals, retain: retainActorVitalsRegistryWithinByteBudget },
    { key: KEYS.hpMemory, retain: retainHPMapWithinByteBudget },
    { key: KEYS.cards, retain: retainInitiativeCardRegistryWithinByteBudget },
    { key: KEYS.faction, retain: retainFactionRegistryWithinByteBudget },
    { key: KEYS.options },
    { key: KEYS.ui },
    { key: KEYS.speed },
  ];
}

function largeRoomMetadata() {
  return {
    [KEYS.actorVitals]: actorVitalsFixture(90),
    [KEYS.hpMemory]: hpMemoryFixture(70),
    [KEYS.cards]: initiativeCardsFixture(30),
    [KEYS.faction]: factionFixture(90),
    [KEYS.options]: optionsFixture(),
    [KEYS.ui]: { open: true, at: 42 },
    [KEYS.speed]: { version: 1, enabled: true, updatedAt: 42 },
    "com.other.extension/room-state": { keep: "byte-for-byte" },
  };
}

test("ROOM-BUDGET-A: documento sotto soglia non viene potato", () => {
  const metadata = {
    [KEYS.actorVitals]: actorVitalsFixture(2),
    [KEYS.options]: optionsFixture(),
    "com.other.extension/room-state": { keep: true },
  };
  const plan = planRoomMetadataWrite(
    metadata,
    KEYS.cards,
    initiativeCardsFixture(1),
    { retain: retainInitiativeCardRegistryWithinByteBudget },
  );

  assert.equal(plan.pruned, false);
  assert.ok(plan.fitsSafe);
  assert.ok(plan.candidateTotalBytes < ROOM_METADATA_SAFE_LIMIT_BYTES);
});

test("ROOM-BUDGET-B: actorVitals e hpMemory condividono il ceiling aggregato", () => {
  const metadata = {
    [KEYS.actorVitals]: actorVitalsFixture(260),
    [KEYS.hpMemory]: hpMemoryFixture(180),
  };
  const plan = compactOwnedRoomMetadata(metadata, cacheEntries());

  assert.ok(roomMetadataBytes(metadata) > ROOM_METADATA_HARD_LIMIT_BYTES);
  assert.ok(plan.fitsSafe);
  assert.ok(plan.candidateTotalBytes <= ROOM_METADATA_SAFE_LIMIT_BYTES);
  assert.notEqual(plan.metadata[KEYS.actorVitals], metadata[KEYS.actorVitals]);
  assert.notEqual(plan.metadata[KEYS.hpMemory], metadata[KEYS.hpMemory]);
  assert.equal(Object.keys(metadata[KEYS.actorVitals].actors).length, 260);
  assert.equal(Object.keys(metadata[KEYS.hpMemory]).length, 180);
});

test("ROOM-BUDGET-C: initiativeCards mantiene la replica bounded e la copia sorgente completa", () => {
  const source = initiativeCardsFixture(30);
  const retained = retainInitiativeCardRegistryWithinByteBudget(
    source,
    ROOM_METADATA_DOMAIN_MAX_BYTES["initiative-cards"],
  );

  assert.ok(jsonBytes(retained) <= ROOM_METADATA_DOMAIN_MAX_BYTES["initiative-cards"]);
  assert.ok(Object.keys(retained).length < Object.keys(source).length);
  assert.equal(source["asset:https://cdn.example.test/token-29.png"].profile.quickActions.length, 2);
  assert.equal(source["asset:https://cdn.example.test/token-29.png"].profile.characterBuild[0], "fighter");
  assert.equal(source["asset:https://cdn.example.test/token-29.png"].profile.enabledClassFeatureIds[0], "action-surge");
  assert.equal(Object.keys(source).length, 30);
});

test("ROOM-BUDGET-D: factionRegistry conserva deterministicamente le entry più recenti", () => {
  const source = factionFixture(90);
  const first = retainFactionRegistryWithinByteBudget(source);
  const second = retainFactionRegistryWithinByteBudget({
    ...source,
    "https://cdn.example.test/zzz.png": {
      attitude: "enemy",
      name: "Tie breaker",
      updatedAt: 1_700_000_000_090,
    },
  });

  assert.ok(jsonBytes(first) <= ROOM_METADATA_DOMAIN_MAX_BYTES.registry);
  assert.deepEqual(Object.keys(first), Object.keys(retainFactionRegistryWithinByteBudget(source)));
  assert.equal(Object.keys(second).at(0), "https://cdn.example.test/zzz.png");
});

test("ROOM-BUDGET-E: metadata esterni resta identico al self-heal", () => {
  const metadata = largeRoomMetadata();
  const external = structuredClone(metadata["com.other.extension/room-state"]);
  const plan = compactOwnedRoomMetadata(metadata, cacheEntries());

  assert.deepEqual(plan.metadata["com.other.extension/room-state"], external);
  assert.equal(
    JSON.stringify(plan.metadata["com.other.extension/room-state"]),
    JSON.stringify(metadata["com.other.extension/room-state"]),
  );
});

test("ROOM-BUDGET-F: una Room già oversized viene riparata in un solo aggiornamento owned", async () => {
  const metadata = largeRoomMetadata();
  const setCalls = [];
  const api = {
    async getMetadata() { return structuredClone(metadata); },
    async setMetadata(update) {
      setCalls.push(structuredClone(update));
      Object.assign(metadata, structuredClone(update));
    },
  };
  const plan = await reconcileOwnedRoomMetadataBudget(api, cacheEntries(), { logger: { warn() {} } });

  assert.ok(plan.fitsSafe);
  assert.ok(roomMetadataBytes(metadata) <= ROOM_METADATA_SAFE_LIMIT_BYTES);
  assert.equal(setCalls.length, 1);
  assert.deepEqual(metadata["com.other.extension/room-state"], { keep: "byte-for-byte" });
  assert.ok(Object.keys(setCalls[0]).every((key) => key.startsWith(`${ID}/`)));
});

test("ROOM-BUDGET-G/H: le chiavi piccole restano scrivibili con tutte le cache al massimo", async () => {
  const metadata = {
    [KEYS.actorVitals]: retainActorVitalsRegistryWithinByteBudget(actorVitalsFixture(90)),
    [KEYS.hpMemory]: retainHPMapWithinByteBudget(hpMemoryFixture(70)),
    [KEYS.cards]: retainInitiativeCardRegistryWithinByteBudget(initiativeCardsFixture(30)),
    [KEYS.faction]: retainFactionRegistryWithinByteBudget(factionFixture(90)),
    [KEYS.options]: optionsFixture(),
    [KEYS.ui]: { open: false, at: 1 },
    [KEYS.speed]: { version: 1, enabled: false, updatedAt: 1 },
  };
  const writes = [];
  const api = {
    async getMetadata() { return structuredClone(metadata); },
    async setMetadata(update) {
      writes.push(structuredClone(update));
      Object.assign(metadata, structuredClone(update));
    },
  };

  await writeRoomMetadataKey(api, METADATA_OWNERSHIP.ROOM_OPTIONS, {
    ...optionsFixture(),
    updatedAt: 2,
  }, { runtime: "budget-test" });
  await writeRoomMetadataKey(api, METADATA_OWNERSHIP.SHARED_UI, { open: true, at: 2 }, {
    runtime: "budget-test",
  });
  await writeRoomMetadataKey(api, METADATA_OWNERSHIP.SPEED_CHECK_CONTROL, {
    version: 1,
    enabled: true,
    updatedAt: 2,
  }, { runtime: "budget-test" });

  assert.equal(writes.length, 3);
  assert.ok(roomMetadataBytes(metadata) <= ROOM_METADATA_SAFE_LIMIT_BYTES);
});

test("ROOM-BUDGET: una write potata emette una sola diagnostica senza contenuto metadata", async () => {
  const metadata = {
    [KEYS.actorVitals]: actorVitalsFixture(260),
    [KEYS.hpMemory]: retainHPMapWithinByteBudget(hpMemoryFixture(70)),
    [KEYS.cards]: retainInitiativeCardRegistryWithinByteBudget(initiativeCardsFixture(30)),
    [KEYS.faction]: retainFactionRegistryWithinByteBudget(factionFixture(90)),
  };
  const warnings = [];
  const api = {
    async getMetadata() { return structuredClone(metadata); },
    async setMetadata(update) { Object.assign(metadata, structuredClone(update)); },
  };

  await writeRoomMetadataKey(api, METADATA_OWNERSHIP.ACTOR_VITALS, actorVitalsFixture(260), {
    runtime: "budget-diagnostic-test",
    roomBudget: { retain: retainActorVitalsRegistryWithinByteBudget },
    logger: { warn: (...args) => warnings.push(args) },
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "[room-metadata-budget]");
  assert.equal(warnings[0][1].domain, "actor-vitals");
  assert.equal(warnings[0][1].key, KEYS.actorVitals);
  assert.equal(warnings[0][1].pruned, true);
  assert.ok(Number.isFinite(warnings[0][1].totalBeforeBytes));
  assert.doesNotMatch(JSON.stringify(warnings), /actor-259/);
});

test("ROOM-BUDGET-I: scritture ripetute tra cache diverse convergono senza oscillazione", () => {
  let metadata = {};
  const writes = [
    [KEYS.actorVitals, actorVitalsFixture(90), retainActorVitalsRegistryWithinByteBudget],
    [KEYS.hpMemory, hpMemoryFixture(70), retainHPMapWithinByteBudget],
    [KEYS.cards, initiativeCardsFixture(30), retainInitiativeCardRegistryWithinByteBudget],
    [KEYS.faction, factionFixture(90), retainFactionRegistryWithinByteBudget],
    [KEYS.actorVitals, actorVitalsFixture(90), retainActorVitalsRegistryWithinByteBudget],
    [KEYS.cards, initiativeCardsFixture(30), retainInitiativeCardRegistryWithinByteBudget],
  ];
  for (const [key, value, retain] of writes) {
    const plan = planRoomMetadataWrite(metadata, key, value, { retain });
    assert.ok(plan.fitsHard);
    metadata = { ...metadata, [key]: plan.persistedValue };
    assert.ok(roomMetadataBytes(metadata) <= ROOM_METADATA_SAFE_LIMIT_BYTES);
  }
  const stable = compactOwnedRoomMetadata(metadata, cacheEntries());
  assert.equal(stable.updates[KEYS.actorVitals], undefined);
  assert.equal(stable.updates[KEYS.cards], undefined);
});

test("ROOM-BUDGET-J: una entry singola troppo grande viene saltata senza spezzarla", () => {
  const source = {
    old: { attitude: "enemy", name: "x".repeat(10_000), updatedAt: 1 },
    recent: { attitude: "ally", name: "recent", updatedAt: 2 },
  };
  const retained = retainFactionRegistryWithinByteBudget(source, 120);

  assert.ok(jsonBytes(retained) <= 120);
  assert.deepEqual(Object.keys(retained), ["recent"]);
});

test("ROOM-BUDGET: i budget individuali e il ceiling aggregato sono documentati", () => {
  const total = Object.values(ROOM_METADATA_DOMAIN_MAX_BYTES)
    .reduce((sum, value) => sum + value, 0);
  assert.equal(ACTOR_VITALS_DEFAULT_ROOM_MAX_BYTES, 2_500);
  assert.ok(total < ROOM_METADATA_SAFE_LIMIT_BYTES);
  assert.equal(ROOM_METADATA_HARD_LIMIT_BYTES - ROOM_METADATA_SAFE_LIMIT_BYTES, 1_500);
});
