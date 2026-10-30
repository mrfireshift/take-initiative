// Which player plays a token (audit online, lot O3). The GM lays out every token, the characters' too, and assigns
// each to a connected player from the card menu («Giocatore ›», Online room profile only). The assignment lives in
// the plugin metadata of the token, merged; the writer also makes that player the token's Owlbear owner, so that with
// the room permission Owner Only the player moves their own token alone. Pure: the SDK is the callers'.
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

export const PLAYER_ASSIGNMENT_FIELD = "assignedPlayer";
export const PLAYER_ASSIGNMENT_NONE = "none";
export const OWNER_ONLY_PERMISSION = "CHARACTER_OWNER_ONLY";
// Without it a player cannot move any character, theirs included (found in the room test of 30/10).
export const CHARACTER_UPDATE_PERMISSION = "CHARACTER_UPDATE";
const PLAYER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

export function isPlayerAssignmentValue(value) {
  const text = String(value || "");
  return text === PLAYER_ASSIGNMENT_NONE || PLAYER_ID_PATTERN.test(text);
}

export function normalizePlayerAssignment(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "");
  if (!PLAYER_ID_PATTERN.test(id)) return null;
  const name = String(value.name || "").trim().slice(0, 60);
  const color = /^#[0-9a-fA-F]{3,8}$/.test(String(value.color || "")) ? String(value.color) : "";
  return { id, name, color };
}

export function playerAssignmentOfItem(item) {
  return normalizePlayerAssignment(item?.metadata?.[META_KEY]?.[PLAYER_ASSIGNMENT_FIELD]);
}

// The plugin metadata of a token with its player set (null clears it); every other field is kept.
export function pluginMetaWithPlayerAssignment(metadata, player) {
  const meta = metadata?.[META_KEY] && typeof metadata[META_KEY] === "object" ? metadata[META_KEY] : {};
  const next = { ...meta };
  const normalized = normalizePlayerAssignment(player);
  if (normalized) next[PLAYER_ASSIGNMENT_FIELD] = normalized;
  else delete next[PLAYER_ASSIGNMENT_FIELD];
  return next;
}

// The players the GM can choose from: the connected ones (Owlbear's party), players only, one entry per user.
export function assignablePlayers(players) {
  const seen = new Set();
  const result = [];
  for (const player of Array.isArray(players) ? players : []) {
    if (String(player?.role || "").toUpperCase() !== "PLAYER") continue;
    const normalized = normalizePlayerAssignment(player);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    result.push({ ...normalized, name: normalized.name || "Giocatore" });
  }
  return result.sort((left, right) => left.name.localeCompare(right.name, "it"));
}

// The menu's choices: the connected players, the current one even when offline, then "Nessuno".
export function playerAssignmentMenuChoices(players, current) {
  const choices = assignablePlayers(players);
  const assigned = normalizePlayerAssignment(current);
  if (assigned && !choices.some((player) => player.id === assigned.id)) {
    choices.push({ ...assigned, name: `${assigned.name || "Giocatore"} (non collegato)` });
  }
  return [...choices, { id: PLAYER_ASSIGNMENT_NONE, name: "Nessuno", color: "" }];
}

// What a card shows of its player: the name and colour for the GM, "mine" on the player's own screen.
export function cardPlayerAssignment(player, { selfId = "", isGm = false } = {}) {
  const normalized = normalizePlayerAssignment(player);
  if (!normalized) return null;
  const mine = !isGm && !!selfId && normalized.id === String(selfId);
  return { id: normalized.id, name: normalized.name, color: normalized.color, mine };
}

export function cardPlayerAssignmentTitle(assignment) {
  if (!assignment) return "";
  return assignment.mine ? "Il tuo personaggio" : `Giocatore: ${assignment.name || "assegnato"}`;
}

// The turn notice of one player's screen (lot O4a): "current" when the creature of the turn is theirs, "next" when the
// following one is, "" otherwise. Never for the GM, whose notice stays the usual one.
export function turnNoticeForPlayer(payload, selfId, role = "PLAYER") {
  const self = String(selfId || "");
  if (!self || String(role || "").toUpperCase() === "GM") return "";
  if (String(payload?.currentPlayerId || "") === self) return "current";
  if (String(payload?.nextPlayerId || "") === self) return "next";
  return "";
}

// Reminder notices (lot O4b), Online room profile: the GM's copy for the players names the players of the creatures
// a notice is about (its target or targets, not its caster), so each screen can keep its own.
function noticeTargetIds(notice) {
  return [notice?.target?.id, ...(Array.isArray(notice?.targets) ? notice.targets.map((target) => target?.id) : [])]
    .filter(Boolean)
    .map(String);
}

export function withNoticeTargetPlayers(notices, playerIdsByTokenId) {
  const byToken = playerIdsByTokenId instanceof Map ? playerIdsByTokenId : new Map();
  if (!byToken.size) return notices;
  return (Array.isArray(notices) ? notices : []).map((notice) => {
    const playerIds = [...new Set(noticeTargetIds(notice).map((id) => byToken.get(id)).filter(Boolean))];
    return playerIds.length ? { ...notice, targetPlayerIds: playerIds } : notice;
  });
}

// Whether a notice reaches this player's screen. A death save goes to the player of the character alone (and to
// the GM, whose copy is never filtered); with «solo i miei» every reminder does. A notice about no assigned creature
// keeps going to everyone, except with «solo i miei».
export function noticeReachesPlayer(notice, selfId, { role = "PLAYER", mineOnly = false, deathSave = false } = {}) {
  if (String(role || "").toUpperCase() === "GM") return true;
  const playerIds = Array.isArray(notice?.targetPlayerIds) ? notice.targetPlayerIds.map(String) : [];
  const mine = !!selfId && playerIds.includes(String(selfId));
  if (mineOnly) return mine;
  if (deathSave && playerIds.length) return mine;
  return true;
}
