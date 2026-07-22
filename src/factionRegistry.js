import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  mergeFactionAssets,
  normalizeFactionRegistry,
  registeredAttitudeForItem,
  removeFactionFromRegistry,
} from "./factionRegistryCore.js";

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

export async function readFactionRegistry() {
  const local = readLocalFactionRegistry();
  const metadata = await OBR.room.getMetadata().catch(() => ({}));
  return mergeFactionRegistries(local, metadata?.[FACTION_REGISTRY_KEY]);
}

async function updateFactionRegistry(updater) {
  const write = async () => {
    const metadata = await OBR.room.getMetadata().catch(() => ({}));
    const previous = mergeFactionRegistries(
      readLocalFactionRegistry(),
      metadata?.[FACTION_REGISTRY_KEY]
    );
    const next = normalizeFactionRegistry(updater(previous) || previous);
    const localWritten = writeLocalFactionRegistry(next);
    try {
      await OBR.room.setMetadata({ ...metadata, [FACTION_REGISTRY_KEY]: next });
    } catch (error) {
      if (!localWritten) throw error;
    }
    return next;
  };
  factionRegistryWriteQueue = factionRegistryWriteQueue.then(write, write);
  return factionRegistryWriteQueue;
}

export function registerFactionAssets(attitude, assets) {
  return updateFactionRegistry((registry) => mergeFactionAssets(registry, attitude, assets));
}

export function clearRegisteredFaction(attitude) {
  return updateFactionRegistry((registry) => removeFactionFromRegistry(registry, attitude));
}

export async function clearFactionRegistry() {
  return updateFactionRegistry(() => ({}));
}

export async function rememberKnownItemFactions(items) {
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
  });
}

export async function rememberFactionForIds(ids, attitude) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!uniqueIds.length) return readFactionRegistry();
  const items = await OBR.scene.items.getItems(uniqueIds);
  const registry = await registerFactionAssets(attitude, items);
  try {
    const { reconcileZeroHPConditionsForItems } = await import("./hpConditionAutomation.js");
    await reconcileZeroHPConditionsForItems(uniqueIds);
  } catch (error) {
    console.warn("[factions] zero HP condition sync:", error?.message || error);
  }
  return registry;
}

export { registeredAttitudeForItem };
