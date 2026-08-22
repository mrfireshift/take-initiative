import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  mergeFactionAssets,
  normalizeFactionRegistry,
  retainFactionRegistryWithinByteBudget,
  registeredAttitudeForItem,
  removeFactionFromRegistry,
} from "./factionRegistryCore.js";
import {
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
} from "./metadataKeyScoped.js";

export const FACTION_REGISTRY_KEY = `${ID}/factionRegistry`;
export const FACTION_CONFIGURATOR_ID = `${ID}/faction-configurator`;
const FACTION_REGISTRY_LOCAL_KEY = `${ID}/factionRegistry/local`;
let factionRegistryWriteQueue = Promise.resolve();

function readLocalFactionRegistry() {
  try {
    return normalizeFactionRegistry(JSON.parse(localStorage.getItem(FACTION_REGISTRY_LOCAL_KEY) || "{}"));
  } catch {
    return {};
  }
}

function writeLocalFactionRegistry(registry) {
  try {
    localStorage.setItem(FACTION_REGISTRY_LOCAL_KEY, JSON.stringify(normalizeFactionRegistry(registry)));
    return true;
  } catch {
    return false;
  }
}

function mergeFactionRegistries(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [key, entry] of Object.entries(normalizeFactionRegistry(source))) {
      const current = merged[key];
      if (!current || Number(entry.updatedAt || 0) >= Number(current.updatedAt || 0)) {
        merged[key] = entry;
      }
    }
  }
  return merged;
}

export async function readFactionRegistry({ isCurrent = () => true } = {}) {
  if (!isCurrent()) return {};
  const local = readLocalFactionRegistry();
  const metadata = await OBR.room.getMetadata().catch(() => ({}));
  if (!isCurrent()) return {};
  return mergeFactionRegistries(local, metadata?.[FACTION_REGISTRY_KEY]);
}

async function updateFactionRegistry(updater, { isCurrent = () => true } = {}) {
  const write = async () => {
    if (!isCurrent()) return null;
    const metadata = await OBR.room.getMetadata().catch(() => ({}));
    if (!isCurrent()) return null;
    const previous = mergeFactionRegistries(
      readLocalFactionRegistry(),
      metadata?.[FACTION_REGISTRY_KEY]
    );
    const next = normalizeFactionRegistry(updater(previous) || previous);
    if (!isCurrent()) return null;
    const localWritten = writeLocalFactionRegistry(next);
    try {
      if (!isCurrent()) return next;
      await writeRoomMetadataKey(
        OBR.room,
        METADATA_OWNERSHIP.REGISTRY,
        next,
        {
          runtime: "factionRegistry",
          roomBudget: {
            retain: retainFactionRegistryWithinByteBudget,
          },
        },
      );
    } catch (error) {
      if (!localWritten) throw error;
    }
    if (!isCurrent()) return null;
    return next;
  };
  factionRegistryWriteQueue = factionRegistryWriteQueue.then(write, write);
  return factionRegistryWriteQueue;
}

export function registerFactionAssets(attitude, assets, options = {}) {
  return updateFactionRegistry((registry) => mergeFactionAssets(registry, attitude, assets), options);
}

export function clearRegisteredFaction(attitude, options = {}) {
  return updateFactionRegistry((registry) => removeFactionFromRegistry(registry, attitude), options);
}

export async function clearFactionRegistry(options = {}) {
  return updateFactionRegistry(() => ({}), options);
}

export async function rememberKnownItemFactions(items, options = {}) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const attitude = String(item?.metadata?.[`${ID}/meta`]?.attitude || "")
      .trim()
      .toLowerCase();
    if (!attitude) continue;
    const group = groups.get(attitude) || [];
    group.push(item);
    groups.set(attitude, group);
  }

  return updateFactionRegistry((previous) => {
    let registry = previous;
    for (const [attitude, assets] of groups) {
      registry = mergeFactionAssets(registry, attitude, assets);
    }
    return registry;
  }, options);
}

export async function rememberFactionForIds(ids, attitude, options = {}) {
  const isCurrent = options?.isCurrent || (() => true);
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!isCurrent()) return null;
  if (!uniqueIds.length) return readFactionRegistry(options);
  const items = await OBR.scene.items.getItems(uniqueIds);
  if (!isCurrent()) return null;
  const registry = await registerFactionAssets(attitude, items, options);
  if (!isCurrent()) return null;
  try {
    const { reconcileZeroHPConditionsForItems } = await import("./hpConditionAutomation.js");
    if (isCurrent()) await reconcileZeroHPConditionsForItems(uniqueIds);
  } catch (error) {
    console.warn("[factions] zero HP condition sync:", error?.message || error);
  }
  return registry;
}

export { registeredAttitudeForItem };
