import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  PREPARED_SPELL_RESOLUTION_CHANNEL,
  preparedSpellResolutionGroups,
} from "./preparedSpellResolutionCore.js";
import {
  buildSpellUnifiedPreparedPopoverRequest,
  SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS,
} from "./spellUnifiedActiveAdapter.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const MOBILE_POPOVER_WIDTH = 360;

let mounted = false;
let controllerWorkRunning = false;
let reconcileRequested = false;
let unsubscribeItems = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;
let unsubscribeBroadcast = null;
let currentTurnActorId = "";
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
const opened = new Map();

function initiativeTurnActorId(state = {}) {
  const order = Array.isArray(state?.order) ? state.order.filter(Boolean) : [];
  if (!order.length) return "";
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state.current) || 0)),
  );
  return String(order[current] || "").trim();
}

function observeInitiativeState(metadata, { seed = false } = {}) {
  const observed = seed || !stateMetadataWatcher.initialized
    ? stateMetadataWatcher.seed(metadata)
    : stateMetadataWatcher.observe(metadata);
  const state = observed.value && typeof observed.value === "object"
    ? observed.value
    : {};
  currentTurnActorId = initiativeTurnActorId(state);
  return observed;
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

async function closeRuntime(runtime) {
  if (!runtime?.popoverId) return;
  await OBR.popover.close(runtime.popoverId).catch(() => {});
}

async function closeAllPreparedSpellPopovers() {
  const runtimes = [...opened.values()];
  opened.clear();
  await Promise.all(runtimes.map(closeRuntime));
}

async function preparedSpellItems() {
  return OBR.scene.items.getItems((item) =>
    item?.layer === "CHARACTER" && !!item?.metadata?.[META_KEY]
  );
}

async function worldAnchorForCaster(casterId) {
  const bounds = await OBR.scene.items.getItemBounds([casterId]).catch(() => null);
  const center = point(bounds?.center);
  const min = point(bounds?.min);
  if (!center || !min) return null;
  return {
    x: center.x,
    y: min.y,
  };
}

async function screenAnchor(worldAnchor, stackIndex, popoverHeight) {
  if (!worldAnchor) return null;
  const transformed = await OBR.viewport.transformPoint(worldAnchor).catch(() => null);
  const screen = point(transformed);
  if (!screen) return null;
  return {
    left: screen.x,
    top: screen.y - 10 - Math.max(0, stackIndex) * (popoverHeight + 8),
  };
}

function popoverOptions(request, anchorPosition) {
  return {
    id: request.id,
    url: request.url,
    width: request.width,
    height: request.height,
    anchorReference: "POSITION",
    anchorPosition,
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 8,
    hidePaper: true,
  };
}

async function openOrMoveGroup(group, stackIndex = 0, worldAnchor = null) {
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!instanceId || !casterId) return;
  // It opens beside the caster and stays where the GM puts it: once open it no longer follows the token.
  if (opened.has(instanceId)) return;
  const request = buildSpellUnifiedPreparedPopoverRequest(group, { width: MOBILE_POPOVER_WIDTH });
  const anchorPosition = await screenAnchor(worldAnchor, stackIndex, request.height);
  if (!anchorPosition) return;
  await openTrackedPopover(popoverOptions(request, anchorPosition));
  opened.set(instanceId, { instanceId, casterId, popoverId: request.id });
}

async function reconcilePreparedSpellPopovers() {
  if (!await OBR.scene.isReady().catch(() => false)) {
    await closeAllPreparedSpellPopovers();
    return;
  }

  if (!stateMetadataWatcher.initialized) {
    observeInitiativeState(await OBR.scene.getMetadata().catch(() => ({})), { seed: true });
  }
  const groups = preparedSpellResolutionGroups(await preparedSpellItems())
    // Simbolo si risolve nel pannello unificato, che ne possiede la sagoma e
    // la transazione: niente popup al turno. Raffica di Spine e Freccia
    // Folgorante invece hanno il popup, con la loro azione.
    .filter((group) => !SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS.includes(
      String(group?.spellId || "").trim(),
    ))
    // Le risoluzioni prepared sono prompt del turno del caster: fuori da quel
    // turno il popup viene chiuso e riaperto quando l'iniziativa ritorna.
    .filter((group) => currentTurnActorId
      && String(group?.casterId || "").trim() === currentTurnActorId);
  const desiredIds = new Set(groups.map((group) => String(group.instanceId)));
  for (const [instanceId, runtime] of [...opened]) {
    if (desiredIds.has(instanceId)) continue;
    opened.delete(instanceId);
    await closeRuntime(runtime);
  }

  const casterCounts = new Map();
  const casterWorldAnchors = new Map();
  for (const group of groups) {
    const casterId = String(group.casterId || "");
    const stackIndex = casterCounts.get(casterId) || 0;
    casterCounts.set(casterId, stackIndex + 1);
    if (!casterWorldAnchors.has(casterId)) {
      casterWorldAnchors.set(
        casterId,
        await worldAnchorForCaster(casterId),
      );
    }
    await openOrMoveGroup(
      group,
      stackIndex,
      casterWorldAnchors.get(casterId),
    );
  }
}

function requestControllerWork({ reconcile = false } = {}) {
  reconcileRequested ||= reconcile;
  if (controllerWorkRunning) return;
  controllerWorkRunning = true;

  const run = async () => {
    try {
      while (mounted && reconcileRequested) {
        reconcileRequested = false;
        try {
          await reconcilePreparedSpellPopovers();
        } catch (error) {
          console.warn(
            "[prepared-spell-resolution] reconcile:",
            error?.message || error,
          );
        }
      }
    } finally {
      controllerWorkRunning = false;
      if (mounted && reconcileRequested) {
        requestControllerWork();
      }
    }
  };
  void run();
}

export async function mountPreparedSpellResolutionController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;

  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges(
    () => requestControllerWork({ reconcile: true }),
    {
      domains: ["prepared-spells"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      stateMetadataWatcher.reset();
      currentTurnActorId = "";
      requestControllerWork({ reconcile: true });
      return;
    }
    stateMetadataWatcher.reset();
    requestControllerWork({ reconcile: true });
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange((metadata) => {
    if (observeInitiativeState(metadata).changed) {
      requestControllerWork({ reconcile: true });
    }
  });
  unsubscribeBroadcast = OBR.broadcast.onMessage(
    PREPARED_SPELL_RESOLUTION_CHANNEL,
    (event) => {
      if (event?.data?.type === "request-sync") {
        requestControllerWork({ reconcile: true });
      }
    },
  );
  requestControllerWork({ reconcile: true });
  return true;
}

export async function unmountPreparedSpellResolutionController() {
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeSceneMetadata?.();
  unsubscribeSceneMetadata = null;
  unsubscribeBroadcast?.();
  unsubscribeBroadcast = null;
  mounted = false;
  stateMetadataWatcher.reset();
  currentTurnActorId = "";
  reconcileRequested = false;
  await closeAllPreparedSpellPopovers();
}
