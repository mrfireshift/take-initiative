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
  assert.match(page, /import\("\.\/diceScene\.js"\)/, "the 3D code loads with the tray only");
});

// Lot D-4: the rolls reach the other screens, the latest one of each player stays in their player metadata.
test("i tiri condivisi portano stile e personaggio, e chi entra dopo legge l'ultimo di ciascuno", async () => {
  const { createDiceRollRecord, normalizeDiceRollRecord, parseDiceFormula, rollDiceFormula } = await import("../src/diceCore.js");
  const { DICE_LAST_ROLL_KEY, assignedCharacterName, diceNoticeQueueWith, lastRollsFromParty } = await import("../src/diceTrayCore.js");
  const result = rollDiceFormula(parseDiceFormula("1d20+2"));
  const make = (id, at, extra = {}) => createDiceRollRecord({
    id, result, throws: [], player: { id: "p-1", name: "Mario" }, style: "galaxy", at, ...extra,
  });
  const first = make("11111111-1111-4111-8111-111111111111", 10);
  assert.equal(normalizeDiceRollRecord(first).style, "galaxy");
  assert.equal(normalizeDiceRollRecord({ ...first, style: "boh" }).style, DEFAULT_DICE_STYLE);
  const later = make("22222222-2222-4222-8222-222222222222", 20);
  const hidden = make("33333333-3333-4333-8333-333333333333", 30, { hidden: true });
  const party = [
    { metadata: { [DICE_LAST_ROLL_KEY]: first } },
    { metadata: { [DICE_LAST_ROLL_KEY]: later } },
    { metadata: { [DICE_LAST_ROLL_KEY]: hidden } },
    { metadata: { [DICE_LAST_ROLL_KEY]: { id: "x" } } },
    { metadata: {} },
  ];
  assert.deepEqual(lastRollsFromParty(party).map((record) => record.id), [later.id, first.id]);
  const items = [
    { name: "Goblin", metadata: {} },
    { name: "Eroe", metadata: { "com.thebigpicture.initiative/meta": { assignedPlayer: { id: "p-1", name: "Mario" } } } },
  ];
  assert.equal(assignedCharacterName(items, "p-1"), "Eroe");
  assert.equal(assignedCharacterName(items, "p-2"), "");
  let queue = [];
  for (const id of ["a", "b", "c", "d", "e", "c"]) queue = diceNoticeQueueWith(queue, { id });
  assert.deepEqual(queue.map((entry) => entry.id), ["b", "d", "e", "c"], "four at most, a repeated roll once");
});

test("il vassoio condivide solo i tiri non nascosti; l'host vive solo nel profilo Online", () => {
  const tray = readFileSync(new URL("../src/dice-tray.js", import.meta.url), "utf8");
  assert.match(tray, /async function shareRoll\(record\) \{\n  if \(record\.hidden\) return;/);
  assert.match(tray, /OBR\.broadcast\.sendMessage\(DICE_ROLL_CHANNEL, record, \{ destination: "REMOTE" \}\)/);
  assert.match(tray, /OBR\.player\.setMetadata\(\{ \[DICE_LAST_ROLL_KEY\]: record \}\)/);
  const host = readFileSync(new URL("../src/diceRollHost.js", import.meta.url), "utf8");
  assert.match(host, /service\.subscribe\(selectOnlineRoomProfile, \(online\) => \(online === true \? start\(\) : stop\(\)\)\)/);
  assert.match(host, /if \(!record \|\| record\.hidden\) return;/);
  assert.match(host, /record\.connectionId === ownConnectionId\) return;/);
  const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
  assert.match(background, /mountDiceRollHost\(\);/);
  const config = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /diceNotice: path\.resolve\(process\.cwd\(\), "dice-notice\.html"\)/);
});

// The tray moves like the other panels and shows the dice as Owlbear Rodeo Dice does (pictures in a column).
test("il vassoio si sposta come gli altri pannelli e mostra i dadi in immagine", async () => {
  const { existsSync } = await import("node:fs");
  const list = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(list, /await openTrackedPopover\(\{\n      id: DICE_TRAY_POPOVER_ID,/);
  assert.match(list, /anchorPosition: \{ left: Math\.max\(12, Math\.round\(left\)\), top: Math\.max\(12, Math\.round\(top\)\) \},\n      anchorOrigin: \{ horizontal: "LEFT", vertical: "TOP" \},/);
  const tray = readFileSync(new URL("../src/dice-tray.js", import.meta.url), "utf8");
  assert.match(tray, /import "\.\/popoverDrag\.js";/);
  assert.match(tray, /dice\/previews\/\$\{style\}\/d\$\{sides\}\.png/);
  const page = readFileSync(new URL("../dice-tray.html", import.meta.url), "utf8");
  assert.match(page, /<header data-drag-handle="1"/);
  assert.doesNotMatch(page, /[🔊🔇☰⌫]/u, "SVG icons, no emoji");
  for (const style of DICE_STYLE_KEYS) {
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      assert.ok(existsSync(new URL(`../public/dice/previews/${style}/d${sides}.png`, import.meta.url)), `${style} d${sides}`);
    }
  }
});

test("il 🎲 nella barra di Owlbear apre il vassoio solo in Online; Clocks è del solo GM", () => {
  const tool = readFileSync(new URL("../src/diceTrayTool.js", import.meta.url), "utf8");
  assert.match(tool, /service\.subscribe\(selectOnlineRoomProfile, \(online\) => void \(online === true \? start\(\) : stop\(\)\)\)/);
  assert.match(tool, /icons: \[\{ icon: "\/dice-tool\.svg", label: "Dadi" \}\]/);
  assert.match(tool, /if \(await trayIsOpen\(\)\) await OBR\.popover\.close\(DICE_TRAY_POPOVER_ID\);/);
  assert.match(tool, /const timer = setTimeout\(\(\) => finish\(false\), PING_TIMEOUT_MS\);/, "no answer: the tray is closed");
  assert.match(tool, /disableClickAway: true,/);
  assert.match(readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8"), /hidePaper: true,\n      \/\/ The tray stays while the map is used; its × and Esc close it\.\n      disableClickAway: true,/);
  assert.match(readFileSync(new URL("../src/background.js", import.meta.url), "utf8"), /mountDiceTrayTool\(\);/);
  const tray = readFileSync(new URL("../src/dice-tray.js", import.meta.url), "utf8");
  assert.match(tray, /\{ type: "pong", id: event\.data\.id \}/);
  assert.doesNotMatch(tray, /sayOpen/, "the tray no longer reports its state: it answers when asked");
  const clocks = readFileSync(new URL("../src/clocksTool.js", import.meta.url), "utf8");
  assert.match(clocks, /icons: \[\{ icon: "\/clock\.svg", label: "Clock", filter: \{ roles: \["GM"\] \} \}\]/);
});

test("il risultato sta sul vassoio, la × lo svuota, Tira è il pulsante principale del plugin", async () => {
  const { diceTrayHeight } = await import("../src/diceTrayCore.js");
  assert.equal(diceTrayHeight(1000), 680);
  assert.equal(diceTrayHeight(600), 500);
  assert.equal(diceTrayHeight(300), 420);
  const page = readFileSync(new URL("../dice-tray.html", import.meta.url), "utf8");
  assert.match(page, /<div id="stage">[\s\S]*<div id="score" class="score" hidden>[\s\S]*<button id="clearTray"/);
  assert.match(page, /#roll \{[^}]*background: var\(--obrt-btn-primary-bg, #2563eb\);/);
  const tray = readFileSync(new URL("../src/dice-tray.js", import.meta.url), "utf8");
  assert.match(tray, /if \(shown\) showScore\(result\);/, "a tray emptied during the roll shows no result");
  const scene = readFileSync(new URL("../src/diceScene.js", import.meta.url), "utf8");
  assert.match(scene, /return revision === rollRevision \? shown : null;/);
  assert.match(scene, /return \{ roll, clear, resize, render, dispose \};/);
});
