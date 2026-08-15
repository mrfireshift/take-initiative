import OBR from "@owlbear-rodeo/sdk";
import defaults from "./initiative-cards.json";
import { ID } from "./constants.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
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
  initiativeCardQuickActionMemoryEligibleItems,
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardRegistryKeys,
  mergeInitiativeCardRegistries,
  normalizeInitiativeCardRegistry,
  resolveInitiativeCardActorMatch,
} from "./initiativeCardRegistryCore.js";
import {
  ACTOR_PROFILE_ID_FIELD,
  actorProfileIdFromItem,
  actorProfileIdForCardSave,
  actorProfileIdFromProfile,
  actorProfileIdFromRegistryEntry,
  createActorProfileId,
  isLegacyActorMigrationEligible,
  normalizeActorProfileId,
} from "./actorIdentityCore.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";
import {
  sanitizeCharacterBuild,
  sanitizeEnabledClassFeatureIds,
} from "./classFeatureCore.js";
import {
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "./metadataKeyScoped.js";

const META_KEY = `${ID}/meta`;
const ROOM_CARD_KEY = `${ID}/initiativeCards`;
const LOCAL_CARD_KEY = `${ID}/initiativeCards/local`;
let initiativeCardWriteQueue = Promise.resolve();
let initiativeCardHydrationQueue = Promise.resolve();
const initiativeCardHydrationCompleted = new Set();
const initiativeCardHydrationInFlight = new Map();
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
  const normalized = {
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
  const actorProfileId = actorProfileIdFromProfile(source);
  if (actorProfileId) normalized[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
  return normalized;
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
  const merged = {
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
  const actorProfileId = actorProfileIdFromProfile(value) || actorProfileIdFromProfile(base);
  if (actorProfileId) merged[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
  return merged;
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
  const normalized = {
    ...profile,
    exhaustion: Math.max(
      0,
      Number(profile.exhaustion || 0) - getExhaustionContributionLevel(conditions),
    ),
  };
  return normalized;
}

const INITIATIVE_CARD_KNOWN_FIELDS = new Set([
  "armorClass",
  "passivePerception",
  "speed",
  "spellSaveDC",
  "spellAttackBonus",
  "notes",
  "exhaustion",
  "quickActions",
  "characterBuild",
  "enabledClassFeatureIds",
  "classFeaturesConfigured",
  "savingThrows",
  ACTOR_PROFILE_ID_FIELD,
  "updatedAt",
]);

function preserveCardProfileUnknowns(...values) {
  const unknown = {};
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [key, candidate] of Object.entries(value)) {
      if (!INITIATIVE_CARD_KNOWN_FIELDS.has(key)) unknown[key] = candidate;
    }
  }
  return unknown;
}

function mergeStoredCardProfile(base, value) {
  const merged = mergeProfile(base, value);
  const actorProfileId = actorProfileIdFromProfile(merged)
    || actorProfileIdFromProfile(value)
    || actorProfileIdFromProfile(base);
  return {
    ...preserveCardProfileUnknowns(base, value),
    ...merged,
    ...(actorProfileId ? { [ACTOR_PROFILE_ID_FIELD]: actorProfileId } : {}),
  };
}

function hasLegacyQuickActionStorage(value) {
  return Array.isArray(value?.quickActions)
    && value.quickActions.some((action) => (
      action?.kind === "spell"
      && !Object.prototype.hasOwnProperty.call(action, "launchMode")
    ));
}

function storageQuickActions(cleanProfile, sourceProfile) {
  return hasLegacyQuickActionStorage(sourceProfile)
    ? sourceProfile.quickActions
    : cleanProfile.quickActions;
}

function storageQuickActionsForHydration(...profiles) {
  const sources = profiles.filter((value) => value && typeof value === "object");
  const legacySource = sources.find((source) => (
    hasLegacyQuickActionStorage(source)
    && source.quickActions.length > 0
  ));
  if (legacySource) return legacySource.quickActions;

  for (const source of sources) {
    const actions = sanitizeQuickActions(source.quickActions);
    if (actions.length) return actions;
  }

  const explicitEmpty = sources.find((source) => (
    Object.prototype.hasOwnProperty.call(source, "quickActions")
  ));
  return explicitEmpty ? sanitizeQuickActions(explicitEmpty.quickActions) : [];
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

async function updateRoomCards(updater, { isCurrent = () => true } = {}) {
  const write = async () => {
    if (!isCurrent()) return null;
    const metadata = await OBR.room.getMetadata().catch(() => ({}));
    if (!isCurrent()) return null;
    const previous = mergeInitiativeCardRegistries(
      readLocalInitiativeCards(),
      metadata?.[ROOM_CARD_KEY]
    );
    const next = normalizeInitiativeCardRegistry(updater({ ...previous }) || previous);
    const localWritten = writeLocalInitiativeCards(next);
    try {
      if (!isCurrent()) return next;
      await writeRoomMetadataKey(
        OBR.room,
        METADATA_OWNERSHIP.INITIATIVE_CARDS,
        next,
        { runtime: "initiativeCards" },
      );
    } catch (error) {
      if (!localWritten) throw error;
    }
    return next;
  };
  initiativeCardWriteQueue = initiativeCardWriteQueue.then(write, write);
  return initiativeCardWriteQueue;
}

async function writeTokenProfile(
  itemId,
  storedProfile,
  actorProfileId = "",
  { isCurrent = () => true, commandId = "", sceneIdentity = null } = {},
) {
  if (!isCurrent()) throw new Error("scene-stale-before-card-token-write");
  const normalizedActorProfileId = normalizeActorProfileId(
    actorProfileId || actorProfileIdFromProfile(storedProfile),
  );
  const fields = {
    [INITIATIVE_CARD_FIELD]: { mode: "set", value: storedProfile },
  };
  if (normalizedActorProfileId) {
    fields[ACTOR_PROFILE_ID_FIELD] = {
      mode: "set",
      value: normalizedActorProfileId,
    };
  }
  const mutation = await runEffectsMutation([{
    type: "condition:reconcile-exhaustion",
    targetIds: [itemId],
    level: storedProfile?.exhaustion,
  }], {
    kind: "initiative-card",
    label: "Scheda iniziativa aggiornata",
    targetIds: [itemId],
    metadataPatches: [{
      id: itemId,
      fields,
    }],
    ...(commandId ? { commandId } : {}),
    ...(sceneIdentity ? { sceneIdentity } : {}),
  });
  if (!isCurrent()) throw new Error("scene-stale-after-card-token-write");
  requireAppliedEffectsMutation(mutation);
  const conditionsChanged = mutation.changes.some((change) => change.fields?.conditions);
  if (conditionsChanged) {
    await refreshConditionLabels([itemId]);
    if (!isCurrent()) throw new Error("scene-stale-after-card-condition-refresh");
  }
}

async function removeTokenProfile(itemId) {
  const mutation = await runEffectsMutation([{
    type: "condition:reconcile-exhaustion",
    targetIds: [itemId],
    level: 0,
  }], {
    kind: "initiative-card",
    label: "Scheda iniziativa rimossa",
    targetIds: [itemId],
    metadataPatches: [{
      id: itemId,
      fields: {
        [INITIATIVE_CARD_FIELD]: { mode: "delete" },
      },
    }],
  });
  requireAppliedEffectsMutation(mutation);
  const conditionsChanged = mutation.changes.some((change) => change.fields?.conditions);
  if (conditionsChanged) await refreshConditionLabels([itemId]);
}

export function getInitiativeCard(item) {
  const storedRaw = item?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  const profile = profileWithConditionFallback(item?.name, storedRaw, conditions);
  const actorProfileId = actorProfileIdFromItem(item)
    || actorProfileIdFromProfile(storedRaw)
    || actorProfileIdFromProfile(profile);
  if (actorProfileId) profile[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
  return profile;
}

export async function loadInitiativeCard(item, { hydrate = false, registry } = {}) {
  const resolvedRegistry = registry === undefined
    ? (await readInitiativeCardRegistry()).registry
    : registry;
  const keys = initiativeCardRegistryKeys(item);
  const roomEntry = findInitiativeCardRegistryEntry(resolvedRegistry, item);
  const roomProfile = roomEntryProfile(roomEntry);
  const roomDeleted = roomEntry?.deleted === true;
  const hasRoomVersion = !!roomProfile || roomDeleted;
  const roomUpdatedAt = Math.max(0, Number(roomEntry?.updatedAt) || 0);
  const tokenRaw = item?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  const tokenConditions = item?.metadata?.[META_KEY]?.conditions;
  const legacyExhaustion = getExhaustionLevel(tokenConditions);
  const hasTokenProfile = !!(tokenRaw && typeof tokenRaw === "object");
  const tokenUpdatedAt = Math.max(0, Number(tokenRaw?.updatedAt) || 0);
  const legacyActorMatch = resolveInitiativeCardActorMatch(resolvedRegistry, item);
  let actorProfileId = actorProfileIdFromItem(item)
    || actorProfileIdFromProfile(tokenRaw)
    || actorProfileIdFromRegistryEntry(roomEntry)
    || legacyActorMatch.actorProfileId;
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
  const winnerWithIdentity = winner && actorProfileId
    ? { ...winner, [ACTOR_PROFILE_ID_FIELD]: actorProfileId }
    : winner;
  const profile = profileWithConditionFallback(item?.name, winnerWithIdentity, tokenConditions);
  if (actorProfileId) profile[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
  const hydrationQuickActions = roomWins && roomDeleted
    ? []
    : storageQuickActionsForHydration(winner, tokenRaw, roomProfile);
  if (hydrationQuickActions.length) {
    profile.quickActions = sanitizeQuickActions(hydrationQuickActions);
  }
  const hasLegacyQuickActions = [winner, tokenRaw, roomProfile]
    .some((candidate) => hasLegacyQuickActionStorage(candidate));

  // La lettura di una quick action spell v1 deve restare read-only: la
  // normalizzazione vive nel profilo restituito e viene persistita solo da
  // saveInitiativeCard dopo un salvataggio esplicito della scheda.
  if (hydrate && keys.length && !hasLegacyQuickActions
    && (hasRoomVersion || hasTokenProfile || legacyExhaustion > 0)) {
    const updatedAt = roomWins
      ? (roomUpdatedAt || Date.now())
      : (tokenUpdatedAt || Date.now());
    if (roomWins && roomDeleted) {
      if (hasTokenProfile) await removeTokenProfile(item.id);
      return profile;
    }
    const cleanWinner = sanitizeInitiativeCard(
      profileForStorage(item?.name, winnerWithIdentity, tokenConditions)
    );
    const storedQuickActions = storageQuickActionsForHydration(
      winner,
      tokenRaw,
      roomProfile,
    );
    const storedProfile = {
      // La normalizzazione conosce soltanto i campi del contratto corrente,
      // ma una hydrate esplicita non deve scartare estensioni future già
      // persistite nel profilo vincente o nelle copie legacy.
      ...preserveCardProfileUnknowns(winner, roomProfile, tokenRaw),
      ...cleanWinner,
      quickActions: storedQuickActions.length
        ? storedQuickActions
        : storageQuickActions(cleanWinner, winner),
      ...(actorProfileId ? { [ACTOR_PROFILE_ID_FIELD]: actorProfileId } : {}),
      updatedAt,
    };
    const storedProfileWithoutTimestamp = { ...storedProfile };
    delete storedProfileWithoutTimestamp.updatedAt;
    const tokenProfileComparable = sanitizeInitiativeCard(tokenRaw);
    if (actorProfileId) tokenProfileComparable[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
    tokenProfileComparable.quickActions = storedProfile.quickActions;
    const needsTokenSync = !hasTokenProfile || tokenUpdatedAt !== updatedAt ||
      JSON.stringify(tokenProfileComparable) !==
        JSON.stringify(storedProfileWithoutTimestamp);
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
      const previousEntry = roomEntry && typeof roomEntry === "object" ? roomEntry : {};
      const entry = {
        ...previousEntry,
        name: String(item?.name || ""),
        profile: storedProfileWithoutTimestamp,
        updatedAt,
      };
      if (actorProfileId) entry[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
      delete entry.deleted;
      for (const key of keys) next[key] = entry;
      return next;
    });
    if (needsTokenSync || needsConditionSync || !!actorProfileId && actorProfileIdFromItem(item) !== actorProfileId) {
      await writeTokenProfile(item.id, storedProfile, actorProfileId);
    }
  }

  return profile;
}

async function initiativeCardHydrationIsGM(options = {}) {
  if (options.isGM === false) return false;
  if (options.isGM === true) return true;
  const getRole = OBR?.player?.getRole;
  if (typeof getRole !== "function") return true;
  const role = await getRole.call(OBR.player).catch(() => "PLAYER");
  return String(role || "").toUpperCase() === "GM";
}

function hydrationKey(sceneEpoch, sceneIdentity, generation, itemId) {
  return [
    sceneIdentity || `epoch:${sceneEpoch ?? "unknown"}`,
    generation ?? "legacy",
    itemId,
  ].join("|");
}

export function restoreInitiativeCardQuickActionsFromMemory(itemIds) {
  const options = arguments[1] && typeof arguments[1] === "object"
    ? arguments[1]
    : {};
  const ids = Array.from(new Set((itemIds || []).filter(Boolean).map(String)));
  if (!ids.length) return Promise.resolve([]);

  const keys = ids.map((itemId) => hydrationKey(
    options.sceneEpoch,
    options.sceneIdentity,
    options.generation,
    itemId,
  ));
  const pendingIds = ids.filter((itemId, index) => {
    const key = keys[index];
    return !initiativeCardHydrationCompleted.has(key) && !initiativeCardHydrationInFlight.has(key);
  });
  if (!pendingIds.length) return Promise.resolve([]);

  const restore = async () => {
    if (!await initiativeCardHydrationIsGM(options)) {
      throw new Error("initiative-card-hydration-requires-gm");
    }
    if (typeof options.isCurrent === "function" && !options.isCurrent()) {
      throw new Error("scene-stale-before-card-hydration");
    }
    const suppliedItems = Array.isArray(options.items) ? options.items : [];
    const itemsById = new Map(suppliedItems
      .filter((item) => item?.id && pendingIds.includes(String(item.id)))
      .map((item) => [String(item.id), item]));
    const missingIds = pendingIds.filter((itemId) => !itemsById.has(itemId));
    if (missingIds.length) {
      const loadedItems = await OBR.scene.items.getItems(missingIds);
      if (typeof options.isCurrent === "function" && !options.isCurrent()) {
        throw new Error("scene-stale-after-card-item-read");
      }
      for (const item of loadedItems) itemsById.set(String(item.id), item);
    }
    const items = pendingIds.map((itemId) => itemsById.get(itemId)).filter(Boolean);
    if (!items.length) return [];
    const eligible = initiativeCardQuickActionMemoryEligibleItems(items, {
      metadataKey: META_KEY,
      profileField: INITIATIVE_CARD_FIELD,
    });
    if (!eligible.length) return [];
    const { registry } = await readInitiativeCardRegistry();
    if (typeof options.isCurrent === "function" && !options.isCurrent()) {
      throw new Error("scene-stale-after-card-registry-read");
    }
    const candidates = initiativeCardQuickActionMemoryCandidates(eligible, registry, {
      metadataKey: META_KEY,
      profileField: INITIATIVE_CARD_FIELD,
    });
    const restoredIds = [];
    for (const item of candidates) {
      if (typeof options.isCurrent === "function" && !options.isCurrent()) {
        throw new Error("scene-stale-before-card-hydrate");
      }
      const profile = await loadInitiativeCard(item, { hydrate: true, registry });
      if (typeof options.isCurrent === "function" && !options.isCurrent()) {
        throw new Error("scene-stale-after-card-hydrate");
      }
      if (profile.quickActions.length) restoredIds.push(item.id);
    }
    return restoredIds;
  };

  const queued = initiativeCardHydrationQueue.then(restore, restore);
  for (const key of keys.filter((_, index) => pendingIds.includes(ids[index]))) {
    initiativeCardHydrationInFlight.set(key, queued);
  }
  const settled = queued.then((result) => {
    for (const key of keys.filter((_, index) => pendingIds.includes(ids[index]))) {
      initiativeCardHydrationCompleted.add(key);
      initiativeCardHydrationInFlight.delete(key);
    }
    return result;
  }, (error) => {
    for (const key of keys.filter((_, index) => pendingIds.includes(ids[index]))) {
      initiativeCardHydrationInFlight.delete(key);
    }
    throw error;
  });
  initiativeCardHydrationQueue = settled.catch(() => {});
  return settled;
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

export async function saveInitiativeCard(
  itemId,
  name,
  value,
  { isCurrent = () => true, commandId = "", sceneIdentity = null } = {},
) {
  if (!isCurrent()) throw new Error("scene-stale-before-card-save");
  const [sourceItem] = await OBR.scene.items.getItems([itemId]).catch(() => []);
  if (!isCurrent()) throw new Error("scene-stale-after-card-read");
  const sourceRawProfile = sourceItem?.metadata?.[META_KEY]?.[INITIATIVE_CARD_FIELD];
  const profile = mergeStoredCardProfile(sourceRawProfile, value);
  const { registry } = await readInitiativeCardRegistry();
  if (!isCurrent()) throw new Error("scene-stale-after-card-registry-read");
  const legacyMatch = resolveInitiativeCardActorMatch(
    registry,
    sourceItem || { name },
  );
  const actorProfileId = actorProfileIdForCardSave({
    item: sourceItem,
    existingProfile: sourceRawProfile,
    value,
    registryMatch: legacyMatch,
    create: createActorProfileId,
  });
  profile[ACTOR_PROFILE_ID_FIELD] = actorProfileId;
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

  const roomResult = await updateRoomCards((next) => {
    for (const key of keys) {
      const previousEntry = next[key] && typeof next[key] === "object" ? next[key] : {};
      const previousProfile = roomEntryProfile(previousEntry) || {};
      const entry = {
        ...previousEntry,
        [ACTOR_PROFILE_ID_FIELD]: actorProfileId,
        name: String(sourceItem?.name || name || ""),
        profile: {
          ...mergeStoredCardProfile(previousProfile, storedBaseProfile),
          [ACTOR_PROFILE_ID_FIELD]: actorProfileId,
        },
        updatedAt,
      };
      delete entry.deleted;
      next[key] = entry;
    }
    return next;
  }, { isCurrent });
  if (!roomResult || !isCurrent()) throw new Error("scene-stale-after-card-room-write");
  await writeTokenProfile(itemId, storedProfile, actorProfileId, {
    isCurrent,
    commandId,
    sceneIdentity,
  });
  if (!isCurrent()) throw new Error("scene-stale-after-card-save");
  return profile;
}

/*
 * Collega token legacy a una scheda soltanto quando il risultato è
 * inequivocabile. È una migrazione esplicita del runtime, non una lettura:
 * l'ID viene generato qui e mai in una funzione read-only.
 */
export async function migrateInitiativeCardActorIdentities(
  items = [],
  { isCurrent = () => true } = {},
) {
  const candidates = (Array.isArray(items) ? items : []).filter((item) => (
    item?.id
    && !actorProfileIdFromItem(item)
    && isLegacyActorMigrationEligible(item)
  ));
  if (!candidates.length || !isCurrent()) return { changedIds: [], ambiguousIds: [], links: [] };

  const { registry } = await readInitiativeCardRegistry();
  if (!isCurrent()) return { changedIds: [], ambiguousIds: [], links: [] };
  const decisions = [];
  const ambiguousIds = [];
  for (const item of candidates) {
    const match = resolveInitiativeCardActorMatch(registry, item);
    if (match.status === "ambiguous" || match.status === "none") {
      if (match.status === "ambiguous") ambiguousIds.push(item.id);
      continue;
    }
    decisions.push({ item, match });
  }

  // Lo stesso asset/nome presente in più token non identifica un singolo
  // personaggio. Anche se la scheda è una sola, la migrazione resta sospesa.
  const byMatch = new Map();
  for (const decision of decisions) {
    const matchKey = decision.match.actorProfileId
      ? `actor:${decision.match.actorProfileId}`
      : `legacy:${decision.match.keys.map((key) => key).sort().join("\u001f")}`;
    const group = byMatch.get(matchKey) || [];
    group.push(decision);
    byMatch.set(matchKey, group);
  }

  const links = [];
  for (const group of byMatch.values()) {
    if (group.length !== 1) {
      ambiguousIds.push(...group.map(({ item }) => item.id));
      continue;
    }
    const [{ item, match }] = group;
    links.push({
      item,
      match,
      actorProfileId: match.actorProfileId || createActorProfileId(),
    });
  }
  if (!links.length || !isCurrent()) {
    return { changedIds: [], ambiguousIds: Array.from(new Set(ambiguousIds)), links: [] };
  }

  await updateRoomCards((next) => {
    for (const link of links) {
      for (const key of link.match.keys) {
        const previousEntry = next[key];
        if (!previousEntry || typeof previousEntry !== "object") continue;
        const previousProfile = roomEntryProfile(previousEntry) || {};
        next[key] = {
          ...previousEntry,
          [ACTOR_PROFILE_ID_FIELD]: link.actorProfileId,
          profile: {
            ...previousProfile,
            [ACTOR_PROFILE_ID_FIELD]: link.actorProfileId,
          },
        };
      }
    }
    return next;
  }, { isCurrent });
  if (!isCurrent()) return { changedIds: [], ambiguousIds: Array.from(new Set(ambiguousIds)), links: [] };

  const linksById = new Map(links.map((link) => [link.item.id, link]));
  await OBR.scene.items.updateItems([...linksById.keys()], (drafts) => {
    if (!isCurrent()) return;
    for (const item of drafts) {
      const link = linksById.get(item.id);
      if (!link) continue;
      const meta = { ...(item.metadata?.[META_KEY] || {}) };
      meta[ACTOR_PROFILE_ID_FIELD] = link.actorProfileId;
      if (meta[INITIATIVE_CARD_FIELD] && typeof meta[INITIATIVE_CARD_FIELD] === "object") {
        meta[INITIATIVE_CARD_FIELD] = {
          ...meta[INITIATIVE_CARD_FIELD],
          [ACTOR_PROFILE_ID_FIELD]: link.actorProfileId,
        };
      }
      item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
    }
  });
  if (!isCurrent()) return { changedIds: [], ambiguousIds: Array.from(new Set(ambiguousIds)), links: [] };
  return {
    changedIds: [...linksById.keys()],
    ambiguousIds: Array.from(new Set(ambiguousIds)),
    links: links.map(({ item, actorProfileId }) => ({
      itemId: item.id,
      actorProfileId,
    })),
  };
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
      const actorProfileId = actorProfileIdFromItem(item)
        || actorProfileIdFromProfile(raw);
      if (!raw || typeof raw !== "object") {
        for (const key of keys) {
          const previousEntry = next[key] && typeof next[key] === "object" ? next[key] : {};
          const entry = {
            ...previousEntry,
            ...(actorProfileId ? { [ACTOR_PROFILE_ID_FIELD]: actorProfileId } : {}),
            name: String(item.name || ""),
            deleted: true,
            updatedAt: Date.now() + offset++,
          };
          next[key] = entry;
        }
        continue;
      }
      const updatedAt = Date.now() + offset++;
      const profile = profileForStorage(
        item.name,
        { ...raw, ...(actorProfileId ? { [ACTOR_PROFILE_ID_FIELD]: actorProfileId } : {}) },
        item.metadata?.[META_KEY]?.conditions
      );
      const previousProfiles = keys
        .map((key) => roomEntryProfile(next[key]))
        .filter((value) => value && typeof value === "object");
      const preservedQuickActions = storageQuickActionsForHydration(
        raw,
        ...previousProfiles,
      );
      const storedProfile = {
        ...mergeStoredCardProfile(raw, profile),
        quickActions: preservedQuickActions.length
          ? preservedQuickActions
          : storageQuickActions(profile, raw),
        ...(actorProfileId ? { [ACTOR_PROFILE_ID_FIELD]: actorProfileId } : {}),
      };
      for (const key of keys) {
        const previousEntry = next[key] && typeof next[key] === "object" ? next[key] : {};
        const entry = {
          ...previousEntry,
          ...(actorProfileId ? { [ACTOR_PROFILE_ID_FIELD]: actorProfileId } : {}),
          name: String(item.name || ""),
          profile: storedProfile,
          updatedAt,
        };
        delete entry.deleted;
        next[key] = entry;
      }
      stampById.set(item.id, { ...storedProfile, updatedAt });
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
