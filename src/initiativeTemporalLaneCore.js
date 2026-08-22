function descriptorDetail(descriptor) {
  return {
    transitionSeq: descriptor?.transitionSeq,
    metadataRevision: descriptor?.metadataRevision,
    roundDelta: descriptor?.roundDelta,
    boundaryCount: Array.isArray(descriptor?.conditionBoundaries)
      ? descriptor.conditionBoundaries.length
      : 0,
    commandId: descriptor?.commandId || descriptor?.roundCommandId || descriptor?.boundaryCommandId,
  };
}

/**
 * Serializes temporal side effects without serializing the UI/render queue.
 * Semantic failures block the lane; transport failures keep the descriptor at
 * the head until an explicit or bounded lifecycle-safe recovery is requested.
 */
export function createInitiativeTemporalLane({
  apply,
  isCurrent = () => true,
  onEvent = () => {},
  recoveryDelayMs = 1000,
} = {}) {
  if (typeof apply !== "function") throw new TypeError("apply must be a function");

  let tail = Promise.resolve();
  let generation = 0;
  let semanticBlocked = null;
  let transportPending = null;
  let recoveryResolver = null;
  let recoveryRequested = false;
  let recoveryTimer = null;
  let headDescriptor = null;
  let running = false;
  let pending = 0;

  function emit(type, descriptor, detail = {}) {
    try {
      onEvent({
        type,
        ...descriptorDetail(descriptor),
        ...detail,
      }, descriptor);
    } catch {
      // Diagnostics must never affect gameplay ordering.
    }
  }

  function isTransportFailure(result) {
    return result?.status === "failed"
      && (
        result?.error?.name === "BackgroundTransportError"
        || result?.name === "BackgroundTransportError"
      );
  }

  function clearRecoveryTimer() {
    if (recoveryTimer === null) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  function requestRecovery(reason = "explicit") {
    if (!transportPending || semanticBlocked) return false;
    if (recoveryRequested || !recoveryResolver) return false;
    clearRecoveryTimer();
    recoveryRequested = true;
    recoveryResolver({ generation, reason });
    recoveryResolver = null;
    return true;
  }

  function scheduleRecovery(allowDelayed = true) {
    if (
      !allowDelayed
      || recoveryTimer !== null
      || recoveryRequested
      || recoveryResolver === null
      || !Number.isFinite(Number(recoveryDelayMs))
      || Number(recoveryDelayMs) < 0
    ) return;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      requestRecovery("delayed");
    }, Number(recoveryDelayMs));
  }

  function waitForRecovery(acceptedGeneration, { allowDelayed = true } = {}) {
    if (acceptedGeneration !== generation) return Promise.resolve(null);
    if (recoveryRequested) {
      recoveryRequested = false;
      return Promise.resolve({ generation, reason: "already-requested" });
    }
    return new Promise((resolve) => {
      recoveryResolver = (signal) => resolve(signal);
      scheduleRecovery(allowDelayed);
    }).then((signal) => {
      if (acceptedGeneration !== generation || signal?.generation !== generation) return null;
      recoveryRequested = false;
      return signal;
    });
  }

  function enqueue(descriptor) {
    if (!descriptor || typeof descriptor !== "object") {
      return Promise.resolve({ status: "rejected", reason: "invalid-temporal-descriptor" });
    }
    if (semanticBlocked) {
      emit("blocked", descriptor, { reason: "lane-blocked" });
      return Promise.resolve({ status: "blocked", reason: "lane-blocked" });
    }

    const acceptedGeneration = generation;
    pending += 1;
    emit("enqueue", descriptor);

    const run = async () => {
      headDescriptor = descriptor;
      try {
        if (acceptedGeneration !== generation || !isCurrent(descriptor)) {
          return { status: "stale", reason: "scene-reset" };
        }
        if (semanticBlocked) {
          emit("blocked", descriptor, { reason: "lane-blocked" });
          return { status: "blocked", reason: "lane-blocked" };
        }

        let recoveryAttempt = 0;
        while (true) {
          running = true;
          if (recoveryAttempt > 0) {
            emit("recovery-attempt", descriptor, { attempt: recoveryAttempt });
          } else {
            emit("attempt", descriptor, { attempt: 1 });
          }

          let result;
          try {
            result = await apply(descriptor);
          } catch (error) {
            result = {
              status: "failed",
              error: {
                name: String(error?.name || "Error"),
                message: String(error?.message || error || "Temporal mutation failed."),
              },
            };
          } finally {
            running = false;
          }

          if (acceptedGeneration !== generation || !isCurrent(descriptor)) {
            return { status: "stale", reason: "scene-reset" };
          }
          if (result?.status === "applied") {
            transportPending = null;
            emit("applied", descriptor);
            return result;
          }

          if (isTransportFailure(result)) {
            transportPending = { descriptor, result, recoveryAttempt };
            emit("transport-pending", descriptor, {
              reason: result?.error?.message || "background-transport-unavailable",
              recoveryAttempt,
            });
            const signal = await waitForRecovery(acceptedGeneration, {
              allowDelayed: recoveryAttempt === 0,
            });
            if (!signal) return { status: "stale", reason: "scene-reset" };
            transportPending = null;
            recoveryAttempt += 1;
            continue;
          }

          semanticBlocked = { descriptor, result };
          emit("blocked", descriptor, {
            reason: result?.reason
              || result?.error?.name
              || result?.status
              || "temporal-mutation-failed",
          });
          return { status: "blocked", result };
        }
      } finally {
        if (headDescriptor === descriptor) headDescriptor = null;
        if (acceptedGeneration === generation) {
          pending = Math.max(0, pending - 1);
        }
      }
    };

    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  }

  function reset(reason = "scene-reset") {
    generation += 1;
    tail = Promise.resolve();
    pending = 0;
    semanticBlocked = null;
    transportPending = null;
    recoveryRequested = false;
    clearRecoveryTimer();
    if (recoveryResolver) {
      const resolve = recoveryResolver;
      recoveryResolver = null;
      resolve(null);
    }
    headDescriptor = null;
    running = false;
    emit("reset", null, { reason });
  }

  return {
    enqueue,
    recover: requestRecovery,
    reset,
    idle: () => tail,
    get pending() {
      return pending;
    },
    getState() {
      return {
        status: semanticBlocked
          ? "semantic-blocked"
          : transportPending
          ? "transport-pending"
          : running
          ? "running"
          : "queued",
        blocked: !!semanticBlocked,
        transportPending: !!transportPending,
        head: headDescriptor,
        pending,
        generation,
      };
    },
  };
}
