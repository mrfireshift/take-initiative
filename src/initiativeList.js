import OBR, { buildLabel } from "@owlbear-rodeo/sdk";
import {
  ID,
  ACTIVE_TURN_LABEL_META,
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  TRACKER_PANEL_REQUEST_CHANNEL,
} from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  cleanupOwnedHPWidgets,
  mountHPBars,
  reconcileAllHPBars,
  setHPBarPlayerPolicy,
  syncInitialHPBars,
  syncHPBarNow,
  syncHPTextNow,
  unmountHPBars,
} from "./hpbar-items.js";
import { applyHPMemoryToSceneForMissingHP, saveHPToMemoryByItemId, scheduleHPMemoryAutofill } from "./hpMemory.js";
import { buildConditionChips, refreshConditionLabels, adjustConditionDurationsForItems, CONDITION_LIST as EFFECT_CONDITIONS, formatConditionName, formatConditionInstance, getEffectiveConditionInstances } from "./conditions";
import { buildSpellChips, getVisibleSpellsFromItem, adjustSpellsForItems } from "./spells.js";
import { spellColorFor } from "./spellColorCore.js";
import {
  appendSpellBoardTokenCompanions,
  hasSpellBoardTokenChange,
  spellBoardTokenForSpell,
  spellBoardTokenCompanionsByCasterId,
  spellBoardTokenCompanionsForEntry,
  spellBoardTokenTrackerItems,
  updateSpellBoardTokenSnapshot,
} from "./spellBoardTokenTrackerCore.js";
import { readFullRenderItemSnapshot } from "./initiativeFullRenderSnapshotCore.js";
import { initiativeTurnKeyAtOrdinal } from "./turnBoundaryCore.js";
import { openReferencePopover, REFERENCE_POPUP_ID } from "./referencePopover.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { broadcastConcentrationSaveWarnings } from "./concentrationSaveReminder.js";
import { withItemMetaHistory, mountMovementHistoryWatcher, subscribeMovementSegments } from "./history.js";
import { recordCombatTurn } from "./combatLog.js";
import { adjustSpeedCheckBonus, adjustSpeedCheckDash, enableSpeedCheckProcessor, mountSpeedCheckEnabledSync, mountSpeedCheckStateBroadcast, mountSpeedWarningBroadcast, prewarmSpeedCheckTurn, queueSpeedCheckMovements, resetSpeedCheckMovement, setSpeedCheckEnabled, setSpeedCheckMovementLimit, setSpeedCheckMovementMode, subscribeSpeedCheckEnabled, subscribeSpeedCheckState, syncSpeedCheckTurn } from "./speedCheck.js";
import { shouldKeepSpeedReadoutOpen } from "./speedCheckCore.js";
import {
  isCurrentSceneItemEvent,
  readSceneItemsSnapshot,
  sceneItemEventCorrelation,
  subscribeSceneItemChanges,
} from "./sceneItemEvents.js";
import {
  buildTurnNoticePayload,
  isInitiativeTurnTransition,
} from "./turnNotice.js";
import { shouldSuppressTurnNoticeBroadcast } from "./turnNoticeHostCore.js";
import {
  effectSaveReminderNoticesForDamage,
  effectSaveReminderSourceIds,
} from "./effectSaveReminderCore.js";
import {
  getZeroHPConditionHistoryIds,
  reconcileZeroHPConditionsForItems,
} from "./hpConditionAutomation.js";
import {
  TRACKER_LAYOUT_CHANNEL,
  TRACKER_LAYOUT_CLASSIC,
  TRACKER_LAYOUT_COMPACT,
  TRACKER_POPOVER_ID,
  getCompactTrackerPopoverAnchor,
  getCompactTrackerManualWidth,
  getTrackerLayout,
  setTrackerLayout,
} from "./trackerPopover.js";
import { mountCompactTrackerResizeHandles } from "./trackerCompactResize.js";
import {
  readFactionRegistry,
  rememberFactionForIds,
  registeredAttitudeForItem,
} from "./factionRegistry.js";
import {
  INITIATIVE_GROUP_SEPARATOR as __GROUP_SEP,
  __autoCollapseSnapshot,
  __buildGroups,
  __groupKey,
  _indexName,
  _parseIndexedName,
  compactEntriesForRender,
  expandParagonEntries,
  reorderBlockWithinSameInitiativeState,
  reorderWithinSameInitiativeState,
  sanitizeState,
  sortByInitiative,
} from "./initiativeOrderCore.js";
import {
  advanceInitiativeState,
  createSerialProcessor,
  initiativeStateDigest,
  isCurrentRenderRevision,
} from "./initiativeRenderCore.js";
import {
  enqueueInitiativeStatePatch,
  enqueueInitiativeStateReducer,
  initiativeStateResultApplied,
  nextInitiativeStateCommandId,
} from "./initiativeStateGateway.js";
import { planIncrementalTrackerItemRender } from "./initiativeIncrementalRenderCore.js";
import {
  createDirtyItemSet,
  createInitiativeRenderScheduler,
} from "./initiativeRenderSchedulerCore.js";
import { summarizeInitiativeDiagnostics } from "./initiativeDiagnosticsCore.js";
import {
  currentSceneEpoch,
  invalidateSceneEpoch,
  isCurrentSceneEpoch,
  markSceneEpochReady,
  runSceneEpochSteps,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { createInitiativeReadinessHandshake } from "./initiativeBootstrapLifecycleCore.js";
import { cancelSceneEditorsWithoutCommit } from "./sceneEditorResetCore.js";
import {
  createMenuRequestId,
  isAllowedInitiativeCardMenuAction,
  isMenuMessageForRequest,
  removeStoredMenuPayload,
  writeStoredMenuPayload,
} from "./menuPopoverProtocolCore.js";
import {
  buildInitiativeCardContextMenuPayload,
  deriveInitiativeCardBossMode,
  resolveCompactAdminMenuAction,
  routeInitiativeCardContextMenuAction,
} from "./initiativeMenuActionsCore.js";
import { buildLegendaryResourcePips } from "./initiativeCardBossClassic.js";
import { buildClassicTrackerCard } from "./initiativeCardClassicBuilder.js";
import {
  getInitiativeCard,
  restoreInitiativeCardQuickActionsFromMemory,
} from "./initiativeCards.js";
import {
  findQuickAction,
  sanitizeQuickActions,
} from "./quickActionsCore.js";
import {
  buildSpellUnifiedPanelRouteQuery,
} from "./spellUnifiedPanelRoutingCore.js";
import { executeDirectQuickAction } from "./quickActionExecution.js";
import { executeSpellBoardTokenStateUpdate } from "./spellApplicationExecutor.js";
import { buildTrackerQuickActionLauncher } from "./trackerQuickActions.js";
import {
  CLASS_FEATURE_BY_ID,
  buildClassFeatureContextEntries,
  getClassFeatureDefinition,
} from "./classFeatureCatalog.js";
import {
  CLASS_FEATURE_STATE_FIELD,
  appendClassFeatureConditionInstances,
  classFeatureConditionResourceDie,
  classFeatureTargeting,
} from "./classFeatureCore.js";
let __classFeatureRuntimePromise = null;

function __loadClassFeatureRuntime() {
  if (!__classFeatureRuntimePromise) {
    __classFeatureRuntimePromise = import("./classFeatureRuntime.js").catch((error) => {
      __classFeatureRuntimePromise = null;
      throw error;
    });
  }
  return __classFeatureRuntimePromise;
}
import {
  bindClassicHPEditor,
  bindClassicInitiativeEditor,
} from "./initiativeEditors.js";
import {
  applyToolbarLayoutPresentation as applyToolbarLayoutPresentationView,
  buildGlobalPanelButton,
  buildToolbarButton,
  buildToolbarSection,
  decorateToolbarControl as decorateToolbarControlView,
  setToolbarToggleVisual,
} from "./initiativeToolbar.js";
import {
  __compactEffectItems,
  bindCompactEffectsToggle,
  buildCompactCardHP,
  buildCompactCardIndicators,
  buildCompactCardName,
  buildCompactCardPortrait,
  buildCompactCardShell,
  buildCompactCardStatus,
  buildCompactLegendaryResourcePips,
  compactStatusBadge,
  deriveCompactCardPresentation,
  enableCompactCardRename,
} from "./initiativeCardCompact.js";
import {
  compactTrackerGroupProgress,
  compactTrackerResizeWidth,
  compactTrackerStageSize,
  compactTrackerViewportWidth,
  compactTrackerWidth,
} from "./trackerCompactSizingCore.js";
import { projectTrackerEntries } from "./options/optionsProjection.js";
import {
  broadcastRuntimeOptionsInvalidation,
  runtimeOptionsService,
} from "./options/optionsRuntime.js";
import {
  selectActiveTurnLabelEnabled,
  selectEffectsDisplayMode,
  selectFollowActiveTurn,
  selectKnownFactionAssignmentEnabled,
  selectMapHpBarsEnabled,
  selectTrackerLayout,
  selectTrackerProjectionPolicy,
} from "./options/optionsSelectors.js";
import {
  bindOptionalRuntimeOption,
  createOptionalRuntimeLifecycle,
} from "./options/optionalRuntimeLifecycle.js";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";

  // Configurazione condizioni per tag card
export const CONDITIONS = [
  "Accecato", "Affascinato", "Afferrato", "Assordato", "Avvelenato",
  "Incapacitato", "Invisibile", "Paralizzato", "Pietrificato", "Privo di sensi",
    "Prono", "Spaventato", "Stordito", "Trattenuto", "Indebolimento", "Concentrazione", "Ira"
];
// — Dock condizioni (chip) sulla card
const COND_DOCK_CFG = {
  top: -6,                 // px dall’alto dell’header
  rightFromBadge: 0,   // ← non servirà più
  leftFromContent: -5
};
  const STATE_KEY = `${ID}/state`;
  const META_KEY  = `${ID}/meta`;
  const SPELLS_META_KEY = `${ID}/spells`;
  const CONC_META_KEY = `${ID}/concentration`; // { [spellKey]: { targets: [...] } }
  const CONCENTRATION_WARNING_CHANNEL = `${ID}/concentration-warning`;
  const CONCENTRATION_WARNING_MODAL_ID = `${ID}/concentration-warning-modal`;
  const CONCENTRATION_WARNING_UI_CHANNEL = `${CONCENTRATION_WARNING_CHANNEL}/ui`;
  const CONCENTRATION_WARNING_HOST_CHANNEL = `${CONCENTRATION_WARNING_CHANNEL}/host`;
  const TURN_NOTICE_CHANNEL = ID + "/turn-notice";
  // —— CHIP STYLE PRESET (condizioni + spell)
const CHIP_FONT_PX   = 11;  // dimensione testo dentro la pill
const CHIP_HEIGHT_PX = 18;  // altezza visiva della pill
const CHIP_PAD_X_PX  = 6;   // padding orizzontale
const CHIP_RADIUS_PX = 9;   // bordo arrotondato (mezzo dell'altezza)
const CHIP_GAP_PX    = 2;   // distanza tra pill adiacenti

function __styleChip(el) {
  Object.assign(el.style, {
    display: "inline-flex",
    alignItems: "center",
    height: CHIP_HEIGHT_PX + "px",
    lineHeight: CHIP_HEIGHT_PX + "px",
    padding: `0 ${CHIP_PAD_X_PX}px`,
    borderRadius: CHIP_RADIUS_PX + "px",
    fontSize: CHIP_FONT_PX + "px",
    fontWeight: "600",
    letterSpacing: "0.2px",
    // opzionali:
    // boxShadow: "inset 0 -1px 0 rgba(255,255,255,.12)"
  });
}

// Normalizza il nome spell a chiave
function __spellKey(name) {
  return String(name || "").trim().toLowerCase();
}
// Hash → hue (0..359) e palette leggibile
function __spellColor(key) {
  return spellColorFor(key);
}
  
  const FOCUS_MIN_PAD_PX = 64;
  const FOCUS_GRID_SPAN = 10; // Campo visivo fisso, indipendente dalle dimensioni token
  const FOCUS_FALLBACK_DPI = 150;
  const ARROW_PROXY_WINDOW_MS = 2000
  // ===== LAIR ACTIONS =====
  const LAIR_ID          = "__LAIR__";
  const LAIR_NAME        = "Azioni di Tana";
  const LAIR_INITIATIVE  = 20;
  const LAIR_PORTRAIT = "/lair-actions.svg";

  const BADGE_SIZE  = 36; // diametro del badge iniziativa (px)
  const BADGE_RIGHT = 8; // distanza del badge dal bordo destro (px)

  // --- Active Turn Label (ancorata al token attivo)
  const ACTIVE_LABEL_META = ACTIVE_TURN_LABEL_META;
  const ACTIVE_LABEL_TEXT_FMT = (nameBase) => `Turno di ${nameBase}`;
  const ACTIVE_LABEL_FONT = 22;
  const ACTIVE_LABEL_HEIGHT = 32;
  const ACTIVE_LABEL_MAX_WIDTH = 312;
  const ACTIVE_LABEL_BG = "#b91c1c";
  const ACTIVE_LABEL_BG_OPACITY = 0.94;
  const ACTIVE_LABEL_MAX_VIEW_SCALE = 1.35;
  const ACTIVE_LABEL_GAP_PX = 9;
  const ACTIVE_LABEL_POINTER_WIDTH = 14;
  const ACTIVE_LABEL_POINTER_HEIGHT = 10;

  // === EPIC ACTIONS (voci virtuali in lista) ===
  const EPIC_ACT_PREFIX = "__EPIC__";

  // --- Fallback chips condizioni (se conditions.js lancia)
function __chip(label, compact=true) {
  const s = document.createElement("span");
  s.textContent = String(label);
  Object.assign(s.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "700",
    padding: compact ? "1px 5px" : "2px 6px",
    borderRadius: "999px",
    background: "rgba(0,0,0,.72)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    lineHeight: "1",
    userSelect: "none",
    whiteSpace: "nowrap",
  });
  return s;
}

function __buildChipsSimple(cond, opts = {}) {
  const frag = document.createDocumentFragment();
  const cap = Array.isArray(opts.cap) ? opts.cap : [];
  const compact = !!opts.compact;

  const flags  = (cond && typeof cond === "object" && cond.flags && typeof cond.flags === "object")
    ? cond.flags : {};
  let custom = (cond && typeof cond === "object" && Array.isArray(cond.custom))
    ? cond.custom
    : [];

  // se custom è oggetto (vecchi dump), usa le chiavi truthy
  if (!Array.isArray(custom) && custom && typeof custom === "object") {
    custom = Object.keys(custom).filter(k => !!custom[k]);
  }

  const instances = getEffectiveConditionInstances(cond);
  if (instances.length) {
    const grouped = new Map();
    for (const instance of instances) {
      const name = String(instance.condition || "").trim();
      if (!name) continue;
      const current = grouped.get(name) || 0;
      grouped.set(name, current + 1);
    }
    const names = [
      ...cap.filter((name) => grouped.has(name)),
      ...Array.from(grouped.keys()).filter((name) => !cap.includes(name)),
    ];
    for (const name of names) {
      const count = grouped.get(name) || 0;
      frag.appendChild(__chip(count > 1 ? `${name} x${count}` : name, compact));
    }
    return frag;
  }
  // standard (rispetta l’ordine/whitelist di cap)
  for (const name of cap) {
    if (flags[name]) frag.appendChild(__chip(name, compact));
  }
  // eventuali flag “fuori cap”
  for (const k of Object.keys(flags)) {
    if (!cap.includes(k) && flags[k]) frag.appendChild(__chip(k, compact));
  }
  // custom
  for (const t of custom) {
    if (t != null && String(t).trim()) frag.appendChild(__chip(String(t), compact));
  }
  return frag;
}

function __buildConditionChipsSafe(cond, opts) {
  try {
    if (typeof buildConditionChips === "function") {
      return buildConditionChips(cond, opts);
    }
  } catch (err) {
    console.warn("[conditions] chip render (fallback):", err?.message || err);
  }
  // fallback nostro (silenzioso)
  return __buildChipsSimple(cond, opts);
}

let __activeTurnLabel = null;
let __activeTurnLabelInitialized = false;
let __activeTurnLabelDpi = null;
let __activeLabelEntriesById = new Map();
let __latestInitiativeState = null;
let __spellBoardTokenItems = [];
let __activeTurnLabelDesired = null;
let __activeTurnLabelPumpRunning = false;
let __activeTurnLabelRetryTimer = null;
let __activeTurnLabelPumpPromise = null;
let __activeTurnLabelRuntimeEnabled = false;
let __navigationDesiredState = null;
let __navigationDesiredEpoch = null;
let __navigationPumpRunning = false;
let __navigationFlushTimer = null;
let __navigationDesiredAt = 0;
let __navigationRevision = 0;
let __lastNavigationAt = 0;
let __renderRequestRevision = 0;
let __latestAcceptedRenderRevision = 0;
let __pendingIncrementalRenderTimer = null;
const __pendingIncrementalTrackerItemIds = new Set();
const __editorDirtyTrackerItemIds = createDirtyItemSet();
let __fullRenderDirty = false;
let __initiativeRenderScheduler = null;
let __latestSceneItemEventRevision = 0;
let __latestSceneItemEventGeneration = 0;
let __latestSceneItemEventCorrelation = null;
let __lastInitiativeMetadataDigest;
let __lastQueuedInitiativeMetadataDigest;
const __initiativeMetadataProcessor = createSerialProcessor();
let __initiativeMetadataRevision = 0;
let __optimisticNavigationDigest = null;
let __lastActiveId = null;
let __lastTurnNoticeActiveId = null;
let __lastConditionTurnState = null;
let __conditionNavigationHint = null;
let __sceneBaselineEpoch = null;
let __sceneEpochLifecycleMounted = false;
let __sceneEpochUnsubscribe = null;
let __sceneReadinessHandshake = null;
let __initiativeBootstrapStarted = false;
let __selectedSceneItemIds = new Set();
let __trackerSelectionAnchorId = null;
let __playerSelectionUnsubscribe = null;
let __playerSelectionPollTimer = null;
let __playerSelectionPollBusy = false;
const __hpBarsLifecycle = createOptionalRuntimeLifecycle({
  name: "map-hp-bars",
  mount: () => mountHPBars({ deferInitialSync: true }),
  unmount: unmountHPBars,
  cleanupOwnedOutputs: cleanupOwnedHPWidgets,
  reconcileFull: reconcileAllHPBars,
});
const NAVIGATION_STALE_GRACE_MS = 500;
const NAVIGATION_WRITE_SETTLE_MS = 60;
const INITIATIVE_DIAGNOSTICS_STORAGE_KEY = `${ID}/initiative-diagnostics`;
const INITIATIVE_DIAGNOSTICS_MAX_EVENTS = 500;
const __initiativeDiagnosticEvents = [];
let __initiativeDiagnosticSequence = 0;
let __initiativeDiagnosticsEnabled = (() => {
  try { return window.localStorage.getItem(INITIATIVE_DIAGNOSTICS_STORAGE_KEY) === "1"; }
  catch { return false; }
})();

function __initiativeDiag(event, detail = {}) {
  if (!__initiativeDiagnosticsEnabled) return;
  const entry = {
    seq: ++__initiativeDiagnosticSequence,
    ms: Math.round(performance.now()),
    event,
    ...detail,
  };
  __initiativeDiagnosticEvents.push(entry);
  if (__initiativeDiagnosticEvents.length > INITIATIVE_DIAGNOSTICS_MAX_EVENTS) {
    __initiativeDiagnosticEvents.splice(0, __initiativeDiagnosticEvents.length - INITIATIVE_DIAGNOSTICS_MAX_EVENTS);
  }
  console.debug("[initiative-diag]", entry);
}

globalThis.__tbpInitiativeDiagnostics = {
  enable() {
    __initiativeDiagnosticsEnabled = true;
    try { window.localStorage.setItem(INITIATIVE_DIAGNOSTICS_STORAGE_KEY, "1"); } catch {}
    __initiativeDiag("diagnostics:enabled");
    return "Diagnostica iniziativa attiva";
  },
  disable() {
    __initiativeDiag("diagnostics:disabled");
    __initiativeDiagnosticsEnabled = false;
    try { window.localStorage.removeItem(INITIATIVE_DIAGNOSTICS_STORAGE_KEY); } catch {}
    return "Diagnostica iniziativa disattivata";
  },
  clear() {
    __initiativeDiagnosticEvents.length = 0;
    __initiativeDiagnosticSequence = 0;
    return "Eventi diagnostici cancellati";
  },
  dump() {
    return __initiativeDiagnosticEvents.map((entry) => ({ ...entry }));
  },
  summary() {
    return {
      ...summarizeInitiativeDiagnostics(__initiativeDiagnosticEvents),
      sceneEpoch: currentSceneEpoch(),
      sceneReady: isCurrentSceneEpoch(currentSceneEpoch()),
      build: globalThis.__tbpBuildInfo || null,
    };
  },
  table() {
    console.table(__initiativeDiagnosticEvents);
    return __initiativeDiagnosticEvents.length;
  },
};

function __isCurrentSceneOperation(sceneEpoch, operation, detail = {}) {
  if (isCurrentSceneEpoch(sceneEpoch)) return true;
  __initiativeDiag("scene:operation-discarded", {
    operation,
    operationEpoch: sceneEpoch,
    sceneEpoch: currentSceneEpoch(),
    ...detail,
  });
  return false;
}

function __getInitiativeRenderScheduler() {
  if (__initiativeRenderScheduler) return __initiativeRenderScheduler;
  __initiativeRenderScheduler = createInitiativeRenderScheduler({
    getSceneEpoch: currentSceneEpoch,
    isCurrent: (sceneEpoch) => isCurrentSceneEpoch(sceneEpoch),
    onEvent: (event) => {
      __initiativeDiag(`render:scheduler-${event.type}`, {
        mode: event.mode,
        priority: event.priority,
        schedulerSequence: event.sequence,
        sceneEpoch: event.sceneEpoch,
        sourceRevision: event.sourceRevision,
        correlationId: event.correlationId,
        itemIds: event.itemIds,
        barrier: event.barrier,
        error: event.error,
      });
    },
  });
  return __initiativeRenderScheduler;
}

function __markEditorDirtyFromCard(card) {
  if (!(card instanceof HTMLElement)) return;
  __editorDirtyTrackerItemIds.add(card.dataset.itemId);
  __editorDirtyTrackerItemIds.addMany(card.__selectionItemIds);
}

function __scheduleEditorDirtyFlush() {
  if (__suspendRenders || __editingInitForId || __editingHPForId) return;
  const dirtyIds = __editorDirtyTrackerItemIds.take();
  const sceneEpoch = currentSceneEpoch();
  const requiresFull = __fullRenderDirty;
  if (!requiresFull && !dirtyIds.length) return;
  __fullRenderDirty = false;

  const flush = async () => {
    try {
      if (requiresFull) {
        await renderAll("editor-close");
        return;
      }
      const scheduled = await __requestIncrementalTrackerItems(
        { sceneEpoch, revision: __latestSceneItemEventRevision },
        { mode: "cards", itemIds: dirtyIds },
        "editor-close",
      );
      if (!scheduled) await renderAll("editor-close-fallback");
    } catch (error) {
      console.warn("[initiative] editor dirty render:", error?.message || error);
      if (!__isCurrentSceneOperation(sceneEpoch, "editor-dirty-retry")) return;
      try {
        await renderAll("editor-close-error");
      } catch (fallbackError) {
        __editorDirtyTrackerItemIds.addMany(dirtyIds);
        __fullRenderDirty = true;
        console.warn("[initiative] editor full retry:", fallbackError?.message || fallbackError);
      }
    }
  };
  void flush();
}

function __cancelSceneEditorsWithoutCommit() {
  const editors = typeof document === "undefined"
    ? []
    : Array.from(document.querySelectorAll('[data-init-editing="1"], [data-hp-editing="1"]'));
  __initiativeFillMode = false;
  __initiativeFillSession = null;
  __editingInitForId = null;
  __editingHPForId = null;
  __suspendRenders = false;
  void cancelSceneEditorsWithoutCommit(editors);
}

function __resetInitiativeSceneRuntime(sceneEpoch, reason) {
  __cancelSceneEditorsWithoutCommit();
  __sceneBaselineEpoch = null;
  __activeTurnLabel = null;
  __activeTurnLabelInitialized = false;
  __activeTurnLabelDpi = null;
  __activeLabelEntriesById = new Map();
  __latestInitiativeState = null;
  __spellBoardTokenItems = [];
  __activeTurnLabelDesired = null;
  __activeTurnLabelLatestKey = null;
  __activeTurnLabelRevision += 1;
  if (__activeTurnLabelRetryTimer !== null) {
    window.clearTimeout(__activeTurnLabelRetryTimer);
    __activeTurnLabelRetryTimer = null;
  }
  __navigationDesiredState = null;
  __navigationDesiredEpoch = null;
  __navigationDesiredAt = 0;
  __navigationRevision += 1;
  __lastNavigationAt = 0;
  if (__navigationFlushTimer !== null) {
    window.clearTimeout(__navigationFlushTimer);
    __navigationFlushTimer = null;
  }
  __renderRequestRevision += 1;
  __latestAcceptedRenderRevision = __renderRequestRevision;
  __initiativeRenderScheduler?.reset(sceneEpoch);
  if (__pendingIncrementalRenderTimer !== null) {
    window.clearTimeout(__pendingIncrementalRenderTimer);
    __pendingIncrementalRenderTimer = null;
  }
  __pendingIncrementalTrackerItemIds.clear();
  __editorDirtyTrackerItemIds.clear();
  __fullRenderDirty = false;
  __latestSceneItemEventRevision = 0;
  __latestSceneItemEventGeneration = 0;
  __latestSceneItemEventCorrelation = null;
  __lastInitiativeMetadataDigest = undefined;
  __lastQueuedInitiativeMetadataDigest = undefined;
  __initiativeMetadataRevision += 1;
  __optimisticNavigationDigest = null;
  __lastActiveId = null;
  __lastTurnNoticeActiveId = null;
  __lastTurnNoticeDeliveryKey = "";
  __lastConditionTurnState = null;
  __conditionNavigationHint = null;
  __selectedSceneItemIds = new Set();
  __trackerSelectionAnchorId = null;
  __lastRenderedActiveId = null;
  __prevActiveId = null;
  __lastRoundSeen = null;
  __scrollActiveOnNextRender = false;
  __selectFocusDesired = null;
  __selectFocusRunningKey = null;
  __selectFocusCompletedKey = null;
  __viewportFocusDesired = null;
  if (__viewportFocusTimer !== null) {
    window.clearTimeout(__viewportFocusTimer);
    __viewportFocusTimer = null;
  }
  __initiativeDiag("scene:reset", { sceneEpoch, reason });
}

async function __adoptInitiativeSceneBaseline(st, stateDigest, sceneEpoch, source, render = true) {
  if (!__isCurrentSceneOperation(sceneEpoch, "baseline", { source })) return false;
  if (__sceneBaselineEpoch === sceneEpoch) return false;

  __sceneBaselineEpoch = sceneEpoch;
  __lastInitiativeMetadataDigest = stateDigest;
  __lastQueuedInitiativeMetadataDigest = stateDigest;
  __latestInitiativeState = st || null;
  __lastActiveId = __activeIdForState(st);
  __lastTurnNoticeActiveId = __lastActiveId;
  __lastRoundSeen = Math.max(1, Number(st?.round || 1));
  __lastConditionTurnState = __conditionTurnStateSnapshot(st);
  __conditionNavigationHint = null;
  syncSpeedCheckTurn(st);
  __initiativeDiag("scene:baseline-acquired", {
    sceneEpoch,
    source,
    activeId: __lastActiveId,
    round: __lastRoundSeen,
  });

  if (!render) return true;
  await renderAll("scene-baseline");
  return __isCurrentSceneOperation(sceneEpoch, "baseline-render", { source });
}

async function __acquireInitiativeSceneBaseline(sceneEpoch, source = "scene-ready", render = true) {
  if (!__isCurrentSceneOperation(sceneEpoch, "baseline-read", { source })) return false;
  const metadata = await OBR.scene.getMetadata();
  if (!__isCurrentSceneOperation(sceneEpoch, "baseline-read", { source })) return false;
  const st = metadata?.[STATE_KEY];
  return __adoptInitiativeSceneBaseline(
    st,
    initiativeStateDigest(st),
    sceneEpoch,
    source,
    render,
  );
}

function __mountSceneEpochLifecycle() {
  if (__sceneEpochLifecycleMounted) return __sceneReadinessHandshake;
  __sceneEpochLifecycleMounted = true;
  __sceneEpochUnsubscribe = subscribeSceneEpoch(({ phase, epoch, reason }) => {
    if (phase === "unload") {
      __resetInitiativeSceneRuntime(epoch, reason);
      return;
    }
    if (!__initiativeBootstrapStarted) return;
    __requestTurnNoticeReady(epoch);
    void __acquireInitiativeSceneBaseline(epoch, reason).catch((error) => {
      console.warn("[initiative] scene baseline:", error?.message || error);
    });
  });
  __sceneReadinessHandshake = createInitiativeReadinessHandshake({
    subscribeReadiness: (listener) => OBR.scene.onReadyChange(listener),
    readInitialReadiness: () => OBR.scene.isReady(),
    onState: ({ ready, reason }) => {
      if (!ready) {
        invalidateSceneEpoch("scene-unload");
        return;
      }
      markSceneEpochReady(reason || "scene-ready");
    },
  });
  void __sceneReadinessHandshake.mount();
  return __sceneReadinessHandshake;
}


  // Scansione e deduplicazione una tantum all'avvio.
async function __cleanupActiveTurnLabels() {
  if (!IS_GM) {
    __activeTurnLabel = null;
    __activeTurnLabelInitialized = true;
    return null;
  }

  // Elimina le label locali create dalle build precedenti.
  try {
    const locals = await OBR.scene.local.getItems(
      (it) => it.type === "LABEL" && it.metadata?.[ACTIVE_LABEL_META]
    );
    if (locals.length) await OBR.scene.local.deleteItems(locals.map((it) => it.id));
  } catch (e) {
    console.warn("[activeLabel] local cleanup failed:", e?.message || e);
  }

  let globals = [];
  try {
    globals = await OBR.scene.items.getItems(
      (it) => it.type === "LABEL" && it.metadata?.[ACTIVE_LABEL_META]
    );
    if (globals.length > 1) {
      await OBR.scene.items.deleteItems(globals.slice(1).map((it) => it.id));
      globals = globals.slice(0, 1);
    }
  } catch (e) {
    __activeTurnLabelInitialized = false;
    __activeTurnLabel = null;
    console.warn("[activeLabel] global init failed:", e?.message || e);
    throw e;
  }

  __activeTurnLabel = globals[0] || null;
  __activeTurnLabelInitialized = true;
  return __activeTurnLabel;
}
  function isEpicActionId(id) {
  return typeof id === "string" && id.startsWith(EPIC_ACT_PREFIX);
}

// Copia - Aggiunta (subito dopo isEpicActionId)
function __safeConditions(c) {
  const src = (c && typeof c === "object") ? c : {};
  const flags = (src.flags && typeof src.flags === "object") ? src.flags : {};
  const custom = Array.isArray(src.custom) ? src.custom : [];
  const instances = Array.isArray(src.instances) ? src.instances : [];
  return { ...src, flags, custom, instances };
}
// Parser sicuro del "base name" senza i prefissi "(n) "
function __safeBaseName(name) {
  try {
    if (typeof _parseIndexedName === "function") {
      return _parseIndexedName(name).base;
    }
  } catch {}
  const raw = String(name || "Unnamed").trim();
  return raw.replace(/^(\(\d+\)\s*)+/, "").trim();
}

// Mantiene sincronizzati il nome interno del token e la label nativa mostrata
// sotto l'immagine da Owlbear Rodeo, senza modificare lo stile del testo.
function __setSceneTokenDisplayName(item, nextName) {
  if (!item) return;
  item.name = nextName;
  if (item.type !== "IMAGE" || !item.text || typeof item.text !== "object") return;
  item.text = {
    ...item.text,
    plainText: nextName,
    richText: [
      {
        type: "paragraph",
        children: [{ text: nextName }],
      },
    ],
  };
}

// Crea una voce virtuale "Epic Action" del boss dopo un certo PG
function makeEpicActionEntry(bossEntry, pcEntry) {
  // id unico stabile (non finisce nei metadata della scena)
  const id = `${EPIC_ACT_PREFIX}::${bossEntry.id}::after::${pcEntry.id}`;
  return {
    id,
    // stesso nome del token (boss)
    name: bossEntry.name,
    initiative: pcEntry.initiative,    // badge informativo; non editabile
    portrait: bossEntry.portrait || null,
    attitude: bossEntry.attitude || "enemy",
    hp: null,
    hpMax: null,
    isEpicAction: true,
    epicBossId: bossEntry.id,
    epicAfterPCId: pcEntry.id,
    conditions: __safeConditions(null),
  };
}

  let __lastRenderedActiveId = null;
  let __prevActiveId = null;
  let __lastRoundSeen = null;
  let __scrollActiveOnNextRender = false;

  function isLairId(id) { return id === LAIR_ID; }
  function makeLairEntry() {
  return {
    id: LAIR_ID,
    name: LAIR_NAME,
    initiative: LAIR_INITIATIVE,
    portrait: LAIR_PORTRAIT,
    attitude: "enemy",
    hp: null,
    hpMax: null,
    legendary: { max: 0, current: 0 },
    conditions: __safeConditions(null),
  };
}

  const LEG_BOSS_CFG = {
  scale: 1,          // quanto ingrandire la card
  extraHeight: 28,       // modulo boss da 88px, cornice estesa compresa
  zIndex: 6,            // per sovrapporsi leggermente alle altre
  shadow: "0 0 10px rgba(255, 0, 0, 0.8)" // alone leggero dorato
};

const BOSS_PORTRAIT_FRAME_SRC = "/boss-frame-ui.png";
const BOSS_PORTRAIT_FRAME_SCALE = 1.38;
const BOSS_PORTRAIT_FRAME_SCALE_COMPACT = 1.3;
const BOSS_PORTRAIT_FRAME_MASK = "radial-gradient(circle at 50% 50%, transparent 0 43%, #000 44%)";

// --- ZOOM CONFIG GLOBALE ---
const ZOOM_CFG = {
  scale: 1.035,                                   // enfasi attiva senza invadere le card adiacenti
  dur:   500,                                      // ms
  ease:  "cubic-bezier(.16,.84,.22,1)"             // easing morbido
};

function __applyZoomTransition(el) {
  const dur = ZOOM_CFG.dur;
  // NB: box-shadow un filo più corto, height come prima
  el.style.transition = `transform ${dur}ms ${ZOOM_CFG.ease}, scale ${dur}ms ${ZOOM_CFG.ease}, box-shadow ${Math.max(120, dur - 40)}ms ease, height .15s ease`;
}

// Applica una transform senza animazione, poi ripristina la transition desiderata
function __instaTransform(el, value) {
  const prev = el.style.transition;
  el.style.transition = "none";
  el.style.transform = value;
  // commit layout per evitare transizioni fantasma
  void el.offsetHeight; // eslint-disable-line no-unused-expressions
  el.style.transition = prev || "";
  if (!prev) __applyZoomTransition(el);
}

  // ===== Legendary UI (2 gruppi indipendenti) =====
  const LEG_PIPS_CFG = {
  gap: 2,                    // tra i singoli pips
  paddingX: 0,
  paddingY: 0,
  size: 7,                  // lato del diamante/circolo
  diamond: true              // true=♦, false=●
};

const LEG_RESOURCE_CFG = {
  top: 31,
  clusterGap: 3,
  controlWidth: 14,
  controlHeight: 10,
};

const DEFAULT_LEGENDARY_RESISTANCES = 3;

// --- Paragon controls: stessa posizione/stile dei Legendary (+/-)
const PAR_CTRL_CFG = {
  top: -8,
  right: null,            // se null → usa rightFromBadge come i Legendary
  rightFromBadge: 105,    // identico ai Legendary; se vuoi più vicino al badge, riduci
  gap: 2,
  paddingX: 0,
  paddingY: 0,
  btnSize: 20,
  btnRadius: 32,
  // dockBg: "rgba(0,0,0,.22)",
  // dockBorder: "1px solid rgba(255,255,255,.18)",
  // dockRadius: 12,
};

// Se ti serve riservare più spazio a destra del testo per i due gruppi:
  const HEADER_RIGHT_PAD_EXTRA = 120; // px extra oltre al badge

// --- EPIC / EPIC ACTION tag config (solo controlli via JS) ---
const EPIC_TAG_CFG = {
  posBoss:   { top: -6, right: null, rightFromBadge: 100, gap: 6, reserve: 120 },
  posAction: { top: -6, right: null, rightFromBadge: 115, gap: 6, reserve: 120 },

  // Stile delle pill
  epic: {
    label: "Boss Epico",
    fontSize: 12, fontWeight: 700, padX: 6, padY: 2, radius: 999,
    bg: "rgba(255, 0, 0, 1)", color: "#fff",
    border: "1px solid rgba(0, 0, 0, 1)", letterSpacing: .2
  },
  action: {
    label: "Azione Epica",
    fontSize: 9, fontWeight: 500, padX: 8, padY: 2, radius: 999,
    bg: "rgba(255, 0, 0, 1)", color: "#fff",
    border: "1px solid rgba(6, 0, 0, 1)", letterSpacing: .2
  }
};

  // --- Drag & Drop (riordino fra pari iniziativa) ---
  let __draggingId   = null;   // id card trascinata
  let __draggingInit = null;   // iniziativa della card trascinata
  let __draggingWasCollapsed = false; // true se la card sorgente è un lead collassato

  let __editingInitForId = null; // già presente dal fix precedente
  let __editingHPForId   = null; // nuovo: lock per pill HP
  let __suspendRenders   = false; // nuovo: sospende render durante lo switch di editor
  let __initiativeFillMode = false;
  let __initiativeFillSession = null;
  let IS_GM = false;
  let __optionsProjectionUnsubscribe = null;
  let __optionsPresentationUnsubscribe = null;
  let __trackerLayout = getTrackerLayout();

  function isCompactTrackerLayout() {
    return __trackerLayout === TRACKER_LAYOUT_COMPACT;
  }


  export function mountInitiativeList(container) {
    if (container.__initiativeMounted) return;   // ← evita montaggi doppi
    container.__initiativeMounted = true;
    const __activeTurnLabelLifecycle = createOptionalRuntimeLifecycle({
      name: "active-turn-map-label",
      mount: () => { __activeTurnLabelRuntimeEnabled = true; },
      unmount: __unmountActiveTurnLabelRuntime,
      cleanupOwnedOutputs: __cleanupOwnedActiveTurnLabels,
      reconcileFull: __reconcileActiveTurnLabelRuntime,
    });
    const styleTag = document.createElement("style");
styleTag.textContent = `
  :root, body { height: 100%; overflow: hidden; }
  .tbp-root {
    font-family: var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif);
    font-feature-settings: "kern" 1, "liga" 1;
  }
  .tbp-root button, .tbp-root input, .tbp-root textarea, .tbp-root select {
    font-family: inherit;
  }
  .tbp-root, .tbp-root *:not(input):not(textarea):not([contenteditable="true"]) {
    -webkit-user-select: none;
    user-select: none;
  }
`;
document.head.appendChild(styleTag);

container.classList.add("tbp-root");
container.style.height = "100%";
container.style.overflow = "hidden";

container.addEventListener("mousedown", (e) => {
  if (__editingHPForId || __editingInitForId) return;

  const t = e.target;
  if (t.closest('[data-item-id]') || t.closest('[draggable="true"]')) return;

  const interactive = t.closest("input, textarea, select, [contenteditable='true'], button, [role='button']");
  if (!interactive) {
    e.preventDefault();
    try { window.getSelection?.().removeAllRanges?.(); } catch {}
  }
}, { capture: true });

const col = document.createElement("div");
col.style.display = "flex";
col.style.flexDirection = "column";
col.style.alignItems = "stretch";
col.style.gap = "8px";
col.style.height = "100%";
col.style.overflow = "hidden";
container.replaceChildren(col);

function mkBtn(txt) {
  return buildToolbarButton(txt);
}

const btnPrev = mkBtn("\u25B2");
const btnNext = mkBtn("\u25BC");

// pill “Turno N”
const roundPill = document.createElement("div");
roundPill.title = "Numero di turni (scatta quando l'iniziativa avanza e ritorna all'inizio)";
Object.assign(roundPill.style, {
  alignSelf: "center",
  width: "calc(100% - 16px)",
  maxWidth: "460px",
  minHeight: "52px",
  boxSizing: "border-box",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: "500",
  lineHeight: "1",
  color: "#fff",
  background: "linear-gradient(180deg, rgba(14,19,31,.82), rgba(8,12,21,.76))",
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: "18px",
  boxShadow: "0 8px 22px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05)",
  userSelect: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
});

const roundStatus = document.createElement("div");
Object.assign(roundStatus.style, {
  flex: "1 1 120px",
  minWidth: "120px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
});

const roundLabel = document.createElement("span");
roundLabel.id = "tbp-round-label";
Object.assign(roundLabel.style, {
  flex: "0 0 auto",
  overflow: "visible",
  whiteSpace: "nowrap",
  fontSize: "15px",
  fontWeight: "700",
});

const roundResetSlot = document.createElement("div");
Object.assign(roundResetSlot.style, {
  display: "inline-flex",
  alignItems: "center",
  paddingRight: "7px",
  borderRight: "1px solid rgba(148,163,184,.22)",
});


roundStatus.append(roundLabel);
roundPill.appendChild(roundStatus);
const trackerDragHandle = document.createElement("button");
trackerDragHandle.type = "button";
trackerDragHandle.draggable = true;
trackerDragHandle.textContent = "\u2630";
trackerDragHandle.title = "Trascina per spostare il tracker. Doppio click per ricentrare";
trackerDragHandle.setAttribute("aria-label", trackerDragHandle.title);
Object.assign(trackerDragHandle.style, {
  flex: "0 0 auto",
  width: "28px",
  height: "28px",
  display: "none",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: "8px",
  background: "rgba(0,0,0,.34)",
  color: "rgba(255,255,255,.82)",
  fontSize: "15px",
  lineHeight: "1",
  cursor: "grab",
  touchAction: "none",
});

let __compactDragStart = null;
trackerDragHandle.addEventListener("dragstart", (event) => {
  if (!isCompactTrackerLayout()) {
    event.preventDefault();
    return;
  }
  event.stopPropagation();
  const rect = col.getBoundingClientRect();
  __compactDragStart = {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "initiative-tracker");
  event.dataTransfer.setDragImage(
    col,
    Math.max(0, event.clientX - rect.left),
    Math.max(0, event.clientY - rect.top),
  );
  trackerDragHandle.style.cursor = "grabbing";
});
trackerDragHandle.addEventListener("dragend", (event) => {
  if (!__compactDragStart) return;
  event.stopPropagation();
  const endX = Number.isFinite(event.screenX) ? event.screenX : event.clientX;
  const endY = Number.isFinite(event.screenY) ? event.screenY : event.clientY;
  const deltaX = endX - __compactDragStart.x;
  const deltaY = endY - __compactDragStart.y;
  __compactDragStart = null;
  trackerDragHandle.style.cursor = "grab";
  if (!Number.isFinite(endX) || !Number.isFinite(endY)) return;
  if (Math.abs(deltaX) + Math.abs(deltaY) < 4) return;
  void OBR.broadcast.sendMessage(TRACKER_LAYOUT_CHANNEL, {
    type: "tracker-position-change",
    deltaX,
    deltaY,
  }, { destination: "LOCAL" });
});
trackerDragHandle.addEventListener("dblclick", (event) => {
  if (!isCompactTrackerLayout()) return;
  event.preventDefault();
  event.stopPropagation();
  void OBR.broadcast.sendMessage(TRACKER_LAYOUT_CHANNEL, {
    type: "tracker-position-reset",
  }, { destination: "LOCAL" });
});

roundPill.appendChild(trackerDragHandle);


const layoutToggleButton = document.createElement("button");
layoutToggleButton.type = "button";
layoutToggleButton.dataset.layoutToggle = "1";
Object.assign(layoutToggleButton.style, {
  flex: "0 0 auto",
  marginLeft: "4px",
  marginRight: "4px",
  width: "28px",
  height: "28px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0",
  border: "1px solid rgba(148,163,184,.28)",
  borderRadius: "8px",
  background: "rgba(0,0,0,.34)",
  color: "#fff",
  fontSize: "16px",
  lineHeight: "1",
  cursor: "pointer",
});

const layoutToggleIcon = document.createElement("img");
layoutToggleIcon.alt = "";
layoutToggleIcon.setAttribute("aria-hidden", "true");
Object.assign(layoutToggleIcon.style, {
  width: "18px",
  height: "18px",
  display: "block",
  objectFit: "contain",
  pointerEvents: "none",
});
layoutToggleButton.append(layoutToggleIcon);

function updateLayoutToggleButton() {
  const compact = isCompactTrackerLayout();
  trackerDragHandle.style.display = compact ? "inline-flex" : "none";
  layoutToggleIcon.src = compact
    ? "/modalita-estesa.svg"
    : "/modalita-compatta.svg";
  layoutToggleButton.title = compact
    ? "Passa alla modalità estesa"
    : "Passa alla modalità compatta";
  layoutToggleButton.setAttribute("aria-label", layoutToggleButton.title);
  layoutToggleButton.setAttribute("aria-pressed", String(compact));
}

layoutToggleButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void __closeCompactEffectsPopover();
  __trackerLayout = isCompactTrackerLayout()
    ? TRACKER_LAYOUT_CLASSIC
    : TRACKER_LAYOUT_COMPACT;
  updateLayoutToggleButton();
  applyTrackerLayout();
  __syncTrackerPopoverSizeForLayout();
  void renderAll();
  void runtimeOptionsService.updateLocal((current) => ({
    ...current,
    tracker: { ...current.tracker, layout: __trackerLayout },
  })).catch((error) => {
    console.warn("[tracker-layout] opzioni locali non salvate:", error?.message || error);
  });
  void setTrackerLayout(__trackerLayout).catch((error) => {
    console.warn("[tracker-layout] salvataggio fallito:", error?.message || error);
  });
});

roundPill.appendChild(layoutToggleButton);
updateLayoutToggleButton();
const roundActions = document.createElement("div");
roundActions.dataset.roundActions = "1";
Object.assign(roundActions.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  padding: "2px",
  border: "1px solid rgba(96,165,250,.26)",
  borderRadius: "10px",
  background: "rgba(30,64,175,.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
});

const roundHistorySlot = document.createElement("div");
Object.assign(roundHistorySlot.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  padding: "2px",
  marginLeft: "1px",
  border: "1px solid rgba(167,139,250,.28)",
  borderRadius: "10px",
  background: "rgba(91,33,182,.10)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
});

// ⬇️ NUOVO: bottone reset turno (solo GM)
function makeRoundResetBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.resetRound = "1";
  b.title = "Resetta il round a 1 (solo GM)";
  b.textContent = "↺";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.45)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await setSceneState(prev => ({ ...(prev || {}), round: 1 }));
      await renderAll();
    } catch (err) {
      console.warn("[round-reset] errore reset turno:", err?.message || err);
    }
  });
  return b;
}

function makeAddAllInitiativeBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.addAllInitiative = "1";
  b.title = "Aggiungi tutti i token della scena all'iniziativa (solo GM)";
  b.textContent = "+";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(74,222,128,.68)",
    background: "rgba(21,128,61,.62)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0 0 2px",
  });
  b.addEventListener("click", async (event) => {
    event.stopPropagation();
    b.disabled = true;
    try {
      if (__initiativeFillMode) {
        await closeOpenEditors();
        await finishInitiativeFillMode();
      }

      const items = await OBR.scene.items.getItems((item) => (
        item.layer === "CHARACTER" && !item.attachedTo
      ));
      const pending = items.filter((item) => item.metadata?.[META_KEY]?.inInitiative !== true);
      if (!pending.length) {
        await OBR.notification.show("Tutti i token sono gia nell'iniziativa.", "INFO");
        return;
      }

      const ids = pending.map((item) => item.id);
      const knownFactionAssignmentEnabled = runtimeOptionsService.get(
        selectKnownFactionAssignmentEnabled,
      );
      const registry = knownFactionAssignmentEnabled ? await readFactionRegistry() : {};
      const resolvedAttitudes = new Map();
      let unknownCount = 0;
      for (const item of pending) {
        const previous = item.metadata?.[META_KEY] || {};
        const registered = knownFactionAssignmentEnabled
          ? registeredAttitudeForItem(item, registry)
          : "";
        if (!previous.attitude && !registered) unknownCount += 1;
        resolvedAttitudes.set(item.id, registered || previous.attitude || "enemy");
      }
      await OBR.scene.items.updateItems(ids, (drafts) => {
        for (const item of drafts) {
          const previous = { ...(item.metadata?.[META_KEY] || {}) };
          item.metadata = {
            ...(item.metadata || {}),
            [META_KEY]: {
              ...previous,
              initiative: previous.initiative ?? 10,
              attitude: resolvedAttitudes.get(item.id) || previous.attitude || "enemy",
              inInitiative: true,
            },
          };
        }
      });
      await reconcileStateWithItems();
      await enforceUniqueNamePrefixes();
      await renderAll();
      await startInitiativeFillMode({ silent: true });
      await OBR.notification.show(
        `${ids.length} token aggiunti all'iniziativa.${unknownCount ? ` ${unknownCount} non riconosciuti: ostili.` : ""}`,
        "SUCCESS"
      );
    } catch {
      await OBR.notification.show("Impossibile aggiungere tutti i token.", "ERROR").catch(() => {});
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function makeOptionsBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.optionsPanel = "1";
  b.title = "Apri il pannello opzioni (solo GM)";
  b.setAttribute("aria-label", b.title);
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(147,197,253,.55)",
    background: "rgba(30,64,175,.48)",
    color: "#fff",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  const icon = document.createElement("img");
  icon.src = (import.meta.env.BASE_URL || "/") + "options.svg";
  icon.alt = "";
  Object.assign(icon.style, {
    width: "12px",
    height: "12px",
    display: "block",
    filter: "brightness(0) invert(1)",
    pointerEvents: "none",
  });
  b.appendChild(icon);
  b.addEventListener("click", (event) => {
    event.stopPropagation();
    void openOptionsPopup();
  });
  return b;
}
function makeClearInitiativeBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.clearInitiative = "1";
  b.title = "Rimuovi tutte le card dall'iniziativa (solo GM)";
  b.textContent = "×";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(248,113,113,.55)",
    background: "rgba(127,29,29,.55)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    b.disabled = true;
    try {
      const items = await OBR.scene.items.getItems(
        it => it.metadata?.[META_KEY]?.inInitiative === true
      );
      const ids = items.map(it => it.id);
      if (ids.length) {
        await OBR.scene.items.updateItems(ids, (drafts) => {
          for (const it of drafts) {
            const me = { ...(it.metadata?.[META_KEY] || {}) };
            delete me.inInitiative;
            it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
          }
        });
      }
      await resetTrackerState();
      await renderAll();
    } catch (err) {
      console.warn("[initiative-clear] errore svuotamento:", err?.message || err);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function makeHistoryBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.history = "1";
  b.title = "Registro combattimento e Undo (solo GM)";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(147,197,253,.62)",
    background: "rgba(30,64,175,.58)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  const icon = document.createElement("img");
  icon.src = (import.meta.env.BASE_URL || "/") + "history.svg";
  icon.alt = "";
  Object.assign(icon.style, {
    width: "14px",
    height: "14px",
    display: "block",
    pointerEvents: "none",
  });
  b.appendChild(icon);
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const popupId = `${ID}/history-modal`;
    if (!await beginTrackerPopoverToggle(popupId)) return;
    try {
      const anchorPosition = await getTrackerPopoverAnchor();
      await OBR.modal.close(popupId).catch(() => {});
      await OBR.popover.close(popupId).catch(() => {});
      await openTrackedPopover({
        id: popupId,
        url: "/history-modal.html",
        width: 480,
        height: 640,
        anchorReference: "POSITION",
        anchorPosition,
        anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
        transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
        disableClickAway: true,
        marginThreshold: 12,
        hidePaper: true,
      });
      __openTrackerPopoverId = popupId;
    } catch (err) {
      __openTrackerPopoverId = "";
      console.warn("[history] popover open error:", err?.message || err);
    }
  });
  return b;
}

const topRow = document.createElement("div");
Object.assign(topRow.style, {
  alignSelf: "center",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  paddingBottom: "2px",
  flexDirection: "column",
  flexWrap: "nowrap",
});

const viewOptionsRow = document.createElement("div");
Object.assign(viewOptionsRow.style, {
  width: "calc(100% - 32px)",
  maxWidth: "430px",
  minHeight: "40px",
  boxSizing: "border-box",
  display: "none",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4px",
  padding: "4px",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: "13px",
  background: "rgba(8,12,21,.46)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
});

const sceneOptionsGroup = document.createElement("div");
Object.assign(sceneOptionsGroup.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "2px",
});
const toolOptionsGroup = document.createElement("div");
Object.assign(toolOptionsGroup.style, {
  display: "inline-flex",
  alignItems: "center",
  gap: "2px",
  paddingLeft: "5px",
  borderLeft: "1px solid rgba(148,163,184,.2)",
});
function makeToolbarSection(title, content) {
  return buildToolbarSection(title, content);
}

function decorateToolbarControl(control, label) {
  return decorateToolbarControlView(control, label);
}

const encounterToolbar = makeToolbarSection("Incontro", sceneOptionsGroup);
const trackersToolbar = makeToolbarSection("Tracker", toolOptionsGroup);
viewOptionsRow.append(encounterToolbar.section, trackersToolbar.section);
topRow.append(roundPill, viewOptionsRow);

// Toggle dello zoom automatico. Il default resta attivo per compatibilità
// con le scene che non hanno ancora salvato questa preferenza.
const zoomToggleWrap = document.createElement("label");
Object.assign(zoomToggleWrap.style, {
  position: "relative",
  width: "100%",
  minHeight: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "6px",
  padding: "0 7px",
  boxSizing: "border-box",
  background: "transparent",
  border: "1px solid rgba(148,163,184,.24)",
  borderRadius: "7px",
  userSelect: "none",
  cursor: "pointer",
});

const zoomChk = document.createElement("input");
zoomChk.type = "checkbox";
zoomChk.checked = true;
Object.assign(zoomChk.style, {
  position: "static",
  width: "13px",
  height: "13px",
  margin: "0",
  opacity: "1",
  pointerEvents: "auto",
  accentColor: "#60a5fa",
});
zoomChk.title = "Centra automaticamente la scena sul token attivo";

const zoomLbl = document.createElement("span");
zoomLbl.textContent = "Focus token";
Object.assign(zoomLbl.style, {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "8px",
  fontWeight: "600",
  lineHeight: "1",
  color: "rgba(255,255,255,.88)",
  pointerEvents: "none",
});

function setCompactToggleVisual(wrap, active) {
  setToolbarToggleVisual(wrap, active, {
    compact: isCompactTrackerLayout(),
  });
}

zoomToggleWrap.append(zoomChk, zoomLbl);
zoomToggleWrap.title = zoomChk.title;
zoomToggleWrap.setAttribute("aria-label", zoomChk.title);
setCompactToggleVisual(zoomToggleWrap, zoomChk.checked);
sceneOptionsGroup.appendChild(zoomToggleWrap);

function makeGlobalPanelButton(title, iconPath, invert = false) {
  return buildGlobalPanelButton(title, iconPath, {
    invert,
    baseUrl: import.meta.env.BASE_URL || "/",
  });
}

const globalPanelsWrap = document.createElement("div");
Object.assign(globalPanelsWrap.style, {
  display: "none",
  alignItems: "center",
  gap: "2px",
});
const globalEffectsButton = makeGlobalPanelButton("Condizioni", "conditions-panel.svg");
const globalSpellsButton = makeGlobalPanelButton("Incantesimi", "spells-panel.svg");
const globalQuickHPButton = makeGlobalPanelButton("Effetti", "quick-damage.svg");
globalQuickHPButton.querySelector("[data-toolbar-caption='1']").textContent = "Effetti";
const EFFECTS_POPUP_ID = `${ID}/effects-modal`;
const SPELLS_POPUP_ID = `${ID}/spells-modal`;
const QUICK_HP_POPUP_ID = `${ID}/quick-hp-modal`;
const OPTIONS_POPUP_ID = `${ID}/options-modal`;
const optionsPanelButton = makeOptionsBtn();
globalEffectsButton.setAttribute("aria-pressed", "false");
globalSpellsButton.setAttribute("aria-pressed", "false");
globalQuickHPButton.setAttribute("aria-pressed", "false");
optionsPanelButton.setAttribute("aria-pressed", "false");
const trackedMoveButton = makeGlobalPanelButton("Movimento tracciato", "speed-panel.svg");
trackedMoveButton.querySelector("[data-toolbar-caption='1']").textContent = "Movimento";
trackedMoveButton.setAttribute("aria-pressed", "false");
let trackedMoveActive = false;

function setTrackedMoveButtonActive(active, { commit = true } = {}) {
  trackedMoveActive = !!active;
  if (commit) setSpeedCheckEnabled(trackedMoveActive);
  trackedMoveButton.setAttribute("aria-pressed", active ? "true" : "false");
  trackedMoveButton.style.background = active
    ? "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))"
    : "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))";
  trackedMoveButton.style.borderColor = active
    ? "rgba(147,197,253,.8)"
    : "rgba(148,163,184,.24)";
  trackedMoveButton.style.boxShadow = active
    ? "inset 0 1px 0 rgba(255,255,255,.2), 0 5px 14px rgba(30,64,175,.26)"
    : "inset 0 1px 0 rgba(255,255,255,.04)";
}

subscribeSpeedCheckEnabled((active) => {
  setTrackedMoveButtonActive(active, { commit: false });
});

trackedMoveButton.addEventListener("click", () => {
  setTrackedMoveButtonActive(!trackedMoveActive);
});
globalEffectsButton.addEventListener("click", () => void openGlobalEffectsPopup());
globalSpellsButton.addEventListener("click", () => void openGlobalSpellsPopup());
globalQuickHPButton.addEventListener("click", () => void openGlobalQuickHPPopup());
globalPanelsWrap.append(globalEffectsButton, globalSpellsButton, globalQuickHPButton);
toolOptionsGroup.append(globalPanelsWrap, trackedMoveButton);

function ensureGlobalPanelControls() {
  if (!globalPanelsWrap.isConnected || globalPanelsWrap.parentElement !== toolOptionsGroup) {
    toolOptionsGroup.append(globalPanelsWrap, trackedMoveButton);
  } else if (!trackedMoveButton.isConnected || trackedMoveButton.parentElement !== toolOptionsGroup) {
    toolOptionsGroup.append(trackedMoveButton);
  }
  const controls = [
    [globalEffectsButton, "Condizioni", "conditions-panel.svg"],
    [globalSpellsButton, "Incantesimi", "spells-panel.svg"],
    [globalQuickHPButton, "Effetti", "quick-damage.svg"],
    [trackedMoveButton, "Movimento", "speed-panel.svg"],
  ];
  for (const [control, label, iconPath] of controls) {
    if (!globalPanelsWrap.contains(control) && control !== trackedMoveButton) {
      globalPanelsWrap.append(control);
    }
    if (!control.querySelector("img")) {
      const icon = document.createElement("img");
      icon.alt = "";
      control.prepend(icon);
    }
    const icon = control.querySelector("img");
    icon.src = `${import.meta.env.BASE_URL || "/"}${iconPath}`;
    icon.alt = "";
    icon.style.display = "block";
    icon.style.objectFit = "contain";
    icon.style.pointerEvents = "none";
    let caption = control.querySelector("[data-toolbar-caption='1']");
    if (!caption) {
      decorateToolbarControl(control, label);
      caption = control.querySelector("[data-toolbar-caption='1']");
    }
    if (caption) caption.textContent = label;
  }
}

const movementReadout = document.createElement("div");
Object.assign(movementReadout.style, {
  width: "calc(100% - 24px)",
  maxWidth: "440px",
  boxSizing: "border-box",
  display: "none",
  flexDirection: "column",
  gap: "6px",
  padding: "8px 12px",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: "12px",
  background: "linear-gradient(180deg, rgba(12,17,28,.64), rgba(7,11,19,.52))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 5px 14px rgba(0,0,0,.18)",
  color: "#fff",
  userSelect: "none",
  cursor: "pointer",
});
const movementReadoutLine = document.createElement("div");
Object.assign(movementReadoutLine.style, {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  fontSize: "11px",
});
const movementReadoutValue = document.createElement("strong");
Object.assign(movementReadoutValue.style, {
  flex: "1 1 auto",
  minWidth: "0",
  overflow: "hidden",
  fontSize: "14px",
  fontWeight: "700",
  fontVariantNumeric: "tabular-nums",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const movementModeTrigger = document.createElement("button");
movementModeTrigger.type = "button";
movementModeTrigger.setAttribute("aria-label", "Scegli modalità di movimento");
movementModeTrigger.setAttribute("aria-haspopup", "listbox");
movementModeTrigger.setAttribute("aria-expanded", "false");
Object.assign(movementModeTrigger.style, {
  display: "none",
  position: "absolute",
  inset: "0",
  width: "100%",
  height: "100%",
  margin: "0",
  padding: "0",
  border: "0",
  outline: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  zIndex: "2",
});
const movementModeCaret = document.createElement("span");
movementModeCaret.className = "obrt-select-caret";
Object.assign(movementModeCaret.style, {
  position: "absolute",
  right: "9px",
  bottom: "9px",
  pointerEvents: "none",
});
movementModeTrigger.appendChild(movementModeCaret);
const movementModeMenu = document.createElement("div");
movementModeMenu.setAttribute("role", "listbox");
movementModeMenu.setAttribute("aria-label", "Modalità di movimento");
Object.assign(movementModeMenu.style, {
  display: "none",
  position: "absolute",
  top: "calc(100% + 4px)",
  left: "0",
  right: "0",
  zIndex: "30",
  overflow: "hidden",
  padding: "4px",
  border: "1px solid rgba(148,163,184,.34)",
  borderRadius: "8px",
  background: "var(--obrt-select-bg, #0f172a)",
  boxShadow: "0 10px 24px rgba(0,0,0,.42)",
});
const movementReadoutMeta = document.createElement("span");
Object.assign(movementReadoutMeta.style, {
  flex: "0 0 auto",
  color: "rgba(255,255,255,.72)",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
const movementReadoutTrack = document.createElement("div");
Object.assign(movementReadoutTrack.style, {
  height: "4px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "rgba(0,0,0,.38)",
});
const movementReadoutBar = document.createElement("div");
Object.assign(movementReadoutBar.style, {
  width: "0%",
  height: "100%",
  borderRadius: "inherit",
  background: "#3b82f6",
  transition: "width 80ms linear, background-color 120ms ease",
});
movementReadoutTrack.appendChild(movementReadoutBar);
const movementCompactLimitControl = document.createElement("label");
movementCompactLimitControl.title = "Limita movimento";
Object.assign(movementCompactLimitControl.style, {
  display: "none",
  flex: "0 0 auto",
  alignItems: "center",
  justifyContent: "center",
  width: "16px",
  height: "16px",
  cursor: "pointer",
});
const movementCompactLimitCheckbox = document.createElement("input");
movementCompactLimitCheckbox.type = "checkbox";
movementCompactLimitCheckbox.setAttribute("aria-label", "Limita movimento alla disponibilità del turno");
Object.assign(movementCompactLimitCheckbox.style, {
  width: "13px",
  height: "13px",
  margin: "0",
  accentColor: "#3b82f6",
  cursor: "pointer",
});
movementCompactLimitControl.appendChild(movementCompactLimitCheckbox);
movementReadoutLine.append(
  movementReadoutValue,
  movementReadoutMeta,
  movementCompactLimitControl,
);
const movementDetails = document.createElement("div");
Object.assign(movementDetails.style, {
  display: "none",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px",
  paddingTop: "7px",
  borderTop: "1px solid rgba(255,255,255,.12)",
});
const movementDetailValues = {};
let movementSpeedCell = null;
for (const [key, label] of [
  ["speed", "Velocit\u00e0"],
  ["allowance", "Disponibile"],
  ["total", "Totale turno"],
  ["remaining", "Residuo"],
]) {
  const cell = document.createElement("div");
  Object.assign(cell.style, {
    minWidth: "0",
    padding: "5px 7px",
    border: "1px solid rgba(255,255,255,.11)",
    borderRadius: "6px",
    background: "rgba(255,255,255,.055)",
  });
  const caption = document.createElement("div");
  caption.textContent = label;
  Object.assign(caption.style, {
    color: "rgba(255,255,255,.58)",
    fontSize: "9px",
    textTransform: "uppercase",
  });
  const value = document.createElement("strong");
  Object.assign(value.style, {
    display: "block",
    overflow: "hidden",
    marginTop: "2px",
    fontSize: "11px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  movementDetailValues[key] = value;
  if (key === "speed") {
    movementSpeedCell = cell;
    cell.style.position = "relative";
    value.style.paddingRight = "18px";
    cell.append(caption, value, movementModeTrigger, movementModeMenu);
  } else {
    cell.append(caption, value);
  }
  movementDetails.appendChild(cell);
}
const movementAllowanceControls = document.createElement("div");
Object.assign(movementAllowanceControls.style, {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px",
});
function makeMovementStepper(label, onDecrease, onIncrease) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) 24px",
    alignItems: "center",
    gap: "4px",
    padding: "4px",
    border: "1px solid rgba(255,255,255,.11)",
    borderRadius: "6px",
    background: "rgba(255,255,255,.055)",
  });
  const decrease = document.createElement("button");
  const increase = document.createElement("button");
  const value = document.createElement("strong");
  decrease.type = increase.type = "button";
  decrease.textContent = "-";
  increase.textContent = "+";
  value.textContent = label;
  Object.assign(value.style, {
    overflow: "hidden",
    fontSize: "10px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  for (const button of [decrease, increase]) {
    Object.assign(button.style, {
      width: "24px",
      height: "24px",
      padding: "0",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "50%",
      background: "rgba(0,0,0,.28)",
      color: "#fff",
      fontSize: "15px",
      lineHeight: "1",
      cursor: "pointer",
    });
  }
  decrease.addEventListener("click", (event) => {
    event.stopPropagation();
    onDecrease();
  });
  increase.addEventListener("click", (event) => {
    event.stopPropagation();
    onIncrease();
  });
  wrap.append(decrease, value, increase);
  return { wrap, value };
}
const movementDashStepper = makeMovementStepper(
  "Scatto x0",
  () => adjustSpeedCheckDash(-1),
  () => adjustSpeedCheckDash(1),
);
const movementBonusStepper = makeMovementStepper(
  "Bonus 0 m",
  () => adjustSpeedCheckBonus(-1.5),
  () => adjustSpeedCheckBonus(1.5),
);
movementAllowanceControls.append(movementDashStepper.wrap, movementBonusStepper.wrap);
movementDetails.appendChild(movementAllowanceControls);
const movementResetButton = document.createElement("button");
movementResetButton.type = "button";
movementResetButton.textContent = "Reset movimento";
Object.assign(movementResetButton.style, {
  width: "100%",
  minWidth: "0",
  minHeight: "28px",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: "999px",
  background: "rgba(255,255,255,.09)",
  color: "#fff",
  font: "inherit",
  fontSize: "11px",
  fontWeight: "700",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "pointer",
  padding: "0 8px",
});
const movementActions = document.createElement("div");
Object.assign(movementActions.style, {
  gridColumn: "1 / -1",
  width: "100%",
  minWidth: "0",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  alignItems: "stretch",
  gap: "6px",
});
const movementLimitControl = document.createElement("label");
Object.assign(movementLimitControl.style, {
  width: "100%",
  minWidth: "0",
  minHeight: "28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "0 8px",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: "999px",
  background: "rgba(255,255,255,.09)",
  color: "#fff",
  fontSize: "11px",
  fontWeight: "700",
  cursor: "pointer",
  whiteSpace: "nowrap",
});
const movementLimitCheckbox = document.createElement("input");
movementLimitCheckbox.type = "checkbox";
movementLimitCheckbox.setAttribute("aria-label", "Limita movimento alla disponibilità del turno");
Object.assign(movementLimitCheckbox.style, {
  width: "14px",
  height: "14px",
  margin: "0",
  accentColor: "#3b82f6",
  cursor: "pointer",
});
const movementLimitLabel = document.createElement("span");
movementLimitLabel.textContent = "Limita movimento";
movementLimitControl.append(movementLimitCheckbox, movementLimitLabel);
movementActions.append(movementLimitControl, movementResetButton);
movementDetails.appendChild(movementActions);
movementReadout.append(movementReadoutLine, movementReadoutTrack, movementDetails);
topRow.appendChild(movementReadout);

let movementDetailsOpen = false;
movementReadout.addEventListener("click", () => {
  if (isCompactTrackerLayout()) {
    movementDetailsOpen = false;
    movementDetails.style.display = "none";
    return;
  }
  movementDetailsOpen = !movementDetailsOpen;
  movementDetails.style.display = movementDetailsOpen ? "grid" : "none";
});
movementResetButton.addEventListener("click", (event) => {
  event.stopPropagation();
  resetSpeedCheckMovement();
});
movementLimitControl.addEventListener("click", (event) => event.stopPropagation());
movementLimitCheckbox.addEventListener("change", () => {
  setSpeedCheckMovementLimit(movementLimitCheckbox.checked);
});
movementCompactLimitControl.addEventListener("click", (event) => event.stopPropagation());
movementCompactLimitCheckbox.addEventListener("change", () => {
  setSpeedCheckMovementLimit(movementCompactLimitCheckbox.checked);
});
let movementModeMenuOpen = false;
function setMovementModeMenuOpen(open, focusOption = false) {
  movementModeMenuOpen = open === true && movementModeMenu.childElementCount > 0;
  movementModeMenu.style.display = movementModeMenuOpen ? "block" : "none";
  movementModeTrigger.setAttribute("aria-expanded", movementModeMenuOpen ? "true" : "false");
  if (movementSpeedCell) {
    movementSpeedCell.style.borderColor = movementModeMenuOpen
      ? "rgba(96,165,250,.75)"
      : "rgba(255,255,255,.11)";
  }
  if (movementModeMenuOpen && focusOption) {
    const selected = movementModeMenu.querySelector("[aria-selected='true']");
    (selected || movementModeMenu.querySelector("[role='option']"))?.focus();
  }
}
movementModeTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  setMovementModeMenuOpen(!movementModeMenuOpen);
});
movementModeTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  event.stopPropagation();
  setMovementModeMenuOpen(true, true);
});
movementModeTrigger.addEventListener("focus", () => {
  if (movementSpeedCell) movementSpeedCell.style.borderColor = "rgba(96,165,250,.75)";
});
movementModeTrigger.addEventListener("blur", () => {
  if (!movementModeMenuOpen && movementSpeedCell) {
    movementSpeedCell.style.borderColor = "rgba(255,255,255,.11)";
  }
});
movementModeMenu.addEventListener("click", (event) => event.stopPropagation());
movementModeMenu.addEventListener("keydown", (event) => {
  const options = Array.from(movementModeMenu.querySelectorAll("[role='option']"));
  const currentIndex = options.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    setMovementModeMenuOpen(false);
    movementModeTrigger.focus();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const offset = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (Math.max(0, currentIndex) + offset + options.length) % options.length;
  options[nextIndex]?.focus();
});
document.addEventListener("click", (event) => {
  if (movementModeMenuOpen && !movementSpeedCell?.contains(event.target)) {
    setMovementModeMenuOpen(false);
  }
});

let latestMovementSnapshot = null;
let movementReadoutVisible = false;

function movementNumber(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function movementReadoutSummary(snapshot, compact = isCompactTrackerLayout()) {
  if (!snapshot) return "";
  return compact
    ? movementNumber(snapshot.totalMeters) + "/" + movementNumber(snapshot.allowanceMeters) + " m · (" + movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells) + ")"
    : movementNumber(snapshot.totalMeters) + " / " + movementNumber(snapshot.allowanceMeters) + " m · " + movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells) + " caselle";
}

function syncMovementModeSelect(snapshot) {
  const modes = Array.isArray(snapshot?.movementModes) ? snapshot.movementModes : [];
  const selectable = modes.length > 1;
  movementModeTrigger.style.display = selectable ? "block" : "none";
  if (movementSpeedCell) movementSpeedCell.style.cursor = selectable ? "pointer" : "default";
  if (modes.length <= 1) {
    setMovementModeMenuOpen(false);
    return;
  }
  const signature = modes
    .map((mode) => `${mode.id}:${mode.speedMeters}:${mode.blocked}`)
    .join("|");
  if (movementModeMenu.dataset.signature !== signature) {
    movementModeMenu.dataset.signature = signature;
    movementModeMenu.replaceChildren(...modes.map((mode) => {
      const option = document.createElement("button");
      option.type = "button";
      option.setAttribute("role", "option");
      option.dataset.mode = mode.id;
      option.textContent = `${mode.label} · ${movementNumber(mode.speedMeters)} m`;
      Object.assign(option.style, {
        width: "100%",
        minHeight: "28px",
        display: "block",
        padding: "5px 7px",
        border: "0",
        borderRadius: "5px",
        background: "transparent",
        color: "#fff",
        fontSize: "11px",
        fontWeight: "700",
        textAlign: "left",
        cursor: "pointer",
      });
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        setMovementModeMenuOpen(false);
        setSpeedCheckMovementMode(mode.id);
        movementModeTrigger.focus();
      });
      return option;
    }));
  }
  for (const option of movementModeMenu.querySelectorAll("[role='option']")) {
    const selected = option.dataset.mode === snapshot.activeMode;
    option.setAttribute("aria-selected", selected ? "true" : "false");
    option.style.background = selected ? "rgba(37,99,235,.42)" : "transparent";
  }
  movementModeTrigger.title = `Modalità attiva: ${snapshot.activeModeLabel}`;
}

subscribeSpeedCheckState((snapshot) => {
  const previousSnapshot = latestMovementSnapshot;
  latestMovementSnapshot = snapshot;
  queueMicrotask(() => updateActiveCardMovementIndicator(snapshot));
  movementReadoutVisible = shouldKeepSpeedReadoutOpen(snapshot, previousSnapshot);
  movementReadout.style.display = movementReadoutVisible && !isCompactTrackerLayout()
    ? "flex"
    : "none";
  if (!snapshot.available) return;
  movementReadoutValue.textContent = snapshot.name || "Movimento";
  movementReadoutMeta.textContent = movementReadoutSummary(snapshot);
  syncMovementModeSelect(snapshot);
  movementReadout.title = snapshot.name + ": " + movementNumber(snapshot.totalMeters) + " m totali nel turno; " + movementNumber(snapshot.remainingMeters) + " m al limite disponibile"
    + "; modalità " + snapshot.activeModeLabel
    + (snapshot.conditionSummary ? "; " + snapshot.conditionSummary : "");

  movementDetailValues.speed.textContent = snapshot.activeModeLabel + " · " + movementNumber(snapshot.speedMeters) + " m"
    + (snapshot.modeBaseSpeedMeters !== snapshot.speedMeters
      ? " (base " + movementNumber(snapshot.modeBaseSpeedMeters) + " m)"
      : "");
  movementDetailValues.allowance.textContent = movementNumber(snapshot.allowanceMeters) + " m";
  movementDetailValues.total.textContent = movementNumber(snapshot.totalMeters) + " m";
  movementDetailValues.remaining.textContent = movementNumber(snapshot.remainingMeters) + " m";

  movementDashStepper.value.textContent = "Scatto x" + snapshot.dashCount;
  movementBonusStepper.value.textContent = "Bonus " + movementNumber(snapshot.bonusMeters) + " m";
  movementLimitCheckbox.checked = snapshot.movementLimited === true;
  movementCompactLimitCheckbox.checked = snapshot.movementLimited === true;
  const percent = Math.max(0, Math.min(100, snapshot.progress * 100));
  movementReadoutBar.style.width = percent + "%";
  movementReadoutBar.style.background = snapshot.blocked || percent >= 99.9 ? "#ef4444" : percent >= 75 ? "#f59e0b" : "#3b82f6";
});

// wrapper della lista — l’UNICO che scrolla
const trackWrap = document.createElement("div");
trackWrap.style.flex = "1 1 auto";        // ← occupa tutto lo spazio rimanente
trackWrap.style.minHeight = "0";          // ← fondamentale in flex
trackWrap.style.overflow = "auto";        // ← unica scrollbar
trackWrap.style.overscrollBehavior = "contain";
trackWrap.style.overflowAnchor = "none";
trackWrap.style.padding = "0";
trackWrap.style.boxSizing = "border-box";
trackWrap.style.position = "relative";

// (rimuovi i vecchi limiti! niente maxHeight/minHeight qui)
// trackWrap.style.maxHeight = "575px";  // ← ELIMINATO
// trackWrap.style.minHeight = "120px";  // ← ELIMINATO

const track = document.createElement("div");
track.style.display = "flex";
track.style.position = "relative";
track.style.flexDirection = "column";
track.style.alignItems = "center";
track.style.gap = "6px";
track.style.paddingTop = "8px";
track.style.paddingBottom = "8px";
trackWrap.appendChild(track);

function updateActiveCardMovementIndicator() {
  track.querySelector('[data-speed-card-indicator="1"]')?.remove();
}

// === Drag & Drop per pareggi d'iniziativa (delegato sul track) ===
if (!track.__dndMounted) {
  track.__dndMounted = true;

track.addEventListener("dragstart", (ev) => {
  const card = ev.target.closest('[data-item-id]');
  if (!card) return;
  if (card.dataset.isEpic === "1") { ev.preventDefault(); return; }

  const init = card.dataset.initiative || "";
  const peers = track.querySelectorAll(`[data-initiative="${init}"]`);
  if (peers.length < 2) { ev.preventDefault(); return; } // drag solo se ci sono pari

  __draggingId   = card.dataset.itemId;
  __draggingInit = Number(init) || 0;
  __draggingWasCollapsed = card.dataset.groupCollapsed === "1";

  ev.dataTransfer?.setData?.("text/plain", __draggingId);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";

  card.style.opacity = ".6";
});

track.addEventListener("dragover", (ev) => {
  if (!__draggingId) return;
  const over = ev.target.closest('[data-item-id]');
  if (!over) return;
  // il target può essere collassato o meno, l’unico vincolo è la stessa iniziativa
  if (String(over.dataset.initiative || "") !== String(__draggingInit)) return;

  ev.preventDefault(); // abilita il drop
  const r = over.getBoundingClientRect();
  const horizontal = isCompactTrackerLayout();
  const before = horizontal
    ? ev.clientX < (r.left + r.width / 2)
    : ev.clientY < (r.top + r.height / 2);

  if (!over.dataset.dropHint) over.dataset.dropHint = "1";
  over.style.borderTop = horizontal ? "" : before ? "2px solid rgba(255,255,255,.85)" : "";
  over.style.borderBottom = horizontal ? "" : before ? "" : "2px solid rgba(255,255,255,.85)";
  over.style.borderLeft = horizontal && before ? "2px solid rgba(255,255,255,.85)" : "";
  over.style.borderRight = horizontal && !before ? "2px solid rgba(255,255,255,.85)" : "";
});

track.addEventListener("drop", async (ev) => {
  if (!__draggingId) return;
  const over = ev.target.closest('[data-item-id]');
  if (!over) return;
  if (String(over.dataset.initiative || "") !== String(__draggingInit)) return;

  ev.preventDefault();
  const r = over.getBoundingClientRect();
  const before = isCompactTrackerLayout()
    ? ev.clientX < (r.left + r.width / 2)
    : ev.clientY < (r.top + r.height / 2);

  const sourceId = __draggingId;
  const targetId = over.dataset.itemId;

  // pulizia hint e opacità
  const hinted = track.querySelectorAll('[data-drop-hint]');
  hinted.forEach(n => {
    n.style.borderTop = "";
    n.style.borderBottom = "";
    n.style.borderLeft = "";
    n.style.borderRight = "";
    delete n.dataset.dropHint;
  });
  const dragging = Array.from(track.querySelectorAll('[data-item-id]')).find((node) =>
    node.dataset.itemId === __draggingId
  );
  if (dragging) dragging.style.opacity = "";

  // Riordino: se sto trascinando un LEAD collassato, sposto tutto il blocco gruppo
  if (__draggingWasCollapsed) {
    await _reorderCollapsedGroupWithinSameInitiative(sourceId, targetId, before);
  } else {
    await _reorderWithinSameInitiative(sourceId, targetId, before);
  }

  __draggingId = null;
  __draggingInit = null;
  __draggingWasCollapsed = false;
});

track.addEventListener("dragend", () => {
  track.querySelectorAll('[data-drop-hint]').forEach((node) => {
    node.style.borderTop = "";
    node.style.borderBottom = "";
    node.style.borderLeft = "";
    node.style.borderRight = "";
    delete node.dataset.dropHint;
  });
  const dragging = Array.from(track.querySelectorAll('[data-item-id]'))
    .find((node) => node.dataset.itemId === __draggingId);
  if (dragging) dragging.style.opacity = "";
  __draggingId = null;
  __draggingInit = null;
  __draggingWasCollapsed = false;
});
}
// --- Toggle Lair (Azioni di Tana a iniziativa 20) ---
const lairToggleWrap = document.createElement("label");
Object.assign(lairToggleWrap.style, {
  position: "relative",
  width: "100%",
  minHeight: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "6px",
  padding: "0 7px",
  boxSizing: "border-box",
  background: "transparent",
  border: "1px solid rgba(148,163,184,.24)",
  borderRadius: "7px",
  userSelect: "none",
  cursor: "pointer",
});

const lairChk = document.createElement("input");
lairChk.type = "checkbox";
Object.assign(lairChk.style, {
  position: "static",
  width: "13px",
  height: "13px",
  margin: "0",
  opacity: "1",
  pointerEvents: "auto",
  accentColor: "#a78bfa",
});

const lairLbl = document.createElement("span");
lairLbl.textContent = "Tana";
Object.assign(lairLbl.style, {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "10px",
  fontWeight: "700",
  color: "rgba(255,255,255,.88)",
  pointerEvents: "none",
});

lairToggleWrap.append(lairChk, lairLbl);
lairToggleWrap.title = "Azioni di Tana";
lairToggleWrap.setAttribute("aria-label", lairToggleWrap.title);
lairToggleWrap.style.display = "none";

// inizializza lo stato visivo dal metadata
(async () => {
  const st = await getSceneState();
  lairChk.checked = !!st?.lairEnabled;
  setCompactToggleVisual(lairToggleWrap, lairChk.checked);
})();

lairChk.addEventListener("change", async (e) => {
  const enabled = !!e.target.checked;
  setCompactToggleVisual(lairToggleWrap, enabled);
  await setSceneState(prev => ({ ...(prev || {}), lairEnabled: enabled }));
  await reconcileStateWithItems();
  await renderAll();
});

zoomChk.addEventListener("change", async (e) => {
  const enabled = !!e.target.checked;
  setCompactToggleVisual(zoomToggleWrap, enabled);
  await setSceneState((previous) => ({
    ...(previous || {}),
    ui: { ...(previous?.ui || {}), autoFocus: enabled },
  }));
  await runtimeOptionsService.updateLocal((current) => ({
    ...current,
    tracker: { ...current.tracker, followActiveTurn: enabled },
  }));
});

const EFFECTS_DISPLAY_MODE_LABELS = Object.freeze({
  compact: "Pill compatte",
  all: "Pill espanse",
  selected: "Pill selezionate",
});
const EFFECTS_DISPLAY_MODE_VALUES = Object.freeze(["compact", "all", "selected"]);
const effectsDisplayModeControl = document.createElement("div");
Object.assign(effectsDisplayModeControl.style, {
  position: "relative",
  width: "100%",
  minHeight: "24px",
  display: "flex",
  alignItems: "center",
  gap: "2px",
  padding: "0 3px",
  boxSizing: "border-box",
  border: "1px solid rgba(148,163,184,.24)",
  borderRadius: "7px",
  background: "rgba(255,255,255,.045)",
  color: "rgba(255,255,255,.88)",
  cursor: "pointer",
  userSelect: "none",
  overflow: "hidden",
});
const effectsDisplayModeIcon = document.createElement("span");
effectsDisplayModeIcon.textContent = "☷";
effectsDisplayModeIcon.setAttribute("aria-hidden", "true");
Object.assign(effectsDisplayModeIcon.style, {
  display: "none",
  fontSize: "16px",
  lineHeight: "1",
  pointerEvents: "none",
});
const effectsDisplayModeValue = document.createElement("span");
effectsDisplayModeValue.setAttribute("aria-live", "polite");
Object.assign(effectsDisplayModeValue.style, {
  flex: "1 1 auto",
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "8px",
  fontWeight: "600",
  lineHeight: "1",
  textAlign: "center",
  pointerEvents: "none",
});
function buildEffectsDisplayModeArrow(symbol, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = symbol;
  button.title = label;
  button.setAttribute("aria-label", label);
  Object.assign(button.style, {
    flex: "0 0 16px",
    width: "16px",
    height: "20px",
    padding: "0",
    border: "0",
    borderRadius: "5px",
    background: "transparent",
    color: "rgba(255,255,255,.78)",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "18px",
    textAlign: "center",
    cursor: "pointer",
    userSelect: "none",
    transition: "background 140ms ease, color 140ms ease, transform 140ms ease",
  });
  button.addEventListener("pointerenter", () => {
    button.style.background = "rgba(96,165,250,.18)";
    button.style.color = "#ffffff";
  });
  button.addEventListener("pointerleave", () => {
    button.style.background = "transparent";
    button.style.color = "rgba(255,255,255,.78)";
  });
  button.addEventListener("pointerdown", () => {
    button.style.transform = "scale(.9)";
  });
  button.addEventListener("pointerup", () => {
    button.style.transform = "scale(1)";
  });
  return button;
}
const effectsDisplayModePreviousButton = buildEffectsDisplayModeArrow(
  "‹",
  "Vista pill precedente",
);
const effectsDisplayModeNextButton = buildEffectsDisplayModeArrow(
  "›",
  "Vista pill successiva",
);
effectsDisplayModeControl.append(
  effectsDisplayModeIcon,
  effectsDisplayModePreviousButton,
  effectsDisplayModeValue,
  effectsDisplayModeNextButton,
);
sceneOptionsGroup.append(effectsDisplayModeControl);

function normalizeEffectsDisplayModeControlValue(value) {
  return EFFECTS_DISPLAY_MODE_VALUES.includes(value) ? value : "selected";
}

function updateEffectsDisplayModeControl(value) {
  const mode = normalizeEffectsDisplayModeControlValue(value);
  effectsDisplayModeControl.dataset.mode = mode;
  effectsDisplayModeValue.textContent = EFFECTS_DISPLAY_MODE_LABELS[mode];
  effectsDisplayModeControl.title = `Vista pill: ${EFFECTS_DISPLAY_MODE_LABELS[mode]}`;
  effectsDisplayModeControl.setAttribute(
    "aria-label",
    `Vista pill: ${EFFECTS_DISPLAY_MODE_LABELS[mode]}`,
  );
  const currentIndex = EFFECTS_DISPLAY_MODE_VALUES.indexOf(mode);
  const previousMode = EFFECTS_DISPLAY_MODE_VALUES[
    (currentIndex - 1 + EFFECTS_DISPLAY_MODE_VALUES.length)
      % EFFECTS_DISPLAY_MODE_VALUES.length
  ];
  const nextMode = EFFECTS_DISPLAY_MODE_VALUES[
    (currentIndex + 1) % EFFECTS_DISPLAY_MODE_VALUES.length
  ];
  effectsDisplayModePreviousButton.title = `Passa a ${EFFECTS_DISPLAY_MODE_LABELS[previousMode]}`;
  effectsDisplayModePreviousButton.setAttribute("aria-label", effectsDisplayModePreviousButton.title);
  effectsDisplayModeNextButton.title = `Passa a ${EFFECTS_DISPLAY_MODE_LABELS[nextMode]}`;
  effectsDisplayModeNextButton.setAttribute("aria-label", effectsDisplayModeNextButton.title);
}

function persistEffectsDisplayMode(value) {
  if (!IS_GM) return;
  const mode = normalizeEffectsDisplayModeControlValue(value);
  updateEffectsDisplayModeControl(mode);
  void runtimeOptionsService.updateRoom((current) => ({
    ...current,
    uiSync: { ...current.uiSync, effectsDisplayMode: mode },
  })).then(() => broadcastRuntimeOptionsInvalidation("effects-display-mode", { scope: "shared" }))
    .catch((error) => {
      console.warn("[effects-display-mode] preferenza non salvata:", error?.message || error);
    });
}

function stepEffectsDisplayMode(direction) {
  const currentMode = normalizeEffectsDisplayModeControlValue(effectsDisplayModeControl.dataset.mode);
  const currentIndex = EFFECTS_DISPLAY_MODE_VALUES.indexOf(currentMode);
  const nextIndex = (currentIndex + direction + EFFECTS_DISPLAY_MODE_VALUES.length)
    % EFFECTS_DISPLAY_MODE_VALUES.length;
  persistEffectsDisplayMode(EFFECTS_DISPLAY_MODE_VALUES[nextIndex]);
}

effectsDisplayModePreviousButton.addEventListener("click", (event) => {
  event.stopPropagation();
  stepEffectsDisplayMode(-1);
});
effectsDisplayModeNextButton.addEventListener("click", (event) => {
  event.stopPropagation();
  stepEffectsDisplayMode(1);
});

// Inserisci il toggle tra Turno e Lista
const compactNavigationRow = document.createElement("div");
const classicNavigationRow = document.createElement("div");
const compactRoundControls = document.createElement("div");
const compactBottomControls = document.createElement("div");
const compactHeaderRow = document.createElement("div");
Object.assign(compactHeaderRow.style, {
  position: "absolute",
  top: "2px",
  left: "0",
  right: "0",
  height: "30px",
  zIndex: "20",
  pointerEvents: "none",
});
const compactAdminMenu = document.createElement("div");
const compactMoreButton = mkBtn("…");
const COMPACT_ADMIN_MENU_ID = `${ID}/compact-admin-menu`;
const COMPACT_ADMIN_MENU_CHANNEL = `${ID}/compact-admin-menu`;
const COMPACT_ADMIN_MENU_WIDTH = 216;
const COMPACT_ADMIN_MENU_HEIGHT = 220;
let __compactAdminMenuOpen = false;
let __compactAdminMenuRequestId = "";
let __compactAdminMenuRevision = 0;

compactMoreButton.title = "Altre azioni del tracker";
compactMoreButton.setAttribute("aria-label", compactMoreButton.title);
compactMoreButton.setAttribute("aria-haspopup", "menu");
compactMoreButton.setAttribute("aria-expanded", "false");
compactAdminMenu.setAttribute("role", "menu");
compactAdminMenu.setAttribute("aria-label", "Altre azioni del tracker");
compactAdminMenu.style.display = "none";

function __closeCompactAdminMenu() {
  __compactAdminMenuRevision += 1;
  __compactAdminMenuOpen = false;
  __compactAdminMenuRequestId = "";
  compactAdminMenu.style.display = "none";
  compactMoreButton.setAttribute("aria-expanded", "false");
  return OBR.popover.close(COMPACT_ADMIN_MENU_ID).catch(() => {});
}

async function __getCompactAdminMenuPlacement() {
  let viewportWidth = 1200;
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  const trackerAnchor = await getCompactTrackerPopoverAnchor();
  const trackerOrigin = __compactTrackerFrameOrigin(trackerAnchor);
  const buttonRect = compactMoreButton.getBoundingClientRect();
  const buttonLeft = trackerOrigin.left + buttonRect.left;
  const buttonRight = trackerOrigin.left + buttonRect.right;
  const buttonBottom = trackerOrigin.top + buttonRect.bottom;
  const openRight = buttonRight + 8 + COMPACT_ADMIN_MENU_WIDTH <= viewportWidth - 12;

  return {
    anchorPosition: {
      left: Math.round(openRight ? buttonRight + 8 : buttonLeft - 8),
      top: Math.round(buttonBottom),
    },
    anchorOrigin: {
      horizontal: openRight ? "LEFT" : "RIGHT",
      vertical: "BOTTOM",
    },
    transformOrigin: {
      horizontal: openRight ? "LEFT" : "RIGHT",
      vertical: "BOTTOM",
    },
  };
}

function __openCompactAdminMenu() {
  if (!IS_GM || !isCompactTrackerLayout()) return;
  const closePromise = __closeCompactAdminMenu();
  const openRevision = __compactAdminMenuRevision;
  const requestId = createMenuRequestId();
  __compactAdminMenuRequestId = requestId;

  void (async () => {
    await closePromise;
    if (__compactAdminMenuRevision !== openRevision ||
        __compactAdminMenuRequestId !== requestId) return;
    const placement = await __getCompactAdminMenuPlacement();
    if (__compactAdminMenuRequestId !== requestId) return;
    await OBR.popover.open({
      id: COMPACT_ADMIN_MENU_ID,
      url: `/compact-admin-menu.html?request=${encodeURIComponent(requestId)}`,
      width: COMPACT_ADMIN_MENU_WIDTH,
      height: COMPACT_ADMIN_MENU_HEIGHT,
      anchorReference: "POSITION",
      ...placement,
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    __compactAdminMenuOpen = true;
    compactMoreButton.setAttribute("aria-expanded", "true");
  })().catch((error) => {
    console.warn("[compact-admin-menu] apertura fallita:", error?.message || error);
    __closeCompactAdminMenu();
  });
}

function setCompactAdminMenuOpen(open) {
  const visible = !!open && isCompactTrackerLayout();
  if (visible) __openCompactAdminMenu();
  else void __closeCompactAdminMenu();
}

compactMoreButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setCompactAdminMenuOpen(compactMoreButton.getAttribute("aria-expanded") !== "true");
});
document.addEventListener("pointerdown", (event) => {
  if (__compactAdminMenuOpen && !compactMoreButton.contains(event.target)) {
    setCompactAdminMenuOpen(false);
  }
});

function mountCompactAdminMenuListener() {
  OBR.broadcast.onMessage(COMPACT_ADMIN_MENU_CHANNEL, (event) => {
    const data = event?.data;
    if (!isMenuMessageForRequest(data, __compactAdminMenuRequestId)) return;
    if (data.type === "close") {
      void __closeCompactAdminMenu();
      return;
    }
    const route = resolveCompactAdminMenuAction(data);
    if (!route) return;

    const control = compactAdminMenu.querySelector(route.selector);
    const closePromise = __closeCompactAdminMenu();
    if (control instanceof HTMLButtonElement) {
      void closePromise.then(() => control.click());
    }
  });
}

function applyEncounterCheckboxPresentation(compact) {
  const classic = !compact;
  Object.assign(sceneOptionsGroup.style, {
    width: "100%",
    minWidth: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: classic ? "center" : "flex-start",
    gap: classic ? "3px" : "4px",
  });

  for (const [wrap, input, label] of [
    [zoomToggleWrap, zoomChk, zoomLbl],
    [lairToggleWrap, lairChk, lairLbl],
  ]) {
    Object.assign(wrap.style, {
      width: "100%",
      minWidth: "0",
      maxWidth: "100%",
      height: "24px",
      minHeight: "24px",
      padding: "0 7px",
      flexDirection: "row",
      justifyContent: "flex-start",
      gap: "6px",
      borderRadius: "7px",
      boxSizing: "border-box",
      overflow: "hidden",
    });
    Object.assign(input.style, {
      position: "static",
      width: "13px",
      height: "13px",
      margin: "0",
      opacity: "1",
      pointerEvents: "auto",
      flex: "0 0 auto",
    });
    Object.assign(label.style, {
      display: "block",
      maxWidth: "100%",
      fontSize: "8px",
      fontWeight: "600",
      lineHeight: "1",
      textAlign: "left",
    });
  }

  setCompactToggleVisual(zoomToggleWrap, zoomChk.checked);
  setCompactToggleVisual(lairToggleWrap, lairChk.checked);
}

function applyEffectsDisplayModeControlPresentation(compact) {
  if (compact) {
    Object.assign(effectsDisplayModeControl.style, {
      position: "relative",
      width: "26px",
      minWidth: "26px",
      maxWidth: "26px",
      height: "26px",
      minHeight: "26px",
      padding: "0",
      justifyContent: "center",
      gap: "0",
      borderRadius: "9px",
      background: "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
    });
    effectsDisplayModeIcon.style.display = "inline";
    effectsDisplayModeIcon.style.fontSize = "10px";
    effectsDisplayModeValue.style.display = "none";
    for (const button of [effectsDisplayModePreviousButton, effectsDisplayModeNextButton]) {
      Object.assign(button.style, {
        display: "block",
        flex: "0 0 7px",
        width: "7px",
        height: "22px",
        fontSize: "11px",
        lineHeight: "20px",
      });
    }
    return;
  }

  Object.assign(effectsDisplayModeControl.style, {
    position: "relative",
    width: "100%",
    minWidth: "0",
    maxWidth: "100%",
    height: "24px",
    minHeight: "24px",
    padding: "0 3px",
    justifyContent: "flex-start",
    gap: "2px",
    borderRadius: "7px",
    background: "rgba(255,255,255,.045)",
  });
  effectsDisplayModeIcon.style.display = "none";
  effectsDisplayModeIcon.style.fontSize = "16px";
  effectsDisplayModeValue.style.display = "inline";
  for (const button of [effectsDisplayModePreviousButton, effectsDisplayModeNextButton]) {
    Object.assign(button.style, {
      display: "block",
      flex: "0 0 16px",
      width: "16px",
      height: "20px",
      fontSize: "15px",
      lineHeight: "18px",
    });
  }
}

function placeEffectsDisplayModeControl(compact) {
  if (compact) {
    if (IS_GM && effectsDisplayModeControl.parentElement !== sceneOptionsGroup) {
      sceneOptionsGroup.append(effectsDisplayModeControl);
    }
  } else if (IS_GM) {
    const controls = [zoomToggleWrap];
    if (lairToggleWrap.isConnected) controls.push(lairToggleWrap);
    controls.push(effectsDisplayModeControl);
    sceneOptionsGroup.append(...controls);
  }
  applyEffectsDisplayModeControlPresentation(false);
}

function applyToolbarLayoutPresentation(compact) {
  ensureGlobalPanelControls();
  applyToolbarLayoutPresentationView(compact, {
    isGM: IS_GM,
    viewOptionsRow,
    encounterToolbar,
    trackersToolbar,
    sceneOptionsGroup,
    toolOptionsGroup,
    globalPanelsWrap,
  });
  encounterToolbar.heading.style.display = "none";
  trackersToolbar.heading.style.display = "none";
  viewOptionsRow.style.minHeight = compact ? "0" : "58px";
  applyEncounterCheckboxPresentation(compact);
  placeEffectsDisplayModeControl(compact);
}

function ensureAdminMenuLabel(control, text) {
  if (!control) return null;
  let label = control.querySelector("[data-admin-menu-label='1']");
  if (!label) {
    label = document.createElement("span");
    label.dataset.adminMenuLabel = "1";
    control.appendChild(label);
  }
  label.textContent = text;
  Object.assign(label.style, {
    flex: "1 1 auto",
    minWidth: "0",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    textAlign: "left",
    pointerEvents: "none",
    fontSize: "10px",
    fontWeight: "700",
  });
  return label;
}

function applyAdminMenuPresentation(compact) {
  Object.assign(compactAdminMenu.style, {
    position: "absolute",
    left: compact ? "calc(100% + 8px)" : "auto",
    right: compact ? "auto" : "0",
    top: compact ? "auto" : "calc(100% + 6px)",
    bottom: compact ? "0" : "auto",
    zIndex: "40",
    width: compact ? "184px" : "178px",
    maxHeight: compact ? "168px" : "none",
    overflowX: "hidden",
    overflowY: compact ? "auto" : "visible",
    gridTemplateColumns: "1fr",
    gridTemplateRows: "",
    alignItems: "stretch",
    justifyItems: "stretch",
    justifyContent: "stretch",
    gap: "3px",
    padding: "6px",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.32)",
    borderRadius: "12px",
    background: "rgba(13,18,27,.98)",
    boxShadow: "0 12px 30px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
  });

  const entries = [
    [roundResetSlot.querySelector("button"), "Reset round", false],
    ...(compact ? [[roundHistorySlot.querySelector("[data-history='1']"), "Cronologia", false]] : []),
    [roundActions.querySelector("[data-add-all-initiative='1']"), "Aggiungi attori", false],
    [roundActions.querySelector("[data-fill-initiative='1']"), "Compila iniziativa", false],
    [roundHistorySlot.querySelector("[data-options-panel='1']"), "Opzioni", false],
    [roundActions.querySelector("[data-clear-initiative='1']"), "Svuota iniziativa", true],
  ];

  roundPill.querySelectorAll("[data-admin-menu-label='1']").forEach((label) => {
    label.style.display = compactAdminMenu.contains(label.parentElement) ? "block" : "none";
  });

  for (const [control, text, danger] of entries) {
    if (!control) continue;
    const label = ensureAdminMenuLabel(control, text);
    const inMenu = compactAdminMenu.contains(control);
    label.style.display = inMenu ? "block" : "none";
    if (!inMenu) continue;
    Object.assign(control.style, {
      width: "100%",
      minWidth: "0",
      maxWidth: "none",
      height: compact ? "28px" : "30px",
      minHeight: compact ? "28px" : "30px",
      gridColumn: "1",
      gridRow: "auto",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "8px",
      padding: "0 9px",
      borderRadius: "8px",
      textAlign: "left",
      border: danger ? "1px solid rgba(248,113,113,.42)" : "1px solid rgba(148,163,184,.20)",
      background: danger
        ? "linear-gradient(180deg, rgba(127,29,29,.78), rgba(69,10,10,.72))"
        : "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
    });
    const icon = control.querySelector("img");
    if (icon) {
      icon.style.width = "16px";
      icon.style.height = "16px";
      icon.style.flex = "0 0 16px";
    }
  }

  roundResetSlot.style.display = compactAdminMenu.contains(roundResetSlot) ? "contents" : "inline-flex";
  roundHistorySlot.style.display = compactAdminMenu.contains(roundHistorySlot) ? "contents" : "inline-flex";
  roundActions.style.display = compactAdminMenu.contains(roundActions) ? "contents" : "flex";
}

function applyClassicRoundButtonColors() {
  const styles = [
    [roundPill.querySelector('[data-reset-round="1"]'), {
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(0,0,0,.45)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    }],
    [roundPill.querySelector('[data-add-all-initiative="1"]'), {
      border: "1px solid rgba(74,222,128,.68)",
      background: "rgba(21,128,61,.62)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    }],
    [roundPill.querySelector('[data-options-panel="1"]'), {
      border: "1px solid rgba(147,197,253,.55)",
      background: "rgba(30,64,175,.48)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    }],
    [roundPill.querySelector('[data-clear-initiative="1"]'), {
      border: "1px solid rgba(248,113,113,.55)",
      background: "rgba(127,29,29,.55)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    }],
    [roundPill.querySelector('[data-history="1"]'), {
      border: "1px solid rgba(147,197,253,.62)",
      background: "rgba(30,64,175,.58)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    }],
  ];
  for (const [button, buttonStyle] of styles) {
    if (button) Object.assign(button.style, buttonStyle);
  }
  updateInitiativeFillButton();
}

function applyHeaderLayoutPresentation(compact) {
  const classic = !compact;
  roundPill.style.gap = classic ? "3px" : "4px";
  roundPill.style.overflow = classic ? "hidden" : "visible";
  roundStatus.style.flex = classic ? "1 1 72px" : "0 0 auto";
  roundStatus.style.width = "auto";
  roundStatus.style.minWidth = classic ? "70px" : "0";
  roundStatus.style.overflow = classic ? "hidden" : "visible";
  roundStatus.style.flexDirection = "row";
  roundStatus.style.justifyContent = classic ? "flex-start" : "center";
  roundStatus.style.gap = classic ? "4px" : "3px";
  roundStatus.style.paddingBottom = "0";
  roundStatus.style.borderBottom = "none";
  roundLabel.style.fontSize = classic ? "15px" : "13px";
  roundLabel.style.whiteSpace = "nowrap";
  roundActions.style.width = classic ? "auto" : "100%";
  roundActions.style.display = classic ? "flex" : "contents";
  roundActions.style.gridColumn = compact ? "1" : "auto";
  roundActions.style.flexWrap = "nowrap";
  roundActions.style.justifyContent = classic ? "flex-start" : "center";
  roundActions.style.gap = "3px";
  Object.assign(roundResetSlot.style, {
    display: classic ? "inline-flex" : "contents",
    gridColumn: compact ? "1" : "auto",
    paddingRight: classic ? "3px" : "0",
    paddingTop: "0",
    borderRight: classic ? "1px solid rgba(148,163,184,.24)" : "none",
    borderTop: "none",
  });
  Object.assign(roundHistorySlot.style, {
    display: compact ? "contents" : "inline-flex",
    paddingLeft: compact ? "0" : "2px",
    borderLeft: "none",
  });

  roundPill.querySelectorAll("button").forEach((button) => {
    if (movementReadout.contains(button)) return;
    const primary = button === btnPrev || button === btnNext || button === compactMoreButton;
    const admin = compactAdminMenu.contains(button);
    button.style.width = classic ? (button === layoutToggleButton ? "66px" : "26px") : admin ? "30px" : "26px";
    button.style.minWidth = compact ? (admin ? "30px" : "26px") : "";
    button.style.maxWidth = "";
    button.style.height = classic ? "28px" : admin ? "30px" : "26px";
    button.style.minHeight = compact ? (admin ? "30px" : "26px") : "";
    button.style.borderRadius = classic ? "10px" : "9px";
    button.style.gridColumn = "";
    button.style.gridRow = "";
    button.style.justifyContent = "center";
    button.style.gap = "";
    button.style.padding = "0";
    button.tabIndex = primary || admin ? 0 : button.tabIndex;
  });

  for (const button of [trackerDragHandle, layoutToggleButton, compactMoreButton]) {
    Object.assign(button.style, {
      marginLeft: compact ? "0" : (button === layoutToggleButton ? "4px" : "0"),
      marginRight: compact ? "0" : (button === layoutToggleButton ? "4px" : "0"),
      alignSelf: "center",
      justifySelf: "center",
      boxSizing: "border-box",
    });
  }

  Object.assign(trackerDragHandle.style, {
    display: compact ? "flex" : "none",
    width: compact ? "26px" : "",
    minWidth: compact ? "26px" : "",
    height: compact ? "26px" : "",
    justifyContent: "center",
    padding: "0",
    border: compact ? "none" : "1px solid rgba(148,163,184,.28)",
    background: compact ? "transparent" : "rgba(0,0,0,.34)",
    boxShadow: compact ? "none" : "",
  });
  Object.assign(layoutToggleButton.style, classic ? {
    width: "28px",
    minWidth: "28px",
    height: "28px",
    padding: "0",
    gap: "0",
    justifyContent: "center",
    border: "1px solid rgba(96,165,250,.52)",
    background: "linear-gradient(180deg, rgba(37,99,235,.34), rgba(30,64,175,.22))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.10)",
    color: "#dbeafe",
    fontSize: "9px",
  } : {
    width: "26px",
    minWidth: "26px",
    height: "26px",
    padding: "0",
    gap: "0",
    justifyContent: "center",
    border: "1px solid rgba(148,163,184,.24)",
    background: "rgba(8,12,21,.72)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
    color: "#fff",
    fontSize: "9px",
  });
  layoutToggleIcon.style.width = classic ? "16px" : "15px";
  layoutToggleIcon.style.height = classic ? "16px" : "15px";
  if (compact) {
    applyAdminMenuPresentation(true);
  } else {
    roundPill.querySelectorAll("[data-admin-menu-label='1']").forEach((label) => {
      label.style.display = "none";
    });
  }

  if (compact) {
    btnPrev.textContent = "◀";
    btnNext.textContent = "▶";
    btnPrev.title = "Turno precedente";
    btnNext.title = "Turno successivo";
    btnPrev.setAttribute("aria-label", btnPrev.title);
    btnNext.setAttribute("aria-label", btnNext.title);
    Object.assign(btnNext.style, {
      border: "1px solid rgba(96,165,250,.86)",
      background: "linear-gradient(180deg, rgba(37,99,235,.92), rgba(30,64,175,.82))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.18), 0 4px 10px rgba(30,64,175,.28)",
    });
    Object.assign(btnPrev.style, {
      border: "1px solid rgba(148,163,184,.28)",
      background: "rgba(255,255,255,.055)",
      boxShadow: "none",
    });
  }
  if (classic) applyClassicRoundButtonColors();
}

function mountCompactSideControls() {
  setCompactAdminMenuOpen(false);
  roundStatus.remove();
  compactHeaderRow.replaceChildren();
  if (IS_GM) {
    compactAdminMenu.replaceChildren(roundResetSlot, roundHistorySlot, roundActions);
    compactBottomControls.replaceChildren(layoutToggleButton, compactMoreButton);
  } else {
    compactAdminMenu.replaceChildren();
    compactBottomControls.replaceChildren(layoutToggleButton);
  }
  compactRoundControls.replaceChildren(trackerDragHandle, compactBottomControls);
  roundPill.replaceChildren(compactRoundControls, compactAdminMenu);
}

function restoreClassicHeader() {
  setCompactAdminMenuOpen(false);
  compactHeaderRow.replaceChildren();
  compactAdminMenu.replaceChildren();
  compactBottomControls.replaceChildren();
  compactRoundControls.replaceChildren(compactMoreButton);
  roundPill.replaceChildren(
    roundResetSlot,
    roundStatus,
    layoutToggleButton,
    roundActions,
    roundHistorySlot,
    trackerDragHandle,
  );
  topRow.replaceChildren(roundPill, viewOptionsRow, movementReadout);
}
function applyTrackerLayout() {
  const compact = isCompactTrackerLayout();
  container.dataset.trackerLayout = compact
    ? TRACKER_LAYOUT_COMPACT
    : TRACKER_LAYOUT_CLASSIC;
  const glassRoot = container.closest("[data-glass-popover='1']");
  if (glassRoot) glassRoot.dataset.trackerLayout = container.dataset.trackerLayout;

  if (compact) {
    mountCompactSideControls();
    Object.assign(col.style, {
      position: "relative",
      flexDirection: "row",
      alignItems: "stretch",
      gap: "2px",
      padding: "2px",
      boxSizing: "border-box",
      border: "1px solid var(--obrt-popover-border, rgba(255,255,255,.16))",
      borderRadius: "16px",
      backgroundColor: "var(--obrt-popover-glass, rgba(42,47,64,.62))",
      backgroundImage: "var(--obrt-tracker-frost-image, none)",
      boxShadow: "0 8px 20px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.05)",
    });
    Object.assign(topRow.style, {
      flex: "0 0 auto",
      width: "100%",
      gap: "3px",
      padding: "0",
      paddingBottom: "0",
      border: "0",
      borderRadius: "0",
      background: "transparent",
      backdropFilter: "none",
      WebkitBackdropFilter: "none",
      boxShadow: "none",
    });
    Object.assign(roundPill.style, {
      position: "relative",
      flex: "0 0 48px",
      width: "48px",
      maxWidth: "48px",
      height: "100%",
      minHeight: "0",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "5px",
      padding: "6px 4px",
      boxSizing: "border-box",
      borderRadius: "11px",
      background: "linear-gradient(180deg, rgba(39,48,61,.92), rgba(22,29,40,.92))",
    });
    Object.assign(compactRoundControls.style, {
      width: "100%",
      height: "100%",
      flex: "1 1 auto",
      display: "grid",
      gridTemplateColumns: "26px",
      gridTemplateRows: "26px minmax(0, 1fr)",
      placeItems: "center",
      justifyContent: "center",
      gap: "0",
    });
    Object.assign(compactBottomControls.style, {
      width: "26px",
      height: "100%",
      minHeight: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "6px",
    });
    Object.assign(compactAdminMenu.style, {
      position: "absolute",
      left: "calc(100% + 8px)",
      bottom: "0",
      zIndex: "40",
      width: "150px",
      maxHeight: "none",
      overflow: "visible",
      gridTemplateColumns: "repeat(4, 30px)",
      gridTemplateRows: "repeat(2, 30px)",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
      padding: "7px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.32)",
      borderRadius: "12px",
      background: "rgba(13,18,27,.98)",
      boxShadow: "0 12px 30px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.07)",
    });
    Object.assign(movementReadout.style, {
      position: "absolute",
      left: "calc(50% + 52px)",
      top: "3px",
      width: "180px",
      maxWidth: "calc(50% - 58px)",
      minWidth: "0",
      flex: "0 1 auto",
      gap: "3px",
      padding: "3px 8px",
      borderRadius: "10px",
      fontSize: "9px",
      textAlign: "center",
      cursor: "default",
      pointerEvents: "auto",
    });
    movementDetailsOpen = false;
    movementDetails.style.display = "none";
    movementReadoutValue.style.display = "none";
    movementCompactLimitControl.style.display = IS_GM ? "inline-flex" : "none";
    movementReadoutMeta.textContent = movementReadoutSummary(latestMovementSnapshot, true);
    movementReadoutLine.style.justifyContent = "center";
    Object.assign(movementReadoutMeta.style, {
      flex: "1 1 auto",
      minWidth: "0",
      width: "100%",
      overflow: "hidden",
      fontSize: "9px",
      textAlign: "center",
      textOverflow: "ellipsis",
    });
    Object.assign(compactNavigationRow.style, {
      flex: "1 1 auto",
      minHeight: "0",
      width: "auto",
      display: "flex",
      alignItems: "stretch",
      gap: "3px",
      overflow: "hidden",
    });
    trackWrap.dataset.compactScroll = "1";
    Object.assign(trackWrap.style, {
      flex: "1 1 auto",
      minWidth: "0",
      minHeight: "0",
      overflowX: "auto",
      overflowY: "hidden",
      padding: "0",
      scrollBehavior: "smooth",
      overscrollBehavior: "contain",
    });
    Object.assign(track.style, {
      minWidth: "100%",
      minHeight: "100%",
      width: "max-content",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
      padding: "2px 7px 4px",
      boxSizing: "border-box",
    });
    for (const [button, text, label, primary] of [
      [btnPrev, "‹", "Turno precedente", false],
      [btnNext, "›", "Turno successivo", true],
    ]) {
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.tabIndex = 0;
      Object.assign(button.style, {
        flex: "0 0 28px",
        width: "28px",
        minWidth: "28px",
        height: "100%",
        minHeight: "28px",
        padding: "0",
        border: primary ? "1px solid rgba(96,165,250,.82)" : "1px solid transparent",
        borderRadius: "10px",
        background: primary
          ? "linear-gradient(180deg, rgba(37,99,235,.90), rgba(30,64,175,.78))"
          : "rgba(8,12,21,.28)",
        boxShadow: primary ? "inset 0 1px 0 rgba(255,255,255,.16)" : "none",
        fontSize: "24px",
      });
    }
    compactNavigationRow.replaceChildren(
      ...(IS_GM ? [btnPrev, trackWrap, btnNext] : [trackWrap]),
    );
    col.replaceChildren(compactHeaderRow, roundPill, compactNavigationRow, viewOptionsRow);
  } else {
    restoreClassicHeader();
    delete trackWrap.dataset.compactScroll;
    Object.assign(movementReadout.style, {
      position: "static",
      left: "",
      top: "",
      width: "calc(100% - 24px)",
      maxWidth: "440px",
      minWidth: "",
      flex: "",
      pointerEvents: "auto",
      gap: "6px",
      padding: "8px 12px",
      borderRadius: "12px",
      textAlign: "left",
      cursor: "pointer",
    });
    movementReadoutValue.style.display = "block";
    movementCompactLimitControl.style.display = "none";
    movementReadoutMeta.textContent = movementReadoutSummary(latestMovementSnapshot, false);
    movementReadoutLine.style.justifyContent = "space-between";
    Object.assign(movementReadoutMeta.style, {
      flex: "0 0 auto",
      minWidth: "",
      width: "auto",
      overflow: "visible",
      fontSize: "",
      textAlign: "left",
      textOverflow: "clip",
    });
    Object.assign(col.style, {
      position: "static",
      flexDirection: "column",
      alignItems: "stretch",
      gap: "5px",
      padding: "0",
      border: "none",
      borderRadius: "0",
      background: "transparent",
      boxShadow: "none",
    });
    Object.assign(topRow.style, {
      flex: "0 0 auto",
      width: "calc(100% - 12px)",
      gap: "5px",
      padding: "4px",
      paddingBottom: "4px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.25)",
      borderRadius: "16px",
      background: "linear-gradient(180deg, rgba(25,25,27,.88), rgba(13,15,20,.84))",
      boxShadow: "0 14px 34px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.07)",
    });
    Object.assign(roundPill.style, {
      position: "relative",
      flex: "1 1 auto",
      width: "100%",
      maxWidth: "none",
      height: "auto",
      minHeight: "46px",
      flexDirection: "row",
      justifyContent: "flex-start",
      padding: "4px 6px",
      borderRadius: "12px",
      background: "linear-gradient(180deg, rgba(14,19,31,.82), rgba(8,12,21,.76))",
    });
    Object.assign(trackWrap.style, {
      flex: "1 1 auto",
      minWidth: "",
      minHeight: "0",
      overflow: "auto",
      padding: "0",
      scrollBehavior: "",
      overscrollBehavior: "",
    });
    Object.assign(track.style, {
      minWidth: "",
      minHeight: "",
      width: "",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "",
      gap: "6px",
      padding: "6px 0",
    });
    Object.assign(classicNavigationRow.style, {
      flex: "0 0 30px",
      alignSelf: "center",
      width: "calc(100% - 12px)",
      height: "30px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "4px",
      padding: "2px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.20)",
      borderRadius: "10px",
      background: "rgba(9,13,21,.44)",
    });
    classicNavigationRow.style.display = IS_GM ? "grid" : "none";
    for (const [button, text, label, primary] of [
      [btnPrev, "▲", "Turno precedente", false],
      [btnNext, "▼", "Turno successivo", true],
    ]) {
      button.textContent = text;
      button.title = label;
      button.setAttribute("aria-label", label);
      Object.assign(button.style, {
        flex: "",
        width: "100%",
        minWidth: "",
        height: "26px",
        minHeight: "",
        padding: "0 6px",
        border: primary ? "1px solid rgba(96,165,250,.58)" : "1px solid transparent",
        borderRadius: "8px",
        background: primary ? "rgba(37,99,235,.34)" : "transparent",
        boxShadow: primary ? "inset 0 1px 0 rgba(255,255,255,.10)" : "none",
        fontSize: "15px",
      });
    }
    classicNavigationRow.replaceChildren(...(IS_GM ? [btnPrev, btnNext] : []));
    col.replaceChildren(topRow, trackWrap, classicNavigationRow);
  }
  movementReadout.style.display = movementReadoutVisible && !compact ? "flex" : "none";
  applyHeaderLayoutPresentation(compact);
  applyToolbarLayoutPresentation(compact);
}

applyTrackerLayout();
// stile scrollbar (già presente, lo riutilizziamo)
function injectScrollbarStyles() {
  if (document.getElementById("tbp-scrollbar-style")) return;
  const s = document.createElement("style");
  s.id = "tbp-scrollbar-style";
  s.textContent = `
  .tbp-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
  .tbp-scroll::-webkit-scrollbar-track { background: transparent; }
  .tbp-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(148,163,184,0.38);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .tbp-scroll:hover::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,0.58); }
  .tbp-scroll::-webkit-scrollbar-thumb:active { background-color: rgba(148,163,184,0.76); }
  .tbp-scroll { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.38) transparent; }
  .tbp-scroll[data-compact-scroll="1"]::-webkit-scrollbar { height: 4px; }
  .tbp-scroll[data-compact-scroll="1"]::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,.42); border-width: 1px; }
  .tbp-scroll[data-compact-scroll="1"]:hover::-webkit-scrollbar-thumb,
  .tbp-scroll[data-compact-scroll="1"].is-scrolling::-webkit-scrollbar-thumb { background-color: rgba(148,163,184,.58); }
  .tbp-scroll[data-compact-scroll="1"] { scrollbar-color: rgba(148,163,184,.42) transparent; }
  .tbp-scroll[data-compact-scroll="1"]:hover,
  .tbp-scroll[data-compact-scroll="1"].is-scrolling { scrollbar-color: rgba(148,163,184,.58) transparent; }
  `;
  document.head.appendChild(s);
}
injectScrollbarStyles();
trackWrap.classList.add("tbp-scroll");

// HP Memory: riempi HP mancanti dei token da memoria (all'avvio)
(async () => {
  const sceneEpoch = currentSceneEpoch();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  try {
    await applyHPMemoryToSceneForMissingHP(sceneEpoch);
  } catch (err) {
    console.warn("[hpMemory] apply on mount:", err?.message || err);
  }
})();


// ——— HP Memory: riempi HP mancanti dei PG da memoria stanza
// opzionale: isola la rotellina (niente scroll “a cascata”)
let __compactScrollActivityTimer = null;
function markCompactCarouselScrolling() {
  if (!isCompactTrackerLayout()) return;
  trackWrap.classList.add("is-scrolling");
  window.clearTimeout(__compactScrollActivityTimer);
  __compactScrollActivityTimer = window.setTimeout(() => {
    trackWrap.classList.remove("is-scrolling");
  }, 850);
}
trackWrap.addEventListener("wheel", (event) => {
  event.stopPropagation();
  if (isCompactTrackerLayout() && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    trackWrap.scrollLeft += event.deltaY;
  }
  markCompactCarouselScrolling();
}, { passive: false });
trackWrap.addEventListener("scroll", () => {
  if (__expandedCompactEffectsId) void __closeCompactEffectsPopover();
  markCompactCarouselScrolling();
}, { passive: true });


    // ===== Stato scena
    async function getSceneState() {
      const md = await OBR.scene.getMetadata();
      return md[STATE_KEY];
    }
    async function setSceneState(next, sceneEpoch = currentSceneEpoch(), options = {}) {
      if (!IS_GM || !__isCurrentSceneOperation(sceneEpoch, "scene-state-write")) return false;
      const commandId = options.commandId || nextInitiativeStateCommandId(options.kind || "set");
      const payload = options.payload || {
        kind: options.kind || (typeof next === "function" ? "reducer" : "patch"),
        ownedFields: options.ownedFields,
        patch: typeof next === "function" ? undefined : next,
        reducer: typeof next === "function" ? String(next) : undefined,
      };
      const result = typeof next === "function"
        ? await enqueueInitiativeStateReducer({
          commandId,
          reducer: next,
          ownedFields: options.ownedFields,
          expected: options.expected,
          payload,
          sceneEpoch,
          kind: options.kind || "reducer",
        })
        : await enqueueInitiativeStatePatch({
          commandId,
          patch: next,
          ownedFields: options.ownedFields,
          expected: options.expected,
          payload,
          sceneEpoch,
          kind: options.kind || "patch",
      });
      if (!__isCurrentSceneOperation(sceneEpoch, "scene-state-write")) return false;
      if (!initiativeStateResultApplied(result) && options.throwOnFailure) {
        const error = new Error(`initiative state command ${result?.status || "failed"}`);
        error.result = result;
        throw error;
      }
      return options.returnResult ? result : initiativeStateResultApplied(result);
    }

async function __unmountActiveTurnLabelRuntime() {
  __activeTurnLabelRuntimeEnabled = false;
  __activeTurnLabelDesired = null;
  __activeTurnLabelLatestKey = null;
  __activeTurnLabelRevision += 1;
  if (__activeTurnLabelRetryTimer !== null) {
    window.clearTimeout(__activeTurnLabelRetryTimer);
    __activeTurnLabelRetryTimer = null;
  }
  if (__activeTurnLabelPumpPromise) {
    await __activeTurnLabelPumpPromise.catch(() => {});
  }
}

async function __cleanupOwnedActiveTurnLabels() {
  const sceneEpoch = currentSceneEpoch();
  __activeTurnLabel = null;
  __activeTurnLabelInitialized = false;
  const locals = await OBR.scene.local.getItems((item) => (
    item.type === "LABEL" && !!item.metadata?.[ACTIVE_LABEL_META]
  )).catch(() => []);
  if (locals.length && __isCurrentSceneOperation(sceneEpoch, "active-label-cleanup")) {
    await OBR.scene.local.deleteItems(locals.map((item) => item.id));
  }
  if (!IS_GM || !__isCurrentSceneOperation(sceneEpoch, "active-label-cleanup")) return;
  const globals = await OBR.scene.items.getItems((item) => (
    item.type === "LABEL" && !!item.metadata?.[ACTIVE_LABEL_META]
  ));
  if (!__isCurrentSceneOperation(sceneEpoch, "active-label-cleanup")) return;
  if (globals.length) await OBR.scene.items.deleteItems(globals.map((item) => item.id));
}

function __reconcileActiveTurnLabelRuntime() {
  if (!__activeTurnLabelRuntimeEnabled || !IS_GM) return;
  const state = __latestInitiativeState;
  const activeId = Array.isArray(state?.order) ? state.order[state.current] : null;
  syncActiveTurnLabel(activeId);
}

    // ===== Hard reset dello stato iniziativa (quando non resta alcun token tracciato)
async function resetTrackerState(sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "tracker-state-reset")) return false;
  return setSceneState({
    order: [],
    current: 0,
    round: 1,
    seededGroups: {},   // azzera anche i seed per gruppi
  }, sceneEpoch, {
    kind: "hard-reset",
    ownedFields: ["order", "current", "round", "seededGroups"],
  });
}

// ===== Selezione + centratura viewport (robusta) =====
async function selectInScene(itemId, replace = true, sceneEpoch = currentSceneEpoch()) {
  // Solo il GM forza la selezione locale del token
  if (!IS_GM || !itemId || !__isCurrentSceneOperation(sceneEpoch, "scene-selection")) return;
  try {
    await OBR.player.select([itemId], replace);
  } catch {}
}


async function buildBiasedBBox(bounds, gridDpi, gridSpan = FOCUS_GRID_SPAN, minPadPx = FOCUS_MIN_PAD_PX) {
  const cx = (Number(bounds?.min?.x) + Number(bounds?.max?.x)) / 2;
  const cy = (Number(bounds?.min?.y) + Number(bounds?.max?.y)) / 2;

  const dpi = Math.max(1, Number(gridDpi) || FOCUS_FALLBACK_DPI);
  const focusSize = Math.max(1, dpi * gridSpan + 2 * minPadPx);

  return {
    min:   { x: cx - focusSize / 2, y: cy - focusSize / 2 },
    max:   { x: cx + focusSize / 2, y: cy + focusSize / 2 },
    width:  focusSize,
    height: focusSize,
    center: { x: cx, y: cy },
  };
}

async function centerOnItem(itemId, expectedNavigationRevision = null, sceneEpoch = currentSceneEpoch()) {
  if (!itemId || !__isCurrentSceneOperation(sceneEpoch, "viewport-focus")) return false;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    if (!__isCurrentSceneOperation(sceneEpoch, "viewport-focus")) return false;
    if (!items || items.length === 0) return false;

    const [raw, gridDpi] = await Promise.all([
      OBR.scene.items.getItemBounds([itemId]),
      OBR.scene.grid.getDpi().catch(() => FOCUS_FALLBACK_DPI),
    ]);
    if (!__isCurrentSceneOperation(sceneEpoch, "viewport-focus")) return false;
    if (!raw) return false;

    const biased = await buildBiasedBBox(raw, gridDpi);
    if (
      expectedNavigationRevision !== null &&
      expectedNavigationRevision !== __navigationRevision
    ) {
      __initiativeDiag("viewport:focus-skipped-before-animate", {
        anchorId: itemId,
        navigationRevision: expectedNavigationRevision,
      });
      return false;
    }
    await OBR.viewport.animateToBounds(biased);
    return true;
  } catch (e) {
    console.warn("[initiative] centerOnItem failed:", e?.message || e);
    return false;
  }
}

function isAutoFocusEnabled(state = null) {
  const candidate = state && typeof state === "object"
    ? state
    : __latestInitiativeState;
  if (candidate?.ui && Object.hasOwn(candidate.ui, "autoFocus")) {
    return candidate.ui.autoFocus !== false;
  }
  return runtimeOptionsService.get(selectFollowActiveTurn);
}

async function selectAndFocus(itemId, autoFocus = true) {
  await selectInScene(itemId, true);
  if (autoFocus) await centerOnItem(itemId);
}

let __selectFocusDesired = null;
let __selectFocusPumpRunning = false;
let __selectFocusRunningKey = null;
let __selectFocusCompletedKey = null;
const VIEWPORT_FOCUS_SETTLE_MS = 220;
let __viewportFocusDesired = null;
let __viewportFocusTimer = null;
let __viewportFocusRunning = false;

function __scheduleViewportFocus(itemId, revision, sceneEpoch = currentSceneEpoch()) {
  __viewportFocusDesired = {
    itemId,
    revision,
    sceneEpoch,
    queuedAt: Date.now(),
  };
  if (__viewportFocusTimer !== null) {
    window.clearTimeout(__viewportFocusTimer);
    __viewportFocusTimer = null;
  }
  __initiativeDiag("viewport:focus-queued", {
    anchorId: itemId,
    navigationRevision: revision,
  });
  if (__viewportFocusRunning) return;
  __viewportFocusTimer = window.setTimeout(() => {
    __viewportFocusTimer = null;
    void __flushViewportFocus();
  }, VIEWPORT_FOCUS_SETTLE_MS);
}

async function __flushViewportFocus() {
  if (__viewportFocusRunning) return;
  const desired = __viewportFocusDesired;
  if (!desired) return;
  const expectedAnchorId = __resolveAnchorForActive(__activeIdForState(__latestInitiativeState));
  if (
    desired.revision !== __navigationRevision ||
    desired.itemId !== expectedAnchorId ||
    !__isCurrentSceneOperation(desired.sceneEpoch, "viewport-focus")
  ) {
    if (__viewportFocusDesired === desired) __viewportFocusDesired = null;
    __initiativeDiag("viewport:focus-skipped-stale", {
      anchorId: desired.itemId,
      expectedAnchorId,
      navigationRevision: desired.revision,
    });
    return;
  }

  __viewportFocusDesired = null;
  __viewportFocusRunning = true;
  __initiativeDiag("viewport:focus-start", {
    anchorId: desired.itemId,
    navigationRevision: desired.revision,
  });
  try {
    const animated = await centerOnItem(desired.itemId, desired.revision, desired.sceneEpoch);
    if (!animated) return;
    __initiativeDiag(
      desired.revision === __navigationRevision
        ? "viewport:focus-complete"
        : "viewport:focus-complete-stale",
    {
      anchorId: desired.itemId,
      navigationRevision: desired.revision,
    });
  } catch (err) {
    console.warn("[initiative] viewport focus queue error:", err?.message || err);
  } finally {
    __viewportFocusRunning = false;
    if (__viewportFocusDesired) {
      const elapsed = Date.now() - __viewportFocusDesired.queuedAt;
      const wait = Math.max(0, VIEWPORT_FOCUS_SETTLE_MS - elapsed);
      __viewportFocusTimer = window.setTimeout(() => {
        __viewportFocusTimer = null;
        void __flushViewportFocus();
      }, wait);
    }
  }
}

function queueSelectAndFocus(itemId, autoFocus = true) {
  const sceneEpoch = currentSceneEpoch();
  if (!__isCurrentSceneOperation(sceneEpoch, "selection-queue")) return;
  const expectedActiveId = __activeIdForState(__latestInitiativeState);
  if (expectedActiveId && itemId !== expectedActiveId) {
    __initiativeDiag("selection:skipped-stale", {
      activeId: itemId,
      expectedActiveId,
      navigationRevision: __navigationRevision,
    });
    return;
  }
  const anchorId = __resolveAnchorForActive(itemId);
  if (!anchorId) return;
  const requestKey = `${sceneEpoch}\u0000${__navigationRevision}\u0000${anchorId}\u0000${autoFocus ? "1" : "0"}`;
  if (
    requestKey === __selectFocusDesired?.key ||
    requestKey === __selectFocusRunningKey ||
    requestKey === __selectFocusCompletedKey
  ) {
    __initiativeDiag("selection:skipped-duplicate", {
      activeId: itemId,
      anchorId,
      navigationRevision: __navigationRevision,
    });
    return;
  }
  __selectFocusDesired = {
    itemId: anchorId,
    autoFocus,
    revision: __navigationRevision,
    sceneEpoch,
    key: requestKey,
  };
  __initiativeDiag("selection:queued", {
    activeId: itemId,
    anchorId,
    autoFocus,
    navigationRevision: __navigationRevision,
  });
  if (IS_GM) {
    __setTrackerSelection([anchorId]);
    __initiativeDiag("selection:optimistic", {
      anchorId,
      navigationRevision: __navigationRevision,
    });
  }
  if (autoFocus) {
    __scheduleViewportFocus(anchorId, __navigationRevision, sceneEpoch);
  } else {
    __viewportFocusDesired = null;
    if (__viewportFocusTimer !== null) {
      window.clearTimeout(__viewportFocusTimer);
      __viewportFocusTimer = null;
    }
  }
  if (__selectFocusPumpRunning) return;

  __selectFocusPumpRunning = true;
  void (async () => {
    try {
      while (__selectFocusDesired) {
        const desired = __selectFocusDesired;
        __selectFocusDesired = null;
        if (
          desired.revision !== __navigationRevision ||
          !__isCurrentSceneOperation(desired.sceneEpoch, "selection-queue")
        ) continue;
        __selectFocusRunningKey = desired.key;

        __initiativeDiag("selection:select-start", {
          anchorId: desired.itemId,
          navigationRevision: desired.revision,
        });
        await selectInScene(desired.itemId, true, desired.sceneEpoch);
        if (!__isCurrentSceneOperation(desired.sceneEpoch, "selection-queue")) continue;
        __initiativeDiag("selection:select-complete", {
          anchorId: desired.itemId,
          navigationRevision: desired.revision,
        });
        if (desired.revision === __navigationRevision) {
          __selectFocusCompletedKey = desired.key;
        }
        __selectFocusRunningKey = null;
      }
    } catch (err) {
      __selectFocusCompletedKey = null;
      console.warn("[initiative] select/focus queue error:", err?.message || err);
    } finally {
      __selectFocusRunningKey = null;
      __selectFocusPumpRunning = false;
      if (__selectFocusDesired) {
        const desired = __selectFocusDesired;
        __selectFocusDesired = null;
        queueSelectAndFocus(desired.itemId, desired.autoFocus);
      }
    }
  })();
}

// Restituisce l'ID del token reale a cui ancorare la label (null se virtuale)
function __resolveAnchorForActive(activeId) {
  if (!activeId) return null;
  if (isEpicActionId && isEpicActionId(activeId)) return null; // voce virtuale
  if (isLairId && isLairId(activeId)) return null;             // Tana è virtuale
  const { baseId } = splitParagonId(activeId);                  // paragon -> base
  return baseId || activeId;
}

// Trova la label attiva esistente (identificata dal nostro metadata)
async function __findExistingActiveLabel() {
  if (__activeTurnLabelInitialized) return __activeTurnLabel;
  return await __cleanupActiveTurnLabels();
}

let __mutatingActiveLabel = 0;
let __activeTurnLabelRevision = 0;
let __activeTurnLabelLatestKey = null;

function __activeTurnLabelWidth(text) {
  return Math.min(
    ACTIVE_LABEL_MAX_WIDTH,
    Math.max(72, Math.ceil(String(text ?? "").length * ACTIVE_LABEL_FONT * 0.58 + 24))
  );
}

function __activeTurnLabelPosition(anchor, bounds, dpi) {
  const minX = Number(bounds?.min?.x);
  const maxX = Number(bounds?.max?.x);
  const minY = Number(bounds?.min?.y);
  const centerX = Number.isFinite(minX) && Number.isFinite(maxX)
    ? (minX + maxX) / 2
    : Number(anchor?.position?.x) || 0;
  const topY = Number.isFinite(minY)
    ? minY
    : (Number(anchor?.position?.y) || 0) - (Math.max(1, Number(dpi) || 1) / 2);
  return {
    x: centerX,
    y: topY - ACTIVE_LABEL_GAP_PX,
  };
}

function __setActiveTurnLabelText(item, text) {
  const textValue = String(text ?? "");
  const width = __activeTurnLabelWidth(textValue);
  const prevTextStyle =
    (item.text && typeof item.text === "object" && item.text.style) || {};
  item.text = item.text && typeof item.text === "object" ? item.text : {};
  item.text.type = "PLAIN";
  item.text.plainText = textValue;
  item.text.width = width;
  item.text.height = ACTIVE_LABEL_HEIGHT;
  item.text.style = {
    ...prevTextStyle,
    padding: 0,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: ACTIVE_LABEL_FONT,
    fontWeight: 600,
    lineHeight: 1,
    textAlign: "CENTER",
    textAlignVertical: "MIDDLE",
    fillColor: "#f8fafc",
    fillOpacity: 1,
    strokeColor: "rgba(2,6,23,.55)",
    strokeWidth: 1,
  };
  item.style = {
    ...(item.style || {}),
    backgroundColor: ACTIVE_LABEL_BG,
    backgroundOpacity: ACTIVE_LABEL_BG_OPACITY,
    cornerRadius: ACTIVE_LABEL_HEIGHT / 2,
    pointerWidth: ACTIVE_LABEL_POINTER_WIDTH,
    pointerHeight: ACTIVE_LABEL_POINTER_HEIGHT,
    pointerDirection: "DOWN",
    maxViewScale: ACTIVE_LABEL_MAX_VIEW_SCALE,
  };
}

async function upsertActiveTurnLabel(
  anchorId,
  displayText,
  anchorSnapshot = null,
  revision = __activeTurnLabelRevision,
  sceneEpoch = currentSceneEpoch(),
) {
  if (!__isCurrentSceneOperation(sceneEpoch, "active-label")) return;
  const textStr = String(displayText ?? "");
  const existing = await __findExistingActiveLabel();
  if (!__isCurrentSceneOperation(sceneEpoch, "active-label") || revision !== __activeTurnLabelRevision) return;

  if (!anchorId) {
    if (existing && existing.visible !== false) {
      await OBR.scene.items.updateItems([existing.id], (list) => {
        const item = list[0];
        if (!item) return;
        item.visible = false;
        item.locked = true;
        item.disableHit = true;
        item.disableAttachmentBehavior = (item.disableAttachmentBehavior || [])
          .filter((behavior) => behavior !== "POSITION");
      });
      existing.visible = false;
      existing.disableAttachmentBehavior = (existing.disableAttachmentBehavior || [])
        .filter((behavior) => behavior !== "POSITION");
    }
    return;
  }

  const dpi = __activeTurnLabelDpi ?? await OBR.scene.grid.getDpi();
  if (!__isCurrentSceneOperation(sceneEpoch, "active-label") || revision !== __activeTurnLabelRevision) return;
  __activeTurnLabelDpi = dpi;
  const anchor = anchorSnapshot || (await OBR.scene.items.getItems([anchorId]))[0];
  if (!__isCurrentSceneOperation(sceneEpoch, "active-label") || revision !== __activeTurnLabelRevision) return;
  if (!anchor) {
    __activeTurnLabelLatestKey = null;
    return;
  }

  let anchorBounds = null;
  try { anchorBounds = await OBR.scene.items.getItemBounds([anchorId]); } catch {}
  if (!__isCurrentSceneOperation(sceneEpoch, "active-label") || revision !== __activeTurnLabelRevision) return;
  const pos = __activeTurnLabelPosition(anchor, anchorBounds, dpi);

  if (!existing) {
    if (revision !== __activeTurnLabelRevision) return;
    __mutatingActiveLabel++;
    try {
      const labelWidth = __activeTurnLabelWidth(textStr);
      const item = buildLabel()
        .plainText(textStr)
        .width(labelWidth)
        .height(ACTIVE_LABEL_HEIGHT)
        .padding(0)
        .fontFamily('"Helvetica Neue", Helvetica, Arial, sans-serif')
        .fontSize(ACTIVE_LABEL_FONT)
        .fontWeight(600)
        .lineHeight(1)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor("#f8fafc")
        .strokeColor("rgba(2,6,23,.55)")
        .strokeWidth(1)
        .layer("TEXT")
        .position(pos)
        .attachedTo(anchorId)
        .locked(true)
        .disableHit(true)
        .style({
          backgroundColor: ACTIVE_LABEL_BG,
          backgroundOpacity: ACTIVE_LABEL_BG_OPACITY,
          cornerRadius: ACTIVE_LABEL_HEIGHT / 2,
          pointerDirection: "DOWN",
          pointerWidth: ACTIVE_LABEL_POINTER_WIDTH,
          pointerHeight: ACTIVE_LABEL_POINTER_HEIGHT,
          maxViewScale: ACTIVE_LABEL_MAX_VIEW_SCALE,
        })
        .metadata({ [ACTIVE_LABEL_META]: { enabled: true } })
        .name("Turno attuale")
        .build();
      await OBR.scene.items.addItems([item]);
      if (!__isCurrentSceneOperation(sceneEpoch, "active-label") || revision !== __activeTurnLabelRevision) return;
      __activeTurnLabel = item;
    } finally {
      __mutatingActiveLabel--;
    }
    return;
  }

  if (revision !== __activeTurnLabelRevision) return;

  __mutatingActiveLabel++;
  try {
    // Attachment e posizione cambiano insieme, ricostruendo il legame col token.
    await OBR.scene.items.updateItems([existing.id], (list) => {
      const item = list[0];
      if (!item) return;
      item.attachedTo = anchorId;
      item.position = pos;
      item.visible = true;
      item.layer = "TEXT";
      item.locked = true;
      item.disableHit = true;
      __setActiveTurnLabelText(item, textStr);
      item.disableAttachmentBehavior = (item.disableAttachmentBehavior || [])
        .filter((behavior) => behavior !== "POSITION");
    });
    if (!__isCurrentSceneOperation(sceneEpoch, "active-label") || revision !== __activeTurnLabelRevision) return;
    existing.attachedTo = anchorId;
    existing.position = pos;
    existing.visible = true;
    existing.disableAttachmentBehavior = (existing.disableAttachmentBehavior || [])
      .filter((behavior) => behavior !== "POSITION");
    __setActiveTurnLabelText(existing, textStr);
    __activeTurnLabel = existing;
  } catch (err) {
    __activeTurnLabelInitialized = false;
    __activeTurnLabel = null;
    throw err;
  } finally {
    __mutatingActiveLabel--;
  }
}
async function __pumpActiveTurnLabel() {
  if (__activeTurnLabelPumpRunning) return;
  __activeTurnLabelPumpRunning = true;
  let failedDesired = null;
  try {
    while (__activeTurnLabelDesired) {
      const desired = __activeTurnLabelDesired;
      __activeTurnLabelDesired = null;
      failedDesired = desired;
      if (
        desired.revision !== __activeTurnLabelRevision ||
        desired.navigationRevision !== __navigationRevision ||
        !__isCurrentSceneOperation(desired.sceneEpoch, "active-label")
      ) {
        __initiativeDiag("label:skipped-superseded", {
          anchorId: desired.anchorId,
          labelRevision: desired.revision,
          navigationRevision: desired.navigationRevision,
        });
        continue;
      }
      __initiativeDiag("label:update-start", {
        anchorId: desired.anchorId,
        text: desired.text,
        labelRevision: desired.revision,
      });
      await upsertActiveTurnLabel(
        desired.anchorId,
        desired.text,
        desired.anchor,
        desired.revision,
        desired.sceneEpoch,
      );
      __initiativeDiag("label:update-complete", {
        anchorId: desired.anchorId,
        text: desired.text,
        labelRevision: desired.revision,
      });
      failedDesired = null;
    }
  } catch (err) {
    __activeTurnLabelLatestKey = null;
    if (failedDesired && !__activeTurnLabelDesired) __activeTurnLabelDesired = failedDesired;
    console.warn("[active-label] update queue error:", err?.message || err);
  } finally {
    __activeTurnLabelPumpRunning = false;
    if (__activeTurnLabelDesired) {
      if (__activeTurnLabelRetryTimer === null) {
        __activeTurnLabelRetryTimer = window.setTimeout(() => {
          __activeTurnLabelRetryTimer = null;
          __startActiveTurnLabelPump();
        }, 250);
      }
    }
  }
}

function __startActiveTurnLabelPump() {
  if (__activeTurnLabelPumpPromise) return __activeTurnLabelPumpPromise;
  const operation = __pumpActiveTurnLabel();
  __activeTurnLabelPumpPromise = operation;
  void operation.then(() => {
    if (__activeTurnLabelPumpPromise === operation) __activeTurnLabelPumpPromise = null;
  }, () => {
    if (__activeTurnLabelPumpPromise === operation) __activeTurnLabelPumpPromise = null;
  });
  return operation;
}

function syncActiveTurnLabel(activeId) {
  if (!IS_GM || !__activeTurnLabelRuntimeEnabled) return;
  const anchorId = __resolveAnchorForActive(activeId);
  const activeEntry =
    __activeLabelEntriesById.get(activeId) ||
    __activeLabelEntriesById.get(anchorId);
  const labelName = activeEntry?.name
    ? __safeBaseName(activeEntry.name)
    : "Turno";
  const text = ACTIVE_LABEL_TEXT_FMT(labelName);
  const key = `${anchorId || ""}\u0000${text}`;
  if (__activeTurnLabelLatestKey === key) return;

  __activeTurnLabelLatestKey = key;
  const revision = ++__activeTurnLabelRevision;
  __activeTurnLabelDesired = {
    anchorId,
    text,
    anchor: activeEntry?.position ? activeEntry : null,
    revision,
    navigationRevision: __navigationRevision,
    sceneEpoch: currentSceneEpoch(),
  };
  __initiativeDiag("label:queued", {
    activeId,
    anchorId,
    text,
    labelRevision: revision,
  });

  if (!__activeTurnLabelPumpRunning) __startActiveTurnLabelPump();
}
function __scheduleNavigationStateFlush() {
  if (__navigationFlushTimer !== null) clearTimeout(__navigationFlushTimer);
  const elapsed = Date.now() - __navigationDesiredAt;
  const wait = Math.max(0, NAVIGATION_WRITE_SETTLE_MS - elapsed);
  __navigationFlushTimer = setTimeout(() => {
    __navigationFlushTimer = null;
    void __flushNavigationState();
  }, wait);
}

async function __flushNavigationState() {
  if (__navigationPumpRunning) return;
  const desired = __navigationDesiredState;
  const sceneEpoch = __navigationDesiredEpoch ?? currentSceneEpoch();
  if (!desired) return;

  __navigationDesiredState = null;
  __navigationDesiredEpoch = null;
  if (!__isCurrentSceneOperation(sceneEpoch, "navigation-flush")) return;
  __navigationPumpRunning = true;
  const flushNavigationRevision = __navigationRevision;
  __initiativeDiag("navigation:flush-start", {
    activeId: __activeIdForState(desired),
    round: desired.round,
    current: desired.current,
    navigationRevision: __navigationRevision,
  });
  try {
    const applied = await setSceneState({
      order: desired.order,
      current: desired.current,
      round: desired.round,
      collapsed: desired.collapsed,
    }, sceneEpoch, {
      kind: "advance-turn",
      ownedFields: ["order", "current", "round", "collapsed"],
      commandId: `initiative-navigation:${sceneEpoch}:${flushNavigationRevision}`,
      payload: {
        kind: "advance-turn",
        order: desired.order,
        current: desired.current,
        round: desired.round,
        collapsed: desired.collapsed,
      },
      returnResult: true,
      throwOnFailure: true,
    });
    if (!initiativeStateResultApplied(applied)) return;
    if (applied.status === "duplicate" || applied.status === "unchanged") {
      __initiativeDiag("navigation:side-effects-skipped-noop", {
        status: applied.status,
        navigationRevision: flushNavigationRevision,
      });
      return;
    }
    if (!__isCurrentSceneOperation(sceneEpoch, "navigation-flush")) return;
    const desiredActiveId = __activeIdForState(desired);
    const latestActiveId = __activeIdForState(__latestInitiativeState);
    const suppressTurnNotice = shouldSuppressTurnNoticeBroadcast({
      flushRevision: flushNavigationRevision,
      currentRevision: __navigationRevision,
      hasPendingNavigation: !!__navigationDesiredState,
      flushedActiveId: desiredActiveId,
      latestActiveId,
    });
    if (!suppressTurnNotice) {
      void broadcastTurnNotice(desired, sceneEpoch).catch((err) => {
        console.warn("[turn-notice] navigation broadcast error:", err?.message || err);
      });
    } else {
      __initiativeDiag("turn-notice:skipped-superseded", {
        activeId: desiredActiveId,
        latestActiveId,
        flushNavigationRevision,
        navigationRevision: __navigationRevision,
      });
    }
    if (!__navigationDesiredState && desiredActiveId === latestActiveId) {
      syncActiveTurnLabel(desiredActiveId);
    }
    __initiativeDiag("navigation:flush-complete", {
      activeId: desiredActiveId,
      navigationRevision: __navigationRevision,
    });
  } catch (err) {
    console.warn("[initiative] navigation queue error:", err?.message || err);
    if (!__navigationDesiredState) {
      __optimisticNavigationDigest = null;
      __lastNavigationAt = 0;
      try {
        __latestInitiativeState = await getSceneState();
        if (!__isCurrentSceneOperation(sceneEpoch, "navigation-error")) return;
        await renderAll("navigation-error");
      } catch (reconcileErr) {
        console.warn("[initiative] navigation reconcile error:", reconcileErr?.message || reconcileErr);
      }
    }
  } finally {
    __navigationPumpRunning = false;
    if (__navigationDesiredState) __scheduleNavigationStateFlush();
  }
}

function queueNavigationState(next, sceneEpoch = currentSceneEpoch()) {
  __navigationDesiredState = next;
  __navigationDesiredEpoch = sceneEpoch;
  __navigationDesiredAt = Date.now();
  __initiativeDiag("navigation:queued", {
    activeId: __activeIdForState(next),
    round: next?.round,
    current: next?.current,
    navigationRevision: __navigationRevision,
  });
  __scheduleNavigationStateFlush();
}
function __activeIdForState(state) {
  return Array.isArray(state?.order) ? state.order[state.current] : null;
}

function __matchesLatestActiveTurn(state) {
  if (!__latestInitiativeState) return true;
  return (
    __activeIdForState(state) === __activeIdForState(__latestInitiativeState) &&
    Math.floor(Number(state?.current) || 0) === Math.floor(Number(__latestInitiativeState?.current) || 0) &&
    Math.max(1, Math.floor(Number(state?.round) || 1)) ===
      Math.max(1, Math.floor(Number(__latestInitiativeState?.round) || 1))
  );
}

function __conditionTurnStateSnapshot(state) {
  const order = Array.isArray(state?.order) ? state.order.slice() : [];
  if (!order.length) return null;
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)));
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  return { order, current, round };
}

function __conditionActorId(id) {
  if (!id || isLairId(id) || isEpicActionId(id)) return null;
  return splitParagonId(id).baseId || null;
}

function __forwardConditionTurnBoundaries(previous, next, directionHint = 0) {
  if (directionHint < 0 || !previous || !next) return [];
  if (previous.order.length !== next.order.length) return [];
  if (previous.order.some((id, index) => id !== next.order[index])) return [];

  const length = next.order.length;
  const previousOrdinal = ((previous.round - 1) * length) + previous.current;
  const nextOrdinal = ((next.round - 1) * length) + next.current;
  const distance = nextOrdinal - previousOrdinal;
  if (distance <= 0 || distance > 1000) return [];

  const boundaries = [];
  for (let ordinal = previousOrdinal; ordinal < nextOrdinal; ordinal += 1) {
    const endingActorId = __conditionActorId(next.order[ordinal % length]);
    const startingActorId = __conditionActorId(next.order[(ordinal + 1) % length]);
    if (endingActorId) {
      boundaries.push({
        phase: "end",
        actorId: endingActorId,
        turnKey: initiativeTurnKeyAtOrdinal(next.order, ordinal),
      });
    }
    if (startingActorId) {
      boundaries.push({
        phase: "start",
        actorId: startingActorId,
        turnKey: initiativeTurnKeyAtOrdinal(next.order, ordinal + 1),
      });
    }
  }
  return boundaries;
}

function __conditionDirectionHintFor(state) {
  const hint = __conditionNavigationHint;
  if (!hint) return 0;
  const matches =
    hint.round === Math.max(1, Math.floor(Number(state?.round) || 1)) &&
    hint.current === Math.floor(Number(state?.current) || 0) &&
    hint.activeId === __activeIdForState(state);
  if (!matches) return 0;
  __conditionNavigationHint = null;
  return hint.direction;
}

function __isStaleNavigationState(state) {
  const inNavigationGrace =
    __lastNavigationAt > 0 &&
    (Date.now() - __lastNavigationAt) < NAVIGATION_STALE_GRACE_MS;
  if (!__navigationPumpRunning && !__navigationDesiredState && !inNavigationGrace) return false;
  const expectedId = __activeIdForState(__latestInitiativeState);
  const receivedId = __activeIdForState(state);
  return !!expectedId && receivedId !== expectedId;
}
function handoffFocusToCanvas() {
  try {
    // togli il focus da qualunque cosa nel plugin
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  } catch {}
  // prova a riportare il focus alla finestra host (funziona in molti browser se chiamato su gesto utente)
  try { window.top && window.top.focus && window.top.focus(); } catch {}
}

async function closeOpenEditors() {
  const wasSuspended = __suspendRenders;
  __suspendRenders = true;                // congela i render durante la chiusura
  try {
    const openInit = document.querySelector('[data-init-editing="1"]');
    if (openInit && typeof openInit.__commitFn === "function") {
      await openInit.__commitFn();
    }
    const openHP = document.querySelector('[data-hp-editing="1"]');
    if (openHP && typeof openHP.__commitFn === "function") {
      await openHP.__commitFn();
    }
  } catch (e) {
    console.warn("[edit] closeOpenEditors", e?.message || e);
  } finally {
    __suspendRenders = wasSuspended;      // ← ripristina come prima
  }
}

let __arrowProxyUntil = 0;
function armArrowProxy() {
  __arrowProxyUntil = Date.now() + ARROW_PROXY_WINDOW_MS;
}

let __ignoreDocClickUntil = 0;
function armDocClickIgnore(ms = 250) {
  __ignoreDocClickUntil = Date.now() + ms;
}

async function nudgeSelectionBy(dxCells, dyCells, doubleStep = false) {
  const sel = await OBR.player.getSelection();
  if (!sel || sel.length === 0) return;

  const dpi = await OBR.scene.grid.getDpi(); // 1 cella in px
  const step = (doubleStep ? 2 : 1) * dpi;

  // leggiamo posizioni correnti
  const items = await OBR.scene.items.getItems(sel);
  // nuova posizione
  const newPos = items.map((it) => ({
    x: it.position.x + dxCells * step,
    y: it.position.y + dyCells * step,
  }));

  // aggiorniamo
  await OBR.scene.items.updateItems(items, (draft) => {
    for (let i = 0; i < draft.length; i++) {
      draft[i].position.x = newPos[i].x;
      draft[i].position.y = newPos[i].y;
    }
  });
}

    // ===== Image URL dal token
    function getTokenImageUrl(it) {
      if (it.image && typeof it.image === "object") {
        if (typeof it.image.url === "string") return it.image.url;
        if (typeof it.image.src === "string") return it.image.src;
        if (typeof it.image.href === "string") return it.image.href;
      }
      if (typeof it.src === "string") return it.src;
      if (it.data && typeof it.data.src === "string") return it.data.src;
      return null;
    }

function entryFromSceneItem(it, characterBuildBySourceId = null) {
  const meta = it?.metadata?.[META_KEY];
  if (!it?.id || !meta || meta.inInitiative !== true) return null;
  const initiativeCard = getInitiativeCard(it);
  const conditions = appendClassFeatureConditionInstances(
    __safeConditions(meta.conditions),
    meta[CLASS_FEATURE_STATE_FIELD],
    CLASS_FEATURE_BY_ID,
    __latestInitiativeState?.round ?? null,
    initiativeCard.characterBuild,
    characterBuildBySourceId,
  );
  return {
    conditions: {
      ...conditions,
      instances: conditions.instances.map((instance) => {
        if (!instance || typeof instance !== "object" || instance.resourceDie) return instance;
        const sourceBuild = characterBuildBySourceId?.get?.(String(instance.sourceId || "").trim())
          || initiativeCard.characterBuild;
        const resourceDie = classFeatureConditionResourceDie(instance, sourceBuild);
        return resourceDie ? { ...instance, resourceDie } : instance;
      }),
    },
    id: it.id,
    name: it.name || "Unnamed",
    characterBuild: initiativeCard.characterBuild,
    position: it.position ? { x: it.position.x, y: it.position.y } : null,
    initiative: (meta.epic ? LAIR_INITIATIVE : (Number(meta.initiative) || 0)),
    initTouched: meta.initTouched === true,
    portrait: getTokenImageUrl(it),
    attitude: meta.attitude || "ally",
    hp: (meta.hp ?? null),
    hpMax: (meta.hpMax ?? null),
    isEpic: !!meta.epic,
    paragonActions:
      (meta.paragon && Number(meta.paragon.actions) > 0)
        ? Math.max(1, Math.floor(Number(meta.paragon.actions)))
        : 0,
    legendary:
      (meta.legendary && typeof meta.legendary === "object")
        ? { max: Number(meta.legendary.max) || 0, current: Math.max(0, Number(meta.legendary.current) || 0) }
        : { max: 0, current: 0 },
    legendaryResistances: (() => {
      if (!meta.legendary || Number(meta.legendary.max) <= 0) return { max: 0, current: 0 };
      const stored = meta.legendaryResistances;
      const max = stored && typeof stored === "object"
        ? Math.max(0, Math.floor(Number(stored.max) || 0))
        : DEFAULT_LEGENDARY_RESISTANCES;
      const current = stored && typeof stored === "object"
        ? Math.max(0, Math.min(max, Math.floor(Number(stored.current) || 0)))
        : max;
      return { max, current };
    })(),
    quickActions: IS_GM
      ? initiativeCard.quickActions
      : initiativeCard.quickActions.filter((action) => action?.kind !== "feature"),
    classFeatures: IS_GM
      ? buildClassFeatureContextEntries(
        initiativeCard,
        meta[CLASS_FEATURE_STATE_FIELD],
        __latestInitiativeState?.round ?? null,
      )
      : [],
    spells: getVisibleSpellsFromItem(it),
    isConcentrating: !!(meta[CONC_META_KEY] &&
                        typeof meta[CONC_META_KEY] === "object" &&
                        Object.keys(meta[CONC_META_KEY]).length > 0),
    concSpellKey: (() => {
      const conc = meta[CONC_META_KEY];
      if (!conc || typeof conc !== "object") return null;
      const keys = Object.keys(conc);
      return keys.length ? keys[0] : null;
    })(),
  };
}

// ===== Leggi token tracciati (senza ordinare qui)
async function readEntries(items = null) {
  const sourceItems = Array.isArray(items)
    ? items
    : await OBR.scene.items.getItems();
  const out = [];
  const seen = new Set();
  const characterBuildBySourceId = new Map(
    sourceItems
      .filter((item) => item?.id)
      .map((item) => [item.id, getInitiativeCard(item).characterBuild])
  );

  for (const it of sourceItems) {
    if (seen.has(it?.id)) continue;
    const entry = entryFromSceneItem(it, characterBuildBySourceId);
    if (!entry) continue;
    seen.add(it.id);
    out.push(entry);
  }
  return out;
}

// Unisce entries reali + lair (se attiva a stato)
async function getEntriesWithLair(state, items = null) {
  const base = await readEntries(items);
  if (state?.lairEnabled) base.push(makeLairEntry());
  return base;
}

// id virtuali paragon: "<baseId>::p<k>" con k>=1
function isParagonVirtualId(id) {
  return typeof id === "string" && id.includes("::p");
}
function splitParagonId(id) {
  if (!isParagonVirtualId(id)) return { baseId: id, idx: 0 };
  const [baseId, tail] = id.split("::p");
  const idx = Math.max(0, parseInt(tail, 10) || 0);
  return { baseId, idx };
}
function __selectionIdsForEntry(entry) {
  const members = Array.isArray(entry?.__groupMembers) && entry.__groupMembers.length
    ? entry.__groupMembers
    : [entry];
  return Array.from(new Set(members
    .map((member) => splitParagonId(member?.id).baseId)
    .filter((id) => id && !isLairId(id) && !isEpicActionId(id))));
}

function __applyTrackerSelectionState(card) {
  const ids = Array.isArray(card?.__selectionItemIds) ? card.__selectionItemIds : [];
  const selectedCount = ids.filter((id) => __selectedSceneItemIds.has(id)).length;
  const fullySelected = ids.length > 0 && selectedCount === ids.length;
  const partlySelected = selectedCount > 0 && !fullySelected;
  card.dataset.selectionState = fullySelected ? "all" : partlySelected ? "partial" : "none";
  __syncTrackerCardStateClasses(card);
  if (card.__selectionBaseShadow == null) {
    card.__selectionBaseShadow = card.style.boxShadow || "";
  }

  if (card.dataset.compactCard === "1") {
    const glow = fullySelected
      ? "0 0 0 2px rgba(255,255,255,.96), 0 0 12px 4px rgba(255,255,255,.68), 0 0 22px 7px rgba(255,255,255,.30)"
      : partlySelected
        ? "0 0 0 1px rgba(255,255,255,.82), 0 0 9px 3px rgba(255,255,255,.48)"
        : "";
    card.style.boxShadow = [card.__selectionBaseShadow, glow].filter(Boolean).join(", ");
    card.style.outline = "none";
    card.style.outlineOffset = "";
    return;
  }

  const glow = fullySelected
    ? "0 0 0 2px rgba(255,255,255,.98), 0 0 11px 4px rgba(255,255,255,.92), 0 0 25px 9px rgba(255,255,255,.50)"
    : partlySelected
      ? "0 0 0 1px rgba(255,255,255,.84), 0 0 9px 3px rgba(255,255,255,.72), 0 0 19px 6px rgba(255,255,255,.32)"
      : "";
  card.style.boxShadow = [card.__selectionBaseShadow, glow].filter(Boolean).join(", ");
  card.style.outline = "none";
  card.style.outlineOffset = "";
}

function __setTrackerSelection(ids) {
  const next = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  if (next.size === __selectedSceneItemIds.size &&
      [...next].every((id) => __selectedSceneItemIds.has(id))) return;
  __selectedSceneItemIds = next;
  document.querySelectorAll("[data-tracker-card='1']").forEach(__applyTrackerSelectionState);
}

async function __refreshTrackerSelectionFromScene() {
  if (__playerSelectionPollBusy) return;
  __playerSelectionPollBusy = true;
  try { __setTrackerSelection(await OBR.player.getSelection()); } catch {}
  finally { __playerSelectionPollBusy = false; }
}

async function __selectTrackerEntry(entry, event) {
  const ids = __selectionIdsForEntry(entry);
  if (!ids.length) return;
  const targetCardId = event?.currentTarget?.dataset?.itemId || entry.id;
  const additive = !!(event?.ctrlKey || event?.metaKey);
  const rangeRequested = !!event?.shiftKey;

  try {
    if (rangeRequested && __trackerSelectionAnchorId) {
      const cards = Array.from(document.querySelectorAll("[data-tracker-card='1']"));
      const anchorIndex = cards.findIndex((card) => card.dataset.itemId === __trackerSelectionAnchorId);
      const targetIndex = cards.findIndex((card) => card.dataset.itemId === targetCardId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const rangeIds = Array.from(new Set(cards
          .slice(start, end + 1)
          .flatMap((card) => Array.isArray(card.__selectionItemIds) ? card.__selectionItemIds : [])
          .filter(Boolean)));
        if (rangeIds.length) {
          const next = additive
            ? new Set([...__selectedSceneItemIds, ...rangeIds])
            : new Set(rangeIds);
          __setTrackerSelection([...next]);
          await OBR.player.select(rangeIds, !additive);
          return;
        }
      }
    }

    if (!additive) {
      __setTrackerSelection(ids);
      await OBR.player.select(ids, true);
      __trackerSelectionAnchorId = targetCardId;
      return;
    }

    const allSelected = ids.every((id) => __selectedSceneItemIds.has(id));
    const next = new Set(__selectedSceneItemIds);
    for (const id of ids) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    __setTrackerSelection([...next]);
    if (allSelected) await OBR.player.deselect(ids);
    else await OBR.player.select(ids, false);
    __trackerSelectionAnchorId = targetCardId;
  } catch (err) {
    console.warn("[initiative] tracker selection error:", err?.message || err);
    try { __setTrackerSelection(await OBR.player.getSelection()); } catch {}
  }
}

async function __mountTrackerSelectionSync() {
  if (__playerSelectionUnsubscribe) return;
  await __refreshTrackerSelectionFromScene();
  __playerSelectionUnsubscribe = OBR.player.onChange((player) => {
    if (Array.isArray(player?.selection)) __setTrackerSelection(player.selection);
  });
  __playerSelectionPollTimer = window.setInterval(__refreshTrackerSelectionFromScene, 1500);
}

// Collassa TUTTI i gruppi (len>1) tranne quello dell'elemento attivo
async function __applyAutoCollapse(entries, state, metadataRevision = null) {
  if (metadataRevision !== null && metadataRevision !== __initiativeMetadataRevision) {
    __initiativeDiag("collapse:skipped-stale", {
      activeId: __activeIdForState(state),
      metadataRevision,
      latestMetadataRevision: __initiativeMetadataRevision,
    });
    return false;
  }
  const { collapsed, changed } = __autoCollapseSnapshot(entries, state);
  if (changed) {
    await setSceneState(prev => {
      if (metadataRevision !== null && metadataRevision !== __initiativeMetadataRevision) {
        return prev;
      }
      return { ...(prev || {}), collapsed };
    });
    if (metadataRevision !== null && metadataRevision !== __initiativeMetadataRevision) {
      __initiativeDiag("collapse:skipped-stale", {
        activeId: __activeIdForState(state),
        metadataRevision,
        latestMetadataRevision: __initiativeMetadataRevision,
      });
      return false;
    }
  }
  __initiativeDiag(changed ? "collapse:changed" : "collapse:unchanged", {
    activeId: __activeIdForState(state),
  });
  return changed;
}

// Slate payload minimale per un'etichetta monoriga
function _mkSlateParagraph(text) {
  return [{ type: "paragraph", children: [{ text: String(text || "") }] }];
}

// --- Grouping per propagazione: identico alle tab visive ---
function _groupKeyFromEntry(e) {
  const { base } = _parseIndexedName(e.name || "");
  return `${e.attitude || "ally"}${__GROUP_SEP}${base}`;
}

async function _getGroupForItemId(itemId) {
  const entries = await readEntries();
  const me = entries.find(x => x.id === itemId);
  if (!me) return { key: null, members: [], me: null, entries };
  const key = _groupKeyFromEntry(me);
  const members = entries.filter(x => _groupKeyFromEntry(x) === key).map(x => x.id);
  return { key, members, me, entries };
}
// Raccoglie i group-key (attitude + base-name) attualmente presenti in scena
async function __currentSeedGroupKeySet(sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-read")) return new Set();
  const entries = await readEntries(); // solo token reali
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-read")) return new Set();
  const keys = new Set();
  for (const e of entries) {
    const k = _groupKeyFromEntry(e);
    if (k) keys.add(k);
  }
  return keys;
}

// Rimuove da state.seededGroups le chiavi che non hanno più membri in scena
async function __gcSeededGroups(sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-gc")) return false;
  const st = await getSceneState();
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-gc")) return false;
  const prev = (st && st.seededGroups) || {};
  const present = await __currentSeedGroupKeySet(sceneEpoch);
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-gc")) return false;

  let changed = false;
  const next = { ...prev };
  for (const k of Object.keys(prev)) {
    if (!present.has(k)) { // gruppo scomparso → sblocca autofill futuro
      delete next[k];
      changed = true;
    }
  }
  if (changed) {
    if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-gc-write")) return false;
    await setSceneState(p => ({ ...(p || {}), seededGroups: next }), sceneEpoch);
    if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-gc-write")) return false;
  }
  return changed;
}

// Backfill di iniziativa per i gruppi già seedati quando compaiono nuovi membri
async function __backfillInitiativeForSeededGroups(sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-backfill")) return false;
  const st = await getSceneState();
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-backfill")) return false;
  const seeded = st?.seededGroups || {};
  const keys = Object.keys(seeded).filter(k => seeded[k]?.initiative);
  if (!keys.length) return false;

  // prendi tutti i token "tracciati" (con il nostro META_KEY)
  const all = await OBR.scene.items.getItems();
  if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-backfill")) return false;
  const tracked = all.filter(it => it?.metadata?.[META_KEY]);
  let changed = false;

  // Raggruppa con la stessa chiave usata dalle tab del tracker.
  const byKey = new Map();
  for (const it of tracked) {
    const meta = it.metadata?.[META_KEY] || {};
    const entryLike = { name: it.name || "", attitude: meta.attitude || "ally" };
    const key = _groupKeyFromEntry(entryLike);
    if (!keys.includes(key)) continue;              // solo gruppi già seedati per iniziativa
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }

  for (const k of keys) {
    const items = byKey.get(k) || [];
    if (items.length <= 1) continue;

    // scegli un valore "seed" dal primo membro con initTouched=true (fallback: qualunque >0)
    let seed = null;
    for (const it of items) {
      const m = it.metadata?.[META_KEY] || {};
      if (m.epic) continue;
      if (m.initTouched === true && Number.isFinite(m.initiative) && Number(m.initiative) !== 0) {
        seed = Math.floor(Number(m.initiative)); break;
      }
    }
    if (seed === null) {
      for (const it of items) {
        const m = it.metadata?.[META_KEY] || {};
        if (m.epic) continue;
        if (Number.isFinite(m.initiative) && Number(m.initiative) !== 0) {
          seed = Math.floor(Number(m.initiative)); break;
        }
      }
    }
    if (!Number.isFinite(seed)) continue;

    // target = nuovi membri non-epic con iniziativa mancante/zero e non "toccati"
    const targets = items
      .filter(it => {
        const m = it.metadata?.[META_KEY] || {};
        if (m.epic) return false;
        const touched = m.initTouched === true;
        const ini = m.initiative;
        const hasIni = ini !== undefined && ini !== null;
        return !touched && (!hasIni || Number(ini) === 0);
      })
      .map(it => it.id);

    if (!targets.length) continue;

    if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-backfill-write")) return false;
    await OBR.scene.items.updateItems(targets, (list) => {
      if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-backfill-write")) return;
      for (const it of list) {
        const prev = it.metadata?.[META_KEY] || {};
        it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prev, initiative: seed, initTouched: true } };
      }
    });
    if (!__isCurrentSceneOperation(sceneEpoch, "seed-groups-backfill-write")) return false;
    changed = true;
  }
  return changed;
}

// Propagazione iniziativa al gruppo (prima volta + backfill per nuovi membri)
async function trySeedGroupInitiative(itemId, value, options = {}) {
  const st = await getSceneState();
  const { key, members } = await _getGroupForItemId(itemId);
  if (!key || members.length <= 1) return;

  const already = !!st?.seededGroups?.[key]?.initiative;

  // carica gli item reali del gruppo
  const items = await OBR.scene.items.getItems(members);

  // Non toccare mai gli Epic
  const notEpic = (it) => !(it.metadata?.[META_KEY]?.epic);

  // target:
  // - prima volta: tutti i non-epic
  // - backfill: solo i non-epic con initiative mancante O zero e NON "toccati" (initTouched !== true)
  let targetIds;
  if (options.forceAll === true || !already) {
    targetIds = items.filter(notEpic).map(it => it.id);
  } else {
  targetIds = items
    .filter(notEpic)
    .filter(it => (it.metadata?.[META_KEY]?.initTouched !== true))
    .map(it => it.id);
    if (targetIds.length === 0) return; // niente da backfillare
  }

  const val = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;

  await OBR.scene.items.updateItems(targetIds, (list) => {
    for (const it of list) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, initiative: val, initTouched: true } // ⟵ segna come “toccato”
      };
    }
  });

  // Se era la prima volta, marca il gruppo come seedato per iniziativa
  if (!already) {
    await setSceneState(prev => ({
      ...(prev || { order: [], current: 0, round: 1 }),
      seededGroups: {
        ...(prev?.seededGroups || {}),
        [key]: { ...(prev?.seededGroups?.[key] || {}), initiative: true }
      }
    }));
  }

  if (!options.deferRender) {
    await reconcileStateWithItems();
    await renderAll();
  }
}

// Propagazione HP/HPMax al gruppo con backfill per nuovi membri
async function trySeedGroupHP(itemId, hp, hpMax) {
  const st = await getSceneState();
  const { key, members } = await _getGroupForItemId(itemId);
  if (!key || members.length <= 1) return;

  const already = !!st?.seededGroups?.[key]?.hp;

  // Un HP massimo positivo indica che il membro è già stato inizializzato.
  // Conserva sia i mostri danneggiati sia quelli a 0 HP, e riempi in un solo
  // passaggio tutti i fratelli ancora vuoti o compilati solo a metà.
  const items = await OBR.scene.items.getItems(members);
  const targetIds = items
    .filter(it => it.id !== itemId)
    .filter(it => {
      const memberHPMax = Number(it.metadata?.[META_KEY]?.hpMax);
      return !Number.isFinite(memberHPMax) || memberHPMax <= 0;
    })
    .map(it => it.id);
  if (targetIds.length === 0) return;

  const nHP  = Math.max(0, Math.floor(Number(hp)    || 0));
  const nMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  const nHPclamped = nMax > 0 ? Math.min(nHP, nMax) : nHP;

  await OBR.scene.items.updateItems(targetIds, (list) => {
    for (const it of list) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prevMeta, hp: nHPclamped, hpMax: nMax } };
    }
  });
  await reconcileZeroHPConditionsForItems(targetIds);

  // Modifica
  // aggiorna subito barre + testo (best-effort)
  try {
    const { syncHPBarNow, syncHPTextNow } = await import("./hpbar-items.js");
    for (const id of targetIds) {
      syncHPBarNow(id, nHPclamped, nMax);
      syncHPTextNow(id, nHPclamped, nMax);
      syncTrackerHPNow(id, nHPclamped, nMax);
    }
  } catch (err) {
    console.warn("[hpbar/hptext] group backfill error", err?.message || err);
  }

  // Se era la prima volta, marca il gruppo come seedato per HP
  if (!already) {
    await setSceneState(prev => ({
      ...(prev || { order: [], current: 0, round: 1 }),
      seededGroups: {
        ...(prev?.seededGroups || {}),
        [key]: { ...(prev?.seededGroups?.[key] || {}), hp: true }
      }
    }));
  }
}

/**
 * Aggiorna la label visibile dei token rinominati.
 * Copre tutti i casi: text su root o su item.image, stringa/plainText/richText/Slate.
 * "updates": array di { id: tokenId, nameWanted: string }.
 */
async function _syncAttachedLabels(updates) {
  if (!updates?.length) return;

  const wantedById = new Map(updates.map(u => [u.id, u.nameWanted]));
  const ids = Array.from(wantedById.keys());

  const toSlate = (txt) => [{ type: "paragraph", children: [{ text: String(txt) }] }];

  const setTextOn = (holder, txt) => {
    if (!holder || !("text" in holder)) return false;
    const val = holder.text;

    if (typeof val === "string" || val === undefined || val === null) {
      holder.text = String(txt);
    } else if (Array.isArray(val)) {
      // già Slate → sostituisco
      holder.text = toSlate(txt);
    } else if (typeof val === "object") {
      // varianti note: { plainText }, { richText }
      if ("plainText" in val) val.plainText = String(txt);
      else if ("richText" in val) val.richText = toSlate(txt);
      else holder.text = toSlate(txt); // fallback
    } else {
      holder.text = String(txt);
    }

    // se esiste, assicura che venga mostrata come LABEL
    if ("textItemType" in holder) holder.textItemType = "LABEL";
    return true;
  };

  await OBR.scene.items.updateItems(ids, (itemsToUpdate) => {
    for (const it of itemsToUpdate) {
      const newText = wantedById.get(it.id);
      if (!newText) continue;

      // 1) prova sul root dell’item
      let ok = setTextOn(it, newText);

      // 2) prova anche sul sotto-oggetto image (alcuni build lo tengono lì)
      if (it.image && typeof it.image === "object") {
        if (!ok) ok = setTextOn(it.image, newText);
        // forza comunque il tipo LABEL se presente solo qui
        if ("textItemType" in it.image) it.image.textItemType = "LABEL";
      }

      // 3) best-effort: se il root espone direttamente textItemType, imposta LABEL
      if ("textItemType" in it) it.textItemType = "LABEL";
    }
  });
}

// Rinomina solo i nuovi e mantiene stabili gli indici esistenti.
// Inoltre sincronizza SEMPRE le label (anche se non c’è stato un rename).
async function enforceUniqueNamePrefixes() {
  const items   = await OBR.scene.items.getItems();
  const tracked = items.filter(it => it.metadata?.[META_KEY]);

  // Raggruppa per base pulita
  const groups = new Map();
  for (const it of tracked) {
    const { index, base } = _parseIndexedName(it.name);
    const key = base || "Unnamed";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: it.id, name: it.name || "", base: key, index });
  }

  const renames   = [];
  const labelSync = [];

  for (const [base, arr] of groups) {
    if (arr.length <= 1) continue;

    // Ordine deterministico per conflitti/assegnazioni
    arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const used      = new Set();
    const keepers   = [];
    const unassigned = [];

    // Mantieni gli indici validi unici; il resto passa in "unassigned"
    for (const e of arr) {
      if (Number.isInteger(e.index) && e.index > 0 && !used.has(e.index)) {
        used.add(e.index);
        keepers.push(e);
      } else {
        unassigned.push(e);
      }
    }

    // Il prossimo indice parte dal MAX esistente: niente rinumerazioni
    let maxIndex = 0;
    for (const k of keepers) maxIndex = Math.max(maxIndex, k.index || 0);

    // Assegna indici nuovi solo ai non assegnati
    for (const u of unassigned) {
      maxIndex += 1;
      u.index = maxIndex;
    }

    // Costruisci i nomi finali e prepara rename + sync label
    for (const e of [...keepers, ...unassigned]) {
      const want = _indexName(base, e.index);
      labelSync.push({ id: e.id, nameWanted: want });        // sync SEMPRE
      if (e.name !== want) renames.push({ id: e.id, nameWanted: want }); // rename solo se serve
    }
  }

  if (renames.length) {
    await OBR.scene.items.updateItems(
      renames.map(u => u.id),
      (list) => {
        for (const it of list) {
          const u = renames.find(x => x.id === it.id);
          if (u) it.name = u.nameWanted;
        }
      }
    );
  }

  if (labelSync.length) {
    await _syncAttachedLabels(labelSync); // aggiorna la label anche senza rename
  }
}

async function updateHP(itemId, nextHP, nextHPMax) {
  const n  = nextHP    === "" ? 0 : Math.floor(Number(nextHP)    || 0);
  const nm = nextHPMax === "" ? 0 : Math.floor(Number(nextHPMax) || 0);

  // Avvia subito l'aggiornamento visivo, senza aspettare il round-trip dei metadata.
  syncHPBarNow(itemId, n, nm);
  void syncHPTextNow(itemId, n, nm);
  syncTrackerHPNow(itemId, n, nm);

  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) {
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, hp: n, hpMax: nm },
      };
    }
  });
  await reconcileZeroHPConditionsForItems([itemId]);


  // NEW: salva nella memoria stanza (cross‑scene) se è un PG
  try {
    await saveHPToMemoryByItemId(itemId, n, nm);
  } catch (err) {
    console.warn("[hpMemory] save error:", err?.message || err);
  }
}

function parseRelativeHPDelta(value) {
  const match = /^([+\-])(\d+)$/.exec(String(value || "").trim());
  if (!match) return null;
  const amount = Math.floor(Number(match[2]) || 0);
  return match[1] === "-" ? -amount : amount;
}

let __concentrationWarningListenerMounted = false;
let __concentrationWarningPopoverOpen = false;
let __concentrationWarningUiReady = false;
let __concentrationWarningPumpRunning = false;
let __concentrationWarningPumpRequested = false;
let __concentrationWarningCleanupPromise = null;
const __concentrationWarningsByActivationId = new Map();

function normalizeConcentrationWarnings(values = []) {
  return (Array.isArray(values) ? values : []).slice(0, 20).map((warning) => ({
    name: String(warning?.name || "Token").trim().slice(0, 80) || "Token",
    damage: Math.max(0, Math.floor(Number(warning?.damage) || 0)),
    dc: Math.max(10, Math.floor(Number(warning?.dc) || 10)),
    portrait: String(warning?.portrait || "").trim().slice(0, 2048),
    attitude: String(warning?.attitude || "neutral").trim().toLowerCase(),
    spellName: String(warning?.spellName || "").trim().slice(0, 240),
    notice: warning?.notice && typeof warning.notice === "object"
      ? warning.notice
      : null,
  })).filter((warning) => warning.damage > 0);
}

async function openConcentrationWarningModal(data) {
  const warnings = normalizeConcentrationWarnings(data?.warnings);
  if (!warnings.length) return;

  const height = Math.min(288, 122 + Math.max(0, warnings.length - 1) * 25);
  if (__concentrationWarningPopoverOpen) {
    void OBR.popover.setHeight(CONCENTRATION_WARNING_MODAL_ID, height).catch(() => {});
    if (__concentrationWarningUiReady) {
      await OBR.broadcast.sendMessage(
        CONCENTRATION_WARNING_UI_CHANNEL,
        { type: "update-concentration-warnings", warnings },
        { destination: "LOCAL" },
      );
    }
    return;
  }

  let viewportWidth = 1200;
  let viewportHeight = 800;
  const [reportedWidth, reportedHeight] = await Promise.all([
    OBR.viewport.getWidth().catch(() => viewportWidth),
    OBR.viewport.getHeight().catch(() => viewportHeight),
  ]);
  viewportWidth = Number(reportedWidth) || viewportWidth;
  viewportHeight = Number(reportedHeight) || viewportHeight;
  const cardWidth = Math.min(500, Math.max(312, viewportWidth - 40));
  const width = cardWidth + 8;
  const top = Math.max(12, Math.round(viewportHeight * 0.09));
  const payload = encodeURIComponent(JSON.stringify({ warnings }));
  await OBR.popover.open({
    id: CONCENTRATION_WARNING_MODAL_ID,
    url: `/concentration-warning.html?payload=${payload}`,
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: { left: viewportWidth / 2, top: Math.max(8, top - 4) },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 12,
  });
  __concentrationWarningPopoverOpen = true;
  if (__concentrationWarningUiReady) {
    await OBR.broadcast.sendMessage(
      CONCENTRATION_WARNING_UI_CHANNEL,
      { type: "update-concentration-warnings", warnings },
      { destination: "LOCAL" },
    );
  }
}

function concentrationWarningActivationId(warning, index, createdAt) {
  return String(warning?.notice?.activationId || "").trim()
    || `${createdAt}:${index}:${warning?.name || "Token"}`;
}

function requestConcentrationWarningPump() {
  __concentrationWarningPumpRequested = true;
  if (__concentrationWarningPumpRunning) return;
  __concentrationWarningPumpRunning = true;
  const run = async () => {
    try {
      if (__concentrationWarningCleanupPromise) {
        await __concentrationWarningCleanupPromise;
        __concentrationWarningCleanupPromise = null;
      }
      while (__concentrationWarningPumpRequested) {
        __concentrationWarningPumpRequested = false;
        await openConcentrationWarningModal({
          warnings: [...__concentrationWarningsByActivationId.values()],
        });
      }
    } catch (err) {
      console.warn("[concentration] warning popover:", err?.message || err);
    } finally {
      __concentrationWarningPumpRunning = false;
      if (__concentrationWarningPumpRequested) requestConcentrationWarningPump();
    }
  };
  void run();
}

function mountConcentrationWarningBroadcast() {
  if (__concentrationWarningListenerMounted) return;
  __concentrationWarningListenerMounted = true;
  __concentrationWarningCleanupPromise = Promise.all([
    OBR.modal.close(CONCENTRATION_WARNING_MODAL_ID).catch(() => {}),
    OBR.popover.close(CONCENTRATION_WARNING_MODAL_ID).catch(() => {}),
  ]).then(() => {});
  OBR.broadcast.onMessage(CONCENTRATION_WARNING_CHANNEL, (event) => {
    if (event?.data?.type !== "show-concentration-warning") return;
    const createdAt = Math.max(0, Math.floor(Number(event.data?.createdAt) || Date.now()));
    const warnings = normalizeConcentrationWarnings(event.data?.warnings);
    warnings.forEach((warning, index) => {
      __concentrationWarningsByActivationId.set(
        concentrationWarningActivationId(warning, index, createdAt),
        warning,
      );
    });
    if (warnings.length) requestConcentrationWarningPump();
  });
  OBR.broadcast.onMessage(CONCENTRATION_WARNING_HOST_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type === "concentration-warning-ready") {
      __concentrationWarningUiReady = true;
      if (__concentrationWarningsByActivationId.size) requestConcentrationWarningPump();
      return;
    }
    if (data?.type === "concentration-warning-resolved") {
      const activationId = String(data?.activationId || "").trim();
      if (activationId) __concentrationWarningsByActivationId.delete(activationId);
      if (__concentrationWarningsByActivationId.size) requestConcentrationWarningPump();
      return;
    }
    if (data?.type === "concentration-warning-closed") {
      __concentrationWarningPopoverOpen = false;
      __concentrationWarningUiReady = false;
      __concentrationWarningsByActivationId.clear();
    }
  });
}

let __turnNoticeSequence = 0;
let __effectSaveDamageSequence = 0;
let __lastTurnNoticeDeliveryKey = "";

async function __sendTurnNoticePayload(notice, sceneEpoch) {
  if (!__isCurrentSceneOperation(sceneEpoch, "turn-notice")) return false;
  await OBR.broadcast.sendMessage(TURN_NOTICE_CHANNEL, {
    type: "show-turn-notice",
    sceneEpoch,
    ...notice,
    noticeId: (Date.now() * 1000) + (++__turnNoticeSequence % 1000),
  }, { destination: "ALL" });
  return __isCurrentSceneOperation(sceneEpoch, "turn-notice");
}

async function broadcastTurnNotice(state, sceneEpoch = currentSceneEpoch()) {
  if (!IS_GM || !__isCurrentSceneOperation(sceneEpoch, "turn-notice")) return false;
  const notice = buildTurnNoticePayload(state, __activeLabelEntriesById);
  if (!notice || !__isCurrentSceneOperation(sceneEpoch, "turn-notice")) return false;
  const deliveryKey = `${sceneEpoch}:${notice.turnKey}`;
  if (deliveryKey === __lastTurnNoticeDeliveryKey) return false;
  __lastTurnNoticeDeliveryKey = deliveryKey;
  return __sendTurnNoticePayload(notice, sceneEpoch);
}

async function showConcentrationDamageWarning(changes = []) {
  if (!IS_GM) return;

  const damageById = new Map();
  for (const change of changes) {
    const itemId = String(change?.itemId || "").trim();
    const damage = Math.max(0, Math.floor(Number(change?.damage) || 0));
    if (!itemId || damage <= 0) continue;
    damageById.set(itemId, Math.max(damageById.get(itemId) || 0, damage));
  }
  if (!damageById.size) return;

  const items = await OBR.scene.items.getItems([...damageById.keys()]);
  const missingSourceIds = effectSaveReminderSourceIds(items)
    .filter((itemId) => !damageById.has(itemId));
  const reminderItems = missingSourceIds.length
    ? items.concat(await OBR.scene.items.getItems(missingSourceIds))
    : items;
  const effectNotices = effectSaveReminderNoticesForDamage({
    items: reminderItems,
    damageById,
    eventId: `${Date.now()}-${++__effectSaveDamageSequence}`,
  });
  const broadcasts = [broadcastConcentrationSaveWarnings(
    [...damageById].map(([itemId, damage]) => ({ itemId, damage })),
    { items },
  )];
  if (effectNotices.length) {
    broadcasts.push(sendProjectedReminderPayload(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, {
      type: "show-effect-save-notices",
      notices: effectNotices,
    }));
  }
  await Promise.all(broadcasts);
}

async function updateMultipleHP(updates = []) {
  const byId = new Map();
  for (const update of updates) {
    const itemId = String(update?.itemId || "").trim();
    if (!itemId) continue;
    byId.set(itemId, {
      itemId,
      hp: Math.max(0, Math.floor(Number(update?.hp) || 0)),
      hpMax: Math.max(0, Math.floor(Number(update?.hpMax) || 0)),
    });
  }
  if (!byId.size) return;

  for (const update of byId.values()) {
    syncHPBarNow(update.itemId, update.hp, update.hpMax);
    void syncHPTextNow(update.itemId, update.hp, update.hpMax);
    syncTrackerHPNow(update.itemId, update.hp, update.hpMax);
  }

  await OBR.scene.items.updateItems([...byId.keys()], (items) => {
    for (const it of items) {
      const update = byId.get(it.id);
      if (!update) continue;
      const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
      it.metadata = {
        ...(it.metadata || {}),
        [META_KEY]: { ...prevMeta, hp: update.hp, hpMax: update.hpMax },
      };
    }
  });
  await reconcileZeroHPConditionsForItems([...byId.keys()]);

  for (const update of byId.values()) {
    try {
      await saveHPToMemoryByItemId(update.itemId, update.hp, update.hpMax);
    } catch (err) {
      console.warn("[hpMemory] multi save error:", err?.message || err);
    }
  }
}

async function applyGroupHPMaxDelta(itemId, delta) {
  const amount = Math.floor(Number(delta) || 0);
  if (!amount) return 0;

  const { members, me } = await _getGroupForItemId(itemId);
  if (members.length <= 1) return 0;

  const items = await OBR.scene.items.getItems(members);
  const updates = items
    .filter((item) => item.metadata?.[META_KEY]?.inInitiative === true)
    .map((item) => {
      const meta = item.metadata?.[META_KEY] || {};
      const hp = Math.max(0, Math.floor(Number(meta.hp) || 0));
      const hpMax = Math.max(0, Math.floor(Number(meta.hpMax) || 0));
      return {
        itemId: item.id,
        hp: Math.max(0, hp + amount),
        hpMax: Math.max(0, hpMax + amount),
      };
    });
  if (updates.length <= 1) return 0;

  const groupName = _parseIndexedName(me?.name || "Gruppo").base || "Gruppo";
  const historyIds = await getZeroHPConditionHistoryIds(
    updates.map((update) => update.itemId)
  );
  await withItemMetaHistory({
    kind: "hp",
    label: `Ricalibrazione HP/Max gruppo: ${groupName} (×${updates.length})`,
    itemIds: historyIds,
    fields: ["hp", "hpMax", "conditions", SPELLS_META_KEY, CONC_META_KEY],
  }, () => updateMultipleHP(updates));

  return updates.length;
}

async function applyGroupHPMaxDeltaWithRenderLock(itemId, delta) {
  const wasSuspended = __suspendRenders;
  __suspendRenders = true;
  try {
    return await applyGroupHPMaxDelta(itemId, delta);
  } finally {
    __suspendRenders = wasSuspended;
  }
}

function getEditingHPForId() {
  return __editingHPForId;
}

    // ===== Colori fazione (border/glow + base per i gradienti)
  function factionColors(att) {
  switch (att) {
    case "enemy":
      return {
        border: "#ef4444",
        glow: "rgba(239,68,68,.28)",
        base: "#ef4444",
      };
    case "neutral":
      return {
        border: "#eab308",
        glow: "rgba(234,179,8,.24)",
        base: "#eab308",
      };
    case "pc": // NEW: azzurro per i personaggi
      return {
        border: "#3AA7FF",
        glow: "rgba(58,167,255,.28)",
        base: "#3AA7FF",
      };
    default: // ally
      return {
        border: "#22c55e",
        glow: "rgba(34,197,94,.28)",
        base: "#22c55e",
      };
  }
}

  // helper: hex -> rgba con alpha
  function rgba(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex; // fallback se già rgba
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function clamp01(n){ return Math.max(0, Math.min(1, n)); }
  function hpColorByPct(p){
    if (p > 0.66) return "#16a34a"; // verde
    if (p > 0.33) return "#facc15"; // giallo
    return "#dc2626";               // rosso
  }

  // Mostra "cur/max"; se cur > max, colora cur per indicare Temp HP
  // Mostra "cur/max"; se cur > max, colora cur per indicare Temp HP
  function formatHPHTML(cur, max) {
  const nCur = Math.max(0, Math.floor(Number(cur) || 0));
  const nMax = Math.max(0, Math.floor(Number(max) || 0));
  const hasTemp = nMax > 0 && nCur > nMax;

  // azzurro leggibile (coerente con palette PC)
  const tempColor = "#3AA7FF";

  if (hasTemp) {
    // pointer-events:none → il click passa alla pill (evitiamo target=span)
    return `<span style="color:${tempColor};pointer-events:none">${nCur}</span>/${nMax}`;
  }
  return `${nCur}/${nMax}`;
}

function syncTrackerHPNow(itemId, hp, hpMax) {
  const nHP = Math.max(0, Math.floor(Number(hp) || 0));
  const nHPMax = Math.max(0, Math.floor(Number(hpMax) || 0));
  const hasHP = nHPMax > 0;
  const pct = hasHP ? Math.max(0, Math.min(1, nHP / nHPMax)) : 0;
  for (const pill of document.querySelectorAll('[data-spell-board-token-hp="1"]')) {
    if (pill.dataset.itemId !== String(itemId) || pill.dataset.hpEditing === "1") continue;
    pill.textContent = `HP ${nHP} / ${nHPMax}`;
    const label = pill.dataset.spellBoardTokenLabel || "Mano arcana";
    pill.title = `Punti ferita di ${label}. Clicca per modificare`;
  }
  const cards = Array.from(document.querySelectorAll("[data-tracker-card='1']"))
    .filter((card) => card.dataset.itemId === String(itemId) ||
      card.__selectionItemIds?.includes(String(itemId)));

  if (!IS_GM && cards.some((card) => (card.__hpMode || "hidden") !== "exact")) {
    void renderAll("hp-projection");
    return;
  }

  for (const card of cards) {
    const canSeeHP = card.dataset.hpCanSee === "1";
    const showHP = canSeeHP && hasHP;
    const knockedOut = showHP && card.dataset.groupCollapsed !== "1" && nHP <= 0;
    card.dataset.hpVisible = showHP ? "1" : "0";
    card.dataset.knockedOut = knockedOut ? "1" : "0";
    card.style.filter = knockedOut
      ? "saturate(.42) brightness(.72)"
      : card.dataset.compactCard === "1" && card.dataset.active === "1"
        ? "brightness(1.13)"
        : "none";
    card.style.opacity = knockedOut ? ".84" : "1";

    const pill = card.querySelector("[data-badge='hp']");
    if (pill && pill.dataset.hpEditing !== "1") {
      pill.innerHTML = formatHPHTML(nHP, nHPMax);
      pill.style.color = knockedOut ? "rgba(255,255,255,.58)" : "#fff";
    }

    const hpText = card.querySelector("[data-card-hp-text='1']");
    if (hpText) {
      hpText.textContent = showHP ? `HP ${nHP} / ${nHPMax}` : "";
      hpText.style.display = showHP ? "block" : "none";
      hpText.style.color = knockedOut ? "rgba(255,255,255,.58)" : "rgba(226,232,240,.82)";
    }

    const fill = card.querySelector("[data-hp-fill='1']");
    if (fill) {
      fill.style.width = `${pct * 100}%`;
      fill.style.background = knockedOut ? "#475569" : hpColorByPct(pct);
      if (fill.parentElement) fill.parentElement.style.display = showHP ? "block" : "none";
    }

    let koBadge = card.querySelector("[data-card-ko-badge='1']");
    if (knockedOut && !koBadge) {
      koBadge = compactStatusBadge("KO", `Fuori combattimento: 0 / ${nHPMax}`);
      koBadge.dataset.cardKoBadge = "1";
      Object.assign(koBadge.style, card.dataset.compactCard === "1" ? {
        position: "absolute", right: "6px", top: "6px", height: "21px",
        zIndex: "6", pointerEvents: "none",
      } : {
        position: "absolute", left: card.dataset.koBadgeLeft || "42px",
        top: card.dataset.koBadgeTop || "1px", height: "20px", minWidth: "25px",
        zIndex: "8", pointerEvents: "none",
      });
      card.appendChild(koBadge);
    } else if (!knockedOut) {
      koBadge?.remove();
    } else if (koBadge) {
      koBadge.title = `Fuori combattimento: 0 / ${nHPMax}`;
    }
  }
}

  // aggiorna l'iniziativa del token e riallinea l'ordine
  async function updateInitiative(itemId, nextVal) {
  const val = Number.isFinite(Number(nextVal)) ? Math.floor(Number(nextVal)) : 0;
  const { baseId, idx } = splitParagonId(itemId);

  // aggiorna stato per-card
  await setSceneState(prev => {
    const p = { ...(prev?.paragonInits || {}) };
    const arr = Array.isArray(p[baseId]) ? p[baseId].slice() : [];
    const wantLen = Math.max(arr.length, idx + 1);
    while (arr.length < wantLen) arr.push(val);
    arr[idx] = val;
    p[baseId] = arr;
    return { ...(prev || {}), paragonInits: p };
  });

  // se è il card 0 (base), scrivi anche nel token per coerenza con la logica esistente
  if (idx === 0) {
    await OBR.scene.items.updateItems([baseId], (items) => {
      for (const it of items) {
        const prevMeta = (it.metadata && it.metadata[META_KEY]) || {};
        it.metadata = { ...(it.metadata || {}), [META_KEY]: { ...prevMeta, initiative: val, initTouched: true }  };
      }
    });
  }
}

function bindInitiativeEditorForEntry(badge, entry) {
  bindClassicInitiativeEditor({
    badge,
    isEditable: () => !entry.isEpic && !entry.isEpicAction,
    armClickIgnore: armDocClickIgnore,
    beginEdit: async () => {
      __suspendRenders = true;
      __editingInitForId = entry.id;
      await closeOpenEditors();
    },
    readValue: async () => {
      let liveInitiative = null;
      try {
        const [live] = await OBR.scene.items.getItems([entry.id]);
        const meta = live?.metadata?.[META_KEY] || {};
        if (Number.isFinite(meta.initiative)) {
          liveInitiative = Math.floor(Number(meta.initiative));
        }
      } catch {}
      return liveInitiative ??
        (Number.isFinite(entry.initiative)
          ? Math.floor(Number(entry.initiative))
          : 0);
    },
    editorReady: () => {
      if (!__initiativeFillMode) __suspendRenders = false;
    },
    cleanupEdit: () => {
      __editingInitForId = null;
      __scheduleEditorDirtyFlush();
    },
    saveValue: async (normalized) => {
      await updateInitiative(entry.id, normalized);
      try {
        await trySeedGroupInitiative(entry.id, normalized, {
          deferRender: __initiativeFillMode,
          forceAll: entry.__groupCollapsed === true,
        });
      } catch (error) {
        console.warn(error);
      }
    },
    afterCommit: async () => {
      if (__initiativeFillMode) {
        __initiativeFillSession?.completed?.add(entry.id);
        refreshInitiativeFillVisuals();
        return;
      }
      await reconcileStateWithItems();
      await renderAll();
      requestAnimationFrame(() => {
        const currentCard = document.querySelector(
          `[data-item-id="${entry.id}"]`
        );
        currentCard?.scrollIntoView?.({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      });
    },
    afterCancel: async (options = {}) => {
      if (options.deferRender === true) return;
      if (__initiativeFillMode) await finishInitiativeFillMode();
      else await renderAll();
    },
    isFillMode: () => __initiativeFillMode,
    finishFillMode: finishInitiativeFillMode,
    openFillNeighbor: (goPrev) =>
      openInitiativeFillNeighbor(entry.id, goPrev),
    commitAndOpenNeighbor: async ({ goPrev, commit }) => {
      let preOrder = [];
      try {
        const state = await getSceneState();
        preOrder = Array.isArray(state?.order) ? [...state.order] : [];
      } catch {}

      await commit();
      const direction = goPrev ? -1 : 1;
      const index = preOrder.indexOf(entry.id);
      let targetId = null;
      for (
        let cursor = index + direction;
        index >= 0 && cursor >= 0 && cursor < preOrder.length;
        cursor += direction
      ) {
        const candidateId = preOrder[cursor];
        const candidateCard = document.querySelector(
          `[data-item-id="${candidateId}"]`
        );
        const candidateBadge = document.querySelector(
          `[data-badge="init"][data-item-id="${candidateId}"]`
        );
        const editable = !!candidateBadge &&
          candidateCard?.dataset.groupCollapsed !== "1" &&
          candidateCard?.dataset.isEpic !== "1" &&
          !isEpicActionId(candidateId);
        if (editable) {
          targetId = candidateId;
          break;
        }
      }

      if (!targetId) return;
      requestAnimationFrame(() => {
        const nextBadge = document.querySelector(
          `[data-badge="init"][data-item-id="${targetId}"]`
        );
        if (!nextBadge) return;
        nextBadge.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
        }));
        nextBadge.scrollIntoView?.({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
        const nextInput = nextBadge.querySelector("input");
        if (nextInput) {
          try {
            nextInput.focus({ preventScroll: true });
            nextInput.select();
          } catch {}
        }
      });
    },
  });
}

function bindHPEditorForEntry(
  pill,
  hpFill,
  setHPDeltaButtonActive,
  entry,
  options = {},
) {
  const customSaveValues = typeof options.saveValues === "function"
    ? options.saveValues
    : null;
  const customAfterCommit = typeof options.afterCommit === "function"
    ? options.afterCommit
    : null;
  const customCommitAndOpenNeighbor = typeof options.commitAndOpenNeighbor === "function"
    ? options.commitAndOpenNeighbor
    : null;
  bindClassicHPEditor({
    pill,
    itemId: entry.id,
    snapshotHP: entry.hp,
    snapshotHPMax: entry.hpMax,
    hpFill,
    getEditingItemId: () => __editingHPForId,
    isCurrentEditor: () => __editingHPForId === entry.id,
    armClickIgnore: armDocClickIgnore,
    handoffEditor: async () => {
      const sceneEpoch = currentSceneEpoch();
      __suspendRenders = true;
      try {
        await closeOpenEditors();
      } catch {}
      requestAnimationFrame(() => {
        if (!__isCurrentSceneOperation(sceneEpoch, "hp-editor-handoff")) return;
        armDocClickIgnore(250);
        const nextPill = document.querySelector(
          `[data-badge="hp"][data-item-id="${entry.id}"]`
        );
        nextPill?.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
        }));
        if (__isCurrentSceneOperation(sceneEpoch, "hp-editor-handoff")) {
          __suspendRenders = false;
        }
      });
    },
    beginEdit: async () => {
      __suspendRenders = true;
      __editingHPForId = entry.id;
      await closeOpenEditors();
    },
    readLiveValues: async () => {
      const values = {};
      try {
        const [live] = await OBR.scene.items.getItems([entry.id]);
        const meta = live?.metadata?.[META_KEY] || {};
        if (Number.isFinite(meta.hp)) values.hp = meta.hp;
        if (Number.isFinite(meta.hpMax)) values.hpMax = meta.hpMax;
      } catch {}
      return values;
    },
    editorReady: () => {
      __suspendRenders = false;
    },
    cleanupEdit: () => {
      __editingHPForId = null;
      __scheduleEditorDirtyFlush();
    },
    parseRelativeDelta: parseRelativeHPDelta,
    setDeltaButtonActive: setHPDeltaButtonActive,
    shouldIgnoreDocumentClick: () => Date.now() < __ignoreDocClickUntil,
    formatHP: options.formatHP || formatHPHTML,
    hpColorByPct,
    saveValues: customSaveValues || (async ({
      nextHP,
      nextHPMax,
      recalibratesMax,
    }) => {
      let historyIds = [entry.id];
      try {
        const group = await _getGroupForItemId(entry.id);
        historyIds = Array.from(new Set([
          entry.id,
          ...(group?.members || []),
        ]));
      } catch {}
      historyIds = await getZeroHPConditionHistoryIds(historyIds);

      await withItemMetaHistory({
        kind: "hp",
        label: recalibratesMax ? "Ricalibrazione HP/Max" : "Modifica HP",
        itemIds: historyIds,
        fields: [
          "hp",
          "hpMax",
          "conditions",
          SPELLS_META_KEY,
          CONC_META_KEY,
        ],
      }, async () => {
        await updateHP(entry.id, nextHP, nextHPMax);
        try {
          await trySeedGroupHP(entry.id, nextHP, nextHPMax);
        } catch (error) {
          console.warn("[hp] group seed error:", error?.message || error);
        }
      });
    }),
    afterCommit: customAfterCommit || (async ({
      recalibratesMax,
      concentrationDamage,
    }) => {
      if (recalibratesMax || concentrationDamage <= 0) return;
      try {
        await showConcentrationDamageWarning([{
          itemId: entry.id,
          damage: concentrationDamage,
        }]);
      } catch (error) {
        console.warn(
          "[concentration] damage warning error:",
          error?.message || error
        );
      }
    }),
    editableHPMax: options.editableHPMax !== false,
    commitAndOpenNeighbor: customCommitAndOpenNeighbor || (async ({ goPrev, commit }) => {
      const direction = goPrev ? -1 : 1;
      let targetId = null;
      __suspendRenders = true;
      try {
        let preOrder = [];
        try {
          const state = await getSceneState();
          preOrder = Array.isArray(state?.order) ? [...state.order] : [];
        } catch {}

        await commit();
        const index = preOrder.indexOf(entry.id);
        for (
          let cursor = index + direction;
          index >= 0 && cursor >= 0 && cursor < preOrder.length;
          cursor += direction
        ) {
          const candidateId = preOrder[cursor];
          const candidateCard = document.querySelector(
            `[data-item-id="${candidateId}"]`
          );
          const candidatePill = document.querySelector(
            `[data-badge="hp"][data-item-id="${candidateId}"]`
          );
          const editable = !!candidatePill &&
            candidateCard?.dataset.groupCollapsed !== "1" &&
            !isEpicActionId(candidateId);
          if (editable) {
            targetId = candidateId;
            break;
          }
        }

        if (!targetId) {
          __suspendRenders = false;
          return;
        }
        requestAnimationFrame(() => {
          const nextPill = document.querySelector(
            `[data-badge="hp"][data-item-id="${targetId}"]`
          );
          if (!nextPill) {
            __suspendRenders = false;
            return;
          }
          armDocClickIgnore(250);
          nextPill.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
          }));
          nextPill.scrollIntoView?.({
            block: "center",
            inline: "nearest",
            behavior: "smooth",
          });
          requestAnimationFrame(() => {
            __suspendRenders = false;
          });
        });
      } catch (error) {
        __suspendRenders = false;
        throw error;
      }
    }),
  });
}

function bindSpellBoardTokenHPEditor(pill, boardToken, spell) {
  if (!IS_GM || !pill || !boardToken?.itemId) return;
  const hp = Math.max(0, Math.floor(Number(boardToken.state?.hp) || 0));
  const hpMax = Math.max(0, Math.floor(Number(boardToken.state?.hpMax) || 0));
  if (!hpMax) return;
  const entry = {
    id: boardToken.itemId,
    hp,
    hpMax,
    name: String(spell?.name || boardToken.label || "Mano arcana").trim(),
  };
  bindHPEditorForEntry(
    pill,
    null,
    () => {},
    entry,
    {
      editableHPMax: false,
      formatHP: (current, maximum) => (
        `HP ${Math.max(0, Math.floor(Number(current) || 0))} / ${Math.max(0, Math.floor(Number(maximum) || 0))}`
      ),
      saveValues: async ({ nextHP }) => {
        await executeSpellBoardTokenStateUpdate({
          group: {
            itemId: boardToken.itemId,
            casterId: boardToken.casterId,
            instanceId: boardToken.instanceId,
            spellId: boardToken.spellId,
            name: entry.name,
          },
          hp: Math.max(0, Math.min(hpMax, Math.floor(Number(nextHP) || 0))),
        });
      },
      afterCommit: async ({ nextHP, nextHPMax }) => {
        __suspendRenders = false;
        syncTrackerHPNow(
          boardToken.itemId,
          Math.max(0, Math.min(hpMax, Math.floor(Number(nextHP) || 0))),
          nextHPMax,
        );
        await renderAll("spell-board-token-hp");
      },
      commitAndOpenNeighbor: async ({ commit }) => {
        await commit();
        __suspendRenders = false;
      },
    },
  );
}

function bindSpellBoardTokenCompanionHPEditor(pill, companion) {
  if (!IS_GM || !pill || !companion?.itemId) return;
  bindSpellBoardTokenHPEditor(pill, companion, { name: companion.label });
}

async function saveClassicTrackerEntryName(entry, nextName) {
  await OBR.scene.items.updateItems([entry.id], (items) => {
    const item = items[0];
    __setSceneTokenDisplayName(item, nextName);
  });
  entry.name = nextName;
}

function updateInitiativeFillButton() {
  const button = roundPill.querySelector('[data-fill-initiative="1"]');
  if (!button) return;
  button.setAttribute("aria-pressed", String(__initiativeFillMode));
  button.title = __initiativeFillMode
    ? "Esci dalla compilazione iniziativa"
    : "Compila iniziativa: inserisci i valori senza riordinare le card";
  button.style.background = __initiativeFillMode ? "rgba(161,98,7,.72)" : "rgba(161,98,7,.42)";
  button.style.borderColor = __initiativeFillMode ? "rgba(250,204,21,.92)" : "rgba(250,204,21,.58)";
}

function initiativeFillGroupEntries(entries, groupKey) {
  return entries.filter((entry) => _groupKeyFromEntry(entry) === groupKey);
}

async function collectInitiativeFillCandidates() {
  const entries = await readEntries();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const candidates = [];
  const seenGroups = new Set();
  for (const badge of Array.from(document.querySelectorAll('[data-badge="init"][data-item-id]'))) {
    const card = badge.closest("[data-item-id]");
    const itemId = badge.dataset.itemId;
    const entry = byId.get(itemId) || byId.get(splitParagonId(itemId).baseId);
    if (!card || !entry || entry.isEpic || isEpicActionId(itemId)) continue;
    const collapsed = card.dataset.groupCollapsed === "1";
    const groupKey = card.dataset.groupKey || _groupKeyFromEntry(entry);
    if (collapsed) {
      if (seenGroups.has(groupKey)) continue;
      seenGroups.add(groupKey);
      const members = initiativeFillGroupEntries(entries, groupKey);
      if (members.some((member) => member.initTouched !== true)) candidates.push(itemId);
    } else if (entry.initTouched !== true) {
      candidates.push(itemId);
    }
  }
  return candidates;
}

function refreshInitiativeFillVisuals() {
  const session = __initiativeFillSession;
  const pendingIds = new Set(session?.ids || []);
  const completedIds = session?.completed || new Set();
  for (const badge of Array.from(document.querySelectorAll('[data-badge="init"][data-item-id]'))) {
    const pending = __initiativeFillMode
      && pendingIds.has(badge.dataset.itemId)
      && !completedIds.has(badge.dataset.itemId)
      && !badge.dataset.editing;
    badge.dataset.initPending = pending ? "1" : "0";
    badge.style.border = pending ? "2px dashed rgba(250,204,21,.95)" : (badge.__initNormalBorder || badge.style.border);
    badge.style.boxShadow = pending
      ? "0 0 0 2px rgba(250,204,21,.18), 0 4px 12px rgba(0,0,0,.42)"
      : (badge.__initNormalShadow || badge.style.boxShadow);
  }
}

async function openInitiativeFillCandidate(itemId) {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const badge = document.querySelector(`[data-badge="init"][data-item-id="${itemId}"]`);
  if (!badge) return false;
  badge.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  badge.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
  return true;
}

async function finishInitiativeFillMode() {
  if (!__initiativeFillMode) return;
  __initiativeFillMode = false;
  __initiativeFillSession = null;
  __suspendRenders = false;
  updateInitiativeFillButton();
  refreshInitiativeFillVisuals();
  await reconcileStateWithItems();
  await renderAll("initiative-fill-complete");
}

async function startInitiativeFillMode(options = {}) {
  if (__initiativeFillMode) return;
  await closeOpenEditors();
  const ids = await collectInitiativeFillCandidates();
  if (!ids.length) {
    if (options.silent !== true) await OBR.notification.show("Non ci sono iniziative da compilare.", "INFO");
    return;
  }
  __initiativeFillMode = true;
  __initiativeFillSession = { ids, completed: new Set() };
  __suspendRenders = true;
  updateInitiativeFillButton();
  refreshInitiativeFillVisuals();
  await openInitiativeFillCandidate(ids[0]);
}

async function interruptInitiativeFillForRemovedActor(event) {
  if (!__initiativeFillMode) return false;
  const removedActorIds = new Set((event?.changedRecords || [])
    .filter(({ before, after }) => {
      const item = before?.item;
      return !after
        && item?.layer === "CHARACTER"
        && !item?.attachedTo
        && item?.metadata?.[META_KEY]?.inInitiative === true;
    })
    .map(({ before }) => before.item.id));
  if (!removedActorIds.size) return false;

  const openInit = document.querySelector('[data-init-editing="1"]');
  const openItemId = openInit?.dataset?.itemId || openInit?.closest("[data-item-id]")?.dataset?.itemId;
  const openItemWasRemoved = openItemId
    ? removedActorIds.has(splitParagonId(openItemId).baseId)
    : false;
  if (openInit && !openItemWasRemoved && typeof openInit.__commitFn === "function") {
    try {
      await openInit.__commitFn();
    } catch (error) {
      console.warn("[initiative-fill] commit before removal:", error?.message || error);
    }
  }

  __initiativeFillMode = false;
  __initiativeFillSession = null;
  __suspendRenders = false;
  updateInitiativeFillButton();

  if (openInit?.dataset?.initEditing === "1" && typeof openInit.__cancelFn === "function") {
    await openInit.__cancelFn({ deferRender: true });
  }
  __editingInitForId = null;
  refreshInitiativeFillVisuals();
  return true;
}

function sceneItemEventAddsInitiative(event) {
  return (event?.changedRecords || []).some(({ before, after }) => {
    const beforeMeta = before?.item?.metadata?.[META_KEY];
    const afterItem = after?.item;
    const afterMeta = afterItem?.metadata?.[META_KEY];
    return !!before
      && afterItem?.layer === "CHARACTER"
      && !afterItem?.attachedTo
      && afterMeta?.inInitiative === true
      && afterMeta?.initTouched !== true
      && beforeMeta?.inInitiative !== true;
  });
}

function initiativeFillShowsAddedActors(event) {
  const addedIds = (event?.changedRecords || [])
    .filter(({ before, after }) => {
      const beforeMeta = before?.item?.metadata?.[META_KEY];
      const afterItem = after?.item;
      const afterMeta = afterItem?.metadata?.[META_KEY];
      return !!before
        && afterItem?.layer === "CHARACTER"
        && !afterItem?.attachedTo
        && afterMeta?.inInitiative === true
        && afterMeta?.initTouched !== true
        && beforeMeta?.inInitiative !== true;
    })
    .map(({ after }) => after.item.id);
  if (!addedIds.length) return false;

  const cards = Array.from(document.querySelectorAll("[data-tracker-card='1']"));
  return addedIds.every((id) => cards.some((card) =>
    card.dataset.itemId === id || card.__selectionItemIds?.includes(id)
  ));
}

async function toggleInitiativeFillMode() {
  if (__initiativeFillMode) {
    await closeOpenEditors();
    await finishInitiativeFillMode();
  } else {
    await startInitiativeFillMode();
  }
}

async function openInitiativeFillNeighbor(currentId, goPrev = false) {
  const session = __initiativeFillSession;
  if (!__initiativeFillMode || !session) return;
  const currentIndex = session.ids.indexOf(currentId);
  const direction = goPrev ? -1 : 1;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= session.ids.length) {
    if (!goPrev) await finishInitiativeFillMode();
    return;
  }
  await openInitiativeFillCandidate(session.ids[targetIndex]);
}

function makeInitiativeFillBtn() {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.fillInitiative = "1";
  b.textContent = "\u270e";
  Object.assign(b.style, {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(250,204,21,.58)",
    background: "rgba(161,98,7,.42)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1",
    borderRadius: "8px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    padding: "0",
  });
  b.setAttribute("aria-label", "Compila iniziativa");
  b.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleInitiativeFillMode().catch((error) => {
      console.warn("[initiative-fill] errore modalità compilazione:", error?.message || error);
    });
  });
  updateInitiativeFillButton();
  return b;
}

// ===== Legendary helpers =====

async function setParagonActions(baseId, nextActions) {
  const n = Math.max(0, Math.floor(Number(nextActions) || 0));
  await OBR.scene.items.updateItems([baseId], (items) => {
    const it = items[0];
    if (!it) return;
    const me = { ...(it.metadata?.[META_KEY] || {}) };
    if (n <= 1) {
      // disattiva Paragon se <=1
      if (me.paragon) delete me.paragon;
    } else {
      me.paragon = { actions: n };
    }
    it.metadata = { ...(it.metadata || {}), [META_KEY]: me };
  });

  // adatta paragonInits (mantieni le prime, tronca/estendi col valore della base)
  const baseEntries = await readEntries();
  const base = baseEntries.find(x => x.id === baseId);
  const baseInit = Number(base?.initiative) || 0;

  await setSceneState(prev => {
    const p = { ...(prev?.paragonInits || {}) };
    let arr = Array.isArray(p[baseId]) ? p[baseId].slice() : [baseInit];
    if (n <= 1) {
      delete p[baseId];
    } else {
      if (arr.length > n) arr = arr.slice(0, n);
      while (arr.length < n) arr.push(baseInit);
      p[baseId] = arr;
    }
    return { ...(prev || {}), paragonInits: p };
  });
}

// Imposta current a un valore specifico (clamp 0..max; se max>0, min=1)
async function setLegendaryCurrent(itemId, nextCurrent) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0];
    if (!it) return;
    const m  = it.metadata || {};
    const me = { ...(m[META_KEY] || {}) };
    const lg = { ...(me.legendary || { max: 0, current: 0 }) };

    const max = Math.max(0, Number(lg.max) || 0);
    const wanted = Number(nextCurrent) || 0;
    const cur = Math.max(0, Math.min(max, wanted));

    me.legendary = { max, current: cur };
    m[META_KEY] = me;
    it.metadata = m;
  });
}

async function setLegendaryResistanceCurrent(itemId, nextCurrent) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0];
    if (!it) return;
    const metadata = it.metadata || {};
    const meta = { ...(metadata[META_KEY] || {}) };
    if (!meta.legendary || Number(meta.legendary.max) <= 0) return;
    const stored = meta.legendaryResistances;
    const max = stored && typeof stored === "object"
      ? Math.max(0, Math.floor(Number(stored.max) || 0))
      : DEFAULT_LEGENDARY_RESISTANCES;
    const current = Math.max(0, Math.min(max, Math.floor(Number(nextCurrent) || 0)));
    meta.legendaryResistances = { max, current };
    metadata[META_KEY] = meta;
    it.metadata = metadata;
  });
}

async function setLegendaryResistanceMax(itemId, nextMax) {
  const max = Math.max(1, Math.min(5, Math.floor(Number(nextMax) || 0)));
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0];
    if (!it) return;
    const metadata = it.metadata || {};
    const meta = { ...(metadata[META_KEY] || {}) };
    if (!meta.legendary || Number(meta.legendary.max) <= 0) return;
    const stored = meta.legendaryResistances;
    const current = stored && typeof stored === "object"
      ? Math.max(0, Math.min(max, Math.floor(Number(stored.current) || 0)))
      : Math.min(max, DEFAULT_LEGENDARY_RESISTANCES);
    meta.legendaryResistances = { max, current };
    metadata[META_KEY] = meta;
    it.metadata = metadata;
  });
}

// Reset al pieno a inizio turno della creatura attiva
async function resetLegendaryIfAny(activeId) {
  if (!activeId) return;
  await OBR.scene.items.updateItems([activeId], (items) => {
    const it = items[0];
    if (!it) return;
    const m  = it.metadata || {};
    const me = { ...(m[META_KEY] || {}) };
    if (me.legendary && Number(me.legendary.max) > 0) {
      me.legendary.current = Number(me.legendary.max) || 0;
      m[META_KEY] = me;
      it.metadata = m;
    }
  });
}
// Cambia il numero massimo di pips (clamp 1..10) e corregge current
async function setLegendaryMax(itemId, nextMax) {
  // ← prima partiva da 0..10; ora impediamo di scendere sotto 1
  const max = Math.max(1, Math.min(5, Math.floor(Number(nextMax) || 0)));
  await OBR.scene.items.updateItems([itemId], (items) => {
    const it = items[0]; if (!it) return;
    const m  = it.metadata || {};
    const me = { ...(m[META_KEY] || {}) };
    const cur = Math.max(0, Math.min(max, Number(me.legendary?.current || 0)));
    me.legendary = { max, current: max > 0 ? cur : 0 }; // max è sempre ≥1 qui
    m[META_KEY] = me;
    it.metadata = m;
  });
}


// ===== Legendary UI helpers: diamanti per le azioni, scudi per le resistenze =====
function mkLegendaryResourcePips(resource, onSet, attitude = "enemy", kind = "action") {
  return buildLegendaryResourcePips(resource, onSet, {
    isGM: IS_GM,
    attitude,
    kind,
    config: LEG_PIPS_CFG,
  });
}

function mkLegendaryPips(legendary, onSet, attitude = "enemy") {
  return mkLegendaryResourcePips(legendary, onSet, attitude, "action");
}

function mkLegendaryResistancePips(resistances, onSet) {
  return mkLegendaryResourcePips(resistances, onSet, "enemy", "resistance");
}

// Quanti chip mostrare prima del "+N"
const MAX_VISIBLE_CHIPS = 3;

// Stile pill generico, simile ai chip
function styleChipPill(el, { compact = true } = {}) {
  Object.assign(el.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "600",
    padding: compact ? "1px 6px" : "2px 8px",
    borderRadius: "999px",
    background: "rgba(0,0,0,.72)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    lineHeight: "1",
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "pointer",
  });
}

// Estrae TUTTE le chip reali da un fragment (anche se miste cond/spell).
// - Prende elementi marcati esplicitamente (.chip, .spell-chip, .condition-chip, [data-chip])
// - In AGGIUNTA, raccoglie i "leaf" (span/div senza figli) non già presi.
//   Questo copre le condition chip che non usano classi specifiche.
function __collectChipsDeep(frag) {
  const tmp = document.createElement("div");
  tmp.appendChild(frag); // reparent temporaneo

  const out = [];
  const seen = new Set();

  // 1) chip esplicite (spell usa .chip, condizioni potrebbero avere data-attr)
  const explicit = tmp.querySelectorAll(".chip, .spell-chip, .condition-chip, .cond-chip, [data-chip]");
  explicit.forEach(el => { if (!seen.has(el)) { seen.add(el); out.push(el); } });

  // 2) fallback robusto: tutti i leaf elements significativi (span/div senza figli)
  const leaves = tmp.querySelectorAll("span, div");
  leaves.forEach(el => {
    for (const explicit of seen) {
      if (explicit !== el && explicit.contains?.(el)) return;
    }
    if (el.children.length === 0 && !seen.has(el)) {
      // escludi micro-elementi vuoti/spaziatori
      const txt = (el.textContent || "").trim();
      if (txt.length) { seen.add(el); out.push(el); }
    }
  });

  return out;
}

// Monta i chip con overflow → +N che espande/comprime **su seconda riga**
// Monta chip con overflow condiviso (condizioni + incantesimi):
// prime `limit` in riga 1, le altre dietro al toggle +N in riga 2.
function mountChipsWithOverflow(dock, frag, { compact = true, limit = MAX_VISIBLE_CHIPS } = {}) {
  const chips = __collectChipsDeep(frag); // 👈 ora abbiamo TUTTE le chip “piatte”
  dock.style.flexDirection = "column";
  dock.style.alignItems = "flex-start";
  const row1 = document.createElement("div");
  Object.assign(row1.style, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: CHIP_GAP_PX + "px",
  });

  // di default nascosta; la apro col toggle
  const row2 = document.createElement("div");
  Object.assign(row2.style, {
    display: "none",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0px",
    paddingTop: "0px",
    position: "relative",
    zIndex: "1",
  });
  dock.style.rowGap = "0px";

  if (chips.length <= limit) {
    row1.append(...chips);
    dock.append(row1);
    return;
  }

  const visible = chips.slice(0, limit);
  const hidden  = chips.slice(limit);

  row1.append(...visible);
  row2.append(...hidden);

  const more = document.createElement("button");
  more.type = "button";
  more.textContent = `+${hidden.length}`;
  more.dataset.cardSelectionIgnore = "1";
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", `Mostra altri ${hidden.length} effetti`);
  styleChipPill(more, { compact });
  Object.assign(more.style, {
    minHeight: "16px",
    height: "16px",
    padding: "0 4px",
    fontSize: "10px",
    fontFamily: "inherit",
    borderColor: "rgba(255,255,255,.24)",
    boxShadow: "none",
  });
  more.title = `Mostra altri ${hidden.length} effetti`;
  let expanded = false;

  more.addEventListener("click", (ev) => {
    ev.stopPropagation();
    expanded = !expanded;
    row2.style.display = expanded ? "flex" : "none";
    more.setAttribute("aria-expanded", expanded ? "true" : "false");
    more.setAttribute("aria-label", expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`);
    more.textContent = expanded ? "\u2212" : `+${hidden.length}`;
    more.style.background = expanded ? "rgba(59,130,246,.64)" : "rgba(0,0,0,.72)";
    more.title = expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`;
    const ownerCard = dock.closest('[data-tracker-card="1"]');
    const ownerZIndex = ownerCard?.style.zIndex || "";
    if (ownerCard) ownerCard.style.zIndex = expanded ? "30" : ownerZIndex;
  });

  row1.appendChild(more);
  dock.append(row1, row2);
}

function bindReferenceChips(dock) {
  for (const chip of dock.querySelectorAll("[data-reference-entry]")) {
    const hasNestedAction = !!chip.querySelector("button");
    chip.dataset.cardSelectionIgnore = "1";
    chip.setAttribute("role", hasNestedAction ? "group" : "button");
    chip.setAttribute("tabindex", "0");
    chip.title = `${chip.title ? `${chip.title} · ` : ""}Apri nell'Enciclopedia DM`;
    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openReferencePopover({
        tab: chip.dataset.referenceType === "spells" ? "spells" : "conditions",
        entry: chip.dataset.referenceEntry || "",
      });
    };
    chip.addEventListener("click", open);
    chip.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      open(event);
    });
  }
}


async function getTrackerPopoverAnchor() {
  let trackerWidth = 340;
  try {
    trackerWidth = Math.max(240, Number(await OBR.action.getWidth()) || trackerWidth);
  } catch {}
  const viewportWidth = Math.max(
    Number(window.innerWidth) || 0,
    Number(document.documentElement?.getBoundingClientRect?.().width) || 0,
    Number(document.body?.getBoundingClientRect?.().width) || 0,
  );
  trackerWidth = Math.max(trackerWidth, viewportWidth);
  return { left: Math.ceil(trackerWidth) + 14, top: 52 };
}

async function resolveGlobalPopupSourceEntry() {
  const [entries, state, selection] = await Promise.all([
    readEntries(),
    getSceneState(),
    OBR.player.getSelection().catch(() => []),
  ]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const selectedId of Array.isArray(selection) ? selection : []) {
    const entry = byId.get(splitParagonId(selectedId).baseId);
    if (entry) return entry;
  }
  const order = Array.isArray(state?.order) ? state.order : [];
  const activeIndex = Math.max(0, Math.min(order.length - 1, state?.current ?? 0));
  const activeId = order.length ? order[activeIndex] : "";
  const activeEntry = byId.get(splitParagonId(activeId).baseId);
  return activeEntry || entries[0] || null;
}

async function openGlobalEffectsPopup() {
  const sourceEntry = await resolveGlobalPopupSourceEntry();
  if (sourceEntry) await openCardEffectsPopup(sourceEntry);
}

async function openGlobalSpellsPopup(options = {}) {
  const sourceEntry = await resolveGlobalPopupSourceEntry();
  if (sourceEntry) await openCardSpellsPopup(sourceEntry, options);
}

async function openReferencePopup() {
  const popupId = REFERENCE_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  const anchorPosition = await getTrackerPopoverAnchor();
  try {
    await openReferencePopover({ anchorPosition });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[reference] popover open error:", err?.message || err);
  }
}

async function openGlobalQuickHPPopup(options = {}) {
  await openQuickHPPopup(options);
}

async function openOptionsPopup() {
  const popupId = OPTIONS_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  const anchorPosition = await getTrackerPopoverAnchor();
  const viewportHeight = await OBR.viewport.getHeight().catch(() => 900);
  try {
    await openTrackedPopover({
      id: popupId,
      url: "/options-modal.html",
      width: 720,
      height: Math.max(360, Math.min(800, Math.floor(Number(viewportHeight) - 92))),
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (error) {
    setOpenTrackerPopoverId();
    console.warn("[options-panel] popover open error:", error?.message || error);
  }
}

const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const TRACKER_POPOVER_IDS = [
  `${ID}/history-modal`,
  `${ID}/effects-modal`,
  `${ID}/spells-modal`,
  `${ID}/reference-modal`,
  `${ID}/quick-hp-modal`,
  OPTIONS_POPUP_ID,
  `${ID}/initiative-card-modal`,
  `${ID}/compact-effects-popover`,
  COMPACT_ADMIN_MENU_ID,
];
let __openTrackerPopoverId = "";

function syncGlobalPanelButtonPressedState() {
  globalEffectsButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === EFFECTS_POPUP_ID));
  globalSpellsButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === SPELLS_POPUP_ID));
  globalQuickHPButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === QUICK_HP_POPUP_ID));
  optionsPanelButton.setAttribute("aria-pressed", String(__openTrackerPopoverId === OPTIONS_POPUP_ID));
  applyToolbarLayoutPresentation(isCompactTrackerLayout());
}

function setOpenTrackerPopoverId(popupId = "") {
  __openTrackerPopoverId = popupId;
  syncGlobalPanelButtonPressedState();
}

function mountTrackerPopoverToggleListener() {
  OBR.broadcast.onMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type === "opened" && data.id === REFERENCE_POPUP_ID) {
      setOpenTrackerPopoverId(REFERENCE_POPUP_ID);
    }
    if (data?.type === "closed" && data.id === __openTrackerPopoverId) {
      setOpenTrackerPopoverId();
    }
    if (data?.type === "resize" && data.id === __openTrackerPopoverId) {
      const maxHeight = data.id === `${ID}/initiative-card-modal` ? 760 : 560;
      const height = Math.max(320, Math.min(maxHeight, Math.round(Number(data.height) || 0)));
      void OBR.popover.setHeight(data.id, height).catch(() => {});
    }
  });
  OBR.broadcast.onMessage(TRACKER_PANEL_REQUEST_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type !== "open") return;
    const sourceId = String(data.sourceId || "").trim();
    const quickActionId = String(data.quickActionId || "").trim();
    const quickActionRequest = Boolean(quickActionId || data.quickAction);
    const spellIntent = data.intent === "spell-cast"
      || data.intent === "spell"
      || Boolean(String(data.spellId || "").trim());
    const canonicalSpellRequest = spellIntent
      && [undefined, "spells", "quick-hp"].includes(data.panel)
      ? {
        ...data,
        intent: "spell-cast",
        panel: "spells",
      }
      : data;
    const requestedSource = sourceId ? { id: sourceId } : null;
    if (data.panel === "conditions" && __openTrackerPopoverId !== EFFECTS_POPUP_ID) {
      void (requestedSource
        ? openCardEffectsPopup(requestedSource, undefined, { quickActionId })
        : openGlobalEffectsPopup());
    }
    if (canonicalSpellRequest.intent === "spell-cast"
      && canonicalSpellRequest.panel === "spells"
      && (__openTrackerPopoverId !== SPELLS_POPUP_ID || quickActionRequest)) {
      void (requestedSource
        ? openCardSpellsPopup(requestedSource, {
          quickActionId,
          routeRequest: canonicalSpellRequest,
        })
        : openGlobalSpellsPopup({
          quickActionId,
          routeRequest: canonicalSpellRequest,
        }));
    }
    if (
      data.panel === "spells"
      && !spellIntent
      && __openTrackerPopoverId !== SPELLS_POPUP_ID
    ) {
      void (requestedSource
        ? openCardSpellsPopup(requestedSource, {
          quickActionId,
          routeRequest: data,
        })
        : openGlobalSpellsPopup({
          quickActionId,
          routeRequest: data,
        }));
    }
    if (data.panel === "reference" && __openTrackerPopoverId !== REFERENCE_POPUP_ID) {
      void openReferencePopup();
    }
    if (
      data.panel === "quick-hp"
      && !spellIntent
      && __openTrackerPopoverId !== QUICK_HP_POPUP_ID
    ) {
      void openGlobalQuickHPPopup({ sourceId, quickActionId });
    }
  });
}

async function beginTrackerPopoverToggle(popupId) {
  if (__openTrackerPopoverId === popupId) {
    await OBR.popover.close(popupId).catch(() => {});
    setOpenTrackerPopoverId();
    return false;
  }
  await Promise.all(TRACKER_POPOVER_IDS.map((id) => OBR.popover.close(id).catch(() => {})));
  __expandedCompactEffectsId = null;
  setOpenTrackerPopoverId();
  return true;
}

async function openQuickHPPopup({
  sourceId = "",
  quickActionId = "",
} = {}) {
  const popupId = QUICK_HP_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  const anchorPosition = await getTrackerPopoverAnchor();
  const popupQuery = new URLSearchParams();
  if (sourceId) popupQuery.set("source", sourceId);
  if (quickActionId) popupQuery.set("quickAction", quickActionId);
  const popupUrl = `/quick-hp-modal.html${popupQuery.size ? `?${popupQuery}` : ""}`;
  try {
    await openTrackedPopover({
      id: popupId,
      url: popupUrl,
      width: 560,
      height: 760,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[quick-hp] popover open error:", err?.message || err);
  }
}

async function openCardEffectsPopup(sourceEntry, entries, {
  quickActionId = "",
} = {}) {
  if (!sourceEntry || isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  const popupId = EFFECTS_POPUP_ID;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  const anchorPosition = await getTrackerPopoverAnchor();
  const popupQuery = new URLSearchParams({ source: sourceId });
  if (quickActionId) popupQuery.set("quickAction", quickActionId);
  try {
    await openTrackedPopover({
      id: popupId,
      url: `/effects-modal.html?${popupQuery}`,
      width: 560,
      height: 760,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[effects] popover open error:", err?.message || err);
  }
}

async function openCardSpellsPopup(sourceEntry, {
  quickActionId = "",
  routeRequest = {},
} = {}) {
  if (!sourceEntry || isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  const popupId = SPELLS_POPUP_ID;
  const quickAction = quickActionId
    ? findQuickAction(sourceEntry, quickActionId)
    : null;
  const route = routeRequest && typeof routeRequest === "object"
    ? routeRequest
    : {};
  const quickActionRequest = Boolean(
    quickActionId
      || route.quickActionId
      || route.quickAction,
  );
  if (quickActionRequest && __openTrackerPopoverId === popupId) {
    try { await OBR.popover.close(popupId); } catch {}
    setOpenTrackerPopoverId();
  } else if (!await beginTrackerPopoverToggle(popupId)) {
    return;
  }
  const routeTargetIds = route.targetIds ?? route.targetIdsCsv;
  const popupQuery = buildSpellUnifiedPanelRouteQuery({
    ...route,
    sourceId,
    quickActionId: quickActionId || route.quickActionId || route.quickAction,
    spellId: quickAction?.kind === "spell" ? quickAction.spellId : route.spellId || "",
    ...(quickAction?.kind === "spell"
      ? {
        spellId: quickAction.spellId,
        slotLevel: quickAction.slotLevel,
        durationTurns: quickAction.turns,
        applyAutomatedConditions: quickAction.applyAutomations !== false,
      }
      : {}),
    targetIds: routeTargetIds !== undefined
      ? routeTargetIds
      : quickAction?.kind === "spell" && quickAction.targetMode === "self"
        ? [sourceId]
        : [],
    origin: route.origin || (quickActionId ? "quick-action" : "tracker-spells"),
  });
  const popupUrl = `/spell-unified-panel.html${popupQuery.size ? `?${popupQuery}` : ""}`;
  const [anchorPosition] = await Promise.all([
    getTrackerPopoverAnchor(),
    fetch(popupUrl, { cache: "force-cache" }).catch(() => null),
  ]);
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  try {
    await openTrackedPopover({
      id: popupId,
      url: popupUrl,
      width: 560,
      height: 760,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    setOpenTrackerPopoverId(popupId);
  } catch (err) {
    setOpenTrackerPopoverId();
    console.warn("[spells] popover open error:", err?.message || err);
  }
}

async function openInitiativeCardPopup(sourceEntry) {
  if (!sourceEntry || sourceEntry.__groupCollapsed || !["pc", "ally"].includes(sourceEntry.attitude) ||
      isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  const sourceId = splitParagonId(sourceEntry.id).baseId;
  if (!sourceId) return;

  const popupId = `${ID}/initiative-card-modal`;
  if (!await beginTrackerPopoverToggle(popupId)) return;
  try { await OBR.modal.close(popupId); } catch {}
  try { await OBR.popover.close(popupId); } catch {}
  const anchorPosition = await getTrackerPopoverAnchor();
  try {
    await openTrackedPopover({
      id: popupId,
      url: `/initiative-card-modal.html?source=${encodeURIComponent(sourceId)}`,
      width: 440,
      height: 560,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    __openTrackerPopoverId = popupId;
  } catch (err) {
    __openTrackerPopoverId = "";
    console.warn("[initiative-card] popover open error:", err?.message || err);
  }
}

const INITIATIVE_CARD_CONTEXT_MENU_ID = `${ID}/initiative-card-context-menu`;
const INITIATIVE_CARD_CONTEXT_MENU_CHANNEL = `${ID}/initiative-card-context-menu`;
const INITIATIVE_CARD_CONTEXT_MENU_PAYLOAD_PREFIX = `${ID}/initiative-card-context-menu/`;
const INITIATIVE_CARD_CONTEXT_MENU_WIDTH = 252;
const INITIATIVE_CARD_CONTEXT_MENU_INITIAL_HEIGHT = 336;
const TRACKER_QUICK_ACTIONS_POPOVER_ID = `${ID}/tracker-quick-actions`;
const TRACKER_QUICK_ACTIONS_CHANNEL = `${ID}/tracker-quick-actions`;
const TRACKER_QUICK_ACTIONS_PAYLOAD_PREFIX = `${ID}/tracker-quick-actions/`;
const TRACKER_QUICK_ACTIONS_WIDTH = 248;
const TRACKER_QUICK_ACTIONS_INITIAL_HEIGHT = 520;

let __initiativeCardContextMenu = null;
let __initiativeCardContextMenuRequestId = "";
let __initiativeCardContextMenuContext = null;
let __initiativeCardContextMenuRevision = 0;
let __trackerQuickActionsPopover = null;
let __trackerQuickActionsRequestId = "";
let __trackerQuickActionsContext = null;
let __trackerQuickActionsSourceId = "";
let __trackerQuickActionsButton = null;
let __trackerQuickActionsRevision = 0;

function __closeInitiativeCardContextMenu() {
  if (__initiativeCardContextMenuRequestId) {
    removeStoredMenuPayload(
      localStorage,
      INITIATIVE_CARD_CONTEXT_MENU_PAYLOAD_PREFIX,
      __initiativeCardContextMenuRequestId
    );
  }
  const closePromise = OBR.popover.close(INITIATIVE_CARD_CONTEXT_MENU_ID).catch(() => {});
  __initiativeCardContextMenu = null;
  __initiativeCardContextMenuRequestId = "";
  __initiativeCardContextMenuContext = null;
  __initiativeCardContextMenuRevision += 1;
  return closePromise;
}

function __closeTrackerQuickActionsPopover() {
  if (__trackerQuickActionsRequestId) {
    removeStoredMenuPayload(
      localStorage,
      TRACKER_QUICK_ACTIONS_PAYLOAD_PREFIX,
      __trackerQuickActionsRequestId,
    );
  }
  if (__trackerQuickActionsButton) {
    __trackerQuickActionsButton.setAttribute("aria-expanded", "false");
  }
  const closePromise = OBR.popover.close(TRACKER_QUICK_ACTIONS_POPOVER_ID).catch(() => {});
  __trackerQuickActionsPopover = null;
  __trackerQuickActionsRequestId = "";
  __trackerQuickActionsContext = null;
  __trackerQuickActionsSourceId = "";
  __trackerQuickActionsButton = null;
  __trackerQuickActionsRevision += 1;
  return closePromise;
}

function __cardBossMode(entry) {
  return deriveInitiativeCardBossMode(entry);
}

function __contextScopeIds(entry) {
  const entryIds = __selectionIdsForEntry(entry);
  if (entry?.__groupCollapsed) return entryIds;
  const trackerIds = new Set();
  document.querySelectorAll("[data-tracker-card='1']").forEach((card) => {
    for (const id of card.__selectionItemIds || []) trackerIds.add(id);
  });
  const selected = [...__selectedSceneItemIds].filter((id) => trackerIds.has(id));
  return selected.length > 1 ? selected : entryIds.slice(0, 1);
}

async function __selectContextScope(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  __setTrackerSelection(scopeIds);
  await OBR.player.select(scopeIds, true);
}

async function __setCardAttitude(ids, attitude) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await OBR.scene.items.updateItems(scopeIds, (items) => {
    for (const item of items) {
      const meta = { ...(item.metadata?.[META_KEY] || {}), attitude };
      item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
    }
  });
  await rememberFactionForIds(scopeIds, attitude).catch(() => {});
  await reconcileStateWithItems();
  await renderAll();
}

async function __setCardBossMode(entry, mode) {
  const id = splitParagonId(entry?.id).baseId;
  if (!id) return;
  await OBR.scene.items.updateItems([id], (items) => {
    const item = items[0];
    if (!item) return;
    const meta = { ...(item.metadata?.[META_KEY] || {}) };
    delete meta.legendary;
    delete meta.legendaryResistances;
    delete meta.paragon;
    delete meta.epic;
    if (mode === "legendary") {
      meta.legendary = { max: 3, current: 3 };
      meta.legendaryResistances = {
        max: DEFAULT_LEGENDARY_RESISTANCES,
        current: DEFAULT_LEGENDARY_RESISTANCES,
      };
    }
    if (mode === "paragon") meta.paragon = { actions: 2 };
    if (mode === "epic") {
      meta.epic = { enabled: 1 };
      meta.initiative = 20;
    }
    item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
  });
  await setSceneState((previous) => {
    const paragonInits = { ...(previous?.paragonInits || {}) };
    if (mode === "paragon") {
      const initiative = Number(entry?.initiative) || 10;
      paragonInits[id] = [initiative, initiative];
    } else {
      delete paragonInits[id];
    }
    return { ...(previous || {}), paragonInits };
  });
  await reconcileStateWithItems();
  await renderAll();
}

async function __removeCardFromInitiative(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await OBR.scene.items.updateItems(scopeIds, (items) => {
    for (const item of items) {
      const meta = { ...(item.metadata?.[META_KEY] || {}) };
      delete meta.inInitiative;
      item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
    }
  });
  await reconcileStateWithItems();
  await renderAll();
}

async function __clearCardConditions(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await __selectContextScope(scopeIds);
  const mutation = await runEffectsMutation([{
    type: "condition:clear",
    targetIds: scopeIds,
  }], {
    kind: "condition",
    label: scopeIds.length > 1 ? "Rimosse tutte le condizioni (selezione)" : "Rimosse tutte le condizioni",
    targetIds: scopeIds,
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels(scopeIds);
}

async function __removeConditionOnTrackerCard(itemId, group) {
  if (!IS_GM || !itemId || !group) return;

  const conditionName = String(group?.name || "").trim();
  const removals = (Array.isArray(group?.instances) ? group.instances : [])
    .map((instance) => ({
      itemId,
      instanceId: String(instance?.id || "").trim(),
    }))
    .filter((removal) => removal.instanceId);
  if (!conditionName && !removals.length) return;

  const operations = removals.length
    ? [{ type: "condition:remove-instances", removals }]
    : [{
      type: "condition:remove-name",
      targetIds: [itemId],
      conditionName,
    }];
  const mutation = await runEffectsMutation(operations, {
    kind: "condition",
    label: `Rimossa: ${conditionName || "Condizione"}`,
    targetIds: [itemId],
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels([itemId]);
}

async function __terminateSpellOnTrackerCard(itemId, spell) {
  if (!IS_GM || !itemId || !spell) return;

  const instanceId = String(spell?.instanceId || "").trim();
  const spellName = String(spell?.name || "").trim();
  const casterId = String(spell?.casterId || "").trim();
  if (!instanceId && !spellName) return;

  const operations = [];
  if (spell?.conc && casterId) {
    operations.push({
      type: "concentration:break-targets",
      casterIds: [casterId],
      reference: instanceId || spellName,
      targetIds: [itemId],
    });
  }
  operations.push(instanceId
    ? { type: "spell:remove-instance", targetIds: [itemId], instanceId }
    : {
      type: "spell:remove-name-source",
      targetIds: [itemId],
      name: spellName,
      casterId: casterId || null,
    });

  const removeStaticZone = instanceId
    && (spell?.conc || spell?.castContext?.staticZoneOwner === true);
  const mutation = await runEffectsMutation(operations, {
    kind: "spell",
    label: `Terminato: ${spellName || "Incantesimo"}`,
    targetIds: [itemId, casterId],
    sideEffects: removeStaticZone ? [{
      type: "static-zone:remove-ended",
      selectors: [{ instanceId }],
    }] : [],
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels([itemId]);
}

async function __terminateClassFeatureOnTrackerCard(itemId, instance) {
  if (!IS_GM || !itemId || !instance) return;
  const sourceId = String(instance?.sourceId || itemId).trim();
  const instanceId = String(instance?.parentEffectId || "").trim();
  if (!sourceId || !instanceId) return;
  const { deactivateClassFeature } = await __loadClassFeatureRuntime();
  await deactivateClassFeature(sourceId, instanceId);
}

async function __activateClassFeatureFromContext(entry, featureId, scopeIds = []) {
  if (!IS_GM || !entry) return;
  const sourceId = splitParagonId(entry.id).baseId;
  const feature = getClassFeatureDefinition(featureId);
  if (!sourceId || !feature) return;

  const targeting = classFeatureTargeting(feature);
  const selectedIds = await OBR.player.getSelection().catch(() => []);
  const candidateIds = Array.from(new Set([
    ...(Array.isArray(scopeIds) ? scopeIds : []),
    ...(Array.isArray(selectedIds) ? selectedIds : []),
  ])).map((id) => splitParagonId(String(id || "").trim()).baseId)
    .filter((id) => id && id !== sourceId);

  const activation = { sourceId, featureId: feature.id };
  if (targeting.mode === "single-target" && candidateIds.length) {
    activation.targetIds = candidateIds;
  }
  const { activateClassFeature } = await __loadClassFeatureRuntime();
  const result = await activateClassFeature(activation);
  await renderAll("class-feature-context-activate");
  return result;
}

async function __deactivateClassFeatureFromContext(entry, instanceId) {
  if (!IS_GM || !entry) return;
  const sourceId = splitParagonId(entry.id).baseId;
  if (!sourceId || !instanceId) return;
  const { deactivateClassFeature } = await __loadClassFeatureRuntime();
  const result = await deactivateClassFeature(sourceId, instanceId);
  await renderAll("class-feature-context-deactivate");
  return result;
}

async function __resetClassFeatureResourcesFromContext(entry) {
  if (!IS_GM || !entry) return;
  const sourceId = splitParagonId(entry.id).baseId;
  if (!sourceId) return;
  const { resetClassFeatureResources } = await __loadClassFeatureRuntime();
  const result = await resetClassFeatureResources(sourceId);
  await renderAll("class-feature-reset-resources");
  return result;
}

async function __runTrackerQuickAction(sourceEntry, action) {
  const sourceId = splitParagonId(sourceEntry?.id).baseId;
  if (!sourceId) throw new Error("quick-action-source-missing");
  if (action?.kind === "feature") {
    if (!IS_GM) throw new Error("Solo il GM può attivare una capacità.");
    const { activateClassFeature } = await __loadClassFeatureRuntime();
    return activateClassFeature({
      sourceId,
      featureId: action.featureId,
    }).then(async (result) => {
      await renderAll("class-feature-quick-action");
      return result;
    });
  }
  const result = await executeDirectQuickAction({
    action,
    sourceItem: { id: sourceId, name: sourceEntry?.name || "" },
    confirmConcentration: (message) => window.confirm(message),
  });
  if (result.mode === "invalid") return result;
  if (result.mode !== "review") return result;

  const quickActionId = String(action?.id || "").trim();
  if (action?.kind === "condition") {
    await openCardEffectsPopup(sourceEntry, undefined, { quickActionId });
  } else if (action?.kind === "spell") {
    await openCardSpellsPopup(sourceEntry, {
      quickActionId,
      routeRequest: result.route?.request || {},
    });
  }
  return result;
}

function __mountTrackerQuickActions(card, sourceEntry, { compact = false } = {}) {
  if (
    !IS_GM
    ||
    !card
    || !sourceEntry
    || sourceEntry.__groupCollapsed
    || isLairId(sourceEntry.id)
    || isEpicActionId(sourceEntry.id)
  ) {
    return;
  }
  const sourceId = splitParagonId(sourceEntry.id).baseId;
  const expanded = !!__trackerQuickActionsRequestId
    && __trackerQuickActionsSourceId === sourceId;
  const launcher = buildTrackerQuickActionLauncher({
    actions: sourceEntry.quickActions,
    compact,
    expanded,
    onToggle: (button, event) => {
      void __toggleTrackerQuickActionsPopover(sourceEntry, button, event);
    },
  });
  if (launcher) {
    if (expanded) __trackerQuickActionsButton = launcher.__quickActionToggle;
    card.appendChild(launcher);
  }
}

async function __clearCardSpells(ids) {
  const scopeIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!scopeIds.length) return;
  await __selectContextScope(scopeIds);
  const label = scopeIds.length > 1 ? "Terminati incantesimi (selezione)" : "Terminati incantesimi";
  const mutation = await runEffectsMutation([{
    type: "spell:clear-non-concentration",
    targetIds: scopeIds,
  }], {
    kind: "spell",
    label,
    targetIds: scopeIds,
    sideEffects: [{
      type: "static-zone:remove-ended",
      selectors: scopeIds.map((casterId) => ({ casterId })),
    }],
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels(scopeIds);
}

async function __clearCardConcentrations(ids, sourceEntry = null) {
  const scopeIds = Array.from(new Set([
    ...(ids || []),
    ...__selectionIdsForEntry(sourceEntry),
  ].filter(Boolean)));
  if (!scopeIds.length) return;
  await __selectContextScope(scopeIds);
  const label = scopeIds.length > 1 ? "Terminate concentrazioni multiple" : "Terminata concentrazione";
  const mutation = await runEffectsMutation([{
    type: "concentration:break",
    casterIds: scopeIds,
  }], {
    kind: "concentration",
    label,
    targetIds: scopeIds,
    sideEffects: [{
      type: "static-zone:remove-ended",
      selectors: scopeIds.map((casterId) => ({ casterId })),
    }],
  });
  requireAppliedEffectsMutation(mutation);
  if (!mutation.changedIds.length) return;
  const historyIds = mutation.changedIds;
  await refreshConditionLabels(historyIds);
}

async function __getInitiativeCardContextMenuPlacement(event) {
  const [viewportWidthRaw, viewportHeightRaw] = await Promise.all([
    OBR.viewport.getWidth().catch(() => 1200),
    OBR.viewport.getHeight().catch(() => 800),
  ]);
  const viewportWidth = Number(viewportWidthRaw) || 1200;
  const viewportHeight = Number(viewportHeightRaw) || 800;

  const width = Math.max(232, Math.min(INITIATIVE_CARD_CONTEXT_MENU_WIDTH, viewportWidth - 24));
  const height = Math.max(220, Math.min(INITIATIVE_CARD_CONTEXT_MENU_INITIAL_HEIGHT, viewportHeight - 24));

  let frameLeft = 0;
  let frameTop = 0;
  if (isCompactTrackerLayout()) {
    const fallbackTrackerWidth = Math.max(260, Math.min(1180, Math.floor(viewportWidth - 32)));
    const [trackerAnchor, trackerWidth, trackerHeight] = await Promise.all([
      getCompactTrackerPopoverAnchor(),
      OBR.popover.getWidth(TRACKER_POPOVER_ID).catch(() => undefined),
      OBR.popover.getHeight(TRACKER_POPOVER_ID).catch(() => undefined),
    ]);
    const actualTrackerWidth = Number(trackerWidth) || fallbackTrackerWidth;
    const actualTrackerHeight = Number(trackerHeight) || 156;
    frameLeft = Math.max(
      12,
      Math.min(
        Number(trackerAnchor?.left) - actualTrackerWidth / 2,
        viewportWidth - actualTrackerWidth - 12
      )
    );
    frameTop = Math.max(
      12,
      Math.min(
        Number(trackerAnchor?.top) - actualTrackerHeight,
        viewportHeight - actualTrackerHeight - 12
      )
    );
  } else {
    try {
      const frameRect = window.frameElement?.getBoundingClientRect?.();
      frameLeft = Number(frameRect?.left) || 0;
      frameTop = Number(frameRect?.top) || 0;
    } catch {}
  }

  const left = frameLeft + Number(event.clientX || 0);
  const top = frameTop + Number(event.clientY || 0);
  const margin = 12;
  const horizontal = left + width > viewportWidth - margin
    ? "RIGHT"
    : "LEFT";
  const vertical = top + height > viewportHeight - margin
    ? "BOTTOM"
    : "TOP";

  return {
    width,
    height,
    anchorPosition: { left: Math.round(left), top: Math.round(top) },
    anchorOrigin: { horizontal, vertical },
    transformOrigin: { horizontal, vertical },
  };
}

async function __handleInitiativeCardContextMenuAction(context, data) {
  return routeInitiativeCardContextMenuAction(context, data, {
    selectScope: __selectContextScope,
    openConditions: openCardEffectsPopup,
    clearConditions: __clearCardConditions,
    openSpells: openCardSpellsPopup,
    clearSpells: __clearCardSpells,
    clearConcentrations: __clearCardConcentrations,
    activateClassFeature: __activateClassFeatureFromContext,
    deactivateClassFeature: __deactivateClassFeatureFromContext,
    resetClassFeatureResources: __resetClassFeatureResourcesFromContext,
    openInitiativeCard: openInitiativeCardPopup,
    setAttitude: __setCardAttitude,
    setBossMode: __setCardBossMode,
    removeFromInitiative: __removeCardFromInitiative,
  });
}

function mountInitiativeCardContextMenuListener() {
  OBR.broadcast.onMessage(INITIATIVE_CARD_CONTEXT_MENU_CHANNEL, (event) => {
    const data = event?.data;
    if (!isMenuMessageForRequest(data, __initiativeCardContextMenuRequestId)) return;

    if (data.type === "close") {
      __closeInitiativeCardContextMenu();
      return;
    }
    if (data.type === "resize") {
      const height = Math.max(120, Math.round(Number(data.height) || 0));
      void OBR.popover.setHeight(INITIATIVE_CARD_CONTEXT_MENU_ID, height).catch(() => {});
      return;
    }
    if (data.type !== "action" ||
        !__initiativeCardContextMenuContext ||
        !isAllowedInitiativeCardMenuAction(data.action, data.value)) return;

    const context = __initiativeCardContextMenuContext;
    __closeInitiativeCardContextMenu();
    void __handleInitiativeCardContextMenuAction(context, data).catch((error) => {
      console.warn("[initiative-card-context-menu] action error:", error?.message || error);
      if (String(data.action || "").startsWith("class-feature-")) {
        void OBR.notification.show(
          error?.message || "Attivazione della capacità non riuscita.",
          "WARNING",
        ).catch(() => {});
      }
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !__initiativeCardContextMenu) return;
    void __closeInitiativeCardContextMenu();
  }, { capture: true });
}

function mountTrackerQuickActionsPopoverListener() {
  OBR.broadcast.onMessage(TRACKER_QUICK_ACTIONS_CHANNEL, (event) => {
    const data = event?.data;
    if (!isMenuMessageForRequest(data, __trackerQuickActionsRequestId)) return;
    if (data.type === "close") {
      __closeTrackerQuickActionsPopover();
      return;
    }
    if (data.type === "resize") {
      const height = Math.max(88, Math.round(Number(data.height) || 0));
      void OBR.popover.setHeight(TRACKER_QUICK_ACTIONS_POPOVER_ID, height).catch(() => {});
      return;
    }
    if (data.type !== "action" || !__trackerQuickActionsContext) return;

    const actionId = String(data.actionId || "").trim();
    const action = sanitizeQuickActions(
      __trackerQuickActionsContext.sourceEntry?.quickActions,
      { limit: 64 },
    ).find((entry) => entry.id === actionId);
    if (!action) return;
    const { sourceEntry } = __trackerQuickActionsContext;
    __closeTrackerQuickActionsPopover();
    void __runTrackerQuickAction(sourceEntry, action).catch((error) => {
      console.warn("[tracker-quick-actions] action error:", error?.message || error);
    });
  });
}

function __disabledTrackerQuickActionIds(sourceEntry, actions) {
  const activeSelfOrAuraFeatureIds = new Set(
    (Array.isArray(sourceEntry?.classFeatures) ? sourceEntry.classFeatures : [])
      .filter((feature) => (
        feature?.active === true
        && (feature.targetMode === "self" || feature.targetMode === "aura")
      ))
      .map((feature) => String(feature.featureId || "").trim())
      .filter(Boolean),
  );
  return actions
    .filter((action) => (
      action?.kind === "feature"
      && activeSelfOrAuraFeatureIds.has(String(action.featureId || "").trim())
    ))
    .map((action) => action.id);
}

function __toggleTrackerQuickActionsPopover(sourceEntry, button, event) {
  const sourceId = splitParagonId(sourceEntry?.id).baseId;
  if (!sourceId) return;
  if (__trackerQuickActionsRequestId && __trackerQuickActionsSourceId === sourceId) {
    void __closeTrackerQuickActionsPopover();
    return;
  }

  const closePromises = [
    __closeTrackerQuickActionsPopover(),
    __closeInitiativeCardContextMenu(),
  ];
  const openRevision = __trackerQuickActionsRevision;
  const requestId = createMenuRequestId();
  const actions = sanitizeQuickActions(sourceEntry.quickActions, { limit: 64 });
  const disabledActionIds = __disabledTrackerQuickActionIds(sourceEntry, actions);
  if (!actions.length || !writeStoredMenuPayload(
    localStorage,
    TRACKER_QUICK_ACTIONS_PAYLOAD_PREFIX,
    requestId,
    {
      title: `${sourceEntry.name || "Personaggio"} · Azioni rapide`,
      sourceId,
      actions,
      ...(disabledActionIds.length ? { disabledActionIds } : {}),
    },
  )) {
    console.warn("[tracker-quick-actions] payload error");
    return;
  }

  __trackerQuickActionsRequestId = requestId;
  __trackerQuickActionsContext = { sourceEntry };
  __trackerQuickActionsSourceId = sourceId;
  __trackerQuickActionsButton = button;
  button.setAttribute("aria-expanded", "true");
  const placementPromise = __getInitiativeCardContextMenuPlacement(event);
  void (async () => {
    const [, , basePlacement] = await Promise.all([
      ...closePromises,
      placementPromise,
    ]);
    if (
      __trackerQuickActionsRevision !== openRevision
      || __trackerQuickActionsRequestId !== requestId
    ) {
      return;
    }
    if (__trackerQuickActionsRequestId !== requestId) return;
    await OBR.popover.open({
      id: TRACKER_QUICK_ACTIONS_POPOVER_ID,
      url: `/tracker-quick-actions.html?request=${encodeURIComponent(requestId)}`,
      width: TRACKER_QUICK_ACTIONS_WIDTH,
      height: Math.min(
        TRACKER_QUICK_ACTIONS_INITIAL_HEIGHT,
        54 + (actions.length * 38),
      ),
      anchorReference: "POSITION",
      anchorPosition: basePlacement.anchorPosition,
      anchorOrigin: basePlacement.anchorOrigin,
      transformOrigin: basePlacement.transformOrigin,
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    __trackerQuickActionsPopover = true;
  })().catch((error) => {
    console.warn("[tracker-quick-actions] popover open error:", error?.message || error);
    __closeTrackerQuickActionsPopover();
  });
}

function __openInitiativeCardContextMenu(sourceEntry, event) {
  if (!IS_GM || !sourceEntry ||
      isLairId(sourceEntry.id) || isEpicActionId(sourceEntry.id)) return;

  event.preventDefault();
  event.stopPropagation();
  const closePromises = [
    __closeTrackerQuickActionsPopover(),
    __closeInitiativeCardContextMenu(),
  ];
  const openRevision = __initiativeCardContextMenuRevision;
  const scopeIds = __contextScopeIds(sourceEntry);
  const hasActiveConcentration = !!sourceEntry.isConcentrating || scopeIds.some((id) =>
    __activeLabelEntriesById.get(id)?.isConcentrating
  );

  const requestId = createMenuRequestId();
  const payload = buildInitiativeCardContextMenuPayload({
    sourceEntry,
    scopeIds,
    hasActiveConcentration,
  });
  if (!writeStoredMenuPayload(
    localStorage,
    INITIATIVE_CARD_CONTEXT_MENU_PAYLOAD_PREFIX,
    requestId,
    payload
  )) {
    console.warn("[initiative-card-context-menu] payload error");
    return;
  }

  __initiativeCardContextMenuRequestId = requestId;
  __initiativeCardContextMenuContext = { sourceEntry, scopeIds };
  const placementPromise = __getInitiativeCardContextMenuPlacement(event);
  void (async () => {
    const [, , placement] = await Promise.all([
      ...closePromises,
      placementPromise,
    ]);
    if (__initiativeCardContextMenuRevision !== openRevision) return;
    if (__initiativeCardContextMenuRequestId !== requestId) return;
    await OBR.popover.open({
      id: INITIATIVE_CARD_CONTEXT_MENU_ID,
      url: `/initiative-card-context-menu.html?request=${encodeURIComponent(requestId)}`,
      width: placement.width,
      height: placement.height,
      anchorReference: "POSITION",
      ...placement,
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
    __initiativeCardContextMenu = true;
  })().catch((error) => {
    console.warn("[initiative-card-context-menu] popover open error:", error?.message || error);
    __closeInitiativeCardContextMenu();
  });
}

function __bindInitiativeCardContextMenu(card, sourceEntry) {
  card.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    __openInitiativeCardContextMenu(sourceEntry, event);
  }, { capture: true });
}

    // ===== Render card
let __lastCompactPopoverSize = "";
let __compactPopoverResizeRevision = 0;
const COMPACT_TRACKER_RESIZE_DURATION_MS = 240;

function __syncTrackerPopoverSizeForLayout() {
  __lastCompactPopoverSize = "";
  __compactPopoverResizeRevision += 1;
  if (isCompactTrackerLayout()) {
    resizeCompactTrackerPopover(
      Array.from(track.querySelectorAll("[data-tracker-card='1']")),
    );
    return;
  }

  void (async () => {
    let viewportHeight = 900;
    try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
    await Promise.all([
      OBR.popover.setWidth(TRACKER_POPOVER_ID, 340),
      OBR.popover.setHeight(TRACKER_POPOVER_ID, Math.max(360, Math.floor(viewportHeight - 124))),
    ]);
  })().catch(() => {});
}

async function __animateCompactTrackerPopoverWidth(
  targetWidth,
  revision,
  { syncProgress = null, duration = COMPACT_TRACKER_RESIZE_DURATION_MS } = {},
) {
  const currentWidth = Number(
    await OBR.popover.getWidth(TRACKER_POPOVER_ID).catch(() => targetWidth)
  ) || targetWidth;
  if (revision !== __compactPopoverResizeRevision || !isCompactTrackerLayout()) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion || Math.abs(targetWidth - currentWidth) < 2) {
    await OBR.popover.setWidth(TRACKER_POPOVER_ID, targetWidth);
    return;
  }

  const startedAt = performance.now();
  let lastWidth = Math.round(currentWidth);
  while (revision === __compactPopoverResizeRevision && isCompactTrackerLayout()) {
    const frameTime = await new Promise((resolve) => requestAnimationFrame(resolve));
    if (revision !== __compactPopoverResizeRevision || !isCompactTrackerLayout()) return;

    const syncedProgress = Number(syncProgress?.());
    const progress = Number.isFinite(syncedProgress)
      ? Math.max(0, Math.min(1, syncedProgress))
      : Math.min(1, (frameTime - startedAt) / duration);
    const nextWidth = Number.isFinite(syncedProgress)
      ? Math.round(currentWidth + (targetWidth - currentWidth) * progress)
      : compactTrackerResizeWidth(currentWidth, targetWidth, progress);
    if (nextWidth !== lastWidth) {
      await OBR.popover.setWidth(TRACKER_POPOVER_ID, nextWidth);
      lastWidth = nextWidth;
    }
    if (progress >= 1) return;
  }
}

function resizeCompactTrackerPopover(
  entries,
  { syncProgress = null, duration = COMPACT_TRACKER_RESIZE_DURATION_MS } = {},
) {
  const requestedWidth = getCompactTrackerManualWidth()
    || compactTrackerWidth(entries?.length, {
      showToolbar: IS_GM,
      showNavigation: IS_GM,
    });
  const requestedHeight = 156;
  const requestKey = `${requestedWidth}x${requestedHeight}`;
  if (__lastCompactPopoverSize === requestKey) return;
  __lastCompactPopoverSize = requestKey;
  const revision = ++__compactPopoverResizeRevision;

  void (async () => {
    let viewportWidth = 1200;
    try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
    if (revision !== __compactPopoverResizeRevision || !isCompactTrackerLayout()) return;
    const width = compactTrackerViewportWidth(requestedWidth, viewportWidth);
    try {
      await Promise.all([
        __animateCompactTrackerPopoverWidth(width, revision, { syncProgress, duration }),
        OBR.popover.setHeight(TRACKER_POPOVER_ID, requestedHeight),
      ]);
    } catch (error) {
      if (revision === __compactPopoverResizeRevision) __lastCompactPopoverSize = "";
      console.warn("[tracker-layout] ridimensionamento compatto fallito:", error?.message || error);
    }
  })();
}

mountCompactTrackerResizeHandles({
  container,
  isCompact: isCompactTrackerLayout,
  onResizeStart() {
    __compactPopoverResizeRevision += 1;
    __lastCompactPopoverSize = "";
  },
  onAutoFitRequest() {
    __lastCompactPopoverSize = "";
    resizeCompactTrackerPopover(
      Array.from(track.querySelectorAll("[data-tracker-card='1']")),
    );
  },
});

const GROUP_LAYOUT_ANIMATION_MS = 460;
const GROUP_LAYOUT_STAGGER_MS = 34;
const GROUP_LAYOUT_MAX_STAGGER_MS = 140;
const GROUP_LAYOUT_EASING = "cubic-bezier(.45,0,.55,1)";
const GROUP_CARD_SWAP_FADE_MS = 220;
const GROUP_CARD_SWAP_EASING = "cubic-bezier(.22,1,.36,1)";
let __finishGroupLayoutTransition = null;
let __activeGroupLayoutSignature = null;
let __afterGroupLayoutTransition = null;
let __pendingGroupLayoutNodes = null;

function __runAfterGroupLayoutTransition(callback) {
  __afterGroupLayoutTransition = callback;
  if (__finishGroupLayoutTransition) return;
  const pending = __afterGroupLayoutTransition;
  __afterGroupLayoutTransition = null;
  requestAnimationFrame(() => pending?.());
}

function __scrollTrackerCardIntoView(card) {
  if (!(card instanceof HTMLElement)) return;
  const wrapRect = trackWrap.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const compact = isCompactTrackerLayout();
  const wrapCenter = compact
    ? wrapRect.left + wrapRect.width / 2
    : wrapRect.top + wrapRect.height / 2;
  const cardCenter = compact
    ? cardRect.left + cardRect.width / 2
    : cardRect.top + cardRect.height / 2;
  const distance = cardCenter - wrapCenter;
  const viewportSize = compact ? wrapRect.width : wrapRect.height;
  const outside = compact
    ? cardRect.left < wrapRect.left || cardRect.right > wrapRect.right
    : cardRect.top < wrapRect.top || cardRect.bottom > wrapRect.bottom;
  if (!outside) return;

  if (Math.abs(distance) > viewportSize * 0.72) {
    if (compact) trackWrap.scrollLeft += distance;
    else trackWrap.scrollTop += distance;
    return;
  }
  card.scrollIntoView?.({
    behavior: "smooth",
    block: compact ? "nearest" : "center",
    inline: compact ? "center" : "nearest",
  });
}

function __groupLayoutSignature(nodes) {
  const layout = isCompactTrackerLayout() ? "compact" : "classic";
  return `${layout}:${nodes
    .filter((node) => node instanceof HTMLElement && node.dataset.trackerCard === "1")
    .map((node) => `${node.dataset.groupKey || ""}:${node.dataset.itemId || ""}:${node.dataset.groupCollapsed || "0"}`)
    .join("|")}`;
}

function __syncTrackerCardStateClasses(card) {
  if (!(card instanceof HTMLElement)) return;
  card.classList.toggle("is-active", card.dataset.active === "1");
  card.classList.toggle("is-selected", card.dataset.selectionState === "all");
  card.classList.toggle("is-partially-selected", card.dataset.selectionState === "partial");
  card.classList.toggle("is-collapsed", card.dataset.groupCollapsed === "1");
}

function __copyTrackerCardOuterState(liveCard, nextCard) {
  for (const attribute of Array.from(liveCard.attributes)) {
    if (!nextCard.hasAttribute(attribute.name)) liveCard.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(nextCard.attributes)) {
    liveCard.setAttribute(attribute.name, attribute.value);
  }
  liveCard.__selectionBaseShadow = nextCard.__selectionBaseShadow ?? nextCard.style.boxShadow ?? "";
  __syncTrackerCardStateClasses(liveCard);
}

function __entryMatchesTrackerItemIds(entry, itemIds) {
  if (!(itemIds instanceof Set) || itemIds.size === 0) return true;
  if (entry?.epicBossId && itemIds.has(entry.epicBossId)) return true;
  return __selectionIdsForEntry(entry).some((id) => itemIds.has(id));
}

function __trackerCardHasOpenEditor(card) {
  if (!(card instanceof HTMLElement)) return false;
  if (card.dataset.renaming === "1") return true;
  if (card.querySelector("[data-init-editing='1'], [data-hp-editing='1']")) return true;
  const editingIds = [__editingInitForId, __editingHPForId]
    .filter(Boolean)
    .map((id) => splitParagonId(id).baseId);
  return editingIds.some((id) => card.__selectionItemIds?.includes(id));
}

function __replaceTrackCardsIncremental(nextNodes) {
  const liveCards = Array.from(track.children).filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  const replacements = [];
  for (const nextCard of nextNodes) {
    if (!(nextCard instanceof HTMLElement) || nextCard.dataset.trackerCard !== "1") continue;
    const liveCard = liveCards.find((candidate) =>
      candidate.dataset.itemId === nextCard.dataset.itemId
    );
    if (!liveCard) return false;
    replacements.push({ liveCard, nextCard });
  }
  if (!replacements.length) return false;

  const scrollLeftBefore = trackWrap.scrollLeft;
  const scrollTopBefore = trackWrap.scrollTop;
  let replaced = 0;
  let skippedEditors = 0;
  for (const { liveCard, nextCard } of replacements) {
    if (__trackerCardHasOpenEditor(liveCard)) {
      skippedEditors += 1;
      __markEditorDirtyFromCard(liveCard);
      continue;
    }
    if (__expandedCompactEffectsId === liveCard.dataset.itemId) {
      void __closeCompactEffectsPopover();
    }
    liveCard.replaceWith(nextCard);
    replaced += 1;
  }
  trackWrap.scrollLeft = scrollLeftBefore;
  trackWrap.scrollTop = scrollTopBefore;
  __initiativeDiag("render:cards-incremental", {
    requested: replacements.length,
    replaced,
    skippedEditors,
    layout: isCompactTrackerLayout() ? "compact" : "classic",
  });
  return true;
}

function __reconcileTrackCardsById(nextNodes) {
  const nextCards = nextNodes.filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  const liveCards = Array.from(track.children).filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  if (
    liveCards.length !== nextCards.length ||
    liveCards.some((card, index) => card.dataset.itemId !== nextCards[index]?.dataset.itemId)
  ) return false;

  let replaced = 0;
  for (let index = 0; index < liveCards.length; index++) {
    const liveCard = liveCards[index];
    const nextCard = nextCards[index];
    if (liveCard.innerHTML !== nextCard.innerHTML) {
      liveCard.replaceWith(nextCard);
      replaced += 1;
      continue;
    }
    __copyTrackerCardOuterState(liveCard, nextCard);
  }
  __initiativeDiag("render:cards-reconciled", {
    preserved: liveCards.length - replaced,
    replaced,
    layout: isCompactTrackerLayout() ? "compact" : "classic",
  });
  return true;
}

const ACTIVE_CARD_VISUAL_PROPERTIES = [
  "background",
  "backgroundColor",
  "border",
  "borderColor",
  "boxShadow",
  "filter",
  "opacity",
  "scale",
  "zIndex",
];

function __syncActiveCardVisuals(nextNodes) {
  const nextById = new Map(nextNodes
    .filter((node) => node instanceof HTMLElement && node.dataset.trackerCard === "1")
    .map((node) => [node.dataset.itemId, node]));
  const nextByGroup = new Map();
  for (const node of nextNodes) {
    if (!(node instanceof HTMLElement) || node.dataset.trackerCard !== "1") continue;
    const groupKey = node.dataset.groupKey;
    if (groupKey && !nextByGroup.has(groupKey)) nextByGroup.set(groupKey, node);
  }
  const liveCards = Array.from(track.querySelectorAll("[data-tracker-card='1']"));
  for (const liveCard of liveCards) {
    const nextCard = nextById.get(liveCard.dataset.itemId) ||
      nextByGroup.get(liveCard.dataset.groupKey);
    if (!nextCard) {
      delete liveCard.dataset.active;
      liveCard.style.scale = "1";
      __syncTrackerCardStateClasses(liveCard);
      continue;
    }
    if (nextCard.dataset.active === "1") liveCard.dataset.active = "1";
    else delete liveCard.dataset.active;
    for (const property of ACTIVE_CARD_VISUAL_PROPERTIES) {
      liveCard.style[property] = nextCard.style[property] || "";
    }
    liveCard.__selectionBaseShadow = nextCard.style.boxShadow || "";
    __applyTrackerSelectionState(liveCard);
    __syncTrackerCardStateClasses(liveCard);
  }
}

function __animateActiveCardEntrance(animateActive, expectedActiveId = null) {
  if (!animateActive || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const card = Array.from(track.querySelectorAll("[data-tracker-card='1'][data-active='1']"))
    .find((candidate) => !expectedActiveId || candidate.dataset.itemId === String(expectedActiveId));
  if (!(card instanceof HTMLElement)) {
    __initiativeDiag("animation:active-skipped-missing", {
      activeId: expectedActiveId,
      layout: isCompactTrackerLayout() ? "compact" : "classic",
    });
    return;
  }
  const targetScale = card.style.scale || String(ZOOM_CFG.scale);
  const previousTransition = card.style.transition;
  card.style.transition = "none";
  card.style.scale = "1";
  void card.offsetHeight;
  card.style.transition = previousTransition;
  card.style.scale = targetScale;
  __initiativeDiag("animation:active-start", {
    activeId: card.dataset.itemId,
    layout: isCompactTrackerLayout() ? "compact" : "classic",
  });
}

function __groupAccordionFrames(dx, dy, baseTransform = "none") {
  const compact = isCompactTrackerLayout();
  const axisX = compact ? dx : 0;
  const axisY = compact ? 0 : dy;
  const transformSuffix = baseTransform && baseTransform !== "none"
    ? ` ${baseTransform}`
    : "";
  return [
    { transform: `translate(${axisX}px, ${axisY}px)${transformSuffix}` },
    { transform: baseTransform || "none" },
  ];
}

function __trackerCardsByGroup(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || node.dataset.trackerCard !== "1") continue;
    const key = node.dataset.groupKey;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  return groups;
}

function __captureTransitionCard(card) {
  const rect = card.getBoundingClientRect();
  return {
    rect,
    layoutLeft: card.offsetLeft,
    layoutTop: card.offsetTop,
    width: card.offsetWidth || rect.width,
    height: card.offsetHeight || rect.height,
    originalStyle: card.getAttribute("style"),
    baseTransform: card.style.transform || "none",
  };
}

function __replaceTrackCardsMagnetic(nodes, { onGroupTransitionStart = null } = {}) {
  const compact = isCompactTrackerLayout();
  const nextNodes = nodes.filter(Boolean);
  const nextSignature = __groupLayoutSignature(nextNodes);
  if (__finishGroupLayoutTransition && __activeGroupLayoutSignature === nextSignature) {
    __pendingGroupLayoutNodes = nextNodes;
    __syncActiveCardVisuals(nextNodes);
    __initiativeDiag("animation:group-coalesced", {
      layout: compact ? "compact" : "classic",
    });
    return true;
  }

  __finishGroupLayoutTransition?.();
  __finishGroupLayoutTransition = null;
  __activeGroupLayoutSignature = null;
  __pendingGroupLayoutNodes = null;

  const oldCards = Array.from(track.children).filter(
    (node) => node instanceof HTMLElement && node.dataset.trackerCard === "1"
  );
  const oldGroups = __trackerCardsByGroup(oldCards);
  const nextGroups = __trackerCardsByGroup(nextNodes);
  const transitions = [];
  for (const [key, nextCards] of nextGroups) {
    const previousCards = oldGroups.get(key) || [];
    const wasCollapsed = previousCards.length === 1 && previousCards[0].dataset.groupCollapsed === "1";
    const isCollapsed = nextCards.length === 1 && nextCards[0].dataset.groupCollapsed === "1";
    if (wasCollapsed && nextCards.length > 1) transitions.push({ key, type: "expand" });
    else if (previousCards.length > 1 && isCollapsed) transitions.push({ key, type: "collapse" });
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!transitions.length) {
    const currentSignature = __groupLayoutSignature(oldCards);
    if (currentSignature === nextSignature && __reconcileTrackCardsById(nextNodes)) return false;
    track.replaceChildren(...nextNodes);
    return false;
  }
  if (reducedMotion) {
    track.replaceChildren(...nextNodes);
    return false;
  }

  const scrollLeftBefore = trackWrap.scrollLeft;
  const scrollTopBefore = trackWrap.scrollTop;
  const oldSnapshots = new Map(oldCards.map((card) => [card.dataset.itemId, __captureTransitionCard(card)]));
  track.replaceChildren(...nextNodes);
  const renderedGroups = __trackerCardsByGroup(nextNodes);
  const finalSnapshots = new Map(nextNodes
    .filter((card) => card instanceof HTMLElement && card.dataset.trackerCard === "1")
    .map((card) => [card.dataset.itemId, __captureTransitionCard(card)]));
  const promotedCards = nextNodes
    .filter((card) => card instanceof HTMLElement && card.dataset.trackerCard === "1")
    .map((card) => ({
      card,
      willChange: card.style.willChange,
      backfaceVisibility: card.style.backfaceVisibility,
    }));
  for (const { card } of promotedCards) {
    card.style.willChange = "transform";
    card.style.backfaceVisibility = "hidden";
  }
  const stages = [];

  const setAbsoluteCard = (card, snapshot, firstSnapshot, stageWidth, stageHeight) => {
    const offset = compact
      ? snapshot.rect.left - firstSnapshot.rect.left
      : snapshot.layoutTop - firstSnapshot.layoutTop;
    Object.assign(card.style, {
      position: "absolute",
      left: compact
        ? `${offset}px`
        : `${snapshot.layoutLeft - firstSnapshot.layoutLeft}px`,
      top: compact ? `${(stageHeight - snapshot.height) / 2}px` : `${offset}px`,
      width: `${snapshot.width}px`,
      minWidth: `${snapshot.width}px`,
      maxWidth: `${snapshot.width}px`,
      height: `${snapshot.height}px`,
      margin: "0",
      pointerEvents: "none",
      transition: "none",
      willChange: "transform, opacity",
      backfaceVisibility: "hidden",
    });
    return offset;
  };

  for (const { key, type } of transitions) {
    const oldGroup = (oldGroups.get(key) || [])
      .map((card) => ({ card, snapshot: oldSnapshots.get(card.dataset.itemId) }))
      .filter(({ snapshot }) => !!snapshot)
      .sort((a, b) => compact
        ? a.snapshot.rect.left - b.snapshot.rect.left
        : a.snapshot.rect.top - b.snapshot.rect.top
      );
    const rendered = (renderedGroups.get(key) || [])
      .map((card) => ({ card, snapshot: finalSnapshots.get(card.dataset.itemId) }))
      .filter(({ snapshot }) => !!snapshot)
      .sort((a, b) => compact
        ? a.snapshot.rect.left - b.snapshot.rect.left
        : a.snapshot.rect.top - b.snapshot.rect.top
      );
    if (!oldGroup.length || !rendered.length) continue;

    const stage = document.createElement("div");
    stage.dataset.groupTransitionStage = "1";
    const source = type === "collapse" ? oldGroup : rendered;
    const firstSnapshot = source[0].snapshot;
    const firstRect = firstSnapshot.rect;
    const lastRecord = source[source.length - 1];
    const expandedSize = compact
      ? lastRecord.snapshot.rect.right - firstRect.left
      : lastRecord.snapshot.layoutTop + lastRecord.snapshot.height - firstSnapshot.layoutTop;
    const motherSize = compact
      ? (type === "collapse" ? rendered[0].snapshot.width : oldGroup[0].snapshot.width)
      : (type === "collapse" ? rendered[0].snapshot.height : oldGroup[0].snapshot.height);
    const stageWidth = compact
      ? (type === "collapse" ? expandedSize : expandedSize)
      : Math.max(...source.map(({ snapshot }) => snapshot.width));
    const stageHeight = compact
      ? Math.max(...source.map(({ snapshot }) => snapshot.height))
      : (type === "collapse" ? expandedSize : expandedSize);
    const initialSize = type === "collapse" ? expandedSize : motherSize;
    const finalSize = type === "collapse" ? motherSize : expandedSize;
    Object.assign(stage.style, {
      position: "relative",
      flex: `0 0 ${initialSize}px`,
      width: `${compact ? initialSize : stageWidth}px`,
      minWidth: `${compact ? initialSize : stageWidth}px`,
      height: `${compact ? stageHeight : initialSize}px`,
      minHeight: `${compact ? stageHeight : initialSize}px`,
      alignSelf: "center",
      overflow: "visible",
      boxSizing: "border-box",
      zIndex: "2",
      contain: "layout style",
      willChange: "flex-basis",
      marginLeft: compact ? "0" : (source[0].card.style.marginLeft || "0"),
      marginRight: compact ? "0" : (source[0].card.style.marginRight || "0"),
    });

    const movingRecords = [];
    let finalCards = [];
    let finalLead = null;
    let finalLeadStyle = null;
    let swapVisual = null;

    if (type === "collapse") {
      finalLead = rendered[0].card;
      finalLeadStyle = finalLead.getAttribute("style");
      finalLead.replaceWith(stage);
      oldGroup.forEach(({ card, snapshot }, index) => {
        const visual = card;
        const activeVisual = visual.dataset.active === "1";
        visual.removeAttribute("id");
        const offset = setAbsoluteCard(visual, snapshot, firstSnapshot, stageWidth, stageHeight);
        visual.style.zIndex = index === 0 ? "1000" : String(900 - index);
        // Le card attive usano il gradiente/opacità della fazione. Un
        // backgroundColor pieno qui lo copriva durante la chiusura del gruppo
        // e faceva sparire anche la percezione dello zoom attivo.
        if (!activeVisual) visual.style.backgroundColor = "rgb(31, 39, 51)";
        else visual.style.backgroundColor = "";
        stage.appendChild(visual);
        if (index === 0) swapVisual = visual;
        else movingRecords.push({ card: visual, offset, baseTransform: snapshot.baseTransform, index: index - 1, count: oldGroup.length - 1 });
      });
      const finalSnapshot = rendered[0].snapshot;
      setAbsoluteCard(finalLead, finalSnapshot, finalSnapshot, stageWidth, stageHeight);
      finalLead.style.left = compact ? "0" : `${(stageWidth - finalSnapshot.width) / 2}px`;
      finalLead.style.top = compact ? `${(stageHeight - finalSnapshot.height) / 2}px` : "0";
      finalLead.style.visibility = "hidden";
      finalLead.style.zIndex = "1001";
      stage.appendChild(finalLead);
      finalCards = [finalLead];
    } else {
      const firstCard = rendered[0].card;
      firstCard.replaceWith(stage);
      for (const { card, snapshot } of rendered) {
        const originalStyle = card.getAttribute("style");
        const offset = setAbsoluteCard(card, snapshot, firstSnapshot, stageWidth, stageHeight);
        card.style.zIndex = card === firstCard ? "1000" : "800";
        stage.appendChild(card);
        movingRecords.push({ card, offset, baseTransform: snapshot.baseTransform, originalStyle, index: movingRecords.length, count: rendered.length });
      }
      const oldLead = oldGroup[0];
      swapVisual = oldLead.card;
      swapVisual.removeAttribute("id");
      setAbsoluteCard(swapVisual, oldLead.snapshot, oldLead.snapshot, stageWidth, stageHeight);
      swapVisual.style.left = compact ? "0" : `${(stageWidth - oldLead.snapshot.width) / 2}px`;
      swapVisual.style.top = compact ? `${(stageHeight - oldLead.snapshot.height) / 2}px` : "0";
      swapVisual.style.zIndex = "1001";
      stage.appendChild(swapVisual);
      finalCards = rendered.map(({ card }) => card);
    }

    const maxStaggerSteps = Math.max(
      0,
      movingRecords.length - (type === "expand" ? 2 : 1)
    );
    const transitionDuration = GROUP_LAYOUT_ANIMATION_MS + Math.min(
      maxStaggerSteps * GROUP_LAYOUT_STAGGER_MS,
      GROUP_LAYOUT_MAX_STAGGER_MS
    );
    stages.push({
      key,
      type,
      stage,
      initialSize,
      finalSize,
      stageWidth,
      stageHeight,
      movingRecords,
      finalCards,
      finalLead,
      finalLeadStyle,
      finalLeadOpacity: finalLead?.style.opacity || "1",
      swapVisual,
      transitionDuration,
    });
  }

  trackWrap.scrollLeft = Math.min(scrollLeftBefore, Math.max(0, trackWrap.scrollWidth - trackWrap.clientWidth));
  trackWrap.scrollTop = Math.min(scrollTopBefore, Math.max(0, trackWrap.scrollHeight - trackWrap.clientHeight));

  const animations = [];
  const play = (element, frames, options) => {
    const animation = element.animate?.(frames, options);
    if (animation) animations.push(animation);
    return animation;
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const animation of animations) animation.cancel?.();
    for (const record of stages) {
      if (record.type === "collapse") {
        if (!record.finalLead) continue;
        if (record.finalLeadStyle === null) record.finalLead.removeAttribute("style");
        else record.finalLead.setAttribute("style", record.finalLeadStyle);
        if (record.stage.isConnected) record.stage.replaceWith(record.finalLead);
      } else {
        for (const moving of record.movingRecords) {
          if (moving.originalStyle === null) moving.card.removeAttribute("style");
          else moving.card.setAttribute("style", moving.originalStyle);
        }
        if (record.stage.isConnected) record.stage.replaceWith(...record.finalCards);
      }
    }
    for (const promoted of promotedCards) {
      promoted.card.style.willChange = promoted.willChange;
      promoted.card.style.backfaceVisibility = promoted.backfaceVisibility;
    }
    const pendingNodes = __pendingGroupLayoutNodes;
    __pendingGroupLayoutNodes = null;
    if (pendingNodes && !__reconcileTrackCardsById(pendingNodes)) {
      track.replaceChildren(...pendingNodes);
    }
    if (__finishGroupLayoutTransition === finish) __finishGroupLayoutTransition = null;
    if (__activeGroupLayoutSignature === nextSignature) __activeGroupLayoutSignature = null;
    __initiativeDiag("animation:group-finished", {
      layout: compact ? "compact" : "classic",
      coalesced: !!pendingNodes,
    });
    const afterTransition = __afterGroupLayoutTransition;
    __afterGroupLayoutTransition = null;
    if (afterTransition) requestAnimationFrame(() => afterTransition());
  };
  __finishGroupLayoutTransition = finish;
  __activeGroupLayoutSignature = nextSignature;

  requestAnimationFrame(() => {
    if (finished) return;
    for (const record of stages) {
      const compactFrames = [
        { flexBasis: `${record.initialSize}px`, width: `${record.initialSize}px`, minWidth: `${record.initialSize}px` },
        { flexBasis: `${record.finalSize}px`, width: `${record.finalSize}px`, minWidth: `${record.finalSize}px` },
      ];
      const classicFrames = [
        { flexBasis: `${record.initialSize}px`, height: `${record.initialSize}px`, minHeight: `${record.initialSize}px` },
        { flexBasis: `${record.finalSize}px`, height: `${record.finalSize}px`, minHeight: `${record.finalSize}px` },
      ];
      play(record.stage, compact ? compactFrames : classicFrames, {
        duration: record.transitionDuration,
        easing: GROUP_LAYOUT_EASING,
        fill: "forwards",
      });

      for (const moving of record.movingRecords) {
        if (record.type === "collapse") {
          const reverseDelay = Math.min(
            Math.max(0, moving.count - 1 - moving.index) * GROUP_LAYOUT_STAGGER_MS,
            GROUP_LAYOUT_MAX_STAGGER_MS
          );
          play(moving.card, __groupAccordionFrames(
            compact ? -moving.offset : 0,
            compact ? 0 : -moving.offset,
            moving.baseTransform
          ), {
            duration: GROUP_LAYOUT_ANIMATION_MS,
            delay: reverseDelay,
            easing: GROUP_LAYOUT_EASING,
            direction: "reverse",
            fill: "both",
          });
        } else if (moving.offset > 0) {
          play(moving.card, __groupAccordionFrames(
            compact ? -moving.offset : 0,
            compact ? 0 : -moving.offset,
            moving.baseTransform
          ), {
            duration: GROUP_LAYOUT_ANIMATION_MS,
            delay: Math.min(Math.max(0, moving.index - 1) * GROUP_LAYOUT_STAGGER_MS, GROUP_LAYOUT_MAX_STAGGER_MS),
            easing: GROUP_LAYOUT_EASING,
            fill: "backwards",
          });
        }
      }

      if (record.type === "expand") {
        play(record.swapVisual, [{ opacity: 1 }, { opacity: 0 }], {
          duration: GROUP_CARD_SWAP_FADE_MS,
          easing: GROUP_CARD_SWAP_EASING,
          fill: "forwards",
        });
      } else {
        const fadeDelay = record.transitionDuration - GROUP_CARD_SWAP_FADE_MS;
        play(record.swapVisual, [{ opacity: 1 }, { opacity: 0 }], {
          duration: GROUP_CARD_SWAP_FADE_MS,
          delay: fadeDelay,
          easing: GROUP_CARD_SWAP_EASING,
          fill: "forwards",
        });
        record.finalLead.style.visibility = "";
        play(record.finalLead, [
          { opacity: 0 },
          { opacity: Number.parseFloat(record.finalLeadOpacity) || 1 },
        ], {
          duration: GROUP_CARD_SWAP_FADE_MS,
          delay: fadeDelay,
          easing: GROUP_CARD_SWAP_EASING,
          fill: "backwards",
        });
      }
    }

    const totalDuration = stages.reduce(
      (maximum, record) => Math.max(maximum, record.transitionDuration),
      GROUP_LAYOUT_ANIMATION_MS
    );
    const initialStageSizes = stages.map((record) => record.initialSize);
    const finalStageSizes = stages.map((record) => record.finalSize);
    onGroupTransitionStart?.({
      duration: totalDuration,
      measureProgress: () => compactTrackerGroupProgress(
        initialStageSizes,
        finalStageSizes,
        stages.map((record) => {
          const rect = record.stage.getBoundingClientRect();
          return compactTrackerStageSize(
            compact ? rect.width : rect.height,
            record.finalSize,
            record.stage.isConnected,
          );
        }),
      ),
    });
    window.setTimeout(finish, totalDuration + 80);
  });
  return true;
}

function __replaceTrackCardsAnimated(nodes, options) {
  return __replaceTrackCardsMagnetic(nodes, options);
}

let __expandedCompactEffectsId = null;

const COMPACT_EFFECTS_POPOVER_ID = `${ID}/compact-effects-popover`;
const COMPACT_EFFECTS_PAYLOAD_KEY = `${ID}/compact-effects-payload`;

async function __closeCompactEffectsPopover() {
  __expandedCompactEffectsId = null;
  await OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {});
}

function __compactTrackerFrameOrigin(trackerAnchor) {
  try {
    const frameRect = window.frameElement?.getBoundingClientRect?.();
    if (frameRect && Number.isFinite(frameRect.left) && Number.isFinite(frameRect.top)) {
      return { left: frameRect.left, top: frameRect.top };
    }
  } catch {}

  const frameWidth = Number(document.documentElement?.clientWidth) || window.innerWidth;
  const frameHeight = Number(document.documentElement?.clientHeight) || window.innerHeight;
  return {
    left: trackerAnchor.left - frameWidth / 2,
    top: trackerAnchor.top - frameHeight,
  };
}

async function __toggleCompactEffectsPopover(card, effectAnchor, entryId, effects) {
  if (__expandedCompactEffectsId === entryId) {
    await __closeCompactEffectsPopover();
    return false;
  }

  const remainingEffects = effects.slice(1);
  if (!remainingEffects.length) return false;
  localStorage.setItem(COMPACT_EFFECTS_PAYLOAD_KEY, JSON.stringify({ effects: remainingEffects }));

  const trackerAnchor = await getCompactTrackerPopoverAnchor();
  const cardRect = card.getBoundingClientRect();
  const effectAnchorRect = effectAnchor.getBoundingClientRect();
  const trackerOrigin = __compactTrackerFrameOrigin(trackerAnchor);
  const anchorPosition = {
    left: Math.round(trackerOrigin.left + effectAnchorRect.left + effectAnchorRect.width / 2),
    top: Math.round(trackerOrigin.top + effectAnchorRect.bottom),
  };
  const width = Math.max(72, Math.round(cardRect.width));
  const height = remainingEffects.length * 14 + Math.max(0, remainingEffects.length - 1) + 4;

  await OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {});
  try {
    await openTrackedPopover({
      id: COMPACT_EFFECTS_POPOVER_ID,
      url: "/compact-effects.html",
      width,
      height,
      anchorReference: "POSITION",
      anchorPosition,
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 0,
      hidePaper: true,
    });
    __expandedCompactEffectsId = entryId;
    return true;
  } catch (error) {
    __expandedCompactEffectsId = null;
    console.warn("[compact-effects] apertura pannello fallita:", error?.message || error);
    return false;
  }
}

function renderCompactTrack(
  entries,
  state,
  {
    animateActive = false,
    itemIds = null,
    boardTokenCompanionMap = null,
  } = {},
) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const activeIndex = Math.max(0, Math.min(order.length - 1, Number(state?.current) || 0));
  const activeId = order[activeIndex] || null;
  const activeChanged = !!activeId && activeId !== __lastRenderedActiveId;
  const visibleEntries = compactEntriesForRender(entries, state);
  const incrementalItemIds = Array.isArray(itemIds) && itemIds.length
    ? new Set(itemIds)
    : null;
  const entriesToRender = incrementalItemIds
    ? visibleEntries.filter((entry) => __entryMatchesTrackerItemIds(entry, incrementalItemIds))
    : visibleEntries;
  const companionsByCasterId = boardTokenCompanionMap
    || spellBoardTokenCompanionsByCasterId(__spellBoardTokenItems);

  track.style.justifyContent = "safe center";
  const nodes = entriesToRender.map((entry) => {
    const virtual = isLairId(entry.id) || isEpicActionId(entry.id);
    const {
      members,
      active,
      boss,
      attitude,
      portraitSize,
      canSeeHP,
      hp,
      hpMax,
      showHP,
      safeHP,
      hpPercent,
      knockedOut,
      effectMembers,
    } = deriveCompactCardPresentation(entry, activeId, { isGM: IS_GM, virtual });
    const faction = factionColors(attitude);
    const conditionInstances = effectMembers.flatMap((member) =>
      getEffectiveConditionInstances(member.conditions || {})
    );
    const spells = effectMembers.flatMap((member) =>
      Array.isArray(member.spells) ? member.spells : []
    );
    const concentrating = effectMembers.some((member) => member.isConcentrating);
    const compactEffects = __compactEffectItems(conditionInstances, spells, concentrating, {
      formatConditionName,
      formatConditionInstance,
      spellKey: __spellKey,
      concentrationSpellKey: entry.concSpellKey,
    });
    const hasExpandableEffects = compactEffects.length > 1;

    const dragAllowed = !(virtual || entry.isEpic);
    const card = buildCompactCardShell(entry, {
      active,
      boss,
      virtual,
      faction,
      rgba,
      canSeeHP,
      showHP,
      knockedOut,
      hasExpandableEffects,
      groupKey: entry.__groupKey || __groupKey(entry),
      selectionItemIds: __selectionIdsForEntry(entry),
      dragAllowed,
      zoomScale: ZOOM_CFG.scale,
    });

    card.addEventListener("click", (event) => {
      if (event.target.closest("button, [role='button']")) return;
      event.stopPropagation();
      void __selectTrackerEntry(entry, event);
    });
    __bindInitiativeCardContextMenu(card, entry);

    const { portrait, bossFrame } = buildCompactCardPortrait(entry, {
      active,
      boss,
      portraitSize,
      faction,
      rgba,
      bossFrameSrc: BOSS_PORTRAIT_FRAME_SRC,
      bossFrameScale: BOSS_PORTRAIT_FRAME_SCALE_COMPACT,
      bossFrameMask: BOSS_PORTRAIT_FRAME_MASK,
    });
    if (bossFrame) card.appendChild(bossFrame);

    const {
      initiativeBadge,
      statusBadge,
      activeMarker,
    } = buildCompactCardIndicators(entry, {
      active,
      isLair: isLairId(entry.id),
      faction,
      rgba,
    });
    card.appendChild(initiativeBadge);
    if (statusBadge) card.appendChild(statusBadge);
    if (activeMarker) card.appendChild(activeMarker);

    const {
      hpText,
      hpTrack,
      knockedOutBadge,
    } = buildCompactCardHP(entry, {
      showHP,
      safeHP,
      hpMax,
      hpPercent,
      knockedOut,
      hpColorByPct,
    });
    if (knockedOutBadge) card.appendChild(knockedOutBadge);

    const name = buildCompactCardName(entry, { active });
    if (IS_GM && !virtual && !entry.__groupCollapsed) {
      enableCompactCardRename({
        card,
        name,
        getOriginalName: () => entry.name,
        borderColor: faction.border,
        dragAllowed,
        saveName: async (nextName) => {
          await OBR.scene.items.updateItems([entry.id], (items) => {
            const item = items[0];
            __setSceneTokenDisplayName(item, nextName);
          });
          entry.name = nextName;
        },
        onError: (error) => {
          console.warn("[initiative] compact rename token:", error?.message || error);
        },
      });
    }

    const legendary = members.find((member) => Number(member.legendary?.max) > 0)?.legendary;
    const legendaryResistances = members.find(
      (member) => Number(member.legendaryResistances?.max) > 0
    )?.legendaryResistances;

    const effectsPopoverOpen = __expandedCompactEffectsId === entry.id;
    const {
      status,
      previewPill,
      moreEffectsButton,
    } = buildCompactCardStatus(compactEffects, {
      hasExpandableEffects,
      effectsPopoverOpen,
      spellColor: __spellColor,
      onTerminateClassFeature: IS_GM
        ? (instance) => __terminateClassFeatureOnTrackerCard(entry.id, instance)
        : null,
    });

    bindReferenceChips(status);

    const appendCompactLegendaryResource = (resource, kind, onSet, label) => {
      const pips = buildCompactLegendaryResourcePips(resource, {
        label,
        buildPips: () => kind === "resistance"
          ? mkLegendaryResistancePips(resource, onSet)
          : mkLegendaryPips(resource, onSet, entry.attitude || "enemy"),
      });
      if (pips) status.appendChild(pips);
    };
    appendCompactLegendaryResource(
      legendary,
      "action",
      async (nextCurrent) => {
        if (!IS_GM) return;
        try { await setLegendaryCurrent(entry.id, nextCurrent); } catch {}
      },
      "Azioni leggendarie",
    );
    appendCompactLegendaryResource(
      legendaryResistances,
      "resistance",
      async (nextCurrent) => {
        if (!IS_GM) return;
        try { await setLegendaryResistanceCurrent(entry.id, nextCurrent); } catch {}
      },
      "Resistenze leggendarie",
    );

    card.append(portrait, name, hpText, hpTrack, status);
    __mountTrackerQuickActions(card, entry, { compact: true });
    appendSpellBoardTokenCompanions(
      card,
      spellBoardTokenCompanionsForEntry(entry, companionsByCasterId),
      {
        compact: true,
        faction,
        onBindHP: IS_GM ? bindSpellBoardTokenCompanionHPEditor : null,
      },
    );
    if (hasExpandableEffects && !previewPill?.dataset.referenceEntry) {
      bindCompactEffectsToggle({
        previewPill,
        moreEffectsButton,
        effectsCount: compactEffects.length,
        requestToggle: () => __toggleCompactEffectsPopover(
          card,
          previewPill,
          entry.id,
          compactEffects,
        ),
      });
    }
    if (active) card.dataset.active = "1";
    __applyTrackerSelectionState(card);
    return card;
  });

  if (incrementalItemIds) {
    if (!__replaceTrackCardsIncremental(nodes)) return false;
    resizeCompactTrackerPopover(visibleEntries);
    updateActiveCardMovementIndicator();
    __lastRenderedActiveId = activeId;
    return true;
  }

  const groupResizeScheduled = __replaceTrackCardsAnimated(nodes, {
    onGroupTransitionStart: ({ measureProgress, duration }) => {
      resizeCompactTrackerPopover(visibleEntries, {
        syncProgress: measureProgress,
        duration,
      });
    },
  });
  __animateActiveCardEntrance(animateActive && activeChanged, activeId);
  if (__expandedCompactEffectsId && !nodes.some((node) =>
    node.dataset.itemId === __expandedCompactEffectsId && node.dataset.hasEffectOverflow === "1"
  )) {
    void __closeCompactEffectsPopover();
  }
  if (!groupResizeScheduled) resizeCompactTrackerPopover(visibleEntries);
  updateActiveCardMovementIndicator();
  if (__scrollActiveOnNextRender || activeChanged) {
    __scrollActiveOnNextRender = false;
    __runAfterGroupLayoutTransition(() => {
      __scrollTrackerCardIntoView(track.querySelector('[data-active="1"]'));
    });
  }
  __lastRenderedActiveId = activeId;
  return true;
}

function buildClassicTrackerCardForRender(entry, state, nextId) {
  return buildClassicTrackerCard(entry, {
    state,
    nextId,
    boardTokenItems: __spellBoardTokenItems,
    isGM: IS_GM,
    constants: {
      BADGE_RIGHT,
      BADGE_SIZE,
      BOSS_PORTRAIT_FRAME_SCALE,
      BOSS_PORTRAIT_FRAME_SRC,
      CHIP_GAP_PX,
      CONDITIONS,
      DEFAULT_LEGENDARY_RESISTANCES,
      EPIC_TAG_CFG,
      LEG_BOSS_CFG,
      LEG_PIPS_CFG,
      LEG_RESOURCE_CFG,
      PAR_CTRL_CFG,
      ZOOM_CFG,
    },
    operations: {
      __applyTrackerSelectionState,
      __bindSpellBoardTokenHPEditor: bindSpellBoardTokenHPEditor,
      __bindInitiativeCardContextMenu,
      __buildConditionChipsSafe,
      __findSpellBoardToken: spellBoardTokenForSpell,
      __groupKey,
      __instaTransform,
      __removeConditionOnTrackerCard,
      __safeConditions,
      __selectTrackerEntry,
      __selectionIdsForEntry,
      __spellColor,
      __spellKey,
      __terminateClassFeatureOnTrackerCard,
      __terminateSpellOnTrackerCard,
      applyGroupHPMaxDeltaWithRenderLock,
      armDocClickIgnore,
      bindHPEditorForEntry,
      bindInitiativeEditorForEntry,
      bindReferenceChips,
      closeOpenEditors,
      factionColors,
      formatHPHTML,
      getEditingHPForId,
      isEpicActionId,
      isLairId,
      mountChipsWithOverflow,
      mountTrackerQuickActions: __mountTrackerQuickActions,
      openInitiativeCardPopup,
      parseRelativeHPDelta,
      reconcileStateWithItems,
      renderAll,
      rgba,
      saveClassicTrackerEntryName,
      setLegendaryCurrent,
      setLegendaryMax,
      setLegendaryResistanceCurrent,
      setLegendaryResistanceMax,
      setParagonActions,
      setSceneState,
    },
  });
}

    function renderTrack(entries, state, opts = {}) {
    if (__suspendRenders) return;
    const animateActive = !!opts.animateActive;
    const compactLayout = isCompactTrackerLayout();
    const projectionPolicy = runtimeOptionsService.get(selectTrackerProjectionPolicy);
    const projectedEntries = projectTrackerEntries(entries, {
      role: IS_GM ? "GM" : "PLAYER",
      surface: compactLayout ? "trackerCompact" : "trackerClassic",
      hpPolicy: projectionPolicy.hp,
      effectsPolicy: projectionPolicy.effects,
      bossDetails: projectionPolicy.bossDetails,
    });
    if (compactLayout) {
      const boardTokenCompanionMap = spellBoardTokenCompanionsByCasterId(__spellBoardTokenItems);
      return renderCompactTrack(projectedEntries, state, {
        animateActive,
        itemIds: opts.itemIds,
        boardTokenCompanionMap,
      });
    }
    entries = projectedEntries;
    const len = state.order.length;
    const activeIdx = state.current ?? 0;
    const currentActiveId = len ? state.order[activeIdx] : null;   // <-- AGGIUNTO QUI
    const nextId = len ? state.order[(activeIdx + 1) % len] : null;

    // ---- PRE-PROCESS: costruiamo una lista “entriesForRender” che rispetta i collapse
    const collapsed = state?.collapsed || {};
    const groups = __buildGroups(entries);

const emitted = new Set();
const entriesForRender = [];
for (const e of entries) {
  const k = __groupKey(e);
  const list = groups.get(k) || [e];

  if (list.length > 1 && collapsed[k]) {
    // gruppo collassato: emetti una sola card “lead”
    if (emitted.has(k)) continue;
    const lead = { 
      ...list[0],
      __groupKey: k,
      __groupMembers: list.slice(),
      __groupCollapsed: true,
      __groupBase: _parseIndexedName(e.name).base,
      __groupCount: list.length
    };
    entriesForRender.push(lead);
    emitted.add(k);
  } else {
    // gruppo espanso: segna la prima card per mostrare il chevron "▾"
    if (list.length > 1 && list[0].id === e.id) {
      e.__groupFirst = true;
      e.__groupKey = k;
      e.__groupBase = _parseIndexedName(e.name).base;
      e.__groupCount = list.length;
    }
    entriesForRender.push(e);
  }
}
    const incrementalItemIds = Array.isArray(opts.itemIds) && opts.itemIds.length
      ? new Set(opts.itemIds)
      : null;
    const renderEntries = incrementalItemIds
      ? entriesForRender.filter((entry) => __entryMatchesTrackerItemIds(entry, incrementalItemIds))
      : entriesForRender;
    const boardTokenCompanionMap = spellBoardTokenCompanionsByCasterId(__spellBoardTokenItems);
    const nodes = renderEntries.map((entry) => {
      const card = buildClassicTrackerCardForRender(entry, state, nextId);
      appendSpellBoardTokenCompanions(
        card,
        spellBoardTokenCompanionsForEntry(entry, boardTokenCompanionMap),
        {
          faction: factionColors(entry.attitude),
          onBindHP: IS_GM ? bindSpellBoardTokenCompanionHPEditor : null,
        },
      );
      return card;
    });

    if (incrementalItemIds) {
      if (!__replaceTrackCardsIncremental(nodes)) return false;
      updateActiveCardMovementIndicator(latestMovementSnapshot);
      __lastRenderedActiveId = currentActiveId;
      return true;
    }

    __replaceTrackCardsAnimated(nodes);
    __animateActiveCardEntrance(animateActive, currentActiveId);
    updateActiveCardMovementIndicator(latestMovementSnapshot);

  if (__scrollActiveOnNextRender) {
    __scrollActiveOnNextRender = false;
    __runAfterGroupLayoutTransition(() => {
      __scrollTrackerCardIntoView(track.querySelector('[data-active="1"]'));
    });
  }

  __lastRenderedActiveId = currentActiveId;  // <-- ora esiste
  return true;
}

async function ensureState(sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "ensure-state")) return false;
  const state = await getSceneState();
  if (!__isCurrentSceneOperation(sceneEpoch, "ensure-state")) return false;
  if (state) return false;
  const sorted = sortByInitiative(await getEntriesWithLair(null), null);
  if (!__isCurrentSceneOperation(sceneEpoch, "ensure-state")) return false;
  return setSceneState({
    order: [...new Set(sorted.map(e => e.id))],
    current: 0,
    round: 1,
    seededGroups: {},
    collapsed: {},
    ui: {
      ...(IS_GM ? {
        autoFocus: runtimeOptionsService.get(selectFollowActiveTurn),
      } : {}),
    activeBadge: { x: 0.12, y: 0.60 }, // 12% da sinistra, 60% dall’alto
    tagsDock:    { x: 0.72, y: 0.50 }  // badge EPIC a destra, centrato
    }
  }, sceneEpoch, {
    kind: "ensure-state",
    ownedFields: ["order", "current", "round", "seededGroups", "collapsed", "ui"],
  });
}

async function ensureSharedAutoFocusPreference(sceneEpoch = currentSceneEpoch()) {
  if (!IS_GM || !__isCurrentSceneOperation(sceneEpoch, "follow-state")) return false;
  const state = await getSceneState();
  if (!__isCurrentSceneOperation(sceneEpoch, "follow-state")) return false;
  if (state?.ui && Object.hasOwn(state.ui, "autoFocus")) return false;
  const enabled = runtimeOptionsService.get(selectFollowActiveTurn);
  await setSceneState((previous) => {
    if (previous?.ui && Object.hasOwn(previous.ui, "autoFocus")) return previous;
    return {
      ...(previous || {}),
      ui: { ...(previous?.ui || {}), autoFocus: enabled },
    };
  }, sceneEpoch);
  return __isCurrentSceneOperation(sceneEpoch, "follow-state");
}

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;

  }
async function reconcileStateWithItems(sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "reconcile-state")) return false;
  const preludeComplete = await runSceneEpochSteps({
    sceneEpoch,
    isCurrent: (epoch) => __isCurrentSceneOperation(epoch, "reconcile-state"),
    steps: [
      (epoch) => __gcSeededGroups(epoch),
      (epoch) => __backfillInitiativeForSeededGroups(epoch),
    ],
  });
  if (!preludeComplete) return false;
  const state   = await getSceneState();
  if (!__isCurrentSceneOperation(sceneEpoch, "reconcile-state")) return false;
  const entries = await getEntriesWithLair(state);
  if (!__isCurrentSceneOperation(sceneEpoch, "reconcile-state")) return false;

  if (!entries || entries.length === 0) {
    await resetTrackerState(sceneEpoch);
    return __isCurrentSceneOperation(sceneEpoch, "reconcile-state");
  }

  const expanded = expandParagonEntries(entries, state);
  const sorted   = sortByInitiative(expanded, state);

// base: SOLO item reali (niente EPIC virtual qui)
  let newOrder = [...new Set(sorted.map(e => e.id))];

// Se ci sono Epic Boss, inserisci una voce virtuale dopo OGNI PG
  const byId = new Map(sorted.map(e => [e.id, e]));
  const epicBosses = sorted.filter(e => !!e.isEpic);
  if (epicBosses.length > 0) {
  const injected = [];
  for (let i = 0; i < newOrder.length; i++) {
    const id = newOrder[i];
    injected.push(id);

    const ent = byId.get(id);
    if (!ent) continue;
    // solo dopo i PG
    if (String(ent.attitude || "") !== "pc") continue;

    // per OGNI Epic Boss aggiungo una voce virtuale
    for (const boss of epicBosses) {
      const vId = `${EPIC_ACT_PREFIX}::${boss.id}::after::${id}`;
      injected.push(vId);
    }
  }
  newOrder = injected;
}

  let newCurrent = 0;
  const activeId = state?.order?.[state.current];
  if (activeId) {
    const idx = newOrder.indexOf(activeId);
    if (idx >= 0) newCurrent = idx;
  }

  if (state &&
      state.current === newCurrent &&
      state.order &&
      state.order.length === newOrder.length &&
      state.order.every((id, i) => id === newOrder[i])) {
    return false;
  }

  const round = Math.max(1, state?.round || 1);
  await setSceneState({ order: newOrder, current: newCurrent, round }, sceneEpoch, {
    kind: "reconcile-order",
    ownedFields: ["order", "current", "round"],
  });
  return __isCurrentSceneOperation(sceneEpoch, "reconcile-state");
}

// --- DnD helper: sposta sourceId prima/dopo targetId ma SOLO fra pari iniziativa
async function _reorderWithinSameInitiative(sourceId, targetId, placeBefore) {
  const [st, entries] = await Promise.all([getSceneState(), readEntries()]);
  const next = reorderWithinSameInitiativeState(
    st,
    entries,
    sourceId,
    targetId,
    placeBefore,
    { lairInitiative: LAIR_INITIATIVE },
  );
  if (!next) return;
  await setSceneState(prev => ({
    ...(prev || {}),
    order: next.order,
    current: next.current,
  }));
}

// Sposta un BLOCCO di ID (sourceIds) prima/dopo targetId SOLO nel blocco dei pari iniziativa
async function _reorderBlockWithinSameInitiative(sourceIds, targetId, placeBefore) {
  const [st, entries] = await Promise.all([getSceneState(), readEntries()]);
  const next = reorderBlockWithinSameInitiativeState(
    st,
    entries,
    sourceIds,
    targetId,
    placeBefore,
    { lairInitiative: LAIR_INITIATIVE },
  );
  if (!next) return;
  await setSceneState(prev => ({
    ...(prev || {}),
    order: next.order,
    current: next.current,
  }));
}

// Wrapper: trova i membri del gruppo del lead collassato e chiama il riordino a blocco
async function _reorderCollapsedGroupWithinSameInitiative(sourceLeadId, targetId, placeBefore) {
  const { members } = await _getGroupForItemId(sourceLeadId);
// Se nel gruppo c'è un Epic (a 20), non consentire lo spostamento del blocco
try {
const entries = await readEntries();
const byId = new Map(entries.map(e => [e.id, e]));
if ((members || []).some(id => !!byId.get(id)?.isEpic)) return;
} catch {}
  const ids = (members && members.length > 0) ? members : [sourceLeadId];
  await _reorderBlockWithinSameInitiative(ids, targetId, placeBefore);
}

function __renderOptimisticNavigationState(state) {
  if (__suspendRenders || __editingInitForId || __editingHPForId) return false;
  const schedulerState = __initiativeRenderScheduler?.getState?.();
  if (schedulerState?.fullPending || schedulerState?.fullRunning) return false;
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return false;
  const ordered = order.map((id) => __activeLabelEntriesById.get(id)).filter(Boolean);
  if (ordered.length !== order.length) {
    __initiativeDiag("render:optimistic-skipped-missing-entry", {
      expected: order.length,
      resolved: ordered.length,
      activeId: __activeIdForState(state),
    });
    return false;
  }

  const activeId = __activeIdForState(state);
  const animateActive = activeId !== __prevActiveId;
  try {
    const lbl = document.getElementById("tbp-round-label");
    if (lbl) lbl.textContent = `Round ${Math.max(1, state.round || 1)}`;
    renderTrack(ordered, state, { animateActive });
    __prevActiveId = activeId;
    __optimisticNavigationDigest = initiativeStateDigest(state);
    __initiativeDiag("render:optimistic-committed", {
      activeId,
      animateActive,
      layout: getTrackerLayout(),
      navigationRevision: __navigationRevision,
    });
    return true;
  } catch (err) {
    console.warn("[initiative] optimistic navigation render:", err?.message || err);
    return false;
  }
}

function __cachedEntriesForIncrementalItems(items, state) {
  if (!Array.isArray(state?.order) || !state.order.length || !__activeLabelEntriesById.size) {
    return null;
  }
  const nextById = new Map(__activeLabelEntriesById);
  const characterBuildBySourceId = new Map(
    Array.from(nextById.values())
      .filter((entry) => entry?.id)
      .map((entry) => [entry.id, entry.characterBuild])
  );

  for (const item of items || []) {
    const entry = entryFromSceneItem(item, characterBuildBySourceId); // entryFromSceneItem(item) remains the incremental entry contract.
    if (!entry) return null;
    const baseId = entry.id;
    const expanded = expandParagonEntries([entry], state);
    const expectedIds = expanded.map((candidate) => candidate.id);
    const orderedIds = state.order.filter((id) =>
      !isEpicActionId(id) && splitParagonId(id).baseId === baseId
    );
    if (expectedIds.length !== orderedIds.length ||
        expectedIds.some((id) => !orderedIds.includes(id))) return null;
    for (const candidate of expanded) nextById.set(candidate.id, candidate);

    for (const [id, candidate] of nextById) {
      if (!candidate?.isEpicAction || candidate.epicBossId !== baseId) continue;
      const pcEntry = nextById.get(candidate.epicAfterPCId);
      if (!pcEntry) return null;
      nextById.set(id, makeEpicActionEntry(entry, pcEntry));
    }
  }

  const ordered = state.order.map((id) => nextById.get(id)).filter(Boolean);
  if (ordered.length !== state.order.length) return null;
  return { nextById, ordered };
}

function __schedulePendingIncrementalTrackerItems(itemIds) {
  const sceneEpoch = currentSceneEpoch();
  for (const id of itemIds || []) {
    if (id) __pendingIncrementalTrackerItemIds.add(id);
  }
  if (__pendingIncrementalRenderTimer || !__pendingIncrementalTrackerItemIds.size) return;

  const flush = async () => {
    __pendingIncrementalRenderTimer = null;
    if (!__isCurrentSceneOperation(sceneEpoch, "incremental-render-timer")) return;
    if (__initiativeFillMode) {
      __pendingIncrementalTrackerItemIds.clear();
      return;
    }
    if (__suspendRenders) {
      __pendingIncrementalRenderTimer = window.setTimeout(() => void flush(), 25);
      return;
    }

    const ids = [...__pendingIncrementalTrackerItemIds];
    __pendingIncrementalTrackerItemIds.clear();
    try {
      const resumed = await __requestIncrementalTrackerItems(
        { sceneEpoch, revision: __latestSceneItemEventRevision },
        { mode: "cards", itemIds: ids },
        "items-resumed",
      );
      if (!resumed) await renderAll("items-resumed-fallback");
    } catch (error) {
      console.warn("[initiative] resumed incremental render:", error?.message || error);
      await renderAll("items-resumed-error");
    }
  };

  __pendingIncrementalRenderTimer = window.setTimeout(() => void flush(), 0);
}

function __renderIncrementalTrackerItems(
  event,
  plan,
  reason = "items",
  schedulerRequest = null,
) {
  const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
  if (!__isCurrentSceneOperation(sceneEpoch, "incremental-render", { reason })) return false;
  if (plan?.mode === "none") return true;
  if (plan?.mode !== "cards") return false;
  if (schedulerRequest?.isIncrementalBarrierOpen
      && !schedulerRequest.isIncrementalBarrierOpen()) {
    return false;
  }
  if (__suspendRenders) {
    __editorDirtyTrackerItemIds.addMany(plan.itemIds);
    if (!__initiativeFillMode) __schedulePendingIncrementalTrackerItems(plan.itemIds);
    __initiativeDiag("render:incremental-skipped-suspended", { reason });
    return true;
  }
  if (__navigationPumpRunning || __navigationDesiredState) return false;

  const state = __latestInitiativeState;
  const changedItems = (event?.items || []).filter((item) =>
    plan.itemIds.includes(item?.id)
  );
  if (changedItems.length !== plan.itemIds.length) return false;
  const cached = __cachedEntriesForIncrementalItems(changedItems, state);
  if (!cached) return false;

  const renderStartedAt = performance.now();
  const renderRevision = ++__renderRequestRevision;
  const committed = renderTrack(cached.ordered, state, {
    itemIds: plan.itemIds,
    animateActive: false,
  });
  if (!committed) return false;

  __activeLabelEntriesById = cached.nextById;
  __initiativeDiag("render:incremental-committed", {
    renderRevision,
    reason,
    itemIds: plan.itemIds,
    durationMs: Math.round((performance.now() - renderStartedAt) * 100) / 100,
    layout: getTrackerLayout(),
  });
  return true;
}

async function __renderIncrementalTrackerItemIdsFromScene(
  itemIds,
  reason,
  sceneEpoch = currentSceneEpoch(),
  schedulerRequest = null,
) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  if (!ids.length) return true;
  const items = await OBR.scene.items.getItems(ids);
  if (!__isCurrentSceneOperation(sceneEpoch, "incremental-render-read", { reason })) return false;
  if (items.length !== ids.length) return false;
  return __renderIncrementalTrackerItems(
    { items, sceneEpoch },
    { mode: "cards", itemIds: ids },
    reason,
    schedulerRequest,
  );
}

async function __runScheduledIncrementalTrackerItems(request) {
  if (!request?.isCurrent?.()) return { status: "stale" };
  if (__initiativeFillMode) {
    for (const id of request.itemIds || []) __pendingIncrementalTrackerItemIds.add(id);
    return { status: "deferred" };
  }
  if (__suspendRenders) {
    __editorDirtyTrackerItemIds.addMany(request.itemIds);
    return { status: "deferred" };
  }

  const committed = await __renderIncrementalTrackerItemIdsFromScene(
    request.itemIds,
    request.reason,
    request.sceneEpoch,
    request,
  );
  if (committed) return { status: "committed" };

  __fullRenderDirty = true;
  const fallback = renderAll("incremental-barrier-fallback");
  fallback.catch((error) => {
    console.warn("[initiative] incremental full fallback:", error?.message || error);
  });
  return { status: "fallback" };
}

async function __requestIncrementalTrackerItems(event, plan, reason = "items") {
  const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
  if (!__isCurrentSceneOperation(sceneEpoch, "incremental-request", { reason })) return true;
  if (plan?.mode === "none") return true;
  if (plan?.mode !== "cards") return false;
  const scheduler = __getInitiativeRenderScheduler();
  const ticket = scheduler.requestIncremental({
    sceneEpoch,
    sourceRevision: Number(event?.revision) || __latestSceneItemEventRevision,
    sourceGeneration: Number(event?.generation) || __latestSceneItemEventGeneration,
    correlationId: sceneItemEventCorrelation(event),
    itemIds: plan.itemIds,
    reason,
    execute: __runScheduledIncrementalTrackerItems,
  });
  const result = await ticket.done;
  return ["committed", "fallback", "deferred", "stale"].includes(result?.status);
}

async function renderAll(reason = "unspecified") {
  const sceneEpoch = currentSceneEpoch();
  if (!__isCurrentSceneOperation(sceneEpoch, "render-request", { reason })) {
    return { status: "stale", sceneEpoch };
  }
  if (__suspendRenders) {
    __fullRenderDirty = true;
    return { status: "deferred", sceneEpoch };
  }
  const scheduler = __getInitiativeRenderScheduler();
  const ticket = scheduler.requestFull({
    sceneEpoch,
    sourceRevision: __latestSceneItemEventRevision,
    sourceGeneration: __latestSceneItemEventGeneration,
    correlationId: __latestSceneItemEventCorrelation,
    reason,
    execute: __executeFullRenderRequest,
  });
  return ticket.done;
}

async function __executeFullRenderRequest(request) {
  const sceneEpoch = request?.sceneEpoch;
  const reason = request?.reason || "unspecified";
  if (__suspendRenders) {
    __fullRenderDirty = true;
    return { status: "deferred", sceneEpoch };
  }
  if (!__isCurrentSceneOperation(sceneEpoch, "render", { reason })) return;
  const renderStartedAt = performance.now();
  const renderDurationMs = () => Math.round((performance.now() - renderStartedAt) * 100) / 100;
  const renderRevision = ++__renderRequestRevision;
  ensureGlobalPanelControls();
  __initiativeDiag("render:requested", { renderRevision, reason });
  const stateRaw = await getSceneState();
  if (!__isCurrentSceneOperation(sceneEpoch, "render-read-state", { reason, renderRevision })) return;
  // Gli snapshot intermedi di una raffica di click non devono ridisegnare
  // lista, fumetto o selezione sopra lo stato ottimistico più recente.
  if (__isStaleNavigationState(stateRaw)) {
    __initiativeDiag("render:skipped-stale-navigation", {
      renderRevision,
      reason,
      activeId: __activeIdForState(stateRaw),
      durationMs: renderDurationMs(),
    });
    return;
  }
  if (renderRevision < __latestAcceptedRenderRevision) {
    __initiativeDiag("render:skipped-superseded", {
      renderRevision,
      reason,
      durationMs: renderDurationMs(),
    });
    return;
  }
  __latestAcceptedRenderRevision = renderRevision;
  const itemSnapshot = readSceneItemsSnapshot(sceneEpoch);
  const itemRead = await readFullRenderItemSnapshot({
    snapshot: itemSnapshot,
    sceneEpoch,
    sourceRevision: request?.sourceRevision,
    sourceGeneration: request?.sourceGeneration,
    readItems: () => OBR.scene.items.getItems(),
  });
  const rawItems = itemRead.items;
  const [baseEntries, boardTokenItems] = await Promise.all([
    getEntriesWithLair(stateRaw, rawItems),
    Promise.resolve(spellBoardTokenTrackerItems(rawItems)),
  ]);
  if (!__isCurrentSceneOperation(sceneEpoch, "render-read-items", { reason, renderRevision })) return;
  if (!isCurrentRenderRevision(renderRevision, __latestAcceptedRenderRevision)) {
    __initiativeDiag("render:skipped-superseded", {
      renderRevision,
      reason,
      durationMs: renderDurationMs(),
    });
    return;
  }
  __spellBoardTokenItems = spellBoardTokenTrackerItems(boardTokenItems);
  const entries = expandParagonEntries(baseEntries, stateRaw);

  // Costruisci le entry VIRTUALI EPIC corrispondenti all’ordine che inietteremo
  const epicBosses = entries.filter(e => !!e.isEpic);
  const pcs        = entries.filter(e => String(e.attitude || "") === "pc");
  const epicVirtuals = [];
  if (epicBosses.length > 0 && pcs.length > 0) {
  for (const pc of pcs) {
    for (const boss of epicBosses) {
      epicVirtuals.push(makeEpicActionEntry(boss, pc));
    }
  }
}

// byId deve conoscere anche le voci virtuali
const entriesWithVirtuals = entries.concat(epicVirtuals);
const byId = new Map(entriesWithVirtuals.map((e) => [e.id, e]));
if (!__isCurrentSceneOperation(sceneEpoch, "render-build", { reason, renderRevision })) return;
__activeLabelEntriesById = byId;


  const stateClean = sanitizeState(stateRaw ?? { order: [], current: 0 }, byId);
  if (__isStaleNavigationState(stateClean)) {
    __initiativeDiag("render:skipped-stale-before-commit", {
      renderRevision,
      reason,
      activeId: __activeIdForState(stateClean),
      durationMs: renderDurationMs(),
    });
    return;
  }
  if (!__navigationPumpRunning && !__navigationDesiredState) {
    __latestInitiativeState = stateClean;
  }
    // Evita rimpiazzi DOM mentre c'è un editor aperto o stiamo switchando editor
    if (__suspendRenders) {
      __fullRenderDirty = true;
      __initiativeDiag("render:skipped-suspended", {
        renderRevision,
        reason,
        durationMs: renderDurationMs(),
      });
      return;
    }
    if (__editingInitForId || __editingHPForId) {
      __fullRenderDirty = true;
      __initiativeDiag("render:skipped-editor", {
        renderRevision,
        reason,
        durationMs: renderDurationMs(),
      });
      return;
    }
    // costruisci la lista rispettando l’ordine pulito
    const ordered = stateClean.order.map((id) => byId.get(id)).filter(Boolean);
    const activeIdNow = stateClean.order[stateClean.current];
    if (!__isCurrentSceneOperation(sceneEpoch, "render-commit", { reason, renderRevision })) return;
    zoomChk.checked = isAutoFocusEnabled(stateClean);
    setCompactToggleVisual(zoomToggleWrap, zoomChk.checked);
    try {
      const lbl = document.getElementById("tbp-round-label");
      if (lbl) lbl.textContent = `Round ${Math.max(1, stateClean.round || 1)}`;
    } catch {}
    // === Active Turn Label: risolvi l'ancora e aggiorna/crea la label ===
try {
  syncActiveTurnLabel(activeIdNow);
} catch (err) {
  console.warn("[active-label] upsert error:", err?.message || err);
}

    const cleanDigest = initiativeStateDigest(stateClean);
    if (reason === "metadata" && cleanDigest === __optimisticNavigationDigest) {
      __optimisticNavigationDigest = null;
      __prevActiveId = activeIdNow;
      __initiativeDiag("render:optimistic-acknowledged", {
        renderRevision,
        activeId: activeIdNow,
        layout: getTrackerLayout(),
        durationMs: renderDurationMs(),
      });
      return;
    }
    if (reason === "metadata" && !__navigationPumpRunning && !__navigationDesiredState) {
      __optimisticNavigationDigest = null;
    }

    const animateActive = (activeIdNow !== __prevActiveId);

    renderTrack(ordered, stateClean, { animateActive });  // <-- passa il flag
    __fullRenderDirty = false;
    __initiativeDiag("render:committed", {
      renderRevision,
      reason,
      activeId: activeIdNow,
      animateActive,
      layout: getTrackerLayout(),
      durationMs: renderDurationMs(),
      entries: ordered.length,
      cards: track.querySelectorAll("[data-tracker-card='1']").length,
    });

    __prevActiveId = activeIdNow; // aggiorna per il prossimo render
  }

    OBR.onReady(async () => {
      const sceneReadiness = __mountSceneEpochLifecycle();
      mountTrackerPopoverToggleListener();
      mountInitiativeCardContextMenuListener();
      mountTrackerQuickActionsPopoverListener();
      mountCompactAdminMenuListener();
      mountSpeedCheckStateBroadcast();
    mountConcentrationWarningBroadcast();
    const speedWarningBootstrap = mountSpeedWarningBroadcast().catch(() => {});
    await speedWarningBootstrap;
    try {
      const role =
        (await OBR.player?.getRole?.()) ||
        (await OBR.room?.getRole?.()) ||
        "PLAYER";
      IS_GM = String(role).toUpperCase() === "GM";
      await mountSpeedCheckEnabledSync({ authority: IS_GM });
      OBR.broadcast.onMessage(`${ID}/compact-speed-readout`, (event) => {
        if (!IS_GM || event?.data?.type !== "set-movement-limit") return;
        setSpeedCheckMovementLimit(event.data.enabled === true);
      });
      const hpBarsBinding = bindOptionalRuntimeOption({
        service: runtimeOptionsService,
        selector: selectMapHpBarsEnabled,
        lifecycle: __hpBarsLifecycle,
        reconcileInitial: false,
      });
      const activeTurnLabelBinding = bindOptionalRuntimeOption({
        service: runtimeOptionsService,
        selector: selectActiveTurnLabelEnabled,
        lifecycle: __activeTurnLabelLifecycle,
      });
      await Promise.all([hpBarsBinding.ready, activeTurnLabelBinding.ready]);
      __trackerLayout = runtimeOptionsService.get(selectTrackerLayout);
      updateEffectsDisplayModeControl(runtimeOptionsService.get(selectEffectsDisplayMode));
      updateLayoutToggleButton();
      applyTrackerLayout();
      const projectionPolicy = runtimeOptionsService.get(selectTrackerProjectionPolicy);
      setHPBarPlayerPolicy(projectionPolicy.hp);
      __optionsProjectionUnsubscribe ||= runtimeOptionsService.subscribe(
        selectTrackerProjectionPolicy,
        (nextPolicy) => {
          setHPBarPlayerPolicy(nextPolicy.hp);
          void renderAll("options-projection");
          if (IS_GM) void syncInitialHPBars();
        },
        { emitCurrent: false },
      );
      __optionsPresentationUnsubscribe ||= runtimeOptionsService.subscribe(
        (options) => ({
          layout: selectTrackerLayout(options),
          followActiveTurn: selectFollowActiveTurn(options),
          effectsDisplayMode: selectEffectsDisplayMode(options),
        }),
        (presentation) => {
          const layoutChanged = __trackerLayout !== presentation.layout;
          __trackerLayout = presentation.layout;
          updateEffectsDisplayModeControl(presentation.effectsDisplayMode);
          zoomChk.checked = isAutoFocusEnabled(__latestInitiativeState);
          setCompactToggleVisual(zoomToggleWrap, zoomChk.checked);
          if (layoutChanged) {
            updateLayoutToggleButton();
            applyTrackerLayout();
            __syncTrackerPopoverSizeForLayout();
            void renderAll("options-presentation");
          }
        },
        { emitCurrent: false },
      );
      viewOptionsRow.style.display = IS_GM ? "flex" : "none";
      globalPanelsWrap.style.display = IS_GM ? "inline-flex" : "none";
      zoomToggleWrap.style.display = IS_GM ? "flex" : "none";
      trackedMoveButton.style.display = IS_GM ? "inline-flex" : "none";
      movementAllowanceControls.style.display = IS_GM ? "grid" : "none";
      movementActions.style.display = IS_GM ? "grid" : "none";
      movementCompactLimitControl.style.display = IS_GM && isCompactTrackerLayout() ? "inline-flex" : "none";
      // Mostra il toggle Tana solo al GM (e nascondilo a tutti gli altri)
try {
  const hasBtn = !!roundPill.querySelector('[data-reset-round="1"]');
  const hasAddAllBtn = !!roundPill.querySelector('[data-add-all-initiative="1"]');
  const hasFillBtn = !!roundPill.querySelector('[data-fill-initiative="1"]');
  const hasOptionsBtn = !!roundPill.querySelector('[data-options-panel="1"]');
  const hasClearBtn = !!roundPill.querySelector('[data-clear-initiative="1"]');
  const hasHistoryBtn = !!roundPill.querySelector('[data-history="1"]');
  if (IS_GM) {
    if (!roundResetSlot.isConnected) roundPill.prepend(roundResetSlot);
    if (!roundActions.isConnected) roundPill.appendChild(roundActions);
    if (!roundHistorySlot.isConnected) roundPill.appendChild(roundHistorySlot);
    if (!hasBtn) roundResetSlot.appendChild(makeRoundResetBtn());
    if (!hasAddAllBtn) roundActions.appendChild(makeAddAllInitiativeBtn());
    if (!hasFillBtn) roundActions.appendChild(makeInitiativeFillBtn());
    if (!hasClearBtn) roundActions.appendChild(makeClearInitiativeBtn());
    if (!hasOptionsBtn) roundHistorySlot.appendChild(optionsPanelButton);
    if (!hasHistoryBtn) roundHistorySlot.appendChild(makeHistoryBtn());
  } else {
    if (hasBtn) roundPill.querySelector('[data-reset-round="1"]').remove();
    if (hasAddAllBtn) roundPill.querySelector('[data-add-all-initiative="1"]').remove();
    if (hasFillBtn) roundPill.querySelector('[data-fill-initiative="1"]').remove();
    if (hasOptionsBtn) roundPill.querySelector('[data-options-panel="1"]').remove();
    if (hasClearBtn) roundPill.querySelector('[data-clear-initiative="1"]').remove();
    if (hasHistoryBtn) roundPill.querySelector('[data-history="1"]').remove();
    if (roundResetSlot.isConnected) roundResetSlot.remove();
    if (roundActions.isConnected) roundActions.remove();
    if (roundHistorySlot.isConnected) roundHistorySlot.remove();
  }
} catch {}

try {
  if (IS_GM) {
    if (!lairToggleWrap.isConnected) {
      // inserisci il toggle tra la pill “Turno” e la lista
      if (IS_GM) {
  if (!lairToggleWrap.isConnected) sceneOptionsGroup.appendChild(lairToggleWrap);
} else {
  if (lairToggleWrap.isConnected) lairToggleWrap.remove();
}
    }
  } else {
    if (lairToggleWrap.isConnected) lairToggleWrap.remove();
  }
} catch {}
    applyTrackerLayout();

    } catch {
      IS_GM = false;
    }
    const readinessState = await sceneReadiness?.waitUntilReady();
    if (!readinessState?.ready) return;
    __initiativeBootstrapStarted = true;
    const bootstrapSceneEpoch = currentSceneEpoch();
    if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-listeners")) return;
    await __mountTrackerSelectionSync();
    if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-selection")) return;
    try {
} catch (e) {
  console.error("[hpbar] mount error", e?.error?.message || e?.message || e);
}
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-hp-bars")) return;
  if (IS_GM) {
    enableSpeedCheckProcessor();
    subscribeMovementSegments(queueSpeedCheckMovements);
    try {
      await mountMovementHistoryWatcher();
    } catch (err) {
      console.warn("[history] speed-check watcher mount:", err?.message || err);
    }
  }
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-speed-check")) return;
  await ensureState(bootstrapSceneEpoch);
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-ensure-state")) return;
  await reconcileStateWithItems(bootstrapSceneEpoch);
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-reconcile")) return;
  await ensureSharedAutoFocusPreference(bootstrapSceneEpoch);
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-follow-state")) return;
  await enforceUniqueNamePrefixes();
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-names")) return;
  await renderAll("boot");
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-render")) return;
  const bootPersistedState = await getSceneState();
  if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "bootstrap-state")) return;
  await __adoptInitiativeSceneBaseline(
    __latestInitiativeState || bootPersistedState,
    initiativeStateDigest(bootPersistedState),
    bootstrapSceneEpoch,
    "boot",
    false,
  );
  if (IS_GM) {
    const runDeferredBootstrap = async () => {
      if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "deferred-bootstrap-start")) return;
      try {
        await __hpBarsLifecycle.reconcileFull();
      } catch (err) {
        console.warn("[hpbar] deferred boot sync error:", err?.message || err);
      }
      if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "deferred-bootstrap-hp-bars")) return;
      if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "deferred-bootstrap-history")) return;
      try {
        const initiativeCardItems = await OBR.scene.items.getItems((item) => (
          item.layer === "CHARACTER"
          && !item.attachedTo
          && item.metadata?.[META_KEY]?.inInitiative === true
        ));
        await restoreInitiativeCardQuickActionsFromMemory(
          initiativeCardItems.map((item) => item.id),
        );
      } catch (error) {
        console.warn("[initiative-card] deferred quick action memory boot:", error?.message || error);
      }
      if (!__isCurrentSceneOperation(bootstrapSceneEpoch, "deferred-bootstrap-quick-actions")) return;
      try {
        const st = await getSceneState();
        const entries = await getEntriesWithLair(st);
        for (const e of entries) {
          if (isLairId(e.id)) continue; // la Tana non ha HP
          syncHPBarNow(e.id, e.hp ?? 0, e.hpMax ?? 0);
        }
      } catch (err) {
        console.warn("[hpbar] deferred state sync error:", err?.message || err);
      }
    };
    const scheduleDeferredBootstrap = () => {
      void runDeferredBootstrap();
    };
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(scheduleDeferredBootstrap, { timeout: 1000 });
    } else {
      globalThis.setTimeout(scheduleDeferredBootstrap, 0);
    }
  }
  if (IS_GM) {
    void recordCombatTurn(__latestInitiativeState, { sceneEpoch: bootstrapSceneEpoch }).catch((err) => {
      console.warn("[combat-log] initial turn:", err?.message || err);
    });
  }
});

async function __processInitiativeMetadata(st, stateDigest, metadataRevision, sceneEpoch = currentSceneEpoch()) {
  if (!__isCurrentSceneOperation(sceneEpoch, "metadata", { metadataRevision })) return;
  if (__sceneBaselineEpoch !== sceneEpoch) {
    const previousState = __latestInitiativeState;
    const baselineState = previousState || st;
    const baselineDigest = previousState
      ? initiativeStateDigest(previousState)
      : stateDigest;
    await __adoptInitiativeSceneBaseline(
      baselineState,
      baselineDigest,
      sceneEpoch,
      "metadata",
      !previousState,
    );
    if (!previousState || baselineDigest === stateDigest) return;
    __lastQueuedInitiativeMetadataDigest = stateDigest;
  }
  __lastInitiativeMetadataDigest = stateDigest;
  if (__isStaleNavigationState(st)) {
    __initiativeDiag("metadata:skipped-stale-navigation", {
      activeId: __activeIdForState(st),
      metadataRevision,
    });
    return;
  }
  __initiativeDiag("metadata:processing", {
    activeId: __activeIdForState(st),
    round: st?.round,
    current: st?.current,
    metadataRevision,
  });
  syncSpeedCheckTurn(st);

  const noticeActiveId = __activeIdForState(st);
  const isTurnTransition = isInitiativeTurnTransition(
    __lastConditionTurnState,
    st,
  );
  if (noticeActiveId && noticeActiveId !== __lastTurnNoticeActiveId) {
    const previousNoticeActiveId = __lastTurnNoticeActiveId;
    __lastTurnNoticeActiveId = noticeActiveId;
    if (
      previousNoticeActiveId
      && isTurnTransition
      && IS_GM
      && __isCurrentSceneOperation(sceneEpoch, "turn-notice", { metadataRevision })
    ) {
      void broadcastTurnNotice(st, sceneEpoch).catch((err) => {
        console.warn("[turn-notice] broadcast error:", err?.message || err);
      });
    }
  }

  let conditionTransition = null;
  if (st && Array.isArray(st.order) && st.order.length > 0) {
    const previousTurnState = __lastConditionTurnState;
    const nextTurnState = __conditionTurnStateSnapshot(st);
    const directionHint = __conditionDirectionHintFor(st);
    const boundaries = __forwardConditionTurnBoundaries(previousTurnState, nextTurnState, directionHint);
    __lastConditionTurnState = nextTurnState;
    conditionTransition = { previousTurnState, nextTurnState, boundaries };
  } else {
    __lastConditionTurnState = null;
    __conditionNavigationHint = null;
  }

  let roundEffectAdjustment = Promise.resolve();
  try {
    if (st && Array.isArray(st.order) && st.order.length > 0) {
      const roundNow = Math.max(1, Number(st.round || 1));
      if (__lastRoundSeen == null) {
        __lastRoundSeen = roundNow;
      } else if (roundNow !== __lastRoundSeen) {
        const delta = __lastRoundSeen - roundNow;
        __lastRoundSeen = roundNow;

        if (IS_GM) {
          const tokenIds = st.order
            .map(id => (typeof splitParagonId === "function" ? splitParagonId(id).baseId : id))
            .filter(id => id && !isLairId(id) && !isEpicActionId(id));
          const unique = Array.from(new Set(tokenIds));
          const run = async () => {
            if (!__isCurrentSceneOperation(sceneEpoch, "round-tick", { metadataRevision })) return;
            const mutation = await runEffectsMutation([{
              type: "effects:tick-round",
              targetIds: unique,
              delta,
            }], {
              kind: "effects:tick-round",
              label: "Scadenza effetti di round",
              targetIds: unique,
              history: false,
              sceneMetadataPreconditions: [{ key: STATE_KEY, value: st }],
              sideEffects: [{
                type: "static-zone:remove-ended",
                selectors: [{ all: true }],
              }],
            });
            if (mutation.status !== "applied") {
              requireAppliedEffectsMutation(mutation);
            }
          };
          roundEffectAdjustment = run();
        }
      }
    }
  } catch (err) {
    console.warn("[effects] queue round tick error:", err);
  }

  await renderAll("metadata"); // ridisegna UI
  if (!__isCurrentSceneOperation(sceneEpoch, "metadata-render", { metadataRevision })) return;
  if (!st || !Array.isArray(st.order) || st.order.length === 0) {
    return;
  }

  const activeId = st.order[st.current];

// --- Tick incantesimi/condizioni per ROUND (con direzione) ---
try {
  await roundEffectAdjustment;
} catch (err) {
  console.warn("[effects] tick round error:", err);
}

try {
  const { previousTurnState, nextTurnState, boundaries = [] } = conditionTransition || {};
  if (IS_GM && boundaries.length) {
    const run = async () => {
      if (!__isCurrentSceneOperation(sceneEpoch, "condition-turn-tick", { metadataRevision })) return;
      const tokenIds = Array.from(new Set(
        [...(previousTurnState?.order || []), ...(nextTurnState?.order || [])]
          .map(__conditionActorId)
          .filter(Boolean)
      ));
      if (!tokenIds.length) return;
      const mutation = await runEffectsMutation([{
        type: "effects:tick-boundaries",
        targetIds: tokenIds,
        boundaries,
      }], {
        kind: "effects:tick-boundaries",
        label: "Scadenza effetti di turno",
        targetIds: tokenIds,
        sceneMetadataPreconditions: [{ key: STATE_KEY, value: st }],
      });
      requireAppliedEffectsMutation(mutation);
    };
    await run();
  }
} catch (err) {
  console.warn("[conditions] tick turn boundary error:", err?.message || err);
}

  if (!__isCurrentSceneOperation(sceneEpoch, "condition-turn-tick", { metadataRevision })) return;

  if (!activeId || activeId === __lastActiveId) return;
  __lastActiveId = activeId;
  if (IS_GM && __isCurrentSceneOperation(sceneEpoch, "combat-turn", { metadataRevision })) {
    void recordCombatTurn(st, { sceneEpoch }).catch((err) => {
      console.warn("[combat-log] turn:", err?.message || err);
    });
  }

  // Reset delle azioni leggendarie a inizio turno della creatura attiva
  // Se è la Tana, niente reset legend e niente focus su scena
if (!isLairId(activeId) && !isEpicActionId(activeId)) {
  try { await resetLegendaryIfAny(activeId); }
  catch (e) { console.warn("[legendary] reset on turn:", e?.message || e); }

  if (!__isCurrentSceneOperation(sceneEpoch, "active-turn", { metadataRevision })) return;

  queueSelectAndFocus(activeId, isAutoFocusEnabled(st));
}
  try {
    if (
      __isCurrentSceneOperation(sceneEpoch, "auto-collapse", { metadataRevision })
      && __sceneBaselineEpoch === sceneEpoch
      && metadataRevision === __initiativeMetadataRevision
      && __matchesLatestActiveTurn(st)
    ) {
      const entriesNow = await readEntries();
      if (
        !__isCurrentSceneOperation(sceneEpoch, "auto-collapse", { metadataRevision })
        || metadataRevision !== __initiativeMetadataRevision
      ) return;
      const collapseChanged = await __applyAutoCollapse(entriesNow, st, metadataRevision); // espandi gruppo attivo, collassa altri
      if (
        collapseChanged
        && __isCurrentSceneOperation(sceneEpoch, "auto-collapse", { metadataRevision })
        && metadataRevision === __initiativeMetadataRevision
      ) {
        await renderAll("auto-collapse");
      }
    } else {
      __initiativeDiag("collapse:skipped-stale", {
        activeId,
        expectedActiveId: __activeIdForState(__latestInitiativeState),
      });
    }
  } catch (e) {
    console.warn("[initiative] auto-collapse on turn change:", e?.message || e);
  }
}

OBR.scene.onMetadataChange((meta) => {
  const sceneEpoch = currentSceneEpoch();
  if (!__isCurrentSceneOperation(sceneEpoch, "metadata-event")) return;
  const st = meta?.[STATE_KEY];
  const stateDigest = initiativeStateDigest(st);
  if (stateDigest === __lastQueuedInitiativeMetadataDigest) {
    __initiativeDiag("metadata:skipped-unchanged", {
      activeId: __activeIdForState(st),
    });
    return;
  }
  __lastQueuedInitiativeMetadataDigest = stateDigest;
  const metadataRevision = ++__initiativeMetadataRevision;
  const run = () => __processInitiativeMetadata(st, stateDigest, metadataRevision, sceneEpoch);
  void __initiativeMetadataProcessor.enqueue(run).catch((err) => {
    console.warn("[initiative] metadata queue error:", err?.message || err);
  });
});

  subscribeSceneItemChanges(({ items }) => {
    for (const item of items || []) {
      const meta = item?.metadata?.[META_KEY];
      if (!meta || meta.inInitiative !== true) continue;
      syncTrackerHPNow(item.id, meta.hp, meta.hpMax);
    }
  }, {
    filter: (event) => event.flags.hpBars,
    immediate: true,
  });

  subscribeSceneItemChanges((event) => {
    const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
    if (!__isCurrentSceneOperation(sceneEpoch, "quick-action-restore")) return null;
    if (!IS_GM) return null;
    const candidateIds = event?.invalidations?.quickActionHydration
      || event?.candidateIds?.quickActionHydration
      || [];
    if (!candidateIds.length) return null;
    return restoreInitiativeCardQuickActionsFromMemory(candidateIds, {
      items: event?.allItems,
      itemsComplete: true,
      generation: event?.generation,
      sceneEpoch,
      isGM: true,
      isCurrent: () => __isCurrentSceneOperation(sceneEpoch, "quick-action-restore-current"),
    });
  }, {
    filter: (event) => event.flags.quickActionHydration,
    immediate: true,
  });

  subscribeSceneItemChanges((event) => {
    const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
    if (!__isCurrentSceneOperation(sceneEpoch, "spell-board-token-render")) return;
    if (!isCurrentSceneItemEvent(event, {
      sceneEpoch,
      revision: __latestSceneItemEventRevision,
    })) return;
    __latestSceneItemEventRevision = Math.max(
      __latestSceneItemEventRevision,
      Number(event?.revision) || 0,
    );
    __latestSceneItemEventGeneration = Math.max(
      __latestSceneItemEventGeneration,
      Number(event?.generation) || 0,
    );
    __latestSceneItemEventCorrelation = sceneItemEventCorrelation(event)
      || __latestSceneItemEventCorrelation;
    __spellBoardTokenItems = updateSpellBoardTokenSnapshot(__spellBoardTokenItems, event);
    void renderAll("spell-board-token").catch((error) => {
      console.warn("[initiative] spell board token render:", error?.message || error);
    });
  }, {
    filter: (event) => hasSpellBoardTokenChange(event),
  });

  subscribeSceneItemChanges(async (event) => {
    const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
    if (!isCurrentSceneItemEvent(event, {
      sceneEpoch,
      revision: __latestSceneItemEventRevision,
    })) return;
    __latestSceneItemEventRevision = Math.max(
      __latestSceneItemEventRevision,
      Number(event?.revision) || 0,
    );
    __latestSceneItemEventGeneration = Math.max(
      __latestSceneItemEventGeneration,
      Number(event?.generation) || 0,
    );
    __latestSceneItemEventCorrelation = sceneItemEventCorrelation(event)
      || __latestSceneItemEventCorrelation;
    if (!__isCurrentSceneOperation(sceneEpoch, "item-dispatch")) return;
    if (__mutatingActiveLabel > 0) return;
    const renderPlan = planIncrementalTrackerItemRender(event);
    const fillInterrupted = await interruptInitiativeFillForRemovedActor(event);
    if (!__isCurrentSceneOperation(sceneEpoch, "item-dispatch")) return;
    const addedInitiativeActors = IS_GM && sceneItemEventAddsInitiative(event);
    if (__initiativeFillMode && addedInitiativeActors && !initiativeFillShowsAddedActors(event)) {
      await closeOpenEditors();
      await finishInitiativeFillMode();
      if (!__isCurrentSceneOperation(sceneEpoch, "item-dispatch")) return;
    }
    if (renderPlan.mode === "none") return;
    if (!fillInterrupted && renderPlan.mode === "cards") {
      try {
        // La richiesta schedulata conserva il contratto del patch locale:
        // __renderIncrementalTrackerItems(event, renderPlan, "items")
        if (await __requestIncrementalTrackerItems(event, renderPlan, "items")) return;
      } catch (error) {
        console.warn("[initiative] incremental item render:", error?.message || error);
      }
    }
    await reconcileStateWithItems(sceneEpoch);
    if (!__isCurrentSceneOperation(sceneEpoch, "item-dispatch")) return;
    await enforceUniqueNamePrefixes();
    if (!__isCurrentSceneOperation(sceneEpoch, "item-dispatch")) return;
    await renderAll(fillInterrupted ? "initiative-fill-item-removed" : "items-fallback");
    if (addedInitiativeActors && __isCurrentSceneOperation(sceneEpoch, "item-dispatch")) {
      await startInitiativeFillMode({ silent: true });
    }
  }, { filter: (event) => event.flags.tracker });

  // ——— Auto-ripristino HP quando cambia qualcosa tra gli item della scena
// (nuovi token, nome/ritratto cambiati, metadata azzerati, ecc.)
try {
  subscribeSceneItemChanges((event) => {
    const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
    if (!__isCurrentSceneOperation(sceneEpoch, "hp-memory-autofill")) return;
    if (!IS_GM) return;
    const candidateIds = event?.invalidations?.legacyHpHydration
      || event?.candidateIds?.legacyHpHydration
      || [];
    if (!candidateIds.length) return;
    scheduleHPMemoryAutofill(150, sceneEpoch, {
      candidateIds,
      items: event?.allItems,
      itemsComplete: true,
      isCurrent: (epoch) => __isCurrentSceneOperation(epoch, "hp-memory-autofill-current"),
    });
  }, { filter: (event) => event.flags.legacyHpHydration });
} catch (e) {
  console.warn("[hpMemory] onChange subscribe failed", e);
}

    btnPrev.addEventListener("click", async () => {
    const sceneEpoch = currentSceneEpoch();
    const st = __latestInitiativeState || await getSceneState();
    if (!__isCurrentSceneOperation(sceneEpoch, "navigation-click")) return;
    if (!st || !st.order || st.order.length === 0) return;
    const nextBase = advanceInitiativeState(st, -1);
    const prevIdx = nextBase.current;
    const nextRound = nextBase.round;
    const cachedEntries = Array.from(__activeLabelEntriesById.values());
    const { collapsed } = __autoCollapseSnapshot(cachedEntries, nextBase);
    const next = { ...nextBase, collapsed };
    __latestInitiativeState = next;
    const activeId = next.order[next.current];
    __conditionNavigationHint = { activeId, current: prevIdx, round: nextRound, direction: -1 };
    const revision = ++__navigationRevision;
    __lastNavigationAt = Date.now();
    __scrollActiveOnNextRender = true;
    __initiativeDiag("navigation:intent", {
      direction: -1,
      activeId,
      round: nextRound,
      current: prevIdx,
      navigationRevision: revision,
    });
    syncActiveTurnLabel(activeId);
    __renderOptimisticNavigationState(next);
    prewarmSpeedCheckTurn(next);
    syncSpeedCheckTurn(next);

    queueNavigationState(next, sceneEpoch);
    try { delete document.__tbpZoomStamp; } catch {}

    if (revision !== __navigationRevision || !__isCurrentSceneOperation(sceneEpoch, "navigation-click")) return;
    if (activeId && !isLairId(activeId)) {
      queueSelectAndFocus(activeId, isAutoFocusEnabled(next));
    }

  });

  btnNext.addEventListener("click", async () => {
    const sceneEpoch = currentSceneEpoch();
    const st = __latestInitiativeState || await getSceneState();
    if (!__isCurrentSceneOperation(sceneEpoch, "navigation-click")) return;
    if (!st || !st.order || st.order.length === 0) return;
    const nextBase = advanceInitiativeState(st, 1);
    const nextIdx = nextBase.current;
    const nextRound = nextBase.round;
    const cachedEntries = Array.from(__activeLabelEntriesById.values());
    const { collapsed } = __autoCollapseSnapshot(cachedEntries, nextBase);
    const next = { ...nextBase, collapsed };
    __latestInitiativeState = next;
    const activeId = next.order[next.current];
    __conditionNavigationHint = { activeId, current: nextIdx, round: nextRound, direction: 1 };
    const revision = ++__navigationRevision;
    __lastNavigationAt = Date.now();
    __scrollActiveOnNextRender = true;
    __initiativeDiag("navigation:intent", {
      direction: 1,
      activeId,
      round: nextRound,
      current: nextIdx,
      navigationRevision: revision,
    });
    syncActiveTurnLabel(activeId);
    __renderOptimisticNavigationState(next);
    prewarmSpeedCheckTurn(next);
    syncSpeedCheckTurn(next);

    queueNavigationState(next, sceneEpoch);
    try { delete document.__tbpZoomStamp; } catch {}

    if (revision !== __navigationRevision || !__isCurrentSceneOperation(sceneEpoch, "navigation-click")) return;
    if (activeId && !isLairId(activeId)) {
      queueSelectAndFocus(activeId, isAutoFocusEnabled(next));
    }

  });

}
