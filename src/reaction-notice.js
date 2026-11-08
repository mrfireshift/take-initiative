// Avvisi di reazione, lot R6 (docs/STUDIO_AVVISI_REAZIONE.md §6.14): the page of the popover on a player's screen. At
// the table (R6a) it only says who can react, with what and why: the GM clicks. Online (R6b) the player's own rows
// have Usa and Ignora; the answer goes to the GM, whose prompt lights the row (decision H5). It writes nothing.
import OBR from "@owlbear-rodeo/sdk";
import { REACTION_NOTICE_CHANNEL, REACTION_NOTICE_POPOVER_ID, normalizeReactionNotice } from "./reactionNoticeCore.js";

const box = document.getElementById("reaction-notice");
const element = (tag, text = "", className = "") => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function readNotice() {
  try {
    const raw = JSON.parse(new URLSearchParams(location.search).get("notice") || "null");
    const notice = normalizeReactionNotice(raw);
    return notice ? { ...notice, rows: notice.rows, interactive: raw?.interactive === true, selfId: String(raw?.selfId || "") } : null;
  } catch {
    return null;
  }
}

const notice = readNotice();
let answered = false;

async function answer(row, choice, foot) {
  if (answered) return;
  answered = true;
  for (const button of box.querySelectorAll("button")) button.disabled = true;
  let playerName = "";
  try { playerName = await OBR.player.getName(); } catch {}
  try {
    await OBR.broadcast.sendMessage(REACTION_NOTICE_CHANNEL, { type: "answer", promptId: notice.promptId, key: row.key, choice,
      playerId: notice.selfId, playerName: playerName || row.reactorName }, { destination: "REMOTE" });
    foot.replaceChildren(element("span", choice === "use" ? "Inviato al GM: conferma lui." : "Il GM lo sa.", "reaction-notice-sent"));
  } catch {
    answered = false;
    for (const button of box.querySelectorAll("button")) button.disabled = false;
    foot.replaceChildren(element("span", "Non inviato: dillo al GM.", "reaction-prompt-hint"));
    return;
  }
  setTimeout(() => { void OBR.popover.close(REACTION_NOTICE_POPOVER_ID).catch(() => {}); }, 2000);
}

function render() {
  if (!box || !notice) return;
  const head = element("div", "", "reaction-prompt-head");
  const tag = element("span", "Reazione", "cost-tag reaction-prompt-tag");
  head.append(tag, element("span", notice.why, "reaction-prompt-why"));
  const foot = element("div", "", "reaction-prompt-foot");
  const rows = notice.rows.map((row) => {
    const line = element("div", "", "reaction-prompt-row");
    const body = element("div", "", "reaction-prompt-body");
    const label = element("span", "", "reaction-prompt-text");
    label.append(element("strong", row.reactorName), ` · ${row.label}`);
    body.append(label, element("span", row.effect, "reaction-prompt-effect"));
    line.append(body);
    if (notice.interactive) {
      const use = element("button", "Usa", "reaction-prompt-button reaction-prompt-use");
      use.type = "button";
      use.addEventListener("click", () => { void answer(row, "use", foot); });
      const ignore = element("button", "Ignora", "reaction-prompt-button");
      ignore.type = "button";
      ignore.addEventListener("click", () => { void answer(row, "ignore", foot); });
      line.append(use, ignore);
    }
    return line;
  });
  foot.append(element("span", notice.interactive ? "Il GM conferma la tua scelta." : "Può reagire: dillo al GM.", "reaction-prompt-hint"));
  box.replaceChildren(head, ...rows, foot);
}

render();
OBR.onReady(() => {});
