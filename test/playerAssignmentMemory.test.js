import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  adoptedOwnerForItem,
  localPlayerNamesWith,
  normalizePlayerAssignmentMemory,
  playerAssignmentMemoryWith,
  playerMemoryKeyOfItem,
  playerMemoryKeysOfItem,
  rememberedOwnerForItem,
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
// Lot GA2: the card registry the memory reads to recognise a token with no identity yet.
stub("../src/initiativeCards.js", {
  readInitiativeCardRegistry: async () => ({ registry: structuredClone(env.registry || {}) }),
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
        async getItems() { return structuredClone(env.items); },
        // Lot GA3: the raw changes, where the owner is seen.
        onChange(listener) { env.ownerListener = listener; return () => {}; },
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

// Lot GA2 of docs/STUDIO_GIOCO_ONLINE.md: a character's token with no identity yet is recognised through the card
// registry; one the tracker does not know gets its player as Owlbear owner only, to move it before the initiative.
const character = (id, meta, extra = {}) => ({ id, name: "Eroe", type: "IMAGE", layer: "CHARACTER", createdUserId: "user-gm",
  ...(meta ? { metadata: { [META_KEY]: meta } } : { metadata: {} }), ...extra });
const heroId = hero.metadata[META_KEY].actorProfileId;
const heroEntry = { eroe: { actorProfileId: heroId, name: "Eroe", profile: { armorClass: 16, actorProfileId: heroId }, updatedAt: 10 } };

test("GA2: le chiavi del personaggio: la sua, quella che il registro riconosce, il nome", () => {
  const fresh = character("fresh", null);
  assert.deepEqual(playerMemoryKeysOfItem(fresh, heroId), [playerMemoryKeyOfItem(hero), playerMemoryKeyOfItem(fresh)]);
  assert.deepEqual(playerMemoryKeysOfItem(hero, "actor_other"), [playerMemoryKeyOfItem(hero), playerMemoryKeyOfItem(fresh)],
    "a token with its own identity keeps it first; the registry's is not asked");
  const memory = { [playerMemoryKeyOfItem(hero)]: "user-mario" };
  // A character the tracker knows, still without identity (case C): found through the registry.
  const known = character("known", { attitude: "pc" });
  assert.equal(rememberedPlayerForItem(known, memory, { registryActorProfileId: heroId })?.id, "user-mario");
  assert.equal(rememberedPlayerForItem(known, memory), null, "without the registry the keys do not meet");
});

test("GA2: un PG nuovo senza metadati riceve solo il proprietario ricordato", () => {
  const memory = { [playerMemoryKeyOfItem(hero)]: "user-mario" };
  assert.equal(rememberedOwnerForItem(character("fresh", null), memory, { registryActorProfileId: heroId }), "user-mario");
  assert.equal(rememberedOwnerForItem(character("fresh", null, { createdUserId: "user-mario" }), memory, { registryActorProfileId: heroId }), "",
    "already theirs");
  assert.equal(rememberedOwnerForItem(character("known", { attitude: "pc" }), memory, { registryActorProfileId: heroId }), "",
    "a token the tracker knows takes the usual assignment");
  assert.equal(rememberedOwnerForItem(character("prop", null, { layer: "PROP" }), memory, { registryActorProfileId: heroId }), "");
  assert.equal(rememberedOwnerForItem(character("other", null, { name: "Altro" }), memory), "", "nothing remembered for it");
});

test("GA3: il proprietario dato dal menu Owner di Owlbear diventa il giocatore assegnato", () => {
  const players = [{ id: "user-mario", name: "Mario", color: "#ef4444", role: "PLAYER" }, { id: "user-gm", name: "GM", role: "GM" }];
  const pc = (owner, assigned = null) => character("pc", { attitude: "pc", ...(assigned ? { assignedPlayer: assigned } : {}) }, { createdUserId: owner });
  assert.deepEqual(adoptedOwnerForItem(pc("user-mario"), players), { id: "user-mario", name: "Mario", color: "#ef4444" });
  assert.equal(adoptedOwnerForItem(pc("user-gm"), players), null, "back to the GM: the assignment stays (G4)");
  assert.equal(adoptedOwnerForItem(pc("user-mario", { id: "user-mario", name: "Mario" }), players), null, "already theirs");
  assert.equal(adoptedOwnerForItem(pc("user-gone"), players), null, "not a connected player");
  assert.equal(adoptedOwnerForItem(character("orc", { attitude: "enemy" }, { createdUserId: "user-mario" }), players), null);
});

test("GA2 e GA3 nel background del GM: proprietario al PG nuovo, Owner di Owlbear adottato", async () => {
  env = { room: { [MEMORY_KEY]: { [playerMemoryKeyOfItem(hero)]: "user-mario" } }, items: [character("fresh", null)], roomWrites: 0,
    registry: heroEntry };
  const obr = fakeObr();
  mountPlayerAssignmentMemory({ obr, service: { subscribe: (_selector, listener) => { env.profileListener = listener; return () => {}; } } });
  env.profileListener(true);
  await settle();
  assert.equal(env.items[0].createdUserId, "user-mario", "the new token is the player's at once");
  assert.deepEqual(env.items[0].metadata, {}, "no plugin metadata on a token the tracker does not know");

  // GA3: a character of the tracker without a player; the GM gives it to Mario from Owlbear's Owner menu.
  env.items = [character("pc", { attitude: "pc", actorProfileId: "actor_other-1111" })];
  env.ownerListener(structuredClone(env.items));
  env.items[0].createdUserId = "user-mario";
  env.ownerListener(structuredClone(env.items));
  await settle();
  assert.deepEqual(env.items[0].metadata[META_KEY].assignedPlayer, { id: "user-mario", name: "Mario", color: "#ef4444" });
  assert.equal(env.room[MEMORY_KEY][playerMemoryKeyOfItem(env.items[0])], "user-mario", "and it is remembered");
});
