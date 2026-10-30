import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectPlayerTrackerScale, selectTrackerPlacementSyncEnabled } from "../src/options/optionsSelectors.js";

// Audit online, lot O5: the Online room profile implies what the table screen's options did by hand. Players keep
// their own tracker view and place, and start at 100%; the Table profile reads the room's switches as before.
test("in Online la posizione del GM non si sincronizza, in Tavolo vale l'interruttore della stanza", () => {
  assert.equal(selectTrackerPlacementSyncEnabled(resolveOptions({})), true);
  assert.equal(selectTrackerPlacementSyncEnabled(resolveOptions({ room: { uiSync: { trackerPlacement: false } } })), false);
  assert.equal(selectTrackerPlacementSyncEnabled(resolveOptions({ room: { profile: "online" } })), false);
});

test("in Online la scala parte dal 100%, quella della stanza resta allo schermo del tavolo", () => {
  const room = { playerView: { trackerScale: 1.5 } };
  assert.equal(selectPlayerTrackerScale(resolveOptions({ room })), 1.5);
  assert.equal(selectPlayerTrackerScale(resolveOptions({ room: { ...room, profile: "online" } })), 1);
  assert.equal(selectPlayerTrackerScale(resolveOptions({ room: { ...room, profile: "online" }, local: { tracker: { playerScale: 0.75 } } })), 0.75);
});

test("il pannello Opzioni spegne in Online le carte di posizione e dimensione del tavolo", () => {
  const html = readFileSync(new URL("../options-modal.html", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../src/options-modal.js", import.meta.url), "utf8");
  assert.equal((html.match(/data-table-profile-only/g) || []).length, 2);
  assert.match(modal, /const onlineProfile = draft\.room\.profile === "online";/);
  assert.match(modal, /for \(const control of card\.querySelectorAll\("input, select"\)\) control\.disabled = onlineProfile;/);
});
