// A monster's full stat block, kept for the GM to read (attacchi dei mostri, fase 4, lotto 4b). Pure. It lives only in
// the GM's browser (monsterStatblockTextStore.js), found by the reference the card already has (monster.ref,
// "Goblin|MM"): never on the token, in the scene or in the room. A 5eTools monster keeps the monster as read (the next
// lot reads its traits from it); a stat block of the plugin's format keeps the text the GM pasted ("text").
import { fiveToolsStatblockSections } from "./fiveToolsMonsterCore.js";

export const MONSTER_STATBLOCK_TEXT_VERSION = 1;
export const MAX_MONSTER_STATBLOCK_TEXT = 20000;
// A 5eTools monster is 2 KB at the median of the Monster Manual, 9 KB at most: anything far larger is not one.
export const MAX_MONSTER_STATBLOCK_RECORD = 64 * 1024;

export function monsterStatblockTextKey(ref) {
  return String(ref || "").trim().toLowerCase().slice(0, 120);
}

// The record to keep for a reference: { key, ref, name, kind: "5etools" | "text", data, savedAt }, or null.
export function monsterStatblockTextRecord({ ref = "", name = "", fiveTools = null, text = "" } = {}, now = Date.now()) {
  const key = monsterStatblockTextKey(ref);
  if (!key) return null;
  const pasted = typeof text === "string" ? text.replace(/\r\n?/g, "\n").trim().slice(0, MAX_MONSTER_STATBLOCK_TEXT) : "";
  const kind = fiveTools && typeof fiveTools === "object" ? "5etools" : pasted ? "text" : "";
  if (!kind) return null;
  const record = { version: MONSTER_STATBLOCK_TEXT_VERSION, key, ref: String(ref).trim().slice(0, 120), name: String(name || "").trim().slice(0, 80),
    kind, data: kind === "5etools" ? JSON.parse(JSON.stringify(fiveTools)) : pasted, savedAt: now };
  return JSON.stringify(record).length <= MAX_MONSTER_STATBLOCK_RECORD ? record : null;
}

export function isMonsterStatblockTextRecord(record) {
  return !!record && typeof record === "object" && record.version === MONSTER_STATBLOCK_TEXT_VERSION && typeof record.key === "string" && record.key
    && ((record.kind === "5etools" && record.data && typeof record.data === "object") || (record.kind === "text" && typeof record.data === "string"));
}

// What the Stats tab shows: { header, sections } (see fiveToolsStatblockSections); a pasted text is one section.
export function monsterStatblockTextView(record) {
  if (!isMonsterStatblockTextRecord(record)) return null;
  if (record.kind === "5etools") return fiveToolsStatblockSections(record.data);
  return { header: [], sections: [{ title: "", entries: [{ name: "", text: record.data }] }] };
}

// Only an NPC's sheet (an ally, a neutral, an enemy: never a character), only for the GM, only a monster's card with
// a reference.
export function monsterStatblockTextRef({ isGM = false, attitude = "", card = null } = {}) {
  if (!isGM || String(attitude || "").trim().toLowerCase() === "pc") return "";
  return String(card?.monster?.ref || "").trim();
}
