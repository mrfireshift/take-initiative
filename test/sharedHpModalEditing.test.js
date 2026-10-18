import test from "node:test";
import assert from "node:assert/strict";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";
import { reset, cleanup, sdk, group, meta } from "../test-support/sharedHpHarness.js";

test("the shared HP panel controls GM/all-table child visibility without routing to the manual console", async () => {
  await reset(group());
  const doc = { createElement: tag => new FakeNode(doc, tag), getElementById: id => doc.root.querySelector(`#${id}`) };
  doc.root = new FakeNode(doc, "body");
  for (const id of ["source", "tracker-visibility", "selection", "preview", "preview-section", "members", "link", "unlink-selection", "unlink-all", "close", "status", "refresh", "source-summary", "source-name", "source-hp", "preview-count", "member-count"]) {
    const node = doc.createElement(["source", "tracker-visibility"].includes(id) ? "select" : "div"); node.id = id; doc.root.append(node);
  }
  globalThis.document = doc;
  globalThis.window = { addEventListener() {} };
  globalThis.location = { search: "?tokenId=hand", pathname: "/background.html" };
  globalThis.Option = function(label, value) { const option = doc.createElement("option"); option.textContent = label; option.value = value; return option; };
  doc.getElementById("tracker-visibility").append(new Option("Solo GM", "gm"), new Option("Tutto il tavolo", "all"));
  let ready;
  sdk.onReady = callback => { ready = callback; };
  try {
    await import("../src/shared-hp-modal.js?token-editing-test");
    await ready();
    assert.equal(doc.getElementById("source").value, "auril");
    const row = doc.getElementById("members").children.find(node => textOf(node).includes("hand"));
    assert.ok(row.querySelectorAll("button").some(node => node.textContent === "Scollega"));
    assert.equal(doc.getElementById("tracker-visibility").value, "gm");
    doc.getElementById("tracker-visibility").value = "all";
    await doc.getElementById("tracker-visibility").emit("change");
    assert.equal(meta("auril").sharedHpTrackerVisibility, "all");
    assert.equal(doc.getElementById("tracker-visibility").value, "all");
  } finally { cleanup(); delete globalThis.document; delete globalThis.window; }
});
