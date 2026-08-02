import { reconcileOwnedSceneItems } from "./sceneItemReconcileCore.js";

function isAllowed(isCurrent) {
  return typeof isCurrent !== "function" || isCurrent();
}

export async function runStaticSpellZoneRemovalTransaction({
  snapshots = [],
  deleteItems,
  addItems,
  readItems = null,
  action,
  isCurrent,
} = {}) {
  if (typeof action !== "function") throw new TypeError("static-zone-action-required");
  const items = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
  const ids = items.map((item) => item.id).filter(Boolean);

  if (!isAllowed(isCurrent)) return undefined;
  if (!ids.length) {
    const result = await action();
    return isAllowed(isCurrent) ? result : undefined;
  }

  if (typeof readItems !== "function") {
    throw new TypeError("static-zone-item-reader-required");
  }

  const removal = await reconcileOwnedSceneItems({
    desired: [],
    readItems: () => readItems(ids),
    identityOfItem: (item) => item?.id,
    deleteItems,
    isCurrent,
  });
  if (removal.outcome === "stale") return undefined;
  if (!isAllowed(isCurrent)) return undefined;

  try {
    if (!isAllowed(isCurrent)) return undefined;
    const result = await action();
    return isAllowed(isCurrent) ? result : undefined;
  } catch (error) {
    if (!isAllowed(isCurrent)) return undefined;
    try {
      const restore = await reconcileOwnedSceneItems({
        desired: items,
        identityOfDesired: (item) => item?.id,
        readItems: () => readItems(ids),
        identityOfItem: (item) => item?.id,
        isCompatible: () => true,
        buildItem: (item) => item,
        addItems,
        deleteItems,
        isCurrent,
      });
      if (restore.outcome === "stale") return undefined;
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    if (!isAllowed(isCurrent)) return undefined;
    throw error;
  }
}
