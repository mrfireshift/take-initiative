// The character's spellbook, stored in the Actor Profile (initiativeCard.spellbook).
// Pure data: no SDK and no spell catalog, so initiativeCards.js stays light for every page that reads a card.
// spellIds lists the spells the character knows or has prepared; pinnedIds, a subset of them, are the
// favourites shown at the top of the 🪄 menu of the tracker card. Spells from feats, species or items stay quick actions.

export const SPELLBOOK_FIELD = "spellbook";
export const MAX_SPELLBOOK_SPELLS = 64;
export const MAX_SPELLBOOK_PINNED = 12;

// A spellbook spell launched from the card or the 🪄 menu runs as a spell quick action with this id.
const SPELLBOOK_QUICK_ACTION_PREFIX = "book:";

function spellIdValue(value) {
  return String(value ?? "").trim().slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, "");
}

function uniqueSpellIds(values, limit) {
  const ids = [];
  for (const value of Array.isArray(values) ? values : []) {
    const id = spellIdValue(value);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function sanitizeSpellbook(value) {
  const source = value && typeof value === "object" ? value : {};
  const spellIds = uniqueSpellIds(source.spellIds, MAX_SPELLBOOK_SPELLS);
  const known = new Set(spellIds);
  const pinnedIds = uniqueSpellIds(source.pinnedIds, MAX_SPELLBOOK_SPELLS)
    .filter((id) => known.has(id))
    .slice(0, MAX_SPELLBOOK_PINNED);
  return { spellIds, pinnedIds };
}

export function hasSpellbook(value) {
  return sanitizeSpellbook(value).spellIds.length > 0;
}

export function spellbookQuickActionId(spellId) {
  const id = spellIdValue(spellId);
  return id ? `${SPELLBOOK_QUICK_ACTION_PREFIX}${id}` : "";
}

export function isSpellbookQuickAction(action) {
  return String(action?.id || "").startsWith(SPELLBOOK_QUICK_ACTION_PREFIX);
}
