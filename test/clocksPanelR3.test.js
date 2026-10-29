import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L20 of the bugfix pass, polish R3 "Clock" (docs/PIANO_BUGFIX_POLISHING.md, section 3).
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const modal = read("../src/clocks-modal.js");

test("L20: un clock nuovo nasce nascosto ai giocatori, salvo la casella del modulo", () => {
  assert.match(modal, /<label class="clock-visible-new"><input type="checkbox" name="visible" \/> Visibile ai giocatori<\/label>/);
  assert.match(modal, /visible: data\.get\("visible"\) === "on",/);
  assert.doesNotMatch(modal, /color: String\(data\.get\("color"\) \|\| CLOCK_COLOR_OPTIONS\[0\]\),\n\s+visible: true,/);
  assert.match(read("../public/clocks.css"), /\.clock-visible-new \{/);
});

test("L20: il pannello si ridisegna solo quando cambiano i clock", () => {
  assert.match(modal, /const next = normalizeClocksState\(metadata\?\.\[CLOCKS_KEY\]\);\n(\s+\/\/.*\n)+\s+if \(JSON\.stringify\(next\) === JSON\.stringify\(state\)\) return;/);
});

function fakeNode(props = {}) {
  return { dataset: {}, attributes: {}, children: [], ...props,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    focus() { fakeDocument.activeElement = this; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  };
}
const fakeDocument = { activeElement: null };

// A panel with one clock card (its "Gestisci") and the create form, as render() draws it.
function panel() {
  const details = fakeNode({ open: false });
  const card = fakeNode({ dataset: { clockId: "c1" }, querySelector: () => details });
  details.closest = () => card;
  const name = fakeNode({ value: "", selectionStart: 0, selectionEnd: 0 });
  const segments = fakeNode({ value: "6" });
  const color = fakeNode({ value: "#ef4444" });
  const visible = fakeNode({ checked: false });
  const choices = ["#ef4444", "#3b82f6"].map((value) => fakeNode({ dataset: { color: value } }));
  const fields = { "[name=name]": name, "[name=segments]": segments, "[name=color]": color, "[name=visible]": visible };
  const form = fakeNode({
    querySelector: (selector) => fields[selector] || null,
    querySelectorAll: () => choices,
  });
  const root = {
    querySelector: (selector) => selector === "[data-create-form]" ? form : null,
    querySelectorAll: (selector) => selector === "details.clock-settings[open]"
      ? (details.open ? [details] : [])
      : selector === "[data-clock-id]" ? [card] : [],
  };
  return { root, details, name, segments, color, visible, choices };
}

test("L20: ridisegnato, il pannello tiene aperto «Gestisci» e il modulo che il GM sta compilando", () => {
  const body = modal.slice(modal.indexOf("function captureClocksPanelDraft("), modal.indexOf("function render() {"));
  const { capture, restore } = new Function("document", `${body} return { capture: captureClocksPanelDraft, restore: restoreClocksPanelDraft };`)(fakeDocument);
  const before = panel();
  before.details.open = true;
  before.name.value = "Rituale";
  before.name.selectionStart = 3;
  before.name.selectionEnd = 3;
  before.segments.value = "8";
  before.color.value = "#3b82f6";
  before.visible.checked = true;
  fakeDocument.activeElement = before.name;
  const draft = capture(before.root);

  fakeDocument.activeElement = null;
  const after = panel();
  restore(after.root, draft);
  assert.equal(after.details.open, true, "Gestisci stays open");
  assert.equal(after.name.value, "Rituale");
  assert.equal(after.segments.value, "8");
  assert.equal(after.color.value, "#3b82f6");
  assert.deepEqual(after.choices.map((choice) => choice.attributes["aria-pressed"]), ["false", "true"]);
  assert.equal(after.visible.checked, true);
  assert.equal(fakeDocument.activeElement, after.name, "the caret goes back in the name");
  assert.deepEqual([after.name.selectionStart, after.name.selectionEnd], [3, 3]);

  assert.match(modal, /const draft = captureClocksPanelDraft\(app\);\n\s+app\.innerHTML = `/);
  assert.match(modal, /<\/section>`;\n\s+restoreClocksPanelDraft\(app, draft\);/);
});
