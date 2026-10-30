import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildTurnNoticePayload } from "../src/turnNotice.js";
import { turnNoticeForPlayer } from "../src/playerAssignmentCore.js";

// Audit online, lot O4a: in the Online room profile the turn notice still reaches everyone, and the player whose
// creature is in turn reads «Tocca a te» (it stays until the next turn), the next one «Tu» in «A seguire».
const entries = new Map([
  ["hero", { name: "Eroe", attitude: "pc", assignedPlayer: { id: "user-mario", name: "Mario", color: "#ef4444" } }],
  ["orc", { name: "Orco", attitude: "enemy" }],
  ["mage", { name: "Maga", attitude: "pc", assignedPlayer: { id: "user-anna", name: "Anna", color: "" } }],
  ["lurker", { name: "Ombra", attitude: "enemy", hiddenToken: true }],
]);

test("il payload porta chi gioca il turno e il successivo solo se assegnati", () => {
  const first = buildTurnNoticePayload({ order: ["hero", "orc", "mage"], current: 0, round: 1 }, entries);
  assert.equal(first.currentPlayerId, "user-mario");
  assert.equal(first.currentPlayerColor, undefined, "no player colour: it could read as a faction");
  assert.equal(first.nextPlayerId, undefined, "the orc has no player");
  const second = buildTurnNoticePayload({ order: ["hero", "orc", "mage"], current: 1, round: 1 }, entries);
  assert.equal(second.currentPlayerId, undefined);
  assert.equal(second.nextPlayerId, "user-anna");
  const hiddenNext = buildTurnNoticePayload({ order: ["orc", "lurker", "mage"], current: 0, round: 1 }, entries);
  assert.equal(hiddenNext.nextPlayerId, "user-anna", "the next creature the players know");
});

test("in Tavolo le entry non hanno giocatori e il payload resta quello di prima", () => {
  const table = new Map([["hero", { name: "Eroe", attitude: "pc" }], ["orc", { name: "Orco", attitude: "enemy" }]]);
  const payload = buildTurnNoticePayload({ order: ["hero", "orc"], current: 0, round: 2 }, table);
  assert.deepEqual(Object.keys(payload).filter((key) => key.includes("Player")), []);
});

test("ogni schermo capisce se il turno è suo o il prossimo; il GM mai", () => {
  const payload = { currentPlayerId: "user-mario", nextPlayerId: "user-anna" };
  assert.equal(turnNoticeForPlayer(payload, "user-mario"), "current");
  assert.equal(turnNoticeForPlayer(payload, "user-anna"), "next");
  assert.equal(turnNoticeForPlayer(payload, "user-luca"), "");
  assert.equal(turnNoticeForPlayer(payload, "user-mario", "GM"), "");
  assert.equal(turnNoticeForPlayer(payload, ""), "");
});

test("l'host segna l'avviso e non chiude il proprio turno a scheda nascosta; la pagina non lo fa scadere", () => {
  const host = readFileSync(new URL("../src/turnNoticeHost.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/turn-notice.ts", import.meta.url), "utf8");
  assert.match(host, /const forYou = turnNoticeForPlayer\(payload, selfPlayerId\(\), hostRole\);/);
  assert.match(host, /currentNoticeSticky = forYou === "current";/);
  assert.match(host, /\|\| pendingPayloads\.length\s*\|\| currentNoticeSticky\s*\) return;/);
  assert.match(page, /eyebrow\.textContent = mine \? "Tocca a te" : "Iniziativa";/);
  assert.match(page, /hideTimer = notice\.forYou === "current" \? 0 : window\.setTimeout\(hideCurrent, AUTO_CLOSE_MS\);/);
  assert.match(page, /nextName\.textContent = notice\.forYou === "next" \? `Tu · \$\{shownNextName\}` : shownNextName;/);
});
