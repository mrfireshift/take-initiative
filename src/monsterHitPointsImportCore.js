// A monster's hit points from its stat block (attacchi dei mostri, lotto 5): the tokens to set and the ones left alone.
// Pure: the sheet runs the plan through the effects coordinator ("hp:set", as the tracker's HP editor does), never a
// direct metadata write. The canonical fields are meta.hp and meta.hpMax; the plan never touches anything else.
import { ID } from "./constants.js";
import { bossMetadataSnapshot, isBossActionCreature } from "./bossActionExecutionCore.js";
import { resolveSharedHpGroup } from "./sharedHpCore.js";

const META_KEY = `${ID}/meta`;
export const MAX_MONSTER_HIT_POINTS = 9999;

// The name tokens of one monster share: "(2) Goblin" and "goblin" are the same; never an empty name.
export function monsterNameKey(name) {
  return String(name || "").replace(/^(\(\d+\)\s*)+/, "").trim().toLocaleLowerCase("it");
}

export function hasCanonicalHitPoints(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  return Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax) && meta.hpMax > 0;
}

// The other creatures on the map with the token's name: the stat block can set their hit points too.
export function monsterNamesakes(items = [], sourceId = "") {
  const source = items.find((item) => item?.id === sourceId);
  const key = monsterNameKey(source?.name);
  if (!key) return [];
  return items.filter((item) => item?.id !== sourceId && isBossActionCreature(item) && monsterNameKey(item.name) === key);
}

/**
 * The hit points to write: hp = hpMax = the stat block's value, on the token and, with sameName, on its namesakes.
 * Left alone, with a reason: a token that already has hit points (unless overwrite), a character ("pc": its hit points
 * live in the tracker and in hpMemory), a token sharing its hit points with others (the pool is set from the tracker).
 * Returns { updates, skipped, targetIds }; updates carry the expected values, so a change in between refuses the write.
 */
export function planMonsterHitPointsImport({ items = [], sourceId = "", hp, overwrite = false, sameName = false } = {}) {
  const value = Number(hp);
  if (!Number.isInteger(value) || value < 1 || value > MAX_MONSTER_HIT_POINTS) throw new Error("Punti ferita non validi: un numero intero da 1 a 9999.");
  const source = items.find((item) => item?.id === sourceId);
  if (!isBossActionCreature(source)) throw new Error("Il token non è più nella scena.");
  const targets = [source, ...(sameName ? monsterNamesakes(items, sourceId) : [])];
  const updates = [];
  const skipped = [];
  for (const item of targets) {
    const meta = item.metadata?.[META_KEY] || {};
    const name = item.name || item.id;
    const shared = resolveSharedHpGroup(items, item.id, { metadataKey: META_KEY });
    if (String(meta.attitude || "").trim().toLowerCase() === "pc") skipped.push({ id: item.id, name, reason: "pc" });
    // A member of a pool, its source, or a broken link: the shared pool is never set from one creature's stat block.
    else if (String(meta.sharedHpSourceId || "").trim() || (!shared.status && shared.memberIds?.length > 1)) skipped.push({ id: item.id, name, reason: "shared" });
    else if (hasCanonicalHitPoints(item) && !overwrite) skipped.push({ id: item.id, name, reason: "has-hp" });
    // «Sostituisci» is the GM's choice for the token in the sheet; a wounded namesake keeps its hit points (fase 4).
    else if (item.id !== sourceId && hasCanonicalHitPoints(item) && meta.hp < meta.hpMax) skipped.push({ id: item.id, name, reason: "wounded" });
    else if (meta.hp === value && meta.hpMax === value) skipped.push({ id: item.id, name, reason: "same" });
    else updates.push({ itemId: item.id, hp: value, hpMax: value,
      expectedHP: bossMetadataSnapshot(meta, "hp"), expectedHPMax: bossMetadataSnapshot(meta, "hpMax") });
  }
  return { updates, skipped, targetIds: updates.map((update) => update.itemId) };
}

const SKIP_TEXT = Object.freeze({
  "has-hp": ["ha già i suoi PF", "hanno già i loro PF", " (spunta «Sostituisci» per riscriverli)"],
  pc: ["è un personaggio", "sono personaggi", ": i PF dei personaggi si impostano dal tracker"],
  shared: ["condivide i PF con altri token", "condividono i PF con altri token", ": la riserva si imposta dal tracker"],
  wounded: ["è ferito", "sono feriti", ": i PF di un mostro ferito non si toccano"],
});

// One line for the sheet's status: what was set, then what was left alone, one clause per reason ("Goblin ha già i suoi
// PF", "3 token hanno già i loro PF"). A token that already had these hit points says nothing.
export function monsterHitPointsSummary({ updates = [], skipped = [] } = {}, hp) {
  const set = updates.length ? `PF ${hp} impostati su ${updates.length} token.` : "PF non impostati.";
  const clauses = Object.entries(SKIP_TEXT).map(([reason, [one, many, why]]) => {
    const entries = skipped.filter((entry) => entry.reason === reason);
    if (!entries.length) return "";
    return `${entries.length === 1 ? `${entries[0].name} ${one}` : `${entries.length} token ${many}`}${why}`;
  }).filter(Boolean);
  return clauses.length ? `${set} ${clauses.join("; ")}.` : set;
}
