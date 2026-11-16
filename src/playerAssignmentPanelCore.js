// Lot GA4 of docs/STUDIO_GIOCO_ONLINE.md: the «Giocatori» panel of the Options, Online room profile only. The room's
// characters (the card registry, without the monsters' stat blocks, and the characters and allies of the current
// scene) with the player each is remembered for; the GM chooses without a token and without a scene. It writes the
// same room memory as the card menu (playerAssignmentMemoryCore.js). Pure: the SDK and the storage are the callers'.
import { normalizedItemName } from "./factionRegistryCore.js";
import { actorProfileIdFromItem, actorProfileIdFromRegistryEntry } from "./actorIdentityCore.js";
import { isMonsterProfileCard } from "./monsterProfileCore.js";
import { assignablePlayers, normalizePlayerAssignment, playerAssignmentOfItem } from "./playerAssignmentCore.js";
import {
  normalizePlayerAssignmentMemory,
  playerAssignmentMemoryWith,
  playerMemoryKeysOfItem,
} from "./playerAssignmentMemoryCore.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;

function trackedCharacter(item) {
  const meta = item?.metadata?.[META_KEY];
  return !!meta && ["pc", "ally"].includes(meta.attitude) && item.layer === "CHARACTER" && !item.attachedTo;
}

// The rows, one per character: { id, name, actorProfileId, keys, writeKey, userId }. keys are the memory keys the
// character may be remembered under (its identity's, its name's), writeKey the one a choice is saved under.
// `registryActorOf(item)` gives the identity the card registry recognises for a scene token that has none.
// `orphanKeys`: remembered keys no row explains (a character whose card is gone), which the GM may forget.
export function playerAssignmentPanelRows(registry, memory, { items = [], registryActorOf = () => "" } = {}) {
  const known = normalizePlayerAssignmentMemory(memory);
  const rows = new Map();
  const add = (actorProfileId, name, updatedAt = 0) => {
    const cleanName = String(name || "").trim();
    const nameKey = normalizedItemName(cleanName);
    if (!actorProfileId && !nameKey) return;
    // A character without identity yet is one with its name: a row of the same name that has one takes it.
    const id = actorProfileId ? `actor:${actorProfileId}` : `name:${nameKey}`;
    const nameTwin = !actorProfileId && [...rows.values()].find((row) => normalizedItemName(row.name) === nameKey);
    const row = rows.get(id) || nameTwin || null;
    if (row) {
      if (cleanName && Number(updatedAt || 0) >= row.updatedAt) { row.name = cleanName; row.updatedAt = Number(updatedAt || 0); }
      return;
    }
    rows.set(id, { id, name: cleanName || "Personaggio", actorProfileId: actorProfileId || "", updatedAt: Number(updatedAt || 0) });
  };
  for (const entry of Object.values(registry && typeof registry === "object" ? registry : {})) {
    if (!entry || typeof entry !== "object" || entry.deleted === true || !entry.name) continue;
    const profile = entry.profile && typeof entry.profile === "object" ? entry.profile : null;
    if (isMonsterProfileCard(profile)) continue;
    add(actorProfileIdFromRegistryEntry(entry), entry.name, entry.updatedAt);
  }
  for (const item of Array.isArray(items) ? items : []) {
    if (!trackedCharacter(item)) continue;
    add(actorProfileIdFromItem(item) || String(registryActorOf(item) || ""), item.name, -1);
  }
  // Rows without identity that a row with one already covers by name are the same character.
  for (const [id, row] of rows) {
    if (row.actorProfileId) continue;
    if ([...rows.values()].some((other) => other.actorProfileId && normalizedItemName(other.name) === normalizedItemName(row.name))) rows.delete(id);
  }
  const explained = new Set();
  const result = [...rows.values()].map((row) => {
    const keys = playerMemoryKeysOfItem({ name: row.name }, row.actorProfileId);
    for (const key of keys) explained.add(key);
    const userKey = keys.find((key) => known[key]);
    return {
      id: row.id,
      name: row.name,
      actorProfileId: row.actorProfileId,
      keys,
      writeKey: keys[0],
      userId: userKey ? known[userKey] : "",
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "it"));
  return { rows: result, orphanKeys: Object.keys(known).filter((key) => !explained.has(key)) };
}

// The memory after the GM's choice for a row: every key of the character forgotten, the choice saved under its
// identity's key (null forgets it). The newest goes last, as from the card menu.
export function playerAssignmentMemoryForRow(memory, row, userId) {
  let next = normalizePlayerAssignmentMemory(memory);
  for (const key of Array.isArray(row?.keys) ? row.keys : []) next = playerAssignmentMemoryWith(next, key, null);
  return row?.writeKey ? playerAssignmentMemoryWith(next, row.writeKey, userId || null) : next;
}

export function playerAssignmentMemoryWithout(memory, keys) {
  let next = normalizePlayerAssignmentMemory(memory);
  for (const key of Array.isArray(keys) ? keys : []) next = playerAssignmentMemoryWith(next, key, null);
  return next;
}

// The players to choose from: the connected ones, then the ones the GM's browser remembers (offline), then a
// remembered user id nobody can name. { id, name, color, connected }.
export function playerAssignmentPanelChoices(players, localNames = {}, rememberedIds = []) {
  const choices = assignablePlayers(players).map((player) => ({ ...player, connected: true }));
  const seen = new Set(choices.map((player) => player.id));
  const names = localNames && typeof localNames === "object" ? localNames : {};
  const offline = [];
  for (const [id, value] of Object.entries(names)) {
    const player = normalizePlayerAssignment({ id, name: value?.name, color: value?.color });
    if (!player || seen.has(player.id)) continue;
    seen.add(player.id);
    offline.push({ ...player, name: player.name || "Giocatore", connected: false });
  }
  for (const id of Array.isArray(rememberedIds) ? rememberedIds : []) {
    const player = normalizePlayerAssignment({ id, name: "Giocatore" });
    if (!player || seen.has(player.id)) continue;
    seen.add(player.id);
    offline.push({ ...player, connected: false });
  }
  offline.sort((left, right) => left.name.localeCompare(right.name, "it"));
  return [...choices, ...offline];
}

// The current scene's tokens of a row's character that the tracker knows and whose player differs from the choice:
// the ones the panel assigns at once. A token not in the tracker yet is the GM's background's (lot GA2).
export function playerAssignmentPanelTargets(items, row, userId, { registryActorOf = () => "" } = {}) {
  const ids = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!trackedCharacter(item)) continue;
    const actorProfileId = actorProfileIdFromItem(item) || String(registryActorOf(item) || "");
    const same = row?.actorProfileId
      ? actorProfileId === row.actorProfileId
      : !actorProfileId && normalizedItemName(item.name) === normalizedItemName(row?.name);
    if (!same) continue;
    if ((playerAssignmentOfItem(item)?.id || "") === String(userId || "")) continue;
    ids.push(item.id);
  }
  return ids;
}
