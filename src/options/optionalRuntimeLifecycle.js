function asAsync(callback) {
  return typeof callback === "function" ? callback : async () => {};
}

export function createOptionalRuntimeLifecycle({
  name = "optional-runtime",
  mount,
  unmount,
  cleanupOwnedOutputs,
  reconcileFull,
} = {}) {
  const mountRuntime = asAsync(mount);
  const unmountRuntime = asAsync(unmount);
  const cleanupRuntime = asAsync(cleanupOwnedOutputs);
  const reconcileRuntime = asAsync(reconcileFull);
  let enabled = false;
  let mounted = false;
  let revision = 0;
  let transitionQueue = Promise.resolve();

  function state() {
    return { name, enabled, mounted, revision };
  }

  function enqueue(operation) {
    const run = () => operation();
    transitionQueue = transitionQueue.then(run, run);
    return transitionQueue;
  }

  function setEnabled(nextEnabled, { reconcile = true, reason = "option" } = {}) {
    const requested = nextEnabled === true;
    return enqueue(async () => {
      const changed = enabled !== requested;
      enabled = requested;
      revision += 1;
      const context = { ...state(), changed, reason };
      if (requested) {
        if (!mounted) {
          await mountRuntime(context);
          mounted = true;
        }
        if (reconcile) await reconcileRuntime({ ...state(), changed, reason });
      } else {
        if (mounted) await unmountRuntime(context);
        mounted = false;
        await cleanupRuntime({ ...state(), changed, reason });
      }
      return state();
    });
  }

  function reconcile() {
    return enqueue(async () => {
      if (!enabled || !mounted) return { ...state(), skipped: true };
      await reconcileRuntime({ ...state(), changed: false, reason: "manual-reconcile" });
      return state();
    });
  }

  function stop() {
    return setEnabled(false, {
      reconcile: false,
      reason: "stop",
    });
  }

  return {
    name,
    setEnabled,
    reconcileFull: reconcile,
    stop,
    idle: () => transitionQueue,
    getState: state,
  };
}

export function bindOptionalRuntimeOption({
  service,
  selector,
  lifecycle,
  reconcileInitial = true,
  onError = (error) => console.warn(`[options:${lifecycle?.name || "runtime"}]`, error),
} = {}) {
  if (!service?.get || !service?.subscribe) {
    throw new TypeError("optional runtime binding requires the options service");
  }
  if (typeof selector !== "function" || !lifecycle?.setEnabled) {
    throw new TypeError("optional runtime binding requires selector and lifecycle");
  }
  const apply = (enabled, reason) => lifecycle.setEnabled(enabled, {
    reconcile: reason !== "initial" || reconcileInitial,
    reason,
  }).catch(onError);
  const ready = apply(service.get(selector), "initial");
  const unsubscribe = service.subscribe(selector, (enabled, event) => {
    void apply(enabled, event?.reason || "subscription");
  }, { emitCurrent: false });
  return {
    ready,
    unsubscribe,
    stop: async ({ cleanup = true } = {}) => {
      unsubscribe();
      if (cleanup) await lifecycle.stop();
    },
  };
}
