import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const SPEED_WARNING_CHANNEL = ID + "/speed-warning";
const AUTO_CLOSE_MS = 5000;

type Warning = {
  name: string;
  portrait: string;
  speedMeters: number;
  limitMeters: number;
  cycle: number;
  cyclesCrossed: number;
};

let hideTimer = 0;

function normalizeWarning(value: any): Warning | null {
  const speedMeters = Math.max(0, Number(value?.speedMeters) || 0);
  if (speedMeters <= 0) return null;
  return {
    name: String(value?.name || "Personaggio").trim().slice(0, 80) || "Personaggio",
    portrait: String(value?.portrait || "").trim().slice(0, 2048),
    speedMeters,
    limitMeters: Math.max(speedMeters, Number(value?.limitMeters) || speedMeters),
    cycle: Math.max(1, Math.floor(Number(value?.cycle) || 1)),
    cyclesCrossed: Math.max(1, Math.floor(Number(value?.cyclesCrossed) || 1)),
  };
}

function renderWarning(value: any) {
  const app = document.getElementById("app");
  const warning = normalizeWarning(value);
  if (!app || !warning) return;
  window.clearTimeout(hideTimer);

  const panel = document.createElement("section");
  panel.className = "warning";
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-label", "Movimento esaurito per " + warning.name);

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
  title.textContent = "Movimento esaurito";
  copy.append(eyebrow, title);

  const detail = document.createElement("div");
  detail.className = "detail";
  const name = document.createElement("strong");
  name.textContent = warning.name;
  detail.append(name, document.createTextNode(" ha raggiunto " + warning.limitMeters + " m"));
  if (warning.cyclesCrossed > 1) {
    detail.append(document.createTextNode(" (" + warning.cyclesCrossed + " cicli superati)"));
  }

  const badge = document.createElement("div");
  badge.className = "cycle-badge";
  const badgeLabel = document.createElement("span");
  badgeLabel.textContent = "CICLO";
  const badgeValue = document.createElement("strong");
  badgeValue.textContent = String(warning.cycle);
  badge.append(badgeLabel, badgeValue);

  const timer = document.createElement("div");
  timer.className = "timer";
  panel.append(portrait, copy, detail, badge, timer);
  app.replaceChildren(panel);
  hideTimer = window.setTimeout(() => app.replaceChildren(), AUTO_CLOSE_MS);
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(SPEED_WARNING_CHANNEL, (event) => {
    if (event?.data?.type === "show-speed-warning") renderWarning(event.data);
  });
});