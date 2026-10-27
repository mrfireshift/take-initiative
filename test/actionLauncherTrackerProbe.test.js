// The extension icon toggles the tracker from its stored state, checked against OBR: a popover with no height is
// closed, while a probe OBR does not answer within 750 ms keeps the stored state, so the click closes the tracker.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

globalThis.window ||= { addEventListener: () => {} };

let heightAnswer = async () => 0;
let storedOpen = true;
const opens = [];
const marksClosed = [];
let runToggle = null;

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      onReady: () => {},
      popover: { getHeight: () => heightAnswer() },
      player: { getRole: async () => "PLAYER" },
      action: { close: async () => {}, onOpenChange: () => () => {}, isOpen: async () => false },
      room: { getMetadata: async () => ({}) },
    },
  },
});
mock.module("../src/trackerPopover.js", {
  namedExports: {
    TRACKER_POPOVER_ID: "tracker",
    isTrackerPopoverOpen: () => storedOpen,
    markTrackerPopoverClosed: () => { marksClosed.push(true); storedOpen = false; },
    setTrackerPopoverOpen: async (open) => { opens.push(open); },
  },
});
mock.module("../src/sceneLifecycle.js", {
  namedExports: {
    createSceneLifecycleAdapter: () => ({
      capture: () => ({}),
      isCurrent: () => true,
      isReady: () => true,
      subscribe: () => () => {},
      mount: async () => {},
      dispose: () => {},
    }),
  },
});
mock.module("../src/actionLauncherReadinessCore.js", {
  namedExports: {
    createActionLauncherReadinessCoordinator: (options) => {
      runToggle = options.runToggle;
      return { onSceneState: async () => {}, onActionOpenChange: async () => {}, setInitialOpen: async () => {}, dispose: () => {} };
    },
  },
});
await import("../src/action-launcher.js");

function reset(answer) {
  heightAnswer = answer;
  storedOpen = true;
  opens.length = 0;
  marksClosed.length = 0;
}

test("a tracker OBR reports with no height is closed: the click opens it", async () => {
  reset(async () => 0);
  assert.equal(await runToggle(), true);
  assert.deepEqual(opens, [true]);
  assert.equal(marksClosed.length, 1);
});

test("a failed probe still counts as closed", async () => {
  reset(async () => { throw new Error("no popover"); });
  await runToggle();
  assert.deepEqual(opens, [true]);
});

test("an open tracker is closed by the click", async () => {
  reset(async () => 420);
  await runToggle();
  assert.deepEqual(opens, [false]);
  assert.equal(marksClosed.length, 0);
});

test("a probe OBR does not answer in time keeps the stored state: the click closes the tracker", async () => {
  reset(() => new Promise(() => {}));
  const started = Date.now();
  await runToggle();
  assert.ok(Date.now() - started >= 700, "it waits for the probe's timeout");
  assert.deepEqual(opens, [false]);
  assert.equal(marksClosed.length, 0, "the stored state is not rewritten as closed");
});
