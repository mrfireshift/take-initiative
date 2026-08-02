// Runtime-local scene boundary shared by tracker modules.  An epoch is
// invalidated as soon as Owlbear reports the current scene unavailable; work
// captured before that point must not be applied when the next scene is ready.
export function createSceneEpochController({ initialEpoch = 0, initialReady = true } = {}) {
  let epoch = Math.max(0, Math.floor(Number(initialEpoch) || 0));
  let ready = initialReady !== false;
  const listeners = new Set();

  function event(phase, reason) {
    return {
      phase,
      reason,
      epoch,
      ready,
    };
  }

  function notify(phase, reason) {
    const next = event(phase, reason);
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (error) {
        console.warn("[scene-epoch] listener:", error?.message || error);
      }
    }
    return next;
  }

  return {
    current() {
      return epoch;
    },
    isReady() {
      return ready;
    },
    isCurrent(candidateEpoch) {
      return ready && Number(candidateEpoch) === epoch;
    },
    invalidate(reason = "scene-unload") {
      epoch += 1;
      ready = false;
      return notify("unload", reason);
    },
    markReady(reason = "scene-ready") {
      if (ready) return event("ready", reason);
      ready = true;
      return notify("ready", reason);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("scene epoch listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const runtime = createSceneEpochController();

export function currentSceneEpoch() {
  return runtime.current();
}

export function isCurrentSceneEpoch(epoch) {
  return runtime.isCurrent(epoch);
}

export function invalidateSceneEpoch(reason) {
  return runtime.invalidate(reason);
}

export function markSceneEpochReady(reason) {
  return runtime.markReady(reason);
}

export function subscribeSceneEpoch(listener) {
  return runtime.subscribe(listener);
}

export async function runSceneEpochSteps({
  sceneEpoch,
  isCurrent,
  steps = [],
} = {}) {
  if (typeof isCurrent !== "function") {
    throw new TypeError("scene-epoch-steps-require-isCurrent");
  }
  for (const step of Array.isArray(steps) ? steps : []) {
    if (!isCurrent(sceneEpoch)) return false;
    if (typeof step !== "function") continue;
    await step(sceneEpoch);
    if (!isCurrent(sceneEpoch)) return false;
  }
  return isCurrent(sceneEpoch);
}
