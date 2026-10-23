import { createLocalOptionsStore } from "./options/localOptionsStore.js";

// The console's switch for the turn auto-open: the GM's local option (this browser), read and written without the
// room or scene stores. The background's controller and the options panel see a change through the storage event.
export function createPcAttackAutoOpenOption(store = createLocalOptionsStore()) {
  const enabled = (options) => options?.windows?.pcAttackAutoOpen === true;
  return {
    async subscribe(listener) {
      listener(enabled(await store.start()));
      return store.subscribe((options) => listener(enabled(options)));
    },
    set: (value) => store.update(() => ({ windows: { pcAttackAutoOpen: value === true } })),
    stop: () => store.stop(),
  };
}
