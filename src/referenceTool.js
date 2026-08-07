import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openReferencePopover, REFERENCE_POPUP_ID } from "./referencePopover.js";

const REFERENCE_TOOL_ID = `${ID}/reference-tool`;
const REFERENCE_POPOVER_CHANNEL = `${ID}/tracker-popover-toggle`;
let popoverOpen = false;
let toggling = false;
let mounted = false;
let roleAllowed = false;
let unsubscribeBroadcast = null;
const runtimeOperations = new Set();

function trackRuntimeOperation(operation) {
  const promise = Promise.resolve(operation).catch((error) => {
    console.warn("[reference-tool] runtime:", error?.message || error);
  });
  runtimeOperations.add(promise);
  void promise.then(() => runtimeOperations.delete(promise));
  return promise;
}

async function toggleReferencePopover() {
  if (!mounted || !roleAllowed || toggling) return;
  toggling = true;
  try {
    if (popoverOpen) {
      await OBR.popover.close(REFERENCE_POPUP_ID).catch(() => {});
      popoverOpen = false;
    } else {
      if (!mounted) return;
      await openReferencePopover();
      popoverOpen = true;
    }
  } finally {
    toggling = false;
  }
}

export async function reconcileReferenceTool() {
  if (!mounted || !roleAllowed) return false;
  try { await OBR.tool.remove(REFERENCE_TOOL_ID); } catch {}
  await OBR.tool.create({
    id: REFERENCE_TOOL_ID,
    icons: [{ icon: "/reference.svg", label: "Enciclopedia DM" }],
    onClick: () => void trackRuntimeOperation(toggleReferencePopover()),
  });
  return true;
}

export async function cleanupReferenceTool() {
  await OBR.popover.close(REFERENCE_POPUP_ID).catch(() => {});
  popoverOpen = false;
  try { await OBR.tool.remove(REFERENCE_TOOL_ID); } catch {}
}

export async function mountReferenceTool() {
  if (mounted) return roleAllowed;
  mounted = true;
  roleAllowed = await OBR.player.getRole().then((role) => role === "GM").catch(() => false);
  if (!roleAllowed) return false;
  unsubscribeBroadcast = OBR.broadcast.onMessage(REFERENCE_POPOVER_CHANNEL, (event) => {
    if (event?.data?.id !== REFERENCE_POPUP_ID) return;
    if (event.data.type === "opened") popoverOpen = true;
    if (event.data.type === "closed") popoverOpen = false;
  });
  await reconcileReferenceTool();
  return true;
}

export async function unmountReferenceTool() {
  unsubscribeBroadcast?.();
  unsubscribeBroadcast = null;
  mounted = false;
  roleAllowed = false;
  toggling = false;
  if (runtimeOperations.size) await Promise.allSettled([...runtimeOperations]);
}
