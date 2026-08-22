function deliveryKeyFor(payload, sceneEpoch) {
  const turnKey = String(payload?.turnKey || "").trim();
  if (!turnKey) return "";
  return `${sceneEpoch}:${turnKey}`;
}

/**
 * Owns producer-side Turn Notice delivery. Pending UI notices are latest-wins;
 * a successful send is the only point at which the delivery key is committed.
 */
export function createTurnNoticeDeliveryCapability({
  send,
  isCurrent = () => true,
  onEvent = () => {},
} = {}) {
  if (typeof send !== "function") throw new TypeError("send must be a function");

  let latest = null;
  let failed = null;
  let inFlight = null;
  let pumpPromise = null;
  let pumpScheduled = false;
  let lastDeliveredKey = "";
  let generation = 0;

  function emit(type, candidate, detail = {}) {
    try {
      onEvent({
        type,
        key: candidate?.key || "",
        sceneEpoch: candidate?.sceneEpoch,
        turnKey: candidate?.payload?.turnKey || "",
        activeId: candidate?.payload?.currentId || "",
        ...detail,
      }, candidate);
    } catch {
      // Diagnostics must never affect notice delivery.
    }
  }

  async function pump(acceptedGeneration) {
    let deliveredAny = false;
    while (acceptedGeneration === generation && latest) {
      const candidate = latest;
      latest = null;
      if (candidate.key === lastDeliveredKey) continue;
      if (!isCurrent(candidate.sceneEpoch)) continue;

      inFlight = candidate;
      try {
        const delivered = await send(candidate.payload, candidate.sceneEpoch, candidate);
        if (
          acceptedGeneration !== generation
          || !isCurrent(candidate.sceneEpoch)
        ) continue;
        if (delivered === false) {
          throw new Error("turn-notice-delivery-not-confirmed");
        }
        if (latest && latest.key !== candidate.key) {
          emit("superseded", candidate, { byKey: latest.key, source: candidate.source });
          continue;
        }
        lastDeliveredKey = candidate.key;
        failed = null;
        deliveredAny = true;
        emit("delivered", candidate);
      } catch (error) {
        if (acceptedGeneration !== generation) continue;
        failed = latest?.key === candidate.key ? null : candidate;
        emit("delivery-failed", candidate, {
          reason: String(error?.message || error || "turn-notice-delivery-failed"),
        });
      } finally {
        if (inFlight?.key === candidate.key) inFlight = null;
      }
    }
    return deliveredAny;
  }

  function schedulePump() {
    if (pumpPromise || pumpScheduled) return pumpPromise;
    pumpScheduled = true;
    const acceptedGeneration = generation;
    const scheduled = Promise.resolve().then(() => {
      pumpScheduled = false;
      return pump(acceptedGeneration);
    });
    pumpPromise = scheduled;
    void scheduled.finally(() => {
      if (pumpPromise === scheduled) pumpPromise = null;
    });
    return scheduled;
  }

  function request(payload, sceneEpoch, { source = "unknown" } = {}) {
    const key = deliveryKeyFor(payload, sceneEpoch);
    if (!key || !isCurrent(sceneEpoch)) return Promise.resolve(false);
    if (key === lastDeliveredKey) return Promise.resolve(false);
    if (inFlight?.key === key || latest?.key === key) return schedulePump();

    if (latest && latest.key !== key) {
      emit("superseded", latest, { byKey: key, source });
    }
    if (failed?.key === key) failed = null;
    latest = { payload, sceneEpoch, key, source };
    emit("requested", latest, { source });
    return schedulePump();
  }

  function hasRetryable(payload, sceneEpoch) {
    return failed?.key === deliveryKeyFor(payload, sceneEpoch);
  }

  function reset(reason = "scene-reset") {
    generation += 1;
    latest = null;
    failed = null;
    inFlight = null;
    pumpPromise = null;
    pumpScheduled = false;
    lastDeliveredKey = "";
    emit("reset", null, { reason });
  }

  return {
    request,
    hasRetryable,
    reset,
    getState() {
      return {
        latestKey: latest?.key || "",
        failedKey: failed?.key || "",
        inFlightKey: inFlight?.key || "",
        lastDeliveredKey,
        generation,
      };
    },
  };
}
