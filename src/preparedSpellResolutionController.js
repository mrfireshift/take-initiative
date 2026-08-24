import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  PREPARED_SPELL_RESOLUTION_CHANNEL,
  preparedSpellResolutionAction,
  preparedSpellResolutionChoices,
  preparedSpellResolutionGroups,
  preparedSpellResolutionPopoverId,
} from "./preparedSpellResolutionCore.js";
import {
  buildSpellUnifiedPreparedPopoverRequest,
  SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS,
} from "./spellUnifiedActiveAdapter.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const POPOVER_WIDTH = 250;
const MOBILE_POPOVER_WIDTH = 360;
const BASE_POPOVER_HEIGHT = 116;
const CHOICE_POPOVER_HEIGHT = 150;
const ANCHOR_POLL_MS = 40;
const ANCHOR_MOVE_THRESHOLD = 0.75;

let mounted = false;
let controllerWorkRunning = false;
let reconcileRequested = false;
let anchorRefreshRequested = false;
let anchorTimer = null;
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

function sameAnchor(left, right) {
  if (!left || !right) return false;
  return Math.abs(left.left - right.left) < ANCHOR_MOVE_THRESHOLD
    && Math.abs(left.top - right.top) < ANCHOR_MOVE_THRESHOLD;
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

function popoverOptions(group, anchorPosition, stackIndex) {
  const action = preparedSpellResolutionAction(group);
  if (action?.type === "resolve" || action?.type === "manual") {
    const request = buildSpellUnifiedPreparedPopoverRequest(group, {
      width: MOBILE_POPOVER_WIDTH,
    });
    return {
      popoverId: request.id,
      height: request.height,
      stackIndex,
      mobile: true,
      options: {
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
      },
    };
  }
  const hasChoices = preparedSpellResolutionChoices(group).length > 1;
  const height = hasChoices ? CHOICE_POPOVER_HEIGHT : BASE_POPOVER_HEIGHT;
  const popoverId = preparedSpellResolutionPopoverId(group.instanceId);
  return {
    popoverId,
    height,
    stackIndex,
    options: {
      id: popoverId,
      url: `/prepared-spell-resolution.html?instance=${encodeURIComponent(group.instanceId)}`,
      width: POPOVER_WIDTH,
      height,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
      transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      disableClickAway: true,
      marginThreshold: 8,
      hidePaper: true,
    },
  };
}

async function openOrMoveGroup(group, stackIndex = 0, worldAnchor = null) {
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!instanceId || !casterId) return;
  const actionType = preparedSpellResolutionAction(group)?.type;
  const mobile = actionType === "resolve" || actionType === "manual";
  const mobileRequest = mobile
    ? buildSpellUnifiedPreparedPopoverRequest(group, { width: MOBILE_POPOVER_WIDTH })
    : null;
  const hasChoices = preparedSpellResolutionChoices(group).length > 1;
  const height = mobileRequest?.height || (hasChoices ? CHOICE_POPOVER_HEIGHT : BASE_POPOVER_HEIGHT);
  const anchorPosition = await screenAnchor(worldAnchor, stackIndex, height);
  if (!anchorPosition) return;

  const current = opened.get(instanceId);
  if (
    current
    && current.casterId === casterId
    && current.stackIndex === stackIndex
    && current.height === height
    && current.worldAnchor?.x === worldAnchor?.x
    && current.worldAnchor?.y === worldAnchor?.y
    && sameAnchor(current.anchorPosition, anchorPosition)
  ) {
    return;
  }

  const next = popoverOptions(group, anchorPosition, stackIndex);
  if (next.mobile) await openTrackedPopover(next.options);
  else await OBR.popover.open(next.options);
  opened.set(instanceId, {
    instanceId,
    casterId,
    worldAnchor,
    anchorPosition,
    ...next,
  });
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
    // Raffica di Spine e Freccia Folgorante completano la risoluzione nel
    // pannello unificato, che possiede già placement e transazione area.
    .filter((group) => !SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS.includes(
      String(group?.spellId || "").trim(),
    ))
    // Le risoluzioni prepared sono prompt del turno del caster: fuori da quel
    // turno il popup viene chiuso e riaperto quando l'iniziativa ritorna.
    .filter((group) => {
      const actionType = preparedSpellResolutionAction(group)?.type;
      if (actionType !== "resolve" && actionType !== "manual") return true;
      return currentTurnActorId
        && String(group?.casterId || "").trim() === currentTurnActorId;
    });
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

async function refreshPreparedSpellAnchors() {
  if (!opened.size) return;
  await Promise.all([...opened.values()].map(async (runtime) => {
    if (runtime.mobile) return;
    const anchorPosition = await screenAnchor(
      runtime.worldAnchor,
      runtime.stackIndex,
      runtime.height,
    );
    if (!anchorPosition || sameAnchor(runtime.anchorPosition, anchorPosition)) {
      return;
    }
    const options = {
      ...runtime.options,
      anchorPosition,
    };
    try {
      await OBR.popover.open(options);
      runtime.anchorPosition = anchorPosition;
      runtime.options = options;
    } catch (error) {
      console.warn(
        "[prepared-spell-resolution] move popover:",
        error?.message || error,
      );
    }
  }));
}

function requestControllerWork({ reconcile = false, anchor = false } = {}) {
  reconcileRequested ||= reconcile;
  anchorRefreshRequested ||= anchor;
  if (controllerWorkRunning) return;
  controllerWorkRunning = true;

  const run = async () => {
    try {
      while (mounted && (reconcileRequested || anchorRefreshRequested)) {
        const reconcileNow = reconcileRequested;
        reconcileRequested = false;
        anchorRefreshRequested = false;
        try {
          if (reconcileNow) await reconcilePreparedSpellPopovers();
          else await refreshPreparedSpellAnchors();
        } catch (error) {
          console.warn(
            `[prepared-spell-resolution] ${reconcileNow ? "reconcile" : "anchor"}:`,
            error?.message || error,
          );
        }
      }
    } finally {
      controllerWorkRunning = false;
      if (mounted && (reconcileRequested || anchorRefreshRequested)) {
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
  anchorTimer = window.setInterval(
    () => requestControllerWork({ anchor: true }),
    ANCHOR_POLL_MS,
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
  if (anchorTimer !== null) window.clearInterval(anchorTimer);
  anchorTimer = null;
  mounted = false;
  stateMetadataWatcher.reset();
  currentTurnActorId = "";
  reconcileRequested = false;
  anchorRefreshRequested = false;
  await closeAllPreparedSpellPopovers();
}
