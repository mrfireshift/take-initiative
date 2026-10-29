import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The card context menu stayed at its initial height (336 px) with its last items cut (Cambia fazione, Lato del
// tavolo, Rimuovi dall'iniziativa): the resize it asks for could be lost, sent before the SDK was ready or before OBR
// had created the popover. Measured on 29/10: the full menu of a character is 452 px tall at 252 px.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tracker = read("../src/initiativeList.js");

test("le pagine dei menu chiedono di nuovo l'altezza quando lo SDK è pronto", () => {
  for (const page of ["../src/initiative-card-context-menu.js", "../src/tracker-quick-actions.js"]) {
    assert.match(read(page), /if \(!OBR\.isReady\) OBR\.onReady\(\(\) => requestMenuResize\(\)\);/, page);
  }
});

test("il tracker ricorda l'ultima altezza chiesta e la riapplica appena il popover è aperto", () => {
  for (const [id, holder, openFlag] of [
    ["INITIATIVE_CARD_CONTEXT_MENU_ID", "__initiativeCardContextMenuHeight", "__initiativeCardContextMenu = true;"],
    ["TRACKER_QUICK_ACTIONS_POPOVER_ID", "__trackerQuickActionsHeight", "__trackerQuickActionsPopover = true;"],
  ]) {
    assert.match(tracker, new RegExp(`${holder} = height;\\n\\s+void OBR\\.popover\\.setHeight\\(${id}, height\\)`), holder);
    const afterOpen = tracker.slice(tracker.indexOf(openFlag), tracker.indexOf(openFlag) + 260);
    assert.match(afterOpen, new RegExp(`if \\(${holder}\\) \\{\\n\\s+void OBR\\.popover\\.setHeight\\(${id}, ${holder}\\)`), holder);
  }
  assert.match(tracker, /__initiativeCardContextMenu = null;\n\s+__initiativeCardContextMenuHeight = 0;/);
});
