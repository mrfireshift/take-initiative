import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L20: fast clicks on the tracker (▲/▼, a card) painted the whole panel blue. Only the text fields (the inline
// editors) may hold a selection: not the checkboxes, menus or buttons. Three guards in initiativeList.js: no selection
// starts outside a text field, a double or triple click there does not select by word or paragraph, and a selection
// that appears anyway is cleared at once.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tracker = read("../src/initiativeList.js");

class FakeElement {
  constructor(tag, type = "") { this.tag = tag; this.type = type; }
  // The guard's selector, read as the browser would for these few cases.
  closest(selector) {
    if (this.tag === "textarea" && selector.includes("textarea")) return this;
    if (this.tag === "input" && ["text", "number", "search"].includes(this.type) && selector.includes(`input[type="${this.type}"]`)) return this;
    return null;
  }
}

function guards() {
  const body = tracker.slice(tracker.indexOf("const TRACKER_TEXT_FIELD ="), tracker.indexOf("container.addEventListener(\"mousedown\""));
  const listeners = {};
  const document = { activeElement: null, addEventListener: (type, handler) => { listeners[type] = handler; } };
  const selection = { isCollapsed: false, rangeCount: 1, cleared: 0, removeAllRanges() { this.cleared += 1; } };
  const window = { getSelection: () => selection };
  new Function("Element", "document", "window", body)(FakeElement, document, window);
  return { listeners, document, selection };
}

const event = (target, detail = 1) => ({ target, detail, prevented: false, preventDefault() { this.prevented = true; } });

test("L20: nessuna selezione parte fuori da un campo di testo, caselle comprese", () => {
  const { listeners } = guards();
  for (const [target, prevented] of [
    [new FakeElement("button"), true],
    [new FakeElement("input", "checkbox"), true],
    [new FakeElement("div"), true],
    [new FakeElement("input", "text"), false],
  ]) {
    const start = event(target);
    listeners.selectstart(start);
    assert.equal(start.prevented, prevented, `${target.tag}${target.type ? `[${target.type}]` : ""}`);
  }
});

test("L20: un doppio o triplo clic fuori da un campo non seleziona; il primo clic e i campi sono liberi", () => {
  const { listeners } = guards();
  const double = event(new FakeElement("button"), 2);
  listeners.mousedown(double);
  assert.equal(double.prevented, true);
  const triple = event(new FakeElement("div"), 3);
  listeners.mousedown(triple);
  assert.equal(triple.prevented, true);
  const single = event(new FakeElement("button"), 1);
  listeners.mousedown(single);
  assert.equal(single.prevented, false, "a single click (and a card's drag) is untouched");
  const inField = event(new FakeElement("input", "text"), 2);
  listeners.mousedown(inField);
  assert.equal(inField.prevented, false, "a double click in a field selects its word");
});

test("L20: una selezione comparsa comunque viene tolta, salvo mentre si scrive in un campo", () => {
  const { listeners, document, selection } = guards();
  listeners.selectionchange();
  assert.equal(selection.cleared, 1);
  document.activeElement = new FakeElement("input", "text");
  listeners.selectionchange();
  assert.equal(selection.cleared, 1, "the text of the field being edited stays selected");
  document.activeElement = new FakeElement("input", "checkbox");
  listeners.selectionchange();
  assert.equal(selection.cleared, 2);
});

test("L20: le regole CSS lasciano selezionabili solo i campi di testo", () => {
  const page = read("../index.html");
  assert.match(page, /html,\n\s+body,\n\s+#app \{\n\s+-webkit-user-select: none;\n\s+user-select: none;/);
  assert.match(page, /#app input:not\(\[type\]\),\n\s+#app input\[type="text"\],\n\s+#app input\[type="number"\],\n\s+#app input\[type="search"\],\n\s+#app textarea,/);
  assert.doesNotMatch(page, /#app input,\n/, "a checkbox is not a text field");
  assert.match(tracker, /\.tbp-root \*:not\(input\[type="text"\]\):not\(input\[type="number"\]\):not\(input\[type="search"\]\):not\(textarea\):not\(\[contenteditable="true"\]\)/);
});
