import test from "node:test";
import assert from "node:assert/strict";
import { createSharedHpController } from "../src/sharedHpController.js";
import { reset, cleanup, sdk, apply, items, meta, token } from "../test-support/sharedHpHarness.js";
test.beforeEach(() => reset([token("auril"), token("hand", { hp: 12 })]));
test.after(cleanup);

test("controller presents candidates, links selected members and unlinks without clearing HP", async () => {
  const controller = createSharedHpController({ api: sdk, runMutation: apply,
    getSceneContext: async () => ({ commandId: "link" }), isCurrent: () => true });
  const view = await controller.read(["hand"]);
  assert.deepEqual(view.tokens.map(item => item.id), ["hand"]);
  assert.ok(view.candidates.some(item => item.id === "auril"));
  const result = await controller.link("auril", ["hand"], { commandId: "link" });
  assert.equal(result.status, "applied"); assert.equal(meta("hand").hp, 300);
  await controller.unlink(["hand"], { commandId: "unlink" });
  assert.equal(meta("hand").hp, 300); assert.equal(meta("hand").sharedHpSourceId, undefined);
  assert.equal(items.length, 2);
});

test("controller rejects stale scene context and repeated submit while one is pending", async () => {
  let current = true; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const controller = createSharedHpController({ api: sdk, runMutation: async (...args) => {
    await gate; return apply(...args);
  }, getSceneContext: async () => ({}), isCurrent: () => current });
  const first = controller.link("auril", ["hand"], {});
  assert.equal((await controller.link("auril", ["hand"], {})).reason, "shared-hp-busy");
  release(); await first;
  current = false;
  assert.equal((await controller.unlink(["hand"], {})).status, "rejected");
  assert.equal(meta("hand").sharedHpSourceId, "auril");
});
