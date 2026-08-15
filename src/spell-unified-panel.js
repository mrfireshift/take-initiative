import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  buildSpellUnifiedPanelContract,
  changeSpellPanelActiveAction,
  changeSpellPanelPhase,
  changeSpellPanelSpell,
  changeSpellPanelVariant,
  createSpellPanelSession,
  updateSpellPanelSession,
  SPELL_UNIFIED_PANEL_LANES,
} from "./spellUnifiedPanelCore.js";
import {
  executeSpellUnifiedArea,
  getSpellUnifiedAreaEligibility,
  SPELL_UNIFIED_AREA_STATUS,
  undoSpellUnifiedArea,
} from "./spellUnifiedAreaAdapter.js";
import {
  executeSpellUnifiedLifecycle,
  getSpellUnifiedLifecycleEligibility,
  SPELL_UNIFIED_LIFECYCLE_STATUS,
} from "./spellUnifiedLifecycleAdapter.js";
import {
  executeSpellUnifiedBoardTokenRecreate,
  executeSpellUnifiedBoardTokenStateUpdate,
  SPELL_UNIFIED_PERSISTENT_STATUS,
} from "./spellUnifiedPersistentAdapter.js";
import {
  buildSpellUnifiedActivePopoverRequest,
  buildSpellUnifiedPreparedPopoverRequest,
  executeSpellUnifiedActiveAction,
  SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS,
  SPELL_UNIFIED_ACTIVE_STATUS,
} from "./spellUnifiedActiveAdapter.js";
import {
  routeSpellUnifiedPanelOpenRequest,
  spellUnifiedPanelShouldAutoStartPlacement,
} from "./spellUnifiedPanelRoutingCore.js";
import {
  getSpellDefinition,
} from "./spells-srd.js";
import {
  buildSpellCatalogEntries,
  createSpellUnifiedPanelSceneProvider,
} from "./spellUnifiedPanelSceneProvider.js";
import {
  cancelSpellAreaPlacementRequest,
  createSpellAreaPlacementRequestId,
  requestSpellAreaPlacement,
} from "./spellAreaPlacementClient.js";
import { SPELL_AREA_PLACEMENT_CHANNEL } from "./spellAreaPlacementCore.js";
import { spellBoardTokenPlacementPosition } from "./spellBoardTokenCore.js";
import { expandAnimatedObjectComposition } from "./animatedObjectsCore.js";
import { undoHistoryEntry, undoHistoryThrough } from "./history.js";
import { refreshConditionLabels } from "./conditions.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";
import {
  requireAppliedEffectsMutation,
  getEffectsMutationSceneContext,
  runEffectsMutation,
} from "./effectsMutations.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { openReferencePopover } from "./referencePopover.js";
import { spellActiveResolutionPopoverId } from "./spellActiveResolutionCore.js";
import {
  isSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "./spellUnifiedPopupProtocol.js";
import {
  buildUnifiedPanelViewModel,
  renderSpellUnifiedPanel,
} from "./spellUnifiedPanelViewCore.js";

const MODAL_ID = `${ID}/spells-modal`;
const TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const PREPARED_AREA_RESOLUTION_SPELL_IDS = new Set(SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS);

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}

function panelRouteFromLocation() {
  try {
    return routeSpellUnifiedPanelOpenRequest(
      Object.fromEntries(new URLSearchParams(globalThis.location?.search || "")),
    );
  } catch {
    return routeSpellUnifiedPanelOpenRequest();
  }
}

async function activePopoverAnchor(casterId) {
  const bounds = await OBR.scene.items.getItemBounds([casterId]).catch(() => null);
  const center = bounds?.center || null;
  const min = bounds?.min || null;
  if (!center || !min) return { left: 120, top: 120 };
  const screen = await OBR.viewport.transformPoint({ x: center.x, y: min.y })
    .catch(() => null);
  return Number.isFinite(screen?.x) && Number.isFinite(screen?.y)
    ? { left: screen.x, top: Math.max(12, screen.y - 12) }
    : { left: 120, top: 120 };
}

function casterOptions(items = []) {
  return items.map((item) => ({
    value: item.id,
    label: item.name || item.id,
  }));
}

function concentrationSummary(concentrations = {}) {
  return Object.entries(concentrations || {}).map(([key, info]) => {
    const storedName = String(info?.spellId || info?.name || key).trim();
    const displayName = getSpellDefinition(storedName)?.displayName || storedName;
    const targetIds = uniqueIds(info?.targets);
    return {
      key,
      name: displayName,
      targetCount: targetIds.length,
    };
  });
}

function firstValidCaster(casters, preferred = "") {
  const ids = new Set(casters.map((item) => item.id));
  return ids.has(preferred) ? preferred : casters[0]?.id || "";
}

function slotOptions(contract) {
  return (contract?.presentation?.slot?.options || [])
    .map((option) => numeric(option.value))
    .filter((value) => value !== null);
}

function targetIdsForCandidates(ids, candidates) {
  const valid = new Set(candidates.map((candidate) => candidate.key));
  return uniqueIds(ids).filter((id) => valid.has(id));
}

function messageForResult(result) {
  return result?.error?.message || "Applicazione non riuscita. Riprova.";
}

const AREA_FEEDBACK_MESSAGES = Object.freeze({
  "lane-not-supported": "Questo incantesimo non usa la procedura di area.",
  "zones-not-supported": "Le zone persistenti richiedono la gestione di area.",
  "tokens-not-supported": "Le pedine restano gestite dal pannello dedicato.",
  "active-action-not-supported": "L'azione attiva resta nel pannello dedicato.",
  "zone-trigger-not-supported": "Il trigger della zona resta nel pannello dedicato.",
  "prepared-resolution-not-supported": "La risoluzione preparata resta separata.",
  "child-zone-not-supported": "Le sottozone restano nel pannello dedicato.",
  "targeting-not-supported": "Targeting non collegabile al pannello adattivo.",
  "placement-not-supported": "La configurazione dell'area non è compatibile con questa procedura.",
  "placement-required": "Posiziona e conferma l'area prima di applicare.",
  "placement-not-confirmed": "L'area non è stata confermata.",
  "placement-stale": "La scena o l'area sono cambiate: ripeti il posizionamento.",
  "placement-target-lock-required": "Conferma i bersagli dell'area prima di applicare.",
  "target-lock-required": "Conferma i bersagli dell'area prima di applicare.",
  "targets-required": "Seleziona almeno un bersaglio.",
  "target-limit-exceeded": "Il numero di bersagli supera il limite dichiarato.",
  "primary-required": "Seleziona il bersaglio primario.",
  "primary-not-selected": "Il bersaglio primario deve appartenere alla selezione.",
  "outcomes-incomplete": "Registra un esito per ogni bersaglio.",
  "outcome-invalid": "Uno degli esiti non è riconosciuto.",
  "hp-required": "Inserisci il valore HP richiesto.",
  "hp-invalid": "Il valore HP non è valido.",
  "caster-required": "Seleziona il caster.",
  "slot-level-invalid": "Lo slot scelto non è valido.",
  "choice-required": "Scegli una variante.",
  "target-context-required": "Completa il contesto richiesto per i bersagli.",
  "scene-epoch-stale": "La scena è cambiata: ripeti la risoluzione.",
  "scene-epoch-mismatch": "La scena è cambiata: ripeti la risoluzione.",
  "target-missing": "Un bersaglio non è più presente nella scena.",
  "spatial-validation-failed": "La validazione spaziale non è riuscita.",
  "primary-out-of-range": "Il bersaglio primario supera la portata.",
  "secondary-out-of-range": "Un bersaglio secondario supera il raggio dal primario.",
  "pairwise-distance-exceeded": "La distanza tra alcuni bersagli non è valida.",
  "caster-range-exceeded": "Un bersaglio supera la portata del caster.",
  "undo-unavailable": "L'ultima applicazione non è più disponibile per Undo.",
  "undo-api-unavailable": "L'API condivisa di Undo non è disponibile.",
  "undo-failed": "Undo non è riuscito.",
  "command-invalid": "La configurazione dello spell non è completa.",
  "executor-failed": "Applicazione non riuscita.",
});

function areaMessageForResult(result) {
  const code = String(result?.errors?.[0]?.code || "").trim();
  return AREA_FEEDBACK_MESSAGES[code]
    || (result?.status === SPELL_UNIFIED_AREA_STATUS.NOOP
      ? "Nessuna modifica da applicare."
      : "Applicazione non riuscita.");
}

function buildContract(
  spellId,
  { phase = "", actionId = "", variant = "", slotLevel = null, castContext = {} } = {},
) {
  return buildSpellUnifiedPanelContract({
    spellId,
    phase,
    actionId,
    choiceValue: variant,
    castContext: {
      ...(castContext && typeof castContext === "object" ? castContext : {}),
      ...(slotLevel === null ? {} : { slotLevel }),
    },
  });
}

function initialState(contract, catalogEntries, sourceId, route = {}) {
  const unsupportedMessage = route.status === "unsupported"
    ? "L'incantesimo richiesto non ha un contratto disponibile nel pannello unificato."
    : "";
  return {
    contract,
    session: createSpellPanelSession({
      contract,
      ...(route.status === "ready" ? route.session : {}),
      ...(unsupportedMessage ? {
        feedback: { state: "error", message: unsupportedMessage },
      } : {}),
    }),
    catalogEntries,
    casters: [],
    targetCandidates: [],
    concentrationSummary: [],
    activeOverview: [],
    sourceId,
    catalogState: {
      query: "",
      filter: "all",
      expanded: !contract?.spell?.id,
      activeIndex: 0,
      loading: false,
    },
    targetFilters: {
      name: "",
      factions: [],
    },
    focusCatalog: false,
    loading: true,
    revision: 0,
    model: null,
    committing: false,
    lastAreaResult: null,
  };
}

export function bootSpellUnifiedPanel(
  documentRef = document,
  runtimeOverrides = {},
) {
  const root = documentRef.getElementById("spell-unified-panel-root");
  if (!root) return null;

  const sceneLifecycle = runtimeOverrides.sceneLifecycle
    || createSceneLifecycleAdapter({
      obr: runtimeOverrides.obr || OBR,
    });
  const ownsSceneLifecycle = !runtimeOverrides.sceneLifecycle;
  const provider = runtimeOverrides.provider
    || createSpellUnifiedPanelSceneProvider(OBR, { sceneLifecycle });
  const route = runtimeOverrides.route
    || (runtimeOverrides.routeRequest
      ? routeSpellUnifiedPanelOpenRequest(runtimeOverrides.routeRequest)
      : panelRouteFromLocation());
  let sourceId = runtimeOverrides.sourceId ?? route.sourceId ?? "";
  const catalogEntries = runtimeOverrides.catalogEntries
    || provider.getCatalogEntries?.()
    || buildSpellCatalogEntries();
  const initialSpellId = route.spellId || "";
  const firstContract = buildContract(initialSpellId, {
    phase: route.session?.phase || "",
    actionId: route.session?.activeActionId || "",
    variant: route.session?.variant || "",
    slotLevel: route.session?.slotLevel ?? null,
    castContext: route.session?.castContext || {},
  });
  const state = initialState(firstContract, catalogEntries, sourceId, route);
  let selectionWriteDepth = 0;
  let refreshTimer = null;
  let refreshInFlight = null;
  let refreshQueued = false;
  let destroyed = false;
  let unsubscribeSelection = null;
  let unsubscribeItems = null;
  let unsubscribePopup = null;
  let unsubscribeSceneLifecycle = null;
  let targetingSelectionSequence = 0;
  const pendingPlacementRequests = new Set();
  let activePopupOperation = null;

  const sceneOperationId = (prefix = "spell-panel") => (
    `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
  );
  const sceneAvailable = () => sceneLifecycle.isReady();
  const captureSceneOperation = (prefix) => sceneLifecycle.capture({
    operationId: sceneOperationId(prefix),
  });

  const validCasterIds = () => state.casters.map((item) => item.id);

  const usesPersistentCastAdapter = () => {
    const execution = state.contract?.execution || {};
    const activeActionId = String(
      state.session?.activeActionId || execution.selectedActionId || "",
    ).trim();
    if (activeActionId) return false;
    return execution.lane === SPELL_UNIFIED_PANEL_LANES.AREA_TRANSACTION
      || (execution.lane === SPELL_UNIFIED_PANEL_LANES.SPELL_LIFECYCLE
        && (execution.hasZones === true || execution.hasTokens === true));
  };

  const updateEligibility = () => {
    const areaEligibility = getSpellUnifiedAreaEligibility(
      state.contract,
      state.session,
    );
    const lifecycleEligibility = getSpellUnifiedLifecycleEligibility(state.contract);
    const eligibility = usesPersistentCastAdapter()
      ? areaEligibility
      : lifecycleEligibility;
    const sceneGate = sceneAvailable()
      ? null
      : {
        allowed: false,
        code: "scene-unavailable",
        message: "La scena è cambiata: riapri o attendi una nuova baseline.",
      };
    state.session = updateSpellPanelSession(state.session, {
      executionGate: {
        allowed: sceneGate ? sceneGate.allowed : eligibility.eligible,
        code: sceneGate ? sceneGate.code : eligibility.code,
        message: sceneGate ? sceneGate.message : eligibility.message,
      },
    });
  };

  const render = () => {
    if (destroyed) return null;
    const model = buildUnifiedPanelViewModel({
      contract: state.contract,
      session: state.session,
      catalogEntries: state.catalogEntries,
      catalogState: {
        ...state.catalogState,
        loading: state.loading,
      },
      selectedCatalogKey: state.contract?.spell?.id,
      casterOptions: casterOptions(state.casters),
      targetCandidates: state.targetCandidates,
      targetFilters: state.targetFilters,
      concentrationSummary: state.concentrationSummary,
      activeOverview: state.activeOverview,
    });
    state.model = model;
    renderSpellUnifiedPanel(documentRef, root, model, callbacks);
    if (state.focusCatalog) {
      const input = root.querySelector("[role=combobox]");
      input?.focus();
      input?.setSelectionRange?.(input.value.length, input.value.length);
      state.focusCatalog = false;
    }
    return model;
  };

  const activeOverviewForSession = () => {
    const instanceId = String(state.session?.activeInstanceId || "").trim();
    if (!instanceId) return null;
    return state.activeOverview.find((overview) => (
      String(overview?.instanceId || "").trim() === instanceId
    )) || null;
  };

  const activeActionForSession = () => {
    const overview = activeOverviewForSession();
    const actionId = String(state.session?.activeActionId || "").trim();
    if (!overview || !actionId) return { overview: null, action: null };
    return {
      overview,
      action: (Array.isArray(overview.actions) ? overview.actions : [])
        .find((candidate) => String(candidate?.id || "").trim() === actionId) || null,
    };
  };

  const closeActiveResolutionPopover = async () => {
    const { overview, action } = activeActionForSession();
    const popoverId = action?.type === "resolve"
      ? buildSpellUnifiedPreparedPopoverRequest(overview).id
      : spellActiveResolutionPopoverId(
        overview?.instanceId,
        state.session?.activeActionId,
      );
    if (!popoverId) return;
    const closePopover = runtimeOverrides.closePopover
      || ((id) => OBR.popover.close(id));
    await Promise.resolve(closePopover(popoverId)).catch(() => {});
  };

  const openActiveResolution = async (payload) => {
    if (typeof runtimeOverrides.openActiveResolution === "function") {
      return runtimeOverrides.openActiveResolution(payload);
    }
    const request = buildSpellUnifiedActivePopoverRequest(payload);
    await openTrackedPopover({
      id: request.id,
      url: request.url,
      width: request.width,
      height: request.height,
      anchorReference: "POSITION",
      anchorPosition: await activePopoverAnchor(payload?.casterId),
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 8,
      hidePaper: true,
    });
  };

  const openPreparedResolution = async (overview) => {
    if (typeof runtimeOverrides.openPreparedResolution === "function") {
      return runtimeOverrides.openPreparedResolution(overview);
    }
    const request = buildSpellUnifiedPreparedPopoverRequest(overview);
    const casterId = overview?.context?.casterId || overview?.casterId;
    await openTrackedPopover({
      id: request.id,
      url: request.url,
      width: request.width,
      height: request.height,
      anchorReference: "POSITION",
      anchorPosition: await activePopoverAnchor(casterId),
      anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
      transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      disableClickAway: true,
      marginThreshold: 8,
      hidePaper: true,
    });
  };

  const clearSelection = async () => {
    const operation = captureSceneOperation("spell-panel-selection-clear");
    if (!sceneLifecycle.isCurrent(operation)) return false;
    selectionWriteDepth += 1;
    try {
      await provider.setSelection?.([], true);
      return sceneLifecycle.isCurrent(operation);
    } finally {
      selectionWriteDepth -= 1;
    }
  };

  const writeSelection = async (ids) => {
    const operation = captureSceneOperation("spell-panel-selection-write");
    if (!sceneLifecycle.isCurrent(operation)) return false;
    selectionWriteDepth += 1;
    try {
      await provider.setSelection?.(ids, true);
      return sceneLifecycle.isCurrent(operation);
    } finally {
      selectionWriteDepth -= 1;
    }
  };

  const patchSession = (patch, { clearFeedback = true } = {}) => {
    state.session = updateSpellPanelSession(state.session, {
      ...patch,
      ...(clearFeedback ? {
        feedback: { state: "idle" },
        commitState: { state: "idle" },
      } : {}),
    });
    state.revision += 1;
    render();
  };

  const targetingSelectionMode = () => String(
    state.contract?.presentation?.targeting?.spatialRules?.selectionMode || "",
  ).trim();

  const usesPrimarySecondarySelection = () => (
    targetingSelectionMode() === "primary-then-secondary"
  );

  const targetingSelectionFeedback = (errors = []) => {
    const spatial = state.contract?.presentation?.targeting?.spatialRules || {};
    if (errors.includes("primary-out-of-range")) {
      return `Il bersaglio primario supera la portata di ${spatial.primaryRangeMeters || ""} m.`;
    }
    if (errors.includes("secondary-out-of-range")) {
      return `Seleziona i bersagli secondari entro ${spatial.secondaryRangeMeters || ""} m dal primario.`;
    }
    if (errors.includes("secondary-limit-exceeded")) {
      return "Il numero massimo di bersagli secondari è già selezionato.";
    }
    return "La selezione dei bersagli non è compatibile con il raggio dell'incantesimo.";
  };

  const validateTargetSelection = async (input) => {
    try {
      return await provider.validateTargetSelection?.(input) || null;
    } catch {
      return null;
    }
  };

  const applyPrimarySecondarySelection = async (ids) => {
    if (!sceneAvailable()
      || !usesPrimarySecondarySelection()
      || state.session.placement?.targetLocked === true) return;
    const operation = captureSceneOperation("spell-panel-target-selection");
    if (!sceneLifecycle.isCurrent(operation)) return;
    const requestSequence = ++targetingSelectionSequence;
    const sceneIds = targetIdsForCandidates(ids, state.targetCandidates);
    const currentPrimary = String(state.session.primaryTargetId || "").trim();
    if (!currentPrimary) {
      if (!sceneIds.length) {
        provider.clearTargetingReference?.();
        patchSession({
          targetIds: [],
          primaryTargetId: "",
          outcomes: {},
          targetContext: {},
        });
        return;
      }
      const primaryTargetId = sceneIds[0];
      const validation = await validateTargetSelection({
        contract: state.contract,
        session: {
          ...state.session,
          primaryTargetId,
          targetIds: [primaryTargetId],
        },
        targetIds: [primaryTargetId],
      });
      if (requestSequence !== targetingSelectionSequence || !sceneLifecycle.isCurrent(operation)) return;
      if (validation?.errors?.includes("primary-out-of-range")) {
        provider.clearTargetingReference?.();
        patchSession({
          targetIds: [],
          primaryTargetId: "",
          outcomes: {},
          targetContext: {},
          feedback: { state: "error", message: targetingSelectionFeedback(validation.errors) },
        }, { clearFeedback: false });
        await writeSelection([]);
        return;
      }
      patchSession({
        targetIds: [primaryTargetId],
        primaryTargetId,
        outcomes: {},
        targetContext: {},
      });
      const spatial = state.contract?.presentation?.targeting?.spatialRules || {};
      await provider.showTargetingReference?.({
        targetId: primaryTargetId,
        radiusMeters: spatial.secondaryRangeMeters,
        label: "Raggio bersagli secondari",
      });
      if (requestSequence === targetingSelectionSequence && sceneLifecycle.isCurrent(operation)) {
        await writeSelection([primaryTargetId]);
      }
      return;
    }

    let nextIds = sceneIds.includes(currentPrimary)
      ? sceneIds
      : uniqueIds([...state.session.targetIds, ...sceneIds]);
    const maximum = state.contract?.presentation?.targeting?.limit?.maximum;
    if (Number.isInteger(maximum) && maximum >= 0) nextIds = nextIds.slice(0, maximum);
    const validation = await validateTargetSelection({
      contract: state.contract,
      session: { ...state.session, targetIds: nextIds, primaryTargetId: currentPrimary },
      targetIds: nextIds,
    });
    if (requestSequence !== targetingSelectionSequence || !sceneLifecycle.isCurrent(operation)) return;
    const invalidIds = new Set(validation?.invalidDistanceTargetIds || []);
    nextIds = nextIds.filter((id) => id === currentPrimary || !invalidIds.has(id));
    const targetSet = new Set(nextIds);
    patchSession({
      targetIds: nextIds,
      primaryTargetId: targetSet.has(currentPrimary) ? currentPrimary : "",
      outcomes: Object.fromEntries(
        Object.entries(state.session.outcomes || {}).filter(([id]) => targetSet.has(id)),
      ),
      targetContext: Object.fromEntries(
        Object.entries(state.session.targetContext || {}).filter(([id]) => targetSet.has(id)),
      ),
      ...(validation?.errors?.length && invalidIds.size
        ? { feedback: { state: "error", message: targetingSelectionFeedback(validation.errors) } }
        : {}),
    }, { clearFeedback: !(validation?.errors?.length && invalidIds.size) });
    if (requestSequence === targetingSelectionSequence && sceneLifecycle.isCurrent(operation)) {
      await writeSelection(nextIds);
    }
  };

  const applySelection = (ids) => {
    if (!sceneAvailable() || state.session.placement?.targetLocked === true) return;
    const nextIds = targetIdsForCandidates(ids, state.targetCandidates);
    const targetSet = new Set(nextIds);
    const outcomes = Object.fromEntries(
      Object.entries(state.session.outcomes || {})
        .filter(([id]) => targetSet.has(id)),
    );
    const targetContext = Object.fromEntries(
      Object.entries(state.session.targetContext || {})
        .filter(([id]) => targetSet.has(id)),
    );
    patchSession({
      targetIds: nextIds,
      primaryTargetId: targetSet.has(state.session.primaryTargetId)
        ? state.session.primaryTargetId
        : "",
      ...(state.model?.targets?.outcomes?.mode === "attack" && !nextIds.length
        ? { attackOutcome: "" }
        : {}),
      outcomes,
      targetContext,
    });
  };

  const refreshSceneData = async ({ initial = false } = {}) => {
    const operation = captureSceneOperation(initial ? "spell-panel-bootstrap" : "spell-panel-refresh");
    if (!sceneLifecycle.isCurrent(operation)) return false;
    const [casters, targetItems, overview] = await Promise.all([
      provider.getCasters?.(sourceId) || [],
      provider.getTargetCandidates?.() || null,
      provider.getOverview?.(sourceId) || [],
    ]);
    if (!sceneLifecycle.isCurrent(operation)) return false;
    state.casters = Array.isArray(casters) ? casters : [];
    const candidateItems = Array.isArray(targetItems) ? targetItems : state.casters;
    state.targetCandidates = candidateItems
      .map((item) => item?.key ? item : provider.targetCandidate?.(item))
      .filter(Boolean);
    if (initial) {
      const contextIds = sourceId
        ? await provider.getCardTargetIds?.(sourceId, state.casters)
        : await provider.getContextOrSelectionIds?.();
      if (!sceneLifecycle.isCurrent(operation)) return false;
      const routeIds = targetIdsForCandidates(
        state.session.targetIds,
        state.targetCandidates,
      );
      const selectedIds = routeIds.length
        ? routeIds
        : targetIdsForCandidates(contextIds, state.targetCandidates);
      const preferredCaster = state.session.casterId
        || sourceId
        || selectedIds[0]
        || "";
      state.session = updateSpellPanelSession(state.session, {
        casterId: firstValidCaster(state.casters, preferredCaster),
        targetIds: selectedIds,
      });
    } else if (!validCasterIds().includes(state.session.casterId)) {
      state.session = updateSpellPanelSession(state.session, {
        casterId: firstValidCaster(state.casters, sourceId),
      });
    }
    const concentrations = await provider.getCasterConcentrations?.(state.session.casterId) || {};
    if (!sceneLifecycle.isCurrent(operation)) return false;
    state.concentrationSummary = concentrationSummary(concentrations);
    state.activeOverview = Array.isArray(overview) ? overview : [];
    if (state.contract?.spell?.id && typeof provider.getPendingZoneTriggers === "function") {
      try {
        const pending = await provider.getPendingZoneTriggers({
          spellId: state.contract.spell.id,
          casterId: state.session.casterId,
          activationId: state.session.triggerRuntime?.activationId
            || state.session.triggerRuntime?.id
            || "",
        }) || [];
        if (!sceneLifecycle.isCurrent(operation)) return false;
        const currentId = String(
          state.session.triggerRuntime?.activationId
            || state.session.triggerRuntime?.id
            || "",
        ).trim();
        const activation = (Array.isArray(pending) ? pending : [])
          .find((entry) => String(entry?.activationId || entry?.id || "").trim() === currentId)
          || pending[0]
          || null;
        state.session = updateSpellPanelSession(state.session, {
          triggerRuntime: activation,
        });
      } catch {
        // A temporary trigger lookup failure must not destroy the main panel state.
      }
    }
    if (!sceneLifecycle.isCurrent(operation)) return false;
    const selectedActiveInstanceId = String(state.session.activeInstanceId || "").trim();
    const selectedActiveActionId = String(state.session.activeActionId || "").trim();
    if (selectedActiveInstanceId) {
      const selectedOverview = state.activeOverview.find((entry) => (
        String(entry?.instanceId || "").trim() === selectedActiveInstanceId
      ));
      const selectedAction = selectedOverview && selectedActiveActionId
        ? (Array.isArray(selectedOverview.actions) ? selectedOverview.actions : [])
          .find((entry) => String(entry?.id || "").trim() === selectedActiveActionId)
        : null;
      if (!selectedOverview || (selectedActiveActionId && !selectedAction)) {
        state.session = updateSpellPanelSession(state.session, {
          activeInstanceId: "",
          activeActionId: "",
          activeActionState: null,
        });
      }
    }
    state.loading = false;
    updateEligibility();
    if (initial && usesPrimarySecondarySelection() && state.session.primaryTargetId) {
      const spatial = state.contract?.presentation?.targeting?.spatialRules || {};
      await provider.showTargetingReference?.({
        targetId: state.session.primaryTargetId,
        radiusMeters: spatial.secondaryRangeMeters,
        label: "Raggio bersagli secondari",
      });
      if (!sceneLifecycle.isCurrent(operation)) return false;
    }
    if (!sceneLifecycle.isCurrent(operation)) return false;
    state.revision += 1;
    render();
    return true;
  };

  const refreshScene = async (options = {}) => {
    if (destroyed || !sceneAvailable()) return false;
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }
    const currentRefresh = refreshSceneData(options);
    refreshInFlight = currentRefresh;
    try {
      return await currentRefresh;
    } finally {
      if (refreshInFlight === currentRefresh) refreshInFlight = null;
      if (refreshQueued && !destroyed && !refreshInFlight) {
        refreshQueued = false;
        void refreshScene().catch((error) => {
          console.warn("[spell-unified-panel] scene refresh:", error?.message || error);
        });
      }
    }
  };

  const focusFirstInvalid = (model) => {
    const field = model?.workflow?.validation?.firstInvalidField;
    if (!field || field === "execution") {
      root.focus?.();
      return false;
    }
    const target = root.querySelector(`[data-field="${field}"]`);
    if (!target) return false;
    target.focus();
    return true;
  };

  const areaRuntime = (operation = null, ownerSceneContext = null) => {
    const providerRuntime = provider.getAreaExecutionRuntime?.() || {};
    const areaOverrides = runtimeOverrides.areaRuntime || {};
    const customThrough = typeof runtimeOverrides.undoHistoryThrough === "function"
      || typeof areaOverrides.undoHistoryThrough === "function"
      || typeof providerRuntime.undoHistoryThrough === "function";
    const selectedUndoEntry = runtimeOverrides.undoHistoryEntry
      || (!runtimeOverrides.undoHistoryThrough
        ? areaOverrides.undoHistoryEntry || providerRuntime.undoHistoryEntry
        : null)
      || (!customThrough ? undoHistoryEntry : undefined);
    return {
      ...providerRuntime,
      ...areaOverrides,
      ...(operation ? {
        sceneEpoch: operation.epoch,
        isCurrent: () => sceneLifecycle.isCurrent(operation),
        operationId: operation.operationId,
      } : {}),
      ...(ownerSceneContext?.sceneIdentity
        ? { sceneIdentity: ownerSceneContext.sceneIdentity }
        : {}),
      undoHistoryEntry: selectedUndoEntry,
      undoHistoryThrough: runtimeOverrides.undoHistoryThrough || undoHistoryThrough,
      ...(runtimeOverrides.areaExecutor
        ? { executor: runtimeOverrides.areaExecutor }
        : {}),
    };
  };

  const candidateTargetIds = () => state.targetCandidates
    .map((candidate) => candidate?.key)
    .filter(Boolean);

  const placementDescriptor = () => state.contract?.presentation?.placement || {};

  const placementIdentity = (requestId, status = "pending") => ({
    state: status,
    status,
    requestId,
    ruleId: placementDescriptor().ruleId || null,
    mode: placementDescriptor().mode || null,
    kind: placementDescriptor().rules?.[0]?.kind || null,
    policy: placementDescriptor().policy || null,
    spellId: state.contract?.spell?.id || null,
    casterId: state.session.casterId || null,
    ruleChoice: state.session.variant || placementDescriptor().choice || null,
    phase: state.session.phase || null,
    confirmed: false,
    targetLocked: false,
    preview: null,
  });

  const updateTargetsFromPlacement = (targetIds) => {
    const nextIds = targetIdsForCandidates(targetIds, state.targetCandidates);
    const targetSet = new Set(nextIds);
    state.session = updateSpellPanelSession(state.session, {
      targetIds: nextIds,
      primaryTargetId: targetSet.has(state.session.primaryTargetId)
        ? state.session.primaryTargetId
        : "",
      ...(state.model?.targets?.outcomes?.mode === "attack" && !nextIds.length
        ? { attackOutcome: "" }
        : {}),
      outcomes: Object.fromEntries(
        Object.entries(state.session.outcomes || {})
          .filter(([id]) => targetSet.has(id)),
      ),
      targetContext: Object.fromEntries(
        Object.entries(state.session.targetContext || {})
          .filter(([id]) => targetSet.has(id)),
      ),
    });
    return nextIds;
  };

  const sendPlacementControl = async (type) => {
    const operation = captureSceneOperation(`spell-panel-placement-${type}`);
    if (!sceneLifecycle.isCurrent(operation)) return false;
    const requestId = String(state.session?.placement?.requestId || "").trim();
    const broadcast = runtimeOverrides.broadcast || OBR.broadcast;
    if (!requestId || !broadcast?.sendMessage) return false;
    try {
      await broadcast.sendMessage(
        SPELL_AREA_PLACEMENT_CHANNEL,
        { type, requestId },
        { destination: "LOCAL" },
      );
      return sceneLifecycle.isCurrent(operation);
    } catch (error) {
      patchSession({
        feedback: {
          state: "error",
          message: type === "confirm"
            ? "Impossibile confermare la sagoma."
            : "Impossibile annullare il posizionamento dell'area.",
        },
      }, { clearFeedback: false });
      return false;
    }
  };

  const animatedObjectPlacementPlan = () => {
    const composition = state.contract?.presentation?.composition;
    if (!composition?.visible) return [];
    return expandAnimatedObjectComposition(
      state.session.castContext?.[composition.key || "composition"],
    );
  };

  const startAnimatedObjectBatchPlacement = async ({
    descriptor,
    manualTargetSelection,
    retainedTargetIds,
    objects,
  }) => {
    const operation = captureSceneOperation("spell-panel-animated-placement");
    if (!sceneLifecycle.isCurrent(operation) || !objects.length) return false;
    if (!manualTargetSelection) {
      await writeSelection([]);
      if (!sceneLifecycle.isCurrent(operation)) return false;
      state.session = updateSpellPanelSession(state.session, {
        targetIds: [],
        primaryTargetId: "",
        outcomes: {},
        targetContext: {},
      });
    }
    const requestId = createSpellAreaPlacementRequestId();
    const batchObjects = objects.map((object) => ({
      id: object.id,
      label: object.label,
    }));
    pendingPlacementRequests.add(requestId);
    state.session = updateSpellPanelSession(state.session, {
      placement: {
        ...placementIdentity(requestId),
        targetLocked: manualTargetSelection,
        targetIds: retainedTargetIds,
        batchIndex: 0,
        batchTotal: objects.length,
      },
      feedback: {
        state: "loading",
        message: `Posiziona gli oggetti sulla mappa (0/${objects.length}).`,
      },
      commitState: { state: "idle" },
    });
    state.revision += 1;
    render();
    let result;
    try {
      result = await requestSpellAreaPlacement({
        requestId,
        ruleId: descriptor.ruleId,
        casterId: state.session.casterId,
        ruleChoice: state.session.variant || descriptor.choice || "",
        context: {
          phase: state.session.phase,
          spellId: state.contract?.spell?.id || "",
          batch: {
            objects: batchObjects,
            total: batchObjects.length,
            placement: "one-by-one",
          },
        },
      }, {
        broadcast: runtimeOverrides.broadcast || OBR.broadcast,
        windowRef: runtimeOverrides.windowRef || globalThis.window,
        onProgress: (progress) => {
          if (destroyed || !sceneLifecycle.isCurrent(operation)
            || state.session.placement?.requestId !== requestId) return;
          const batchIndex = Math.max(
            0,
            Math.min(objects.length, Math.floor(Number(progress?.batchIndex) || 0)),
          );
          state.session = updateSpellPanelSession(state.session, {
            placement: {
              ...placementIdentity(requestId),
              ...(progress || {}),
              state: "pending",
              status: "pending",
              confirmed: false,
              targetLocked: manualTargetSelection,
              targetIds: retainedTargetIds,
              batchIndex,
              batchTotal: objects.length,
              preview: progress?.preview || null,
            },
            feedback: {
              state: "info",
              message: progress?.message || `Posiziona gli oggetti sulla mappa (${batchIndex}/${objects.length}).`,
            },
          });
          state.revision += 1;
          render();
        },
      });
    } catch (error) {
      result = { status: "failed", error: String(error?.message || error || "placement-failed") };
    } finally {
      pendingPlacementRequests.delete(requestId);
    }
    if (destroyed || !sceneLifecycle.isCurrent(operation)) return true;
    const status = String(result?.status || "error").trim() === "error"
      ? "failed"
      : String(result?.status || "error").trim();
    if (status !== "confirmed") {
      const rawError = String(result?.error || "").trim();
      state.session = updateSpellPanelSession(state.session, {
        placement: {
          ...placementIdentity(requestId, status),
          batchIndex: state.session.placement?.batchIndex || 0,
          batchTotal: objects.length,
          error: AREA_FEEDBACK_MESSAGES[rawError]
            || (rawError.includes(" ") ? rawError : "Posizionamento degli oggetti non riuscito."),
        },
        feedback: {
          state: status === "cancelled" ? "info" : "error",
          message: status === "cancelled"
            ? "Posizionamento annullato."
            : "Posizionamento degli oggetti non riuscito.",
        },
      });
      state.revision += 1;
      render();
      return true;
    }
    const positions = Array.isArray(result?.preview?.positions)
      ? result.preview.positions
      : [];
    if (positions.length !== objects.length) {
      state.session = updateSpellPanelSession(state.session, {
        placement: {
          ...placementIdentity(requestId, "failed"),
          batchIndex: positions.length,
          batchTotal: objects.length,
          error: "Non tutti gli oggetti sono stati posizionati.",
        },
        feedback: { state: "error", message: "Non tutti gli oggetti sono stati posizionati." },
      });
      state.revision += 1;
      render();
      return true;
    }
    const finalPlacement = {
      ...placementIdentity(requestId, "confirmed"),
      ...result,
      state: "confirmed",
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      targetIds: retainedTargetIds,
      batchIndex: objects.length,
      batchTotal: objects.length,
    };
    state.session = updateSpellPanelSession(state.session, {
      placement: finalPlacement,
      feedback: { state: "success", message: `${objects.length} oggetti posizionati.` },
    });
    state.revision += 1;
    render();
    return true;
  };

  const startPlacement = async () => {
    const operation = captureSceneOperation("spell-panel-placement");
    if (!sceneLifecycle.isCurrent(operation)) return;
    const eligibility = getSpellUnifiedAreaEligibility(state.contract, state.session);
    const descriptor = placementDescriptor();
    const manualTargetSelection = state.contract?.presentation?.targeting?.selectionMode === "manual";
    const retainedTargetIds = manualTargetSelection
      ? uniqueIds(state.session.targetIds)
      : [];
    if (!eligibility.eligible || !descriptor.ruleId || state.committing) return;
    if (descriptor.policy === "automatic") return;
    if (state.session.placement?.state === "pending") return;
    if (manualTargetSelection && !retainedTargetIds.length) {
      patchSession({
        feedback: {
          state: "info",
          message: "Seleziona il bersaglio prima di posizionare l'area.",
        },
      }, { clearFeedback: false });
      return;
    }

    const objects = animatedObjectPlacementPlan();
    if (objects.length) {
      await startAnimatedObjectBatchPlacement({
        descriptor,
        manualTargetSelection,
        retainedTargetIds,
        objects,
      });
      return;
    }

    const requestId = createSpellAreaPlacementRequestId();
    pendingPlacementRequests.add(requestId);
    state.session = updateSpellPanelSession(state.session, {
      placement: {
        ...placementIdentity(requestId),
        targetLocked: manualTargetSelection,
        targetIds: retainedTargetIds,
      },
      ...(manualTargetSelection
        ? {}
        : {
          targetIds: [],
          primaryTargetId: "",
          outcomes: {},
          targetContext: {},
        }),
      feedback: { state: "loading", message: "Posizionamento dell'area in corso…" },
      commitState: { state: "idle" },
    });
    state.revision += 1;
    render();

    try {
      if (!manualTargetSelection) await writeSelection([]);
      if (!sceneLifecycle.isCurrent(operation)) return;
      const result = await requestSpellAreaPlacement({
        requestId,
        ruleId: descriptor.ruleId,
        casterId: state.session.casterId,
        ruleChoice: state.session.variant || descriptor.choice || "",
        context: {
          phase: state.session.phase,
          spellId: state.contract?.spell?.id || "",
        },
      }, {
        broadcast: runtimeOverrides.broadcast || OBR.broadcast,
        windowRef: runtimeOverrides.windowRef || globalThis.window,
      });
      if (destroyed || !sceneLifecycle.isCurrent(operation)
        || state.session.placement?.requestId !== requestId) return;
      const rawStatus = String(result?.status || "error").trim();
      const status = rawStatus === "error" ? "failed" : rawStatus;
      const confirmed = status === "confirmed";
      const rawError = String(result?.error || "").trim();
      const errorMessage = AREA_FEEDBACK_MESSAGES[rawError]
        || (rawError.includes(" ") ? rawError : "Posizionamento dell'area non riuscito.");
      const placement = {
        ...placementIdentity(requestId, status),
        ...result,
        state: status,
        status,
        confirmed,
        targetLocked: confirmed,
        preview: result?.preview || null,
        targetIds: confirmed
          ? (manualTargetSelection
            ? retainedTargetIds
            : uniqueIds(result?.preview?.targetIds))
          : [],
        error: confirmed ? null : errorMessage,
      };
      state.session = updateSpellPanelSession(state.session, {
        placement,
        feedback: confirmed
          ? { state: "success", message: "Area confermata." }
          : {
            state: status === "cancelled" ? "info" : "error",
            message: status === "cancelled"
              ? "Posizionamento dell'area annullato."
              : placement.error,
          },
      });
      const nextIds = manualTargetSelection
        ? retainedTargetIds
        : updateTargetsFromPlacement(placement.targetIds);
      state.revision += 1;
      render();
      await writeSelection(nextIds);
      if (!sceneLifecycle.isCurrent(operation)) return;
    } catch (error) {
      if (destroyed || !sceneLifecycle.isCurrent(operation)
        || state.session.placement?.requestId !== requestId) return;
      state.session = updateSpellPanelSession(state.session, {
        ...(error ? {
          feedback: {
            state: "error",
            message: "Posizionamento dell'area non riuscito.",
          },
        } : {}),
        placement: {
          ...placementIdentity(requestId, "failed"),
          error: "Posizionamento dell'area non riuscito.",
        },
      });
      state.revision += 1;
      render();
    } finally {
      pendingPlacementRequests.delete(requestId);
    }
  };

  const commitArea = async () => {
    if (!sceneAvailable()
      || state.committing
      || state.session.commitState.state === "committing") return;
    const operation = captureSceneOperation("spell-panel-area-commit");
    if (!sceneLifecycle.isCurrent(operation)) return;
    let ownerSceneContext = null;
    if (!runtimeOverrides.areaExecutor) {
      try {
        ownerSceneContext = await getEffectsMutationSceneContext({
          commandId: operation.operationId,
        });
      } catch (error) {
        if (sceneLifecycle.isCurrent(operation)) {
          patchSession({
            feedback: { state: "error", message: "La scena non è disponibile per la mutazione." },
          }, { clearFeedback: false });
        }
        return;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    state.committing = true;
    const runtime = areaRuntime(operation, ownerSceneContext);
    const sceneEpoch = operation.epoch;
    state.session = updateSpellPanelSession(state.session, {
      commitState: { state: "committing" },
      feedback: { state: "loading", message: "Applicazione in corso…" },
    });
    state.revision += 1;
    render();
    try {
      const result = await executeSpellUnifiedArea({
        contract: state.contract,
        session: state.session,
        source: { sceneEpoch },
        runtime,
        candidateTargetIds: candidateTargetIds(),
      });
      if (!sceneLifecycle.isCurrent(operation)) return;
      state.lastAreaResult = result;
      const success = result.status === SPELL_UNIFIED_AREA_STATUS.APPLIED
        || result.status === SPELL_UNIFIED_AREA_STATUS.NOOP;
      if (success) {
        if (usesPrimarySecondarySelection()) provider.clearTargetingReference?.();
        const hasUndo = result.undoAvailable === true && !!result.historyEntryId;
        state.session = updateSpellPanelSession(state.session, {
          commitState: {
            state: "committed",
            activationId: result.historyEntryId || result.instanceId || null,
          },
          undoState: {
            state: hasUndo ? "available" : "unavailable",
            available: hasUndo,
            activationId: result.historyEntryId || null,
          },
          ...(state.session.triggerRuntime
            ? {
              triggerRuntime: null,
              placement: null,
              targetIds: [],
              primaryTargetId: "",
              outcomes: {},
              targetContext: {},
            }
            : {}),
          feedback: {
            state: result.status === SPELL_UNIFIED_AREA_STATUS.NOOP ? "info" : "success",
            message: result.status === SPELL_UNIFIED_AREA_STATUS.NOOP
              ? areaMessageForResult(result)
              : `Applicazione completata su ${result.changedIds.length} elementi.`,
          },
        });
        state.revision += 1;
        render();
        await refreshScene();
        return;
      }

      const firstCode = String(result.errors?.[0]?.code || "").trim();
      const stalePlacement = [
        "placement-stale",
        "placement-spell-mismatch",
        "placement-caster-mismatch",
        "placement-choice-mismatch",
        "scene-epoch-stale",
        "scene-epoch-mismatch",
      ].includes(firstCode);
      state.session = updateSpellPanelSession(state.session, {
        ...(stalePlacement && state.session.placement
          ? {
            placement: {
              ...state.session.placement,
              state: "stale",
              status: "stale",
              confirmed: false,
              targetLocked: false,
            },
            targetIds: [],
            outcomes: {},
            targetContext: {},
          }
          : {}),
        commitState: { state: "failed", error: areaMessageForResult(result) },
        feedback: { state: "error", message: areaMessageForResult(result) },
      });
      state.revision += 1;
      render();
      if (stalePlacement || firstCode === "target-missing") {
        await refreshScene();
      }
    } catch (error) {
      if (!sceneLifecycle.isCurrent(operation)) return;
      state.session = updateSpellPanelSession(state.session, {
        commitState: { state: "failed", error: "Applicazione non riuscita." },
        feedback: { state: "error", message: "Applicazione non riuscita." },
      });
      state.revision += 1;
      render();
    } finally {
      state.committing = false;
    }
  };

  const undo = async () => {
    if (!sceneAvailable()
      || state.committing
      || state.session.undoState?.available !== true) return;
    const operation = captureSceneOperation("spell-panel-area-undo");
    if (!sceneLifecycle.isCurrent(operation)) return;
    state.session = updateSpellPanelSession(state.session, {
      undoState: { ...state.session.undoState, state: "undoing" },
      feedback: { state: "loading", message: "Undo in corso…" },
    });
    state.revision += 1;
    render();
    const result = await undoSpellUnifiedArea({
      session: state.session,
      runtime: areaRuntime(operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (result.status === SPELL_UNIFIED_AREA_STATUS.UNDONE) {
      state.session = updateSpellPanelSession(state.session, {
        undoState: { state: "undone", available: false },
        feedback: { state: "success", message: "Ultima applicazione annullata." },
      });
      state.revision += 1;
      render();
      await refreshScene();
      return;
    }
    state.session = updateSpellPanelSession(state.session, {
      undoState: { ...state.session.undoState, state: "available", available: true },
      feedback: { state: "error", message: areaMessageForResult(result) },
    });
    state.revision += 1;
    render();
  };

  const persistentRuntime = (executor, operation = null, ownerSceneContext = null) => ({
    ...(typeof executor === "function" ? { executor } : {}),
    ...(operation ? {
      sceneEpoch: operation.epoch,
      isCurrent: () => sceneLifecycle.isCurrent(operation),
      commandId: operation.operationId,
    } : {}),
    ...(ownerSceneContext?.sceneIdentity
      ? { sceneIdentity: ownerSceneContext.sceneIdentity }
      : {}),
  });

  const persistentResultMessage = (result, fallback) => (
    result?.errors?.[0]?.message || fallback
  );

  const updateBoardToken = async ({ overview, hp }) => {
    if (destroyed || !sceneAvailable()) return;
    const operation = captureSceneOperation("spell-panel-board-token-update");
    if (!sceneLifecycle.isCurrent(operation)) return;
    state.session = updateSpellPanelSession(state.session, {
      feedback: { state: "loading", message: "Aggiornamento HP della pedina in corso…" },
    });
    state.revision += 1;
    render();
    const result = await executeSpellUnifiedBoardTokenStateUpdate({
      overview,
      hp,
      runtime: persistentRuntime(runtimeOverrides.boardTokenStateExecutor, operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (result.status === SPELL_UNIFIED_PERSISTENT_STATUS.UPDATED) {
      state.session = updateSpellPanelSession(state.session, {
        feedback: { state: "success", message: "HP della pedina aggiornati." },
      });
      state.revision += 1;
      render();
      await refreshScene();
      return;
    }
    state.session = updateSpellPanelSession(state.session, {
      feedback: {
        state: "error",
        message: persistentResultMessage(result, "Aggiornamento HP della pedina non riuscito."),
      },
    });
    state.revision += 1;
    render();
  };

  const recreateBoardToken = async (overview) => {
    const operation = captureSceneOperation("spell-panel-board-token-recreate");
    if (!sceneLifecycle.isCurrent(operation)) return;
    const persistent = overview?.persistent || {};
    const requestId = createSpellAreaPlacementRequestId();
    if (!persistent.ruleId || !persistent.casterId) return;
    pendingPlacementRequests.add(requestId);
    state.session = updateSpellPanelSession(state.session, {
      feedback: { state: "loading", message: "Posizionamento della pedina in corso…" },
    });
    state.revision += 1;
    render();
    try {
      const placement = await requestSpellAreaPlacement({
        requestId,
        ruleId: persistent.ruleId,
        casterId: persistent.casterId,
        ruleChoice: persistent.castContext?.choice || "",
        context: {
          phase: "cast",
          spellId: persistent.spellId || "",
          recreation: true,
        },
      }, {
        broadcast: runtimeOverrides.broadcast || OBR.broadcast,
        windowRef: runtimeOverrides.windowRef || globalThis.window,
      });
      if (destroyed || !sceneLifecycle.isCurrent(operation)) return;
      if (placement?.status !== "confirmed") {
        state.session = updateSpellPanelSession(state.session, {
          feedback: {
            state: placement?.status === "cancelled" ? "info" : "error",
            message: placement?.status === "cancelled"
              ? "Posizionamento della pedina annullato."
              : "Posizionamento della pedina non riuscito.",
          },
        });
        state.revision += 1;
        render();
        return;
      }
      const position = spellBoardTokenPlacementPosition(placement.preview);
      const result = await executeSpellUnifiedBoardTokenRecreate({
        overview,
        position,
        runtime: persistentRuntime(runtimeOverrides.boardTokenRecreateExecutor, operation),
      });
      if (!sceneLifecycle.isCurrent(operation)) return;
      if (result.status === SPELL_UNIFIED_PERSISTENT_STATUS.RECREATED) {
        state.session = updateSpellPanelSession(state.session, {
          feedback: { state: "success", message: "Pedina ricreata." },
        });
        state.revision += 1;
        render();
        await refreshScene();
        return;
      }
      state.session = updateSpellPanelSession(state.session, {
        feedback: {
          state: "error",
          message: persistentResultMessage(result, "Ricreazione della pedina non riuscita."),
        },
      });
      state.revision += 1;
      render();
    } catch (error) {
      state.session = updateSpellPanelSession(state.session, {
        feedback: {
          state: "error",
          message: error?.message || "Posizionamento della pedina non riuscito.",
        },
      });
      state.revision += 1;
      render();
    } finally {
      pendingPlacementRequests.delete(requestId);
    }
  };

  const activeActionErrorMessage = (result) => (
    result?.errors?.[0]?.message
      || result?.validation?.errors?.[0]?.message
      || "Risoluzione dell'azione non riuscita."
  );

  const terminateActiveSpell = async (overview) => {
    if (!sceneAvailable() || state.committing || !overview) return;
    const operation = captureSceneOperation("spell-panel-spell-terminate");
    if (!sceneLifecycle.isCurrent(operation)) return;
    const context = overview.context || {};
    const instanceId = String(overview.instanceId || context.instanceId || "").trim();
    const casterId = String(context.casterId || "").trim();
    const targetIds = uniqueIds(overview.targetIds?.length
      ? overview.targetIds
      : context.targetIds);
    const canTerminate = targetIds.length > 0
      || (context.concentration === true && !!casterId)
      || ["present", "lifecycle-missing"].includes(overview.persistent?.state);
    if (!canTerminate) return;

    let ownerSceneContext = null;
    if (!runtimeOverrides.runEffectsMutation) {
      try {
        ownerSceneContext = await getEffectsMutationSceneContext({
          commandId: operation.operationId,
        });
      } catch (error) {
        if (sceneLifecycle.isCurrent(operation)) {
          patchSession({
            feedback: { state: "error", message: "La scena non è disponibile per la mutazione." },
          }, { clearFeedback: false });
        }
        return;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }

    const operations = [];
    if (context.concentration === true && casterId) {
      operations.push({
        type: "concentration:break",
        casterIds: [casterId],
        reference: String(context.concentrationRef || instanceId || context.storedName || "").trim(),
      });
    }
    const linkedEffectRemovals = (Array.isArray(context.effectInstances)
      ? context.effectInstances
      : [])
      .map((entry) => ({
        itemId: String(entry?.itemId || "").trim(),
        parentEffectId: instanceId,
      }))
      .filter((entry) => entry.itemId && entry.parentEffectId);
    if (linkedEffectRemovals.length) {
      operations.push({
        type: "condition:remove-parent-effects",
        removals: linkedEffectRemovals,
      });
    }
    operations.push(instanceId
      ? { type: "spell:remove-instance", targetIds, instanceId }
      : {
        type: "spell:remove-name-source",
        targetIds,
        name: String(context.storedName || overview.name || "").trim(),
        casterId: casterId || null,
      });

    state.committing = true;
    patchSession({
      feedback: { state: "loading", message: `Termino ${overview.name}…` },
    }, { clearFeedback: false });
    const selectedActiveInstance = Boolean(instanceId)
      && String(state.session?.activeInstanceId || "").trim() === instanceId;
    const selectedActionState = String(state.session?.activeActionState?.state || "").trim();
    const selectedActionId = String(state.session?.activeActionId || "").trim();
    const selectedAction = selectedActiveInstance
      ? (Array.isArray(overview.actions) ? overview.actions : [])
        .find((entry) => String(entry?.id || "").trim() === selectedActionId)
      : null;
    let activePopoverId = "";
    if (selectedActiveInstance && selectedActionState === "opened") {
      try {
        activePopoverId = selectedAction?.type === "resolve"
          ? buildSpellUnifiedPreparedPopoverRequest(overview).id
          : spellActiveResolutionPopoverId(instanceId, selectedActionId);
      } catch (error) {
        console.warn("[spell-unified-panel] active resolution id:", error?.message || error);
      }
    }
    const closeActivePopover = () => {
      if (!activePopoverId) return;
      const closePopover = runtimeOverrides.closePopover || ((id) => OBR.popover.close(id));
      try {
        void Promise.resolve(closePopover(activePopoverId)).catch((error) => {
          console.warn("[spell-unified-panel] active resolution close:", error?.message || error);
        });
      } catch (error) {
        console.warn("[spell-unified-panel] active resolution close:", error?.message || error);
      }
    };
    let mutationApplied = false;
    try {
      const mutationRunner = runtimeOverrides.runEffectsMutation || runEffectsMutation;
      const mutation = await mutationRunner(operations, {
        kind: "spell",
        label: `Terminato incantesimo: ${overview.name}`,
        targetIds: uniqueIds([casterId, ...targetIds]),
        sideEffects: instanceId ? [{
          type: "static-zone:remove-ended",
          selectors: [{ instanceId }],
        }] : [],
        commandId: ownerSceneContext?.commandId || operation.operationId,
        sceneIdentity: ownerSceneContext?.sceneIdentity || null,
      });
      if (!sceneLifecycle.isCurrent(operation)) return;
      const requireMutation = runtimeOverrides.requireAppliedEffectsMutation
        || requireAppliedEffectsMutation;
      requireMutation(mutation);
      mutationApplied = true;
      closeActivePopover();
      if (instanceId) {
        state.activeOverview = state.activeOverview.filter((entry) => (
          String(entry?.instanceId || entry?.context?.instanceId || "").trim() !== instanceId
        ));
      }
      state.session = updateSpellPanelSession(state.session, {
        ...(selectedActiveInstance ? {
          activeInstanceId: "",
          activeActionId: "",
          activeActionState: null,
        } : {}),
        feedback: { state: "success", message: `${overview.name} terminato.` },
      });
    } catch (error) {
      if (!sceneLifecycle.isCurrent(operation)) return;
      state.session = updateSpellPanelSession(state.session, {
        feedback: {
          state: "error",
          message: error?.message || "Terminazione dell'incantesimo non riuscita.",
        },
      });
    } finally {
      state.committing = false;
      state.revision += 1;
      render();
    }
    if (!mutationApplied) return;
    if (targetIds.length) {
      const refreshLabels = runtimeOverrides.refreshConditionLabels || refreshConditionLabels;
      void Promise.resolve()
        .then(() => refreshLabels(targetIds))
        .catch((error) => {
          console.warn("[spell-unified-panel] condition labels refresh:", error?.message || error);
        });
    }
    try {
      await refreshScene();
    } catch (error) {
      console.warn("[spell-unified-panel] scene refresh after termination:", error?.message || error);
    }
  };

  const executeActiveAction = async () => {
    if (!sceneAvailable() || state.committing || ["loading", "opened"].includes(
      String(state.session?.activeActionState?.state || "").trim(),
    )) return;
    const operation = captureSceneOperation("spell-panel-active-action");
    if (!sceneLifecycle.isCurrent(operation)) return;
    const { overview, action } = activeActionForSession();
    const actionId = String(state.session?.activeActionId || "").trim();
    if (!overview || !actionId || !action) {
      patchSession({
        activeActionState: {
          state: "failed",
          instanceId: state.session?.activeInstanceId || "",
          actionId,
          error: "L'azione attiva non è più disponibile.",
        },
        feedback: {
          state: "error",
          message: "L'azione attiva non è più disponibile.",
        },
      }, { clearFeedback: false });
      return;
    }

    const context = overview.context || overview;
    const choiceValue = state.session?.activeActionState?.choiceValue
      || state.session?.variant
      || context.castContext?.choice
      || "";
    if (
      action.type === "resolve"
      && PREPARED_AREA_RESOLUTION_SPELL_IDS.has(String(context.spellId || "").trim())
    ) {
      const spellId = String(context.spellId || state.contract?.spell?.id || "").trim();
      const slotLevel = numeric(
        context.castContext?.slotLevel
          ?? state.session?.slotLevel
          ?? state.contract?.presentation?.slot?.default,
      );
      const nextContract = buildContract(spellId, {
        phase: "resolve",
        variant: choiceValue,
        slotLevel,
      });
      if (!nextContract) return;
      state.contract = nextContract;
      state.session = updateSpellPanelSession(state.session, {
        spellId,
        phase: "resolve",
        activeActionId: "",
        activeInstanceId: "",
        activeActionState: null,
        activeConcentration: {
          instanceId: String(context.instanceId || overview.instanceId || "").trim(),
          spellId,
        },
        slotLevel,
        variant: choiceValue,
        castContext: {
          ...(context.castContext && typeof context.castContext === "object"
            ? context.castContext
            : {}),
          phase: "resolve",
          ...(slotLevel === null ? {} : { slotLevel }),
        },
        commitState: { state: "idle" },
        feedback: {
          state: "info",
          message: "Risoluzione preparata pronta nel pannello unificato.",
        },
      });
      updateEligibility();
      state.revision += 1;
      render();
      return;
    }
    state.committing = true;
    state.session = updateSpellPanelSession(state.session, {
      activeActionState: {
        state: "loading",
        instanceId: overview.instanceId,
        actionId,
        choiceValue,
      },
      commitState: { state: "committing" },
      feedback: { state: "loading", message: "Risoluzione in corso…" },
    });
    state.revision += 1;
    render();

    activePopupOperation = null;
    let result;
    try {
      const liveSceneEpoch = currentSceneEpoch();
      const capturedSceneEpoch = numeric(context.sceneEpoch);
      result = await executeSpellUnifiedActiveAction({
        overview,
        action,
        actionId,
        selectedTargetIds: state.session.targetIds,
        choiceValue,
        sceneEpoch: runtimeOverrides.sceneEpoch ?? capturedSceneEpoch ?? liveSceneEpoch,
        currentSceneEpoch: runtimeOverrides.currentSceneEpoch ?? liveSceneEpoch,
        turnKey: context.turnKey || context.appliedAt?.turnKey || "",
        revision: context.revision,
        currentRevision: runtimeOverrides.currentRevision,
        runtime: {
          sceneEpoch: operation.epoch,
          sceneIdentity: null,
          commandId: operation.operationId,
          isCurrent: () => sceneLifecycle.isCurrent(operation),
          ...(!runtimeOverrides.activeExecutor
            && !runtimeOverrides.preparedExecutor
            && !runtimeOverrides.zoneMovementExecutor
            && !runtimeOverrides.zoneDirectionExecutor
            ? {
              getSceneContext: () => getEffectsMutationSceneContext({
                commandId: operation.operationId,
              }),
            }
            : {}),
          openActiveResolution,
          openPreparedResolution,
          ...(runtimeOverrides.activeExecutor
            ? { activeExecutor: runtimeOverrides.activeExecutor }
            : {}),
          ...(runtimeOverrides.preparedExecutor
            ? { preparedExecutor: runtimeOverrides.preparedExecutor }
            : {}),
          ...(runtimeOverrides.zoneMovementExecutor
            ? { zoneMovementExecutor: runtimeOverrides.zoneMovementExecutor }
            : {}),
          ...(runtimeOverrides.zoneDirectionExecutor
            ? { zoneDirectionExecutor: runtimeOverrides.zoneDirectionExecutor }
            : {}),
        },
      });
    } catch (error) {
      result = {
        status: SPELL_UNIFIED_ACTIVE_STATUS.FAILED,
        errors: [{ message: error?.message || "Risoluzione dell'azione non riuscita." }],
      };
    }
    if (!sceneLifecycle.isCurrent(operation)) return;
    state.committing = false;

    if (result.status === SPELL_UNIFIED_ACTIVE_STATUS.POPUP_OPENED) {
      activePopupOperation = operation;
      state.session = updateSpellPanelSession(state.session, {
        activeActionState: {
          state: "opened",
          instanceId: overview.instanceId,
          actionId,
          choiceValue,
        },
        commitState: { state: "idle" },
        feedback: { state: "info", message: "Risoluzione aperta nel popup dedicato." },
      });
      state.revision += 1;
      render();
      return;
    }

    if (result.status === SPELL_UNIFIED_ACTIVE_STATUS.EXECUTED) {
      const hasUndo = result.undoAvailable === true && !!result.historyEntryId;
      state.session = updateSpellPanelSession(state.session, {
        activeActionState: {
          state: "executed",
          instanceId: overview.instanceId,
          actionId,
          choiceValue,
        },
        commitState: {
          state: "committed",
          activationId: result.historyEntryId || overview.instanceId || null,
        },
        undoState: {
          state: hasUndo ? "available" : "unavailable",
          available: hasUndo,
          activationId: result.historyEntryId || null,
        },
        feedback: {
          state: "success",
          message: result.changedIds?.length
            ? `Azione completata su ${result.changedIds.length} elementi.`
            : "Azione completata.",
        },
      });
      state.revision += 1;
      render();
      await refreshScene();
      return;
    }

    state.session = updateSpellPanelSession(state.session, {
      activeActionState: {
        state: "failed",
        instanceId: overview.instanceId,
        actionId,
        choiceValue,
        error: activeActionErrorMessage(result),
      },
      commitState: { state: "failed", error: activeActionErrorMessage(result) },
      feedback: { state: "error", message: activeActionErrorMessage(result) },
    });
    state.revision += 1;
    render();
  };

  const handlePopupResult = async (event) => {
    if (!sceneAvailable()) return;
    const popupOperation = activePopupOperation;
    if (!popupOperation || !sceneLifecycle.isCurrent(popupOperation)) return;
    const data = event?.data && typeof event.data === "object" ? event.data : event;
    const status = String(data?.status || "").trim();
    if (!Object.values(SPELL_UNIFIED_PANEL_POPUP_STATUSES).includes(status)) return;
    const instanceId = String(state.session?.activeInstanceId || "").trim();
    const actionId = String(state.session?.activeActionId || "").trim();
    if (!isSpellUnifiedPopupEvent(event, { instanceId, actionId })) return;
    if (String(state.session?.activeActionState?.state || "").trim() !== "opened") return;
    activePopupOperation = null;

    const nextState = status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED
      ? "failed"
      : "selected";
    const message = status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED
      ? "Risoluzione completata."
      : status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED
        ? data?.message || "Risoluzione non riuscita."
        : "Risoluzione chiusa; nessuna modifica aggiuntiva eseguita.";
    const completedHistory = status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED
      ? spellExecutionHistoryDetails(data)
      : null;
    const hasUndo = completedHistory?.undoAvailable === true
      && !!completedHistory.historyEntryId;
    state.session = updateSpellPanelSession(state.session, {
      activeActionState: {
        state: nextState,
        instanceId,
        actionId,
        choiceValue: state.session?.activeActionState?.choiceValue || "",
        ...(status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED
          ? { error: message }
          : {}),
      },
      commitState: status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED
        ? {
          state: "committed",
          activationId: completedHistory.historyEntryId || null,
        }
        : { state: "idle" },
      ...(status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED
        ? {
          undoState: {
            state: hasUndo ? "available" : "unavailable",
            available: hasUndo,
            activationId: completedHistory.historyEntryId || null,
          },
        }
        : {}),
      feedback: {
        state: status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED
          ? "success"
          : status === SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED
            ? "error"
            : "info",
        message,
      },
    });
    state.revision += 1;
    render();
    if (status !== SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED && sceneAvailable()) {
      await refreshScene();
    }
  };

  const resetSceneBaseline = (message, { ready: nextReady = false } = {}) => {
    ++targetingSelectionSequence;
    activePopupOperation = null;
    void closeActiveResolutionPopover();
    provider.clearTargetingReference?.();
    const requestIds = [...pendingPlacementRequests];
    pendingPlacementRequests.clear();
    void Promise.all(requestIds.map((requestId) => (
      cancelSpellAreaPlacementRequest(requestId, {
        broadcast: runtimeOverrides.broadcast || OBR.broadcast,
      }).catch(() => false)
    )));
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    refreshQueued = false;
    sourceId = "";
    state.casters = [];
    state.targetCandidates = [];
    state.activeOverview = [];
    state.concentrationSummary = {};
    state.loading = !nextReady;
    state.committing = false;
    state.session = updateSpellPanelSession(state.session, {
      casterId: "",
      targetIds: [],
      primaryTargetId: "",
      outcomes: {},
      targetContext: {},
      placement: null,
      triggerRuntime: null,
      activeInstanceId: "",
      activeActionId: "",
      activeActionState: null,
      commitState: { state: "idle" },
      undoState: { state: "unavailable", available: false, activationId: null },
      feedback: { state: nextReady ? "info" : "error", message },
    });
    updateEligibility();
    state.revision += 1;
    render();
  };

  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    if (ownsSceneLifecycle) sceneLifecycle.dispose();
    unsubscribeSceneLifecycle?.();
    unsubscribeSceneLifecycle = null;
    activePopupOperation = null;
    await closeActiveResolutionPopover();
    ++targetingSelectionSequence;
    provider.clearTargetingReference?.();
    await Promise.all([...pendingPlacementRequests].map((requestId) => (
      cancelSpellAreaPlacementRequest(requestId, {
        broadcast: runtimeOverrides.broadcast || OBR.broadcast,
      }).catch(() => false)
    )));
    pendingPlacementRequests.clear();
    unsubscribeSelection?.();
    unsubscribeItems?.();
    unsubscribePopup?.();
    unsubscribeSelection = null;
    unsubscribeItems = null;
    unsubscribePopup = null;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    refreshQueued = false;
  };

  const resetConfiguration = () => {
    const spellId = String(state.contract?.spell?.id || state.session?.spellId || "").trim();
    ++targetingSelectionSequence;
    provider.clearTargetingReference?.();
    if (spellId) {
      state.contract = buildContract(spellId, {
        phase: state.session?.phase || "",
        slotLevel: state.session?.slotLevel ?? null,
      });
    }
    state.session = updateSpellPanelSession(state.session, {
      spellId,
      activeActionId: "",
      activeInstanceId: "",
      activeActionState: null,
      variant: "",
      targetIds: [],
      primaryTargetId: "",
      outcomes: {},
      targetContext: {},
      placement: null,
      hpValues: { hp: null, damage: null, healing: null },
      castContext: {
        ...state.session.castContext,
        ...(state.contract?.presentation?.composition?.key
          ? { [state.contract.presentation.composition.key]: null }
          : {}),
      },
      triggerRuntime: null,
      commitState: { state: "idle" },
      feedback: { state: "info", message: "Configurazione azzerata." },
    });
    updateEligibility();
    state.revision += 1;
    render();
  };

  const commit = async () => {
    if (!sceneAvailable()
      || state.committing
      || state.session.commitState.state === "committing") return;
    const operation = captureSceneOperation("spell-panel-lifecycle-commit");
    if (!sceneLifecycle.isCurrent(operation)) return;
    const model = state.model || render();
    if (model?.workflow?.validation?.firstInvalidField) {
      if (model.workflow.validation.firstInvalidField === "execution") {
        patchSession({
          feedback: {
            state: "info",
            message: state.session.executionGate.message || "Workflow dedicato richiesto.",
          },
        }, { clearFeedback: false });
      } else {
        focusFirstInvalid(model);
      }
      return;
    }
    const actionId = model?.workflow?.primaryAction?.id;
    if (!["apply", "prepare"].includes(actionId)) return;
    if (usesPersistentCastAdapter()) {
      await commitArea();
      return;
    }
    let ownerSceneContext = null;
    if (!runtimeOverrides.lifecycleExecutor) {
      try {
        ownerSceneContext = await getEffectsMutationSceneContext({
          commandId: operation.operationId,
        });
      } catch (error) {
        if (sceneLifecycle.isCurrent(operation)) {
          patchSession({
            feedback: { state: "error", message: "La scena non è disponibile per la mutazione." },
          }, { clearFeedback: false });
        }
        return;
      }
      if (!sceneLifecycle.isCurrent(operation)) return;
    }
    state.committing = true;
    state.session = updateSpellPanelSession(state.session, {
      commitState: { state: "committing" },
      feedback: { state: "loading", message: "Applicazione in corso…" },
    });
    state.revision += 1;
    render();
    const caster = state.casters.find((item) => item.id === state.session.casterId);
    const result = await executeSpellUnifiedLifecycle({
      contract: state.contract,
      session: state.session,
        runtime: {
          sceneEpoch: operation.epoch,
          sceneIdentity: ownerSceneContext?.sceneIdentity || null,
          isCurrent: () => sceneLifecycle.isCurrent(operation),
          spell: getSpellDefinition(state.contract?.spell?.id),
          casterName: caster?.name || "",
          getAppliedAt: () => provider.getAppliedAt?.(),
          resolveActiveConcentration: ({ casterId, spell }) =>
            provider.getActiveConcentration?.(casterId, spell),
          ...(runtimeOverrides.lifecycleExecutor
            ? { executor: runtimeOverrides.lifecycleExecutor }
            : {}),
      },
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    state.committing = false;
    if (result.status === SPELL_UNIFIED_LIFECYCLE_STATUS.COMMITTED) {
      const hasUndo = result.undoAvailable === true && !!result.historyEntryId;
      state.session = updateSpellPanelSession(state.session, {
        commitState: {
          state: "committed",
          activationId: result.historyEntryId || null,
        },
        undoState: {
          state: hasUndo ? "available" : "unavailable",
          available: hasUndo,
          activationId: result.historyEntryId || null,
        },
        feedback: {
          state: "success",
          message: "Incantesimo applicato.",
        },
      });
      await refreshScene();
      return;
    }
    state.session = updateSpellPanelSession(state.session, {
      commitState: {
        state: "failed",
        error: messageForResult(result),
      },
      feedback: {
        state: "error",
        message: messageForResult(result),
      },
    });
    state.revision += 1;
    render();
  };

  const callbacks = {
    onReference: (spellId) => {
      if (!String(spellId || "").trim()) return;
      const openReference = runtimeOverrides.openReferencePopover || openReferencePopover;
      void Promise.resolve(openReference({ tab: "spells", entry: spellId })).catch((error) => {
        patchSession({
          feedback: {
            state: "error",
            message: "Il riferimento dell'incantesimo non è disponibile.",
          },
        }, { clearFeedback: false });
        console.warn("[spell-unified-panel] reference:", error?.message || error);
      });
    },
    onQueryChange: (query) => {
      state.catalogState = { ...state.catalogState, query, activeIndex: 0, expanded: true };
      state.focusCatalog = true;
      render();
    },
    onActiveIndexChange: (activeIndex) => {
      state.catalogState = { ...state.catalogState, activeIndex, expanded: true };
      state.focusCatalog = true;
      render();
    },
    onSelect: async (spellKey) => {
      const nextContract = buildContract(spellKey);
      if (!nextContract) {
        patchSession({
          feedback: {
            state: "error",
            message: "L'incantesimo selezionato non ha un contratto disponibile.",
          },
        }, { clearFeedback: false });
        return;
      }
      state.contract = nextContract;
      state.session = changeSpellPanelSpell(state.session, nextContract, {
        validCasterIds: validCasterIds(),
        validSlotLevels: slotOptions(nextContract),
      });
      state.catalogState = { ...state.catalogState, expanded: false, query: "" };
      ++targetingSelectionSequence;
      provider.clearTargetingReference?.();
      await clearSelection();
      updateEligibility();
      render();
    },
    onEscape: () => {
      state.catalogState = { ...state.catalogState, expanded: false };
      state.focusCatalog = true;
      render();
    },
    onToggle: () => {
      state.catalogState = { ...state.catalogState, expanded: !state.catalogState.expanded };
      state.focusCatalog = true;
      render();
    },
    onFilterChange: (filter) => {
      state.catalogState = { ...state.catalogState, filter, activeIndex: 0, expanded: true };
      state.focusCatalog = true;
      render();
    },
    onCasterChange: async (casterId) => {
      const isArea = usesPersistentCastAdapter();
      ++targetingSelectionSequence;
      provider.clearTargetingReference?.();
      patchSession({
        casterId,
        ...(isArea ? {
          placement: null,
          targetIds: [],
          primaryTargetId: "",
          outcomes: {},
          targetContext: {},
        } : {}),
      });
      const concentrations = await provider.getCasterConcentrations?.(casterId) || {};
      state.concentrationSummary = concentrationSummary(concentrations);
      render();
    },
    onSlotChange: (value) => {
      const slotLevel = numeric(value);
      const nextContract = buildContract(state.contract.spell.id, {
        phase: state.session.phase,
        actionId: state.session.activeActionId,
        variant: state.session.variant,
        slotLevel,
        castContext: { ...state.session.castContext, slotLevel },
      });
      state.contract = nextContract;
      patchSession({ slotLevel, castContext: { slotLevel } });
    },
    onDurationChange: (value) => patchSession({ durationTurns: numeric(value) }),
    onCompositionChange: (sizeId, value) => {
      const key = String(state.contract?.presentation?.composition?.key || "composition").trim();
      const current = state.session.castContext?.[key];
      const counts = current?.counts && typeof current.counts === "object"
        ? current.counts
        : {};
      patchSession({
        castContext: {
          [key]: {
            ...(current && typeof current === "object" ? current : {}),
            counts: {
              ...counts,
              [sizeId]: Math.max(0, Math.floor(Number(value) || 0)),
            },
          },
        },
      });
    },
    onAutomationChange: (enabled) => patchSession({ applyAutomatedConditions: enabled }),
    onPhaseChange: async (phase) => {
      const nextContract = buildContract(state.contract.spell.id, { phase });
      ++targetingSelectionSequence;
      provider.clearTargetingReference?.();
      state.session = changeSpellPanelPhase(state.session, nextContract, phase, {
        validCasterIds: validCasterIds(),
        validSlotLevels: slotOptions(nextContract),
      });
      state.contract = nextContract;
      await clearSelection();
      updateEligibility();
      render();
    },
    onVariantChange: async (variant) => {
      const nextContract = buildContract(state.contract.spell.id, {
        phase: state.session.phase,
        variant,
      });
      ++targetingSelectionSequence;
      provider.clearTargetingReference?.();
      state.session = changeSpellPanelVariant(
        state.session,
        nextContract,
        variant,
        {
          validCasterIds: validCasterIds(),
          validSlotLevels: slotOptions(nextContract),
        },
      );
      state.contract = nextContract;
      await clearSelection();
      updateEligibility();
      render();
    },
    onTargetToggle: async (key, checked) => {
      if (state.session.placement?.targetLocked === true) return;
      if (usesPrimarySecondarySelection()) {
        const targetIds = new Set(state.session.targetIds || []);
        if (checked) targetIds.add(key);
        else targetIds.delete(key);
        await applyPrimarySecondarySelection([...targetIds]);
        return;
      }
      const targetIds = new Set(state.session.targetIds || []);
      if (checked) targetIds.add(key);
      else targetIds.delete(key);
      const nextIds = uniqueIds([...targetIds]);
      const outcomes = { ...(state.session.outcomes || {}) };
      if (!checked) delete outcomes[key];
      const targetContext = { ...(state.session.targetContext || {}) };
      if (!checked) delete targetContext[key];
      patchSession({
        targetIds: nextIds,
        primaryTargetId: nextIds.includes(state.session.primaryTargetId)
          ? state.session.primaryTargetId
          : "",
        outcomes,
        targetContext,
      });
      await writeSelection(nextIds);
    },
    onTargetNameFilter: (name) => {
      state.targetFilters = { ...state.targetFilters, name };
      render();
    },
    onTargetFactionToggle: (faction) => {
      const factions = new Set(state.targetFilters.factions || []);
      if (factions.has(faction)) factions.delete(faction);
      else factions.add(faction);
      state.targetFilters = {
        ...state.targetFilters,
        factions: [...factions],
      };
      render();
    },
    onPrimaryTargetChange: (primaryTargetId) => patchSession({ primaryTargetId }),
    onPrimaryReset: async () => {
      if (!usesPrimarySecondarySelection()) return;
      ++targetingSelectionSequence;
      provider.clearTargetingReference?.();
      patchSession({
        targetIds: [],
        primaryTargetId: "",
        outcomes: {},
        targetContext: {},
      });
      await writeSelection([]);
    },
    onOutcomeChange: async (key, value) => {
      const candidate = state.model?.targets?.candidates?.find((entry) => entry.key === key);
      if (!candidate || candidate.eligible === false
        || (candidate.disabled && candidate.selected !== true)) return;
      const wasSelected = state.session.targetIds.includes(key);
      if (usesPrimarySecondarySelection() && !wasSelected) {
        await applyPrimarySecondarySelection([...state.session.targetIds, key]);
        if (!state.session.targetIds.includes(key)) return;
      }
      const targetIds = uniqueIds([...(state.session.targetIds || []), key]);
      if (state.model?.targets?.outcomes?.mode === "attack") {
        patchSession({
          targetIds,
          attackOutcome: value,
        });
        if (!wasSelected) await writeSelection(targetIds);
        return;
      }
      patchSession({
        targetIds,
        outcomes: { ...state.session.outcomes, [key]: value },
      });
      if (!wasSelected) await writeSelection(targetIds);
    },
    onOutcomeBulkChange: (value) => {
      const selectedIds = uniqueIds(state.session.targetIds || []);
      if (!selectedIds.length) return;
      if (state.model?.targets?.outcomes?.mode === "attack") {
        patchSession({ attackOutcome: value });
        return;
      }
      patchSession({
        outcomes: Object.fromEntries(selectedIds.map((key) => [key, value])),
      });
    },
    onTargetContextChange: (targetId, field, value) => patchSession({
      targetContext: {
        ...state.session.targetContext,
        [targetId]: {
          ...(state.session.targetContext?.[targetId] || {}),
          [field]: value,
        },
      },
    }),
    onPlacement: () => void startPlacement(),
    onPlacementConfirm: () => void sendPlacementControl("confirm"),
    onPlacementCancel: () => {
      const requestIds = pendingPlacementRequests.size
        ? [...pendingPlacementRequests]
        : [state.session?.placement?.requestId].filter(Boolean);
      void Promise.all(requestIds.map((requestId) => (
        cancelSpellAreaPlacementRequest(requestId, {
          broadcast: runtimeOverrides.broadcast || OBR.broadcast,
        }).catch(() => false)
      )));
    },
    onPlacementUnlock: () => {
      if (state.committing || !usesPersistentCastAdapter()) return;
      patchSession({
        placement: null,
        targetIds: [],
        primaryTargetId: "",
        outcomes: {},
        targetContext: {},
        commitState: { state: "idle" },
        feedback: {
          state: "info",
          message: "Correzione: ripeti il posizionamento dell'area.",
        },
      }, { clearFeedback: false });
    },
    onActiveActionChange: async (selection) => {
      if (selection && typeof selection === "object" && selection.instanceId) {
        const instanceId = String(selection.instanceId || "").trim();
        const actionId = String(selection.actionId || "").trim();
        const overview = state.activeOverview.find((entry) => (
          String(entry?.instanceId || "").trim() === instanceId
        ));
        const action = (Array.isArray(overview?.actions) ? overview.actions : [])
          .find((entry) => String(entry?.id || "").trim() === actionId);
        if (!overview || !actionId || !action) return;
        const context = overview.context || overview;
        const spellId = String(context.spellId || state.contract?.spell?.id || "").trim();
        const phase = String(context.castContext?.phase || state.session.phase || "cast").trim();
        const slotLevel = numeric(context.castContext?.slotLevel);
        const nextContract = buildContract(spellId, {
          phase,
          actionId: action.type === "resolve" ? "" : actionId,
          slotLevel,
        });
        if (!nextContract) return;
        state.contract = nextContract;
        state.session = updateSpellPanelSession(state.session, {
          spellId: nextContract.spell.id,
          phase: nextContract.presentation.phase.selected,
          activeInstanceId: instanceId,
          activeActionId: actionId,
          activeActionState: {
            state: "selected",
            instanceId,
            actionId,
            choiceValue: String(selection.choiceValue || "").trim(),
          },
          casterId: firstValidCaster(state.casters, context.casterId || state.session.casterId),
          ...(slotLevel === null ? {} : {
            slotLevel,
            castContext: { ...state.session.castContext, slotLevel },
          }),
          variant: "",
          targetIds: [],
          primaryTargetId: "",
          outcomes: {},
          targetContext: {},
          placement: null,
          feedback: { state: "idle" },
          commitState: { state: "idle" },
        });
        await clearSelection();
        updateEligibility();
        state.revision += 1;
        render();
        return;
      }
      const actionId = String(selection || "").trim();
      const nextContract = buildContract(state.contract.spell.id, {
        phase: state.session.phase,
        actionId,
        variant: "",
      });
      state.session = changeSpellPanelActiveAction(
        state.session,
        nextContract,
        actionId,
        {
          validCasterIds: validCasterIds(),
          validSlotLevels: slotOptions(nextContract),
        },
      );
      state.contract = nextContract;
      await clearSelection();
      updateEligibility();
      render();
    },
    onZoneTrigger: async () => {
      const currentTrigger = state.session.triggerRuntime;
      const pending = await provider.getPendingZoneTriggers?.({
        spellId: state.contract?.spell?.id,
        casterId: state.session.casterId,
        activationId: currentTrigger?.activationId || currentTrigger?.id || "",
      }) || [];
      const activation = pending[0] || null;
      if (!activation) {
        patchSession({
          triggerRuntime: null,
          placement: null,
          targetIds: [],
          primaryTargetId: "",
          outcomes: {},
          targetContext: {},
          feedback: {
            state: "error",
            message: "Nessuna attivazione della zona è più disponibile.",
          },
        }, { clearFeedback: false });
        return;
      }
      const targetIds = uniqueIds(activation.targetIds);
      patchSession({
        casterId: activation.casterId || state.session.casterId,
        variant: activation.ruleChoice || state.session.variant,
        targetIds,
        primaryTargetId: "",
        outcomes: {},
        targetContext: {},
        placement: {
          state: "confirmed",
          status: "confirmed",
          policy: state.contract?.presentation?.placement?.policy || null,
          ruleId: activation.ruleId || state.contract?.presentation?.placement?.ruleId || null,
          spellId: state.contract?.spell?.id || null,
          casterId: activation.casterId || state.session.casterId || null,
          confirmed: true,
          targetLocked: true,
          targetIds,
          preview: activation.preview || activation.previewSnapshot || null,
        },
        triggerRuntime: activation,
        feedback: {
          state: "info",
          message: [
            `${activation.label || "Trigger della zona"}: completa gli esiti e risolvi l'attivazione.`,
            activation.damage?.dice
              ? `Danno suggerito: ${activation.damage.dice}${activation.damage.type ? ` ${activation.damage.type}` : ""}.`
              : "",
          ].filter(Boolean).join(" "),
        },
      }, { clearFeedback: false });
    },
    onHpChange: (field, value) => patchSession({
      hpValues: { ...state.session.hpValues, [field]: numeric(value) },
    }),
    onBoardTokenUpdate: (payload) => void updateBoardToken(payload),
    onBoardTokenRecreate: (overview) => void recreateBoardToken(overview),
    onActiveTerminate: (overview) => void terminateActiveSpell(overview),
    onCancel: async () => {
      if (!sceneAvailable()) return;
      if (state.session?.activeActionState?.state === "opened") {
        const operation = captureSceneOperation("spell-panel-popup-cancel");
        if (!sceneLifecycle.isCurrent(operation)) return;
        await closeActiveResolutionPopover();
        if (!sceneLifecycle.isCurrent(operation)) return;
        activePopupOperation = null;
        const { overview } = activeActionForSession();
        patchSession({
          activeActionState: {
            state: "selected",
            instanceId: overview?.instanceId || state.session.activeInstanceId,
            actionId: state.session.activeActionId,
          },
          commitState: { state: "idle" },
          feedback: { state: "info", message: "Risoluzione annullata; nessuna modifica eseguita." },
        }, { clearFeedback: false });
        return;
      }
      const placementState = String(state.session?.placement?.state || "").trim();
      const placementRequestIds = pendingPlacementRequests.size
        ? [...pendingPlacementRequests]
        : ["pending", "placing", "review"].includes(placementState)
          ? [state.session?.placement?.requestId].filter(Boolean)
          : [];
      if (placementRequestIds.length) {
        await Promise.all(placementRequestIds.map((requestId) => (
          cancelSpellAreaPlacementRequest(requestId, {
            broadcast: runtimeOverrides.broadcast || OBR.broadcast,
          }).catch(() => false)
        )));
        return;
      }
      resetConfiguration();
    },
    onUndo: () => void undo(),
    onPrimaryAction: (actionId) => {
      if (actionId === "place") void startPlacement();
      else if (actionId === "apply" || actionId === "prepare") void commit();
      else if (actionId === "resolve-active-action") void executeActiveAction();
      else if (state.model) focusFirstInvalid(state.model);
    },
  };

  const load = async () => {
    if (!sceneAvailable()) return false;
    try {
      await refreshScene({ initial: true });
      if (!sceneAvailable()) return false;
      const selectedSceneIds = await provider.getSelection?.();
      if (!sceneAvailable()) return false;
      const selectedIds = targetIdsForCandidates(
        selectedSceneIds,
        state.targetCandidates,
      );
      if (selectedIds.length && !state.session.targetIds.length) {
        patchSession({ targetIds: selectedIds });
      }
      if (spellUnifiedPanelShouldAutoStartPlacement(route)) {
        await startPlacement();
      }
      return true;
    } catch (error) {
      if (!sceneAvailable()) return false;
      state.loading = false;
      state.session = updateSpellPanelSession(state.session, {
        feedback: {
          state: "error",
          message: "Scena non disponibile. Riprova dal pannello Spells.",
        },
      });
      render();
      console.warn("[spell-unified-panel] load:", error?.message || error);
    }
  };

  unsubscribeSceneLifecycle = sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      resetSceneBaseline("Scena cambiata: riapri il pannello per una nuova baseline.");
      return;
    }
    if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      resetSceneBaseline("Nuova scena pronta: seleziona di nuovo caster e bersagli.", { ready: true });
      void load();
    }
  });
  sceneLifecycle.registerSceneCleanup(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  });

  unsubscribeSelection = provider.onSelectionChange?.((ids) => {
    if (selectionWriteDepth > 0) return;
    if (usesPrimarySecondarySelection()) void applyPrimarySecondarySelection(ids);
    else applySelection(ids);
  });
  unsubscribeItems = provider.onSceneItemsChange?.(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshScene().catch((error) => {
        console.warn("[spell-unified-panel] scene refresh:", error?.message || error);
      });
    }, 80);
  });
  const popupBroadcast = runtimeOverrides.broadcast || OBR.broadcast;
  unsubscribePopup = popupBroadcast?.onMessage?.(
    SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
    (event) => void handlePopupResult(event),
  ) || null;
  globalThis.addEventListener?.("beforeunload", () => {
    void destroy();
  }, { once: true });

  documentRef.getElementById("spell-unified-close")?.addEventListener("click", () => {
    void destroy().finally(() => {
      void OBR.broadcast.sendMessage(
        TOGGLE_CHANNEL,
        { type: "closed", id: MODAL_ID },
        { destination: "LOCAL" },
      ).catch(() => {});
      void OBR.popover.close(MODAL_ID).catch(() => {});
    });
  });
  updateEligibility();
  render();
  void sceneLifecycle.mount().then(() => load());
  return { state, render, refreshScene: load, destroy };
}

function start() {
  if (typeof document !== "undefined") bootSpellUnifiedPanel(document);
}

if (typeof document !== "undefined") {
  if (typeof OBR?.onReady === "function") OBR.onReady(start);
  else start();
}
