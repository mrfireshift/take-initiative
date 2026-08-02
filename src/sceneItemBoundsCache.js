function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pointSignature(value) {
  return [finite(value?.x), finite(value?.y)];
}

function itemGeometrySignature(item) {
  return JSON.stringify({
    type: String(item?.type || ""),
    layer: String(item?.layer || ""),
    attachedTo: String(item?.attachedTo || ""),
    position: pointSignature(item?.position),
    rotation: finite(item?.rotation),
    scale: pointSignature(item?.scale),
    image: [
      finite(item?.image?.width),
      finite(item?.image?.height),
      String(item?.image?.url || item?.image?.src || ""),
    ],
    grid: [
      finite(item?.grid?.dpi),
      ...pointSignature(item?.grid?.offset),
    ],
  });
}

async function withTimeout(task, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("item-bounds-timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export function createSceneItemBoundsCache(
  loadBounds,
  { timeoutMs = 1200 } = {},
) {
  if (typeof loadBounds !== "function") {
    throw new TypeError("item-bounds-loader-required");
  }
  const cache = new Map();
  const pending = new Map();
  const itemGenerations = new Map();
  let cacheGeneration = 0;
  const safeTimeoutMs = Math.max(1, Math.floor(Number(timeoutMs) || 1200));

  const invalidateIds = (itemIds = []) => {
    for (const itemId of itemIds) {
      const id = String(itemId || "").trim();
      if (!id) continue;
      cache.delete(id);
      pending.delete(id);
      itemGenerations.set(id, (itemGenerations.get(id) || 0) + 1);
    }
  };

  const loadFresh = (item, signature) => {
    const active = pending.get(item.id);
    if (active?.signature === signature && active.cacheGeneration === cacheGeneration) {
      return active.promise;
    }
    const itemGeneration = (itemGenerations.get(item.id) || 0) + 1;
    itemGenerations.set(item.id, itemGeneration);
    const startedCacheGeneration = cacheGeneration;
    const entry = {
      signature,
      cacheGeneration: startedCacheGeneration,
      promise: null,
    };
    entry.promise = withTimeout(
      () => loadBounds(item.id),
      safeTimeoutMs,
    ).then((bounds) => {
      if (!bounds) throw new Error("item-bounds-missing");
      if (
        cacheGeneration === startedCacheGeneration
        && itemGenerations.get(item.id) === itemGeneration
      ) {
        cache.set(item.id, { signature, bounds });
      }
      return bounds;
    }).finally(() => {
      if (pending.get(item.id) === entry) pending.delete(item.id);
    });
    pending.set(item.id, entry);
    return entry.promise;
  };

  return {
    async load(items = []) {
      const list = (Array.isArray(items) ? items : [])
        .filter((item) => String(item?.id || "").trim());
      const liveIds = new Set(list.map((item) => item.id));
      for (const itemId of cache.keys()) {
        if (!liveIds.has(itemId)) invalidateIds([itemId]);
      }

      const boundsById = new Map();
      const missingIds = [];
      for (const item of list) {
        const signature = itemGeometrySignature(item);
        const cached = cache.get(item.id);
        if (cached?.signature === signature) {
          boundsById.set(item.id, cached.bounds);
          continue;
        }
        try {
          const bounds = await loadFresh(item, signature);
          boundsById.set(item.id, bounds);
        } catch {
          missingIds.push(item.id);
          if (cached?.bounds) boundsById.set(item.id, cached.bounds);
        }
      }

      return {
        boundsById,
        complete: missingIds.length === 0,
        missingIds,
      };
    },
    invalidate(itemIds = []) {
      invalidateIds(Array.isArray(itemIds) ? itemIds : [itemIds]);
    },
    clear() {
      cacheGeneration += 1;
      cache.clear();
      pending.clear();
      itemGenerations.clear();
    },
  };
}
