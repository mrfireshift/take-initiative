import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDefaultLocalOptions } from "../src/options/optionsDefaults.js";
import { normalizeLocalOptions } from "../src/options/optionsNormalize.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import {
  selectEmbersAnimationsEnabled,
  selectPlayerScreenPreferences,
  selectPlayerTrackerScale,
} from "../src/options/optionsSelectors.js";
import {
  applyPlayerScreenChange,
  playerScreenScaleChoices,
  playerScreenScaleValue,
} from "../src/playerScreenCore.js";

// Audit online, lot O2b: the menu «Schermo» lets a player choose their own Segui, tracker size and animations, in the
// Online room profile only. The Table profile must keep reading the room's values.
const local = { tracker: { playerScale: 0.75 }, runtime: { playerAnimations: false } };

test("le preferenze del giocatore partono neutre e si normalizzano", () => {
  const defaults = createDefaultLocalOptions();
  assert.equal(defaults.tracker.playerScale, null);
  assert.equal(defaults.runtime.playerAnimations, true);
  assert.equal(normalizeLocalOptions({ tracker: { playerScale: 9 } }).tracker.playerScale, 2);
  assert.equal(normalizeLocalOptions({ tracker: { playerScale: null } }).tracker.playerScale, null);
  assert.deepEqual(selectPlayerScreenPreferences(resolveOptions({ local })), { follow: false, scale: 0.75, animations: false });
});

test("con il profilo Tavolo scala e animazioni restano quelle della stanza", () => {
  const table = resolveOptions({ room: { playerView: { trackerScale: 1.5 } }, local });
  assert.equal(selectPlayerTrackerScale(table), 1.5);
  assert.equal(selectEmbersAnimationsEnabled(table), true);
});

test("con il profilo Online valgono le scelte del giocatore, mai più della stanza", () => {
  const online = resolveOptions({ room: { profile: "online", playerView: { trackerScale: 1.5 } }, local });
  assert.equal(selectPlayerTrackerScale(online), 0.75);
  assert.equal(selectEmbersAnimationsEnabled(online), false);
  const roomScale = resolveOptions({ room: { profile: "online", playerView: { trackerScale: 1.5 } } });
  assert.equal(selectPlayerTrackerScale(roomScale), 1.5, "«Come la stanza» keeps the room's size");
  const roomOff = resolveOptions({ room: { profile: "online", integrations: { embersAnimations: false } } });
  assert.equal(selectEmbersAnimationsEnabled(roomOff), false, "the player cannot turn on what the room turned off");
});

test("il menu scrive solo i campi del giocatore nelle opzioni locali", () => {
  const current = { tracker: { layout: "compact", scale: 1.25 }, runtime: { combatLog: true } };
  const followed = applyPlayerScreenChange(current, { follow: true });
  assert.deepEqual(followed.tracker, { layout: "compact", scale: 1.25, playerFollowActiveTurn: true });
  assert.equal(applyPlayerScreenChange(current, { scale: "1.5" }).tracker.playerScale, 1.5);
  assert.equal(applyPlayerScreenChange({ tracker: { playerScale: 1.5 } }, { scale: "room" }).tracker.playerScale, null);
  assert.deepEqual(applyPlayerScreenChange(current, { animations: false }).runtime, { combatLog: true, playerAnimations: false });
  assert.equal(playerScreenScaleChoices()[0].value, "room");
  assert.equal(playerScreenScaleValue(null), "room");
  assert.equal(playerScreenScaleValue(0.75), "0.75");
});

test("il pulsante «Schermo» compare solo ai giocatori nel profilo Online", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(source, /playerScreenButton\.style\.display = "none";/);
  assert.match(source, /playerScreenButton\.style\.display = !IS_GM && online \? "inline-flex" : "none";/);
  assert.match(source, /compactBottomControls\.replaceChildren\(layoutToggleButton, playerScreenButton\);/);
  // Extended layout: the empty column left of the round, on the header's single row (it wrapped to a second one).
  assert.match(source, /gridColumn: playerClassic \? "1" : "",\s*gridRow: playerClassic \? "1" : "",/);
});

test("il pannello «Schermo» ha la × di chiusura e prende l'altezza del contenuto", () => {
  const page = readFileSync(new URL("../player-screen.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../src/player-screen.js", import.meta.url), "utf8");
  assert.match(page, /<button id="playerScreenClose" class="close" type="button" aria-label="Chiudi"/);
  assert.match(script, /getElementById\("playerScreenClose"\)\.addEventListener\("click", close\)/);
  assert.match(script, /OBR\.popover\.setHeight\(POPOVER_ID, height\)/);
});
