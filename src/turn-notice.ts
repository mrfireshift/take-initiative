import OBR from "@owlbear-rodeo/sdk";
import { ID, RUNTIME_CACHE_CLEANUP_CHANNEL } from "./constants.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import {
  planZoneTriggerNoticeDelivery,
  shouldClearZoneNoticeAtTurn,
  zoneTriggerNoticeDetail,
  zoneTriggerNoticesFromActivation,
} from "./zoneTriggerNoticeCore.js";
import {
  mergeSaveReminderNoticeBatch,
  pruneEffectSaveReminderNoticeBatch,
  pruneZoneReminderNoticeBatch,
  saveReminderNoticeBatchPresentation,
} from "./saveReminderNoticeCore.js";
import { effectSaveReminderNoticeFromHistoryReplay } from "./effectSaveReminderCore.js";
import {
  REMINDER_OUTCOMES,
  normalizeReminderResolution,
  reminderResolutionNeedsDamage,
  reminderResolutionOutcomeNeedsDamage,
} from "./reminderResolutionCore.js";
import {
  resolveTurbineSaveChain,
  turbineSizeFromToken,
} from "./xanatharTurbineCore.js";
import { resolveReminder } from "./reminderResolution.js";
import {
  createSpellAreaPlacementRequestId,
  requestSpellAreaPlacement,
} from "./spellAreaPlacementClient.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { isTurnNoticeForScene } from "./turnNotice.js";
import { projectReminderNotices } from "./options/optionsProjection.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectReminderProjectionPolicy } from "./options/optionsSelectors.js";
import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import { CUSTOM_AURA_META_KEY } from "./customAuraCore.js";

const CHANNEL = ID + "/turn-notice";
const READY_CHANNEL = CHANNEL + "/ready";
const LAYOUT_CHANNEL = CHANNEL + "/layout";
const UI_CHANNEL = CHANNEL + "/ui";
const CONTROL_CHANNEL = CHANNEL + "/control";
const AUTO_CLOSE_MS = 4500;
const ZONE_AUTO_CLOSE_MS = 6500;
const SAVE_REMINDER_AGGREGATION_MS = 16;
const FADE_MS = 220;
const ATTITUDES = new Set(["pc", "ally", "enemy", "neutral"]);

type TurnNotice = {
  currentName: string;
  nextName: string;
  currentPortrait: string;
  currentAttitude: string;
  round: number;
  noticeId: number;
  turnKey: string;
  sceneEpoch: number;
};

type ZoneNoticeTarget = {
  id: string;
  name: string;
  portrait: string;
};

type ZoneTriggerNotice = {
  activationId: string;
  turnKey?: string;
  timing?: "turn-start" | "turn-end" | "damage" | "enter" | "leave";
  spellName: string;
  spellId?: string;
  label: string;
  failureEffect?: string;
  dc?: number;
  casterId?: string;
  casterName?: string;
  sourceId?: string;
  sourceName?: string;
  targets: ZoneNoticeTarget[];
  kind?: "zone" | "zone-effect" | "effect-save" | "effect-reminder";
  eyebrow?: string;
  instruction?: string;
  resolution?: any;
};

function normalizeNotice(parsed: any): TurnNotice | null {
  const currentName = String(parsed?.currentName || "").trim().slice(0, 100);
  const nextName = String(parsed?.nextName || "").trim().slice(0, 100);
  const currentPortrait = String(parsed?.currentPortrait || "").trim().slice(0, 2048);
  const attitude = String(parsed?.currentAttitude || "neutral").trim().toLowerCase();
  if (!currentName) return null;
  return {
    currentName,
    nextName: nextName || "Nessuno",
    currentPortrait,
    currentAttitude: ATTITUDES.has(attitude) ? attitude : "neutral",
    round: Math.max(1, Math.floor(Number(parsed?.round) || 1)),
    noticeId: Math.max(0, Math.floor(Number(parsed?.noticeId) || 0)),
    turnKey: String(parsed?.turnKey || "").trim().slice(0, 300),
    sceneEpoch: Math.max(0, Math.floor(Number(parsed?.sceneEpoch) || 0)),
  };
}

let currentPanel: HTMLElement | null = null;
let hideTimer = 0;
let currentZonePanel: HTMLElement | null = null;
let zoneHideTimer = 0;
let currentZoneTurnKey = "";
let currentSaveReminderBatch: any = null;
let pendingSaveReminderNotices: ZoneTriggerNotice[] = [];
let saveReminderAggregationTimer = 0;
let lastNoticeId = 0;
const announcedZoneActivationIds = new Set<string>();
const announcedEffectActivationIds = new Set<string>();
let zonePendingBaselineReady = false;
let zonePendingSyncRequested = false;
let zonePendingSyncRunning = false;
let unsubscribeZoneSceneReady: (() => void) | null = null;
let unsubscribeZoneItemChanges: (() => void) | null = null;
let unsubscribeUiBroadcast: (() => void) | null = null;
let unsubscribeTurnNoticeReadyRequest: (() => void) | null = null;
let unsubscribeRuntimeCacheCleanup: (() => void) | null = null;
let noticeSceneEpoch = 0;
let noticeSceneReady = true;
let noticeRole = "PLAYER";
let reminderProjectionPolicy = {
  player: { visibility: "full", showDc: true, showCaster: true },
  popup: true,
  directResolution: "assisted",
};
let unsubscribeOptions: (() => void) | null = null;
let lastNoticeLayoutKey = "";
let noticeLayoutRevision = 0;
const resolutionDrafts = new Map<string, {
  outcome: string;
  damageRoll: string;
  turbineSize: string;
  turbineStrengthOutcome: string;
}>();
const resolutionStatus = new Map<string, string>();
const resolvingActivations = new Set<string>();

const MAX_ANNOUNCED_ACTIVATION_IDS = 512;

function rememberAnnouncementIds(target: Set<string>, ids: Iterable<string>) {
  for (const value of ids || []) {
    const activationId = String(value || "").trim();
    if (activationId) target.add(activationId);
  }
  if (target.size <= MAX_ANNOUNCED_ACTIVATION_IDS) return;
  const recent = [...target].slice(-Math.floor(MAX_ANNOUNCED_ACTIVATION_IDS / 2));
  target.clear();
  for (const activationId of recent) target.add(activationId);
}

function clearRuntimeReminderCaches() {
  announcedZoneActivationIds.clear();
  announcedEffectActivationIds.clear();
  resolutionDrafts.clear();
  resolutionStatus.clear();
  resolvingActivations.clear();
  zonePendingBaselineReady = false;
  clearPendingSaveReminderNotices();
  clearZoneNotice();
}

const RESOLUTION_LABELS: Record<string, string> = {
  [REMINDER_OUTCOMES.PASSED]: "Superato",
  [REMINDER_OUTCOMES.FAILED]: "Fallito",
  apply: "Applica cura",
  ignore: "Ignora",
};
const RESOLUTION_BUTTON_OUTCOMES = [
  REMINDER_OUTCOMES.PASSED,
  REMINDER_OUTCOMES.FAILED,
] as const;

function announceNoticeLayout({ force = false } = {}) {
  const hasTurnNotice = !!currentPanel;
  const hasPendingSaveReminder = pendingSaveReminderNotices.length > 0 || saveReminderAggregationTimer !== 0;
  const hasZoneNotice = !!currentZonePanel || hasPendingSaveReminder;
  const fallbackHeight = !hasTurnNotice && !hasZoneNotice
    ? 1
    : hasTurnNotice && hasZoneNotice
      ? 232
      : hasZoneNotice
        ? 158
        : 122;
  const stack = document.getElementById("notice-stack");
  const measuredHeight = Number(stack?.scrollHeight || 0);
  const height = hasTurnNotice || hasZoneNotice
    ? Math.max(
      1,
      window.innerWidth > 100 && measuredHeight > 1
        ? Math.ceil(measuredHeight)
        : fallbackHeight,
    )
    : 1;
  const key = `${hasTurnNotice ? 1 : 0}:${hasZoneNotice ? 1 : 0}:${height}`;
  if (!force && key === lastNoticeLayoutKey) return;
  lastNoticeLayoutKey = key;
  const layoutRevision = ++noticeLayoutRevision;
  void OBR.broadcast.sendMessage(
    LAYOUT_CHANNEL,
    {
      type: "turn-notice-layout",
      visible: hasTurnNotice || hasZoneNotice,
      height,
      layoutRevision,
    },
    { destination: "LOCAL" },
  ).catch(() => {});
}

window.addEventListener("resize", () => {
  if (!currentPanel && !currentZonePanel) return;
  lastNoticeLayoutKey = "";
  window.requestAnimationFrame(() => announceNoticeLayout());
});

function buildPanel(notice: TurnNotice) {
  const panel = document.createElement("section");
  panel.className = "notice";
  panel.dataset.attitude = notice.currentAttitude;
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-label", "Turno di " + notice.currentName + ". Prossimo: " + notice.nextName);

  const portrait = document.createElement("div");
  portrait.className = "portrait";
  const fallback = document.createElement("div");
  fallback.className = "portrait-fallback";
  fallback.textContent = notice.currentName.slice(0, 1).toUpperCase() || "?";
  portrait.appendChild(fallback);
  if (notice.currentPortrait) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = notice.currentPortrait;
    image.addEventListener("load", () => fallback.remove());
    image.addEventListener("error", () => image.remove());
    portrait.appendChild(image);
  }

  const copy = document.createElement("div");
  copy.className = "copy";
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Iniziativa";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Turno di " + notice.currentName;
  copy.append(eyebrow, title);

  const roundBadge = document.createElement("div");
  roundBadge.className = "round-badge";
  const roundLabel = document.createElement("span");
  roundLabel.textContent = "ROUND";
  const roundValue = document.createElement("strong");
  roundValue.textContent = String(notice.round);
  roundBadge.append(roundLabel, roundValue);

  const next = document.createElement("div");
  next.className = "next";
  const nextLabel = document.createElement("span");
  nextLabel.textContent = "A seguire";
  const nextName = document.createElement("strong");
  nextName.textContent = notice.nextName;
  next.append(nextLabel, nextName);

  const timer = document.createElement("div");
  timer.className = "timer";
  panel.append(portrait, copy, roundBadge, next, timer);
  return panel;
}

function hideCurrent() {
  if (!currentPanel) return;
  const leaving = currentPanel;
  currentPanel = null;
  announceNoticeLayout();
  leaving.classList.remove("is-visible");
  leaving.classList.add("is-leaving");
  window.setTimeout(() => leaving.remove(), FADE_MS);
}


function requestTurnNoticeHostClose() {
  void OBR.broadcast.sendMessage(
    CONTROL_CHANNEL,
    { type: "close-turn-notice", sceneEpoch: noticeSceneEpoch },
    { destination: "LOCAL" },
  ).catch(() => {});
}

function clearTurnNotice() {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  currentPanel?.remove();
  currentPanel = null;
  document.getElementById("app")?.replaceChildren();
  announceNoticeLayout();
}

function clearZoneNotice() {
  window.clearTimeout(zoneHideTimer);
  zoneHideTimer = 0;
  currentZonePanel?.remove();
  currentZonePanel = null;
  currentZoneTurnKey = "";
  currentSaveReminderBatch = null;
  document.getElementById("zone-app")?.replaceChildren();
  announceNoticeLayout();
}

function clearPendingSaveReminderNotices() {
  window.clearTimeout(saveReminderAggregationTimer);
  saveReminderAggregationTimer = 0;
  pendingSaveReminderNotices = [];
}

function drainPendingSaveReminderNotices() {
  const values = pendingSaveReminderNotices;
  clearPendingSaveReminderNotices();
  return values;
}

function showNotice(raw: any) {
  const app = document.getElementById("app");
  const notice = normalizeNotice(raw);
  if (!app || !notice) return;
  if (notice.noticeId && notice.noticeId <= lastNoticeId) return;
  if (notice.noticeId) lastNoticeId = notice.noticeId;

  pendingSaveReminderNotices = pendingSaveReminderNotices.filter((pending) =>
    !pending.turnKey
    || !notice.turnKey
    || pending.turnKey === notice.turnKey,
  );
  const hasOpenZoneResponse = Array.isArray(currentSaveReminderBatch?.entries)
    && currentSaveReminderBatch.entries.some(reminderRowRequiresResponse);
  if (
    currentZonePanel
    && !hasOpenZoneResponse
    && shouldClearZoneNoticeAtTurn(currentZoneTurnKey, notice.turnKey)
  ) {
    clearZoneNotice();
  }

  window.clearTimeout(hideTimer);
  const previous = currentPanel;
  const nextPanel = buildPanel(notice);
  currentPanel = nextPanel;
  app.appendChild(nextPanel);
  requestAnimationFrame(() => nextPanel.classList.add("is-visible"));
  if (previous) {
    previous.classList.remove("is-visible");
    previous.classList.add("is-leaving");
    window.setTimeout(() => previous.remove(), FADE_MS);
  }
  hideTimer = window.setTimeout(hideCurrent, AUTO_CLOSE_MS);
  announceNoticeLayout({ force: true });
}

function resolutionDraftFor(activationId: string) {
  const current = resolutionDrafts.get(activationId);
  if (current) return current;
  const draft = {
    outcome: "",
    damageRoll: "",
    turbineSize: "",
    turbineStrengthOutcome: "",
  };
  resolutionDrafts.set(activationId, draft);
  return draft;
}

function setResolutionStatus(line: HTMLElement, activationId: string, message: string) {
  resolutionStatus.set(activationId, message);
  line.dataset.resolutionState = message ? "done" : "";
  line.querySelector("[data-resolution-controls]")?.remove();
  const previous = line.querySelector("[data-resolution-status]");
  previous?.remove();
  if (!message) return;
  const status = document.createElement("span");
  status.dataset.resolutionStatus = "1";
  status.textContent = message;
  status.setAttribute("role", "status");
  line.appendChild(status);
}

function resolutionStatusNode(line: HTMLElement, message: string) {
  const previous = line.querySelector("[data-resolution-status]");
  previous?.remove();
  if (!message) return;
  const status = document.createElement("span");
  status.dataset.resolutionStatus = "1";
  status.textContent = message;
  status.setAttribute("role", "alert");
  line.appendChild(status);
}

function dismissResolvedReminder(activationId: string, { zone = false } = {}) {
  // Il sender può avere già accodato un payload precedente alla mutation. Lo
  // dreniamo nella stessa transizione del pannello: lasciarlo al timer
  // produrrebbe un render intermedio con la riga appena risolta duplicata.
  const queued = drainPendingSaveReminderNotices().filter((notice) => (
    String(notice?.activationId || "").trim() !== activationId
  ));
  const entries = Array.isArray(currentSaveReminderBatch?.entries)
    ? currentSaveReminderBatch.entries.filter((entry: any) => (
      String(entry?.activationId || "").trim() !== activationId
    ))
    : [];
  resolutionDrafts.delete(activationId);
  resolutionStatus.delete(activationId);
  // Manteniamo l'ID annunciato anche dopo il consume: un broadcast già in volo
  // può ancora arrivare dal transport host. Il sync canonico/il payload di Undo
  // usa rearmActivationIds per riaprire esplicitamente lo stesso ID.
  if (!zone) void zone;
  const currentBatch = entries.length
    ? mergeSaveReminderNoticeBatch(null, entries, {
      preserveCurrentEntries: entries.some(reminderRowRequiresResponse),
    })
    : null;
  const nextBatch = mergeSaveReminderNoticeBatch(currentBatch, queued, {
    preserveCurrentEntries: Array.isArray(currentBatch?.entries)
      && currentBatch.entries.some(reminderRowRequiresResponse),
  });
  if (!nextBatch) {
    clearZoneNotice();
    return;
  }
  currentSaveReminderBatch = nextBatch;
  if (!nextBatch || !renderSaveReminderBatch(nextBatch)) {
    currentSaveReminderBatch = null;
    clearZoneNotice();
    return;
  }
}

function historyReplayForReminder(row: any) {
  const resolution = row?.resolution && typeof row.resolution === "object"
    ? row.resolution
    : null;
  const activation = resolution?.activation && typeof resolution.activation === "object"
    ? resolution.activation
    : null;
  const activationId = String(row?.activationId || activation?.activationId || "").trim();
  const target = Array.isArray(row?.targets) ? row.targets[0] : null;
  const targetId = String(
    target?.id
      || resolution?.target?.id
      || "",
  ).trim();
  const compactResolution = normalizeReminderResolution(resolution, {
    targetId,
    activation,
  });
  if (!activationId || !targetId || !resolution || !activation || !compactResolution) return null;
  const owner = activation.kind === "zone"
    ? activation.metadataKey === SPELL_AURA_META_KEY
      ? "spell-aura"
      : activation.metadataKey === CUSTOM_AURA_META_KEY
        ? "custom-aura"
        : "static-zone"
    : "effect-save";
  const descriptor = {
    activationId,
    targetId,
    ...(String(resolution?.effect?.instanceId || "").trim()
      ? { instanceId: String(resolution.effect.instanceId).trim().slice(0, 200) }
      : {}),
    ...(String(activation?.zoneItemId || "").trim()
      ? { zoneItemId: String(activation.zoneItemId).trim().slice(0, 200) }
      : {}),
    notice: {
      activationId,
      ...(String(row?.turnKey || "").trim()
        ? { turnKey: String(row.turnKey).trim().slice(0, 300) }
        : {}),
      ...(String(row?.timing || "").trim()
        ? { timing: String(row.timing).trim().slice(0, 40) }
        : {}),
      ...(String(row?.spellName || "").trim()
        ? { spellName: String(row.spellName).trim().slice(0, 120) }
        : {}),
      ...(String(row?.spellId || "").trim()
        ? { spellId: String(row.spellId).trim().slice(0, 200) }
        : {}),
      ...(String(row?.effectName || "").trim()
        ? { effectName: String(row.effectName).trim().slice(0, 120) }
        : {}),
      ...(String(row?.saveLabel || "").trim()
        ? { saveLabel: String(row.saveLabel).trim().slice(0, 160) }
        : {}),
      ...(String(row?.instruction || "").trim()
        ? { instruction: String(row.instruction).trim().slice(0, 320) }
        : {}),
      ...(String(row?.ability || "").trim()
        ? { ability: String(row.ability).trim().slice(0, 20) }
        : {}),
      ...(Number.isFinite(Number(row?.dc)) ? { dc: Number(row.dc) } : {}),
      ...(String(row?.casterId || "").trim()
        ? { casterId: String(row.casterId).trim().slice(0, 200) }
        : {}),
      ...(String(row?.casterName || "").trim()
        ? { casterName: String(row.casterName).trim().slice(0, 100) }
        : {}),
      ...(String(row?.sourceId || "").trim()
        ? { sourceId: String(row.sourceId).trim().slice(0, 200) }
        : {}),
      ...(String(row?.sourceName || "").trim()
        ? { sourceName: String(row.sourceName).trim().slice(0, 100) }
        : {}),
      ...(String(row?.kind || "").trim()
        ? { kind: String(row.kind).trim().slice(0, 40) }
        : {}),
      ...(String(row?.eyebrow || "").trim()
        ? { eyebrow: String(row.eyebrow).trim().slice(0, 80) }
        : {}),
      targets: [{
        id: targetId,
        name: String(target?.name || "Token").trim().slice(0, 100) || "Token",
      }],
       resolution: compactResolution,
    },
  };
  return {
    type: "reminder",
    owner,
    activationId,
    targetId,
    descriptor,
  };
}

function currentEffectSaveReminderActivationIds(batch: any, items: any[]) {
  const current = new Set<string>();
  for (const entry of Array.isArray(batch?.entries) ? batch.entries : []) {
    const activationId = String(entry?.activationId || "").trim();
    if (!activationId
      || (entry?.kind !== "effect-save" && entry?.kind !== "effect-reminder")) {
      continue;
    }
    const replay = historyReplayForReminder(entry);
    // Preserve unknown informational rows: only descriptors understood by the
    // effect-save owner may be invalidated from canonical scene state.
    if (!replay || replay.owner !== "effect-save") {
      current.add(activationId);
      continue;
    }
    if (effectSaveReminderNoticeFromHistoryReplay({ replay, items })) {
      current.add(activationId);
    }
  }
  return current;
}

function isBlinkReturnNotice(row: any) {
  return row?.resolution?.activation?.kind === "spell-turn-boundary"
    && row?.resolution?.activation?.resolutionData?.kind === "blink-return";
}

function buildBlinkReturnResolutionControls(line: HTMLElement, row: any, activationId: string) {
  const controls = document.createElement("div");
  controls.dataset.resolutionControls = "1";
  controls.className = "zone-resolution";

  let requestId = "";
  let requestPromise: Promise<any> | null = null;
  let chosenPosition: { x: number; y: number } | null = null;

  const placeButton = document.createElement("button");
  placeButton.type = "button";
  placeButton.textContent = "Scegli destinazione";
  const status = document.createElement("div");
  status.className = "hint";
  status.hidden = true;

  const setPlacementStatus = (message: string) => {
    status.textContent = message;
    status.hidden = !message;
  };

  const setBusy = (value: boolean) => {
    placeButton.disabled = value;
  };

  const beginPlacement = async () => {
    if (resolvingActivations.has(activationId) || requestPromise) return;
    chosenPosition = null;
    requestId = createSpellAreaPlacementRequestId();
    setBusy(true);
    setPlacementStatus("");
    try {
      requestPromise = requestSpellAreaPlacement({
        ruleId: "blink:return",
        casterId: row.casterId || row.resolution?.activation?.casterId,
        context: {
          pointSelection: true,
          autoConfirmPoint: true,
          directPointSelection: true,
          snapToItemCenter: true,
        },
        requestId,
      }, {
        broadcast: OBR.broadcast,
        windowRef: window,
      });
      const result = await requestPromise;
      if (result?.status !== "confirmed" || !result.preview) {
        setPlacementStatus(result?.status === "cancelled"
          ? "Scelta dello spazio annullata."
          : "Spazio di ritorno non confermato.");
        return;
      }
      const candidate = result.preview.position || result.preview.start;
      const x = Number(candidate?.x);
      const y = Number(candidate?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        setPlacementStatus("Il punto scelto non è valido.");
        return;
      }
      chosenPosition = { x, y };
      await resolve();
    } catch (error) {
      setPlacementStatus(String(error?.message || "Scelta dello spazio non riuscita."));
    } finally {
      requestPromise = null;
      requestId = "";
      setBusy(false);
    }
  };

  const resolve = async () => {
    if (!chosenPosition || resolvingActivations.has(activationId)) return;
    resolvingActivations.add(activationId);
    for (const button of Array.from(controls.querySelectorAll("button"))) {
      (button as HTMLButtonElement).disabled = true;
    }
    resolutionStatusNode(line, "Risoluzione in corso…");
    const resolution = {
      ...row.resolution,
      activation: {
        ...(row.resolution?.activation || {}),
        resolutionData: {
          ...(row.resolution?.activation?.resolutionData || {}),
          kind: "blink-return",
          returnPosition: chosenPosition,
        },
      },
    };
    try {
      const result = await resolveReminder({
        notice: {
          activationId,
          spellName: row.spellName,
          ...(row.spellId ? { spellId: row.spellId } : {}),
          ...((row.casterId || row.resolution?.activation?.casterId)
            ? { casterId: row.casterId || row.resolution.activation.casterId }
            : {}),
          casterName: row.casterName || row.resolution?.activation?.casterName,
          ...(row.sourceId ? { sourceId: row.sourceId } : {}),
          ...(row.sourceName ? { sourceName: row.sourceName } : {}),
          kind: row.kind,
          targets: row.targets || [],
          resolution,
        },
        outcome: REMINDER_OUTCOMES.PASSED,
        sceneEpoch: currentSceneEpoch(),
        historyReplay: historyReplayForReminder(row),
      });
      if (result.status === "applied" || result.status === "already-resolved") {
        setResolutionStatus(line, activationId, result.message || "Ritorno completato.");
        dismissResolvedReminder(activationId);
      } else {
        resolutionStatusNode(line, result.message || "Ritorno non più corrente.");
        for (const button of Array.from(controls.querySelectorAll("button"))) {
          (button as HTMLButtonElement).disabled = false;
        }
      }
    } catch (error) {
      resolutionStatusNode(line, String(error?.message || "Ritorno non riuscito."));
      for (const button of Array.from(controls.querySelectorAll("button"))) {
        (button as HTMLButtonElement).disabled = false;
      }
    } finally {
      resolvingActivations.delete(activationId);
      if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) window.setTimeout(requestPendingZoneNoticeSync, 0);
    }
  };

  placeButton.addEventListener("click", () => void beginPlacement());
  controls.append(placeButton, status);
  line.appendChild(controls);
}

function buildResolutionControls(line: HTMLElement, row: any) {
  if (!reminderRowRequiresResponse(row)) return;
  const activationId = String(row.activationId || "").trim();
  const completed = resolutionStatus.get(activationId);
  if (completed) {
    setResolutionStatus(line, activationId, completed);
    return;
  }
  if (isBlinkReturnNotice(row)) {
    buildBlinkReturnResolutionControls(line, row, activationId);
    return;
  }
  const draft = resolutionDraftFor(activationId);
  const manualHeal = row.resolution?.mode === "manual-heal";
  const manualDamage = row.resolution?.mode === "manual-damage";
  const turbine = row.resolution?.activation?.resolutionData?.turbine === true;
  const controls = document.createElement("div");
  controls.dataset.resolutionControls = "1";
  controls.className = "zone-resolution";

  let damageInput: HTMLInputElement | null = null;
  if (reminderResolutionNeedsDamage(row.resolution) || manualHeal) {
    const damageLabel = document.createElement("label");
    damageLabel.className = "zone-resolution-damage";
    damageLabel.textContent = manualHeal ? "Cura" : "Danni";
    damageInput = document.createElement("input");
    damageInput.type = manualDamage ? "text" : "number";
    damageInput.min = "0";
    damageInput.step = "1";
    damageInput.inputMode = "numeric";
    damageInput.value = draft.damageRoll;
    damageInput.placeholder = "0";
    damageInput.setAttribute("aria-label", "Risultato dei dadi");
    damageInput.addEventListener("input", () => {
      draft.damageRoll = damageInput?.value || "";
    });
    damageLabel.appendChild(damageInput);
    controls.appendChild(damageLabel);
  }

  const outcomes = document.createElement("div");
  outcomes.className = "zone-resolution-outcomes";

  const refreshSelection = () => {
    for (const button of Array.from(outcomes.querySelectorAll("button"))) {
      button.classList.toggle("is-selected", button.dataset.outcome === draft.outcome);
    }
  };

  const turbineChain = () => resolveTurbineSaveChain({
    dexOutcome: draft.outcome,
    size: draft.turbineSize,
    strengthOutcome: draft.turbineStrengthOutcome,
  });

  const targetId = String(row?.targets?.[0]?.id || "").trim();
  const turbineSizePromise = turbine
    ? Promise.all([
      targetId ? OBR.scene.items.getItems([targetId]) : Promise.resolve([]),
      OBR.scene?.grid?.getDpi?.().catch?.(() => 150) || Promise.resolve(150),
    ]).then(([items, dpi]) => turbineSizeFromToken({
      item: items?.[0],
      dpi,
    })).catch(() => "")
    : Promise.resolve("");

  const turbineStrengthGroup = document.createElement("div");
  turbineStrengthGroup.className = "zone-resolution-outcomes";
  const turbineStrengthLabel = document.createElement("span");
  turbineStrengthLabel.className = "zone-resolution-damage";
  turbineStrengthLabel.textContent = "TS Forza";
  turbineStrengthGroup.appendChild(turbineStrengthLabel);
  for (const option of [
    { value: "passed", label: "Superato" },
    { value: "failed", label: "Fallito" },
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.turbineStrength = option.value;
    button.textContent = option.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      draft.turbineStrengthOutcome = option.value;
      updateTurbineControls();
      if (draft.outcome) void resolve(draft.outcome);
    });
    turbineStrengthGroup.appendChild(button);
  }

  const updateTurbineControls = () => {
    if (!turbine) {
      turbineStrengthGroup.hidden = true;
      return;
    }
    const failedDex = draft.outcome === REMINDER_OUTCOMES.FAILED;
    turbineStrengthGroup.hidden = !failedDex || draft.turbineSize !== "large-or-smaller";
    for (const button of Array.from(turbineStrengthGroup.querySelectorAll("button"))) {
      button.classList.toggle("is-selected", button.dataset.turbineStrength === draft.turbineStrengthOutcome);
    }
  };

  if (turbine) {
    void turbineSizePromise.then((size) => {
      if (size) draft.turbineSize = size;
      updateTurbineControls();
    });
  }

  const resolve = async (outcome: string) => {
    if (resolvingActivations.has(activationId)) return;
    draft.outcome = outcome;
    refreshSelection();
    if (turbine && !draft.turbineSize) {
      draft.turbineSize = await turbineSizePromise;
    }
    if (turbine && !turbineChain().valid) {
      updateTurbineControls();
      resolutionStatusNode(
        line,
        turbineChain().status === "needs-strength-save"
          ? "Scegli il risultato del TS Forza."
          : "La footprint del bersaglio non è disponibile.",
      );
      return;
    }
    if (
      damageInput
      && outcome !== "ignore"
      && (manualHeal
        ? outcome === "apply"
        : reminderResolutionOutcomeNeedsDamage(row.resolution, outcome))
      && (!damageInput.value.trim() || !Number.isFinite(Number(damageInput.value)))
    ) {
      resolutionStatusNode(line, "Inserisci un risultato dei dadi valido.");
      damageInput.focus();
      return;
    }

    resolvingActivations.add(activationId);
    for (const button of Array.from(controls.querySelectorAll("button, input"))) {
      (button as HTMLButtonElement | HTMLInputElement).disabled = true;
    }
    resolutionStatusNode(line, "Risoluzione in corso…");
    try {
      const result = await resolveReminder({
        notice: {
          activationId,
          spellName: row.spellName,
          ...(row.spellId ? { spellId: row.spellId } : {}),
          ...(row.casterId ? { casterId: row.casterId } : {}),
          casterName: row.casterName,
          ...(row.sourceId ? { sourceId: row.sourceId } : {}),
          ...(row.sourceName ? { sourceName: row.sourceName } : {}),
          ...(row.kind ? { kind: row.kind } : {}),
          targets: row.targets || [],
          resolution: row.resolution,
        },
        outcome: draft.outcome,
        damageRoll: draft.damageRoll,
        ...(turbine ? {
          turbineSize: draft.turbineSize,
          turbineStrengthOutcome: draft.turbineStrengthOutcome,
        } : {}),
        sceneEpoch: currentSceneEpoch(),
        historyReplay: historyReplayForReminder(row),
      });
      if (result.status === "applied" || result.status === "already-resolved") {
        setResolutionStatus(
          line,
          activationId,
          result.message || `Risolto: ${RESOLUTION_LABELS[draft.outcome]}.`,
        );
        dismissResolvedReminder(activationId, {
          zone: row?.resolution?.activation?.kind === "zone",
        });
      } else {
        resolutionStatusNode(line, result.message || "Reminder non più corrente; puoi chiuderlo.");
        for (const button of Array.from(controls.querySelectorAll("button, input"))) {
          (button as HTMLButtonElement | HTMLInputElement).disabled = false;
        }
        refreshSelection();
      }
    } catch (error) {
      resolutionStatusNode(line, String((error as any)?.message || "Risoluzione non riuscita; puoi chiudere il reminder."));
      for (const button of Array.from(controls.querySelectorAll("button, input"))) {
        (button as HTMLButtonElement | HTMLInputElement).disabled = false;
      }
      refreshSelection();
    } finally {
      resolvingActivations.delete(activationId);
      if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) {
        window.setTimeout(requestPendingZoneNoticeSync, 0);
      }
    }
  };

  const outcomeOptions = manualDamage
    ? [{ value: "confirmed", label: "Conferma" }]
    : manualHeal
      ? [{ value: "apply", label: "Applica cura" }, { value: "ignore", label: "Ignora" }]
      : RESOLUTION_BUTTON_OUTCOMES.map((value) => ({
      value,
      label: row.resolution?.choiceLabels?.[value]
        || RESOLUTION_LABELS[value]
        || value,
      }));
  for (const option of outcomeOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.outcome = option.value;
    button.textContent = option.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void resolve(option.value);
    });
    outcomes.appendChild(button);
  }
  controls.append(outcomes);
  if (turbine) controls.append(turbineStrengthGroup);
  updateTurbineControls();
  line.appendChild(controls);
}

function reminderRowRequiresResponse(row: any) {
  return noticeRole === "GM"
    && !!row?.resolution
    && row.resolution?.mode !== "consume"
    && Array.isArray(row.targets)
    && row.targets.length === 1
    && !!String(row.activationId || "").trim();
}

function zoneResponseIdentityKey(entry: any, itemsById: Map<string, any> | null = null) {
  if (!(itemsById instanceof Map)) return "";
  const activation = entry?.resolution?.activation;
  const rootId = String(activation?.zoneItemId || "").trim();
  const instanceId = String(activation?.instanceId || "").trim();
  const metadataKey = String(activation?.metadataKey || "").trim();
  const root = rootId ? itemsById.get(rootId) : null;
  const metadata = metadataKey ? root?.metadata?.[metadataKey] : null;
  if (
    !root
    || !metadata
    || !instanceId
    || String(metadata.instanceId || "").trim() !== instanceId
  ) return "";
  const activationGroupId = String(
    activation?.sourceActivationId
      || activation?.rootActivationId
      || activation?.activationId
      || entry?.activationId
      || "",
  ).trim();
  if (!activationGroupId) return "";
  return `${rootId}\u0000${instanceId}\u0000${activationGroupId}`;
}

function openZoneResponseIds(entries: any[], itemsById: Map<string, any> | null = null) {
  const responseEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry: any) => (
      (entry?.kind === "zone" || entry?.kind === "zone-effect")
      && reminderRowRequiresResponse(entry)
    ));
  if (!(itemsById instanceof Map)) return [];
  const inFlightGroupKeys = new Set(
    responseEntries
      .filter((entry: any) => resolvingActivations.has(String(entry?.activationId || "").trim()))
      .map((entry: any) => zoneResponseIdentityKey(entry, itemsById))
      .filter(Boolean),
  );
  return responseEntries
    .filter((entry: any) => inFlightGroupKeys.has(zoneResponseIdentityKey(entry, itemsById)))
    .map((entry: any) => String(entry?.activationId || "").trim())
    .filter(Boolean);
}

function reminderRowRequiresPersistentDisplay(row: any) {
  return row?.spellId === "prismatic-wall"
    && row.resolution?.mode === "manual-save";
}

function parseReminderRowContent(row: any, primaryTargetName: string = "") {
  const pills: Array<{ text: string; type?: string }> = [];
  let instruction = String(row?.detail || "").trim();

  // 1. TS & CD
  const resSave = row?.resolution?.save;
  if (resSave?.ability) {
    const abilityMap: Record<string, string> = {
      str: "TS FOR",
      dex: "TS DES",
      con: "TS COS",
      int: "TS INT",
      wis: "TS SAG",
      cha: "TS CAR",
    };
    const abKey = String(resSave.ability).toLowerCase();
    const abilityLabel = abilityMap[abKey] || `TS ${abKey.toUpperCase().slice(0, 3)}`;
    pills.push({ text: abilityLabel, type: "save" });
    if (resSave.dc !== undefined && resSave.dc !== null) {
      pills.push({ text: `CD ${resSave.dc}`, type: "dc" });
    }
  } else {
    const tsMatch = instruction.match(/\bTS\s+([\p{L}\p{M}]+)/iu);
    if (tsMatch) {
      const fullAb = tsMatch[1].toLowerCase();
      const abilityMap: Record<string, string> = {
        forza: "TS FOR",
        destrezza: "TS DES",
        costituzione: "TS COS",
        intelligenza: "TS INT",
        saggezza: "TS SAG",
        carisma: "TS CAR",
        str: "TS FOR",
        dex: "TS DES",
        con: "TS COS",
        int: "TS INT",
        wis: "TS SAG",
        cha: "TS CAR",
      };
      pills.push({ text: abilityMap[fullAb] || `TS ${tsMatch[1].slice(0, 3).toUpperCase()}`, type: "save" });
    }
    const cdMatch = instruction.match(/\bCD\s+(\d+)/i);
    if (cdMatch) {
      pills.push({ text: `CD ${cdMatch[1]}`, type: "dc" });
    }
  }

  // 2. Danni / Cura
  const resDamage = row?.resolution?.damage;
  const resHealing = row?.resolution?.healing;
  if (resDamage?.dice) {
    const dType = resDamage.type ? ` ${resDamage.type}` : "";
    pills.push({ text: `${resDamage.dice}${dType}`.trim(), type: "damage" });
    if (resDamage.onSave === "half") {
      pills.push({ text: "Metà se supera" });
    } else if (resDamage.onSave === "none") {
      pills.push({ text: "Nullo se supera" });
    }
  } else if (resHealing?.dice) {
    pills.push({ text: `Cura ${resHealing.dice}`, type: "healing" });
  } else {
    const diceMatch = instruction.match(/(\d+d\d+)(?:\s+danni(?:\s+da)?\s+([\p{L}\p{M}\s]+?))?(?=\s*(?:automatici|se fallito|\.|$))/iu);
    if (diceMatch) {
      const typeStr = diceMatch[2] ? ` ${diceMatch[2].trim()}` : "";
      pills.push({ text: `${diceMatch[1]}${typeStr}`.trim(), type: "damage" });
    }
    if (instruction.includes("automatici")) {
      pills.push({ text: "Automatico" });
    }
  }

  // 3. Condizione / Effetto
  const effect = row?.resolution?.effect;
  if (effect?.label) {
    pills.push({ text: effect.label, type: "condition" });
  } else {
    const condMatch = instruction.match(/(?:—\s*Fallimento:\s*|se fallito:?\s*)([\p{L}\p{M}\s]+?)(?:\.|$)/iu);
    if (condMatch) {
      const cond = condMatch[1].trim();
      const firstWord = cond.split(/\s+/)[0];
      if (firstWord && firstWord.length > 2) {
        pills.push({ text: firstWord, type: "condition" });
      }
    }
  }

  // 4. Pruning accurato dell'istruzione RAW
  // Gestisce correttamente parentesi nidificate come ((1) Cultist) evitando leak di stringhe malformate come "Cultist)"
  instruction = instruction.replace(/^TS\s+[\p{L}\p{M}'’-]+(?:\s+CD\s+\d+)?(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*(?:—|;|:|\.)?\s*/iu, "");
  if (row.casterName) {
    const escapedCaster = String(row.casterName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    instruction = instruction.replace(new RegExp(`\\s*\\(?${escapedCaster}\\)?\\s*`, "gi"), "");
  }
  instruction = instruction.replace(/(?:—\s*)?Fallimento:\s*[^.]+\.?/iu, "");
  instruction = instruction.replace(/;\s*\d+d\d+\s+danni(?:\s+da\s+[\p{L}\p{M}]+)?\s+se\s+fallito\.?/iu, "");
  instruction = instruction.replace(/(?:—\s*)?\d+d\d+\s+danni(?:\s+da\s+[\p{L}\p{M}]+)?\s+se\s+fallito\.?/iu, "");
  instruction = instruction.replace(/^\d+d\d+\s+danni(?:\s+(?:da\s+)?[\p{L}\p{M}]+)?\s+automatici\.?/iu, "");
  const targetNames = [
    primaryTargetName,
    ...(Array.isArray(row?.targets) ? row.targets.map((t: any) => t?.name) : []),
  ].filter(Boolean);
  for (const tName of targetNames) {
    if (tName) {
      const escapedTarget = String(tName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      instruction = instruction.replace(new RegExp(`^${escapedTarget}\\s+`, "iu"), "");
    }
  }
  instruction = instruction.replace(/(?:Dopo il TS Destrezza fallito\s+)?indica il risultato del TS Forza\.?/iu, "");
  instruction = instruction.replace(/^[—;.:,\s]+/, "").trim();

  // Se l'istruzione residua è un frammento isolato con parentesi chiusa o pura punteggiatura, azzerala
  if (/^[—:;,.\s]*$/.test(instruction) || /^[a-zA-Z0-9\s-]+\)\s*$/.test(instruction)) {
    instruction = "";
  }

  return { pills, instruction };
}

function formatTargetIdentity(rawName: string) {
  const prefixMatch = String(rawName || "").match(/^\s*(?:\((\d+)\)|\[(\d+)\]|#(\d+))\s+(.+)$/);
  if (prefixMatch) {
    const num = prefixMatch[1] || prefixMatch[2] || prefixMatch[3];
    const name = prefixMatch[4].trim();
    return { name, index: num };
  }
  const suffixMatch = String(rawName || "").match(/^(.+?)\s*(?:\((\d+)\)|\[(\d+)\]|#(\d+))$/);
  if (suffixMatch) {
    const name = suffixMatch[1].trim();
    const num = suffixMatch[2] || suffixMatch[3] || suffixMatch[4];
    return { name, index: num };
  }
  return { name: String(rawName || "").trim(), index: null };
}

function renderSaveReminderBatch(batch: any) {
  const app = document.getElementById("zone-app");
  const presentation = saveReminderNoticeBatchPresentation(batch);
  if (!app || !presentation) return false;
  const primary = presentation.primaryTarget;
  const isMultiTarget = Array.isArray(batch.targets) && batch.targets.length > 1;
  const panel = document.createElement("section");
  panel.className = "zone-notice";
  panel.dataset.kind = presentation.kind;
  panel.dataset.activationId = batch.activationIds.join(" ");
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-label", presentation.ariaLabel);

  const portrait = document.createElement("div");
  portrait.className = "zone-portrait";
  const fallback = document.createElement("div");
  fallback.className = isMultiTarget ? "zone-portrait-fallback is-aggregate" : "zone-portrait-fallback";
  if (!isMultiTarget) {
    fallback.textContent = primary.name.slice(0, 1).toUpperCase() || "?";
    portrait.appendChild(fallback);
    if (primary.portrait) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = primary.portrait;
      image.addEventListener("load", () => fallback.remove());
      image.addEventListener("error", () => image.remove());
      portrait.appendChild(image);
    }
  } else {
    // Multi-target: nessun portrait individuale arbitrario; indicatore numerico aggregato
    fallback.textContent = String(batch.targets.length);
    portrait.appendChild(fallback);
  }

  const copy = document.createElement("div");
  copy.className = "zone-copy";

  // Eyebrow testuale arancio senza box, con timing secondario
  const eyebrow = document.createElement("div");
  eyebrow.className = "zone-eyebrow";
  const eventText = presentation.eventType || presentation.eyebrow.split(" · ")[0] || "Effetto";
  const timingText = presentation.timing || (presentation.eyebrow.includes(" · ") ? presentation.eyebrow.split(" · ")[1] : "");
  eyebrow.textContent = eventText;
  if (timingText) {
    const timingSpan = document.createElement("span");
    timingSpan.className = "zone-eyebrow-timing";
    timingSpan.textContent = ` · ${timingText}`;
    eyebrow.appendChild(timingSpan);
  }
  copy.appendChild(eyebrow);

  // Target H1 (con indice o compatto ×N per multi-target)
  const title = document.createElement("div");
  title.className = "zone-title";
  const rawTargetName = presentation.targetName || (isMultiTarget ? `${batch.targets.length} bersagli` : primary.name);
  if (isMultiTarget) {
    const names = batch.targets.map((t: any) => formatTargetIdentity(t?.name || "").name);
    const uniqueNames = Array.from(new Set(names));
    const targetBase = uniqueNames.length === 1 ? uniqueNames[0] : null;
    title.textContent = targetBase ? `${targetBase} ×${batch.targets.length}` : `${batch.targets.length} bersagli`;
  } else {
    const { name: cleanTargetName, index: targetIndex } = formatTargetIdentity(rawTargetName);
    title.textContent = cleanTargetName;
    if (targetIndex) {
      const badge = document.createElement("span");
      badge.className = "zone-target-index";
      badge.textContent = `#${targetIndex}`;
      title.appendChild(badge);
    }
  }
  copy.appendChild(title);

  // Spell e Caster / Source separati come sottotitolo con semantica "da [Caster]"
  if (presentation.spellName) {
    const subtitle = document.createElement("div");
    subtitle.className = "zone-subtitle";
    const spellSpan = document.createElement("span");
    spellSpan.className = "zone-spell-name";
    spellSpan.textContent = presentation.spellName;
    subtitle.appendChild(spellSpan);

    if (presentation.casterName) {
      const sourceSpan = document.createElement("span");
      sourceSpan.className = "zone-source";
      sourceSpan.textContent = ` da ${presentation.casterName}`;
      subtitle.appendChild(sourceSpan);
    }
    copy.appendChild(subtitle);
  } else if (isMultiTarget && presentation.casterName) {
    const subtitle = document.createElement("div");
    subtitle.className = "zone-subtitle";
    const sourceSpan = document.createElement("span");
    sourceSpan.className = "zone-source";
    sourceSpan.textContent = `da ${presentation.casterName}`;
    subtitle.appendChild(sourceSpan);
    copy.appendChild(subtitle);
  }

  const detail = document.createElement("div");
  detail.className = "zone-detail";
  detail.dataset.multiple = presentation.rows.length > 1 ? "true" : "false";
  for (const row of presentation.rows) {
    const line = document.createElement("div");
    line.className = "zone-detail-row";
    line.dataset.activationId = row.activationId;
    if (row.title) {
      const rowTitle = document.createElement("strong");
      rowTitle.className = "zone-detail-row-title";
      const { name: cleanRowName, index: rowTargetIndex } = formatTargetIdentity(row.title);
      rowTitle.textContent = cleanRowName;
      if (rowTargetIndex) {
        const badge = document.createElement("span");
        badge.className = "zone-target-index";
        badge.textContent = `#${rowTargetIndex}`;
        rowTitle.appendChild(badge);
      }
      line.append(rowTitle);
    }
    const { pills: rowPills, instruction: cleanText } = parseReminderRowContent(
      row,
      presentation.targetName || primary.name,
    );
    if (rowPills.length) {
      const micropills = document.createElement("div");
      micropills.className = "zone-micropills";
      for (const p of rowPills) {
        const span = document.createElement("span");
        span.className = p.type ? `zone-micropill zone-micropill--${p.type}` : "zone-micropill";
        span.textContent = p.text;
        micropills.appendChild(span);
      }
      line.append(micropills);
    }
    // I controlli di risoluzione risiedono sulla stessa fascia (action shelf) dei micropill
    buildResolutionControls(line, row);

    const instruction = document.createElement("span");
    instruction.className = "zone-instruction";
    instruction.textContent = cleanText || (!rowPills.length ? row.detail : "");
    if (!instruction.textContent) {
      instruction.hidden = true;
    }
    line.append(instruction);
    detail.append(line);
  }

  const requiresResponse = presentation.rows.some(reminderRowRequiresResponse);
  const hasPersistentReminder = presentation.rows.some((row: any) =>
    row.resolution?.mode === "consume"
  );
  const hasPersistentPrismaticWallSave = presentation.rows.some(
    reminderRowRequiresPersistentDisplay,
  );
  panel.append(portrait, copy, detail);
  window.clearTimeout(zoneHideTimer);
  zoneHideTimer = 0;
  app.replaceChildren(panel);
  currentZonePanel = panel;
  currentZoneTurnKey = String(batch.turnKey || "").trim();
  announceNoticeLayout({ force: true });
  if (!requiresResponse && !hasPersistentReminder && !hasPersistentPrismaticWallSave) {
    const timer = document.createElement("div");
    timer.className = "zone-timer";
    panel.appendChild(timer);
    zoneHideTimer = window.setTimeout(() => {
      if (currentZonePanel === panel) {
        currentZonePanel = null;
        currentZoneTurnKey = "";
        currentSaveReminderBatch = null;
        zoneHideTimer = 0;
        announceNoticeLayout();
      }
      panel.remove();
    }, ZONE_AUTO_CLOSE_MS);
  }
  return true;
}

function flushSaveReminderNotices() {
  saveReminderAggregationTimer = 0;
  const currentActivationIds = new Set(
    Array.isArray(currentSaveReminderBatch?.entries)
      ? currentSaveReminderBatch.entries
        .map((entry: any) => String(entry?.activationId || "").trim())
        .filter(Boolean)
      : [],
  );
  const values = pendingSaveReminderNotices.filter((notice) =>
    !currentActivationIds.has(String(notice?.activationId || "").trim())
  );
  pendingSaveReminderNotices = [];
  if (!values.length) return;
  const baseBatch = currentZonePanel ? currentSaveReminderBatch : null;
  const batch = mergeSaveReminderNoticeBatch(baseBatch, values, {
    preserveCurrentEntries: Array.isArray(baseBatch?.entries)
      && baseBatch.entries.some(reminderRowRequiresResponse),
  });
  if (!batch || !renderSaveReminderBatch(batch)) {
    announceNoticeLayout({ force: true });
    return;
  }
  currentSaveReminderBatch = batch;
}

function queueSaveReminderNotices(values: ZoneTriggerNotice[]) {
  const knownActivationIds = new Set([
    ...(Array.isArray(currentSaveReminderBatch?.entries)
      ? currentSaveReminderBatch.entries
        .map((entry: any) => String(entry?.activationId || "").trim())
        .filter(Boolean)
      : []),
    ...pendingSaveReminderNotices
      .map((entry) => String(entry?.activationId || "").trim())
      .filter(Boolean),
  ]);
  const notices = (Array.isArray(values) ? values : [])
    .filter(Boolean)
    .filter((notice) => {
      const activationId = String(notice?.activationId || "").trim();
      if (!activationId || knownActivationIds.has(activationId)) return false;
      knownActivationIds.add(activationId);
      return true;
    });
  if (!notices.length) return false;
  pendingSaveReminderNotices.push(...notices.map((notice) => ({
    ...notice,
    instruction: notice.instruction || zoneTriggerNoticeDetail(notice),
  })));
  window.clearTimeout(saveReminderAggregationTimer);
  saveReminderAggregationTimer = window.setTimeout(
    flushSaveReminderNotices,
    SAVE_REMINDER_AGGREGATION_MS,
  );
  return true;
}

function effectSaveNotice(raw: any): ZoneTriggerNotice | null {
  const activationId = String(raw?.activationId || "").trim();
  const effectName = String(raw?.effectName || "").trim().slice(0, 100);
  const saveLabel = String(raw?.saveLabel || "").trim().slice(0, 160);
  const targetId = String(raw?.target?.id || "").trim();
  if (!activationId || !effectName || !saveLabel || !targetId) return null;
  const targetName = String(raw?.target?.name || "Token").trim().slice(0, 100)
    || "Token";
  const casterName = String(raw?.sourceName || "").trim().slice(0, 100);
  const sourceId = String(raw?.sourceId || "").trim().slice(0, 200);
  const spellId = String(raw?.spellId || "").trim().slice(0, 200);
  const informational = raw?.kind === "effect-reminder";
  const rawInstruction = String(raw?.instruction || "")
    .trim()
    .replace(/\s*\.?\s*Risolvi il tiro salvezza\.?\s*$/iu, "")
    .trim();
  const saveLabelWithCaster = `${saveLabel}${casterName ? ` (${casterName})` : ""}`;
  const normalizeInstruction = (value: string) => String(value || "")
    .replace(/[.!?]+$/gu, "")
    .trim()
    .toLocaleLowerCase("it");
  const repeatedLabels = new Set([saveLabel, saveLabelWithCaster].map(normalizeInstruction));
  const instructionParts = rawInstruction
    .split(/\s*\.\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index) => index !== 0 || !repeatedLabels.has(normalizeInstruction(part)));
  const saveInstruction = [
    saveLabelWithCaster,
    instructionParts.join(". "),
  ].filter(Boolean).join(". ");
  return {
    activationId,
    turnKey: String(raw?.turnKey || "").trim().slice(0, 300) || undefined,
    timing: (
      raw?.timing === "turn-start"
      || raw?.timing === "turn-end"
      || raw?.timing === "damage"
    ) ? raw.timing : undefined,
    spellName: effectName,
    ...(spellId ? { spellId } : {}),
    label: saveLabel,
    kind: informational ? "effect-reminder" : "effect-save",
    eyebrow: informational
      ? String(raw?.eyebrow || "Promemoria").trim().slice(0, 80)
      : "Tiro salvezza",
    instruction: informational
      ? String(raw?.instruction || saveLabel).trim()
      : saveInstruction,
    ...(raw?.resolution ? { resolution: raw.resolution } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(casterName ? { sourceName: casterName } : {}),
    targets: [{
      id: targetId,
      name: targetName,
      portrait: String(raw?.target?.portrait || "").trim().slice(0, 2048),
    }],
  };
}

function showEffectSaveNotices(raw: any) {
  const values = projectReminderNotices(raw?.notices, {
    role: noticeRole,
    policy: reminderProjectionPolicy.player,
    directResolution: reminderProjectionPolicy.directResolution,
  });
  const notices: ZoneTriggerNotice[] = [];
  for (const value of values) {
    const notice = effectSaveNotice(value);
    if (!notice) continue;
    if (Array.isArray(raw?.rearmActivationIds)
      && raw.rearmActivationIds.some((value: any) => (
        String(value || "").trim() === notice.activationId
      ))) {
      announcedEffectActivationIds.delete(notice.activationId);
    }
    if (announcedEffectActivationIds.has(notice.activationId)) continue;
    notices.push(notice);
  }
  rememberAnnouncementIds(
    announcedEffectActivationIds,
    notices.map((notice) => notice.activationId),
  );
  queueSaveReminderNotices(notices);
}

function showZoneNotices(raw: any, { baseline = false } = {}) {
  const values = projectReminderNotices(raw?.notices, {
    role: noticeRole,
    policy: reminderProjectionPolicy.player,
    directResolution: reminderProjectionPolicy.directResolution,
  });
  if (Array.isArray(raw?.rearmActivationIds)) {
    const rearmIds = new Set(
      raw.rearmActivationIds
        .map((value: any) => String(value || "").trim())
        .filter(Boolean),
    );
    for (const activationId of rearmIds) {
      announcedZoneActivationIds.delete(activationId);
    }
  }
  const plan = planZoneTriggerNoticeDelivery(
    values,
    [...announcedZoneActivationIds],
    { baseline },
  );
  if (baseline) return;
  if (queueSaveReminderNotices(plan.notices as ZoneTriggerNotice[])) {
    rememberAnnouncementIds(announcedZoneActivationIds, plan.announcedIds);
  }
}

async function syncPendingZoneNotices() {
  if (!await OBR.scene.isReady().catch(() => false)) {
    zonePendingBaselineReady = false;
    announcedZoneActivationIds.clear();
    clearPendingSaveReminderNotices();
    clearZoneNotice();
    return;
  }
  const sceneEpoch = currentSceneEpoch();
  // I reminder ripristinati da Undo devono essere letti dallo stato canonico
  // della scena, non da uno snapshot eventualmente ancora debounced.
  const items = await OBR.scene.items.getItems();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const notices = pendingSpellZoneTriggerActivations(items)
    .flatMap((activation) => zoneTriggerNoticesFromActivation(
      activation,
      itemsById,
    ))
    .filter((notice): notice is ZoneTriggerNotice => !!notice);
  const pendingIds = new Set(notices.map((notice) => notice.activationId));

  // Riconcilia soltanto un batch che è già realmente renderizzato.
  // Un nuovo iframe Turn Notice esegue questo sync prima di ricevere il payload
  // riannunciato da Undo: non dobbiamo quindi potare i reminder ancora accodati,
  // altrimenti il primo Undo può cancellare il payload prima che diventi visibile.
  if (currentZonePanel && currentSaveReminderBatch) {
    const currentEntries = Array.isArray(currentSaveReminderBatch.entries)
      ? currentSaveReminderBatch.entries
      : [];
    const openResponseIds = openZoneResponseIds(currentEntries, itemsById);
    const zonePrunedBatch = pruneZoneReminderNoticeBatch(
      currentSaveReminderBatch,
      pendingIds,
      {
        // I reminder informativi e i danni automatici non hanno una
        // activation pendente da consumare: restano visibili fino al timeout
        // del pannello, invece di essere chiusi dal sync a 500 ms.
        preserveActivationIds: currentEntries
          .filter((entry: any) => (
            entry?.kind === "zone-effect"
            && !entry?.resolution
          ))
          .map((entry: any) => entry.activationId)
          .concat(openResponseIds),
      },
    );
    const nextCurrentBatch = pruneEffectSaveReminderNoticeBatch(
      zonePrunedBatch,
      currentEffectSaveReminderActivationIds(currentSaveReminderBatch, items),
    );
    const currentIds = new Set(
      currentEntries.map((entry: any) => String(entry?.activationId || "").trim())
        .filter(Boolean),
    );
    const nextCurrentIds = new Set(
      Array.isArray(nextCurrentBatch?.entries)
        ? nextCurrentBatch.entries.map((entry: any) => String(entry?.activationId || "").trim())
        : [],
    );
    const currentIdsChanged = nextCurrentIds.size !== currentIds.size
      || [...currentIds].some((activationId) => !nextCurrentIds.has(activationId));
    if (currentIdsChanged) {
      for (const entry of currentEntries) {
        const activationId = String(entry?.activationId || "").trim();
        if (!activationId || nextCurrentIds.has(activationId)) continue;
        const isResolving = resolvingActivations.has(activationId);
        if (!isResolving) {
          resolutionDrafts.delete(activationId);
          resolutionStatus.delete(activationId);
          resolvingActivations.delete(activationId);
        }
        if (entry?.kind === "zone" || entry?.kind === "zone-effect") {
          // Non rimuovere il guard qui: il sender host può consegnare dopo il
          // reconcile un payload prodotto prima del consume. Un Undo riapre
          // esplicitamente l'ID tramite rearmActivationIds.
        } else {
          announcedEffectActivationIds.delete(activationId);
        }
      }
      if (!nextCurrentBatch) {
        clearZoneNotice();
        if (!currentPanel && !pendingSaveReminderNotices.length) {
          requestTurnNoticeHostClose();
        }
      } else if (!renderSaveReminderBatch(nextCurrentBatch)) {
        clearZoneNotice();
        if (!currentPanel && !pendingSaveReminderNotices.length) {
          requestTurnNoticeHostClose();
        }
      } else {
        currentSaveReminderBatch = nextCurrentBatch;
      }
    }
  }

  // A scene-item event can be observed between the canonical commit and the
  // follow-up render of a multi-target reminder.  In that short window the
  // current panel may contain fewer rows than the still-pending activation
  // set, while announcedZoneActivationIds would otherwise suppress the
  // missing rows forever.  Re-arm only canonical notices that are neither
  // visible, queued, nor actively resolving; the normal delivery planner
  // keeps the operation idempotent.
  const visibleActivationIds = new Set(
    Array.isArray(currentSaveReminderBatch?.entries)
      ? currentSaveReminderBatch.entries
        .map((entry: any) => String(entry?.activationId || "").trim())
        .filter(Boolean)
      : [],
  );
  const queuedActivationIds = new Set(
    pendingSaveReminderNotices
      .map((entry) => String(entry?.activationId || "").trim())
      .filter(Boolean),
  );
  const rearmActivationIds = notices
    .map((notice) => String(notice.activationId || "").trim())
    .filter((activationId) => (
      activationId
      && !visibleActivationIds.has(activationId)
      && !queuedActivationIds.has(activationId)
      && !resolvingActivations.has(activationId)
    ));

  // Un activation consumata resta soppressa anche quando il sender consegna in
  // ritardo un payload già prodotto prima del commit. Il riarmo esplicito di
  // Undo passa da rearmActivationIds; il limite della cache evita crescita
  // illimitata tra trigger distinti.
  const baseline = !zonePendingBaselineReady;
  showZoneNotices({ notices, rearmActivationIds }, { baseline });
  zonePendingBaselineReady = true;
}

function requestPendingZoneNoticeSync() {
  zonePendingSyncRequested = true;
  if (zonePendingSyncRunning) return;
  zonePendingSyncRunning = true;
  const run = async () => {
    try {
      while (zonePendingSyncRequested) {
        zonePendingSyncRequested = false;
        await syncPendingZoneNotices();
      }
    } catch (error) {
      console.warn(
        "[turn-notice] zone sync:",
        (error as any)?.message || error,
      );
    } finally {
      zonePendingSyncRunning = false;
      if (zonePendingSyncRequested) requestPendingZoneNoticeSync();
    }
  };
  void run();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideCurrent();
    clearZoneNotice();
  }
});

OBR.onReady(async () => {
  await startRuntimeOptions().catch(() => {});
  noticeRole = await OBR.player.getRole()
    .then((role) => role === "GM" ? "GM" : "PLAYER")
    .catch(() => "PLAYER");
  if (noticeRole === "GM" && currentSaveReminderBatch) {
    renderSaveReminderBatch(currentSaveReminderBatch);
  }
  reminderProjectionPolicy = runtimeOptionsService.get(selectReminderProjectionPolicy);
  unsubscribeOptions = runtimeOptionsService.subscribe(
    selectReminderProjectionPolicy,
    (policy) => {
      reminderProjectionPolicy = policy;
      if (!policy.popup) clearTurnNotice();
      clearPendingSaveReminderNotices();
      clearZoneNotice();
    },
    { emitCurrent: false },
  );
  unsubscribeUiBroadcast = OBR.broadcast.onMessage(UI_CHANNEL, (event) => {
    const data = event?.data;
    if (
      data?.type === "show-turn-notice"
      && reminderProjectionPolicy.popup
      && isTurnNoticeForScene(data, noticeSceneEpoch, noticeSceneReady)
    ) {
      showNotice(data);
      return;
    }
    if (data?.type === "show-turn-notice") {
      announceNoticeLayout({ force: true });
      return;
    }
    if (data?.type === "show-effect-save-notices") {
      showEffectSaveNotices(data);
      announceNoticeLayout({ force: true });
      return;
    }
    if (data?.type === "show-zone-trigger-notices") {
      showZoneNotices(data);
      announceNoticeLayout({ force: true });
    }
  });
  unsubscribeRuntimeCacheCleanup = OBR.broadcast.onMessage(
    RUNTIME_CACHE_CLEANUP_CHANNEL,
    (event) => {
      if (event?.data?.type !== "clear-runtime-caches") return;
      clearRuntimeReminderCaches();
      if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) requestPendingZoneNoticeSync();
    },
  );
  const announceReady = () => OBR.broadcast.sendMessage(
    READY_CHANNEL,
    { type: "turn-notice-ready", sceneEpoch: noticeSceneEpoch },
    { destination: "LOCAL" },
  ).catch(() => {});
  unsubscribeTurnNoticeReadyRequest = OBR.broadcast.onMessage(
    READY_CHANNEL,
    (event) => {
      if (event?.data?.type !== "turn-notice-ready-request") return;
      const requestedEpoch = Number(event?.data?.sceneEpoch);
      if (Number.isFinite(requestedEpoch) && requestedEpoch >= 0) {
        noticeSceneEpoch = Math.floor(requestedEpoch);
      }
      void announceReady();
    },
  );
  void announceReady();
  unsubscribeZoneSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      noticeSceneEpoch += 1;
      noticeSceneReady = false;
      clearTurnNotice();
      zonePendingBaselineReady = false;
      clearRuntimeReminderCaches();
      return;
    }
    noticeSceneReady = true;
    void announceReady();
    if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) requestPendingZoneNoticeSync();
  });
  announceNoticeLayout();
  if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;
  unsubscribeZoneItemChanges = subscribeSceneItemChanges(() => {
    requestPendingZoneNoticeSync();
  });
  requestPendingZoneNoticeSync();
});

window.addEventListener("beforeunload", () => {
  clearTurnNotice();
  clearPendingSaveReminderNotices();
  unsubscribeZoneSceneReady?.();
  unsubscribeZoneItemChanges?.();
  unsubscribeUiBroadcast?.();
  unsubscribeTurnNoticeReadyRequest?.();
  unsubscribeRuntimeCacheCleanup?.();
  unsubscribeOptions?.();
});
