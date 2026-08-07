import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  TRACKER_LAYOUT_CHANNEL,
  moveCompactTrackerPopover,
  resetCompactTrackerPopoverPosition,
  setTrackerPopoverOpen,
} from "./trackerPopover.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectTrackerOpenSyncEnabled } from "./options/optionsSelectors.js";

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

    await startRuntimeOptions().catch(() => {});
    const role = await OBR.player.getRole().catch(() => "PLAYER");

    const applyTrackerOpenState = async (metadata) => {
      const state = metadata?.[UI_KEY];
      if (!state || role === "GM") return;
      if (!runtimeOptionsService.get(selectTrackerOpenSyncEnabled)) return;
      await setTrackerPopoverOpen(!!state.open);
    };

    OBR.room.onMetadataChange((metadata) => {
      void applyTrackerOpenState(metadata);
    });

    runtimeOptionsService.subscribe(selectTrackerOpenSyncEnabled, (enabled) => {
      if (!enabled || role === "GM") return;
      void OBR.room.getMetadata().then(applyTrackerOpenState).catch(() => {});
    }, { emitCurrent: false });

    if (role === "GM") return;
    const metadata = await OBR.room.getMetadata();
    await applyTrackerOpenState(metadata);
  });
}
