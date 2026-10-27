// A module only a click needs (the Effects transport, History and Combat Log behind a notice's buttons): loaded on
// the first call instead of before the notice's first paint, and prefetched once the page is idle, so the click
// rarely waits. A failed load is retried on the next call; the caller's own error handling reports it.
export function lazyModule(load, { prefetch = true } = {}) {
  let pending = null;
  const get = () => {
    pending ||= load().catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };
  if (prefetch) whenPageIdle(() => { void get().catch(() => {}); });
  return get;
}

function whenPageIdle(run) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 2000 });
    else window.setTimeout(run, 200);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
