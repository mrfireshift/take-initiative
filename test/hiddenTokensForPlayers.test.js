import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { classifySceneItemSnapshots, createSceneItemsSnapshot } from "../src/sceneItemChangeDispatcherCore.js";
import { buildTurnNoticePayload } from "../src/turnNotice.js";
import { __groupKey } from "../src/initiativeOrderCore.js";

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

test("L16 (OP-02): ai giocatori la card di una creatura nascosta compare dal suo turno in poi", () => {
  const body = tracker.slice(tracker.indexOf("function __hiddenFromPlayers("), tracker.indexOf("function __trackerCardHasOpenEditor("));
  const hidden = new Function("IS_GM", "splitParagonId", `${body} return __hiddenFromPlayers;`)(false,
    (id) => ({ baseId: String(id).split("::p")[0] }));
  const lurker = { id: "lurker", hiddenToken: true };
  assert.equal(hidden(lurker, "orc"), true, "hidden, not met yet: no card");
  assert.equal(hidden(lurker, "lurker"), false, "its turn: it acts, the card shows");
  assert.equal(hidden({ ...lurker, revealedInCombat: true }, "orc"), false, "met: the card stays");
  assert.equal(hidden({ id: "lurker::p1", __paragonBaseId: "lurker", hiddenToken: true }, "lurker"), false, "its Paragon turn too");
  assert.equal(hidden({ id: "orc" }, "lurker"), false, "a visible token");
  const asGM = new Function("IS_GM", "splitParagonId", `${body} return __hiddenFromPlayers;`)(true, () => ({ baseId: "" }));
  assert.equal(asGM(lurker, "orc"), false, "the GM sees every card");
  assert.match(tracker, /\.filter\(\(entry\) => !__hiddenFromPlayers\(entry, activeIdNow\)\);/);
});

test("L16 (OP-02): il segno revealedInCombat si scrive al turno di una creatura nascosta e Svuota lo toglie", () => {
  const reveal = tracker.slice(tracker.indexOf("async function __revealActiveHiddenCreature("), tracker.indexOf("async function showConcentrationDamageWarning("));
  assert.match(reveal, /if \(!item \|\| item\.visible !== false \|\| !meta \|\| meta\.revealedInCombat === true\) return;/);
  assert.match(reveal, /\[META_KEY\]: \{ \.\.\.current, revealedInCombat: true \}/);
  assert.match(tracker, /void __revealActiveHiddenCreature\(st, sceneEpoch\)/);
  assert.match(tracker, /delete me\.inInitiative;\n\s+\/\/ A new combat: no hidden creature is known yet \(lot L16\)\.\n\s+delete me\.revealedInCombat;/);
});

test("L16 (OP-02): l'avviso di turno non nomina ai giocatori la prossima creatura nascosta mai vista", () => {
  const entries = new Map([
    ["pc", { name: "Aria" }],
    ["lurker", { name: "Ombra", hiddenToken: true }],
    ["orc", { name: "Orco" }],
  ]);
  const state = { order: ["pc", "lurker", "orc"], current: 0, round: 1 };
  const notice = buildTurnNoticePayload(state, entries);
  assert.equal(notice.nextName, "Ombra", "the GM sees it");
  assert.equal(notice.nextPlayerName, "Orco", "the players see the next creature they know");
  entries.set("lurker", { name: "Ombra", hiddenToken: true, revealedInCombat: true });
  assert.equal(Object.hasOwn(buildTurnNoticePayload(state, entries), "nextPlayerName"), false, "met: named");
  const page = read("../src/turn-notice.ts");
  assert.match(page, /const shownNextName = noticeRole !== "GM" && notice\.nextPlayerName \? notice\.nextPlayerName : notice\.nextName;/);
});

test("L16 (OP-02): la vista di un giocatore non segue un token nascosto", () => {
  assert.match(tracker, /const hiddenFromPlayerView = !IS_GM && __activeLabelEntriesById\.get\(anchorId\)\?\.hiddenToken === true;\n\s+if \(autoFocus && !hiddenFromPlayerView\) \{/);
});

test("L16 (OP-08): un token senza attitudine si mostra neutrale; le chiavi dei gruppi restano quelle salvate", () => {
  assert.match(tracker, /attitude: meta\.attitude \|\| "neutral",\n\s+groupAttitude: meta\.attitude \|\| "ally",/);
  assert.ok(__groupKey({ name: "Goblin", attitude: "neutral", groupAttitude: "ally" }).startsWith("ally"));
  assert.match(tracker, /return `\$\{e\.groupAttitude \|\| e\.attitude \|\| "ally"\}\$\{__GROUP_SEP\}\$\{base\}`;/);
});
