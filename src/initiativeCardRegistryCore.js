import { canonicalImageUrl, normalizedItemName } from "./factionRegistryCore.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";

export function initiativeCardRegistryKeys(item) {
  const imageKey = canonicalImageUrl(item);
  const nameKey = normalizedItemName(item);
  return Array.from(new Set([
    imageKey ? `asset:${imageKey}` : "",
    nameKey,
  ].filter(Boolean)));
}

export function normalizeInitiativeCardRegistry(value) {
  const source = value && typeof value === "object" ? value : {};
  const registry = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!key || !entry || typeof entry !== "object") continue;
    registry[key] = entry;
  }
  return registry;
}

export function mergeInitiativeCardRegistries(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [key, entry] of Object.entries(normalizeInitiativeCardRegistry(source))) {
      const current = merged[key];
      if (!current || Number(entry.updatedAt || 0) >= Number(current.updatedAt || 0)) {
        merged[key] = entry;
      }
    }
  }
  return merged;
}

export function findInitiativeCardRegistryEntry(registry, item) {
  let winner = null;
  for (const key of initiativeCardRegistryKeys(item)) {
    const entry = registry?.[key];
    if (!entry || typeof entry !== "object") continue;
    if (!winner || Number(entry.updatedAt || 0) > Number(winner.updatedAt || 0)) {
      winner = entry;
    }
  }
  return winner;
}

export function initiativeCardQuickActionMemoryCandidates(
  items,
  registry,
  {
    metadataKey,
    profileField = "initiativeCard",
  } = {},
) {
  if (!metadataKey) return [];
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (
      !item?.id
      || item.layer !== "CHARACTER"
      || item.attachedTo
      || item.metadata?.[metadataKey]?.inInitiative !== true
    ) {
      return false;
    }
    const tokenProfile = item.metadata?.[metadataKey]?.[profileField];
    if (tokenProfile && typeof tokenProfile === "object") return false;

    const roomEntry = findInitiativeCardRegistryEntry(registry, item);
    if (!roomEntry || roomEntry.deleted === true) return false;
    const roomProfile = roomEntry.profile && typeof roomEntry.profile === "object"
      ? roomEntry.profile
      : roomEntry;
    return sanitizeQuickActions(roomProfile.quickActions).length > 0
      || Array.isArray(roomProfile.characterBuild) && roomProfile.characterBuild.length > 0
      || Array.isArray(roomProfile.enabledClassFeatureIds)
        && roomProfile.enabledClassFeatureIds.length > 0;
  });
}
