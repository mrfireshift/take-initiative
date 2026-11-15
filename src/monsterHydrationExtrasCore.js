// Lot SB3b of docs/STUDIO_GIOCO_ONLINE.md (decisions G19–G23): a monster's token that got its card from the registry
// when it joined the initiative gets what the GM chose at the import too, as the token of the sheet got it at Salva:
// its hit points, its token's size, Legendary. Pure: monsterHydrationExtras.js writes.
// - Hit points: planMonsterHitPointsImport for the token alone, never «Sostituisci»: a character, a shared pool and a
//   token with hit points are left alone. One "hp:set" for the tokens hydrated together (G20).
// - Size: only a token still one square across, never over a size the GM gave (G21).
// - Legendary: never over a boss mode, as at Salva (G22).
// A card without the import's choices (one imported before SB3) brings nothing (G23).
import { ID } from "./constants.js";
import { MONSTER_PROFILE_FIELD, sanitizeMonsterProfile } from "./monsterProfileCore.js";
import { planMonsterHitPointsImport } from "./monsterHitPointsImportCore.js";
import { MONSTER_TOKEN_SIZES, tokenCells } from "./tokenSizeCore.js";
import { hasBossMode } from "./monsterLegendaryCore.js";

const META_KEY = `${ID}/meta`;

const displayName = (item) => String(item?.name || item?.id || "").replace(/^(\(\d+\)\s*)+/, "").trim();

// The History's label of the hit points: "Hobgoblin: PF dallo statblock (11) · 3 token" when one monster, else the count.
export function hydratedMonsterHitPointsLabel(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const names = [...new Set(list.map((entry) => entry.name))];
  const values = [...new Set(list.map((entry) => entry.value))];
  const count = list.length > 1 ? ` · ${list.length} token` : "";
  return names.length === 1 && values.length === 1
    ? `${names[0]}: PF dallo statblock (${values[0]})${count}`
    : `PF dallo statblock${count}`;
}

/**
 * items: the scene's items read after the hydration; hydratedIds: the tokens that just got their card. Returns
 * { hitPoints: { updates, targetIds, label }, sizes: [{ id, cells }], legendary: [{ id, legendary }] }.
 */
export function planHydratedMonsterExtras({ items = [], hydratedIds = [] } = {}) {
  const list = Array.isArray(items) ? items : [];
  const updates = [];
  const entries = [];
  const sizes = [];
  const legendary = [];
  for (const id of new Set((Array.isArray(hydratedIds) ? hydratedIds : []).map(String))) {
    const item = list.find((candidate) => candidate?.id === id);
    const meta = item?.metadata?.[META_KEY] || {};
    if (!item || String(meta.attitude || "").trim().toLowerCase() === "pc") continue;
    const profile = sanitizeMonsterProfile(meta.initiativeCard?.[MONSTER_PROFILE_FIELD]);
    if (!profile) continue;
    if (profile.hitPoints) {
      try {
        const plan = planMonsterHitPointsImport({ items: list, sourceId: id, hp: profile.hitPoints.value });
        for (const update of plan.updates) {
          updates.push(update);
          entries.push({ name: displayName(item), value: profile.hitPoints.value });
        }
      } catch {
        // Not a creature any more (gone, moved to another layer): nothing to set.
      }
    }
    const cells = MONSTER_TOKEN_SIZES[profile.tokenSize]?.cells;
    if (cells && cells !== 1 && tokenCells(item) === 1) sizes.push({ id, cells });
    if (profile.legendary && !hasBossMode(item)) legendary.push({ id, legendary: profile.legendary });
  }
  return {
    hitPoints: { updates, targetIds: updates.map((update) => update.itemId), label: hydratedMonsterHitPointsLabel(entries) },
    sizes,
    legendary,
  };
}
