import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrackerQuickActionLauncher,
  trackerQuickActionSummary,
} from "../src/trackerQuickActions.js";

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
        textContent: "",
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          const normalized = {
            preventDefault() {},
            stopPropagation() {},
            ...event,
          };
          for (const listener of this.listeners[type] || []) {
            await listener(normalized);
          }
        },
      };
    },
  };
}

const action = {
  id: "shield",
  label: "Scudo della Fede",
  kind: "spell",
  spellId: "shield-of-faith",
  workflow: "spell",
  targetMode: "selection",
};

test("costruisce un vero pulsante toggle per il popover", async () => {
  const documentRef = createTestDocument();
  const toggles = [];
  const launcher = buildTrackerQuickActionLauncher({
    actions: [action],
    compact: false,
    expanded: true,
    documentRef,
    onToggle(button) {
      toggles.push(button);
    },
  });

  assert.ok(launcher);
  const [button] = launcher.children;
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.textContent, "⚡");
  assert.equal(button.attributes["aria-haspopup"], "menu");
  assert.equal(button.attributes["aria-expanded"], "true");
  assert.equal(launcher.style.left, "-17px");
  assert.equal(button.style.width, "22px");
  assert.equal(button.style.height, "22px");
  assert.equal(button.style.border, "2px solid #fde047");
  assert.equal(button.style.borderRadius, "50%");

  await button.dispatch("click");
  assert.deepEqual(toggles, [button]);
});

test("non monta il pulsante senza azioni valide", () => {
  assert.equal(buildTrackerQuickActionLauncher({
    actions: [],
    documentRef: createTestDocument(),
  }), null);
});

test("riassume tipo e bersaglio senza dipendere dal pannello", () => {
  assert.equal(
    trackerQuickActionSummary(action),
    "Incantesimo · lancio rapido · bersaglio selezionato",
  );
  assert.equal(trackerQuickActionSummary({
    id: "vow",
    label: "Giuramento",
    kind: "condition",
    conditionName: "Giuramento di Inimicizia",
    targetMode: "self",
  }), "Giuramento di Inimicizia · su di sé");
});
