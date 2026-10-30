import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  TRACKER_LAYOUT_CHANNEL,
  TRACKER_LAYOUT_COMPACT,
  TRACKER_POPOVER_ID,
  getTrackerLayout,
  isTrackerPopoverOpen,
  markTrackerPopoverClosed,
  moveClassicTrackerPopover,
  moveCompactTrackerPopover,
  openTrackerPopover,
  readSharedTrackerView,
  resetCompactTrackerPopoverPosition,
  setTrackerPopoverOpen,
  storeSharedTrackerView,
  toggleClassicTrackerSide,
} from "./trackerPopover.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectGmTrackerScale, selectPlayerTrackerScale, selectTrackerOpenSyncEnabled, selectTrackerPlacementSyncEnabled } from "./options/optionsSelectors.js";
import { METADATA_OWNERSHIP, writeRoomMetadataKey } from "./metadataKeyScoped.js";

const UI_KEY = `${ID}/ui`;
const TRACKER_POPOVER_PROBE_TIMEOUT_MS = 750;
const TRACKER_POPOVER_PROBE_TIMED_OUT = Symbol("tracker-popover-probe-timed-out");

// After a reload of the window the tracker's popover is gone, but the flag its page stored says "open": the table
// screen's tracker stayed closed until the GM closed and opened theirs. Probed like the extension's icon does: an
// OBR that does not answer in time keeps the stored state.
export async function forgetStaleTrackerOpenFlag({
  obr = OBR,
  timeoutMs = TRACKER_POPOVER_PROBE_TIMEOUT_MS,
} = {}) {
  if (!isTrackerPopoverOpen() || typeof obr.popover?.getHeight !== "function") return false;
  let timer = null;
  const height = await Promise.race([
    Promise.resolve().then(() => obr.popover.getHeight(TRACKER_POPOVER_ID)).catch(() => null),
    new Promise((resolve) => { timer = setTimeout(() => resolve(TRACKER_POPOVER_PROBE_TIMED_OUT), timeoutMs); }),
  ]);
  clearTimeout(timer);
  if (height === TRACKER_POPOVER_PROBE_TIMED_OUT || Number(height) > 0) return false;
  markTrackerPopoverClosed();
  return true;
}

if (!window.__TBP_SYNC_OPEN_MOUNTED) {
  window.__TBP_SYNC_OPEN_MOUNTED = true;

  OBR.onReady(async () => {
    let role = "";

    // GM -> players: the GM's tracker view (layout, side, positions) in the shared UI record, merged with the
    // open state. Written only when the GM changes it, and only when it differs from the shared one.
    const publishTrackerView = async ({ onlyIfMissing = false } = {}) => {
      if (role !== "GM" || !runtimeOptionsService.get(selectTrackerPlacementSyncEnabled)) return;
      const view = await readSharedTrackerView();
      const metadata = await OBR.room.getMetadata();
      const current = metadata?.[UI_KEY] && typeof metadata[UI_KEY] === "object" ? metadata[UI_KEY] : {};
      if (onlyIfMissing && current.view) return;
      if (JSON.stringify(current.view) === JSON.stringify(view)) return;
      await writeRoomMetadataKey(OBR.room, METADATA_OWNERSHIP.SHARED_UI, { ...current, view }, { runtime: "sync-open" });
    };
    const afterLocalChange = (work) => {
      void Promise.resolve(work).then(() => publishTrackerView()).catch((error) => {
        console.warn("[tracker-sync] vista del GM non pubblicata:", error?.message || error);
      });
    };

    OBR.broadcast.onMessage(TRACKER_LAYOUT_CHANNEL, (event) => {
      if (event?.data?.type === "tracker-layout-change") {
        afterLocalChange(setTrackerPopoverOpen(true, { refresh: true }));
      } else if (event?.data?.type === "tracker-position-change") {
        // The handle moves whichever layout is shown: the compact bar or the extended tracker.
        afterLocalChange(getTrackerLayout() === TRACKER_LAYOUT_COMPACT
          ? moveCompactTrackerPopover(event.data.deltaX, event.data.deltaY)
          : moveClassicTrackerPopover(event.data.deltaX, event.data.deltaY));
      } else if (event?.data?.type === "tracker-position-reset") {
        afterLocalChange(resetCompactTrackerPopoverPosition());
      } else if (event?.data?.type === "tracker-side-toggle") {
        afterLocalChange(toggleClassicTrackerSide());
      }
    });

    await startRuntimeOptions().catch(() => {});
    role = await OBR.player.getRole().catch(() => "PLAYER");

    // Players: the GM's view first (stored on this screen, redrawn only when it changed), then the open state.
    // Room metadata changes often: an unchanged view never reopens or redraws the tracker.
    const applySharedState = async (metadata) => {
      const state = metadata?.[UI_KEY];
      if (!state || role === "GM") return;
      let redraw = false;
      // A new position, side or scale moves the open tracker in place; a new layout (extended/compact) is a new page.
      let layoutChanged = false;
      if (state.view && runtimeOptionsService.get(selectTrackerPlacementSyncEnabled)) {
        const result = await storeSharedTrackerView(state.view);
        if (result.layoutChanged) {
          // The tracker page reads its layout from the local options too.
          await runtimeOptionsService.updateLocal((current) => ({
            ...current,
            tracker: { ...current.tracker, layout: result.layout },
          })).catch((error) => console.warn("[tracker-sync] layout locale non salvato:", error?.message || error));
        }
        redraw = result.changed;
        layoutChanged = !!result.layoutChanged;
      }
      const redrawOptions = layoutChanged ? { refresh: true } : { reposition: true };
      if (runtimeOptionsService.get(selectTrackerOpenSyncEnabled)) {
        if (state.open && redraw && isTrackerPopoverOpen()) await openTrackerPopover(redrawOptions);
        else await setTrackerPopoverOpen(!!state.open);
      } else if (redraw && isTrackerPopoverOpen()) {
        await openTrackerPopover(redrawOptions);
      }
    };
    // One application at a time: bursts of room metadata changes never redraw twice in parallel.
    let applying = Promise.resolve();
    const applyTrackerOpenState = (metadata) => {
      applying = applying.then(() => applySharedState(metadata)).catch((error) => {
        console.warn("[tracker-sync] stato del GM non applicato:", error?.message || error);
      });
      return applying;
    };

    OBR.room.onMetadataChange((metadata) => {
      void applyTrackerOpenState(metadata);
    });

    runtimeOptionsService.subscribe(selectTrackerOpenSyncEnabled, (enabled) => {
      if (!enabled || role === "GM") return;
      void OBR.room.getMetadata().then(applyTrackerOpenState).catch(() => {});
    }, { emitCurrent: false });
    // Turning the layout and position sync on: the GM publishes, the players follow.
    runtimeOptionsService.subscribe(selectTrackerPlacementSyncEnabled, (enabled) => {
      if (!enabled) return;
      if (role === "GM") afterLocalChange();
      else void OBR.room.getMetadata().then(applyTrackerOpenState).catch(() => {});
    }, { emitCurrent: false });

    // Players' table screen: a new tracker scale redraws the open tracker at the new size.
    runtimeOptionsService.subscribe(selectPlayerTrackerScale, () => {
      if (role !== "PLAYER" || !isTrackerPopoverOpen()) return;
      void setTrackerPopoverOpen(true, { reposition: true });
    }, { emitCurrent: false });
    // The GM's screen: a new local tracker scale (this browser) redraws the open tracker at the new size.
    runtimeOptionsService.subscribe(selectGmTrackerScale, () => {
      if (role !== "GM" || !isTrackerPopoverOpen()) return;
      void setTrackerPopoverOpen(true, { reposition: true });
    }, { emitCurrent: false });

    if (role === "GM") {
      // A new Owlbear page has no tracker open, but the flag can still say "open" from the last time (Owlbear closed
      // with the tracker on screen): the icon's first click then "closed" the missing tracker and only the second
      // opened it. The GM's tracker never opens by itself, so the flag is cleared without a probe.
      markTrackerPopoverClosed();
      // A room without a shared view yet receives the GM's current one.
      await publishTrackerView({ onlyIfMissing: true }).catch(() => {});
      return;
    }
    await forgetStaleTrackerOpenFlag();
    const metadata = await OBR.room.getMetadata();
    await applyTrackerOpenState(metadata);
  });
}
