// Lot L2 of the tracker UI study (docs/STUDIO_UI_TRACKER_BG3.md): the compact card's refinements. The Boss console
// circle no longer covers "EP", the HP bars take the map's colours, a label with no room is counted in "+N", a name
// with an epithet shows the part before the comma, "Fuori combattimento" is "A terra" in the compact card.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bindCompactEffectsToggle,
  buildCompactCardHP,
  buildCompactCardName,
  buildCompactCardStatus,
  buildCompactVirtualTurnLabel,
  compactCardDisplayName,
  compactPreviewPillFits,
  syncCompactEffectsToggleState,
} from "../src/initiativeCardCompact.js";

const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const classicBuilder = readFileSync(new URL("../src/initiativeCardClassicBuilder.js", import.meta.url), "utf8");

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        listeners: {},
        parentNode: null,
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
        async dispatch(type, event = {}) {
          for (const listener of this.listeners[type] || []) await listener(event);
        },
        click() {},
      };
    },
  };
}

function createTestEvent() {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

const effect = (label) => ({ kind: "condition", label, title: label });

test("a name with an epithet that does not fit shows the part before the comma, the title keeps the whole name", () => {
  const tooWide = () => false;
  const fits = () => true;
  assert.equal(compactCardDisplayName("Auril, Vergine del Gelo", { fits: tooWide }), "Auril");
  assert.equal(compactCardDisplayName("Auril, Vergine del Gelo", { fits }), "Auril, Vergine del Gelo");
  // No comma, or nothing before it: the name as it is, cut by the card as before.
  assert.equal(compactCardDisplayName("Goblin capobanda dal nome molto lungo", { fits: tooWide }), "Goblin capobanda dal nome molto lungo");
  assert.equal(compactCardDisplayName(", senza nome", { fits: tooWide }), ", senza nome");
  assert.equal(compactCardDisplayName(undefined, { fits: tooWide }), "");

  // Without a canvas (here) the card counts the characters.
  const name = buildCompactCardName({ name: "Auril, Vergine del Gelo" }, { active: false, documentRef: createTestDocument() });
  assert.equal(name.textContent, "Auril");
  assert.equal(name.title, "Auril, Vergine del Gelo");
  const short = buildCompactCardName({ name: "Lavera" }, { active: true, documentRef: createTestDocument() });
  assert.equal(short.textContent, "Lavera");
});

test("the first label is drawn while the legendary pips leave it at least four letters", () => {
  assert.equal(compactPreviewPillFits({}), true);
  assert.equal(compactPreviewPillFits({ legendaryMax: 3, pipSize: 7 }), true);
  assert.equal(compactPreviewPillFits({ resistanceMax: 3, pipSize: 7 }), true);
  assert.equal(compactPreviewPillFits({ legendaryMax: 3, resistanceMax: 2, pipSize: 7 }), true);
  // Both rows of three: 27px left, "Sc…" on the bench.
  assert.equal(compactPreviewPillFits({ legendaryMax: 3, resistanceMax: 3, pipSize: 7 }), false);
});

test("without the label the row holds '+N' for every effect, and the drawer closes from it", async () => {
  const one = buildCompactCardStatus([effect("Scudo della fede (4)")], { showPreview: false, documentRef: createTestDocument() });
  assert.equal(one.previewPill, null);
  assert.equal(one.status.children.length, 1);
  assert.equal(one.effectSlot.children[0], one.moreEffectsButton);
  assert.equal(one.effectSlot.style.flex, "0 0 auto");
  assert.equal(one.moreEffectsButton.textContent, "+1");
  assert.equal(one.moreEffectsButton.style.position, "relative");
  assert.equal(one.moreEffectsButton.style.transform, "none");
  assert.equal(one.moreEffectsButton.attributes["aria-label"], "Mostra 1 effetto");

  const three = buildCompactCardStatus([effect("Prono"), effect("Stordito"), effect("Accecato")], {
    showPreview: false,
    documentRef: createTestDocument(),
  });
  assert.equal(three.moreEffectsButton.textContent, "+3");
  assert.equal(three.moreEffectsButton.attributes["aria-label"], "Mostra 3 effetti");

  syncCompactEffectsToggleState({ previewPill: null, moreEffectsButton: three.moreEffectsButton, effectsCount: 3, opened: true, hiddenCount: 3 });
  assert.equal(three.moreEffectsButton.textContent, "−");
  assert.equal(three.moreEffectsButton.style.display, "inline-flex");
  assert.equal(three.moreEffectsButton.attributes["aria-expanded"], "true");
  assert.equal(three.moreEffectsButton.attributes["aria-label"], "Nascondi gli effetti");

  let opened = false;
  const button = one.moreEffectsButton;
  bindCompactEffectsToggle({
    previewPill: null,
    moreEffectsButton: button,
    effectsCount: 1,
    hiddenCount: 1,
    requestToggle: async () => (opened = !opened),
  });
  await button.dispatch("click", createTestEvent());
  assert.equal(button.textContent, "−");
  await button.dispatch("click", createTestEvent());
  assert.equal(button.textContent, "+1");

  // With the label nothing changes: "+N" counts the others and hides while the drawer is open.
  const withLabel = buildCompactCardStatus([effect("Prono"), effect("Stordito")], { documentRef: createTestDocument() });
  assert.ok(withLabel.previewPill);
  assert.equal(withLabel.moreEffectsButton.textContent, "+1");
  assert.equal(withLabel.moreEffectsButton.style.position, "absolute");
});

test("the compact card says 'A terra' for a creature out of the fight in the status mode", () => {
  const { hpText } = buildCompactCardHP(
    { id: "goblin", hpDisclosure: { mode: "status", status: "down", ratio: 0 } },
    { showHP: true, safeHP: 0, hpMax: 1, hpPercent: 0, knockedOut: true, hpColorByPct: () => "#ef4444", documentRef: createTestDocument() },
  );
  assert.equal(hpText.textContent, "A terra");
});

test("the Epic Action label keeps 6px a side, so 'Azione Epica' fits", () => {
  const label = buildCompactVirtualTurnLabel(
    { isEpicAction: true },
    { faction: { border: "#ef4444", base: "#ef4444" }, rgba: (color) => color, documentRef: createTestDocument() },
  );
  assert.equal(label.textContent, "Azione Epica");
  assert.equal(label.style.padding, "2px 6px");
});

test("the tracker: Boss circle below EP, map colours, every effect in the drawer without the label", () => {
  assert.ok(tracker.includes("const belowCorner = compact && (!!sourceEntry.isEpic || epicAction);"));
  const hpColors = tracker.slice(tracker.indexOf("function hpColorByPct(p){"), tracker.indexOf("function hpColorByPct(p){") + 200);
  assert.match(hpColors, /return "#22c55e";[\s\S]*return "#f59e0b";[\s\S]*return "#ef4444";/);
  assert.match(classicBuilder, /initPct > 0\.66 \? "#22c55e" : initPct > 0\.33 \? "#f59e0b" : "#ef4444"/);
  const compact = tracker.slice(tracker.indexOf("function renderCompactTrack("));
  // compactStatusLayout holds L2's rule: it decides the label, "+N" and the drawer.
  assert.ok(compact.includes("const statusLayout = compactStatusLayout(compactEffects, {"));
  assert.ok(compact.includes("hiddenCount: statusLayout.hiddenCount,"));
  assert.ok(compact.includes("statusLayout.drawer,\n          1,"));
  assert.ok(tracker.includes("if (!effects?.length || effects.length < minEffects) return false;"));
});
