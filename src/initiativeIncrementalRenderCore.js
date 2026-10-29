import { ID } from "./constants.js";
import {
  changedSceneItemMetadataKeys,
  TRACKER_LOCAL_METADATA_KEYS,
} from "./sceneItemChangeDispatcherCore.js";

const META_KEY = `${ID}/meta`;

export function planIncrementalTrackerItemRender(event) {
  const trackerChanged = event?.flags?.tracker === true;
  if (!trackerChanged && event?.flags?.visibility !== true) return { mode: "none", itemIds: [] };

  const itemIds = new Set();
  for (const record of event.changedRecords || []) {
    const beforeItem = record?.before?.item;
    const afterItem = record?.after?.item;
    const beforeMeta = beforeItem?.metadata?.[META_KEY];
    const afterMeta = afterItem?.metadata?.[META_KEY];
    const wasTracked = beforeMeta?.inInitiative === true;
    const isTracked = afterMeta?.inInitiative === true;

    // Shown or hidden by the GM (lot L16): the card enters or leaves the players' tracker at once.
    if ((wasTracked || isTracked) && beforeItem && afterItem
        && (beforeItem.visible !== false) !== (afterItem.visible !== false)) {
      return { mode: "full", itemIds: [] };
    }
    if (!trackerChanged) continue;

    if (beforeMeta?.sharedHpSourceId || afterMeta?.sharedHpSourceId) {
      const changedKeys = changedSceneItemMetadataKeys(record?.before, record?.after);
      if (!beforeItem || !afterItem
          || beforeMeta?.sharedHpSourceId !== afterMeta?.sharedHpSourceId
          || record?.before?.nameSignature !== record?.after?.nameSignature
          || [...changedKeys].some(key => !TRACKER_LOCAL_METADATA_KEYS.has(key))) {
        return { mode: "full", itemIds: [] };
      }
      itemIds.add(afterMeta.sharedHpSourceId);
      continue;
    }

    if (!wasTracked && !isTracked) continue;
    if (!beforeItem || !afterItem || wasTracked !== isTracked) {
      return { mode: "full", itemIds: [] };
    }
    if (record?.before?.nameSignature !== record?.after?.nameSignature) {
      return { mode: "full", itemIds: [] };
    }

    const changedKeys = changedSceneItemMetadataKeys(record?.before, record?.after);
    if ([...changedKeys].some((key) => !TRACKER_LOCAL_METADATA_KEYS.has(key))) {
      return { mode: "full", itemIds: [] };
    }
    itemIds.add(afterItem.id);
  }

  return itemIds.size
    ? { mode: "cards", itemIds: [...itemIds] }
    : { mode: "none", itemIds: [] };
}
