import { createFiveToolsArchiveStore } from "./fiveToolsArchiveStore.js";
import { fiveToolsCollection, fiveToolsMonsterToStatblock } from "./fiveToolsMonsterCore.js";
import { monsterStatblockTextRecord, monsterStatblockTextView } from "./monsterStatblockTextCore.js";
import { createMonsterStatblockTextStore } from "./monsterStatblockTextStore.js";

// A monster's full stat block as the sheet and the console read it (fase 4, lotti 4b e 5): the record kept at its import,
// else, for a 5eTools monster, the monster in the archive's books kept in this browser. { header, sections } or null when
// this browser has neither.
// Read once per reference and revision (the card's monster profile): the console reloads on every change of the tokens,
// and none of those reads the browser's memory again. The import keeps the record before it writes the card, so the
// card's new revision finds it, in this page and in a console open in another popover.
export function createMonsterStatblockTextLoader({ store = createMonsterStatblockTextStore(), archive = () => createFiveToolsArchiveStore() } = {}) {
  const views = new Map();
  const archiveViews = new Map();
  const cacheKey = (ref, revision) => `${String(ref).toLowerCase()}::${revision}`;
  async function read(ref, fromArchive) {
    const view = monsterStatblockTextView(await store.get(ref));
    if (view || !fromArchive) return view;
    // Reading every kept book is the slow part: once per reference.
    if (archiveViews.has(ref)) return archiveViews.get(ref);
    let fromBooks = null;
    try {
      const { pool } = fiveToolsCollection(await archive().allData());
      const wanted = String(ref).toLowerCase();
      const monster = pool.find((entry) => `${entry?.name}|${entry?.source}`.toLowerCase() === wanted);
      // A card can only point at a 2024 monster the GM imported with the 2024 stat blocks on.
      const converted = monster ? fiveToolsMonsterToStatblock(monster, { pool, allow2024: true }) : null;
      if (converted?.monster) fromBooks = monsterStatblockTextView(monsterStatblockTextRecord({ ref, name: monster.name, fiveTools: converted.monster }));
    } catch {}
    archiveViews.set(ref, fromBooks);
    return fromBooks;
  }
  return {
    view(ref, { fromArchive = false, revision = "" } = {}) {
      const key = cacheKey(ref, revision);
      if (!views.has(key)) {
        const pending = read(ref, fromArchive).catch(() => null);
        views.set(key, pending);
      }
      return views.get(key);
    },
    // Keeps a record (monsterStatblockTextRecord): { persisted, reason }; this page reads it again.
    async put(record) {
      const prefix = `${String(record?.ref || "").toLowerCase()}::`;
      for (const key of [...views.keys()]) if (key.startsWith(prefix)) views.delete(key);
      return store.put(record);
    },
  };
}
