import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { spellActiveResolutionPopoverId } from "./spellActiveResolutionCore.js";
import { callLightningTurnPromptPayloads } from "./callLightningTurnPromptCore.js";

const STATE_KEY = `${ID}/state`;
export const CALL_LIGHTNING_TURN_NOTICE_CHANNEL = `${ID}/turn-notice`;
const POPOVER_WIDTH = 360;
const POPOVER_HEIGHT = 470;
const STORM_SPHERE_POPOVER_HEIGHT = 320;

let mounted = false;
let work = Promise.resolve();
let revision = 0;
let currentActorId = "";
let currentTurnKey = "";
let unsubscribeItems = null;
let unsubscribeSceneReady = null;
let unsubscribeTurnNotice = null;
const opened = new Map();

function enqueue(task) {
  work = work.then(task, task);
  return work;
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function popoverId(payload) {
  return spellActiveResolutionPopoverId(payload?.instanceId, payload?.actionId);
}

function popoverHeight(payload) {
  return payload?.spellId === "xanathar-sfera-della-tempesta"
    ? STORM_SPHERE_POPOVER_HEIGHT
    : POPOVER_HEIGHT;
}

async function closeRuntime(runtime) {
  if (!runtime?.popoverId) return;
  await OBR.popover.close(runtime.popoverId).catch(() => {});
}

async function closeAll() {
  const runtimes = [...opened.values()];
  opened.clear();
  await Promise.all(runtimes.map(closeRuntime));
}

async function currentTurnDescriptor() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || {};
  const order = Array.isArray(state.order) ? state.order.filter(Boolean) : [];
  if (!order.length) return null;
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state.current) || 0)),
  );
  return {
    actorId: String(order[current] || "").trim(),
    turnKey: currentInitiativeTurnKey(state),
    sceneEpoch: currentSceneEpoch(),
  };
}

async function casterAnchor(casterId) {
  const bounds = await OBR.scene.items.getItemBounds([casterId]).catch(() => null);
  const center = point(bounds?.center);
  const min = point(bounds?.min);
  const world = center && min
    ? { x: center.x, y: min.y }
    : center;
  const transformed = world
    ? await OBR.viewport.transformPoint(world).catch(() => null)
    : null;
  const screen = point(transformed);
  return screen
    ? { left: screen.x, top: screen.y }
    : { left: 120, top: 120 };
}

async function payloadsForTurn(descriptor) {
  const items = await OBR.scene.items.getItems().catch(() => []);
  return callLightningTurnPromptPayloads({
    items,
    actorId: descriptor.actorId,
    sceneEpoch: descriptor.sceneEpoch,
    turnKey: descriptor.turnKey,
  });
}

async function openPayload(payload, stackIndex, taskRevision) {
  if (taskRevision !== revision) return;
  const id = popoverId(payload);
  const height = popoverHeight(payload);
  const anchor = await casterAnchor(payload.casterId);
  if (taskRevision !== revision) return;
  const position = {
    left: anchor.left,
    top: anchor.top - stackIndex * (height + 8),
  };
  await openTrackedPopover({
    id,
    url: `/spell-active-resolution.html?payload=${encodeURIComponent(JSON.stringify(payload))}`,
    width: POPOVER_WIDTH,
    height,
    anchorReference: "POSITION",
    anchorPosition: position,
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 8,
    hidePaper: true,
  });
  opened.set(id, {
    popoverId: id,
    instanceId: payload.instanceId,
    casterId: payload.casterId,
  });
}

async function closeMissing(payloads) {
  const desiredIds = new Set(payloads.map(popoverId));
  for (const [id, runtime] of [...opened]) {
    if (desiredIds.has(id)) continue;
    opened.delete(id);
    await closeRuntime(runtime);
  }
}

async function reconcileTurn(descriptor, taskRevision, forceOpen = false) {
  if (!descriptor?.actorId || !descriptor.turnKey) {
    currentActorId = "";
    currentTurnKey = "";
    await closeAll();
    return;
  }
  const isNewTurn = descriptor.turnKey !== currentTurnKey
    || descriptor.actorId !== currentActorId;
  currentActorId = descriptor.actorId;
  currentTurnKey = descriptor.turnKey;
  const payloads = await payloadsForTurn(descriptor);
  if (taskRevision !== revision) return;
  if (!forceOpen && !isNewTurn) {
    await closeMissing(payloads);
    return;
  }
  await closeAll();
  for (let index = 0; index < payloads.length; index += 1) {
    await openPayload(payloads[index], index, taskRevision);
  }
}

function requestCurrentTurn({ forceOpen = false } = {}) {
  const taskRevision = ++revision;
  return enqueue(async () => {
    if (!mounted) return;
    if (!await OBR.scene.isReady().catch(() => false)) {
      await closeAll();
      return;
    }
    const descriptor = await currentTurnDescriptor();
    await reconcileTurn(descriptor, taskRevision, forceOpen);
  }).catch((error) => {
    console.warn("[call-lightning-turn-prompt] reconcile:", error?.message || error);
  });
}

export async function mountCallLightningTurnPromptController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;

  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges(
    () => { void requestCurrentTurn(); },
    {
      domains: ["effects", "zone"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      revision += 1;
      currentActorId = "";
      currentTurnKey = "";
      void enqueue(() => closeAll());
      return;
    }
    void requestCurrentTurn({ forceOpen: true });
  });
  unsubscribeTurnNotice = OBR.broadcast.onMessage(
    CALL_LIGHTNING_TURN_NOTICE_CHANNEL,
    (event) => {
      if (event?.data?.type !== "show-turn-notice") return;
      const data = event.data;
      const taskRevision = ++revision;
      void enqueue(async () => {
        if (!mounted) return;
        const descriptor = {
          actorId: String(data.currentId || "").trim(),
          turnKey: String(data.turnKey || "").trim(),
          sceneEpoch: Number.isFinite(Number(data.sceneEpoch))
            ? Math.max(0, Math.floor(Number(data.sceneEpoch)))
            : currentSceneEpoch(),
        };
        await reconcileTurn(descriptor, taskRevision, false);
      }).catch((error) => {
        console.warn("[call-lightning-turn-prompt] turn notice:", error?.message || error);
      });
    },
  );
  await requestCurrentTurn({ forceOpen: true });
  return true;
}

export async function unmountCallLightningTurnPromptController() {
  revision += 1;
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeTurnNotice?.();
  unsubscribeTurnNotice = null;
  mounted = false;
  currentActorId = "";
  currentTurnKey = "";
  await enqueue(() => closeAll());
}
