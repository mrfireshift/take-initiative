// Avvisi di reazione, lot R6 (docs/STUDIO_AVVISI_REAZIONE.md §6.14, decisions H1-H5): the GM's prompt on the players'
// screens. The GM's prompt sends what it shows (show) and when it goes (clear); a player answers (answer). Pure.
// - Table profile (R6a, the "screen" option): a read-only card on the table screen, every row of a character.
// - Online profile (R6b): each player sees only the rows of the characters they play, with Usa and Ignora; the answer
//   marks the GM's row, and only the GM writes (decision D9).
// Never a monster's reaction (decision D1): only the rows of the characters leave the GM's client. The attacker's name
// only when its token is visible.
import { ID } from "./constants.js";
import { playerAssignmentOfItem } from "./playerAssignmentCore.js";

export const REACTION_NOTICE_CHANNEL = `${ID}/reaction-prompt`;
export const REACTION_NOTICE_POPOVER_ID = `${ID}/reaction-notice`;
export const REACTION_NOTICE_TIMEOUT_MS = 60000;
export const REACTION_NOTICE_MODES = Object.freeze(["table", "online"]);
const MAX_ROWS = 8;
const META_KEY = `${ID}/meta`;

const text = (value, limit = 200) => String(value ?? "").trim().slice(0, limit);
const metaOf = (item) => item?.metadata?.[META_KEY] || {};
const isCharacter = (item) => text(metaOf(item).attitude).toLowerCase() === "pc";

// A short id for the prompt shown (its signature can be long): the same prompt keeps it.
export function reactionNoticeId(signature) {
  let hash = 5381;
  for (const char of String(signature || "")) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `rp-${hash.toString(36)}`;
}

// The players of a character: the one the GM assigned (lot O3), then its Owlbear owner.
export function reactionNoticePlayerIds(item) {
  return [...new Set([playerAssignmentOfItem(item)?.id, item?.createdUserId].map((id) => text(id, 120)).filter(Boolean))];
}

// The "why" line without the name of an attacker the players cannot see.
function visibleWhy(why, event, items) {
  const line = text(why, 300);
  const events = Array.isArray(event) ? event : event ? [event] : [];
  const byId = new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [item.id, item]));
  let result = line;
  for (const value of events) {
    const source = byId.get(text(value?.attackerId || value?.casterId || value?.moverId, 220));
    const name = text(source?.name, 80);
    if (!source || source.visible !== false || !name) continue;
    result = result.split(name).join("una creatura");
  }
  return result ? `${result[0].toUpperCase()}${result.slice(1)}` : "";
}

/**
 * What the GM's prompt sends: { type: "show", promptId, phase, mode, why, rows }, rows { key, reactorName, label,
 * effect, playerIds } of the characters only; null when no row is a character's (the caller sends a clear).
 * shown: the prompt's { phase, signature, list, items }; event: the prompt's event; effectText(candidate): its text.
 */
export function buildReactionNoticePayload({ shown = null, event = null, mode = "", effectText = () => "" } = {}) {
  if (!REACTION_NOTICE_MODES.includes(mode) || !shown?.list?.length || !shown.signature) return null;
  const byId = new Map((Array.isArray(shown.items) ? shown.items : []).filter((item) => item?.id).map((item) => [item.id, item]));
  const rows = shown.list
    .filter((candidate) => candidate?.source !== "monster" && isCharacter(byId.get(candidate?.reactorId)))
    .slice(0, MAX_ROWS)
    .map((candidate) => ({
      key: text(candidate.key, 300),
      reactorName: text(candidate.reactorName, 80),
      label: text(candidate.label, 80),
      effect: text(effectText(candidate), 200),
      playerIds: reactionNoticePlayerIds(byId.get(candidate.reactorId)),
    }));
  if (!rows.length) return null;
  return { type: "show", promptId: reactionNoticeId(shown.signature), phase: shown.phase === "after" ? "after" : "before", mode,
    why: visibleWhy(shown.list[0]?.why, event, shown.items), rows };
}

// A message read from the channel: show, clear or answer, checked; null otherwise.
export function normalizeReactionNotice(data) {
  const type = text(data?.type, 10);
  const promptId = text(data?.promptId, 40);
  if (!/^rp-[0-9a-z]{1,13}$/u.test(promptId)) return null;
  if (type === "clear") return { type, promptId };
  if (type === "answer") {
    const choice = data?.choice === "use" ? "use" : data?.choice === "ignore" ? "ignore" : "";
    const key = text(data?.key, 300);
    if (!choice || !key) return null;
    return { type, promptId, key, choice, playerId: text(data?.playerId, 120), playerName: text(data?.playerName, 60) };
  }
  if (type !== "show" || !REACTION_NOTICE_MODES.includes(data?.mode)) return null;
  const rows = (Array.isArray(data?.rows) ? data.rows : []).slice(0, MAX_ROWS).map((row) => ({
    key: text(row?.key, 300), reactorName: text(row?.reactorName, 80), label: text(row?.label, 80), effect: text(row?.effect, 200),
    playerIds: (Array.isArray(row?.playerIds) ? row.playerIds : []).map((id) => text(id, 120)).filter(Boolean),
  })).filter((row) => row.key && row.reactorName);
  if (!rows.length) return null;
  return { type, promptId, phase: data.phase === "after" ? "after" : "before", mode: data.mode, why: text(data?.why, 300), rows };
}

// The rows this player's screen shows (decision H3): every row at the table, read only; online, only this player's
// characters, with Usa and Ignora. { rows, interactive }.
export function reactionNoticeRowsFor(notice, selfId = "") {
  if (!notice || notice.type !== "show") return { rows: [], interactive: false };
  if (notice.mode === "table") return { rows: notice.rows, interactive: false };
  const self = text(selfId, 120);
  return { rows: self ? notice.rows.filter((row) => row.playerIds.includes(self)) : [], interactive: true };
}

// The popover's height for its rows (a header, a row each, the footer).
export function reactionNoticeHeight(rowCount, interactive = false) {
  const count = Math.max(1, Math.min(MAX_ROWS, Math.floor(Number(rowCount) || 1)));
  return 46 + count * (interactive ? 46 : 40) + (interactive ? 30 : 8);
}
