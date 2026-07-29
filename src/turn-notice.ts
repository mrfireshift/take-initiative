import OBR from "@owlbear-rodeo/sdk";
import {
  ID,
  SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
} from "./constants.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import {
  planZoneTriggerNoticeDelivery,
  zoneTriggerNoticeFromActivation,
} from "./zoneTriggerNoticeCore.js";

const CHANNEL = ID + "/turn-notice";
const AUTO_CLOSE_MS = 4500;
const ZONE_AUTO_CLOSE_MS = 6500;
const MAX_VISIBLE_ZONE_NOTICES = 3;
const FADE_MS = 220;
const ATTITUDES = new Set(["pc", "ally", "enemy", "neutral"]);

type TurnNotice = {
  currentName: string;
  nextName: string;
  currentPortrait: string;
  currentAttitude: string;
  round: number;
  noticeId: number;
};

type ZoneNoticeTarget = {
  id: string;
  name: string;
  portrait: string;
};

type ZoneTriggerNotice = {
  activationId: string;
  spellName: string;
  label: string;
  targets: ZoneNoticeTarget[];
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
  };
}

let currentPanel: HTMLElement | null = null;
let hideTimer = 0;
let lastNoticeId = 0;
const announcedZoneActivationIds = new Set<string>();
let zonePendingBaselineReady = false;
let zonePendingSyncRequested = false;
let zonePendingSyncRunning = false;
let unsubscribeZoneItems: (() => void) | null = null;
let unsubscribeZoneSceneReady: (() => void) | null = null;
let unsubscribeZoneBroadcast: (() => void) | null = null;

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

function showNotice(raw: any) {
  const app = document.getElementById("app");
  const notice = normalizeNotice(raw);
  if (!app || !notice) return;
  if (notice.noticeId && notice.noticeId <= lastNoticeId) return;
  if (notice.noticeId) lastNoticeId = notice.noticeId;

  window.clearTimeout(hideTimer);
  const previous = currentPanel;
  const nextPanel = buildPanel(notice);
  currentPanel = nextPanel;
  app.appendChild(nextPanel);
  requestAnimationFrame(() => requestAnimationFrame(() => nextPanel.classList.add("is-visible")));
  if (previous) {
    previous.classList.remove("is-visible");
    previous.classList.add("is-leaving");
    window.setTimeout(() => previous.remove(), FADE_MS);
  }
  hideTimer = window.setTimeout(hideCurrent, AUTO_CLOSE_MS);
}

function zoneTargetSummary(targets: ZoneNoticeTarget[]) {
  if (targets.length === 1) return targets[0].name;
  if (targets.length === 2) return `${targets[0].name} e ${targets[1].name}`;
  return `${targets[0].name}, ${targets[1].name} e altri ${targets.length - 2}`;
}

function renderZoneNotice(notice: ZoneTriggerNotice) {
  const app = document.getElementById("zone-app");
  if (!app || app.querySelector(
    `.zone-notice[data-activation-id="${CSS.escape(notice.activationId)}"]`
  )) return false;
  const primary = notice.targets[0];
  const panel = document.createElement("section");
  panel.className = "zone-notice";
  panel.dataset.activationId = notice.activationId;
  panel.setAttribute("role", "status");
  panel.setAttribute(
    "aria-label",
    `${notice.spellName}: tiro salvezza richiesto per ${zoneTargetSummary(notice.targets)}`,
  );

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
  eyebrow.textContent = "Effetto di zona";
  const title = document.createElement("div");
  title.className = "zone-title";
  title.textContent = notice.spellName;
  copy.append(eyebrow, title);

  const badge = document.createElement("div");
  badge.className = "zone-target-badge";
  const badgeLabel = document.createElement("span");
  badgeLabel.textContent = "TS";
  const badgeValue = document.createElement("strong");
  badgeValue.textContent = String(notice.targets.length);
  badge.append(badgeLabel, badgeValue);

  const detail = document.createElement("div");
  detail.className = "zone-detail";
  const target = document.createElement("strong");
  target.textContent = zoneTargetSummary(notice.targets);
  const instruction = document.createElement("span");
  instruction.textContent = `${notice.label}. Apri Effetti ad Area per risolvere.`;
  detail.append(target, instruction);

  const timer = document.createElement("div");
  timer.className = "zone-timer";
  panel.append(portrait, copy, badge, detail, timer);
  app.appendChild(panel);
  while (app.childElementCount > MAX_VISIBLE_ZONE_NOTICES) {
    app.firstElementChild?.remove();
  }
  window.setTimeout(() => panel.remove(), ZONE_AUTO_CLOSE_MS);
  return true;
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
  for (const notice of plan.notices as ZoneTriggerNotice[]) {
    if (renderZoneNotice(notice)) {
      announcedZoneActivationIds.add(notice.activationId);
    }
  }
}

async function syncPendingZoneNotices() {
  if (!await OBR.scene.isReady().catch(() => false)) {
    zonePendingBaselineReady = false;
    announcedZoneActivationIds.clear();
    document.getElementById("zone-app")?.replaceChildren();
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
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (event?.data?.type === "show-turn-notice") showNotice(event.data);
  });
  if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) return;
  unsubscribeZoneItems = OBR.scene.items.onChange(
    requestPendingZoneNoticeSync,
  );
  unsubscribeZoneSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      zonePendingBaselineReady = false;
      announcedZoneActivationIds.clear();
      document.getElementById("zone-app")?.replaceChildren();
      return;
    }
    requestPendingZoneNoticeSync();
  });
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
  unsubscribeZoneItems?.();
  unsubscribeZoneSceneReady?.();
  unsubscribeZoneBroadcast?.();
});
