import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  TRACKER_LAYOUT_CHANNEL,
  moveCompactTrackerPopover,
  resetCompactTrackerPopoverPosition,
  setTrackerPopoverOpen,
} from "./trackerPopover.js";

const UI_KEY = `${ID}/ui`;

if (!window.__TBP_SYNC_OPEN_MOUNTED) {
  window.__TBP_SYNC_OPEN_MOUNTED = true;

  OBR.onReady(async () => {
    OBR.broadcast.onMessage(TRACKER_LAYOUT_CHANNEL, (event) => {
      if (event?.data?.type === "tracker-layout-change") {
        void setTrackerPopoverOpen(true, { refresh: true });
      } else if (event?.data?.type === "tracker-position-change") {
        void moveCompactTrackerPopover(event.data.deltaX, event.data.deltaY);
      } else if (event?.data?.type === "tracker-position-reset") {
        void resetCompactTrackerPopoverPosition();
      }
    });

    OBR.room.onMetadataChange(async (metadata) => {
      const state = metadata?.[UI_KEY];
      if (!state || await OBR.player.getRole() === "GM") return;
      await setTrackerPopoverOpen(!!state.open);
    });

    if (await OBR.player.getRole() === "GM") return;
    const metadata = await OBR.room.getMetadata();
    const state = metadata?.[UI_KEY];
    if (state) await setTrackerPopoverOpen(!!state.open);
  });
}