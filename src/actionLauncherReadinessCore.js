export function createActionLauncherReadinessCoordinator({
  isReady,
  runToggle,
} = {}) {
  if (typeof isReady !== "function") throw new TypeError("isReady must be a function");
  if (typeof runToggle !== "function") throw new TypeError("runToggle must be a function");

  let pendingOpen = false;
  let running = false;
  let disposed = false;

  async function flush() {
    if (disposed || !pendingOpen || running) return false;
    let ready = false;
    try {
      ready = isReady() === true;
    } catch {
      ready = false;
    }
    if (!ready) return false;

    running = true;
    try {
      const result = await runToggle();
      if (result !== false) pendingOpen = false;
      return result !== false;
    } finally {
      running = false;
    }
  }

  function onActionOpenChange(open) {
    if (disposed) return Promise.resolve(false);
    pendingOpen = open === true;
    return pendingOpen ? flush() : Promise.resolve(false);
  }

  function onSceneState(state) {
    return state?.ready === true ? flush() : Promise.resolve(false);
  }

  function setInitialOpen(open) {
    if (disposed) return Promise.resolve(false);
    pendingOpen = open === true;
    return pendingOpen ? flush() : Promise.resolve(false);
  }

  function dispose() {
    disposed = true;
    pendingOpen = false;
  }

  return Object.freeze({
    flush,
    onActionOpenChange,
    onSceneState,
    setInitialOpen,
    dispose,
    get pendingOpen() { return pendingOpen; },
  });
}
