function isAllowed(isCurrent) {
  return typeof isCurrent !== "function" || isCurrent();
}

export async function runStaticSpellZoneRemovalTransaction({
  snapshots = [],
  deleteItems,
  addItems,
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

  await deleteItems(ids);
  if (!isAllowed(isCurrent)) return undefined;

  try {
    if (!isAllowed(isCurrent)) return undefined;
    const result = await action();
    return isAllowed(isCurrent) ? result : undefined;
  } catch (error) {
    if (!isAllowed(isCurrent)) return undefined;
    try {
      await addItems(items);
    } catch {}
    if (!isAllowed(isCurrent)) return undefined;
    throw error;
  }
}
