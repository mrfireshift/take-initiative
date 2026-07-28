import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openReferencePopover, REFERENCE_POPUP_ID } from "./referencePopover.js";

const REFERENCE_TOOL_ID = `${ID}/reference-tool`;
const REFERENCE_POPOVER_CHANNEL = `${ID}/tracker-popover-toggle`;
let popoverOpen = false;
let toggling = false;

async function toggleReferencePopover() {
  if (toggling) return;
  toggling = true;
  try {
    if (popoverOpen) {
      await OBR.popover.close(REFERENCE_POPUP_ID).catch(() => {});
      popoverOpen = false;
    } else {
      await openReferencePopover();
      popoverOpen = true;
    }
  } finally {
    toggling = false;
  }
}

OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") return;

  OBR.broadcast.onMessage(REFERENCE_POPOVER_CHANNEL, (event) => {
    if (event?.data?.id !== REFERENCE_POPUP_ID) return;
    if (event.data.type === "opened") popoverOpen = true;
    if (event.data.type === "closed") popoverOpen = false;
  });

  try { await OBR.tool.remove(REFERENCE_TOOL_ID); } catch {}
  await OBR.tool.create({
    id: REFERENCE_TOOL_ID,
    icons: [{ icon: "/reference.svg", label: "Enciclopedia DM" }],
    onClick: () => void toggleReferencePopover(),
  });
});
