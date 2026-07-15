import OBR from "@owlbear-rodeo/sdk";
import defaults from "./initiative-cards.json";
import { ID } from "./constants.js";
import { withItemMetaHistory } from "./history.js";
import { normalizeSpeedMeters } from "./speedCheckCore.js";

const META_KEY = `${ID}/meta`;
const ROOM_CARD_KEY = `${ID}/initiativeCards`;
export const INITIATIVE_CARD_FIELD = "initiativeCard";
export const SAVE_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

export function initiativeCardNameKey(name) {
  return String(name || "")
    .replace(/^(\(\d+\)\s*)+/, "")
    .trim()
    .toLocaleLowerCase("it");
}

function optionalInteger(value, min, max) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function sanitizeInitiativeCard(value) {
  const source = value && typeof value === "object" ? value : {};
  const saves = source.savingThrows && typeof source.savingThrows === "object"
    ? source.savingThrows
    : {};
  return {
    armorClass: optionalInteger(source.armorClass, 0, 99),
    passivePerception: optionalInteger(source.passivePerception, 0, 99),
    speed: normalizeSpeedMeters(source.speed),
    savingThrows: Object.fromEntries(
      SAVE_KEYS.map((key) => [key, optionalInteger(saves[key], -99, 99)])
    ),
  };
}

const defaultsByName = new Map(
  Object.entries(defaults || {}).map(([name, value]) => [
    initiativeCardNameKey(name),
    value,
  ])
);

function mergeProfile(base, value) {
  if (!value || typeof value !== "object") return sanitizeInitiativeCard(base);
  const cleanBase = sanitizeInitiativeCard(base);
  const cleanValue = sanitizeInitiativeCard(value);
  return {
    armorClass: value.armorClass !== undefined ? cleanValue.armorClass : cleanBase.armorClass,
    passivePerception: value.passivePerception !== undefined
      ? cleanValue.passivePerception
      : cleanBase.passivePerception,
    speed: value.speed !== undefined ? cleanValue.speed : cleanBase.speed,
    savingThrows: Object.fromEntries(SAVE_KEYS.map((key) => [
      key,
      value.savingThrows?.[key] !== undefined
        ? cleanValue.savingThrows[key]
        : cleanBase.savingThrows[key],
    ])),
  };
}

function profileWithDefaults(name, value) {
  const base = defaultsByName.get(initiativeCardNameKey(name)) || {};
  return mergeProfile(base, value);
}

function roomEntryProfile(entry) {
  if (!entry || typeof entry !== "object") return null;
  return entry.profile && typeof entry.profile === "object" ? entry.profile : entry;
}

async function updateRoomCards(updater) {
  const metadata = await OBR.room.getMetadata();
  const previous = metadata?.[ROOM_CARD_KEY];
  const registry = previous && typeof previous === "object" ? { ...previous } : {};
  const next = updater(registry) || registry;
  await OBR.room.setMetadata({ ...metadata, [ROOM_CARD_KEY]: next });
  return next;
}

async function writeTokenProfile(itemId, storedProfile) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const meta = { ...(item.metadata?.[META_KEY] || {}) };
    meta[INITIATIVE_CARD_FIELD] = storedProfile;
    item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
  });
}

async function removeTokenProfile(itemId) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const meta = { ...(item.metadata?.[META_KEY] || {}) };
    delete meta[INITIATIVE_CARD_FIELD];
    item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
  });
}

export function getInitiativeCard(item) {
  const storedRaw = item?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  return profileWithDefaults(item?.name, storedRaw);
}

export async function loadInitiativeCard(item, { hydrate = false } = {}) {
  const metadata = await OBR.room.getMetadata();
  const registry = metadata?.[ROOM_CARD_KEY];
  const key = initiativeCardNameKey(item?.name);
  const roomEntry = registry && typeof registry === "object" ? registry[key] : null;
  const roomProfile = roomEntryProfile(roomEntry);
  const roomDeleted = roomEntry?.deleted === true;
  const hasRoomVersion = !!roomProfile || roomDeleted;
  const roomUpdatedAt = Math.max(0, Number(roomEntry?.updatedAt) || 0);
  const tokenRaw = item?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  const hasTokenProfile = !!(tokenRaw && typeof tokenRaw === "object");
  const tokenUpdatedAt = Math.max(0, Number(tokenRaw?.updatedAt) || 0);

  const roomWins = hasRoomVersion && (!hasTokenProfile || roomUpdatedAt >= tokenUpdatedAt);
  const winner = roomWins ? (roomDeleted ? null : roomProfile) : (hasTokenProfile ? tokenRaw : null);
  const profile = profileWithDefaults(item?.name, winner);

  if (hydrate && key && (hasRoomVersion || hasTokenProfile)) {
    const updatedAt = roomWins
      ? (roomUpdatedAt || Date.now())
      : (tokenUpdatedAt || Date.now());
    if (roomWins && roomDeleted) {
      if (hasTokenProfile) await removeTokenProfile(item.id);
      return profile;
    }
    const cleanWinner = sanitizeInitiativeCard(winner);
    const storedProfile = { ...cleanWinner, updatedAt };
    const needsRoomSync = !roomProfile || !roomWins || roomUpdatedAt !== updatedAt;
    const needsTokenSync = !hasTokenProfile || tokenUpdatedAt !== updatedAt ||
      JSON.stringify(sanitizeInitiativeCard(tokenRaw)) !== JSON.stringify(cleanWinner);

    if (needsRoomSync) {
      await updateRoomCards((next) => {
        next[key] = {
          name: String(item?.name || ""),
          profile: cleanWinner,
          updatedAt,
        };
        return next;
      });
    }
    if (needsTokenSync) await writeTokenProfile(item.id, storedProfile);
  }

  return profile;
}

export function hasInitiativeCardValues(profile) {
  return profile?.armorClass !== null ||
    profile?.passivePerception !== null ||
    profile?.speed !== null ||
    SAVE_KEYS.some((key) => profile?.savingThrows?.[key] !== null);
}

export async function saveInitiativeCard(itemId, name, value) {
  const profile = sanitizeInitiativeCard(value);
  const key = initiativeCardNameKey(name);
  if (!key) throw new Error("Nome del personaggio non valido");
  const updatedAt = Date.now();
  const storedProfile = { ...profile, updatedAt };

  await withItemMetaHistory({
    kind: "initiative-card",
    label: `Scheda iniziativa: ${String(name || "Personaggio")}`,
    itemIds: [itemId],
    fields: [INITIATIVE_CARD_FIELD],
  }, async () => {
    await updateRoomCards((next) => {
      next[key] = { name: String(name || ""), profile, updatedAt };
      return next;
    });
    await writeTokenProfile(itemId, storedProfile);
  });
  return profile;
}

export async function syncInitiativeCardRegistryFromItems(itemIds) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  if (!ids.length) return;
  const items = await OBR.scene.items.getItems(ids);
  if (!items.length) return;
  const stampById = new Map();

  await updateRoomCards((next) => {
    let offset = 0;
    for (const item of items) {
      const key = initiativeCardNameKey(item.name);
      if (!key) continue;
      const raw = item.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
      if (!raw || typeof raw !== "object") {
        next[key] = {
          name: String(item.name || ""),
          deleted: true,
          updatedAt: Date.now() + offset++,
        };
        continue;
      }
      const updatedAt = Date.now() + offset++;
      const profile = sanitizeInitiativeCard(raw);
      next[key] = { name: String(item.name || ""), profile, updatedAt };
      stampById.set(item.id, { ...profile, updatedAt });
    }
    return next;
  });

  if (stampById.size) {
    await OBR.scene.items.updateItems([...stampById.keys()], (drafts) => {
      for (const item of drafts) {
        const stored = stampById.get(item.id);
        if (!stored) continue;
        const meta = { ...(item.metadata?.[META_KEY] || {}) };
        meta[INITIATIVE_CARD_FIELD] = stored;
        item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
      }
    });
  }
}
