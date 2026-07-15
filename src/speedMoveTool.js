import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const TOOL_ID = ID + "/tracked-move-tool";
const MODE_ID = ID + "/tracked-move-mode";
const CHANNEL = ID + "/speed-drag";

let drag = null;
let sendQueue = Promise.resolve();

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function samePoint(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function send(data) {
  const run = () => OBR.broadcast.sendMessage(CHANNEL, data, { destination: "ALL" });
  sendQueue = sendQueue.then(run, run);
}

function cellForPosition(state, position) {
  const dx = Math.round((position.x - state.startPosition.x) / state.dpi);
  const dy = Math.round((position.y - state.startPosition.y) / state.dpi);
  return {
    x: state.startCell.x + (dx * state.dpi),
    y: state.startCell.y + (dy * state.dpi),
  };
}

function consumePointer(state, nextPointer) {
  if (!state.ready) {
    state.pending.push(nextPointer);
    return;
  }
  const previousPointer = state.lastPointer;
  if (!previousPointer) {
    state.lastPointer = nextPointer;
    return;
  }

  const beforePosition = {
    x: previousPointer.x + state.offset.x,
    y: previousPointer.y + state.offset.y,
  };
  const afterPosition = {
    x: nextPointer.x + state.offset.x,
    y: nextPointer.y + state.offset.y,
  };
  const beforeCell = state.lastCell;
  const afterCell = cellForPosition(state, afterPosition);
  state.lastPointer = nextPointer;
  if (samePoint(beforeCell, afterCell)) return;
  state.lastCell = afterCell;
  send({
    type: "segment",
    dragId: state.dragId,
    itemId: state.itemId,
    beforePosition,
    afterPosition,
    beforeCell,
    afterCell,
  });
}

function finishDrag(state, cancelled) {
  send({
    type: cancelled ? "cancel" : "end",
    dragId: state.dragId,
    itemId: state.itemId,
  });
  if (drag === state) drag = null;
}

async function prepareDrag(state) {
  try {
    const [dpi, startCell] = await Promise.all([
      OBR.scene.grid.getDpi(),
      OBR.scene.grid.snapPosition(state.startPosition, 1, false, true),
    ]);
    if (drag !== state || state.cancelled) return;
    state.dpi = Math.max(1, Number(dpi) || 150);
    state.startCell = point(startCell) || { ...state.startPosition };
    state.lastCell = { ...state.startCell };
    state.ready = true;
    send({ type: "start", dragId: state.dragId, itemId: state.itemId });
    for (const pending of state.pending.splice(0)) consumePointer(state, pending);
    if (state.ended) finishDrag(state, false);
  } catch {
    if (drag === state) drag = null;
  }
}

function startDrag(event) {
  const targetPosition = point(event?.target?.position);
  const pointerPosition = point(event?.pointerPosition);
  const itemId = String(event?.target?.id || "");
  if (!itemId || !targetPosition || !pointerPosition) return;

  const state = {
    dragId: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random(),
    itemId,
    startPosition: targetPosition,
    offset: {
      x: targetPosition.x - pointerPosition.x,
      y: targetPosition.y - pointerPosition.y,
    },
    lastPointer: pointerPosition,
    pending: [],
    ready: false,
    ended: false,
    cancelled: false,
  };
  drag = state;
  void prepareDrag(state);
}

function moveDrag(event) {
  const pointerPosition = point(event?.pointerPosition);
  if (drag && pointerPosition) consumePointer(drag, pointerPosition);
}

function endDrag(event) {
  const state = drag;
  if (!state) return;
  const pointerPosition = point(event?.pointerPosition);
  if (pointerPosition) consumePointer(state, pointerPosition);
  state.ended = true;
  if (state.ready) finishDrag(state, false);
}

function cancelDrag() {
  const state = drag;
  if (!state) return;
  state.cancelled = true;
  if (state.ready) finishDrag(state, true);
  else drag = null;
}

OBR.onReady(async () => {
  try { await OBR.tool.removeMode(MODE_ID); } catch {}
  try { await OBR.tool.remove(TOOL_ID); } catch {}

  await OBR.tool.create({
    id: TOOL_ID,
    defaultMode: MODE_ID,
    icons: [{
      icon: "/speed.svg",
      label: "Movimento tracciato",
    }],
  });
  await OBR.tool.createMode({
    id: MODE_ID,
    icons: [{
      icon: "/speed.svg",
      label: "Movimento tracciato",
      filter: { activeTools: [TOOL_ID] },
    }],
    preventDrag: { activeTools: [TOOL_ID] },
    onToolDragStart: (_, event) => startDrag(event),
    onToolDragMove: (_, event) => moveDrag(event),
    onToolDragEnd: (_, event) => endDrag(event),
    onToolDragCancel: () => cancelDrag(),
    onDeactivate: () => cancelDrag(),
  });
});