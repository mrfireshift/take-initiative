// The players assigned to the characters, remembered in the room across scenes (audit online, lot O3). Room metadata
// are shared with every extension and capped near 16 kB, so the room keeps a short map only: a hash of the character
// (its card profile identity, else its name) → the Owlbear user id. Names and colours stay in the GM's browser.
// Pure: the SDK and the storage are the callers'.
import { normalizedItemName } from "./factionRegistryCore.js";
import { actorProfileIdFromItem } from "./actorIdentityCore.js";
import { jsonBytes, ROOM_METADATA_DOMAIN_MAX_BYTES } from "./roomMetadataBudget.js";
import {
  assignablePlayers,
  isPlayerAssignmentValue,
  normalizePlayerAssignment,
  playerAssignmentOfItem,
  PLAYER_ASSIGNMENT_NONE,
} from "./playerAssignmentCore.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const MEMORY_KEY_PATTERN = /^[an][0-9a-z]{1,8}$/;

// FNV-1a, 32 bit, in base 36: a few characters, stable across browsers. Collisions among a party's characters are
// negligible, and the worst case is a token proposed to the wrong player, which the GM corrects from the menu.
function shortHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// The character's key: "a…" from the card profile identity, "n…" from the name, "" when the token has neither.
export function playerMemoryKeyOfItem(item) {
  const actorProfileId = actorProfileIdFromItem(item);
  if (actorProfileId) return `a${shortHash(actorProfileId)}`;
  const name = normalizedItemName(item?.name);
  return name ? `n${shortHash(name)}` : "";
}

export function normalizePlayerAssignmentMemory(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, userId] of Object.entries(value)) {
    const id = String(userId || "");
    if (MEMORY_KEY_PATTERN.test(key) && id !== PLAYER_ASSIGNMENT_NONE && isPlayerAssignmentValue(id)) result[key] = id;
  }
  return result;
}

// The memory after one assignment: the newest goes last, so the budget drops the oldest first. null forgets it.
export function playerAssignmentMemoryWith(memory, key, userId) {
  const next = { ...normalizePlayerAssignmentMemory(memory) };
  if (!MEMORY_KEY_PATTERN.test(String(key || ""))) return next;
  delete next[key];
  const id = String(userId || "");
  if (id && id !== PLAYER_ASSIGNMENT_NONE && isPlayerAssignmentValue(id)) next[key] = id;
  return next;
}

export function retainPlayerAssignmentMemoryWithinByteBudget(
  memory,
  maxBytes = ROOM_METADATA_DOMAIN_MAX_BYTES["player-assignments"],
) {
  const entries = Object.entries(normalizePlayerAssignmentMemory(memory));
  while (entries.length && jsonBytes(Object.fromEntries(entries)) > maxBytes) entries.shift();
  return Object.fromEntries(entries);
}

// Lot GA2 of docs/STUDIO_GIOCO_ONLINE.md: the keys a token's character may be remembered under, in order. Its own key;
// for a token with no identity yet, the one of the character the card registry finds for it (registryActorProfileId:
// by image, then by name, as the card's hydration does); then its name.
export function playerMemoryKeysOfItem(item, registryActorProfileId = "") {
  const keys = [];
  const registryId = String(registryActorProfileId || "").trim();
  if (!actorProfileIdFromItem(item) && registryId) keys.push(`a${shortHash(registryId)}`);
  keys.push(playerMemoryKeyOfItem(item));
  const name = normalizedItemName(item?.name);
  if (name) keys.push(`n${shortHash(name)}`);
  return [...new Set(keys.filter(Boolean))];
}

function rememberedUserId(item, memory, registryActorProfileId) {
  const known = normalizePlayerAssignmentMemory(memory);
  const key = playerMemoryKeysOfItem(item, registryActorProfileId).find((candidate) => known[candidate]);
  return key ? known[key] : "";
}

// The player to give a token from the memory: a character or an ally without a player yet, whose key the memory
// knows. Name and colour come from the connected players, else from the GM's browser, else a plain label.
export function rememberedPlayerForItem(item, memory, { players = [], localNames = {}, registryActorProfileId = "" } = {}) {
  const meta = item?.metadata?.[META_KEY];
  if (!meta || !["pc", "ally"].includes(meta.attitude)) return null;
  if (playerAssignmentOfItem(item)) return null;
  const userId = rememberedUserId(item, memory, registryActorProfileId);
  if (!userId) return null;
  const connected = (Array.isArray(players) ? players : []).find((player) => player?.id === userId);
  const local = localNames && typeof localNames === "object" ? localNames[userId] : null;
  return normalizePlayerAssignment({
    id: userId,
    name: connected?.name || local?.name || "Giocatore",
    color: connected?.color || local?.color || "",
  });
}

// GA2: a character's token the tracker does not know yet (dragged from the library onto a new map, no plugin metadata):
// the remembered player's user id to make its Owlbear owner, so that they move it before it joins the initiative. Its
// assignment comes when it does. "" when nothing is remembered for it, or it already is theirs.
export function rememberedOwnerForItem(item, memory, { registryActorProfileId = "" } = {}) {
  if (!item?.id || item.layer !== "CHARACTER" || item.type !== "IMAGE" || item.attachedTo) return "";
  if (item.metadata?.[META_KEY]) return "";
  const userId = rememberedUserId(item, memory, registryActorProfileId);
  return userId && String(item.createdUserId || "") !== userId ? userId : "";
}

// Lot GA3: the GM gave a character's or an ally's token to a player from Owlbear's Owner menu. The connected player to
// assign and remember, or null: an owner that is no connected player (the GM, someone gone; decision G4: the
// assignment stays), a token the tracker does not know as a character or an ally, a token already assigned to them.
export function adoptedOwnerForItem(item, players = []) {
  const meta = item?.metadata?.[META_KEY];
  if (!meta || !["pc", "ally"].includes(meta.attitude)) return null;
  const ownerId = String(item?.createdUserId || "");
  if (!ownerId || playerAssignmentOfItem(item)?.id === ownerId) return null;
  return assignablePlayers(players).find((player) => player.id === ownerId) || null;
}

// The GM's browser keeps the names and colours of the players it has seen (user id → { name, color }).
export function localPlayerNamesWith(names, player) {
  const normalized = normalizePlayerAssignment(player);
  const next = names && typeof names === "object" && !Array.isArray(names) ? { ...names } : {};
  if (normalized) next[normalized.id] = { name: normalized.name, color: normalized.color };
  return next;
}
