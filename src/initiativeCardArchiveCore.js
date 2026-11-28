// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A1: between the card registry and the archive's records.
// The registry is what the rest of the plugin reads: a map from a key (`asset:<image>` or a name) to an entry
// { actorProfileId?, name, profile, updatedAt, deleted? }. In the archive:
// - an entry with an identity goes into its actor's record, whose card is { entry, keys }: the entry last written and
//   the registry keys it answers to;
// - an entry without one (a monster's stat block, a card never linked) goes into a record of its own, by its key.
// Pure: reading and writing the store is initiativeCards.js.
import { ACTOR_ARCHIVE_KIND_ACTOR, ACTOR_ARCHIVE_KIND_CARD_KEY } from "./actorArchiveCore.js";
import { actorProfileIdFromRegistryEntry } from "./actorIdentityCore.js";

// The keys an actor's record remembers, newest first: its images and names over time.
const MAX_ACTOR_KEYS = 12;

function isEntry(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function updatedAtOf(entry) {
  return Math.max(0, Number(entry?.updatedAt) || 0);
}

function cardValue(record) {
  const value = record?.sections?.card?.value;
  return isEntry(value) && isEntry(value.entry) ? value : null;
}

// The registry the archive's records of one room give. The keys of an actor share its entry (the same object, as the
// registry's writers leave them). Two records answering to the same key: the newer entry has it, as when two
// registries are merged.
export function initiativeCardRegistryFromArchive(records) {
  const registry = {};
  const put = (key, entry) => {
    if (!key || (registry[key] && updatedAtOf(entry) < updatedAtOf(registry[key]))) return;
    registry[key] = entry;
  };
  for (const record of Array.isArray(records) ? records : []) {
    const value = cardValue(record);
    if (!value) continue;
    if (record.kind === ACTOR_ARCHIVE_KIND_ACTOR) {
      for (const key of Array.isArray(value.keys) ? value.keys : []) put(String(key || ""), value.entry);
    } else if (record.kind === ACTOR_ARCHIVE_KIND_CARD_KEY) {
      put(String(record.id || ""), value.entry);
    }
  }
  return registry;
}

/**
 * What a registry write asks of the archive. `previous` is the merged registry the write started from and `next` what it
 * left; `archiveRegistry` and `roomRegistry` are the archive's and the Room's parts of `previous`.
 * Written: the entries the write replaced, and the ones the Room holds that the archive does not have yet (so the
 * archive of a room holds the cards used in that room, never the other campaigns' of the old local copy).
 * Returns [{ kind, id, name, update }], where update(currentCardValue) gives the record's next card value, or null to
 * delete the record. The entry written is the write's own, as the old local copy took it: no comparison of dates here.
 */
export function initiativeCardArchiveWrites(previous, next, { archiveRegistry = {}, roomRegistry = {} } = {}) {
  const before = isEntry(previous) ? previous : {};
  const after = isEntry(next) ? next : {};
  const archive = isEntry(archiveRegistry) ? archiveRegistry : {};
  const room = isEntry(roomRegistry) ? roomRegistry : {};

  const actorWrites = new Map();
  const keyWrites = new Map();
  for (const [key, entry] of Object.entries(after)) {
    if (!key || !isEntry(entry)) continue;
    const replaced = entry !== before[key];
    const missing = Object.hasOwn(room, key) && !Object.hasOwn(archive, key);
    if (!replaced && !missing) continue;
    const actorProfileId = actorProfileIdFromRegistryEntry(entry);
    if (!actorProfileId) {
      keyWrites.set(key, entry);
      continue;
    }
    const write = actorWrites.get(actorProfileId) || { entry, keys: [] };
    if (updatedAtOf(entry) > updatedAtOf(write.entry)) write.entry = entry;
    write.keys.push(key);
    actorWrites.set(actorProfileId, write);
    // The key now belongs to an actor: its record by key, if there was one, goes.
    keyWrites.set(key, null);
  }
  // A key the write took out of the registry.
  const removedKeys = Object.keys(before).filter((key) => key && !Object.hasOwn(after, key));
  for (const key of removedKeys) keyWrites.set(key, null);

  // An actor's record forgets a removed key; without keys left it goes.
  const removedByActor = new Map();
  for (const key of removedKeys) {
    const actorProfileId = actorProfileIdFromRegistryEntry(before[key]);
    if (actorProfileId) removedByActor.set(actorProfileId, [...(removedByActor.get(actorProfileId) || []), key]);
  }
  const keptKeys = (current, actorProfileId) => {
    const removed = removedByActor.get(actorProfileId) || [];
    return (Array.isArray(current?.keys) ? current.keys : []).filter((key) => !removed.includes(key));
  };

  const writes = [];
  for (const [actorProfileId, write] of actorWrites) {
    writes.push({
      kind: ACTOR_ARCHIVE_KIND_ACTOR,
      id: actorProfileId,
      name: String(write.entry.name || ""),
      update: (current) => ({
        entry: write.entry,
        keys: [...new Set([...write.keys, ...keptKeys(current, actorProfileId)])].slice(0, MAX_ACTOR_KEYS),
      }),
    });
  }
  for (const actorProfileId of removedByActor.keys()) {
    if (actorWrites.has(actorProfileId)) continue;
    writes.push({
      kind: ACTOR_ARCHIVE_KIND_ACTOR,
      id: actorProfileId,
      name: undefined,
      update: (current) => {
        if (!isEntry(current)) return null;
        const kept = keptKeys(current, actorProfileId);
        return kept.length ? { ...current, keys: kept } : null;
      },
    });
  }
  for (const [key, entry] of keyWrites) {
    writes.push({
      kind: ACTOR_ARCHIVE_KIND_CARD_KEY,
      id: key,
      name: entry ? String(entry.name || "") : undefined,
      update: () => (entry ? { entry } : null),
    });
  }
  return writes;
}

// Lot A3: the rule of a card's conflict between two computers. The registry, the tokens and the Room already order
// cards by their date, so the archive does the same: the card written later stays. true: the local one is the newer.
export function initiativeCardArchivePrefersLocal(section, localValue, serverValue) {
  return section === "card" && updatedAtOf(localValue?.entry) > updatedAtOf(serverValue?.entry);
}
