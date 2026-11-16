import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Lot GA4 of docs/STUDIO_GIOCO_ONLINE.md, after the first room test (P1, P4): the «Giocatori» panel reads this Room's
// cards alone, and its ✕ takes a character's card out of this Room only: no tombstone (which would empty the card of
// a token at its next sheet opening), the GM's browser copy untouched (its keys are shared by every room).
const ID = "com.thebigpicture.initiative";
const CARD_KEY = `${ID}/initiativeCards`;
const LOCAL_KEY = `${ID}/initiativeCards/local`;
const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const room = { metadata: {} };
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: (key) => { storage.delete(key); },
};
const builder = () => new Proxy({}, { get: (target, key) => (key === "build" ? () => ({ id: "built" }) : () => target) });
mock.module("@owlbear-rodeo/sdk", {
  namedExports: {
    buildLabel: builder, buildImage: builder, buildPath: builder, buildText: builder, buildShape: builder,
    Command: class Command {},
  },
  defaultExport: {
    onReady() {},
    player: { id: "gm", getRole: async () => "GM", getId: async () => "gm" },
    room: {
      id: "room-a",
      getMetadata: async () => clone(room.metadata),
      setMetadata: async (update) => { room.metadata = { ...room.metadata, ...clone(update) }; },
      onMetadataChange: () => () => {},
    },
    scene: { isReady: async () => true, onReadyChange: () => () => {}, items: { getItems: async () => [] } },
    notification: { show: async () => {} },
    broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
  },
});
const { forgetInitiativeCardRegistryCharacter, readInitiativeCardRegistry } = await import("../src/initiativeCards.js");

const lyraId = "actor_7f8c2a10-1111-4b22-9c33-0123456789ab";
const lyra = { actorProfileId: lyraId, name: "Lyra", profile: { actorProfileId: lyraId, armorClass: 15 }, updatedAt: 10 };
const gundren = { name: "Gundren", profile: { armorClass: 12 }, updatedAt: 11 };
const otherRoom = { name: "Strahd", profile: { armorClass: 16 }, updatedAt: 3 };

test("GA4 (P1, P4): il registro della stanza a parte, e ✕ toglie la scheda solo da questa stanza", async () => {
  room.metadata = { [CARD_KEY]: { lyra, "asset:lyra.png": lyra, gundren } };
  storage.set(LOCAL_KEY, JSON.stringify({ lyra, gundren, strahd: otherRoom }));

  const before = await readInitiativeCardRegistry();
  assert.deepEqual(Object.keys(before.room).sort(), ["asset:lyra.png", "gundren", "lyra"], "this Room's cards alone");
  assert.ok(before.registry.strahd, "the merged registry still has the other rooms' cards of this browser");

  const localBefore = storage.get(LOCAL_KEY);
  assert.equal(await forgetInitiativeCardRegistryCharacter({ name: "Gundren" }), 1);
  const after = await readInitiativeCardRegistry();
  assert.deepEqual(Object.keys(after.room).sort(), ["asset:lyra.png", "lyra"], "out of the Room, with no tombstone");
  assert.equal(storage.get(LOCAL_KEY), localBefore, "the browser copy is untouched");

  assert.equal(await forgetInitiativeCardRegistryCharacter({ actorProfileId: lyraId, name: "Lyra" }), 2, "every key of the identity");
  assert.deepEqual((await readInitiativeCardRegistry()).room, {});
  assert.equal(await forgetInitiativeCardRegistryCharacter({ name: "Strahd" }), 0, "a card of another room is not this Room's");
  assert.equal(storage.get(LOCAL_KEY), localBefore);
});
