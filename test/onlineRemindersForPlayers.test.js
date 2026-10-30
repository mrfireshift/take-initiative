import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { noticeReachesPlayer, withNoticeTargetPlayers } from "../src/playerAssignmentCore.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectPlayerRemindersMineOnly, selectPlayerScreenPreferences } from "../src/options/optionsSelectors.js";
import { applyPlayerScreenChange } from "../src/playerScreenCore.js";

// Audit online, lot O4b (Online room profile): reminders name the players of their targets, a death save reaches its
// character's player alone, «Promemoria: solo i miei» keeps a player's own, and a screen that opens mid-combat gets
// the turn in course. The Table profile changes nothing.
const byToken = new Map([["hero", "user-mario"], ["mage", "user-anna"]]);

test("i promemoria per i giocatori nominano i giocatori dei bersagli, non del caster", () => {
  const notices = withNoticeTargetPlayers([
    { activationId: "a", target: { id: "hero" }, casterId: "mage" },
    { activationId: "b", targets: [{ id: "orc" }, { id: "mage" }, { id: "hero" }] },
    { activationId: "c", target: { id: "orc" } },
  ], byToken);
  assert.deepEqual(notices.map((notice) => notice.targetPlayerIds), [["user-mario"], ["user-anna", "user-mario"], undefined]);
  const untouched = [{ activationId: "x", target: { id: "hero" } }];
  assert.equal(withNoticeTargetPlayers(untouched, new Map()), untouched, "Table profile: no players, same copy");
});

test("un TS contro la morte va al giocatore del PG; senza assegnazione resta a tutti; il GM vede sempre", () => {
  const assigned = { activationId: "hero:death-save:1", targetPlayerIds: ["user-mario"] };
  assert.equal(noticeReachesPlayer(assigned, "user-mario", { deathSave: true }), true);
  assert.equal(noticeReachesPlayer(assigned, "user-anna", { deathSave: true }), false);
  assert.equal(noticeReachesPlayer({ activationId: "npc:death-save:1" }, "user-anna", { deathSave: true }), true);
  assert.equal(noticeReachesPlayer(assigned, "user-gm", { deathSave: true, role: "GM" }), true);
  assert.equal(noticeReachesPlayer({ activationId: "z", targetPlayerIds: ["user-mario"] }, "user-anna"), true, "other reminders: everyone");
});

test("con «solo i miei» restano i promemoria dei propri personaggi, e vale solo in Online", () => {
  assert.equal(noticeReachesPlayer({ targetPlayerIds: ["user-mario"] }, "user-mario", { mineOnly: true }), true);
  assert.equal(noticeReachesPlayer({ targetPlayerIds: ["user-anna"] }, "user-mario", { mineOnly: true }), false);
  assert.equal(noticeReachesPlayer({}, "user-mario", { mineOnly: true }), false);
  const local = applyPlayerScreenChange({}, { remindersMineOnly: true });
  assert.equal(local.runtime.playerRemindersMineOnly, true);
  assert.equal(selectPlayerRemindersMineOnly(resolveOptions({ local })), false, "Table profile");
  assert.equal(selectPlayerRemindersMineOnly(resolveOptions({ local, room: { profile: "online" } })), true);
  assert.equal(selectPlayerScreenPreferences(resolveOptions({ local })).remindersMineOnly, true);
});

test("il GM annota la copia per i giocatori e l'host filtra senza perdere la chiusura dei promemoria", () => {
  const broadcast = readFileSync(new URL("../src/options/reminderProjectionBroadcast.js", import.meta.url), "utf8");
  const host = readFileSync(new URL("../src/turnNoticeHost.js", import.meta.url), "utf8");
  assert.match(broadcast, /await noticeTokenInfo\(rawNotices, \{ withPlayers: online \}\)/);
  assert.match(broadcast, /withNoticeTargetPlayers\(withoutHiddenTokenNotices\(projectedPlayerNotices, tokenInfo\.hidden\), tokenInfo\.playersByToken\)/);
  assert.match(host, /const deathSaves = noticesForThisScreen\(allDeathSaves, \{ deathSave: true \}\);/);
  assert.match(host, /if \(!allDeathSaves\.length \|\| rest\.notices\.length\) receiveNoticePayload\(rest\);/);
});

test("chi entra a combattimento in corso chiede il turno al GM, che risponde solo a lui e solo in Online", () => {
  const host = readFileSync(new URL("../src/turnNoticeHost.js", import.meta.url), "utf8");
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(host, /if \(runtimeOptionsService\.get\(selectOnlineRoomProfile\) !== true\) return;/);
  assert.match(host, /if \(event\.data\.replayFor && event\.data\.replayFor !== ownConnectionId\) return;/);
  assert.match(tracker, /if \(event\?\.data\?\.type !== "turn-notice-replay-request" \|\| !connectionId \|\| !__onlineRoomProfile\(\)\) return;/);
  assert.match(tracker, /if \(!notice \|\| notice\.currentHidden\) return;/);
  assert.match(tracker, /replayFor: connectionId,\s*\}, \{ destination: "REMOTE" \}\)/);
});
