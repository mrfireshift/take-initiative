import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDefaultLocalOptions, createDefaultRoomOptions } from "../src/options/optionsDefaults.js";
import { compactRoomOptionsForStorage, normalizeLocalOptions, normalizeRoomOptions } from "../src/options/optionsNormalize.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import {
  selectOnlineRoomProfile,
  selectOptionsPanelModel,
  selectPlayerFollowActiveTurn,
} from "../src/options/optionsSelectors.js";
import { buildOptionsPanelPatches, normalizeOptionsPanelDraft } from "../src/options/optionsPanelCore.js";
import {
  combatStarted,
  keepsTrackerDismissed,
  normalizeTrackerDismissal,
  readTrackerDismissal,
  trackerDismissalFor,
  writeTrackerDismissal,
} from "../src/trackerDismissalCore.js";

// Audit online, lot O2a: the room profile "online" lets players keep their own view (camera, tracker closed); the
// default profile "table" must leave the table screen exactly as it was.

test("il profilo della stanza parte da Tavolo e accetta solo tavolo o online", () => {
  assert.equal(createDefaultRoomOptions().profile, "table");
  assert.equal(normalizeRoomOptions({}).profile, "table");
  assert.equal(normalizeRoomOptions({ profile: "online" }).profile, "online");
  assert.equal(normalizeRoomOptions({ profile: "ibrido" }).profile, "table");
  // The default is not stored: an existing room keeps the same document.
  assert.equal(Object.hasOwn(compactRoomOptionsForStorage({}), "profile"), false);
  assert.equal(compactRoomOptionsForStorage({ profile: "online" }).profile, "online");
});

test("il Segui del giocatore è spento di default e si legge dai selettori", () => {
  assert.equal(createDefaultLocalOptions().tracker.playerFollowActiveTurn, false);
  assert.equal(normalizeLocalOptions({ tracker: { playerFollowActiveTurn: "sì" } }).tracker.playerFollowActiveTurn, false);
  const table = resolveOptions({});
  assert.equal(selectOnlineRoomProfile(table), false);
  assert.equal(selectPlayerFollowActiveTurn(table), false);
  const online = resolveOptions({ room: { profile: "online" }, local: { tracker: { playerFollowActiveTurn: true } } });
  assert.equal(selectOnlineRoomProfile(online), true);
  assert.equal(selectPlayerFollowActiveTurn(online), true);
});

test("il pannello Opzioni legge e salva il profilo", () => {
  const model = selectOptionsPanelModel(resolveOptions({ room: { profile: "online" } }));
  assert.equal(model.room.profile, "online");
  assert.equal(normalizeOptionsPanelDraft(model).room.profile, "online");
  assert.equal(buildOptionsPanelPatches(model).room.profile, "online");
  assert.equal(buildOptionsPanelPatches({}).room.profile, "table");
});

test("la chiusura del giocatore conta solo in Online e solo per la stessa apertura del GM", () => {
  const sharedUi = { open: true, at: 1000 };
  const dismissal = trackerDismissalFor(sharedUi);
  assert.deepEqual(dismissal, { gmOpenAt: 1000 });
  assert.equal(keepsTrackerDismissed({ online: true, dismissal, sharedUi }), true);
  assert.equal(keepsTrackerDismissed({ online: false, dismissal, sharedUi }), false);
  assert.equal(keepsTrackerDismissed({ online: true, dismissal, sharedUi: { open: true, at: 2000 } }), false);
  assert.equal(keepsTrackerDismissed({ online: true, dismissal, sharedUi: { open: false, at: 1000 } }), false);
  assert.equal(keepsTrackerDismissed({ online: true, dismissal: null, sharedUi }), false);
  assert.deepEqual(normalizeTrackerDismissal({ gmOpenAt: "x" }), { gmOpenAt: 0 });
});

test("un combattimento inizia quando l'ordine passa da vuoto a pieno", () => {
  assert.equal(combatStarted(0, 3), true);
  assert.equal(combatStarted(null, 3), false);
  assert.equal(combatStarted(3, 4), false);
  assert.equal(combatStarted(2, 0), false);
});

test("la chiusura si salva e si dimentica nello storage del browser", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  writeTrackerDismissal({ gmOpenAt: 5 }, storage);
  assert.deepEqual(readTrackerDismissal(storage), { gmOpenAt: 5 });
  writeTrackerDismissal(null, storage);
  assert.equal(readTrackerDismissal(storage), null);
  assert.equal(readTrackerDismissal({ getItem() { throw new Error("bloccato"); } }), null);
});

test("con il profilo Tavolo la telecamera del giocatore usa ancora il Segui del GM", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(source, /const followsTurn = !IS_GM && runtimeOptionsService\.get\(selectOnlineRoomProfile\)\s*\? runtimeOptionsService\.get\(selectPlayerFollowActiveTurn\) === true\s*: autoFocus;/);
  assert.match(source, /if \(followsTurn && !hiddenFromPlayerView\) \{\s*__scheduleViewportFocus\(/);
});

test("con il profilo Tavolo sync-open apre e chiude il tracker come prima", () => {
  const source = readFileSync(new URL("../src/sync-open.js", import.meta.url), "utf8");
  assert.match(source, /const dismissed = online && keepsTrackerDismissed\(/);
  assert.match(source, /else if \(!dismissed\) await setTrackerPopoverOpen\(!!state\.open\);/);
  assert.match(source, /if \(online && !dismissed && state\.open\) writeTrackerDismissal\(null\);/);
});
