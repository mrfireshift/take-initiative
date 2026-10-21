// Rimebound Link: the GM's popover card (the model of the speed warning). The payload is the card built by
// bossLinkNoticeCard: tone, eyebrow, title, lines, badge, the boss's name and portrait.
import OBR from "@owlbear-rodeo/sdk";
import { BOSS_LINK_NOTICE_POPOVER_ID } from "./bossLinkNoticeHost.js";

const AUTO_CLOSE_MS = 8000;
let hideTimer = 0;

type Line = { strong: string; text: string };
type Card = { tone: "active" | "broken"; eyebrow: string; title: string; lines: Line[]; badge: { label: string; value: string }; name: string; portrait: string };

function cardFromURL(): Card | null {
  try {
    const value = JSON.parse(new URLSearchParams(window.location.search).get("payload") || "");
    const text = (entry: unknown, max: number) => String(entry ?? "").trim().slice(0, max);
    const lines = (Array.isArray(value?.lines) ? value.lines : []).slice(0, 4)
      // The line text keeps its leading space (it follows the bold name).
      .map((line: any) => ({ strong: text(line?.strong, 80), text: String(line?.text ?? "").slice(0, 200) })).filter((line: Line) => line.strong || line.text.trim());
    if (!lines.length) return null;
    return {
      tone: value?.tone === "broken" ? "broken" : "active",
      eyebrow: text(value?.eyebrow, 80),
      title: text(value?.title, 80) || "Rimebound Link",
      lines,
      badge: { label: text(value?.badge?.label, 12), value: text(value?.badge?.value, 4) },
      name: text(value?.name, 80) || "Auril",
      portrait: text(value?.portrait, 2048),
    };
  } catch {
    return null;
  }
}

function closePopover() {
  window.clearTimeout(hideTimer);
  void OBR.popover.close(BOSS_LINK_NOTICE_POPOVER_ID).catch(() => {});
}

function node(tag: string, className: string, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function renderCard(card: Card | null) {
  const app = document.getElementById("app");
  if (!app || !card) {
    closePopover();
    return;
  }
  const panel = node("section", `warning${card.tone === "broken" ? " broken" : ""}`);
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-label", `${card.title}: ${card.lines.map((line) => line.strong + line.text).join(" ")}`);
  panel.title = "Clic per chiudere";
  panel.addEventListener("click", closePopover);

  const portrait = node("div", "portrait");
  const fallback = node("div", "portrait-fallback", card.name.slice(0, 1).toUpperCase() || "?");
  portrait.appendChild(fallback);
  if (card.portrait) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = card.portrait;
    image.addEventListener("load", () => fallback.remove());
    image.addEventListener("error", () => image.remove());
    portrait.appendChild(image);
  }

  const copy = node("div", "copy");
  copy.append(node("div", "eyebrow", card.eyebrow), node("div", "title", card.title));

  const detail = node("div", "detail");
  for (const line of card.lines) {
    const paragraph = document.createElement("p");
    if (line.strong) paragraph.appendChild(node("strong", "", line.strong));
    paragraph.appendChild(document.createTextNode(line.text));
    detail.appendChild(paragraph);
  }

  const badge = node("div", "round-badge");
  badge.append(node("span", "", card.badge.label), node("strong", "", card.badge.value));

  panel.append(portrait, copy, detail, badge, node("div", "timer"));
  app.replaceChildren(panel);
  hideTimer = window.setTimeout(closePopover, AUTO_CLOSE_MS);
}

OBR.onReady(() => {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });
  renderCard(cardFromURL());
});
