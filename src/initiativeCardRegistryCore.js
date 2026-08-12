import { canonicalImageUrl, normalizedItemName } from "./factionRegistryCore.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";
import {
  actorProfileIdFromItem,
  actorProfileIdFromRegistryEntry,
  legacyActorIdentityKeys,
} from "./actorIdentityCore.js";

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
  const actorProfileId = actorProfileIdFromItem(item);
  if (actorProfileId) {
    let actorWinner = null;
    for (const entry of Object.values(normalizeInitiativeCardRegistry(registry))) {
      if (actorProfileIdFromRegistryEntry(entry) !== actorProfileId) continue;
      if (!actorWinner || Number(entry.updatedAt || 0) > Number(actorWinner.updatedAt || 0)) {
        actorWinner = entry;
      }
    }
    if (actorWinner) return actorWinner;
  }

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

function registryEntryFingerprint(entry) {
  try {
    return JSON.stringify(entry, Object.keys(entry || {}).sort());
  } catch {
    return String(entry?.updatedAt || "legacy");
  }
}

/**
 * Risolve il collegamento legacy senza generare ID e senza scrivere nulla.
 * Un risultato "legacy" è una sola scheda priva di actorProfileId; il caller
 * può assegnare un ID soltanto durante una migrazione esplicita.
 */
export function resolveInitiativeCardActorMatch(registry, item) {
  const candidates = [];
  for (const key of legacyActorIdentityKeys(item)) {
    const entry = registry?.[key];
    if (!entry || typeof entry !== "object" || entry.deleted === true) continue;
    candidates.push({ key, entry });
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const actorProfileId = actorProfileIdFromRegistryEntry(candidate.entry);
    const identity = actorProfileId
      ? `actor:${actorProfileId}`
      : `legacy:${registryEntryFingerprint(candidate.entry)}`;
    if (!unique.has(identity)) unique.set(identity, {
      ...candidate,
      actorProfileId,
      keys: [candidate.key],
    });
    else unique.get(identity).keys.push(candidate.key);
  }

  const matches = [...unique.values()];
  if (matches.length > 1) {
    return { status: "ambiguous", matches };
  }
  if (!matches.length) return { status: "none", matches: [] };
  const match = matches[0];
  return {
    status: match.actorProfileId ? "matched" : "legacy",
    actorProfileId: match.actorProfileId || "",
    entry: match.entry,
    keys: match.keys,
    matches,
  };
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
    if (
      tokenProfile
      && typeof tokenProfile === "object"
      && sanitizeQuickActions(tokenProfile.quickActions).length > 0
    ) return false;

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
