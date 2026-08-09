import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
  SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
} from "./constants.js";

const TURN_NOTICE_CHANNEL = `${ID}/turn-notice`;
const TURN_NOTICE_READY_CHANNEL = `${TURN_NOTICE_CHANNEL}/ready`;
const TURN_NOTICE_LAYOUT_CHANNEL = `${TURN_NOTICE_CHANNEL}/layout`;
const TURN_NOTICE_UI_CHANNEL = `${TURN_NOTICE_CHANNEL}/ui`;
const TURN_NOTICE_POPOVER_ID = `${ID}/turn-notice-modal`;
const TURN_NOTICE_CARD_WIDTH = 500;
const TURN_NOTICE_FRAME_GUTTER = 4;
const TURN_NOTICE_POPOVER_TOP_RATIO = 0.09;

let mounted = false;
let popoverOpen = false;
let readySceneEpoch = null;
let requestedSceneEpoch = 0;
let activityRevision = 0;
let awaitingVisibleLayout = false;
let pendingPayloads = [];
let hostQueue = Promise.resolve();

function enqueueHostTask(task) {
  hostQueue = hostQueue.then(task, task);
  return hostQueue;
}

function payloadSceneEpoch(payload) {
  const value = Number(payload?.sceneEpoch);
  return Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function initialPopoverHeight(payload) {
  if (payload?.type === "show-turn-notice") return 122;
  return 158;
}

async function openTurnNoticePopover(payload) {
  if (popoverOpen) return;
  let viewportWidth = 1200;
  let viewportHeight = 800;
  const [reportedWidth, reportedHeight] = await Promise.all([
    OBR.viewport.getWidth().catch(() => viewportWidth),
    OBR.viewport.getHeight().catch(() => viewportHeight),
  ]);
  viewportWidth = Number(reportedWidth) || viewportWidth;
  viewportHeight = Number(reportedHeight) || viewportHeight;
  const cardWidth = Math.min(TURN_NOTICE_CARD_WIDTH, Math.max(312, viewportWidth - 40));
  const width = cardWidth + TURN_NOTICE_FRAME_GUTTER * 2;
  const top = Math.max(12, Math.round(viewportHeight * TURN_NOTICE_POPOVER_TOP_RATIO));
  const anchorTop = Math.max(8, top - TURN_NOTICE_FRAME_GUTTER);
  await OBR.popover.open({
    id: TURN_NOTICE_POPOVER_ID,
    url: "/turn-notice.html",
    width,
    height: initialPopoverHeight(payload),
    anchorReference: "POSITION",
    anchorPosition: { left: viewportWidth / 2, top: anchorTop },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 12,
  });
  popoverOpen = true;
  readySceneEpoch = null;
}

async function requestReadySceneEpoch() {
  await OBR.broadcast.sendMessage(
    TURN_NOTICE_READY_CHANNEL,
    {
      type: "turn-notice-ready-request",
      sceneEpoch: requestedSceneEpoch,
    },
    { destination: "LOCAL" },
  );
}

async function flushPendingPayloads() {
  if (!popoverOpen || readySceneEpoch !== requestedSceneEpoch) return;
  while (pendingPayloads.length) {
    const payload = pendingPayloads[0];
    awaitingVisibleLayout = true;
    await OBR.broadcast.sendMessage(
      TURN_NOTICE_UI_CHANNEL,
      payload,
      { destination: "LOCAL" },
    );
    pendingPayloads.shift();
  }
}

function receiveNoticePayload(payload) {
  activityRevision += 1;
  void enqueueHostTask(async () => {
    const sceneEpoch = payloadSceneEpoch(payload);
    if (sceneEpoch !== null) requestedSceneEpoch = sceneEpoch;
    pendingPayloads.push(payload);
    await openTurnNoticePopover(payload);
    if (readySceneEpoch !== requestedSceneEpoch) {
      await requestReadySceneEpoch();
      return;
    }
    await flushPendingPayloads();
  }).catch(() => {});
}

function receiveReadyMessage(payload) {
  void enqueueHostTask(async () => {
    if (!popoverOpen) return;
    const sceneEpoch = payloadSceneEpoch(payload);
    if (sceneEpoch !== requestedSceneEpoch) {
      await requestReadySceneEpoch();
      return;
    }
    readySceneEpoch = sceneEpoch;
    await flushPendingPayloads();
  }).catch(() => {});
}

function receiveLayoutMessage(payload) {
  const revision = activityRevision;
  void enqueueHostTask(async () => {
    if (!popoverOpen) return;
    if (payload?.visible === true) {
      awaitingVisibleLayout = false;
      const requestedHeight = Number(payload?.height);
      const height = Math.min(
        428,
        Math.max(1, Number.isFinite(requestedHeight) ? requestedHeight : 150),
      );
      await OBR.popover.setHeight(TURN_NOTICE_POPOVER_ID, height).catch(() => {});
      return;
    }
    if (awaitingVisibleLayout) return;
    if (revision !== activityRevision || pendingPayloads.length) return;
    await OBR.popover.close(TURN_NOTICE_POPOVER_ID).catch(() => {});
    popoverOpen = false;
    readySceneEpoch = null;
    awaitingVisibleLayout = false;
  }).catch(() => {});
}

export function mountTurnNoticeHost() {
  if (mounted) return;
  mounted = true;
  hostQueue = Promise.all([
    OBR.modal.close(TURN_NOTICE_POPOVER_ID).catch(() => {}),
    OBR.popover.close(TURN_NOTICE_POPOVER_ID).catch(() => {}),
  ]).then(() => {});
  OBR.broadcast.onMessage(TURN_NOTICE_CHANNEL, (event) => {
    if (event?.data?.type === "show-turn-notice") receiveNoticePayload(event.data);
  });
  OBR.broadcast.onMessage(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, (event) => {
    if (event?.data?.type === "show-effect-save-notices") receiveNoticePayload(event.data);
  });
  OBR.broadcast.onMessage(SPELL_ZONE_TRIGGER_NOTICE_CHANNEL, (event) => {
    if (event?.data?.type === "show-zone-trigger-notices") receiveNoticePayload(event.data);
  });
  OBR.broadcast.onMessage(TURN_NOTICE_READY_CHANNEL, (event) => {
    if (event?.data?.type === "turn-notice-ready") receiveReadyMessage(event.data);
  });
  OBR.broadcast.onMessage(TURN_NOTICE_LAYOUT_CHANNEL, (event) => {
    if (event?.data?.type === "turn-notice-layout") receiveLayoutMessage(event.data);
  });
}
