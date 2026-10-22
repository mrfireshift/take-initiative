import test from "node:test";
import assert from "node:assert/strict";
import { UNDO_TOAST_DURATION_MS, dismissUndoToast, showUndoToast } from "../src/undoToast.js";

function createNode(tagName) {
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    attributes: {},
    children: [],
    listeners: {},
    parentNode: null,
    disabled: false,
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    },
    async dispatch(type, event = { stopPropagation() {} }) {
      for (const listener of this.listeners[type] || []) await listener(event);
    },
  };
}

function setup() {
  const body = createNode("body");
  const timers = [];
  return {
    body,
    timers,
    options: {
      documentRef: { body, createElement: createNode },
      setTimer: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
      clearTimer: (id) => { if (timers[id]) timers[id].cleared = true; },
    },
  };
}

test("il toast mostra il messaggio con Annulla e si chiude da solo dopo 8 secondi", () => {
  const { body, timers, options } = setup();
  let undone = 0;
  const handle = showUndoToast({ message: "Iniziativa svuotata", onUndo: () => { undone += 1; }, ...options });
  const [text, undoButton, closeButton] = handle.element.children;
  assert.equal(body.children.length, 1);
  assert.equal(handle.element.attributes.role, "status");
  assert.equal(text.textContent, "Iniziativa svuotata");
  assert.equal(undoButton.textContent, "Annulla");
  assert.equal(undoButton.className, "obrt-btn obrt-btn--primary");
  assert.equal(closeButton.attributes["aria-label"], "Chiudi");
  assert.equal(UNDO_TOAST_DURATION_MS, 8000);
  assert.equal(timers[0].ms, 8000);
  timers[0].fn();
  assert.equal(body.children.length, 0);
  assert.equal(undone, 0);
});

test("Annulla esegue l'azione una volta e chiude il toast; × chiude senza annullare", async () => {
  const { body, timers, options } = setup();
  let undone = 0;
  const handle = showUndoToast({ message: "Round riportato a 1 (era 5)", onUndo: async () => { undone += 1; }, ...options });
  const [, undoButton] = handle.element.children;
  await undoButton.dispatch("click");
  await undoButton.dispatch("click");
  assert.equal(undone, 1);
  assert.equal(body.children.length, 0);
  assert.equal(timers[0].cleared, true);

  const second = showUndoToast({ message: "Iniziativa svuotata", onUndo: () => { undone += 1; }, ...options });
  await second.element.children[2].dispatch("click");
  assert.equal(undone, 1);
  assert.equal(body.children.length, 0);
});

test("un nuovo toast sostituisce il precedente, che non si può più annullare", () => {
  const { body, options } = setup();
  const first = showUndoToast({ message: "Round riportato a 1 (era 3)", onUndo: () => {}, ...options });
  const second = showUndoToast({ message: "Iniziativa svuotata", onUndo: () => {}, ...options });
  assert.deepEqual(body.children, [second.element]);
  assert.equal(first.element.parentNode, null);
  dismissUndoToast();
  assert.equal(body.children.length, 0);
  assert.equal(showUndoToast({ message: "x", ...options }), null);
});
