// The 🎲 in Owlbear Rodeo's tool bar (docs/PIANO_DADI_ONLINE.md): it opens and closes the dice tray, as the 🎲 of
// the tracker does, for the GM and the players, in the Online room profile only. The tray opens where it was last
// moved (popoverDragHost.js keeps the position), else on the right of the screen.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { DICE_TRAY_POPOVER_ID, DICE_TRAY_STATE_CHANNEL, DICE_TRAY_WIDTH, diceTrayHeight } from "./diceTrayCore.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectOnlineRoomProfile } from "./options/optionsSelectors.js";

export const DICE_TOOL_ID = `${ID}/dice-tool`;

// How long an open tray has to answer the toolbar's question.
const PING_TIMEOUT_MS = 300;

let mounted = false;
let active = false;
let toggling = false;

function trayIsOpen() {
  return new Promise((resolve) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let settled = false;
    let unsubscribe = null;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { unsubscribe?.(); } catch {}
      resolve(open);
    };
    const timer = setTimeout(() => finish(false), PING_TIMEOUT_MS);
    unsubscribe = OBR.broadcast.onMessage(DICE_TRAY_STATE_CHANNEL, (event) => {
      if (event?.data?.type === "pong" && event.data.id === id) finish(true);
    });
    OBR.broadcast.sendMessage(DICE_TRAY_STATE_CHANNEL, { type: "ping", id }, { destination: "LOCAL" })
      .catch(() => finish(false));
  });
}

async function openTray() {
  const [width, height] = await Promise.all([
    OBR.viewport.getWidth().catch(() => 1200),
    OBR.viewport.getHeight().catch(() => 800),
  ]);
  await openTrackedPopover({
    id: DICE_TRAY_POPOVER_ID,
    url: "/dice-tray.html",
    width: DICE_TRAY_WIDTH,
    height: diceTrayHeight(height),
    anchorReference: "POSITION",
    anchorPosition: { left: Math.max(12, (Number(width) || 1200) - DICE_TRAY_WIDTH - 72), top: 64 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    marginThreshold: 12,
    hidePaper: true,
    // The tray stays while the map is used; the ×, Esc and this 🎲 close it.
    disableClickAway: true,
  });
}

async function toggleTray() {
  if (toggling) return;
  toggling = true;
  try {
    if (await trayIsOpen()) await OBR.popover.close(DICE_TRAY_POPOVER_ID);
    else await openTray();
  } catch (error) {
    console.warn("[dice-tool] vassoio:", error?.message || error);
  } finally {
    toggling = false;
  }
}

async function start() {
  if (active) return;
  active = true;
  await OBR.tool.create({
    id: DICE_TOOL_ID,
    icons: [{ icon: "/dice-tool.svg", label: "Dadi" }],
    onClick: () => { void toggleTray(); return false; },
  }).catch((error) => console.warn("[dice-tool] creazione:", error?.message || error));
}

async function stop() {
  if (!active) return;
  active = false;
  await OBR.tool.remove(DICE_TOOL_ID).catch(() => {});
}

export function mountDiceTrayTool(service = runtimeOptionsService) {
  if (mounted) return;
  mounted = true;
  void startRuntimeOptions().then(() => {
    service.subscribe(selectOnlineRoomProfile, (online) => void (online === true ? start() : stop()));
  }).catch((error) => console.warn("[dice-tool] avvio:", error?.message || error));
}
