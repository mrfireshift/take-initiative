// One active action of a spell instance, outside the spell panel: the ⚡ of a pill (spell-pill-actions.js) and the
// attack consoles' Mirror Image (lotto C). The same overview and executor as the panel, so the same commands and
// History entries.
import OBR from "@owlbear-rodeo/sdk";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { lazyModule } from "./lazyModule.js";

const loadSceneProvider = lazyModule(() => import("./spellUnifiedPanelSceneProvider.js"));
const loadActiveAdapter = lazyModule(() => import("./spellUnifiedActiveAdapter.js"));
const loadEffectsMutations = lazyModule(() => import("./effectsMutations.js"));

const text = (value) => String(value ?? "").trim();

export async function loadSpellInstanceOverview(instanceId, { obr = OBR } = {}) {
  const { getSpellOverviewSnapshot } = await loadSceneProvider();
  const snapshot = await getSpellOverviewSnapshot(obr);
  return snapshot.find((entry) => text(entry?.instanceId || entry?.context?.instanceId) === text(instanceId)) || null;
}

// A resolution popup (a heal, a save) the action opens, where the panel would open it.
export async function openSpellActionResolutionPopover(request, { obr = OBR } = {}) {
  await obr.popover.open({
    id: request.id,
    url: request.url,
    width: request.width,
    height: request.height,
    anchorReference: "POSITION",
    anchorPosition: { left: 60, top: 60 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 8,
    hidePaper: true,
  });
}

// status: "executed" (historyEntryId, undoAvailable), "popup-opened", "rejected" or "failed" (errors), "missing".
export async function runSpellInstanceAction({
  obr = OBR,
  overview = null,
  instanceId = "",
  actionId = "",
  selectedTargetIds = [],
  operation = null,
  isCurrent = () => true,
} = {}) {
  const liveOverview = overview || await loadSpellInstanceOverview(instanceId, { obr });
  const action = (liveOverview?.actions || []).find((entry) => text(entry?.id) === text(actionId));
  if (!liveOverview || !action) return { status: "missing", errors: [{ message: "L'incantesimo non è più attivo." }] };
  const [{ executeSpellUnifiedActiveAction, buildSpellUnifiedActivePopoverRequest,
    buildSpellUnifiedPreparedPopoverRequest }, { getEffectsMutationSceneContext }] = await Promise.all([
    loadActiveAdapter(), loadEffectsMutations(),
  ]);
  const context = liveOverview.context || liveOverview;
  const liveSceneEpoch = currentSceneEpoch();
  const captured = context.sceneEpoch;
  const capturedSceneEpoch = captured !== null && captured !== undefined && captured !== ""
    && Number.isInteger(Number(captured)) ? Number(captured) : null;
  const commandId = text(operation?.operationId) || `spell-instance-action:${Date.now().toString(36)}`;
  const result = await executeSpellUnifiedActiveAction({
    overview: liveOverview,
    action,
    actionId: text(actionId),
    selectedTargetIds,
    choiceValue: context.castContext?.choice || "",
    sceneEpoch: capturedSceneEpoch ?? liveSceneEpoch,
    currentSceneEpoch: liveSceneEpoch,
    turnKey: context.turnKey || context.appliedAt?.turnKey || "",
    revision: context.revision,
    runtime: {
      sceneEpoch: operation?.epoch ?? liveSceneEpoch,
      sceneIdentity: null,
      commandId,
      isCurrent,
      getSceneContext: () => getEffectsMutationSceneContext({ commandId }),
      openActiveResolution: (payload) => openSpellActionResolutionPopover(buildSpellUnifiedActivePopoverRequest(payload), { obr }),
      openPreparedResolution: (entry) => openSpellActionResolutionPopover(buildSpellUnifiedPreparedPopoverRequest(entry), { obr }),
    },
  });
  return { ...result, action };
}

// Undo goes through the existing History, only for the latest entry (same rule as the attack consoles).
export async function undoSpellInstanceAction(entryId, { sceneEpoch = currentSceneEpoch() } = {}) {
  const [{ getHistoryEntries, undoHistoryThrough }, { HISTORY_UNDO_OUTCOME, normalizeHistoryUndoResult }] = await Promise.all([
    import("./history.js"), import("./historyUndoResultCore.js"),
  ]);
  const entries = await getHistoryEntries();
  if (entries[entries.length - 1]?.id !== entryId) {
    return { ok: false, message: "Sono presenti modifiche successive: usa la Cronologia." };
  }
  const outcome = normalizeHistoryUndoResult(await undoHistoryThrough(entryId, { sceneEpoch }));
  return outcome.outcome === HISTORY_UNDO_OUTCOME.COMMITTED
    ? { ok: true }
    : { ok: false, message: "Annullamento non applicato: verifica la Cronologia." };
}
