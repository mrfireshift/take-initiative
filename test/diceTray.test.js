import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  diceCountsOf,
  diceRollAuthor,
  formulaWithDie,
  readDiceSessionHistory,
  rememberDiceRoll,
} from "../src/diceTrayCore.js";
import { DEFAULT_DICE_STYLE, DICE_STYLE_KEYS, normalizeDiceStyle } from "../src/diceStyles.js";
import { createDefaultLocalOptions } from "../src/options/optionsDefaults.js";
import { normalizeLocalOptions } from "../src/options/optionsNormalize.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectDiceStyle } from "../src/options/optionsSelectors.js";

// Online dice tray, lot D-3 (docs/PIANO_DADI_ONLINE.md): the dice buttons edit the formula, the history of the
// session, the style chosen in this browser, and the 🎲 of the tracker in the Online room profile only.
test("i pulsanti dei dadi aggiungono e tolgono dadi dalla formula", () => {
  assert.equal(formulaWithDie("", 20, 1), "1d20");
  assert.equal(formulaWithDie("1d20+5", 6, 1), "1d20+1d6+5");
  assert.equal(formulaWithDie("1d20+1d6+5", 6, 1), "1d20+2d6+5");
  assert.equal(formulaWithDie("1d20+2d6+5", 6, -1), "1d20+1d6+5");
  assert.equal(formulaWithDie("1d20+5", 20, -1), "5");
  assert.equal(formulaWithDie("+3", 8, 1), "1d8+3");
  assert.equal(formulaWithDie("2d20kh1", 20, 1), "2d20kh1+1d20", "a kept group is not touched");
  assert.equal(formulaWithDie("2d6*", 6, 1), "2d6*", "an unreadable formula stays as written");
  assert.deepEqual(diceCountsOf("2d20kh1+1d6+1d6+3"), { 20: 2, 6: 2 });
  assert.deepEqual(diceCountsOf("boh"), {});
});

test("lo storico della sessione tiene gli ultimi tiri, dal più recente", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  rememberDiceRoll({ id: "a", at: 1, total: 4 }, storage);
  rememberDiceRoll({ id: "b", at: 2, total: 9 }, storage);
  assert.deepEqual(readDiceSessionHistory(storage).map((record) => record.id), ["b", "a"]);
  assert.deepEqual(readDiceSessionHistory({ getItem() { throw new Error("bloccato"); } }), []);
  assert.equal(diceRollAuthor({ playerName: "Mario", character: "Eroe" }), "Mario · Eroe");
  assert.equal(diceRollAuthor({}), "Tiro");
});

test("lo stile dei dadi è una preferenza di questo browser, Ferro per default", () => {
  assert.equal(DICE_STYLE_KEYS.length, 8);
  assert.equal(createDefaultLocalOptions().tools.diceStyle, DEFAULT_DICE_STYLE);
  assert.equal(normalizeLocalOptions({ tools: { diceStyle: "glass" } }).tools.diceStyle, "glass");
  assert.equal(normalizeLocalOptions({ tools: { diceStyle: "plastica" } }).tools.diceStyle, "iron");
  assert.equal(selectDiceStyle(resolveOptions({ local: { tools: { diceStyle: "walnut" } } })), "walnut");
  assert.equal(normalizeDiceStyle(undefined), "iron");
});

test("il 🎲 compare solo nel profilo Online, per GM e giocatori; la testata del Tavolo non cambia", () => {
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(tracker, /diceTrayButton\.style\.display = "none";/);
  assert.match(tracker, /diceTrayButton\.style\.display = __onlineRoomProfile\(\) \? "inline-flex" : "none";/);
  assert.match(tracker, /playerOnlineTools \? "60px minmax\(0, 1fr\) 60px" : "28px minmax\(0, 1fr\) 28px"/);
  assert.match(tracker, /compactBottomControls\.replaceChildren\(layoutToggleButton, diceTrayButton, compactMoreButton\);/);
  const page = readFileSync(new URL("../src/dice-tray.js", import.meta.url), "utf8");
  assert.match(page, /hiddenToggle\.hidden = !isGm;/, "the hidden roll is the GM's alone");
  assert.match(page, /await import\("\.\/diceScene\.js"\)/, "the 3D code loads with the tray only");
});
