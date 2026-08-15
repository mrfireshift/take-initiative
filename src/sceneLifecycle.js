import {
  createSceneEpochController,
} from "./sceneEpoch.js";

function safeReason(value, fallback) {
  const reason = String(value || "").trim();
  return reason || fallback;
}

function noop() {}

function callListener(listener, snapshot) {
  try {
    listener(snapshot);
  } catch (error) {
    console.warn("[scene-lifecycle] listener:", error?.message || error);
  }
}

/**
 * Mounts a runtime-local scene lifecycle around an OBR realm.
 *
 * The adapter deliberately owns exactly one SDK onReadyChange subscription,
 * while callers can add as many local subscribers/cleanup callbacks as they
 * need. Numeric epochs are only meaningful inside the injected realm.
 */
export function createSceneLifecycleAdapter({
  obr = null,
  epochController = null,
  onState = null,
} = {}) {
  // Keep the epoch private to this adapter by default. A popup controller and
  // a test double can coexist in one JavaScript realm without disposing one
  // invalidating the other; production iframes still each own one adapter.
  const epoch = epochController || createSceneEpochController();
  const stateListeners = new Set();
  const disposeCleanups = new Set();
  const sceneCleanups = new Set();
  let mounted = false;
  let disposed = false;
  let bootstrapped = false;
  let ready = false;
  let phase = "bootstrap";
  let reason = "not-mounted";
  let generation = 0;
  let transitionSequence = 0;
  let sdkUnsubscribe = null;
  let mountPromise = null;

  if (typeof onState === "function") stateListeners.add(onState);

  function snapshot() {
    return Object.freeze({
      epoch: Number(epoch.current?.() ?? 0),
      ready: ready && !disposed,
      phase,
      reason,
      disposed,
      mounted,
      bootstrapped,
      generation,
    });
  }

  function emit() {
    const next = snapshot();
    for (const listener of stateListeners) callListener(listener, next);
    return next;
  }

  function runCleanups(cleanups) {
    for (const cleanup of [...cleanups]) {
      try {
        const result = cleanup();
        if (result && typeof result.then === "function") {
          void result.catch((error) => {
            console.warn("[scene-lifecycle] cleanup:", error?.message || error);
          });
        }
      } catch (error) {
        console.warn("[scene-lifecycle] cleanup:", error?.message || error);
      }
    }
  }

  function transition(nextReady, nextReason, { allowDisposed = false } = {}) {
    if (disposed && !allowDisposed) return snapshot();
    const normalizedReady = nextReady === true;
    const effective = !bootstrapped || normalizedReady !== ready;
    if (!effective) return snapshot();

    transitionSequence += 1;
    bootstrapped = true;
    ready = normalizedReady;
    generation += 1;
    reason = safeReason(nextReason, normalizedReady ? "scene-ready" : "scene-unavailable");
    phase = normalizedReady ? "ready" : "unavailable";

    if (normalizedReady) {
      if (epoch.isReady?.() === false) epoch.markReady?.(reason);
    } else {
      if (epoch.isReady?.() !== false) epoch.invalidate?.(reason);
      runCleanups(sceneCleanups);
    }
    return emit();
  }

  async function readSceneReady() {
    const isReady = obr?.scene?.isReady;
    if (typeof isReady !== "function") {
      // Older SDK test doubles and legacy embeds do not expose isReady. Keep
      // their historical behavior while using the real SDK bootstrap when it
      // is available.
      return epoch.isReady?.() !== false;
    }
    try {
      return (await isReady.call(obr.scene)) === true;
    } catch {
      return false;
    }
  }

  function attachSdkListener() {
    if (sdkUnsubscribe || typeof obr?.scene?.onReadyChange !== "function") return;
    const unsubscribe = obr.scene.onReadyChange((nextReady) => {
      transition(nextReady === true, nextReady === true ? "scene-ready" : "scene-unload");
    });
    sdkUnsubscribe = typeof unsubscribe === "function" ? unsubscribe : noop;
  }

  async function mount() {
    if (mountPromise) return mountPromise;
    mounted = true;
    attachSdkListener();
    const sequenceAtBootstrap = transitionSequence;
    mountPromise = readSceneReady().then((initialReady) => {
      if (disposed) return snapshot();
      // An SDK event received while isReady() was pending is newer than the
      // bootstrap read and must remain authoritative.
      if (transitionSequence === sequenceAtBootstrap) {
        transition(initialReady, initialReady ? "scene-bootstrap-ready" : "scene-bootstrap-unavailable");
      }
      return snapshot();
    });
    return mountPromise;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("scene lifecycle listener must be a function");
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }

  function registerCleanup(cleanup, { onSceneChange = false } = {}) {
    if (typeof cleanup !== "function") throw new TypeError("scene lifecycle cleanup must be a function");
    const target = onSceneChange ? sceneCleanups : disposeCleanups;
    target.add(cleanup);
    return () => target.delete(cleanup);
  }

  function capture({ operationId = "", commandId = "", sceneIdentity = null } = {}) {
    const current = snapshot();
    return Object.freeze({
      epoch: current.epoch,
      generation: current.generation,
      sceneIdentity: sceneIdentity || null,
      operationId: String(operationId || ""),
      commandId: String(commandId || ""),
      disposed: current.disposed,
    });
  }

  function isCurrent(context) {
    if (!context || disposed || !bootstrapped || !ready) return false;
    if (context.disposed === true) return false;
    if (Number(context.generation) !== generation) return false;
    return epoch.isCurrent?.(context.epoch) === true;
  }

  function dispose() {
    if (disposed) return snapshot();
    disposed = true;
    mounted = false;
    sdkUnsubscribe?.();
    sdkUnsubscribe = null;
    runCleanups(sceneCleanups);
    runCleanups(disposeCleanups);
    if (epoch.isReady?.() !== false) epoch.invalidate?.("scene-lifecycle-dispose");
    ready = false;
    bootstrapped = true;
    phase = "disposed";
    reason = "scene-lifecycle-dispose";
    generation += 1;
    return emit();
  }

  return Object.freeze({
    mount,
    dispose,
    subscribe,
    registerCleanup,
    registerSceneCleanup: (cleanup) => registerCleanup(cleanup, { onSceneChange: true }),
    capture,
    isCurrent,
    getSnapshot: snapshot,
    isReady: () => !disposed && bootstrapped && ready,
    currentEpoch: () => snapshot().epoch,
    get disposed() { return disposed; },
  });
}

/**
 * Small operation gate used by popup writers and by tests. It distinguishes a
 * stale operation that never committed from a committed operation whose
 * post-commit work must be abandoned after a scene switch.
 */
export async function runSceneLifecycleOperation(
  lifecycle,
  operation,
  { context = null, operationId = "", commandId = "", sceneIdentity = null } = {},
) {
  const captured = context || lifecycle.capture({ operationId, commandId, sceneIdentity });
  if (!lifecycle.isCurrent(captured)) {
    return {
      status: "rejected",
      stale: true,
      committed: false,
      operationId: captured.operationId,
      commandId: captured.commandId,
      reason: "scene-stale-before-commit",
    };
  }

  let committed = false;
  const markCommitted = () => { committed = true; };
  try {
    const value = await operation({
      context: captured,
      isCurrent: () => lifecycle.isCurrent(captured),
      markCommitted,
    });
    if (!lifecycle.isCurrent(captured)) {
      return {
        status: committed ? "applied" : "rejected",
        stale: true,
        committed,
        postCommitPending: committed,
        value,
        operationId: captured.operationId,
        commandId: captured.commandId,
        reason: committed ? "scene-stale-post-commit" : "scene-stale-before-commit",
      };
    }
    return {
      status: "applied",
      stale: false,
      committed,
      value,
      operationId: captured.operationId,
      commandId: captured.commandId,
    };
  } catch (error) {
    if (!lifecycle.isCurrent(captured)) {
      return {
        status: committed ? "applied" : "rejected",
        stale: true,
        committed,
        postCommitPending: committed,
        error,
        operationId: captured.operationId,
        commandId: captured.commandId,
        reason: committed ? "scene-stale-post-commit" : "scene-stale-before-commit",
      };
    }
    throw error;
  }
}
