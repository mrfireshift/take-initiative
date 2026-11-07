import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { canonicalImageUrl, normalizedItemName } from "./factionRegistryCore.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";
import { hasSpellbook } from "./spellbookCore.js";
import {
  actorProfileIdFromItem,
  actorProfileIdFromRegistryEntry,
  legacyActorIdentityKeys,
} from "./actorIdentityCore.js";
import {
  ROOM_METADATA_DOMAIN_MAX_BYTES,
  jsonBytes,
} from "./roomMetadataBudget.js";
import { sanitizeEnabledClassFeatureIds } from "./classFeatureCore.js";
import { isMonsterProfileCard } from "./monsterProfileCore.js";
import {
  ABILITY_MODIFIERS_FIELD,
  compactAbilityModifiers,
  sanitizeAbilityModifiers,
} from "./abilityModifiersCore.js";

// Nel registry Room un profilo configurato salva soltanto la differenza dai
// default del catalogo; token e copia locale conservano l'elenco completo.
export const ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD = "disabledDefaultClassFeatureIds";

// Nel registry Room una chiave secondaria con la stessa voce della primaria
// salva soltanto `{ sameAs: <chiave primaria>, updatedAt }`. L'alias non porta
// actorProfileId: un client precedente che cerca per attore trova la primaria.
export const ROOM_CARD_ALIAS_FIELD = "sameAs";

function roomCardAliasTarget(entry) {
  if (!entry || typeof entry !== "object" || !Object.hasOwn(entry, ROOM_CARD_ALIAS_FIELD)) return null;
  return String(entry[ROOM_CARD_ALIAS_FIELD] || "");
}

// Un alias vale soltanto se punta a una voce piena con lo stesso updatedAt:
// se un client precedente ha riscritto la primaria, l'alias è pendente.
function resolvedRoomCardAliasTarget(registry, entry) {
  const targetKey = roomCardAliasTarget(entry);
  if (targetKey === null) return null;
  const target = targetKey ? registry[targetKey] : null;
  if (
    !target
    || roomCardAliasTarget(target) !== null
    || Number(target.updatedAt || 0) !== Number(entry.updatedAt || 0)
  ) return "";
  return targetKey;
}

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

// Studio registro schede, seconda parte (C1–C5): in the Room the registry is stored compressed, { v: 2, deflate } with
// the deflated JSON in base64, so a whole party fits the domain budget. The JSON is canonical (sorted keys): the same
// registry gives the same string and an aligned Room is not written again (skipUnchanged). A Room still holding the
// plain registry of the previous versions is read as it is and compressed at its first write.
export const ROOM_CARD_PACKED_VERSION = 2;
const ROOM_CARD_PACKED_FIELD = "deflate";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry) ?? "null").join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.keys(value).sort()
      .map((key) => [key, canonicalJson(value[key])])
      .filter(([, json]) => json !== undefined)
      .map(([key, json]) => `${JSON.stringify(key)}:${json}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function isPackedInitiativeCardRegistry(value) {
  return !!value
    && typeof value === "object"
    && value.v === ROOM_CARD_PACKED_VERSION
    && typeof value[ROOM_CARD_PACKED_FIELD] === "string";
}

export function packInitiativeCardRegistryForRoom(value) {
  const json = canonicalJson(normalizeInitiativeCardRegistry(value));
  return {
    v: ROOM_CARD_PACKED_VERSION,
    [ROOM_CARD_PACKED_FIELD]: bytesToBase64(deflateSync(strToU8(json), { level: 9 })),
  };
}

// The plain registry of a Room value, compressed or not. An unreadable compressed value counts as an empty registry.
export function unpackInitiativeCardRegistryFromRoom(value) {
  if (!isPackedInitiativeCardRegistry(value)) return value;
  try {
    return normalizeInitiativeCardRegistry(JSON.parse(strFromU8(inflateSync(base64ToBytes(value[ROOM_CARD_PACKED_FIELD])))));
  } catch (error) {
    console.warn("[initiative-card] registro della stanza illeggibile:", error?.message || error);
    return {};
  }
}

// A value already within the budget comes back unchanged (the start-up check of the background costs nothing).
// Otherwise the newest entries are kept, measured in the value's own format: a compressed value stays compressed.
export function retainInitiativeCardRegistryWithinByteBudget(
  value,
  maxBytes = ROOM_METADATA_DOMAIN_MAX_BYTES["initiative-cards"],
) {
  const packed = isPackedInitiativeCardRegistry(value);
  const budget = Math.max(2, Math.floor(Number(maxBytes) || 0));
  if (packed && jsonBytes(value) <= budget) return value;
  const source = normalizeInitiativeCardRegistry(unpackInitiativeCardRegistryFromRoom(value));
  if (!packed && jsonBytes(source) <= budget) return { ...source };
  const measure = packed ? (registry) => jsonBytes(packInitiativeCardRegistryForRoom(registry)) : jsonBytes;
  const retained = retainInitiativeCardEntriesWithinByteBudget(source, budget, measure);
  return packed ? packInitiativeCardRegistryForRoom(retained) : retained;
}

function retainInitiativeCardEntriesWithinByteBudget(source, budget, measure) {
  // Gli alias Room seguono la propria voce: entrano subito dopo di lei e
  // soltanto se lei è stata conservata. Gli alias pendenti si scartano.
  const aliasesByTarget = new Map();
  const entries = [];
  for (const [key, entry] of Object.entries(source)) {
    const targetKey = resolvedRoomCardAliasTarget(source, entry);
    if (targetKey === null) entries.push([key, entry]);
    else if (targetKey) aliasesByTarget.set(targetKey, [...(aliasesByTarget.get(targetKey) || []), key]);
  }
  const ordered = entries.sort(([leftKey, left], [rightKey, right]) => {
    const updatedAt = (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0);
    return updatedAt || leftKey.localeCompare(rightKey);
  });
  const retained = {};
  for (const [key, entry] of ordered) {
    const candidate = { ...retained, [key]: entry };
    if (measure(candidate) > budget) continue;
    retained[key] = entry;
    for (const aliasKey of (aliasesByTarget.get(key) || []).sort((left, right) => left.localeCompare(right))) {
      const aliasCandidate = { ...retained, [aliasKey]: source[aliasKey] };
      if (measure(aliasCandidate) <= budget) retained[aliasKey] = source[aliasKey];
    }
  }
  return retained;
}

// The characters whose profile the budget left out of the Room (aliases and deletions are not profiles): their sheet
// stays only in this browser. [] when nothing was dropped.
export function droppedInitiativeCardRegistryNames(requested, retained) {
  const source = normalizeInitiativeCardRegistry(unpackInitiativeCardRegistryFromRoom(requested));
  const kept = normalizeInitiativeCardRegistry(unpackInitiativeCardRegistryFromRoom(retained));
  const names = [];
  for (const [key, entry] of Object.entries(source)) {
    if (Object.hasOwn(kept, key) || entry?.deleted === true || resolvedRoomCardAliasTarget(source, entry) !== null) continue;
    const name = String(entry?.name || key).trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// What a write sends to the Room: the entries the Room already holds and the ones this write touched (a sheet opened
// or saved, a token added to the initiative, an Undo). The GM's local copy is not split by room: its other entries
// (characters of other rooms) stay in the browser and do not fill this Room's budget.
// `previous` is the merged registry the updater started from; "touched" is an entry it replaced.
export function roomScopedInitiativeCardRegistry(next, previous, roomRegistry) {
  const source = normalizeInitiativeCardRegistry(next);
  const before = previous && typeof previous === "object" ? previous : {};
  const room = roomRegistry && typeof roomRegistry === "object" ? roomRegistry : {};
  const scoped = {};
  for (const [key, entry] of Object.entries(source)) {
    if (Object.hasOwn(room, key) || entry !== before[key]) scoped[key] = entry;
  }
  return scoped;
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

function expandRoomClassFeatureIds(profile, defaultClassFeatureIds) {
  const disabled = new Set(sanitizeEnabledClassFeatureIds(
    profile[ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD],
  ));
  const defaults = sanitizeEnabledClassFeatureIds(defaultClassFeatureIds(profile.characterBuild));
  return sanitizeEnabledClassFeatureIds([
    ...defaults.filter((id) => !disabled.has(id)),
    ...sanitizeEnabledClassFeatureIds(profile.enabledClassFeatureIds),
  ]);
}

/**
 * `defaultClassFeatureIds(characterBuild)` restituisce gli ID abilitati di
 * default dal catalogo. Il profilo codificato dichiara
 * `classFeaturesConfigured: false`, così un client che non conosce la
 * codifica ricade sui default invece che su un elenco vuoto.
 */
export function encodeInitiativeCardRoomProfile(profile, defaultClassFeatureIds) {
  if (
    !profile
    || typeof profile !== "object"
    || profile.classFeaturesConfigured !== true
    || typeof defaultClassFeatureIds !== "function"
  ) return profile;
  const { [ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD]: _stale, ...base } = profile;
  const enabled = sanitizeEnabledClassFeatureIds(base.enabledClassFeatureIds);
  const enabledSet = new Set(enabled);
  const defaults = sanitizeEnabledClassFeatureIds(defaultClassFeatureIds(base.characterBuild));
  const defaultSet = new Set(defaults);
  const encoded = {
    ...base,
    classFeaturesConfigured: false,
    enabledClassFeatureIds: enabled.filter((id) => !defaultSet.has(id)),
    [ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD]: defaults.filter((id) => !enabledSet.has(id)),
  };
  const decoded = expandRoomClassFeatureIds(encoded, defaultClassFeatureIds);
  const exact = decoded.length === enabled.length && decoded.every((id) => enabledSet.has(id));
  return exact && jsonBytes(encoded) < jsonBytes(profile) ? encoded : profile;
}

export function decodeInitiativeCardRoomProfile(profile, defaultClassFeatureIds) {
  if (
    !profile
    || typeof profile !== "object"
    || !Object.hasOwn(profile, ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD)
  ) return profile;
  const { [ROOM_DISABLED_DEFAULT_CLASS_FEATURES_FIELD]: _disabled, ...legacy } = profile;
  // Un client precedente può aver riscritto l'elenco completo: vale quello.
  if (profile.classFeaturesConfigured === true) return legacy;
  return {
    ...legacy,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: expandRoomClassFeatureIds(profile, defaultClassFeatureIds),
  };
}

function mapInitiativeCardRegistryProfiles(value, mapProfile) {
  const mappedEntries = new Map();
  const registry = {};
  for (const [key, entry] of Object.entries(normalizeInitiativeCardRegistry(value))) {
    if (!mappedEntries.has(entry)) {
      const profile = entry.profile && typeof entry.profile === "object" ? entry.profile : null;
      const mapped = profile ? mapProfile(profile) : profile;
      mappedEntries.set(entry, mapped === profile ? entry : { ...entry, profile: mapped });
    }
    registry[key] = mappedEntries.get(entry);
  }
  return registry;
}

// La primaria è la chiave asset: a parità di updatedAt un client precedente
// la legge per prima e non si ferma sull'alias privo di valori.
function compareRoomCardAliasPrimaryKeys(left, right) {
  const leftAsset = left.startsWith("asset:");
  const rightAsset = right.startsWith("asset:");
  if (leftAsset !== rightAsset) return leftAsset ? -1 : 1;
  return left.localeCompare(right);
}

function aliasInitiativeCardRegistryForRoom(value) {
  const source = normalizeInitiativeCardRegistry(value);
  const jsonByEntry = new Map();
  const entryJson = (entry) => {
    if (!jsonByEntry.has(entry)) jsonByEntry.set(entry, JSON.stringify(entry));
    return jsonByEntry.get(entry);
  };
  const primaryByJson = new Map();
  for (const key of Object.keys(source).sort(compareRoomCardAliasPrimaryKeys)) {
    const json = entryJson(source[key]);
    if (!primaryByJson.has(json)) primaryByJson.set(json, key);
  }
  const registry = {};
  for (const [key, entry] of Object.entries(source)) {
    const primaryKey = primaryByJson.get(entryJson(entry));
    const alias = { [ROOM_CARD_ALIAS_FIELD]: primaryKey, updatedAt: entry.updatedAt };
    registry[key] = primaryKey !== key && jsonBytes(alias) < jsonBytes(entry) ? alias : entry;
  }
  return registry;
}

// Gli alias si risolvono sul valore grezzo, prima di qualunque lettura; quelli
// pendenti (primaria scartata o riscritta) spariscono dal registry decodificato.
function resolveInitiativeCardRoomAliases(value) {
  const source = normalizeInitiativeCardRegistry(value);
  const registry = {};
  for (const [key, entry] of Object.entries(source)) {
    const targetKey = resolvedRoomCardAliasTarget(source, entry);
    if (targetKey === null) registry[key] = entry;
    else if (targetKey) registry[key] = source[targetKey];
  }
  return registry;
}

// Nel registry Room i modificatori di caratteristica sono un array di sei
// valori; token e copia locale conservano l'oggetto con le chiavi.
function compactRoomAbilityModifiers(profile) {
  if (!profile || typeof profile !== "object" || !Object.hasOwn(profile, ABILITY_MODIFIERS_FIELD)) return profile;
  const value = profile[ABILITY_MODIFIERS_FIELD];
  if (Array.isArray(value)) return profile;
  return { ...profile, [ABILITY_MODIFIERS_FIELD]: compactAbilityModifiers(value) };
}

function expandRoomAbilityModifiers(profile) {
  if (!profile || typeof profile !== "object" || !Array.isArray(profile[ABILITY_MODIFIERS_FIELD])) return profile;
  return { ...profile, [ABILITY_MODIFIERS_FIELD]: sanitizeAbilityModifiers(profile[ABILITY_MODIFIERS_FIELD]) };
}

// A monster's card (attacchi dei mostri, lotto 6) stays in the GM's local registry and on its token: in the Room, whose
// budget keeps the newest entries, a few imported stat blocks would push the characters' cards out. Players never open
// a monster's sheet. Filtered before the aliases, so no alias points to an entry the Room does not hold.
function withoutMonsterCards(value) {
  return Object.fromEntries(Object.entries(normalizeInitiativeCardRegistry(value))
    .filter(([, entry]) => !isMonsterProfileCard(entry?.profile && typeof entry.profile === "object" ? entry.profile : null)));
}

export function encodeInitiativeCardRegistryForRoom(value, defaultClassFeatureIds) {
  return aliasInitiativeCardRegistryForRoom(mapInitiativeCardRegistryProfiles(withoutMonsterCards(value), (profile) =>
    compactRoomAbilityModifiers(encodeInitiativeCardRoomProfile(profile, defaultClassFeatureIds))
  ));
}

export function decodeInitiativeCardRegistryFromRoom(value, defaultClassFeatureIds) {
  return mapInitiativeCardRegistryProfiles(resolveInitiativeCardRoomAliases(unpackInitiativeCardRegistryFromRoom(value)), (profile) =>
    expandRoomAbilityModifiers(decodeInitiativeCardRoomProfile(profile, defaultClassFeatureIds))
  );
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

export function initiativeCardQuickActionMemoryEligibleItems(
  items,
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

    return true;
  });
}

export function initiativeCardQuickActionMemoryCandidates(
  items,
  registry,
  {
    metadataKey,
    profileField = "initiativeCard",
  } = {},
) {
  return initiativeCardQuickActionMemoryEligibleItems(items, {
    metadataKey,
    profileField,
  }).filter((item) => {

    const roomEntry = findInitiativeCardRegistryEntry(registry, item);
    if (!roomEntry || roomEntry.deleted === true) return false;
    const roomProfile = roomEntry.profile && typeof roomEntry.profile === "object"
      ? roomEntry.profile
      : roomEntry;
    return sanitizeQuickActions(roomProfile.quickActions).length > 0
      || hasSpellbook(roomProfile.spellbook)
      || Array.isArray(roomProfile.characterBuild) && roomProfile.characterBuild.length > 0
      || Array.isArray(roomProfile.enabledClassFeatureIds)
        && roomProfile.enabledClassFeatureIds.length > 0;
  });
}
