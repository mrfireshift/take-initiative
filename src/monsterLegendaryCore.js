// A legendary monster's boss mode from its stat block (attacchi dei mostri, fase 4, lotto 5). Pure.
// The tracker's Leggendario mode lives on the token (meta.legendary, meta.legendaryResistances), as its menu writes it:
// the import turns it on after Salva, on the token and on its namesakes, only where no boss mode is set (decision D7):
// a token already Leggendario keeps its spent actions and resistances, a Paragon or an Epic boss is never changed, and
// a stat block without legendary actions never turns the mode off.
import { ID } from "./constants.js";
import { monsterNamesakes } from "./monsterHitPointsImportCore.js";

const META_KEY = `${ID}/meta`;
// The tracker's pips go from 1 to 5 (setLegendaryMax, setLegendaryResistanceMax in initiativeList.js).
export const MAX_LEGENDARY_PIPS = 5;

const pips = (value) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 1 ? Math.min(MAX_LEGENDARY_PIPS, number) : 0;
};

// What a stat block says: { actions, resistances } (0 when it has none), from the plugin's format
// ("legendary": { "actions": 3, "resistances": 3 }), or null without legendary actions.
export function monsterLegendaryOf(data) {
  const source = data?.legendary && typeof data.legendary === "object" && !Array.isArray(data.legendary) ? data.legendary : null;
  const actions = pips(source?.actions);
  return actions ? { actions, resistances: pips(source?.resistances) } : null;
}

export function hasBossMode(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  return !!(meta.legendary || meta.legendaryResistances || meta.paragon || meta.epic);
}

/**
 * The tokens to turn Leggendario: the sheet's token and its namesakes (never a character), each with no boss mode.
 * Returns { targetIds, skipped: [{ id, name, reason: "boss" | "pc" }] }.
 */
export function planMonsterLegendary({ items = [], sourceId = "", legendary = null } = {}) {
  if (!legendary?.actions) return { targetIds: [], skipped: [] };
  const source = items.find((item) => item?.id === sourceId);
  const candidates = [...(source ? [source] : []), ...monsterNamesakes(items, sourceId)];
  const targetIds = [];
  const skipped = [];
  for (const item of candidates) {
    const meta = item.metadata?.[META_KEY] || {};
    if (String(meta.attitude || "").trim().toLowerCase() === "pc") skipped.push({ id: item.id, name: item.name || item.id, reason: "pc" });
    else if (hasBossMode(item)) skipped.push({ id: item.id, name: item.name || item.id, reason: "boss" });
    else targetIds.push(item.id);
  }
  return { targetIds, skipped };
}

// The boss mode on the draft item of an updateItems call, merged into the token's metadata. Checked again on the
// draft: a token that got a boss mode in between keeps it. Returns whether it was written.
export function setMonsterLegendary(item, legendary) {
  if (!item || !legendary?.actions || hasBossMode(item)) return false;
  const metadata = item.metadata || {};
  const meta = { ...(metadata[META_KEY] || {}) };
  meta.legendary = { max: legendary.actions, current: legendary.actions };
  // No resistances in the stat block: the tracker's default (3) would give it some; 0 shows none.
  meta.legendaryResistances = { max: legendary.resistances, current: legendary.resistances };
  item.metadata = { ...metadata, [META_KEY]: meta };
  return true;
}

// One line for the sheet's status.
export function monsterLegendarySummary({ written = 0, skipped = [] } = {}) {
  const set = written ? `Leggendario attivato su ${written} token.` : "";
  const boss = skipped.filter((entry) => entry.reason === "boss");
  const kept = boss.length ? `${boss.length === 1 ? `${boss[0].name} ha già` : `${boss.length} token hanno già`} una modalità boss: invariat${boss.length === 1 ? "o" : "i"}.` : "";
  return [set, kept].filter(Boolean).join(" ");
}
