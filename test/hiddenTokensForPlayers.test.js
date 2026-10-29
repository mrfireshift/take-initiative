import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";

import { classifySceneItemSnapshots, createSceneItemsSnapshot } from "../src/sceneItemChangeDispatcherCore.js";
import { buildTurnNoticePayload } from "../src/turnNotice.js";
import { __groupKey } from "../src/initiativeOrderCore.js";

mock.module("@owlbear-rodeo/sdk", { defaultExport: {} });
const { withoutHiddenTokenNotices } = await import("../src/options/reminderProjectionBroadcast.js");

// Lot L16 of the bugfix pass: hidden tokens and the players (decision D2), the attitude fallback (D10).
const META_KEY = "com.thebigpicture.initiative/meta";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tracker = read("../src/initiativeList.js");

test("L16 (HP-02, AV-07): nascondere o mostrare un token ricalcola barre, aure e tracker", () => {
  const token = (visible) => ({ id: "orc", type: "IMAGE", layer: "CHARACTER", visible, position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 7, hpMax: 15, inInitiative: true } } });
  const { flags } = classifySceneItemSnapshots(createSceneItemsSnapshot([token(true)]), createSceneItemsSnapshot([token(false)]));
  assert.equal(flags.hpBars, true);
  assert.equal(flags.aura, true);
  assert.equal(flags.trackerStructure, true);
  assert.equal(flags.visibility, true);
  assert.match(tracker, /\}, \{ filter: \(event\) => event\.flags\.tracker \|\| event\.flags\.visibility \}\);/,
    "the tracker redraws at once when a token is shown or hidden");
});

test("L16 (HP-02): barra e numero dei PF di un token nascosto restano al solo GM", () => {
  const bars = read("../src/hpbar-items.js");
  assert.match(bars, /const playerBarVisible = disclosure\.mode !== "hidden" && tokenVisible;/);
  assert.match(bars, /const playerTextVisible = disclosure\.mode === "exact" && tokenVisible;/);
  assert.match(bars, /visible: disclosure\.mode === "exact" && token\.visible !== false,/);
});

test("L16 (AV-07): le tre aure prendono la visibilità del token e la aggiornano senza ricrearsi", () => {
  for (const [file, holder] of [["spellAuraController", "caster"], ["classFeatureAuraController", "caster"], ["customAuraController", "source"]]) {
    const source = read(`../src/${file}.js`);
    assert.match(source, new RegExp(`\\.visible\\(${holder}\\?\\.visible !== false\\)`), file);
    assert.match(source, new RegExp(`\\(item\\?\\.visible !== false\\) !== \\(desired\\.${holder}\\?\\.visible !== false\\)\\) return true;`), file);
    assert.match(source, new RegExp(`item\\.visible = desired\\.${holder}\\?\\.visible !== false;\\n\\s+if \\(!desired\\.reminderUpdate\\?\\.changed\\) continue;`), file);
  }
});

function playerTracker(isGM, labelEntries = new Map()) {
  const body = tracker.slice(tracker.indexOf("function __hiddenFromPlayers("), tracker.indexOf("function __trackerCardHasOpenEditor("));
  return new Function("IS_GM", "__activeLabelEntriesById",
    `${body} return { hidden: __hiddenFromPlayers, trackState: __playerTrackState };`)(isGM, labelEntries);
}

test("L16 (OP-02): finché il GM tiene nascosto un token, i giocatori non ne vedono la card", () => {
  const player = playerTracker(false);
  assert.equal(player.hidden({ id: "lurker", hiddenToken: true }), true);
  assert.equal(player.hidden({ id: "lurker::p1", hiddenToken: true }), true, "its Paragon entry too");
  assert.equal(player.hidden({ id: "orc" }), false, "a visible token");
  assert.equal(playerTracker(true).hidden({ id: "lurker", hiddenToken: true }), false, "the GM sees every card");
  assert.match(tracker, /if \(!IS_GM\) \{\n\s+state = __playerTrackState\(state, entries\);\n\s+entries = entries\.filter\(\(entry\) => !__hiddenFromPlayers\(entry\)\);/);
  assert.doesNotMatch(tracker, /__revealActiveHiddenCreature|revealedInCombat: true/, "no mark on the token any more");
  assert.match(tracker, /delete me\.inInitiative;\n\s+\/\/ The mark of an earlier version of the hidden tokens \(lot L16\), no longer written\.\n\s+delete me\.revealedInCombat;/);
});

test("L16 (OP-02): durante il turno di una creatura nascosta i giocatori vedono ancora l'ultima card attiva", () => {
  const player = playerTracker(false);
  const entries = [{ id: "pc" }, { id: "lurker", hiddenToken: true }, { id: "ghost", hiddenToken: true }, { id: "orc" }];
  const state = (current) => ({ order: ["pc", "lurker", "ghost", "orc"], current, round: 2 });
  assert.equal(player.trackState(state(0), entries).current, 0);
  assert.equal(player.trackState(state(1), entries).current, 0, "the hidden turn keeps the last visible card lit");
  assert.equal(player.trackState(state(2), entries).current, 0, "two hidden turns in a row as well");
  const real = state(2);
  player.trackState(real, entries);
  assert.equal(real.current, 2, "the real state is not touched");
  assert.equal(player.trackState(state(3), entries).current, 3, "a visible turn moves on");
  const fresh = playerTracker(false);
  assert.equal(fresh.trackState(state(1), entries).current, 1, "no visible turn seen yet: nothing to keep");
  const gm = playerTracker(true);
  assert.equal(gm.trackState(state(1), entries).current, 1, "the GM follows the real turn");
  assert.match(tracker, /__conditionTurnMark = null;[\s\S]{0,400}__playerLastVisibleActiveId = "";/);
});

test("L16 (OP-02): il turno di una creatura nascosta non manda avvisi ai giocatori, e la prossima nascosta non è nominata", () => {
  const entries = new Map([
    ["pc", { name: "Aria" }],
    ["lurker", { name: "Ombra", hiddenToken: true }],
    ["orc", { name: "Orco" }],
  ]);
  const notice = buildTurnNoticePayload({ order: ["pc", "lurker", "orc"], current: 0, round: 1 }, entries);
  assert.equal(notice.nextName, "Ombra", "the GM sees it");
  assert.equal(notice.nextPlayerName, "Orco", "the players see the next visible creature");
  assert.equal(Object.hasOwn(notice, "currentHidden"), false);
  const hiddenTurn = buildTurnNoticePayload({ order: ["pc", "lurker", "orc"], current: 1, round: 1 }, entries);
  assert.equal(hiddenTurn.currentHidden, true);
  assert.match(tracker, /TURN_NOTICE_CHANNEL, \{[\s\S]{0,200}\}, \{ destination: notice\?\.currentHidden \? "LOCAL" : "ALL" \}\);/);
  const page = read("../src/turn-notice.ts");
  assert.match(page, /const shownNextName = noticeRole !== "GM" && notice\.nextPlayerName \? notice\.nextPlayerName : notice\.nextName;/);
});

test("L16 (OP-02): i promemoria proiettati ai giocatori scartano i token nascosti", () => {
  const notices = [
    { id: "a", sourceId: "lurker" },
    { id: "b", casterId: "lurker" },
    { id: "c", target: { id: "lurker" } },
    { id: "d", targets: [{ id: "lurker" }, { id: "pc" }] },
    { id: "e", targets: [{ id: "lurker" }] },
    { id: "f", sourceId: "pc", targets: [{ id: "orc" }] },
  ];
  const shown = withoutHiddenTokenNotices(notices, new Set(["lurker"]));
  assert.deepEqual(shown.map((notice) => notice.id), ["d", "f"]);
  assert.deepEqual(shown[0].targets, [{ id: "pc" }]);
  assert.equal(shown[1], notices[5], "an untouched notice stays the same object");
  assert.equal(withoutHiddenTokenNotices(notices, new Set()), notices);
});

test("L16 (OP-02): la concentrazione di una creatura nascosta resta al GM", () => {
  const runtime = read("../src/concentrationSaveReminder.js");
  assert.match(runtime, /function hiddenConcentratorIds\(/);
  assert.match(runtime, /\[scopedWarnings\.filter\(\(warning\) => !hiddenIds\.has\(String\(warning\?\.targetId \|\| ""\)\)\), "ALL"\],\n\s+\[scopedWarnings\.filter\(\(warning\) => hiddenIds\.has\(String\(warning\?\.targetId \|\| ""\)\)\), "LOCAL"\],/);
});

test("L16 (OP-02): le animazioni con un caster o un bersaglio nascosto restano sullo schermo del GM", async () => {
  const visible = { orc: true, pc: true, lurker: false };
  const sceneOBR = { scene: { items: { getItems: async (ids) => ids.filter((id) => id in visible).map((id) => ({ id, visible: visible[id] })) } } };
  const source = read("../src/hiddenTokenBroadcast.js").replace(/^import .*\n/m, "").replace("export async function", "async function");
  const load = (OBR) => new Function("OBR", `${source} return broadcastDestinationForTokens;`)(OBR);
  const pick = load(sceneOBR);
  const destinations = [];
  for (const ids of [["pc", "orc"], ["lurker"], ["pc", "lurker"], [], "orc", ["", null]]) destinations.push(await pick(ids));
  assert.deepEqual(destinations, ["ALL", "LOCAL", "LOCAL", "ALL", "ALL", "ALL"]);
  const failing = load({ scene: { items: { getItems: async () => { throw new Error("offline"); } } } });
  assert.equal(await failing(["orc"]), "ALL");
  assert.match(read("../src/embersMatchedVisualRenderer.js"),
    /broadcastDestinationForTokens\(\[casterId, \.\.\.\(Array\.isArray\(targetIds\) \? targetIds : \[\]\)\]\);\n\s+await OBR\.broadcast\.sendMessage\(\n\s+EMBERS_MATCHED_VISUAL_CHANNEL,\n\s+event,\n\s+\{ destination \},/);
  assert.match(read("../src/fireballVisualRenderer.js"),
    /broadcastDestinationForTokens\(casterId\);\n\s+await OBR\.broadcast\.sendMessage\(\n\s+FIREBALL_VISUAL_CHANNEL,\n\s+visualEvent,\n\s+\{ destination \},/);
});

test("L16 (OP-02): la vista di un giocatore non segue un token nascosto", () => {
  assert.match(tracker, /const hiddenFromPlayerView = !IS_GM && __activeLabelEntriesById\.get\(anchorId\)\?\.hiddenToken === true;\n\s+if \(autoFocus && !hiddenFromPlayerView\) \{/);
});

test("L16 (OP-08): un token senza attitudine si mostra neutrale; le chiavi dei gruppi restano quelle salvate", () => {
  assert.match(tracker, /attitude: meta\.attitude \|\| "neutral",\n\s+groupAttitude: meta\.attitude \|\| "ally",/);
  assert.ok(__groupKey({ name: "Goblin", attitude: "neutral", groupAttitude: "ally" }).startsWith("ally"));
  assert.match(tracker, /return `\$\{e\.groupAttitude \|\| e\.attitude \|\| "ally"\}\$\{__GROUP_SEP\}\$\{base\}`;/);
});

// The GM's mark on a hidden token's card: an eye struck through before the name, in both layouts. The players never
// draw that card, so it never reaches them.
test("L16: sulla card del GM un token nascosto ha l'occhio barrato accanto al nome", async () => {
  const { buildCompactCardName } = await import("../src/initiativeCardCompact.js");
  const documentRef = {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(), style: {}, dataset: {}, attributes: {}, children: [], textContent: "", title: "",
        setAttribute(name, value) { this.attributes[name] = String(value); },
        removeAttribute(name) { delete this.attributes[name]; },
        appendChild(child) { this.children.push(child); return child; },
        prepend(child) { this.children.unshift(child); },
      };
    },
  };
  const hidden = buildCompactCardName({ name: "Ombra", hiddenToken: true }, { active: false, isGM: true, documentRef });
  const [mark] = hidden.children;
  assert.equal(mark?.dataset.hiddenTokenMark, "1");
  assert.equal(mark.title, "Token nascosto: i giocatori non lo vedono");
  assert.match(mark.style.mask, /hidden-token\.svg/);
  assert.equal(hidden.textContent, "Ombra", "the name stays the name");
  assert.match(hidden.title, /Token nascosto/);
  assert.equal(buildCompactCardName({ name: "Orco" }, { active: false, isGM: true, documentRef }).children.length, 0);
  assert.equal(buildCompactCardName({ name: "Ombra", hiddenToken: true }, { active: false, documentRef }).children.length, 0,
    "a player's card never carries it");

  const classic = read("../src/initiativeCardClassicBuilder.js");
  assert.match(classic, /if \(IS_GM && e\.hiddenToken === true\) \{\n\s+const hiddenMark = buildHiddenTokenMark\(13\);[\s\S]{0,80}name\.appendChild\(hiddenMark\);\n\}\nname\.appendChild\(nameLabel\);/);
  assert.match(tracker, /buildCompactCardName\(entry, \{ active, boss, isGM: IS_GM \}\)/);
  const svg = read("../public/hidden-token.svg");
  assert.match(svg, /<mask id="hidden-token-cut"/);
});
