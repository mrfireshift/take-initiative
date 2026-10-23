import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { turnShortcutDirection } from "../src/turnShortcutCore.js";
import {
  buildTieReorderHandle,
  realTieInitiatives,
  showsTieReorderHandle,
  tieInitiativeKey,
} from "../src/tieReorderCore.js";

const trackerSource = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const isVirtualId = (id) => String(id).startsWith("__EPIC__") || String(id).startsWith("__LAIR__");

test("Spazio e → passano al turno successivo, ← al precedente, solo per il GM e fuori dai campi", () => {
  const gm = { enabled: true };
  assert.equal(turnShortcutDirection({ ...gm, key: " " }), 1);
  assert.equal(turnShortcutDirection({ ...gm, key: "ArrowRight" }), 1);
  assert.equal(turnShortcutDirection({ ...gm, key: "ArrowLeft" }), -1);
  assert.equal(turnShortcutDirection({ ...gm, key: "Enter" }), 0);
  assert.equal(turnShortcutDirection({ key: " " }), 0, "players: no turn keys");
  for (const blocker of ["editableTarget", "buttonTarget", "editing", "repeat", "isComposing", "ctrlKey", "metaKey", "altKey", "shiftKey"]) {
    assert.equal(turnShortcutDirection({ ...gm, key: "ArrowRight", [blocker]: true }), 0, blocker);
  }
});

test("il tracker preme i propri pulsanti di turno con i tasti", () => {
  const mount = trackerSource.slice(trackerSource.indexOf("function __mountTurnShortcut()"), trackerSource.indexOf("function __mountHistoryUndoShortcut()"));
  assert.ok(mount.includes("(direction > 0 ? btnNext : btnPrev).click();"));
  assert.ok(mount.includes("editableTarget: __historyUndoShortcutTargetIsEditable(target),"));
  assert.ok(mount.includes("enabled: IS_GM,"));
  assert.ok(trackerSource.includes("__mountHistoryUndoShortcut();\n      __mountTurnShortcut();")
    || trackerSource.includes("__mountHistoryUndoShortcut();\r\n      __mountTurnShortcut();"));
});

test("i pari merito contano solo le card reali, e la maniglia compare solo per il GM sulle card che si possono spostare", () => {
  const entries = [
    { id: "omar", initiative: 23 },
    { id: "__EPIC__::auril::after::omar", initiative: 23 },
    { id: "auril", initiative: 20, isEpic: true },
    { id: "lavera", initiative: 20 },
    { id: "goblin", initiative: 0 },
    { id: "rat" },
  ];
  const ties = realTieInitiatives(entries, isVirtualId);
  assert.deepEqual([...ties].sort(), ["0", "20"], "an Epic Action is no tie; missing initiative counts as 0");
  // At the Lair's initiative (20) the Epic Boss is pinned at the head of the tie: Lavera has no one to swap with.
  assert.deepEqual([...realTieInitiatives(entries, isVirtualId, { lairInitiative: 20 })], ["0"]);
  assert.equal(tieInitiativeKey({ initiative: 20 }), "20");
  assert.equal(showsTieReorderHandle(entries[3], ties, { isGM: true, isVirtualId }), true);
  assert.equal(showsTieReorderHandle(entries[2], ties, { isGM: true, isVirtualId }), false, "an Epic Boss keeps its place");
  assert.equal(showsTieReorderHandle(entries[0], ties, { isGM: true, isVirtualId }), false, "only an Epic Action alongside");
  assert.equal(showsTieReorderHandle(entries[3], ties, { isGM: false, isVirtualId }), false, "players do not reorder");
});

test("la maniglia sta fuori dal bordo destro nel classico e in basso a sinistra nel compatto", () => {
  const documentRef = { createElement: () => ({ style: {}, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }) };
  const classic = buildTieReorderHandle({ documentRef });
  const compact = buildTieReorderHandle({ compact: true, documentRef });
  assert.equal(classic.dataset.tieReorderHandle, "1");
  assert.equal(classic.style.left, "calc(100% + 3px)");
  assert.equal(classic.style.cursor, "grab");
  assert.deepEqual([compact.style.left, compact.style.bottom], ["4px", "3px"]);

  // Both views add it from the ties of the whole list, and the drag start counts only real ties.
  assert.equal(trackerSource.split("realTieInitiatives(").length - 1, 2);
  assert.ok(trackerSource.includes("card.appendChild(buildTieReorderHandle({ compact: true }));"));
  assert.ok(trackerSource.includes("card.appendChild(buildTieReorderHandle({ compact: false }));"));
  assert.ok(trackerSource.includes(".filter((peer) => !__isVirtualTrackerId(peer.dataset.itemId))"));
  assert.ok(trackerSource.includes('.filter((peer) => !(peer.dataset.isEpic === "1" && Number(init) === LAIR_INITIATIVE));'));
  assert.equal(trackerSource.split("{ lairInitiative: LAIR_INITIATIVE });").length - 1 >= 2, true);
  const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(indexHtml.includes('[data-tracker-card="1"]:hover [data-tie-reorder-handle="1"]'));
});
