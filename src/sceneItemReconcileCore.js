function normalizedIdentity(value) {
  return String(value || "").trim();
}

function byStableId(left, right) {
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function planOwnedSceneItemReconcile({
  desired = [],
  existing = [],
  identityOfDesired = (spec) => spec?.identity,
  identityOfItem,
  isCompatible = () => true,
  needsUpdate = () => false,
} = {}) {
  if (typeof identityOfItem !== "function") {
    throw new TypeError("scene-item-identity-reader-required");
  }

  const desiredByIdentity = new Map();
  for (const spec of Array.isArray(desired) ? desired : []) {
    const identity = normalizedIdentity(identityOfDesired(spec));
    if (!identity) throw new TypeError("scene-item-desired-identity-required");
    desiredByIdentity.set(identity, spec);
  }

  const existingByIdentity = new Map();
  const invalidItems = [];
  for (const item of Array.isArray(existing) ? existing : []) {
    if (!item?.id) continue;
    const identity = normalizedIdentity(identityOfItem(item));
    if (!identity) {
      invalidItems.push(item);
      continue;
    }
    if (!existingByIdentity.has(identity)) existingByIdentity.set(identity, []);
    existingByIdentity.get(identity).push(item);
  }

  const additions = [];
  const updates = [];
  const deleteIds = new Set(invalidItems.map((item) => item.id));
  const keepers = new Map();

  for (const [identity, spec] of desiredByIdentity) {
    const matches = (existingByIdentity.get(identity) || []).sort(byStableId);
    const compatible = matches.filter((item) => isCompatible(item, spec));
    const exact = compatible.filter((item) => !needsUpdate(item, spec));
    const keeper = exact[0] || compatible[0] || null;
    if (!keeper) additions.push(spec);
    else {
      keepers.set(identity, keeper);
      if (needsUpdate(keeper, spec)) updates.push({ identity, item: keeper, spec });
    }
    for (const item of matches) {
      if (item !== keeper) deleteIds.add(item.id);
    }
    existingByIdentity.delete(identity);
  }

  for (const matches of existingByIdentity.values()) {
    for (const item of matches) deleteIds.add(item.id);
  }

  return {
    additions,
    updates,
    deleteIds: [...deleteIds].sort(),
    keepers,
  };
}

function staleResult(metrics) {
  return {
    outcome: "stale",
    recovered: metrics.errors.length > 0,
    metrics,
    itemsByIdentity: new Map(),
  };
}

/**
 * Converges an owned subset of scene items without removing the last usable
 * representation of a desired identity. Every mutation is followed by a
 * fresh read, so ambiguous SDK failures (the write applied but the promise
 * rejected) are safe to retry.
 */
export async function reconcileOwnedSceneItems({
  desired = [],
  readItems,
  identityOfDesired = (spec) => spec?.identity,
  identityOfItem,
  isCompatible = () => true,
  needsUpdate = () => false,
  buildItem,
  addItems,
  updateItems,
  deleteItems,
  isCurrent = null,
  maxPasses = 10,
  initialItems = null,
} = {}) {
  if (typeof readItems !== "function") throw new TypeError("scene-item-reader-required");
  if (typeof identityOfItem !== "function") throw new TypeError("scene-item-identity-reader-required");
  const current = () => typeof isCurrent !== "function" || isCurrent();
  const safeMaxPasses = Math.max(1, Math.floor(Number(maxPasses) || 10));
  const metrics = {
    passes: 0,
    reads: 0,
    addCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    requestedAdds: 0,
    requestedUpdates: 0,
    requestedDeletes: 0,
    errors: [],
  };
  let lastError = null;
  let lastPhase = "read";
  let initialSnapshot = Array.isArray(initialItems) ? initialItems : null;

  const recordError = (phase, error) => {
    lastPhase = phase;
    lastError = error;
    metrics.errors.push({ phase, message: String(error?.message || error) });
  };

  for (let pass = 1; pass <= safeMaxPasses; pass += 1) {
    metrics.passes = pass;
    if (!current()) return staleResult(metrics);

    let existing;
    try {
      lastPhase = "read";
      if (initialSnapshot) {
        existing = initialSnapshot;
        initialSnapshot = null;
      } else {
        metrics.reads += 1;
        existing = await readItems();
      }
    } catch (error) {
      recordError("read", error);
      continue;
    }
    if (!current()) return staleResult(metrics);

    const plan = planOwnedSceneItemReconcile({
      desired,
      existing,
      identityOfDesired,
      identityOfItem,
      isCompatible,
      needsUpdate,
    });

    if (plan.additions.length) {
      try {
        if (typeof buildItem !== "function" || typeof addItems !== "function") {
          throw new TypeError("scene-item-add-phase-required");
        }
        const additions = plan.additions.map((spec) => buildItem(spec));
        if (!current()) return staleResult(metrics);
        lastPhase = "add";
        metrics.addCalls += 1;
        metrics.requestedAdds += additions.length;
        await addItems(additions);
      } catch (error) {
        recordError("add", error);
      }
      continue;
    }

    if (plan.updates.length) {
      try {
        if (typeof updateItems !== "function") {
          throw new TypeError("scene-item-update-phase-required");
        }
        if (!current()) return staleResult(metrics);
        lastPhase = "update";
        metrics.updateCalls += 1;
        metrics.requestedUpdates += plan.updates.length;
        await updateItems(plan.updates);
      } catch (error) {
        recordError("update", error);
      }
      continue;
    }

    if (plan.deleteIds.length) {
      try {
        if (typeof deleteItems !== "function") {
          throw new TypeError("scene-item-delete-phase-required");
        }
        if (!current()) return staleResult(metrics);
        lastPhase = "delete";
        metrics.deleteCalls += 1;
        metrics.requestedDeletes += plan.deleteIds.length;
        await deleteItems(plan.deleteIds);
      } catch (error) {
        recordError("delete", error);
      }
      continue;
    }

    return {
      outcome: metrics.errors.length ? "recovered" : "converged",
      recovered: metrics.errors.length > 0,
      metrics,
      itemsByIdentity: plan.keepers,
    };
  }

  const error = new Error(`scene-item-reconcile-exhausted:${lastPhase}`);
  error.phase = lastPhase;
  error.cause = lastError;
  error.metrics = metrics;
  throw error;
}
