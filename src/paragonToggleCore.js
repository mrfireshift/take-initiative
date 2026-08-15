export const PARAGON_TOGGLE_STATUS = Object.freeze({
  APPLIED: "applied",
  DUPLICATE: "duplicate",
  BLOCKED: "blocked",
  CONFLICT: "conflict",
  REJECTED: "rejected",
  FAILED: "failed",
});

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("paragon-command-value-must-not-be-cyclic");
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map((entry) => stableValue(entry, seen));
    seen.delete(value);
    return output;
  }
  const output = Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, stableValue(value[key], seen)]),
  );
  seen.delete(value);
  return output;
}

function semanticEqual(left, right) {
  try {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  } catch {
    return left === right;
  }
}

function serializedError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Paragon command failed."),
  };
}

function normalizedIds(ids) {
  return Array.from(new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  ));
}

function hasParagon(item) {
  return isRecord(item?.metadata?.["com.thebigpicture.initiative/meta"]?.paragon);
}

function hasActiveLegendary(item) {
  const value = item?.metadata?.["com.thebigpicture.initiative/meta"]?.legendary;
  return isRecord(value) && Number(value.max) > 0;
}

function isEpic(item) {
  return !!item?.metadata?.["com.thebigpicture.initiative/meta"]?.epic;
}

function sceneContext(value, fallback = {}) {
  const source = isRecord(value) ? value : {};
  const identity = String(source.identity ?? source.sceneIdentity ?? fallback.identity ?? "").trim();
  return {
    ready: source.ready !== false,
    identity: identity || null,
    epoch: source.epoch ?? source.sceneEpoch ?? fallback.epoch ?? 0,
  };
}

function sceneKey(scene) {
  return `${scene.identity || ""}:${String(scene.epoch ?? "")}:${scene.ready ? "ready" : "unready"}`;
}

function ambiguous(error) {
  if (error?.ambiguous === true || error?.committed === "unknown") return true;
  const text = `${error?.code || ""} ${error?.name || ""} ${error?.message || error || ""}`.toLowerCase();
  return text.includes("timeout") || text.includes("timed out") || text.includes("abort");
}

function commandFingerprint({ ids, desired, commandId }) {
  try {
    return JSON.stringify(stableValue({ ids, desired, commandId: String(commandId || "") }));
  } catch {
    return `${ids.join(",")}:${String(commandId || "")}`;
  }
}

/**
 * Executes a Paragon enable/disable intent against authoritative token reads.
 * It never toggles from the post-read value: each token receives an explicit
 * desired boolean and state cleanup is a separate idempotent command.
 */
export function createParagonToggleExecutor({
  readItems,
  updateItems,
  readBackItems = readItems,
  patchParagonInits,
  getRole = async () => "GM",
  getSceneContext = null,
  isSceneCurrent = () => true,
  initialSceneContext = { ready: true, identity: "runtime", epoch: 0 },
  defaultActions = 2,
} = {}) {
  if (typeof readItems !== "function") throw new TypeError("readItems must be a function");
  if (typeof updateItems !== "function") throw new TypeError("updateItems must be a function");
  if (typeof readBackItems !== "function") throw new TypeError("readBackItems must be a function");
  if (typeof patchParagonInits !== "function") throw new TypeError("patchParagonInits must be a function");

  let manualScene = sceneContext(initialSceneContext);
  let scene = manualScene;
  let generation = 0;
  let lastSceneKey = null;
  let queue = Promise.resolve();
  let sequence = 0;
  const records = new Map();
  const inFlight = new Map();

  function currentScene() {
    let raw = manualScene;
    if (typeof getSceneContext === "function") {
      try { raw = getSceneContext(); } catch { raw = { ready: false }; }
    }
    const next = sceneContext(raw, manualScene);
    const key = sceneKey(next);
    if (lastSceneKey !== null && key !== lastSceneKey) {
      generation += 1;
      records.clear();
      inFlight.clear();
    }
    scene = { ...next, generation };
    lastSceneKey = key;
    return scene;
  }

  function isCurrent(captured) {
    const live = currentScene();
    if (!live.ready || live.generation !== captured?.generation) return false;
    if (live.identity !== (captured?.identity || null)) return false;
    if (String(live.epoch ?? "") !== String(captured?.epoch ?? "")) return false;
    try { return isSceneCurrent(captured) !== false; } catch { return false; }
  }

  function setSceneContext(next = {}) {
    manualScene = sceneContext(next, manualScene);
    generation += 1;
    records.clear();
    inFlight.clear();
    scene = { ...manualScene, generation };
    lastSceneKey = sceneKey(scene);
    return { ...scene };
  }

  function resetSceneScope() {
    generation += 1;
    records.clear();
    inFlight.clear();
    return { ...currentScene() };
  }

  function desiredMap(ids, desiredEnabled, itemsById) {
    const map = new Map();
    for (const id of ids) {
      let wanted;
      if (desiredEnabled instanceof Map && desiredEnabled.has(id)) {
        wanted = desiredEnabled.get(id);
      } else if (isRecord(desiredEnabled) && Object.hasOwn(desiredEnabled, id)) {
        wanted = desiredEnabled[id];
      } else if (typeof desiredEnabled === "boolean") {
        wanted = desiredEnabled;
      } else {
        wanted = !hasParagon(itemsById.get(id));
      }
      map.set(id, wanted === true);
    }
    return map;
  }

  function desiredFingerprintValue(ids, desiredEnabled) {
    if (desiredEnabled instanceof Map) return Object.fromEntries(ids.map((id) => [id, desiredEnabled.get(id)]));
    if (isRecord(desiredEnabled)) return Object.fromEntries(ids.map((id) => [id, desiredEnabled[id]]));
    return typeof desiredEnabled === "boolean" ? desiredEnabled : "derive-from-authoritative-read";
  }

  function baseResult(commandId, captured) {
    return {
      commandId,
      sceneIdentity: captured.identity,
      sceneEpoch: captured.epoch,
      changed: false,
      applied: false,
      committed: false,
    };
  }

  function cleanupSuccess(result) {
    return result?.status === "applied"
      || result?.status === "unchanged"
      || result?.status === "duplicate";
  }

  async function executeCleanup({ commandId, ids, captured, result }) {
    const disabledIds = normalizedIds(ids);
    if (!disabledIds.length) {
      result.cleanupPending = false;
      result.cleanupResult = { status: "unchanged", changed: false, committed: false };
      return result.cleanupResult;
    }
    if (!isCurrent(captured)) {
      result.cleanupPending = true;
      result.cleanupResult = {
        status: "rejected",
        reason: "stale-before-paragon-cleanup",
        committed: false,
      };
      return result.cleanupResult;
    }
    try {
      const cleanupResult = await patchParagonInits({
        commandId: `${commandId}:cleanup`,
        disabledIds,
        scene: captured,
      });
      if (!isCurrent(captured)) {
        result.cleanupPending = true;
        result.cleanupResult = {
          ...cleanupResult,
          stale: true,
          committed: cleanupResult?.committed === true,
        };
        return result.cleanupResult;
      }
      result.cleanupPending = !cleanupSuccess(cleanupResult);
      result.cleanupResult = cleanupResult;
      return cleanupResult;
    } catch (error) {
      result.cleanupPending = true;
      result.cleanupResult = {
        status: "failed",
        committed: false,
        error: serializedError(error),
      };
      return result.cleanupResult;
    }
  }

  async function execute(command, captured) {
    const result = baseResult(command.commandId, captured);
    if (!isCurrent(captured)) return { ...result, status: PARAGON_TOGGLE_STATUS.REJECTED, reason: "stale-before-command" };

    let role;
    try {
      role = await getRole({ command, scene: captured });
    } catch (error) {
      return {
        ...result,
        status: PARAGON_TOGGLE_STATUS.REJECTED,
        reason: "role-unavailable",
        error: serializedError(error),
      };
    }
    if (!isCurrent(captured)) return { ...result, status: PARAGON_TOGGLE_STATUS.REJECTED, reason: "stale-after-role" };
    if (String(role || "PLAYER").toUpperCase() !== "GM") {
      return { ...result, status: PARAGON_TOGGLE_STATUS.REJECTED, reason: "player-not-authorized" };
    }

    let initialItems;
    try {
      initialItems = await readItems(command.ids, { command, scene: captured, phase: "initial-read" });
    } catch (error) {
      return { ...result, status: PARAGON_TOGGLE_STATUS.FAILED, error: serializedError(error) };
    }
    if (!isCurrent(captured)) return { ...result, status: PARAGON_TOGGLE_STATUS.REJECTED, reason: "stale-after-token-read" };

    const itemsById = new Map((Array.isArray(initialItems) ? initialItems : [])
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item]));
    const intents = desiredMap(command.ids, command.desiredEnabled, itemsById);
    const missingIds = command.ids.filter((id) => !itemsById.has(id));
    const blockedIds = command.ids.filter((id) => intents.get(id) === true
      && (hasActiveLegendary(itemsById.get(id)) || isEpic(itemsById.get(id))));
    if (blockedIds.length) {
      return {
        ...result,
        status: PARAGON_TOGGLE_STATUS.BLOCKED,
        reason: "legendary-or-epic-active",
        blockedIds,
        missingIds,
      };
    }
    const targetIds = command.ids.filter((id) => itemsById.has(id));
    if (!targetIds.length) {
      return {
        ...result,
        status: PARAGON_TOGGLE_STATUS.REJECTED,
        reason: "token-not-found",
        missingIds,
      };
    }

    let updateResolved = false;
    let updateAmbiguous = false;
    let updateError = null;
    try {
      await updateItems(targetIds, (draft) => {
        for (const item of draft || []) {
          const id = String(item?.id || "");
          if (!intents.has(id)) continue;
          const metadata = { ...(item.metadata || {}) };
          const meta = { ...(metadata["com.thebigpicture.initiative/meta"] || {}) };
          if (intents.get(id) === true) {
            if (!isRecord(meta.paragon)) meta.paragon = { actions: defaultActions };
          } else {
            delete meta.paragon;
          }
          metadata["com.thebigpicture.initiative/meta"] = meta;
          item.metadata = metadata;
        }
      }, { command, scene: captured });
      updateResolved = true;
    } catch (error) {
      updateError = error;
      updateAmbiguous = ambiguous(error);
      if (!updateAmbiguous) {
        return {
          ...result,
          status: PARAGON_TOGGLE_STATUS.FAILED,
          reason: "token-write-failed-before-commit",
          missingIds,
          error: serializedError(error),
        };
      }
    }
    if (!isCurrent(captured)) {
      return {
        ...result,
        status: updateResolved || updateAmbiguous ? PARAGON_TOGGLE_STATUS.APPLIED : PARAGON_TOGGLE_STATUS.FAILED,
        changed: updateResolved || updateAmbiguous,
        applied: updateResolved || updateAmbiguous,
        committed: updateResolved || updateAmbiguous,
        stale: true,
        postCommitPending: updateResolved || updateAmbiguous,
        missingIds,
        error: updateError ? serializedError(updateError) : undefined,
      };
    }

    let observedItems;
    try {
      observedItems = await readBackItems(command.ids, { command, scene: captured, phase: "token-read-back" });
    } catch (error) {
      if (!updateResolved && updateAmbiguous) {
        return {
          ...result,
          status: PARAGON_TOGGLE_STATUS.FAILED,
          reason: "ambiguous-token-write-unverified",
          missingIds,
          error: serializedError(error),
        };
      }
      const pendingResult = {
        ...result,
        status: PARAGON_TOGGLE_STATUS.APPLIED,
        changed: true,
        applied: true,
        committed: true,
        cleanupPending: true,
        cleanupRetryable: true,
        missingIds,
        postCommitErrors: [{ phase: "token-read-back", error: serializedError(error) }],
      };
      pendingResult.retryCleanup = async () => {
        try {
          const latestItems = await readBackItems(command.ids, {
            command,
            scene: captured,
            phase: "cleanup-retry-read-back",
          });
          if (!isCurrent(captured)) return { status: "rejected", reason: "stale-during-cleanup-retry" };
          const disabledIds = (Array.isArray(latestItems) ? latestItems : [])
            .filter((item) => item?.id && intents.get(String(item.id)) === false && !hasParagon(item))
            .map((item) => String(item.id));
          return executeCleanup({ commandId: command.commandId, ids: disabledIds, captured, result: pendingResult });
        } catch (retryError) {
          pendingResult.cleanupPending = true;
          pendingResult.cleanupResult = { status: "failed", error: serializedError(retryError) };
          return pendingResult.cleanupResult;
        }
      };
      return pendingResult;
    }
    if (!isCurrent(captured)) {
      return {
        ...result,
        status: PARAGON_TOGGLE_STATUS.APPLIED,
        changed: true,
        applied: true,
        committed: true,
        stale: true,
        postCommitPending: true,
        missingIds,
      };
    }

    const observedById = new Map((Array.isArray(observedItems) ? observedItems : [])
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item]));
    const disabledIds = command.ids.filter((id) => intents.get(id) === false
      && observedById.has(id)
      && !hasParagon(observedById.get(id)));
    const coherentIds = command.ids.filter((id) => observedById.has(id)
      && hasParagon(observedById.get(id)) === intents.get(id));
    const pendingResult = {
      ...result,
      status: updateResolved || coherentIds.length ? PARAGON_TOGGLE_STATUS.APPLIED : PARAGON_TOGGLE_STATUS.FAILED,
      reason: updateResolved || coherentIds.length ? undefined : "ambiguous-token-state-unverified",
      changed: updateResolved || coherentIds.length > 0,
      applied: updateResolved || coherentIds.length > 0,
      committed: updateResolved || coherentIds.length > 0,
      missingIds,
      disabledIds,
      coherentIds,
      inconsistentIds: command.ids.filter((id) => observedById.has(id) && !coherentIds.includes(id)),
      ambiguous: updateAmbiguous,
    };
    pendingResult.retryCleanup = async () => executeCleanup({
      commandId: command.commandId,
      ids: disabledIds,
      captured,
      result: pendingResult,
    });
    await executeCleanup({
      commandId: command.commandId,
      ids: disabledIds,
      captured,
      result: pendingResult,
    });
    return pendingResult;
  }

  function enqueue({ ids, desiredEnabled = null, commandId = "" } = {}) {
    const normalized = normalizedIds(ids);
    const current = currentScene();
    const id = String(commandId || `paragon:${current.epoch}:${++sequence}`).trim();
    if (!normalized.length) {
      return Promise.resolve({
        commandId: id,
        status: PARAGON_TOGGLE_STATUS.REJECTED,
        reason: "token-ids-required",
        changed: false,
        applied: false,
        committed: false,
      });
    }
    const fingerprint = commandFingerprint({
      ids: normalized,
      desired: desiredFingerprintValue(normalized, desiredEnabled),
      commandId: id,
    });
    const known = records.get(id);
    if (known) {
      if (known.fingerprint !== fingerprint) {
        return Promise.resolve({
          commandId: id,
          status: PARAGON_TOGGLE_STATUS.CONFLICT,
          reason: "command-id-payload-mismatch",
          changed: false,
          applied: false,
          committed: false,
        });
      }
      if (known.promise) return known.promise;
      return Promise.resolve({ ...known.result, duplicate: true, status: PARAGON_TOGGLE_STATUS.DUPLICATE });
    }
    if (!current.ready) {
      return Promise.resolve({
        commandId: id,
        status: PARAGON_TOGGLE_STATUS.REJECTED,
        reason: "scene-not-ready",
        changed: false,
        applied: false,
        committed: false,
      });
    }
    const captured = { ...current };
    const reservation = { fingerprint, promise: null };
    records.set(id, reservation);
    const task = queue.then(
      () => execute({ ids: normalized, desiredEnabled, commandId: id }, captured),
      () => execute({ ids: normalized, desiredEnabled, commandId: id }, captured),
    );
    const tracked = task.then((result) => {
      if (inFlight.get(id) === tracked) inFlight.delete(id);
      if (captured.generation === scene.generation
        && (result.status === PARAGON_TOGGLE_STATUS.APPLIED
          || result.status === PARAGON_TOGGLE_STATUS.DUPLICATE)) {
        records.set(id, { fingerprint, result });
      } else if (captured.generation === scene.generation) {
        records.delete(id);
      }
      return result;
    }, (error) => {
      if (inFlight.get(id) === tracked) inFlight.delete(id);
      if (captured.generation === scene.generation) records.delete(id);
      return {
        commandId: id,
        status: PARAGON_TOGGLE_STATUS.FAILED,
        changed: false,
        applied: false,
        committed: false,
        error: serializedError(error),
      };
    });
    reservation.promise = tracked;
    inFlight.set(id, tracked);
    queue = tracked.catch(() => {});
    return tracked;
  }

  return Object.freeze({
    enqueue,
    setSceneContext,
    resetSceneScope,
    getSceneContext: () => ({ ...currentScene() }),
    getState: () => ({ scene: { ...currentScene() }, pending: inFlight.size, cachedResults: records.size }),
  });
}
