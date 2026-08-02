export function createSceneEpochTimer({
  isCurrent,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof isCurrent !== "function") {
    throw new TypeError("scene-epoch-timer-requires-isCurrent");
  }

  let handle = null;
  let revision = 0;

  function cancel() {
    if (handle !== null) clearTimer(handle);
    handle = null;
    revision += 1;
  }

  function schedule(sceneEpoch, delay, callback) {
    cancel();
    if (!isCurrent(sceneEpoch) || typeof callback !== "function") return false;
    const scheduledRevision = ++revision;
    handle = setTimer(() => {
      if (scheduledRevision !== revision) return;
      handle = null;
      if (!isCurrent(sceneEpoch)) return;
      void callback(sceneEpoch);
    }, delay);
    return true;
  }

  return { cancel, schedule };
}
