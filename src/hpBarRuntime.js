import {
  mountHPBars, unmountHPBars, cleanupOwnedHPWidgets, reconcileAllHPBars, setHPBarPlayerPolicy,
} from "./hpbar-items.js";
import { selectMapHpBarsEnabled, selectTrackerProjectionPolicy } from "./options/optionsSelectors.js";
import { bindOptionalRuntimeOption, createOptionalRuntimeLifecycle } from "./options/optionalRuntimeLifecycle.js";

// The background owns canonical scene observation even while all tracker and
// modal frames are closed. The tracker keeps its immediate visual previews.
export function mountHPBarsBackgroundRuntime({ service }) {
  const lifecycle = createOptionalRuntimeLifecycle({
    name: "map-hp-bars",
    mount: () => mountHPBars({ deferInitialSync: true }),
    unmount: unmountHPBars,
    cleanupOwnedOutputs: cleanupOwnedHPWidgets,
    reconcileFull: reconcileAllHPBars,
  });
  setHPBarPlayerPolicy(service.get(selectTrackerProjectionPolicy)?.hp);
  const unsubscribePolicy = service.subscribe(selectTrackerProjectionPolicy, policy => {
    setHPBarPlayerPolicy(policy?.hp);
    void lifecycle.reconcileFull().catch(error => console.warn("[hpbar] policy:", error));
  }, { emitCurrent: false });
  const binding = bindOptionalRuntimeOption({ service, selector: selectMapHpBarsEnabled, lifecycle });
  return { ready: binding.ready, lifecycle, stop: async () => {
    unsubscribePolicy();
    await binding.stop({ cleanup: false });
    await unmountHPBars();
  } };
}
