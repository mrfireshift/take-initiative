// The others' rolls (docs/PIANO_DADI_ONLINE.md, lot D-4), in the background page of every screen, Online room profile
// only. A roll reaches the other screens through the broadcast; this host keeps it in the session's history (the
// tray's ☰) and replays it in a small 3D window that closes by itself, one after the other. A screen that opens later
// fills the history from the latest roll each player keeps in their player metadata. The GM's hidden roll is never
// sent, and a screen does not replay its own rolls (the tray already showed them).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { normalizeDiceRollRecord } from "./diceCore.js";
import {
  DICE_NOTICE_DONE_CHANNEL,
  DICE_ROLL_CHANNEL,
  diceNoticeQueueWith,
  lastRollsFromParty,
  rememberDiceRoll,
} from "./diceTrayCore.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectOnlineRoomProfile } from "./options/optionsSelectors.js";

const NOTICE_POPOVER_ID = `${ID}/dice-notice`;
const NOTICE_WIDTH = 220;
const NOTICE_HEIGHT = 330;
// The notice closes itself when its replay is over; this is the backstop for a page that never says so (a hidden
// Owlbear tab draws no animation frames).
const NOTICE_TIMEOUT_MS = 12000;

let mounted = false;
let active = false;
let stopListeners = [];
let queue = [];
let showing = null;
let showingTimer = null;
let ownConnectionId = "";

async function closeNotice() {
  if (showingTimer !== null) clearTimeout(showingTimer);
  showingTimer = null;
  if (!showing) return;
  showing = null;
  await OBR.popover.close(NOTICE_POPOVER_ID).catch(() => {});
}

async function showNext() {
  if (showing || !active) return;
  const record = queue.shift();
  if (!record) return;
  showing = record.id;
  const height = await OBR.viewport.getHeight().catch(() => 800);
  try {
    await OBR.popover.open({
      id: NOTICE_POPOVER_ID,
      url: `/dice-notice.html?roll=${encodeURIComponent(JSON.stringify(record))}`,
      width: NOTICE_WIDTH,
      height: NOTICE_HEIGHT,
      anchorReference: "POSITION",
      // Bottom left, past Owlbear's tool bar: the zoom controls are on the right.
      anchorPosition: { left: 72, top: (Number(height) || 800) - 16 },
      anchorOrigin: { horizontal: "LEFT", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "LEFT", vertical: "BOTTOM" },
      hidePaper: true,
      disableClickAway: true,
      marginThreshold: 8,
    });
  } catch (error) {
    console.warn("[dice-notice] apertura:", error?.message || error);
    showing = null;
    return;
  }
  showingTimer = setTimeout(() => void closeNotice().then(showNext), NOTICE_TIMEOUT_MS);
}

function receiveRoll(raw) {
  const record = normalizeDiceRollRecord(raw);
  if (!record || record.hidden) return;
  rememberDiceRoll(record);
  if (ownConnectionId && record.connectionId === ownConnectionId) return;
  queue = diceNoticeQueueWith(queue, record);
  void showNext();
}

// A screen that opens late: the latest roll of everyone in the room, its own included, in the history only.
async function fillHistoryFromParty() {
  const [players, ownMetadata] = await Promise.all([
    OBR.party.getPlayers().catch(() => []),
    OBR.player.getMetadata().catch(() => ({})),
  ]);
  for (const record of lastRollsFromParty([...players, { metadata: ownMetadata }])) rememberDiceRoll(record);
}

function start() {
  if (active) return;
  active = true;
  stopListeners = [
    OBR.broadcast.onMessage(DICE_ROLL_CHANNEL, (event) => receiveRoll(event?.data)),
    OBR.broadcast.onMessage(DICE_NOTICE_DONE_CHANNEL, (event) => {
      if (event?.data?.id && event.data.id === showing) void closeNotice().then(showNext);
    }),
  ];
  void OBR.player.getConnectionId().then((id) => { ownConnectionId = String(id || ""); }).catch(() => {});
  void fillHistoryFromParty().catch(() => {});
}

function stop() {
  if (!active) return;
  active = false;
  for (const unsubscribe of stopListeners) {
    try { unsubscribe?.(); } catch {}
  }
  stopListeners = [];
  queue = [];
  void closeNotice();
}

export function mountDiceRollHost(service = runtimeOptionsService) {
  if (mounted) return;
  mounted = true;
  void startRuntimeOptions().then(() => {
    service.subscribe(selectOnlineRoomProfile, (online) => (online === true ? start() : stop()));
  }).catch((error) => console.warn("[dice-roll-host] avvio:", error?.message || error));
}
