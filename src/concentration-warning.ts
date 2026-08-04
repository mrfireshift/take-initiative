import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { resolveReminder } from "./reminderResolution.js";

const POPOVER_ID = ID + "/concentration-warning-modal";
const AUTO_CLOSE_MS = 6000;

type Warning = {
  name: string;
  damage: number;
  dc: number;
  portrait: string;
  attitude: string;
  spellName: string;
  notice: any;
};

let hideTimer = 0;
let activeWarnings: Warning[] = [];

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
      spellName: String(warning?.spellName || "").trim().slice(0, 240),
      notice: warning?.notice && typeof warning.notice === "object" ? warning.notice : null,
    })).filter((warning: Warning) => warning.damage > 0);
  } catch {
    return [];
  }
}

function closePopover() {
  window.clearTimeout(hideTimer);
  void OBR.popover.close(POPOVER_ID).catch(() => {});
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
          const result = await resolveReminder({ notice: warning.notice, outcome });
          if (result.status === "applied" || result.status === "already-resolved") {
            const remaining = activeWarnings.filter((entry) =>
              String(entry.notice?.activationId || "") !== activationId,
            );
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
        button.addEventListener("click", () => void resolve(outcome));
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
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  render(String(role || "PLAYER").toUpperCase());
});
