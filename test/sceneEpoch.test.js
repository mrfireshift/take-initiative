import assert from "node:assert/strict";
import test from "node:test";
import { createSceneEpochController } from "../src/sceneEpoch.js";

test("unload invalida il lavoro della scena precedente e il ready conserva il nuovo epoch", () => {
  const controller = createSceneEpochController({ initialEpoch: 7 });
  const events = [];
  controller.subscribe((event) => events.push(event));

  const sceneAEpoch = controller.current();
  assert.equal(controller.isCurrent(sceneAEpoch), true);

  controller.invalidate("scene-unload");
  assert.equal(controller.current(), 8);
  assert.equal(controller.isCurrent(sceneAEpoch), false);
  assert.equal(controller.isCurrent(8), false);

  controller.markReady("scene-ready");
  assert.equal(controller.isCurrent(8), true);
  assert.deepEqual(events.map(({ phase, epoch, ready }) => ({ phase, epoch, ready })), [
    { phase: "unload", epoch: 8, ready: false },
    { phase: "ready", epoch: 8, ready: true },
  ]);
});
