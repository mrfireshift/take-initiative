import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

const MODAL_ID = ID + "/concentration-warning-modal";
const AUTO_CLOSE_MS = 6000;

type Warning = {
  name: string;
  damage: number;
  dc: number;
  portrait: string;
  attitude: string;
};

function warningsFromURL(): Warning[] {
  try {
    const raw = new URLSearchParams(window.location.search).get("payload") || "";
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed?.warnings) ? parsed.warnings : []).slice(0, 20).map((warning: any) => ({
      name: String(warning?.name || "Token").trim().slice(0, 80) || "Token",
      damage: Math.max(0, Math.floor(Number(warning?.damage) || 0)),
      dc: Math.max(10, Math.floor(Number(warning?.dc) || 10)),
      portrait: String(warning?.portrait || "").trim().slice(0, 2048),
      attitude: String(warning?.attitude || "neutral").trim().toLowerCase(),
    })).filter((warning: Warning) => warning.damage > 0);
  } catch {
    return [];
  }
}

function closeModal() {
  void OBR.modal.close(MODAL_ID).catch(() => {});
}

function render() {
  const app = document.getElementById("app");
  if (!app) return;
  const warnings = warningsFromURL();
  if (!warnings.length) {
    closeModal();
    return;
  }

  const primary = warnings[0];
  const panel = document.createElement("section");
  panel.className = "warning";
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
  title.textContent = warnings.length === 1 ? "TS di Costituzione" : "Tiri salvezza richiesti";
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
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = warning.name;
    const damage = document.createElement("div");
    damage.className = "damage";
    damage.textContent = warning.damage + " danni";
    const dc = document.createElement("div");
    dc.className = "dc";
    dc.textContent = "CD " + warning.dc;
    row.append(name, damage, dc);
    list.appendChild(row);
  }

  const timer = document.createElement("div");
  timer.className = "timer";
  panel.append(portrait, copy, saveBadge, list, timer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  app.appendChild(panel);
  window.setTimeout(closeModal, AUTO_CLOSE_MS);
}

render();