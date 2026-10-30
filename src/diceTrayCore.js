// The dice tray's form (docs/PIANO_DADI_ONLINE.md, lot D-3): the dice buttons edit the formula written in the field,
// and the history of this browser's session. Pure: no SDK, no DOM.
import {
  DICE_ROLL_HISTORY_LIMIT,
  diceRollHistoryWith,
  formatDiceFormula,
  normalizeDiceRollRecord,
  parseDiceFormula,
} from "./diceCore.js";
import { ID } from "./constants.js";

// Lot D-4: a roll goes to the other screens on this channel; the roller's latest one also stays in the roller's
// player metadata, where a screen that opens later reads it (Owlbear Rodeo Dice does the same).
export const DICE_ROLL_CHANNEL = `${ID}/dice/roll`;
export const DICE_NOTICE_DONE_CHANNEL = `${ID}/dice/notice-done`;
export const DICE_LAST_ROLL_KEY = `${ID}/dice/last-roll`;

const EMPTY = Object.freeze({ ok: true, groups: [], modifier: 0 });

function editable(text) {
  if (!String(text ?? "").trim()) return EMPTY;
  const parsed = parseDiceFormula(text);
  if (parsed.ok) return parsed;
  // A modifier alone ("+3") is not a roll yet, but the buttons can still add dice to it.
  const flat = /^\s*([+-]?\d+)\s*$/.exec(String(text));
  return flat ? { ok: true, groups: [], modifier: Number(flat[1]) } : null;
}

// The formula after a click on a die's button: +1 die, or −1 with a right click. A plain group of that die (no keep,
// added) grows or shrinks; otherwise one is added at the end. A formula the field cannot read stays as it is.
export function formulaWithDie(text, sides, delta = 1) {
  const parsed = editable(text);
  if (!parsed) return String(text ?? "");
  const groups = parsed.groups.map((group) => ({ ...group }));
  const plain = groups.find((group) => group.sides === sides && group.sign > 0 && !group.keep);
  if (plain) plain.count = Math.max(0, plain.count + delta);
  else if (delta > 0) groups.push({ count: delta, sides, sign: 1, keep: null });
  const kept = groups.filter((group) => group.count > 0);
  if (!kept.length) return parsed.modifier ? String(parsed.modifier) : "";
  return formatDiceFormula({ ok: true, groups: kept, modifier: parsed.modifier });
}

// How many dice of each kind the formula throws (the buttons' badges).
export function diceCountsOf(text) {
  const parsed = editable(text);
  const counts = {};
  for (const group of parsed?.groups || []) counts[group.sides] = (counts[group.sides] || 0) + group.count;
  return counts;
}

export const DICE_SESSION_HISTORY_KEY = "com.thebigpicture.initiative/dice-history";

export function readDiceSessionHistory(storage = globalThis.sessionStorage) {
  try {
    const value = JSON.parse(storage?.getItem(DICE_SESSION_HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, DICE_ROLL_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberDiceRoll(record, storage = globalThis.sessionStorage) {
  const next = diceRollHistoryWith(readDiceSessionHistory(storage), record);
  try { storage?.setItem(DICE_SESSION_HISTORY_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// "Mario · Eroe" — who rolled, and the character when one is assigned.
export function diceRollAuthor(record) {
  return [record?.playerName, record?.character].filter(Boolean).join(" · ") || "Tiro";
}

// The latest roll of each player in the room (their player metadata), checked, newest first.
export function lastRollsFromParty(players) {
  return (Array.isArray(players) ? players : [])
    .map((player) => normalizeDiceRollRecord(player?.metadata?.[DICE_LAST_ROLL_KEY]))
    .filter((record) => record && !record.hidden)
    .sort((left, right) => right.at - left.at);
}

// The character a player plays in this scene (lot O3): the name of a token assigned to them, if any.
export function assignedCharacterName(items, playerId, metaKey = `${ID}/meta`) {
  if (!playerId) return "";
  const token = (Array.isArray(items) ? items : []).find((item) => item?.metadata?.[metaKey]?.assignedPlayer?.id === playerId);
  return String(token?.name || "").trim();
}

// The others' rolls waiting for the replay window: one each, oldest first, the newest few only (a burst of rolls
// would otherwise keep the window open for minutes).
export const DICE_NOTICE_QUEUE_LIMIT = 4;

export function diceNoticeQueueWith(queue, record, limit = DICE_NOTICE_QUEUE_LIMIT) {
  const current = (Array.isArray(queue) ? queue : []).filter((entry) => entry?.id !== record?.id);
  return (record?.id ? [...current, record] : current).slice(-limit);
}
