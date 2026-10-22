import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPACT_COMPANION_TAB_WIDTH,
  appendCompactCompanionDrawer,
  compactCompanionDrawerKey,
  compactCompanionPanelWidth,
  compactCompanionSummary,
} from "../src/compactCompanionDrawer.js";
import { appendCompactSideDock } from "../src/initiativeCardCompact.js";

function createNode(tagName) {
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    attributes: {},
    children: [],
    listeners: {},
    textContent: "",
    title: "",
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    },
    dispatch(type, event = { stopPropagation() {} }) {
      for (const listener of this.listeners[type] || []) listener(event);
    },
  };
}

const documentRef = { createElement: createNode };
const companions = [
  { itemId: "body", casterId: "auril", instanceId: "titan", label: "Corpo del Titano", hp: 495, hpMax: 495, sharedHp: true, iconUrl: "/a.png" },
  { itemId: "hand", casterId: "auril", instanceId: "titan", label: "Mano del Titano", hp: 495, hpMax: 495, sharedHp: true, iconUrl: "/b.png" },
  { itemId: "head", casterId: "auril", instanceId: "titan", label: "Testa del Titano", hp: 495, hpMax: 495, sharedHp: true, iconUrl: "/c.png" },
];

test("la linguetta dei compagni dice cosa contiene e quanto è larga da aperta", () => {
  assert.equal(compactCompanionDrawerKey(companions), "auril|titan");
  assert.equal(compactCompanionSummary(companions), "Token collegati · 3");
  assert.equal(compactCompanionSummary([{ sharedHp: false }]), "Evocazione · 1");
  assert.equal(compactCompanionSummary([{ sharedHp: true }, { sharedHp: false }]), "Token collegati ed evocazioni · 2");
  // One column per four companions.
  assert.equal(compactCompanionPanelWidth(3), 12 + 4 + 172);
  assert.equal(compactCompanionPanelWidth(10), 12 + 4 + 3 * 172 + 2 * 6);
});

test("chiusa la linguetta occupa 22px a destra della card; aperta mostra le righe e sposta le card dopo", () => {
  const card = createNode("article");
  card.style.position = "relative";
  let layoutChanges = 0;
  const drawer = appendCompactCompanionDrawer(card, companions, {
    documentRef,
    onLayoutChange: () => { layoutChanges += 1; },
  });
  const [tab, panel] = drawer.children;
  assert.equal(drawer.style.left, "calc(100% + 3px)");
  assert.equal(drawer.style.top, "0");
  assert.equal(drawer.style.bottom, "0");
  assert.equal(card.style.overflow, "visible");
  assert.equal(card.style.marginRight, `${3 + COMPACT_COMPANION_TAB_WIDTH}px`);
  assert.equal(card.style.marginBottom, undefined, "nothing under the card any more");
  assert.equal(panel.style.display, "none");
  assert.equal(tab.title, "Token collegati · 3: apri");
  assert.equal(panel.children.length, 3);

  tab.dispatch("click");
  assert.equal(panel.style.display, "grid");
  assert.equal(card.style.marginRight, `${3 + COMPACT_COMPANION_TAB_WIDTH + 3 + compactCompanionPanelWidth(3)}px`);
  assert.equal(tab.attributes["aria-expanded"], "true");
  assert.equal(layoutChanges, 1);

  tab.dispatch("click");
  assert.equal(panel.style.display, "none");
  assert.equal(card.style.marginRight, "25px");
  assert.equal(appendCompactCompanionDrawer(createNode("article"), [], { documentRef }), null);
});

test("gli agganci laterali si mettono in fila e allargano il margine della card", () => {
  const card = createNode("article");
  const first = appendCompactSideDock(card, createNode("div"), 100);
  const second = appendCompactSideDock(card, createNode("div"), 22);
  assert.equal(first.element.style.left, "calc(100% + 3px)");
  assert.equal(second.element.style.left, "calc(100% + 106px)");
  assert.equal(card.style.marginRight, "128px");
  second.resize(60);
  assert.equal(card.style.marginRight, "166px");
});

test("il tracker compatto usa la linguetta al posto della pila sotto la card e conta i cassetti nella larghezza", () => {
  const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  const compactSection = source.slice(source.indexOf("function renderCompactTrack("));
  assert.ok(compactSection.includes("appendCompactCompanionDrawer("));
  assert.ok(!compactSection.slice(0, compactSection.indexOf("function ", 30)).includes("appendSpellBoardTokenCompanions("));
  assert.ok(source.includes("extraWidth: compactCards.reduce((total, card) => total + (Number.parseFloat(card.style.marginRight) || 0), 0)"));
});

test("la larghezza del tracker compatto comprende i cassetti aperti, fino al massimo", async () => {
  const { compactTrackerWidth, COMPACT_TRACKER_MAX_WIDTH } = await import("../src/trackerCompactSizingCore.js");
  const base = compactTrackerWidth(3, { showToolbar: true, showNavigation: true });
  assert.equal(compactTrackerWidth(3, { showToolbar: true, showNavigation: true, extraWidth: 25 }), base + 25);
  assert.equal(compactTrackerWidth(3, { showToolbar: true, showNavigation: true, extraWidth: 5000 }), COMPACT_TRACKER_MAX_WIDTH);
});
