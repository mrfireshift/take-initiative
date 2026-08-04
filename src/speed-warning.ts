import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const POPOVER_ID = ID + "/speed-warning-modal";
const AUTO_CLOSE_MS = 5000;

type Warning = {
  name: string;
  portrait: string;
  speedMeters: number;
  limitMeters: number;
  cycle: number;
  cyclesCrossed: number;
  blocked: boolean;
  reason: string;
};

let hideTimer = 0;

function warningFromURL() {
  try {
    const raw = new URLSearchParams(window.location.search).get("payload") || "";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function closePopover() {
  void OBR.popover.close(POPOVER_ID).catch(() => {});
}

function normalizeWarning(value: any): Warning | null {
  const speedMeters = Math.max(0, Number(value?.speedMeters) || 0);
  const blocked = value?.blocked === true;
  if (speedMeters <= 0 && !blocked) return null;
  return {
    name: String(value?.name || "Personaggio").trim().slice(0, 80) || "Personaggio",
    portrait: String(value?.portrait || "").trim().slice(0, 2048),
    speedMeters,
    limitMeters: blocked ? 0 : Math.max(speedMeters, Number(value?.limitMeters) || speedMeters),
    cycle: Math.max(1, Math.floor(Number(value?.cycle) || 1)),
    cyclesCrossed: Math.max(1, Math.floor(Number(value?.cyclesCrossed) || 1)),
    blocked,
    reason: String(value?.reason || "").trim().slice(0, 160),
  };
}

function renderWarning(value: any) {
  const app = document.getElementById("app");
  const warning = normalizeWarning(value);
  if (!app || !warning) {
    closePopover();
    return;
  }
  window.clearTimeout(hideTimer);

  const panel = document.createElement("section");
  panel.className = "warning";
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-label", (warning.blocked ? "Movimento impedito per " : "Movimento esaurito per ") + warning.name);

  const portrait = document.createElement("div");
  portrait.className = "portrait";
  const fallback = document.createElement("div");
  fallback.className = "portrait-fallback";
  fallback.textContent = warning.name.slice(0, 1).toUpperCase() || "?";
  portrait.appendChild(fallback);
  if (warning.portrait) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = warning.portrait;
    image.addEventListener("load", () => fallback.remove());
    image.addEventListener("error", () => image.remove());
    portrait.appendChild(image);
  }

  const copy = document.createElement("div");
  copy.className = "copy";
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Movimento";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = warning.blocked ? "Movimento impedito" : "Movimento esaurito";
  copy.append(eyebrow, title);

  const detail = document.createElement("div");
  detail.className = "detail";
  const name = document.createElement("strong");
  name.textContent = warning.name;
  detail.append(name, document.createTextNode(warning.blocked
    ? ` non può muoversi${warning.reason ? `: ${warning.reason}` : ""}`
    : " ha raggiunto " + warning.limitMeters + " m"));
  if (!warning.blocked && warning.cyclesCrossed > 1) {
    detail.append(document.createTextNode(" (" + warning.cyclesCrossed + " cicli superati)"));
  }

  const badge = document.createElement("div");
  badge.className = "cycle-badge";
  const badgeLabel = document.createElement("span");
  badgeLabel.textContent = warning.blocked ? "VELOCITÀ" : "CICLO";
  const badgeValue = document.createElement("strong");
  badgeValue.textContent = warning.blocked ? "0" : String(warning.cycle);
  badge.append(badgeLabel, badgeValue);

  const timer = document.createElement("div");
  timer.className = "timer";
  panel.append(portrait, copy, detail, badge, timer);
  app.replaceChildren(panel);
  hideTimer = window.setTimeout(closePopover, AUTO_CLOSE_MS);
}

OBR.onReady(() => {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });
  renderWarning(warningFromURL());
});
