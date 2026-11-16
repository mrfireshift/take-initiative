import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import {
  playerAssignmentMemoryForRow,
  playerAssignmentMemoryWithout,
  playerAssignmentPanelChoices,
  playerAssignmentPanelRows,
  playerAssignmentPanelTargets,
} from "../src/playerAssignmentPanelCore.js";
import { playerMemoryKeyOfItem } from "../src/playerAssignmentMemoryCore.js";

// Lot GA4 of docs/STUDIO_GIOCO_ONLINE.md: the «Giocatori» panel of the Options. The room's characters with the
// player each is remembered for, chosen without a token and without a scene; the same room memory as the card menu.
const META_KEY = "com.thebigpicture.initiative/meta";
const MEMORY_KEY = "com.thebigpicture.initiative/playerAssignments";
const lyraId = "actor_7f8c2a10-1111-4b22-9c33-0123456789ab";
const brunId = "actor_7f8c2a10-2222-4b22-9c33-0123456789ab";
const token = (id, name, meta, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", createdUserId: "user-gm",
  metadata: meta ? { [META_KEY]: meta } : {}, ...extra });
const lyraKey = playerMemoryKeyOfItem(token("x", "Lyra", { attitude: "pc", actorProfileId: lyraId }));
const nameKey = (name) => playerMemoryKeyOfItem(token("x", name, { attitude: "pc" }));
const registry = {
  "asset:lyra.png": { actorProfileId: lyraId, name: "Lyra", profile: { actorProfileId: lyraId }, updatedAt: 5 },
  lyra: { actorProfileId: lyraId, name: "Lyra", profile: { actorProfileId: lyraId }, updatedAt: 5 },
  brun: { actorProfileId: brunId, name: "Brun", profile: { actorProfileId: brunId }, updatedAt: 3 },
  goblin: { name: "Goblin", profile: { monster: { source: "5etools", ref: "Goblin|MM" } }, updatedAt: 9 },
  gone: { actorProfileId: "actor_gone", name: "Vecchio", profile: {}, deleted: true, updatedAt: 1 },
};

test("GA4: le righe sono i personaggi delle schede e della scena, una per personaggio, senza mostri", () => {
  const items = [
    token("t-lyra", "Lyra", { attitude: "pc", actorProfileId: lyraId }),
    token("t-tom", "Tom", { attitude: "ally" }),
    token("t-orc", "Orco", { attitude: "enemy" }),
  ];
  const memory = { [lyraKey]: "user-mario", [nameKey("Tom")]: "user-anna", azzz1: "user-old" };
  const { rows, orphanKeys } = playerAssignmentPanelRows(registry, memory, { items });
  assert.deepEqual(rows.map((row) => [row.name, row.userId]), [["Brun", ""], ["Lyra", "user-mario"], ["Tom", "user-anna"]]);
  assert.equal(rows.find((row) => row.name === "Lyra").writeKey, lyraKey, "saved under the identity's key, as the card menu");
  assert.deepEqual(orphanKeys, ["azzz1"], "a remembered character no row explains");
});

test("GA4: la scelta toglie le altre chiavi del personaggio; Nessuno lo dimentica", () => {
  const { rows } = playerAssignmentPanelRows(registry, {});
  const lyra = rows.find((row) => row.name === "Lyra");
  const before = { [nameKey("Lyra")]: "user-anna", other1: "user-x" };
  assert.deepEqual(playerAssignmentMemoryForRow({ ...before, aother: "user-x" }, lyra, "user-mario"),
    { aother: "user-x", [lyraKey]: "user-mario" }, "the name's key is forgotten, the identity's one written last");
  assert.deepEqual(playerAssignmentMemoryForRow({ [lyraKey]: "user-mario", aother: "user-x" }, lyra, null), { aother: "user-x" });
  assert.deepEqual(playerAssignmentMemoryWithout({ [lyraKey]: "user-mario", aother: "user-x" }, ["aother"]), { [lyraKey]: "user-mario" });
});

test("GA4: tra i giocatori i collegati, poi quelli che il browser del GM ricorda, poi un id ricordato senza nome", () => {
  const players = [{ id: "user-mario", name: "Mario", color: "#ef4444", role: "PLAYER" }, { id: "user-gm", name: "GM", role: "GM" }];
  const choices = playerAssignmentPanelChoices(players, { "user-anna": { name: "Anna", color: "#22c55e" }, "user-mario": { name: "Mario" } },
    ["user-mario", "user-zed"]);
  assert.deepEqual(choices.map((choice) => [choice.id, choice.name, choice.connected]),
    [["user-mario", "Mario", true], ["user-anna", "Anna", false], ["user-zed", "Giocatore", false]]);
});

test("GA4: i token della scena da assegnare subito sono quelli del personaggio che il tracker conosce", () => {
  const { rows } = playerAssignmentPanelRows(registry, {});
  const lyra = rows.find((row) => row.name === "Lyra");
  const items = [
    token("own", "Lyra", { attitude: "pc", actorProfileId: lyraId }),
    token("copy", "Lyra (2)", { attitude: "pc" }),
    token("done", "Lyra", { attitude: "pc", actorProfileId: lyraId, assignedPlayer: { id: "user-mario", name: "Mario" } }),
    token("fresh", "Lyra", null),
    token("brun", "Brun", { attitude: "pc", actorProfileId: brunId }),
  ];
  const registryActorOf = (item) => (item.id === "copy" ? lyraId : "");
  assert.deepEqual(playerAssignmentPanelTargets(items, lyra, "user-mario", { registryActorOf }), ["own", "copy"],
    "already theirs, not in the tracker (the background's, GA2) or another character: left");
  assert.deepEqual(playerAssignmentPanelTargets(items, lyra, "", { registryActorOf }), ["done"], "«Nessuno» clears the assigned one");
});

test("GA2 e GA4: initiativeCards.js esporta il registro che i due moduli caricano", () => {
  const source = readFileSync(new URL("../src/initiativeCards.js", import.meta.url), "utf8");
  assert.match(source, /export async function readInitiativeCardRegistry\(/);
});

// The runtime, with a fake SDK and a tiny DOM: a choice writes the memory, then the tracked token.
let env;
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.value = "";
    this.disabled = false;
    this.textContent = "";
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  removeEventListener() {}
  contains() { return false; }
  closest(selector) {
    const key = selector.match(/data-([a-z-]+)/)?.[1]?.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    return key && this.dataset[key] !== undefined ? this : null;
  }
  all() { return this.children.flatMap((child) => [child, ...(child.all?.() || [])]); }
}
globalThis.document = { createElement: (tag) => new FakeElement(tag), activeElement: null };
globalThis.Option = class extends FakeElement {
  constructor(text, value) { super("option"); this.textContent = text; this.value = value; }
};
const sdk = {};
mock.module("@owlbear-rodeo/sdk", { defaultExport: sdk });
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub("../src/metadataKeyScoped.js", {
  METADATA_OWNERSHIP: { PLAYER_ASSIGNMENTS: { key: MEMORY_KEY } },
  writeRoomMetadataKey: async (_room, contract, value) => {
    env.log.push("memory");
    env.room[contract.key] = structuredClone(value);
  },
});
stub("../src/initiativeCards.js", { readInitiativeCardRegistry: async () => ({ registry: structuredClone(registry) }) });
stub("../src/sceneItemEvents.js", { readSceneItemsSnapshot: () => ({ complete: true, items: [] }), subscribeSceneItemChanges: () => () => {} });
stub("../src/sceneEpoch.js", { currentSceneEpoch: () => 1, isCurrentSceneEpoch: () => true, subscribeSceneEpoch: () => () => {} });
stub("../src/options/optionsRuntime.js", { runtimeOptionsService: { subscribe: () => () => {} } });
const { mountPlayerAssignmentPanel } = await import("../src/playerAssignmentPanel.js");

function fakeObr() {
  return {
    player: { id: "user-gm" },
    party: { getPlayers: async () => [{ id: "user-mario", name: "Mario", color: "#ef4444", role: "PLAYER" }], onChange: () => () => {} },
    room: {
      getMetadata: async () => structuredClone(env.room),
      onMetadataChange: () => () => {},
      getPermissions: async () => ["CHARACTER_OWNER_ONLY", "CHARACTER_UPDATE"],
    },
    scene: {
      items: {
        async getItems() { return structuredClone(env.items); },
        async updateItems(ids, update) {
          env.log.push(`token:${ids.join(",")}`);
          const drafts = env.items.filter((item) => ids.includes(item.id)).map((item) => structuredClone(item));
          update(drafts);
          for (const draft of drafts) env.items[env.items.findIndex((item) => item.id === draft.id)] = draft;
        },
      },
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("GA4 nel pannello: la scelta va prima nella memoria, poi al token del tracker; Nessuno lo ridà al GM", async () => {
  env = { room: {}, items: [token("t-lyra", "Lyra", { attitude: "pc", actorProfileId: lyraId, hp: 12 })], log: [] };
  const container = new FakeElement("div");
  const notices = [];
  const panel = mountPlayerAssignmentPanel(container, { obr: fakeObr(), notify: (message) => notices.push(message) });
  await settle();
  const select = () => container.all().find((node) => node.dataset.playerAssignmentRow === `actor:${lyraId}`);
  assert.ok(select(), "Lyra's row is drawn");
  assert.deepEqual(select().children.map((option) => option.textContent), ["Nessuno", "Mario"]);

  const change = (value) => {
    const node = select();
    node.value = value;
    for (const listener of container.listeners.change) listener({ target: node });
  };
  change("user-mario");
  await settle();
  assert.deepEqual(env.room[MEMORY_KEY], { [lyraKey]: "user-mario" });
  assert.equal(env.log[0], "memory", "the memory first: the GM's background never gives the old player back");
  assert.deepEqual(env.items[0].metadata[META_KEY], {
    attitude: "pc", actorProfileId: lyraId, hp: 12, assignedPlayer: { id: "user-mario", name: "Mario", color: "#ef4444" },
  }, "merged into the token's metadata");
  assert.equal(env.items[0].createdUserId, "user-mario");
  assert.equal(select().value, "user-mario");
  assert.deepEqual(notices, ["Lyra: Mario."]);

  change("");
  await settle();
  assert.deepEqual(env.room[MEMORY_KEY], {});
  assert.equal(env.items[0].metadata[META_KEY].assignedPlayer, undefined);
  assert.equal(env.items[0].createdUserId, "user-gm", "back to the GM");
  panel.dispose();
});
