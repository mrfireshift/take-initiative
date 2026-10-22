import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";

const source = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8");
const rowSource = source.slice(source.indexOf("function bindRowSelection("), source.indexOf("function undoReadinessLabel("));
const { code } = transformSync(rowSource, { loader: "ts" });

function fixture() {
  const document = { activeElement: null, createElement: (tag) => Object.assign(new FakeNode(document, tag), { style: {} }) };
  const makeRow = runInNewContext(`${code}\nmakeEventRow`, {
    document,
    Event: class { constructor(type) { this.type = type; } },
    queueMicrotask,
    getCombatLogCategoryMeta: () => ({ tone: "#fff", label: "Nota" }),
    formatCombatLogTimestamp: () => "12:00",
    categoryBadge: () => document.createElement("span"),
    appendDetailSections: () => {},
    combatLogUiState: { expandedEvents: new Set() },
    combatLogStorageAction: false,
    combatLogPageLoading: false,
    sceneLifecycle: { isReady: () => true },
    button: (label) => Object.assign(document.createElement("button"), { textContent: label }),
  });
  return { document, makeRow };
}
const nodes = (node) => [node, ...node.children.flatMap(nodes)];
const controls = (row, event) => {
  const remove = nodes(row).find((node) => node.dataset.combatLogControl === "delete-event");
  const confirmation = nodes(row).find((node) => node.dataset.combatLogDeleteConfirmation === event.id);
  return {
    remove,
    confirmation,
    cancel: confirmation.children.find((node) => node.getAttribute("aria-label") === "Annulla"),
    confirm: confirmation.children.find((node) => node.textContent === "Elimina"),
  };
};

for (const boundary of [false, true]) {
  test(`event deletion asks an inline confirmation on the same line, supports cancel, and blocks a duplicate submit (boundary=${boundary})`, async () => {
    const { document, makeRow } = fixture();
    const event = { id: "chosen-event", title: "Evento", boundary };
    const deleted = [];
    let finish;
    const row = makeRow(event, async (chosen) => {
      deleted.push(chosen.id);
      await new Promise((resolve) => { finish = resolve; });
    });
    const { remove, confirmation, cancel, confirm } = controls(row, event);
    assert.equal(confirmation.parentNode, remove.parentNode, "the confirmation sits in the title row, next to the trash button");
    assert.equal(confirmation.style.display, "none");
    let prevented = false;
    await remove.emit("click", { preventDefault() { prevented = true; } });
    assert.equal(prevented, true, "the trash action does not toggle the event accordion");
    assert.equal(confirmation.style.display, "inline-flex");
    assert.equal(remove.style.display, "none", "the trash button gives its place to the confirmation");
    assert.equal(document.activeElement, confirm);
    assert.deepEqual(deleted, []);
    await cancel.click();
    assert.equal(confirmation.style.display, "none");
    assert.equal(remove.style.display, "");
    assert.equal(remove.disabled, false);
    assert.deepEqual(deleted, []);
    await remove.click();
    const pending = confirm.click();
    assert.deepEqual(deleted, [event.id]);
    assert.equal(confirm.disabled, true);
    assert.equal(cancel.disabled, true);
    finish();
    await pending;
    assert.equal(confirm.disabled, false);
  });
}

test("Escape closes the inline confirmation without deleting", async () => {
  const { makeRow } = fixture();
  const event = { id: "kept", title: "Evento" };
  const deleted = [];
  const row = makeRow(event, async (chosen) => { deleted.push(chosen.id); });
  const { remove, confirmation } = controls(row, event);
  await remove.click();
  await confirmation.emit("keydown", { key: "Escape" });
  assert.equal(confirmation.style.display, "none");
  assert.equal(remove.disabled, false);
  assert.deepEqual(deleted, []);
});

test("in selection mode a checkbox replaces the trash button and a row click toggles it", async () => {
  const { makeRow } = fixture();
  const event = { id: "picked", title: "Evento" };
  const toggles = [];
  const row = makeRow(event, async () => {}, { active: true, selected: false, onToggle: (chosen, selected) => toggles.push([chosen.id, selected]) });
  assert.equal(nodes(row).some((node) => node.dataset.combatLogControl === "delete-event"), false);
  const checkbox = nodes(row).find((node) => node.dataset.combatLogControl === "select-event");
  assert.equal(checkbox.checked, false);
  const summary = nodes(row).find((node) => node.tagName === "SUMMARY");
  checkbox.dispatchEvent = (changeEvent) => checkbox.emit(changeEvent.type);
  await summary.emit("click", { target: summary });
  assert.equal(checkbox.checked, true);
  assert.deepEqual(toggles, [["picked", true]]);
  assert.equal(row.style.boxShadow.includes("inset"), true, "a selected row is outlined");
});

test("an open confirmation survives the re-render a scene change triggers, and only for its own event", async () => {
  const { makeRow } = fixture();
  const event = { id: "pending", title: "Evento" };
  const first = makeRow(event, async () => {});
  await controls(first, event).remove.click();
  const rerendered = controls(makeRow(event, async () => {}), event);
  assert.equal(rerendered.confirmation.style.display, "inline-flex");
  assert.equal(rerendered.remove.style.display, "none");
  const other = { id: "other", title: "Altro" };
  assert.equal(controls(makeRow(other, async () => {}), other).confirmation.style.display, "none");
  await rerendered.cancel.click();
  assert.equal(controls(makeRow(event, async () => {}), event).confirmation.style.display, "none");
});
