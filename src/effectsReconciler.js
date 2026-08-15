import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  configureConditionWidgetWriter,
} from "./conditions.js";
import {
  configureConcentrationWidgetWriter,
} from "./spells-tag.js";
import {
  cleanupLocalEffectsLayout,
  configureEffectsLayoutProjection,
  inspectEffectsLayoutStores,
  reconcileEffectsLayout,
  resetEffectsLayoutProjection,
  setEffectsLayoutGridDpi,
} from "./effectsLayout.js";
import {
  EFFECTS_DIAGNOSTICS_CONTROL_CHANNEL,
  EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL,
  effectsDiagnostics,
} from "./effectsDiagnostics.js";
import {
  collectEffectsInvalidation,
  createEffectsReconcileQueue,
  isEffectsLocalRendererRole,
  isEffectsWidgetWriterRole,
} from "./effectsReconcilerCore.js";
import {
  readSceneItemsSnapshot,
  subscribeSceneItemChanges,
} from "./sceneItemEvents.js";
import { runtimeOptionsService } from "./options/optionsRuntime.js";
import {
  selectEffectsDisplayMode,
  selectPlayerEffectsPolicy,
} from "./options/optionsSelectors.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONCENTRATION_META_KEY = `${ID}/concentration`;
const EFFECTS_SELECTION_CHANNEL = `${ID}/effects-selection`;
const EFFECTS_SELECTION_INSTANCE_ID = typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let mounted = false;
let writer = false;
let globalCleanupOwner = false;
let unsubscribe = null;
let unsubscribeDiagnostics = null;
let unsubscribeGrid = null;
let unsubscribeSceneReady = null;
let unsubscribeOptions = null;
let unsubscribePlayer = null;
let unsubscribeSelectionBroadcast = null;
let expandedTargetIds = new Set();
let effectsDisplayMode = "selected";
let selectionSyncRevision = 0;
let effectsRole = "PLAYER";
let remoteGMSelectionActive = false;
let remoteGMSelectionRevision = 0;
let gmSelectionRevision = 0;

const queue = createEffectsReconcileQueue({
  async run(batch, context) {
    await reconcileEffectsLayout(batch, {
      ...context,
      cleanupGlobalWidgets: globalCleanupOwner,
    });
  },
});

function rendererState() {
  return {
    writer,
    localRenderer: writer,
    widgetStore: "local",
    globalCleanupOwner,
    mounted,
    ...queue.getState(),
  };
}

function requestConditions(itemIds) {
  const request = Array.isArray(itemIds)
    ? queue.request({ conditions: itemIds, joinCovered: true })
    : queue.request({ full: true });
  return request.done;
}

function requestConcentration(itemIds) {
  const request = Array.isArray(itemIds)
    ? queue.request({ concentration: itemIds, joinCovered: true })
    : queue.request({ full: true });
  return request.done;
}

async function getPlayerRole() {
  return (await OBR.player?.getRole?.()) ||
    (await OBR.room?.getRole?.()) ||
    "PLAYER";
}

function normalizeSelection(selection) {
  return new Set(
    (Array.isArray(selection) ? selection : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function sameIdSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function selectionRequestId() {
  return `${EFFECTS_SELECTION_INSTANCE_ID}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

async function publishGMSelection(selection, { requestId = "", targetInstanceId = "" } = {}) {
  if (!mounted || !writer || effectsRole !== "GM") return;
  const payload = {
    type: "gm-selection",
    selection: [...normalizeSelection(selection)],
    revision: ++gmSelectionRevision,
    sourceInstanceId: EFFECTS_SELECTION_INSTANCE_ID,
  };
  if (requestId) payload.requestId = requestId;
  if (targetInstanceId) payload.targetInstanceId = targetInstanceId;
  try {
    await OBR.broadcast.sendMessage(EFFECTS_SELECTION_CHANNEL, payload, { destination: "ALL" });
  } catch (error) {
    console.warn("[effects] GM selection broadcast:", error?.message || error);
  }
}

function requestGMSelection() {
  if (!mounted || !writer || effectsRole !== "PLAYER") return;
  void OBR.broadcast.sendMessage(EFFECTS_SELECTION_CHANNEL, {
    type: "gm-selection-request",
    sourceInstanceId: EFFECTS_SELECTION_INSTANCE_ID,
    requestId: selectionRequestId(),
  }, { destination: "ALL" }).catch((error) => {
    console.warn("[effects] GM selection request:", error?.message || error);
  });
}

function handleEffectsSelectionMessage(event) {
  const data = event?.data;
  if (!data || data.sourceInstanceId === EFFECTS_SELECTION_INSTANCE_ID) return;

  if (data.type === "gm-selection-request") {
    if (effectsRole !== "GM" || !data.sourceInstanceId || !data.requestId) return;
    void publishGMSelection(expandedTargetIds, {
      requestId: data.requestId,
      targetInstanceId: data.sourceInstanceId,
    });
    return;
  }

  if (data.type !== "gm-selection" || effectsRole !== "PLAYER") return;
  if (data.targetInstanceId && data.targetInstanceId !== EFFECTS_SELECTION_INSTANCE_ID) return;
  const revision = Number(data.revision) || 0;
  if (!data.requestId && revision < remoteGMSelectionRevision) return;
  remoteGMSelectionActive = true;
  remoteGMSelectionRevision = Math.max(remoteGMSelectionRevision, revision);
  applyPlayerSelection(data.selection);
}

function normalizeEffectsDisplayMode(mode) {
  return ["selected", "all", "compact"].includes(mode) ? mode : "selected";
}

function projectedExpandedTargetIds() {
  return effectsDisplayMode === "selected"
    ? expandedTargetIds
    : new Set();
}

function configureEffectsDisplayProjection() {
  configureEffectsLayoutProjection({
    expandedTargetIds: projectedExpandedTargetIds(),
    expansionMode: effectsDisplayMode,
  });
}

function requestSelectionReconcile({ full = false, targetIds = [] } = {}) {
  const request = full
    ? queue.request({ full: true })
    : queue.request({ conditions: targetIds });
  request.done.catch((error) => {
    console.error("[effects] selection reconcile", error);
  });
}

function applyPlayerSelection(selection) {
  const next = normalizeSelection(selection);
  if (sameIdSet(expandedTargetIds, next)) return;
  expandedTargetIds = next;
  if (effectsDisplayMode !== "selected") return;
  configureEffectsDisplayProjection();
  requestSelectionReconcile({ full: true });
}

async function syncPlayerSelection(selection) {
  const revision = ++selectionSyncRevision;
  let nextSelection = selection;
  if (!Array.isArray(nextSelection)) {
    try {
      nextSelection = await OBR.player?.getSelection?.() || [];
    } catch {
      nextSelection = [];
    }
  }
  if (revision !== selectionSyncRevision || !mounted || !writer) return;
  if (effectsRole === "PLAYER" && remoteGMSelectionActive) return;
  applyPlayerSelection(nextSelection);
  if (effectsRole === "GM") void publishGMSelection(nextSelection);
}

export async function mountEffectsReconciler() {
  if (mounted) return writer;
  mounted = true;

  let role = "PLAYER";
  try { role = await getPlayerRole(); } catch {}
  effectsRole = String(role || "PLAYER").trim().toUpperCase() === "GM" ? "GM" : "PLAYER";
  writer = isEffectsLocalRendererRole(role);
  globalCleanupOwner = isEffectsWidgetWriterRole(role);
  if (!writer) return false;

  let initialSelection = [];
  try { initialSelection = await OBR.player?.getSelection?.() || []; } catch {}
  expandedTargetIds = normalizeSelection(initialSelection);
  effectsDisplayMode = normalizeEffectsDisplayMode(
    runtimeOptionsService.get(selectEffectsDisplayMode),
  );
  configureEffectsLayoutProjection({
    role: effectsRole,
    policy: runtimeOptionsService.get(selectPlayerEffectsPolicy),
    expandedTargetIds: projectedExpandedTargetIds(),
    expansionMode: effectsDisplayMode,
  });
  unsubscribeSelectionBroadcast = OBR.broadcast.onMessage(
    EFFECTS_SELECTION_CHANNEL,
    handleEffectsSelectionMessage,
  );
  if (effectsRole === "GM") {
    void publishGMSelection(initialSelection);
  } else {
    requestGMSelection();
  }
  unsubscribeOptions = runtimeOptionsService.subscribe(
    (options) => ({
      policy: selectPlayerEffectsPolicy(options),
      effectsDisplayMode: selectEffectsDisplayMode(options),
    }),
    ({ policy, effectsDisplayMode: nextDisplayMode }) => {
      const normalizedMode = normalizeEffectsDisplayMode(nextDisplayMode);
      effectsDisplayMode = normalizedMode;
      configureEffectsLayoutProjection({
        role: effectsRole,
        policy,
        expandedTargetIds: projectedExpandedTargetIds(),
        expansionMode: effectsDisplayMode,
      });
      queue.request({ full: true }).done.catch((error) => {
        console.error("[effects] options reconcile", error);
      });
    },
    { emitCurrent: false },
  );

  if (typeof OBR.player?.onChange === "function") {
    unsubscribePlayer = OBR.player.onChange((player) => {
      if (effectsRole === "PLAYER" && remoteGMSelectionActive) return;
      void syncPlayerSelection(player?.selection).catch((error) => {
        console.error("[effects] selection sync", error);
      });
    });
  }

  configureConditionWidgetWriter(requestConditions);
  configureConcentrationWidgetWriter(requestConcentration);

  unsubscribeDiagnostics = OBR.broadcast.onMessage(EFFECTS_DIAGNOSTICS_CONTROL_CHANNEL, async (event) => {
    const data = event?.data;
    if (data?.type !== "request" || !data.requestId) return;
    try {
      let result;
      if (data.command === "reset") {
        effectsDiagnostics.enable();
        await new Promise((resolve) => setTimeout(resolve, 200));
        await queue.idle();
        effectsDiagnostics.clear();
        result = { state: rendererState() };
      } else if (data.command === "state") {
        result = rendererState();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await queue.idle();
        result = { summary: effectsDiagnostics.summary(), events: effectsDiagnostics.dump() };
      }
      await OBR.broadcast.sendMessage(EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL, {
        requestId: data.requestId,
        ok: true,
        result,
      }, { destination: "LOCAL" });
    } catch (error) {
      await OBR.broadcast.sendMessage(EFFECTS_DIAGNOSTICS_RESPONSE_CHANNEL, {
        requestId: data.requestId,
        ok: false,
        error: String(error?.message || error),
      }, { destination: "LOCAL" }).catch(() => {});
    }
  });

  unsubscribe = subscribeSceneItemChanges((event) => {
    const invalidation = collectEffectsInvalidation(event, {
      metaKey: META_KEY,
      spellsKey: SPELLS_META_KEY,
      concentrationKey: CONCENTRATION_META_KEY,
    });
    const snapshot = readSceneItemsSnapshot(event.sceneEpoch);
    queue.request({
      ...invalidation,
      sceneItemsSnapshotGeneration: snapshot.complete
        ? snapshot.generation
        : null,
    }).done.catch((error) => {
      console.error("[effects] reconcile", error);
    });
  }, {
    immediate: true,
    domains: ["effects", "movement"],
    filter: (event) => !event?.derived?.output,
  });

  unsubscribeGrid = OBR.scene.grid.onChange((grid) => {
    if (!setEffectsLayoutGridDpi(grid?.dpi)) return;
    queue.request({ full: true }).done.catch((error) => {
      console.error("[effects] grid reconcile", error);
    });
  });

  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) return;
    queue.request({ full: true }).done.catch((error) => {
      console.error("[effects] scene reconcile", error);
    });
  });

  let sceneReady = true;
  try { sceneReady = await OBR.scene.isReady(); } catch {}
  if (sceneReady) {
    queue.request({ full: true }).done.catch((error) => {
      console.error("[effects] initial reconcile", error);
    });
  }
  return true;
}

export async function unmountEffectsReconciler() {
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeDiagnostics?.();
  unsubscribeDiagnostics = null;
  unsubscribeGrid?.();
  unsubscribeGrid = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeOptions?.();
  unsubscribeOptions = null;
  unsubscribePlayer?.();
  unsubscribePlayer = null;
  unsubscribeSelectionBroadcast?.();
  unsubscribeSelectionBroadcast = null;
  selectionSyncRevision += 1;
  configureConditionWidgetWriter(null);
  configureConcentrationWidgetWriter(null);
  mounted = false;
  writer = false;
  globalCleanupOwner = false;
  effectsRole = "PLAYER";
  remoteGMSelectionActive = false;
  remoteGMSelectionRevision = 0;
  gmSelectionRevision = 0;
  await queue.idle();
  expandedTargetIds = new Set();
  effectsDisplayMode = "selected";
  resetEffectsLayoutProjection();
}

export async function cleanupOwnedEffectsLabels() {
  return cleanupLocalEffectsLayout();
}

export async function reconcileAllEffectsLabels() {
  if (!mounted || !writer) return { outcome: "ignored-non-writer" };
  return queue.request({ full: true }).done;
}

globalThis.__tbpEffectsReconciler = {
  state: () => rendererState(),
  inspectStores: () => inspectEffectsLayoutStores(),
  idle: () => queue.idle(),
  reconcileAll: () => writer
    ? queue.request({ full: true }).done
    : Promise.resolve({ outcome: "ignored-non-writer" }),
};
