import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  localPlayerNamesWith,
  normalizePlayerAssignmentMemory,
  playerAssignmentMemoryWith,
  playerMemoryKeyOfItem,
  rememberedPlayerForItem,
  retainPlayerAssignmentMemoryWithinByteBudget,
} from "../src/playerAssignmentMemoryCore.js";
import { jsonBytes, ROOM_METADATA_DOMAIN_MAX_BYTES } from "../src/roomMetadataBudget.js";

// Audit online, lot O3: the players assigned to the characters are remembered in the room (short keys, within a
// small share of the 16 kB room metadata) and given back to the characters' tokens in every scene.
const META_KEY = "com.thebigpicture.initiative/meta";
const MEMORY_KEY = "com.thebigpicture.initiative/playerAssignments";
const token = (id, meta, name = "Eroe") => ({ id, name, metadata: { [META_KEY]: meta } });
const hero = token("hero", { attitude: "pc", actorProfileId: "actor_7f8c2a10-1111-4b22-9c33-0123456789ab" }, "Eroe");

test("la chiave del personaggio viene dal profilo della card, se no dal nome", () => {
  const byProfile = playerMemoryKeyOfItem(hero);
  assert.match(byProfile, /^a[0-9a-z]+$/);
  assert.equal(playerMemoryKeyOfItem({ ...hero, id: "other-token", name: "Altro nome" }), byProfile, "same character, other token");
  assert.match(playerMemoryKeyOfItem(token("x", { attitude: "pc" }, "Lyra")), /^n[0-9a-z]+$/);
  assert.equal(playerMemoryKeyOfItem(token("x", { attitude: "pc" }, "")), "");
});

test("la memoria tiene l'ultima scelta in fondo e dimentica con Nessuno", () => {
  let memory = playerAssignmentMemoryWith({}, "aaa1", "user-mario");
  memory = playerAssignmentMemoryWith(memory, "abbb2", "user-anna");
  memory = playerAssignmentMemoryWith(memory, "aaa1", "user-luca");
  assert.deepEqual(Object.entries(memory), [["abbb2", "user-anna"], ["aaa1", "user-luca"]]);
  assert.deepEqual(playerAssignmentMemoryWith(memory, "aaa1", null), { abbb2: "user-anna" });
  assert.deepEqual(normalizePlayerAssignmentMemory({ "bad key": "user-x", aok: "none", aok2: "user-y" }), { aok2: "user-y" });
});

test("oltre il budget della stanza resta la scelta più recente", () => {
  const userId = "user-0123456789abcdef0123456789ab";
  let memory = {};
  for (let index = 0; index < 20; index += 1) memory = playerAssignmentMemoryWith(memory, `a${index.toString(36)}x`, userId);
  const retained = retainPlayerAssignmentMemoryWithinByteBudget(memory);
  assert.ok(jsonBytes(retained) <= ROOM_METADATA_DOMAIN_MAX_BYTES["player-assignments"]);
  assert.ok(Object.keys(retained).length >= 6, "room for a party of six with long user ids");
  assert.equal(Object.keys(retained).at(-1), "ajx", "the newest stays");
});

test("un PG senza giocatore riceve quello ricordato, con nome e colore dei collegati o del browser del GM", () => {
  const memory = { [playerMemoryKeyOfItem(hero)]: "user-mario" };
  const online = rememberedPlayerForItem(hero, memory, { players: [{ id: "user-mario", name: "Mario", color: "#ef4444" }] });
  assert.deepEqual(online, { id: "user-mario", name: "Mario", color: "#ef4444" });
  const offline = rememberedPlayerForItem(hero, memory, { localNames: localPlayerNamesWith({}, { id: "user-mario", name: "Mario", color: "#ef4444" }) });
  assert.deepEqual(offline, { id: "user-mario", name: "Mario", color: "#ef4444" });
  assert.equal(rememberedPlayerForItem(hero, memory).name, "Giocatore");
  const assigned = token("hero", { ...hero.metadata[META_KEY], assignedPlayer: { id: "user-anna", name: "Anna" } });
  assert.equal(rememberedPlayerForItem(assigned, memory), null, "the GM's current choice wins");
  assert.equal(rememberedPlayerForItem(token("orc", { attitude: "enemy", actorProfileId: "actor_x" }), memory), null);
});

test("il budget della chiave nuova resta dentro il tetto di sicurezza della stanza", async () => {
  const { ROOM_METADATA_SAFE_LIMIT_BYTES } = await import("../src/roomMetadataBudget.js");
  const total = Object.values(ROOM_METADATA_DOMAIN_MAX_BYTES).reduce((sum, value) => sum + value, 0);
  assert.ok(total < ROOM_METADATA_SAFE_LIMIT_BYTES);
});

// The runtime, with a fake SDK: saving from the menu, and the GM's background giving the player back.
let env;
const sdk = {};
mock.module("@owlbear-rodeo/sdk", { defaultExport: sdk });
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub("../src/sceneItemEvents.js", {
  readSceneItemsSnapshot: () => ({ complete: true, items: structuredClone(env.items) }),
  subscribeSceneItemChanges: (handler) => { env.itemHandler = handler; return () => {}; },
});
stub("../src/sceneEpoch.js", {
  currentSceneEpoch: () => 1,
  isCurrentSceneEpoch: () => true,
  subscribeSceneEpoch: (listener) => { env.epochListener = listener; return () => {}; },
});
stub("../src/options/optionsRuntime.js", {
  runtimeOptionsService: { subscribe: (_selector, listener) => { env.profileListener = listener; return () => {}; } },
});
stub("../src/metadataKeyScoped.js", {
  METADATA_OWNERSHIP: { PLAYER_ASSIGNMENTS: { key: MEMORY_KEY } },
  writeRoomMetadataKey: async (_room, contract, value) => { env.room[contract.key] = structuredClone(value); env.roomWrites += 1; },
});
const { mountPlayerAssignmentMemory, rememberPlayerAssignment } = await import("../src/playerAssignmentMemory.js");

function fakeObr() {
  return {
    player: { id: "user-gm" },
    party: { getPlayers: async () => [{ id: "user-mario", name: "Mario", color: "#ef4444", role: "PLAYER" }] },
    room: {
      getMetadata: async () => structuredClone(env.room),
      onMetadataChange: (listener) => { env.roomListener = listener; return () => {}; },
      getPermissions: async () => ["CHARACTER_OWNER_ONLY", "CHARACTER_UPDATE"],
    },
    scene: {
      items: {
        async updateItems(ids, update) {
          const drafts = env.items.filter((item) => ids.includes(item.id)).map((item) => structuredClone(item));
          update(drafts);
          for (const draft of drafts) env.items[env.items.findIndex((item) => item.id === draft.id)] = draft;
        },
      },
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

test("la scelta del GM si salva nella stanza e Nessuno la toglie", async () => {
  env = { room: {}, items: [], roomWrites: 0 };
  const obr = fakeObr();
  await rememberPlayerAssignment(hero, { id: "user-mario", name: "Mario", color: "#ef4444" }, { obr });
  assert.deepEqual(env.room[MEMORY_KEY], { [playerMemoryKeyOfItem(hero)]: "user-mario" });
  await rememberPlayerAssignment(hero, { id: "user-mario", name: "Mario" }, { obr });
  assert.equal(env.roomWrites, 1, "the same choice is not written twice");
  await rememberPlayerAssignment(hero, null, { obr });
  assert.deepEqual(env.room[MEMORY_KEY], {});
});

test("in Online il background del GM ridà al token il giocatore ricordato; in Tavolo non ascolta", async () => {
  env = { room: { [MEMORY_KEY]: { [playerMemoryKeyOfItem(hero)]: "user-mario" } }, items: [structuredClone(hero)], roomWrites: 0 };
  const obr = fakeObr();
  mountPlayerAssignmentMemory({ obr, service: { subscribe: (_selector, listener) => { env.profileListener = listener; return () => {}; } } });
  env.profileListener(false);
  await settle();
  assert.equal(env.items[0].metadata[META_KEY].assignedPlayer, undefined, "Table profile: nothing happens");

  env.profileListener(true);
  await settle();
  assert.deepEqual(env.items[0].metadata[META_KEY].assignedPlayer, { id: "user-mario", name: "Mario", color: "#ef4444" });
  assert.equal(env.items[0].createdUserId, "user-mario");
});
