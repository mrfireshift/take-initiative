import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
  SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
} from "./constants.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import {
  planZoneTriggerNoticeDelivery,
  shouldClearZoneNoticeAtTurn,
  zoneTriggerNoticeDetail,
  zoneTriggerNoticeFromActivation,
} from "./zoneTriggerNoticeCore.js";
import {
  mergeSaveReminderNoticeBatch,
  saveReminderNoticeBatchPresentation,
} from "./saveReminderNoticeCore.js";
import { isTurnNoticeForScene } from "./turnNotice.js";

const CHANNEL = ID + "/turn-notice";
const READY_CHANNEL = CHANNEL + "/ready";
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
  label: string;
  failureEffect?: string;
  dc?: number;
  casterName?: string;
  targets: ZoneNoticeTarget[];
  kind?: "zone" | "zone-effect" | "effect-save" | "effect-reminder";
  eyebrow?: string;
  instruction?: string;
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
let unsubscribeZoneItems: (() => void) | null = null;
let unsubscribeZoneSceneReady: (() => void) | null = null;
let unsubscribeZoneBroadcast: (() => void) | null = null;
let unsubscribeEffectSaveBroadcast: (() => void) | null = null;
let unsubscribeTurnNoticeBroadcast: (() => void) | null = null;
let unsubscribeTurnNoticeReadyRequest: (() => void) | null = null;
let noticeSceneEpoch = 0;
let noticeSceneReady = true;

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
  leaving.classList.remove("is-visible");
  leaving.classList.add("is-leaving");
  window.setTimeout(() => leaving.remove(), FADE_MS);
}

function clearTurnNotice() {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  currentPanel?.remove();
  currentPanel = null;
  document.getElementById("app")?.replaceChildren();
}

function clearZoneNotice() {
  window.clearTimeout(zoneHideTimer);
  zoneHideTimer = 0;
  currentZonePanel?.remove();
  currentZonePanel = null;
  currentZoneTurnKey = "";
  currentSaveReminderBatch = null;
  document.getElementById("zone-app")?.replaceChildren();
}

function clearPendingSaveReminderNotices() {
  window.clearTimeout(saveReminderAggregationTimer);
  saveReminderAggregationTimer = 0;
  pendingSaveReminderNotices = [];
}

function showNotice(raw: any) {
  const app = document.getElementById("app");
  const notice = normalizeNotice(raw);
  if (!app || !notice) return;
  if (notice.noticeId && notice.noticeId <= lastNoticeId) return;
  if (notice.noticeId) lastNoticeId = notice.noticeId;

  if (
    currentZonePanel
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
}

function renderSaveReminderBatch(batch: any) {
  const app = document.getElementById("zone-app");
  const presentation = saveReminderNoticeBatchPresentation(batch);
  if (!app || !presentation) return false;
  const primary = presentation.primaryTarget;
  const panel = document.createElement("section");
  panel.className = "zone-notice";
  panel.dataset.kind = presentation.kind;
  panel.dataset.activationId = batch.activationIds.join(" ");
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-label", presentation.ariaLabel);

  const portrait = document.createElement("div");
  portrait.className = "zone-portrait";
  const fallback = document.createElement("div");
  fallback.className = "zone-portrait-fallback";
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

  const copy = document.createElement("div");
  copy.className = "zone-copy";
  const eyebrow = document.createElement("div");
  eyebrow.className = "zone-eyebrow";
  eyebrow.textContent = presentation.eyebrow;
  const title = document.createElement("div");
  title.className = "zone-title";
  title.textContent = presentation.title;
  copy.append(eyebrow, title);

  const detail = document.createElement("div");
  detail.className = "zone-detail";
  detail.dataset.multiple = presentation.rows.length > 1 ? "true" : "false";
  for (const row of presentation.rows) {
    const line = document.createElement("div");
    line.className = "zone-detail-row";
    line.dataset.activationId = row.activationId;
    if (row.title) {
      const rowTitle = document.createElement("strong");
      rowTitle.textContent = row.title;
      line.append(rowTitle);
    }
    const instruction = document.createElement("span");
    instruction.textContent = row.detail;
    line.append(instruction);
    detail.append(line);
  }

  const timer = document.createElement("div");
  timer.className = "zone-timer";
  panel.append(portrait, copy, detail, timer);
  window.clearTimeout(zoneHideTimer);
  app.replaceChildren(panel);
  currentZonePanel = panel;
  currentZoneTurnKey = String(batch.turnKey || "").trim();
  zoneHideTimer = window.setTimeout(() => {
    if (currentZonePanel === panel) {
      currentZonePanel = null;
      currentZoneTurnKey = "";
      currentSaveReminderBatch = null;
      zoneHideTimer = 0;
    }
    panel.remove();
  }, ZONE_AUTO_CLOSE_MS);
  return true;
}

function flushSaveReminderNotices() {
  saveReminderAggregationTimer = 0;
  const values = pendingSaveReminderNotices;
  pendingSaveReminderNotices = [];
  if (!values.length) return;
  const baseBatch = currentZonePanel ? currentSaveReminderBatch : null;
  const batch = mergeSaveReminderNoticeBatch(baseBatch, values);
  if (!batch || !renderSaveReminderBatch(batch)) return;
  currentSaveReminderBatch = batch;
}

function queueSaveReminderNotices(values: ZoneTriggerNotice[]) {
  const notices = Array.isArray(values) ? values.filter(Boolean) : [];
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
  const informational = raw?.kind === "effect-reminder";
  return {
    activationId,
    turnKey: String(raw?.turnKey || "").trim().slice(0, 300) || undefined,
    timing: (
      raw?.timing === "turn-start"
      || raw?.timing === "turn-end"
      || raw?.timing === "damage"
    ) ? raw.timing : undefined,
    spellName: effectName,
    label: saveLabel,
    kind: informational ? "effect-reminder" : "effect-save",
    eyebrow: informational
      ? String(raw?.eyebrow || "Promemoria").trim().slice(0, 80)
      : "Tiro salvezza",
    instruction: informational
      ? String(raw?.instruction || saveLabel).trim()
      : `${saveLabel}${casterName ? ` (${casterName})` : ""}. ${
        String(raw?.instruction || "Risolvi il tiro salvezza.").trim()
      }`,
    targets: [{
      id: targetId,
      name: targetName,
      portrait: String(raw?.target?.portrait || "").trim().slice(0, 2048),
    }],
  };
}

function showEffectSaveNotices(raw: any) {
  const values = Array.isArray(raw?.notices) ? raw.notices : [];
  const notices: ZoneTriggerNotice[] = [];
  for (const value of values) {
    const notice = effectSaveNotice(value);
    if (
      !notice
      || announcedEffectActivationIds.has(notice.activationId)
    ) {
      continue;
    }
    notices.push(notice);
    announcedEffectActivationIds.add(notice.activationId);
  }
  queueSaveReminderNotices(notices);
}

function showZoneNotices(raw: any, { baseline = false } = {}) {
  const values = Array.isArray(raw?.notices) ? raw.notices : [];
  const plan = planZoneTriggerNoticeDelivery(
    values,
    [...announcedZoneActivationIds],
  );
  if (baseline) {
    for (const activationId of plan.announcedIds) {
      announcedZoneActivationIds.add(activationId);
    }
    return;
  }
  if (queueSaveReminderNotices(plan.notices as ZoneTriggerNotice[])) {
    for (const activationId of plan.announcedIds) {
      announcedZoneActivationIds.add(activationId);
    }
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
  const items = await OBR.scene.items.getItems();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const notices = pendingSpellZoneTriggerActivations(items)
    .map((activation) => zoneTriggerNoticeFromActivation(
      activation,
      itemsById,
    ))
    .filter((notice): notice is ZoneTriggerNotice => !!notice);
  const baseline = !zonePendingBaselineReady;
  showZoneNotices({ notices }, { baseline });
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
  if (event.key === "Escape") hideCurrent();
});

OBR.onReady(() => {
  unsubscribeTurnNoticeBroadcast = OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (
      event?.data?.type === "show-turn-notice"
      && isTurnNoticeForScene(event.data, noticeSceneEpoch, noticeSceneReady)
    ) {
      showNotice(event.data);
    }
  });
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
  unsubscribeEffectSaveBroadcast = OBR.broadcast.onMessage(
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
    (event) => {
      if (event?.data?.type === "show-effect-save-notices") {
        showEffectSaveNotices(event.data);
      }
    },
  );
  unsubscribeZoneSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      noticeSceneEpoch += 1;
      noticeSceneReady = false;
      clearTurnNotice();
      zonePendingBaselineReady = false;
      announcedZoneActivationIds.clear();
      clearPendingSaveReminderNotices();
      clearZoneNotice();
      return;
    }
    noticeSceneReady = true;
    void announceReady();
    if (SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) requestPendingZoneNoticeSync();
  });
  if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;
  unsubscribeZoneItems = OBR.scene.items.onChange(
    requestPendingZoneNoticeSync,
  );
  unsubscribeZoneBroadcast = OBR.broadcast.onMessage(
    SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
    (event) => {
      if (event?.data?.type === "show-zone-trigger-notices") {
        showZoneNotices(event.data);
      }
    },
  );
  requestPendingZoneNoticeSync();
});

window.addEventListener("beforeunload", () => {
  clearTurnNotice();
  clearPendingSaveReminderNotices();
  unsubscribeZoneItems?.();
  unsubscribeZoneSceneReady?.();
  unsubscribeZoneBroadcast?.();
  unsubscribeEffectSaveBroadcast?.();
  unsubscribeTurnNoticeBroadcast?.();
  unsubscribeTurnNoticeReadyRequest?.();
});
