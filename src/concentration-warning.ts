import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { resolveReminder } from "./reminderResolution.js";

const POPOVER_ID = ID + "/concentration-warning-modal";
const UI_CHANNEL = ID + "/concentration-warning/ui";
const HOST_CHANNEL = ID + "/concentration-warning/host";
const AUTO_CLOSE_MS = 6000;

type RuntimeScope = {
  warningSceneEpoch: number | null;
  warningRuntimeScope: string;
  runtimeGeneration: number | null;
  runtimeSession: string;
  popoverId: string;
};

function readRuntimeScope(): RuntimeScope {
  const params = new URLSearchParams(window.location.search);
  const warningSceneEpoch = Number(params.get("warningSceneEpoch"));
  const runtimeGeneration = Number(params.get("runtimeGeneration"));
  return {
    warningSceneEpoch: Number.isSafeInteger(warningSceneEpoch) && warningSceneEpoch >= 0
      ? warningSceneEpoch
      : null,
    warningRuntimeScope: String(params.get("warningRuntimeScope") || "").trim(),
    runtimeGeneration: Number.isSafeInteger(runtimeGeneration) && runtimeGeneration >= 0
      ? runtimeGeneration
      : null,
    runtimeSession: String(params.get("runtimeSession") || "").trim(),
    popoverId: String(params.get("popoverId") || "").trim() || POPOVER_ID,
  };
}

const runtimeScope = readRuntimeScope();

type Warning = {
  name: string;
  damage: number;
  dc: number;
  portrait: string;
  attitude: string;
  spellName: string;
  createdAt: number;
  warningRuntimeScope?: string;
  notice: any;
};

let hideTimer = 0;
let activeWarnings: Warning[] = [];
let noticeRole = "PLAYER";
let roleReady = false;
let pendingWarnings: Warning[] | null = null;

function runtimeMessageScope() {
  return {
    warningSceneEpoch: runtimeScope.warningSceneEpoch,
    warningRuntimeScope: runtimeScope.warningRuntimeScope || undefined,
    runtimeGeneration: runtimeScope.runtimeGeneration,
    runtimeSession: runtimeScope.runtimeSession,
  };
}

function isMatchingRuntimeScope(data: any) {
  return runtimeScope.warningSceneEpoch !== null
    && runtimeScope.runtimeGeneration !== null
    && Number(data?.warningSceneEpoch ?? data?.sceneEpoch) === runtimeScope.warningSceneEpoch
    && Number(data?.runtimeGeneration) === runtimeScope.runtimeGeneration
    && String(data?.runtimeSession || "").trim() === runtimeScope.runtimeSession
    && (!runtimeScope.warningRuntimeScope
      || String(data?.warningRuntimeScope || "").trim() === runtimeScope.warningRuntimeScope);
}

function normalizeWarnings(values: any): Warning[] {
  return (Array.isArray(values) ? values : []).slice(0, 20).map((warning: any) => ({
    name: String(warning?.name || "Token").trim().slice(0, 80) || "Token",
    damage: Math.max(0, Math.floor(Number(warning?.damage) || 0)),
    dc: Math.max(10, Math.floor(Number(warning?.dc) || 10)),
    portrait: String(warning?.portrait || "").trim().slice(0, 2048),
    attitude: String(warning?.attitude || "neutral").trim().toLowerCase(),
    spellName: String(warning?.spellName || "").trim().slice(0, 240),
    ...(String(warning?.warningRuntimeScope || "").trim()
      ? { warningRuntimeScope: String(warning.warningRuntimeScope).trim().slice(0, 256) }
      : {}),
    createdAt: Math.max(0, Math.floor(Number(warning?.createdAt) || 0)),
    notice: warning?.notice && typeof warning.notice === "object" ? warning.notice : null,
  })).filter((warning: Warning) => warning.damage > 0);
}

function warningsFromURL(): Warning[] {
  try {
    const raw = new URLSearchParams(window.location.search).get("payload") || "";
    const parsed = JSON.parse(raw);
    return normalizeWarnings(parsed?.warnings);
  } catch {
    return [];
  }
}

function closePopoverSdk() {
  if (runtimeScope.popoverId === POPOVER_ID) {
    return OBR.popover.close(POPOVER_ID);
  }
  return OBR.popover.close(runtimeScope.popoverId);
}

function closePopover() {
  window.clearTimeout(hideTimer);
  void OBR.broadcast.sendMessage(
    HOST_CHANNEL,
    { type: "concentration-warning-closed", ...runtimeMessageScope() },
    { destination: "LOCAL" },
  ).catch(() => {});
  void closePopoverSdk().catch(() => {});
}

function render(role: string, warnings: Warning[] = warningsFromURL()) {
  const app = document.getElementById("app");
  if (!app) return;
  window.clearTimeout(hideTimer);
  activeWarnings = warnings;
  app.replaceChildren();
  if (!warnings.length) {
    closePopover();
    return;
  }
  const canResolve = role === "GM" && warnings.some((warning) => !!warning.notice?.resolution);

  const primary = warnings[0];
  const panel = document.createElement("section");
  panel.className = warnings.length === 1 ? "warning warning-single" : "warning warning-multiple";
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-label", warnings.length === 1
    ? "Tiro salvezza su Concentrazione per " + primary.name + ", CD " + primary.dc
    : warnings.length + " tiri salvezza su Concentrazione richiesti");

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
  eyebrow.textContent = "Concentrazione";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = warnings.length === 1 ? primary.name : "Tiri salvezza richiesti";
  copy.append(eyebrow, title);

  const saveBadge = document.createElement("div");
  saveBadge.className = "save-badge";
  const badgeLabel = document.createElement("span");
  badgeLabel.textContent = warnings.length === 1 ? "CD" : "TIRI";
  const badgeValue = document.createElement("strong");
  badgeValue.textContent = String(warnings.length === 1 ? primary.dc : warnings.length);
  saveBadge.append(badgeLabel, badgeValue);

  const list = document.createElement("div");
  list.className = "list";
  for (const warning of warnings) {
    const row = document.createElement("div");
    row.className = "row";
    const identity = document.createElement("div");
    identity.className = "identity";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = warnings.length === 1 ? "TS di Costituzione" : warning.name;
    identity.appendChild(name);
    if (warning.spellName) {
      const spellName = document.createElement("div");
      spellName.className = "spell-name";
      spellName.textContent = warning.spellName;
      identity.appendChild(spellName);
    }
    const damage = document.createElement("div");
    damage.className = "damage";
    damage.textContent = warning.damage + " danni";
    row.append(identity, damage);
    if (warnings.length > 1) {
      const dc = document.createElement("div");
      dc.className = "dc";
      dc.textContent = "CD " + warning.dc;
      row.appendChild(dc);
    }
    if (role === "GM" && warning.notice?.resolution) {
      const resolution = document.createElement("div");
      resolution.className = "resolution";
      const status = document.createElement("div");
      status.className = "resolution-status";
      status.hidden = true;
      const buttons: HTMLButtonElement[] = [];
      const activationId = String(warning.notice.activationId || "");
      const resolve = async (outcome: "passed" | "failed") => {
        if (buttons.some((button) => button.disabled)) return;
        for (const button of buttons) button.disabled = true;
        try {
          const result = await resolveReminder({
            notice: warning.notice,
            outcome,
            // Persist the exact concentration-warning payload so History Undo
            // can re-announce the same popup after restoring the unresolved
            // concentration save.
            historyReplay: {
              type: "concentration-warning",
              warning,
            },
          });
          if (result.status === "applied" || result.status === "already-resolved") {
            const remaining = activeWarnings.filter((entry) =>
              String(entry.notice?.activationId || "") !== activationId,
            );
            void OBR.broadcast.sendMessage(
              HOST_CHANNEL,
              {
                type: "concentration-warning-resolved",
                activationId,
                ...runtimeMessageScope(),
              },
              { destination: "LOCAL" },
            ).catch(() => {});
            render(role, remaining);
            return;
          }
          status.hidden = false;
          status.textContent = result.message || "Il tiro non Ã¨ piÃ¹ corrente.";
        } catch (error) {
          status.hidden = false;
          status.textContent = String((error as any)?.message || "Risoluzione non riuscita.");
        }
        for (const button of buttons) button.disabled = false;
      };
      for (const [outcome, label] of [["passed", "Superato"], ["failed", "Fallito"]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          void resolve(outcome);
        });
        buttons.push(button);
        resolution.appendChild(button);
      }
      row.append(resolution, status);
    }
    list.appendChild(row);
  }

  panel.append(portrait, copy, saveBadge, list);
  if (!canResolve) {
    const timer = document.createElement("div");
    timer.className = "timer";
    panel.appendChild(timer);
    hideTimer = window.setTimeout(closePopover, AUTO_CLOSE_MS);
  }
  app.appendChild(panel);
}

OBR.onReady(async () => {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });
  OBR.broadcast.onMessage(UI_CHANNEL, (event) => {
    if (event?.data?.type !== "update-concentration-warnings") return;
    if (!isMatchingRuntimeScope(event.data)) return;
    pendingWarnings = normalizeWarnings(event.data?.warnings);
    if (roleReady) render(noticeRole, pendingWarnings);
  });
  void OBR.broadcast.sendMessage(
    HOST_CHANNEL,
    { type: "concentration-warning-ready", ...runtimeMessageScope() },
    { destination: "LOCAL" },
  ).catch(() => {});
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  noticeRole = String(role || "PLAYER").toUpperCase();
  roleReady = true;
  render(noticeRole, pendingWarnings || warningsFromURL());
});
