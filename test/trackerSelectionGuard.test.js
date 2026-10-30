import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Lot L20: fast clicks on the tracker (▲/▼, a card) selected the whole document and painted it blue. The guard covered
// the tracker's container only: html and body stayed selectable, and the mousedown guard let cards through.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("L20: nel tracker nessuna selezione di testo parte fuori da un campo", () => {
  const page = read("../index.html");
  assert.match(page, /html,\n\s+body,\n\s+#app \{\n\s+-webkit-user-select: none;\n\s+user-select: none;/);
  assert.match(page, /#app input,\n\s+#app textarea,\n\s+#app \[contenteditable="true"\] \{\n\s+-webkit-user-select: text;\n\s+user-select: text;/,
    "the fields typed in keep their selection");

  const tracker = read("../src/initiativeList.js");
  const guard = tracker.slice(tracker.indexOf(`document.addEventListener("selectstart"`), tracker.indexOf(`}, { capture: true });`, tracker.indexOf(`document.addEventListener("selectstart"`)));
  assert.ok(guard.length > 0);
  const body = guard.slice(guard.indexOf("{") + 1);
  class FakeElement {}
  const handler = new Function("Element", `return (e) => {${body}};`)(FakeElement);
  const event = (target) => ({ target, prevented: false, preventDefault() { this.prevented = true; } });
  const node = (editable) => Object.assign(new FakeElement(), { closest: (selector) => editable && selector.includes("input") ? {} : null });
  const outside = event(node(false));
  handler(outside);
  assert.equal(outside.prevented, true, "a card, a button, the background: no selection");
  const field = event(node(true));
  handler(field);
  assert.equal(field.prevented, false, "a field keeps its selection");
});
