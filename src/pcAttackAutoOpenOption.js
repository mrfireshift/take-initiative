import { createLocalOptionsStore } from "./options/localOptionsStore.js";

// The console's switch for the turn auto-open: the GM's local option (this browser), read and written without the
// room or scene stores. The background's controller and the options panel see a change through the storage event.
// monsters: the monsters' switch (attacchi dei mostri, lotto 7), which follows the characters' one until it is touched.
export function createPcAttackAutoOpenOption(store = createLocalOptionsStore(), { monsters = false } = {}) {
  const enabled = (options) => {
    const windows = options?.windows || {};
    if (monsters && typeof windows.pcAttackAutoOpenMonsters === "boolean") return windows.pcAttackAutoOpenMonsters;
    return windows.pcAttackAutoOpen === true;
  };
  const key = monsters ? "pcAttackAutoOpenMonsters" : "pcAttackAutoOpen";
  return {
    async subscribe(listener) {
      listener(enabled(await store.start()));
      return store.subscribe((options) => listener(enabled(options)));
    },
    set: (value) => store.update(() => ({ windows: { [key]: value === true } })),
    stop: () => store.stop(),
  };
}
