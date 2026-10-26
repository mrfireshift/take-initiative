import { createFiveToolsArchiveStore } from "./fiveToolsArchiveStore.js";
import { fiveToolsCollection, fiveToolsMonsterToStatblock } from "./fiveToolsMonsterCore.js";
import { monsterStatblockTextRecord, monsterStatblockTextView } from "./monsterStatblockTextCore.js";
import { createMonsterStatblockTextStore } from "./monsterStatblockTextStore.js";

// A monster's full stat block as the sheet and the console read it (fase 4, lotti 4b e 5): the record kept at its import,
// else, for a 5eTools monster, the monster in the archive's books kept in this browser. Each reference is read once
// per page: { header, sections } or null when this browser has neither.
export function createMonsterStatblockTextLoader({ store = createMonsterStatblockTextStore(), archive = () => createFiveToolsArchiveStore() } = {}) {
  const views = new Map();
  const cacheKey = (ref, fromArchive) => `${fromArchive ? "archive" : "kept"}::${ref}`;
  return {
    async view(ref, { fromArchive = false } = {}) {
      const key = cacheKey(ref, fromArchive);
      if (views.has(key)) return views.get(key);
      let view = monsterStatblockTextView(await store.get(ref));
      if (!view && fromArchive) {
        try {
          const { pool } = fiveToolsCollection(await archive().allData());
          const wanted = String(ref).toLowerCase();
          const monster = pool.find((entry) => `${entry?.name}|${entry?.source}`.toLowerCase() === wanted);
          const converted = monster ? fiveToolsMonsterToStatblock(monster, { pool }) : null;
          if (converted?.monster) view = monsterStatblockTextView(monsterStatblockTextRecord({ ref, name: monster.name, fiveTools: converted.monster }));
        } catch {}
      }
      views.set(key, view);
      return view;
    },
    // Keeps a record (monsterStatblockTextRecord): { persisted, reason }; the next read sees it.
    async put(record) {
      views.delete(cacheKey(record.ref, false));
      views.delete(cacheKey(record.ref, true));
      return store.put(record);
    },
  };
}
