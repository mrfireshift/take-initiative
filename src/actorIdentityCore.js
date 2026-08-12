import { ID } from "./constants.js";
import { canonicalImageUrl, normalizedItemName } from "./factionRegistryCore.js";

export const ACTOR_PROFILE_ID_FIELD = "actorProfileId";
export const ACTOR_PROFILE_ID_PREFIX = "actor_";
export const ACTOR_META_KEY = `${ID}/meta`;

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeActorProfileId(value) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 160) return "";
  return id;
}

export function createActorProfileId({
  randomUUID,
  now = Date.now,
  random = Math.random,
} = {}) {
  const uuidFactory = typeof randomUUID === "function"
    ? randomUUID
    : typeof globalThis.crypto?.randomUUID === "function"
      ? () => globalThis.crypto.randomUUID()
      : null;
  if (uuidFactory) {
    const uuid = String(uuidFactory()).trim();
    if (uuid) return `${ACTOR_PROFILE_ID_PREFIX}${uuid}`;
  }

  // crypto.randomUUID è disponibile nei runtime Owlbear correnti. Questo
  // fallback mantiene comunque un'identità non basata sull'item ID quando il
  // plugin viene eseguito in un ambiente più vecchio o nei test.
  const timestamp = Math.max(0, Math.floor(Number(now()) || Date.now())).toString(36);
  const entropy = Math.floor(Math.max(0, Number(random()) || 0) * 0x100000000)
    .toString(36)
    .padStart(7, "0");
  return `${ACTOR_PROFILE_ID_PREFIX}${timestamp}-${entropy}-${Math.random().toString(36).slice(2, 10)}`;
}

export function actorProfileIdFromItem(item, metadataKey = ACTOR_META_KEY) {
  return normalizeActorProfileId(item?.metadata?.[metadataKey]?.[ACTOR_PROFILE_ID_FIELD]);
}

export function actorProfileIdFromProfile(profile) {
  return normalizeActorProfileId(profile?.[ACTOR_PROFILE_ID_FIELD]);
}

export function actorProfileIdFromRegistryEntry(entry) {
  return normalizeActorProfileId(
    entry?.[ACTOR_PROFILE_ID_FIELD]
      || entry?.profile?.[ACTOR_PROFILE_ID_FIELD],
  );
}

export function actorProfileIdForCardSave({
  item = null,
  existingProfile = null,
  value = null,
  registryMatch = null,
  create = createActorProfileId,
} = {}) {
  return actorProfileIdFromItem(item)
    || actorProfileIdFromProfile(existingProfile)
    || normalizeActorProfileId(registryMatch?.actorProfileId)
    || actorProfileIdFromProfile(value)
    || create();
}

export function metadataWithActorProfileId(metadata, actorProfileId) {
  const id = normalizeActorProfileId(actorProfileId);
  if (!id) return plainObject(metadata) ? { ...metadata } : {};
  return {
    ...(plainObject(metadata) ? metadata : {}),
    [ACTOR_PROFILE_ID_FIELD]: id,
  };
}

export function legacyActorIdentityKeys(item) {
  const imageKey = canonicalImageUrl(item);
  const nameKey = normalizedItemName(item);
  return Array.from(new Set([
    imageKey ? `asset:${imageKey}` : "",
    nameKey,
  ].filter(Boolean)));
}

export function legacyActorIdentitySignature(item) {
  return legacyActorIdentityKeys(item).join("\u001f");
}

export function legacyActorAttitude(item) {
  const meta = item?.metadata?.[ACTOR_META_KEY] || {};
  return String(meta.attitude || (meta.inInitiative === true ? "ally" : ""))
    .trim()
    .toLowerCase();
}

export function isLegacyActorMigrationEligible(item) {
  const attitude = legacyActorAttitude(item);
  return attitude === "pc" || attitude === "ally";
}

export function isValidActorIdentityItem(item) {
  return !!item?.id && plainObject(item?.metadata?.[ACTOR_META_KEY]);
}
