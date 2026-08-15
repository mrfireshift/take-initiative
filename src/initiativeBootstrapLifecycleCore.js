// Temporary bootstrap coordinator contract; readiness transitions are applied
// by the tracker integration while the scene epoch remains the owner of epoch
// invalidation and baseline acquisition.
export function createInitiativeReadinessHandshake({
  subscribeReadiness,
  readInitialReadiness,
  onState = null,
} = {}) {
  let mounted = false;
  let disposed = false;
  let ready = false;
  let phase = "uninitialized";
  let reason = "not-mounted";
  let generation = 0;
  let unsubscribe = null;
  let mountPromise = null;
  let initialReadSettled = false;
  let readinessEventRevision = 0;
  const readyWaiters = new Set();

  const snapshot = () => Object.freeze({
    ready: ready && !disposed,
    phase,
    reason,
    generation,
    mounted,
    initialReadSettled,
    disposed,
  });

  const settleReadyWaiters = () => {
    if (!ready && !disposed) return;
    const current = snapshot();
    for (const resolve of [...readyWaiters]) {
      readyWaiters.delete(resolve);
      resolve(current);
    }
  };

  const apply = (nextReady, nextReason) => {
    if (disposed) return snapshot();
    const normalizedReady = nextReady === true;
    if (phase !== "uninitialized" && ready === normalizedReady) return snapshot();
    ready = normalizedReady;
    phase = normalizedReady ? "ready" : "unavailable";
    reason = String(nextReason || (normalizedReady ? "scene-ready" : "scene-unavailable"));
    generation += 1;
    try { onState?.(snapshot()); } catch (error) {
      console.warn("[initiative-bootstrap] readiness listener:", error?.message || error);
    }
    settleReadyWaiters();
    return snapshot();
  };

  const receiveSdkState = (nextReady) => {
    if (disposed) return;
    readinessEventRevision += 1;
    apply(nextReady, nextReady === true ? "scene-ready" : "scene-unload");
  };

  const settleInitialRead = (initialReady) => {
    if (disposed) {
      initialReadSettled = true;
      settleReadyWaiters();
      return snapshot();
    }
    if (readinessEventRevision === 0) {
      apply(initialReady === true, initialReady === true
        ? "scene-bootstrap-ready"
        : "scene-bootstrap-unavailable");
    }
    initialReadSettled = true;
    settleReadyWaiters();
    return snapshot();
  };

  function mount() {
    if (mountPromise) return mountPromise;
    mounted = true;
    try {
      unsubscribe = subscribeReadiness?.(receiveSdkState) || null;
    } catch (error) {
      console.warn("[initiative-bootstrap] readiness subscription:", error?.message || error);
      unsubscribe = null;
    }
    mountPromise = Promise.resolve()
      .then(() => readInitialReadiness?.())
      .catch(() => false)
      .then((initialReady) => settleInitialRead(initialReady));
    return mountPromise;
  }

  return Object.freeze({
    mount,
    waitUntilReady: () => mount().then(() => {
      if (ready || disposed) return snapshot();
      return new Promise((resolve) => readyWaiters.add(resolve));
    }),
    isCurrent: (candidate) => !disposed && candidate?.generation === generation && ready,
    getSnapshot: snapshot,
    dispose() {
      if (disposed) return snapshot();
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
      mounted = false;
      ready = false;
      phase = "disposed";
      reason = "initiative-bootstrap-dispose";
      generation += 1;
      settleReadyWaiters();
      return snapshot();
    },
    get mounted() { return mounted; },
  });
}
