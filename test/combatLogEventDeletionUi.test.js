import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";

const source = readFileSync(new URL("../src/history-modal.ts", import.meta.url), "utf8");
const rowSource = source.slice(source.indexOf("function makeEventRow("), source.indexOf("function undoReadinessLabel("));
const { code } = transformSync(rowSource, { loader: "ts" });

function fixture() {
  const document = { activeElement: null, createElement: (tag) => Object.assign(new FakeNode(document, tag), { style: {} }) };
  const makeRow = runInNewContext(`${code}\nmakeEventRow`, {
    document,
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

for (const boundary of [false, true]) {
  test(`event deletion requires confirmation, supports cancel, and blocks a duplicate submit (boundary=${boundary})`, async () => {
    const { document, makeRow } = fixture();
    const event = { id: "chosen-event", title: "Evento", boundary };
    const deleted = [];
    let finish;
    const row = makeRow(event, async (chosen) => {
      deleted.push(chosen.id);
      await new Promise((resolve) => { finish = resolve; });
    });
    const remove = nodes(row).find((node) => node.dataset.combatLogControl === "delete-event");
    const confirmation = nodes(row).find((node) => node.dataset.combatLogDeleteConfirmation === event.id);
    const cancel = confirmation.children.find((node) => node.textContent === "Annulla");
    const confirm = confirmation.children.find((node) => node.textContent === "Elimina evento");
    let prevented = false;
    await remove.emit("click", { preventDefault() { prevented = true; } });
    assert.equal(prevented, true, "the trash action does not toggle the event accordion");
    assert.equal(confirmation.style.display, "flex");
    assert.equal(document.activeElement, confirm);
    assert.deepEqual(deleted, []);
    await cancel.click();
    assert.equal(confirmation.style.display, "none");
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
