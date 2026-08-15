import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  isTrackerPopoverOpen,
  markTrackerPopoverClosed,
  TRACKER_POPOVER_ID,
  setTrackerPopoverOpen,
} from "./trackerPopover.js";
import {
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "./metadataKeyScoped.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { createActionLauncherReadinessCoordinator } from "./actionLauncherReadinessCore.js";

const UI_KEY = `${ID}/ui`;
let handling = false;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
const actionReadiness = createActionLauncherReadinessCoordinator({
  isReady: () => sceneLifecycle.isReady(),
  runToggle: () => toggleTracker(),
});
let unsubscribeActionOpenChange = null;
const TRACKER_POPOVER_PROBE_TIMEOUT_MS = 750;

function readTrackerPopoverHeightWithTimeout() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(null), TRACKER_POPOVER_PROBE_TIMEOUT_MS);
    Promise.resolve()
      .then(() => OBR.popover.getHeight(TRACKER_POPOVER_ID))
      .then(finish, () => finish(null));
  });
}

async function isTrackerPopoverActuallyOpen() {
  if (!isTrackerPopoverOpen()) return false;
  if (typeof OBR.popover?.getHeight !== "function") return true;
  const height = await readTrackerPopoverHeightWithTimeout();
  const open = Number.isFinite(Number(height)) && Number(height) > 0;
  if (!open) markTrackerPopoverClosed();
  return open;
}

async function toggleTracker() {
  const operation = sceneLifecycle.capture({ operationId: `action-launcher:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation) || handling) return false;
  handling = true;
  try {
    const trackerOpen = await isTrackerPopoverActuallyOpen();
    if (!sceneLifecycle.isCurrent(operation)) return false;
    const nextOpen = !trackerOpen;
    await setTrackerPopoverOpen(nextOpen);
    if (!sceneLifecycle.isCurrent(operation)) return false;
    if (await OBR.player.getRole() === "GM") {
      if (!sceneLifecycle.isCurrent(operation)) return false;
      await writeRoomMetadataKey(
        OBR.room,
        METADATA_OWNERSHIP.SHARED_UI,
        { open: nextOpen, at: Date.now() },
        { runtime: "action-launcher" },
      );
    }
    return true;
  } finally {
    try { await OBR.action.close(); } catch {}
    handling = false;
  }
}

OBR.onReady(async () => {
  const onSceneState = (state) => {
    void actionReadiness.onSceneState(state).catch((error) => {
      console.warn("[action-launcher] readiness:", error?.message || error);
    });
  };
  const unsubscribeSceneLifecycle = sceneLifecycle.subscribe(onSceneState);
  unsubscribeActionOpenChange = OBR.action.onOpenChange((open) => {
    void actionReadiness.onActionOpenChange(open).catch((error) => {
      console.warn("[action-launcher] toggle:", error?.message || error);
    });
  });
  await sceneLifecycle.mount();
  await actionReadiness.setInitialOpen(await OBR.action.isOpen());
  window.addEventListener("pagehide", unsubscribeSceneLifecycle, { once: true });
});

window.addEventListener("pagehide", () => {
  if (typeof unsubscribeActionOpenChange === "function") unsubscribeActionOpenChange();
  unsubscribeActionOpenChange = null;
  actionReadiness.dispose();
  sceneLifecycle.dispose();
});
