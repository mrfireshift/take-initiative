import OBR from "@owlbear-rodeo/sdk";
import { SPELL_ZONE_TRIGGER_NOTICE_CHANNEL } from "./constants.js";
import { pendingSpellZoneTriggerActivations } from "./spellZoneTriggerCore.js";

const AUTO_CLOSE_MS = 6500;
const PENDING_SYNC_INTERVAL_MS = 500;

type NoticeTarget = {
  id: string;
  name: string;
  portrait: string;
};

type ZoneTriggerNotice = {
  activationId: string;
  spellName: string;
  label: string;
  targets: NoticeTarget[];
};

const announcedActivationIds = new Set<string>();
let syncRequested = false;
let syncRunning = false;
let unsubscribeItems: (() => void) | null = null;
let unsubscribeSceneReady: (() => void) | null = null;
let unsubscribeTriggerNotices: (() => void) | null = null;
let pendingSyncTimer: number | null = null;

function itemPortrait(item: any) {
  return String(
    item?.image?.url
    || item?.image?.src
    || item?.asset?.image?.url
    || ""
  ).trim().slice(0, 2048);
}

function noticeFromActivation(
  activation: any,
  itemsById: Map<string, any>,
): ZoneTriggerNotice | null {
  const activationId = String(activation?.id || "").trim();
  const root = itemsById.get(String(activation?.zoneItemId || ""));
  const targets = (Array.isArray(activation?.targetIds)
    ? activation.targetIds
    : [])
    .map((targetId: unknown) => {
      const id = String(targetId || "").trim();
      const item = itemsById.get(id);
      if (!id || !item) return null;
      return {
        id,
        name: String(item.name || "Token").trim().slice(0, 100) || "Token",
        portrait: itemPortrait(item),
      };
    })
    .filter((target: NoticeTarget | null): target is NoticeTarget => !!target);
  if (!activationId || !targets.length) return null;
  return {
    activationId,
    spellName: String(activation?.spellName || root?.name || "Incantesimo")
      .replace(/^Zona:\s*/i, "")
      .trim()
      .slice(0, 100) || "Incantesimo",
    label: String(
      activation?.label || "Tiro salvezza richiesto"
    ).trim().slice(0, 160) || "Tiro salvezza richiesto",
    targets,
  };
}

function targetSummary(targets: NoticeTarget[]) {
  if (targets.length === 1) return targets[0].name;
  if (targets.length === 2) return `${targets[0].name} e ${targets[1].name}`;
  return `${targets[0].name}, ${targets[1].name} e altri ${targets.length - 2}`;
}

function removeNotice(activationId: string) {
  const app = document.getElementById("app");
  const selector = `.notice[data-activation-id="${CSS.escape(activationId)}"]`;
  app?.querySelector(selector)?.remove();
}

function renderNotice(notice: ZoneTriggerNotice) {
  const app = document.getElementById("app");
  if (!app || app.querySelector(
    `.notice[data-activation-id="${CSS.escape(notice.activationId)}"]`
  )) return;
  const primary = notice.targets[0];
  const panel = document.createElement("section");
  panel.className = "notice";
  panel.dataset.activationId = notice.activationId;
  panel.setAttribute("role", "status");
  panel.setAttribute(
    "aria-label",
    `${notice.spellName}: tiro salvezza richiesto per ${targetSummary(notice.targets)}`,
  );

  const portrait = document.createElement("div");
  portrait.className = "portrait";
  const fallback = document.createElement("div");
  fallback.className = "portrait-fallback";
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
  copy.className = "copy";
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Effetto di zona";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = notice.spellName;
  copy.append(eyebrow, title);

  const detail = document.createElement("div");
  detail.className = "detail";
  const instruction = document.createElement("span");
  instruction.textContent = `${notice.label} (${targetSummary(notice.targets)})`;
  detail.append(instruction);

  const timer = document.createElement("div");
  timer.className = "timer";
  panel.append(portrait, copy, detail, timer);
  app.replaceChildren(panel);
  window.setTimeout(() => panel.remove(), AUTO_CLOSE_MS);
}

async function syncPendingNotices() {
  if (!await OBR.scene.isReady().catch(() => false)) {
    document.getElementById("app")?.replaceChildren();
    announcedActivationIds.clear();
    return;
  }
  const items = await OBR.scene.items.getItems();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const pending = pendingSpellZoneTriggerActivations(items);
  const pendingIds = new Set(pending.map((activation) => activation.id));

  for (const activationId of [...announcedActivationIds]) {
    if (pendingIds.has(activationId)) continue;
    announcedActivationIds.delete(activationId);
    removeNotice(activationId);
  }
  for (const activation of pending) {
    if (announcedActivationIds.has(activation.id)) continue;
    announcedActivationIds.add(activation.id);
    const notice = noticeFromActivation(activation, itemsById);
    if (notice) renderNotice(notice);
  }
}

function requestPendingNoticeSync() {
  syncRequested = true;
  if (syncRunning) return;
  syncRunning = true;
  const run = async () => {
    try {
      while (syncRequested) {
        syncRequested = false;
        await syncPendingNotices();
      }
    } catch (error) {
      console.warn(
        "[zone-trigger-notice] sync:",
        (error as any)?.message || error,
      );
    } finally {
      syncRunning = false;
      if (syncRequested) requestPendingNoticeSync();
    }
  };
  void run();
}

OBR.onReady(() => {
  unsubscribeItems = OBR.scene.items.onChange(requestPendingNoticeSync);
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (ready) requestPendingNoticeSync();
  });
  unsubscribeTriggerNotices = OBR.broadcast.onMessage(
    SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
    (event) => {
      if (event?.data?.type === "spell-zone-trigger-activations") {
        requestPendingNoticeSync();
      }
    },
  );
  pendingSyncTimer = window.setInterval(
    requestPendingNoticeSync,
    PENDING_SYNC_INTERVAL_MS,
  );
  requestPendingNoticeSync();
});

window.addEventListener("beforeunload", () => {
  unsubscribeItems?.();
  unsubscribeSceneReady?.();
  unsubscribeTriggerNotices?.();
  if (pendingSyncTimer !== null) window.clearInterval(pendingSyncTimer);
  pendingSyncTimer = null;
});
