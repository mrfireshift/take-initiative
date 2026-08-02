import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  isTrackerPopoverOpen,
  setTrackerPopoverOpen,
} from "./trackerPopover.js";
import {
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "./metadataKeyScoped.js";

const UI_KEY = `${ID}/ui`;
let handling = false;

async function toggleTracker() {
  if (handling) return;
  handling = true;
  try {
    const nextOpen = !isTrackerPopoverOpen();
    await setTrackerPopoverOpen(nextOpen);
    if (await OBR.player.getRole() === "GM") {
      await writeRoomMetadataKey(
        OBR.room,
        METADATA_OWNERSHIP.SHARED_UI,
        { open: nextOpen, at: Date.now() },
        { runtime: "action-launcher" },
      );
    }
  } finally {
    try { await OBR.action.close(); } catch {}
    handling = false;
  }
}

OBR.onReady(async () => {
  OBR.action.onOpenChange((open) => {
    if (open) void toggleTracker();
  });
  if (await OBR.action.isOpen()) await toggleTracker();
});
