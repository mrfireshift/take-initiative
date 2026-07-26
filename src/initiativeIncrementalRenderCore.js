import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const LOCAL_TRACKER_META_KEYS = new Set([
  "hp",
  "hpMax",
  "conditions",
  `${ID}/spells`,
  `${ID}/concentration`,
  "legendary",
  "legendaryResistances",
  "initTouched",
]);

function fingerprint(value) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (_key, current) => {
    if (!current || typeof current !== "object") return current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    if (Array.isArray(current)) return current;
    return Object.keys(current).sort().reduce((result, key) => {
      result[key] = current[key];
      return result;
    }, {});
  });
  return json === undefined ? "undefined" : json;
}

function changedMetadataKeys(beforeMeta, afterMeta) {
  const previous = beforeMeta && typeof beforeMeta === "object" ? beforeMeta : {};
  const next = afterMeta && typeof afterMeta === "object" ? afterMeta : {};
  return new Set([...Object.keys(previous), ...Object.keys(next)]
    .filter((key) => fingerprint(previous[key]) !== fingerprint(next[key])));
}

export function planIncrementalTrackerItemRender(event) {
  if (!event?.flags?.tracker) return { mode: "none", itemIds: [] };

  const itemIds = new Set();
  for (const record of event.changedRecords || []) {
    const beforeItem = record?.before?.item;
    const afterItem = record?.after?.item;
    const beforeMeta = beforeItem?.metadata?.[META_KEY];
    const afterMeta = afterItem?.metadata?.[META_KEY];
    const wasTracked = beforeMeta?.inInitiative === true;
    const isTracked = afterMeta?.inInitiative === true;

    if (!wasTracked && !isTracked) continue;
    if (!beforeItem || !afterItem || wasTracked !== isTracked) {
      return { mode: "full", itemIds: [] };
    }
    if (fingerprint(beforeItem.name) !== fingerprint(afterItem.name)) {
      return { mode: "full", itemIds: [] };
    }

    const changedKeys = changedMetadataKeys(beforeMeta, afterMeta);
    if ([...changedKeys].some((key) => !LOCAL_TRACKER_META_KEYS.has(key))) {
      return { mode: "full", itemIds: [] };
    }
    itemIds.add(afterItem.id);
  }

  return itemIds.size
    ? { mode: "cards", itemIds: [...itemIds] }
    : { mode: "none", itemIds: [] };
}
