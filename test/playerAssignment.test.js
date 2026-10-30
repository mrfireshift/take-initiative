import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";
import {
  assignablePlayers,
  cardPlayerAssignment,
  cardPlayerAssignmentTitle,
  isPlayerAssignmentValue,
  playerAssignmentMenuChoices,
  playerAssignmentOfItem,
  pluginMetaWithPlayerAssignment,
} from "../src/playerAssignmentCore.js";
import { isAllowedInitiativeCardMenuAction } from "../src/menuPopoverProtocolCore.js";
import {
  buildInitiativeCardContextMenuPayload,
  routeInitiativeCardContextMenuAction,
} from "../src/initiativeMenuActionsCore.js";
import { buildCompactCardName } from "../src/initiativeCardCompact.js";

mock.module("@owlbear-rodeo/sdk", { defaultExport: {} });
const { writePlayerAssignment } = await import("../src/playerAssignmentWriter.js");

// Audit online, lot O3: the GM assigns every character's token to a connected player from the card menu (Online room
// profile only); the plugin keeps it in the token's metadata and makes that player the Owlbear owner.
const META_KEY = "com.thebigpicture.initiative/meta";
const mario = { id: "user-mario", name: "Mario", color: "#ef4444", role: "PLAYER", connectionId: "c1" };
const anna = { id: "user-anna", name: "Anna", color: "#22c55e", role: "PLAYER", connectionId: "c2" };
const gm = { id: "user-gm", name: "Federico", role: "GM", connectionId: "c0" };

test("l'assegnazione si scrive in fusione nel meta e si rilegge dal token", () => {
  const metadata = { [META_KEY]: { hp: 12, tableSide: "south" } };
  const next = pluginMetaWithPlayerAssignment(metadata, mario);
  assert.deepEqual(next, { hp: 12, tableSide: "south", assignedPlayer: { id: "user-mario", name: "Mario", color: "#ef4444" } });
  assert.deepEqual(playerAssignmentOfItem({ metadata: { [META_KEY]: next } }), { id: "user-mario", name: "Mario", color: "#ef4444" });
  assert.deepEqual(pluginMetaWithPlayerAssignment({ [META_KEY]: next }, null), { hp: 12, tableSide: "south" });
  assert.equal(playerAssignmentOfItem({ metadata: { [META_KEY]: { assignedPlayer: { id: "bad id!" } } } }), null);
});

test("il menu offre i giocatori collegati, quello assegnato anche se non c'è, poi Nessuno", () => {
  assert.deepEqual(assignablePlayers([mario, gm, anna, { ...mario, connectionId: "c9" }]).map((p) => p.name), ["Anna", "Mario"]);
  const choices = playerAssignmentMenuChoices([anna], { id: "user-mario", name: "Mario", color: "#ef4444" });
  assert.deepEqual(choices.map((p) => [p.id, p.name]), [
    ["user-anna", "Anna"], ["user-mario", "Mario (non collegato)"], ["none", "Nessuno"],
  ]);
});

test("la card mostra il giocatore al GM e «il tuo personaggio» al giocatore stesso", () => {
  const assigned = { id: "user-mario", name: "Mario", color: "#ef4444" };
  assert.deepEqual(cardPlayerAssignment(assigned, { isGm: true, selfId: "user-gm" }), { name: "Mario", color: "#ef4444", mine: false });
  assert.equal(cardPlayerAssignment(assigned, { isGm: false, selfId: "user-mario" }).mine, true);
  assert.equal(cardPlayerAssignment(null), null);
  assert.equal(cardPlayerAssignmentTitle({ name: "Mario", mine: false }), "Giocatore: Mario");
  assert.equal(cardPlayerAssignmentTitle({ name: "Mario", mine: true }), "Il tuo personaggio");
});

test("il protocollo accetta solo un id di Owlbear o Nessuno", () => {
  assert.equal(isPlayerAssignmentValue("none"), true);
  assert.equal(isAllowedInitiativeCardMenuAction("assign-player", "user-mario"), true);
  assert.equal(isAllowedInitiativeCardMenuAction("assign-player", "none"), true);
  assert.equal(isAllowedInitiativeCardMenuAction("assign-player", "<script>"), false);
  assert.equal(isAllowedInitiativeCardMenuAction("assign-player", ""), false);
});

test("il menu «Giocatore» c'è solo con le scelte (profilo Online) e per un PG o alleato singolo", async () => {
  const pc = { id: "hero", name: "Eroe", attitude: "pc" };
  const choices = playerAssignmentMenuChoices([mario], null);
  const online = buildInitiativeCardContextMenuPayload({ sourceEntry: pc, scopeIds: ["hero"], playerChoices: choices, playerId: "none" });
  assert.equal(online.showPlayerMenu, true);
  assert.equal(online.playerId, "none");
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: pc, scopeIds: ["hero"] }).showPlayerMenu, undefined, "Table profile");
  const enemy = buildInitiativeCardContextMenuPayload({ sourceEntry: { id: "orc", attitude: "enemy" }, scopeIds: ["orc"], playerChoices: choices });
  assert.equal(enemy.showPlayerMenu, undefined);
  const calls = [];
  const routed = await routeInitiativeCardContextMenuAction({ sourceEntry: pc, scopeIds: ["hero"] },
    { action: "assign-player", value: "user-mario" }, { setPlayer: (entry, id) => calls.push([entry.id, id]) });
  assert.equal(routed, true);
  assert.deepEqual(calls, [["hero", "user-mario"]]);
});

function fakeObr({ refuseOwner = false, permissions = [] } = {}) {
  const items = [{ id: "hero", createdUserId: "user-gm", metadata: { [META_KEY]: { hp: 12, conditions: { version: 2 } } } }];
  return {
    items,
    room: { getPermissions: async () => permissions },
    scene: {
      items: {
        async updateItems(ids, update) {
          const drafts = structuredClone(items.filter((item) => ids.includes(item.id)));
          update(drafts);
          if (refuseOwner && drafts.some((draft, index) => draft.createdUserId !== items[index].createdUserId)) {
            throw new Error("Permission denied");
          }
          for (const draft of drafts) items[items.findIndex((item) => item.id === draft.id)] = draft;
        },
      },
    },
  };
}

test("lo scrittore conserva il resto del meta e rende il giocatore proprietario", async () => {
  const obr = fakeObr({ permissions: ["CHARACTER_OWNER_ONLY"] });
  const result = await writePlayerAssignment(["hero"], mario, { obr, fallbackOwnerId: "user-gm" });
  assert.deepEqual(result, { written: true, owner: true, ownerOnly: true });
  assert.equal(obr.items[0].createdUserId, "user-mario");
  assert.equal(obr.items[0].metadata[META_KEY].hp, 12);
  assert.equal(obr.items[0].metadata[META_KEY].assignedPlayer.id, "user-mario");

  const cleared = await writePlayerAssignment(["hero"], null, { obr, fallbackOwnerId: "user-gm" });
  assert.equal(cleared.written, true);
  assert.equal(obr.items[0].createdUserId, "user-gm", "Nessuno gives the token back to the GM");
  assert.equal(Object.hasOwn(obr.items[0].metadata[META_KEY], "assignedPlayer"), false);
});

test("se Owlbear rifiuta il proprietario l'assegnazione resta e lo scrittore lo dice", async () => {
  const obr = fakeObr({ refuseOwner: true });
  const result = await writePlayerAssignment(["hero"], mario, { obr, fallbackOwnerId: "user-gm" });
  assert.deepEqual(result, { written: true, owner: false, ownerOnly: false });
  assert.equal(obr.items[0].metadata[META_KEY].assignedPlayer.name, "Mario");
  assert.equal(obr.items[0].createdUserId, "user-gm");
});

test("la card compatta sottolinea il nome nel colore del giocatore", () => {
  const element = () => ({ style: {}, dataset: {}, title: "", textContent: "" });
  const documentRef = { createElement: element };
  const name = buildCompactCardName({ name: "Eroe", assignedPlayer: { name: "Mario", color: "#ef4444", mine: false } },
    { active: false, documentRef });
  assert.equal(name.dataset.cardPlayer, "assigned");
  assert.equal(name.style.boxShadow, "inset 0 -1px 0 #ef4444");
  assert.match(name.title, /Giocatore: Mario/);
  assert.equal(buildCompactCardName({ name: "Eroe" }, { active: false, documentRef }).style.boxShadow, undefined);
});

test("la card estesa e il tracker mostrano il giocatore solo nel profilo Online", () => {
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const classic = readFileSync(new URL("../src/initiativeCardClassicBuilder.js", import.meta.url), "utf8");
  assert.match(tracker, /assignedPlayer: __onlineRoomProfile\(\)\s*\? cardPlayerAssignment\(/);
  assert.match(tracker, /\.\.\.\(__onlineRoomProfile\(\) && IS_GM && sourceItem \? \{\s*playerChoices:/);
  assert.match(classic, /if \(e\.assignedPlayer && !e\.__groupCollapsed\) \{/);
});
