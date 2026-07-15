import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const CHANNEL = ID + "/turn-notice";
const AUTO_CLOSE_MS = 4500;
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCurrent();
});

OBR.onReady(() => {
  OBR.broadcast.onMessage(CHANNEL, (event) => {
    if (event?.data?.type === "show-turn-notice") showNotice(event.data);
  });
});