import test from "node:test";
import assert from "node:assert/strict";
import {
  enableClassicCardRename,
  normalizeInitiativeInput,
  normalizeSignedIntegerInput,
  parseInlineMath,
} from "../src/initiativeEditors.js";

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
        isConnected: false,
        textContent: "",
        title: "",
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          child.isConnected = true;
          return child;
        },
        replaceWith(replacement) {
          if (!this.parentNode) return;
          const parent = this.parentNode;
          const index = parent.children.indexOf(this);
          if (index < 0) return;
          parent.children[index] = replacement;
          replacement.parentNode = parent;
          replacement.isConnected = true;
          this.parentNode = null;
          this.isConnected = false;
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          for (const listener of this.listeners[type] || []) {
            await listener(event);
          }
        },
        focus() {
          this.focused = true;
        },
        select() {
          this.selected = true;
        },
      };
    },
  };
}

function createTestEvent(overrides = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

function flushAsyncEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("parseInlineMath conserva assoluti, delta e clamp a zero", () => {
  assert.equal(parseInlineMath("", 12), 12);
  assert.equal(parseInlineMath("+5", 12), 17);
  assert.equal(parseInlineMath("-20", 12), 0);
  assert.equal(parseInlineMath("7", 12), 7);
  assert.equal(parseInlineMath("abc", 12), 12);
});

test("i normalizzatori conservano i contratti correnti degli editor", () => {
  assert.equal(normalizeSignedIntegerInput("  +12a3 "), "+123");
  assert.equal(normalizeSignedIntegerInput("--8"), "-8");
  assert.equal(normalizeSignedIntegerInput("1+2"), "12");
  assert.equal(normalizeInitiativeInput(" 2a-1 "), "-21");
  assert.equal(normalizeInitiativeInput("-12"), "-12");
});

test("il rename classico mantiene stile, dataset e persistenza iniettata", async () => {
  const documentRef = createTestDocument();
  const card = documentRef.createElement("article");
  const name = documentRef.createElement("div");
  const nameLabel = documentRef.createElement("span");
  name.appendChild(nameLabel);
  card.appendChild(name);
  card.draggable = true;
  const saved = [];

  enableClassicCardRename({
    card,
    name,
    nameLabel,
    getOriginalName: () => "Goblin",
    borderColor: "#abcdef",
    dragAllowed: true,
    saveName: async (nextName) => saved.push(nextName),
    documentRef,
  });

  assert.equal(nameLabel.title, "Doppio clic per rinominare il token");
  assert.equal(nameLabel.style.cursor, "text");
  await nameLabel.dispatch("dblclick", createTestEvent());
  const input = name.children[0];
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.dataset.cardSelectionIgnore, "1");
  assert.equal(input.style.border, "1px solid #abcdef");
  assert.equal(card.dataset.renaming, "1");
  assert.equal(card.draggable, false);

  input.value = "  Hobgoblin  ";
  await input.dispatch("keydown", createTestEvent({ key: "Enter" }));
  await flushAsyncEvents();
  assert.deepEqual(saved, ["Hobgoblin"]);
  assert.equal(name.children[0], nameLabel);
  assert.equal(nameLabel.textContent, "Hobgoblin");
  assert.equal(name.title, "Hobgoblin");
  assert.equal(card.dataset.renaming, undefined);
  assert.equal(card.draggable, true);
});
