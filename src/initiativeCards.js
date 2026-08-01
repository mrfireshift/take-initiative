import OBR from "@owlbear-rodeo/sdk";
import defaults from "./initiative-cards.json";
import { ID } from "./constants.js";
import { withItemMetaHistory } from "./history.js";
import { normalizeSpeedMeters } from "./speedCheckCore.js";
import {
  getExhaustionContributionLevel,
  getExhaustionLevel,
  reconcileExhaustionCondition,
  refreshConditionLabels,
} from "./conditions.js";
import { shouldRoomInitiativeCardWin } from "./initiativeCardConflict.js";
import {
  findInitiativeCardRegistryEntry,
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardRegistryKeys,
  mergeInitiativeCardRegistries,
  normalizeInitiativeCardRegistry,
} from "./initiativeCardRegistryCore.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";
import {
  sanitizeCharacterBuild,
  sanitizeEnabledClassFeatureIds,
} from "./classFeatureCore.js";

const META_KEY = `${ID}/meta`;
const ROOM_CARD_KEY = `${ID}/initiativeCards`;
const LOCAL_CARD_KEY = `${ID}/initiativeCards/local`;
let initiativeCardWriteQueue = Promise.resolve();
let initiativeCardHydrationQueue = Promise.resolve();
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

function shortText(value, maxLength = 280) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
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
    spellSaveDC: optionalInteger(source.spellSaveDC, 0, 99),
    spellAttackBonus: optionalInteger(source.spellAttackBonus, -99, 99),
    notes: shortText(source.notes),
    exhaustion: optionalInteger(source.exhaustion, 0, 5) ?? 0,
    quickActions: sanitizeQuickActions(source.quickActions),
    characterBuild: sanitizeCharacterBuild(source.characterBuild),
    enabledClassFeatureIds: sanitizeEnabledClassFeatureIds(source.enabledClassFeatureIds),
    classFeaturesConfigured: source.classFeaturesConfigured === true,
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
    spellSaveDC: value.spellSaveDC !== undefined
      ? cleanValue.spellSaveDC
      : cleanBase.spellSaveDC,
    spellAttackBonus: value.spellAttackBonus !== undefined
      ? cleanValue.spellAttackBonus
      : cleanBase.spellAttackBonus,
    notes: value.notes !== undefined ? cleanValue.notes : cleanBase.notes,
    exhaustion: value.exhaustion !== undefined ? cleanValue.exhaustion : cleanBase.exhaustion,
    quickActions: value.quickActions !== undefined
      ? cleanValue.quickActions
      : cleanBase.quickActions,
    characterBuild: value.characterBuild !== undefined
      ? cleanValue.characterBuild
      : cleanBase.characterBuild,
    enabledClassFeatureIds: value.enabledClassFeatureIds !== undefined
      ? cleanValue.enabledClassFeatureIds
      : cleanBase.enabledClassFeatureIds,
    classFeaturesConfigured: value.classFeaturesConfigured !== undefined
      ? cleanValue.classFeaturesConfigured
      : cleanBase.classFeaturesConfigured,
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

function readLocalInitiativeCards() {
  try {
    if (typeof localStorage === "undefined") return {};
    return normalizeInitiativeCardRegistry(
      JSON.parse(localStorage.getItem(LOCAL_CARD_KEY) || "{}")
    );
  } catch {
    return {};
  }
}

function profileWithConditionFallback(name, value, conditions) {
  const profile = profileWithDefaults(name, value);
  const hasStoredExhaustion = Object.prototype.hasOwnProperty.call(value || {}, "exhaustion");
  if (!hasStoredExhaustion) {
    profile.exhaustion = getExhaustionLevel(conditions);
  } else {
    profile.exhaustion = Math.min(
      5,
      Math.max(0, Number(profile.exhaustion) || 0) + getExhaustionContributionLevel(conditions),
    );
  }
  return profile;
}

function profileForStorage(name, value, conditions) {
  const profile = profileWithConditionFallback(name, value, conditions);
  return {
    ...profile,
    exhaustion: Math.max(
      0,
      Number(profile.exhaustion || 0) - getExhaustionContributionLevel(conditions),
    ),
  };
}

function writeLocalInitiativeCards(registry) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(
      LOCAL_CARD_KEY,
      JSON.stringify(normalizeInitiativeCardRegistry(registry))
    );
    return true;
  } catch {
    return false;
  }
}

async function readInitiativeCardRegistry() {
  const local = readLocalInitiativeCards();
  const metadata = await OBR.room.getMetadata().catch(() => ({}));
  return {
    metadata,
    registry: mergeInitiativeCardRegistries(local, metadata?.[ROOM_CARD_KEY]),
  };
}

async function updateRoomCards(updater) {
  const write = async () => {
    const metadata = await OBR.room.getMetadata().catch(() => ({}));
    const previous = mergeInitiativeCardRegistries(
      readLocalInitiativeCards(),
      metadata?.[ROOM_CARD_KEY]
    );
    const next = normalizeInitiativeCardRegistry(updater({ ...previous }) || previous);
    const localWritten = writeLocalInitiativeCards(next);
    try {
      await OBR.room.setMetadata({ ...metadata, [ROOM_CARD_KEY]: next });
    } catch (error) {
      if (!localWritten) throw error;
    }
    return next;
  };
  initiativeCardWriteQueue = initiativeCardWriteQueue.then(write, write);
  return initiativeCardWriteQueue;
}

async function writeTokenProfile(itemId, storedProfile) {
  let conditionsChanged = false;
  await OBR.scene.items.updateItems([itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const meta = { ...(item.metadata?.[META_KEY] || {}) };
    meta[INITIATIVE_CARD_FIELD] = storedProfile;
    const previousConditions = meta.conditions;
    const nextConditions = reconcileExhaustionCondition(
      previousConditions,
      storedProfile?.exhaustion,
      item.id
    );
    conditionsChanged = JSON.stringify(previousConditions || null) !== JSON.stringify(nextConditions);
    if (nextConditions) meta.conditions = nextConditions;
    else delete meta.conditions;
    item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
  });
  if (conditionsChanged) await refreshConditionLabels([itemId]);
}

async function removeTokenProfile(itemId) {
  let conditionsChanged = false;
  await OBR.scene.items.updateItems([itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const meta = { ...(item.metadata?.[META_KEY] || {}) };
    delete meta[INITIATIVE_CARD_FIELD];
    const previousConditions = meta.conditions;
    const nextConditions = reconcileExhaustionCondition(previousConditions, 0, item.id);
    conditionsChanged = JSON.stringify(previousConditions || null) !== JSON.stringify(nextConditions);
    if (nextConditions) meta.conditions = nextConditions;
    else delete meta.conditions;
    item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
  });
  if (conditionsChanged) await refreshConditionLabels([itemId]);
}

export function getInitiativeCard(item) {
  const storedRaw = item?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  return profileWithConditionFallback(item?.name, storedRaw, conditions);
}

export async function loadInitiativeCard(item, { hydrate = false } = {}) {
  const { registry } = await readInitiativeCardRegistry();
  const keys = initiativeCardRegistryKeys(item);
  const roomEntry = findInitiativeCardRegistryEntry(registry, item);
  const roomProfile = roomEntryProfile(roomEntry);
  const roomDeleted = roomEntry?.deleted === true;
  const hasRoomVersion = !!roomProfile || roomDeleted;
  const roomUpdatedAt = Math.max(0, Number(roomEntry?.updatedAt) || 0);
  const tokenRaw = item?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  const tokenConditions = item?.metadata?.[META_KEY]?.conditions;
  const legacyExhaustion = getExhaustionLevel(tokenConditions);
  const hasTokenProfile = !!(tokenRaw && typeof tokenRaw === "object");
  const tokenUpdatedAt = Math.max(0, Number(tokenRaw?.updatedAt) || 0);
  const roomHasValues = !roomDeleted && !!roomProfile &&
    hasInitiativeCardValues(sanitizeInitiativeCard(roomProfile));
  const tokenHasValues = hasTokenProfile &&
    hasInitiativeCardValues(sanitizeInitiativeCard(tokenRaw));

  // Tra una copia compilata e una vuota preserviamo sempre quella compilata:
  // così una nuova scena non azzera il registro e una vecchia scena può anche
  // ripararlo. Tra copie equivalenti, e per le cancellazioni esplicite, resta
  // determinante il timestamp.
  const roomWins = shouldRoomInitiativeCardWin({
    hasRoomVersion,
    hasTokenProfile,
    roomDeleted,
    roomHasValues,
    tokenHasValues,
    roomUpdatedAt,
    tokenUpdatedAt,
  });
  const winner = roomWins ? (roomDeleted ? null : roomProfile) : (hasTokenProfile ? tokenRaw : null);
  const profile = profileWithConditionFallback(item?.name, winner, tokenConditions);

  if (hydrate && keys.length && (hasRoomVersion || hasTokenProfile || legacyExhaustion > 0)) {
    const updatedAt = roomWins
      ? (roomUpdatedAt || Date.now())
      : (tokenUpdatedAt || Date.now());
    if (roomWins && roomDeleted) {
      if (hasTokenProfile) await removeTokenProfile(item.id);
      return profile;
    }
    const cleanWinner = sanitizeInitiativeCard(
      profileForStorage(item?.name, winner, tokenConditions)
    );
    const storedProfile = { ...cleanWinner, updatedAt };
    const needsTokenSync = !hasTokenProfile || tokenUpdatedAt !== updatedAt ||
      JSON.stringify(sanitizeInitiativeCard(tokenRaw)) !== JSON.stringify(cleanWinner);
    const desiredConditions = reconcileExhaustionCondition(
      tokenConditions,
      cleanWinner.exhaustion,
      item.id
    );
    const needsConditionSync = JSON.stringify(tokenConditions || null) !==
      JSON.stringify(desiredConditions);

    // Read-through migration: ogni apertura GM riallinea chiave asset, fallback
    // nome, metadata stanza e backup locale, anche per schede legacy.
    await updateRoomCards((next) => {
      const entry = {
        name: String(item?.name || ""),
        profile: cleanWinner,
        updatedAt,
      };
      for (const key of keys) next[key] = entry;
      return next;
    });
    if (needsTokenSync || needsConditionSync) await writeTokenProfile(item.id, storedProfile);
  }

  return profile;
}

export function restoreInitiativeCardQuickActionsFromMemory(itemIds) {
  const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
  if (!ids.length) return Promise.resolve([]);

  const restore = async () => {
    const items = await OBR.scene.items.getItems(ids);
    if (!items.length) return [];
    const { registry } = await readInitiativeCardRegistry();
    const candidates = initiativeCardQuickActionMemoryCandidates(items, registry, {
      metadataKey: META_KEY,
      profileField: INITIATIVE_CARD_FIELD,
    });
    const restoredIds = [];
    for (const item of candidates) {
      const profile = await loadInitiativeCard(item, { hydrate: true });
      if (profile.quickActions.length) restoredIds.push(item.id);
    }
    return restoredIds;
  };

  initiativeCardHydrationQueue = initiativeCardHydrationQueue.then(restore, restore);
  return initiativeCardHydrationQueue;
}

export function hasInitiativeCardValues(profile) {
  return profile?.armorClass !== null ||
    profile?.passivePerception !== null ||
    profile?.speed !== null ||
    profile?.spellSaveDC !== null ||
    profile?.spellAttackBonus !== null ||
    Boolean(profile?.notes) ||
    Number(profile?.exhaustion) > 0 ||
    Array.isArray(profile?.quickActions) && profile.quickActions.length > 0 ||
    Array.isArray(profile?.characterBuild) && profile.characterBuild.length > 0 ||
    Array.isArray(profile?.enabledClassFeatureIds) && profile.enabledClassFeatureIds.length > 0 ||
    SAVE_KEYS.some((key) => profile?.savingThrows?.[key] !== null);
}

export async function saveInitiativeCard(itemId, name, value) {
  const profile = sanitizeInitiativeCard(value);
  const [sourceItem] = await OBR.scene.items.getItems([itemId]).catch(() => []);
  const contributionLevel = getExhaustionContributionLevel(
    sourceItem?.metadata?.[META_KEY]?.conditions
  );
  const storedBaseProfile = {
    ...profile,
    exhaustion: Math.max(0, Number(profile.exhaustion || 0) - contributionLevel),
  };
  const identity = sourceItem || { name };
  const keys = initiativeCardRegistryKeys(identity);
  if (!keys.length) throw new Error("Identità del personaggio non valida");
  const updatedAt = Date.now();
  const storedProfile = { ...storedBaseProfile, updatedAt };

  await withItemMetaHistory({
    kind: "initiative-card",
    label: `Scheda iniziativa: ${String(name || "Personaggio")}`,
    itemIds: [itemId],
    fields: [INITIATIVE_CARD_FIELD, "conditions"],
  }, async () => {
    await updateRoomCards((next) => {
      const entry = {
        name: String(sourceItem?.name || name || ""),
        profile: storedBaseProfile,
        updatedAt,
      };
      for (const key of keys) next[key] = entry;
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
      const keys = initiativeCardRegistryKeys(item);
      if (!keys.length) continue;
      const raw = item.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
      if (!raw || typeof raw !== "object") {
        const entry = {
          name: String(item.name || ""),
          deleted: true,
          updatedAt: Date.now() + offset++,
        };
        for (const key of keys) next[key] = entry;
        continue;
      }
      const updatedAt = Date.now() + offset++;
      const profile = profileForStorage(
        item.name,
        raw,
        item.metadata?.[META_KEY]?.conditions
      );
      const entry = { name: String(item.name || ""), profile, updatedAt };
      for (const key of keys) next[key] = entry;
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
