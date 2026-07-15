import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  isTrackerPopoverOpen,
  setTrackerPopoverOpen,
} from "./trackerPopover.js";

const UI_KEY = `${ID}/ui`;
let handling = false;

async function toggleTracker() {
  if (handling) return;
  handling = true;
  try {
    const nextOpen = !isTrackerPopoverOpen();
    await setTrackerPopoverOpen(nextOpen);
    if (await OBR.player.getRole() === "GM") {
      const metadata = await OBR.room.getMetadata();
      await OBR.room.setMetadata({
        ...metadata,
        [UI_KEY]: { open: nextOpen, at: Date.now() },
      });
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