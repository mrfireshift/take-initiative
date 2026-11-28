// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A0: the pure half. One record per actor of a room (a room
// is a campaign), found by its actorProfileId, and one per card without an identity (a monster's stat block, a card never
// linked to an actor), found by its key in the card registry. A record has sections
// (decision E3), each with its own revision: the card, the hit points, the play state. A write to one section never
// rewrites another, and a conflict on one leaves the others alone.
//
// A section is { rev, at, value, dirty? }:
// - rev: the last revision the server gave it (0: never sent);
// - at: when this copy wrote it (milliseconds), growing at every local write;
// - value: any JSON value, null included (a section emptied on purpose);
// - dirty: true while the local value has not been accepted by the server. The dirty sections are the outbox.
// Nothing here reads or writes: the storage is actorArchiveStore.js, the server and the tokens come in later lots.

export const ACTOR_ARCHIVE_KIND_ACTOR = "actor";
export const ACTOR_ARCHIVE_KIND_CARD_KEY = "card-key";
export const ACTOR_ARCHIVE_SECTIONS = Object.freeze({
  [ACTOR_ARCHIVE_KIND_ACTOR]: Object.freeze(["card", "vitals", "state"]),
  [ACTOR_ARCHIVE_KIND_CARD_KEY]: Object.freeze(["card"]),
});
// A card-key record is found by a registry key, which may be an image address.
const MAX_ID_LENGTH = 1024;
const MAX_NAME_LENGTH = 120;

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function nonNegativeInteger(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// JSON with the object keys sorted: two values that differ only in key order are the same value.
function stableJson(value) {
  return JSON.stringify(value ?? null, (key, candidate) => (
    plainObject(candidate)
      ? Object.fromEntries(Object.keys(candidate).sort().map((name) => [name, candidate[name]]))
      : candidate
  ));
}

function jsonClone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export function actorArchiveSectionNames(kind) {
  return ACTOR_ARCHIVE_SECTIONS[kind] || [];
}

// The record's key in the store: the three parts encoded, so none of them can hold the separator. "" when one is missing
// or the kind is unknown.
export function actorArchiveKey(roomId, kind, id) {
  const parts = [text(roomId, MAX_ID_LENGTH), text(kind, 20), text(id, MAX_ID_LENGTH)];
  if (!parts[0] || !parts[2] || !Object.hasOwn(ACTOR_ARCHIVE_SECTIONS, parts[1])) return "";
  return parts.map(encodeURIComponent).join("|");
}

function normalizeSection(value) {
  if (!plainObject(value) || !Object.hasOwn(value, "value")) return null;
  const section = { rev: nonNegativeInteger(value.rev), at: nonNegativeInteger(value.at), value: jsonClone(value.value) };
  if (value.dirty === true) section.dirty = true;
  return section;
}

function touchedAtOf(sections) {
  return Object.values(sections).reduce((latest, section) => Math.max(latest, section.at), 0);
}

export function emptyActorArchiveRecord({ roomId, kind, id, name = "" } = {}) {
  const key = actorArchiveKey(roomId, kind, id);
  if (!key) return null;
  return { key, roomId: text(roomId, MAX_ID_LENGTH), kind, id: text(id, MAX_ID_LENGTH), name: text(name, MAX_NAME_LENGTH), sections: {}, touchedAt: 0 };
}

// A stored record as this module writes it; null for anything that is not one. Unknown sections are dropped.
export function normalizeActorArchiveRecord(value) {
  if (!plainObject(value)) return null;
  const record = emptyActorArchiveRecord(value);
  if (!record) return null;
  const source = plainObject(value.sections) ? value.sections : {};
  for (const name of actorArchiveSectionNames(record.kind)) {
    const section = normalizeSection(source[name]);
    if (section) record.sections[name] = section;
  }
  record.touchedAt = touchedAtOf(record.sections);
  return record;
}

export function actorArchiveSection(record, section) {
  const normalized = normalizeActorArchiveRecord(record);
  return normalized?.sections[section] ? { ...normalized.sections[section] } : null;
}

// A write of this copy: the section takes the value, a newer `at`, and goes into the outbox. The same value again
// changes nothing (changed: false), so a read-through that finds the archive aligned writes nothing. `name` renames
// the record when given (what the GM reads in a notice).
export function withLocalActorArchiveSection(record, section, value, { now = Date.now, name = undefined } = {}) {
  const current = normalizeActorArchiveRecord(record);
  if (!current || !actorArchiveSectionNames(current.kind).includes(section)) return { record: current, changed: false };
  const nextName = name === undefined ? current.name : text(name, MAX_NAME_LENGTH);
  const previous = current.sections[section];
  const sameValue = !!previous && stableJson(previous.value) === stableJson(value);
  if (sameValue && nextName === current.name) return { record: current, changed: false };
  const next = { ...current, name: nextName, sections: { ...current.sections } };
  if (!sameValue) {
    next.sections[section] = {
      rev: previous?.rev || 0,
      at: Math.max(nonNegativeInteger(now()), (previous?.at || 0) + 1),
      value: jsonClone(value),
      dirty: true,
    };
  }
  next.touchedAt = touchedAtOf(next.sections);
  return { record: next, changed: true };
}

// What the server holds for a section: { rev, at, value }. Decision E4: a newer revision of the server wins, also over
// a local write still in the outbox, which is then lost (conflict: true, for the GM's notice). The same revision or an
// older one changes nothing: this copy already has it, or has sent something newer.
export function withServerActorArchiveSection(record, section, server) {
  const current = normalizeActorArchiveRecord(record);
  const incoming = normalizeSection({ ...(plainObject(server) ? server : {}), dirty: false });
  if (!current || !incoming || !actorArchiveSectionNames(current.kind).includes(section)) {
    return { record: current, applied: false, conflict: false };
  }
  const previous = current.sections[section];
  if (previous && incoming.rev <= previous.rev) return { record: current, applied: false, conflict: false };
  const conflict = previous?.dirty === true && stableJson(previous.value) !== stableJson(incoming.value);
  const next = { ...current, sections: { ...current.sections, [section]: incoming } };
  next.touchedAt = touchedAtOf(next.sections);
  return { record: next, applied: true, conflict };
}

// The server accepted the write sent at `at` and gave it `rev`. The section leaves the outbox only if nothing was
// written here since: a newer local write keeps its place, now based on the accepted revision.
export function withAcknowledgedActorArchiveSection(record, section, { rev, at } = {}) {
  const current = normalizeActorArchiveRecord(record);
  const previous = current?.sections[section];
  if (!previous) return current;
  const accepted = { ...previous, rev: Math.max(previous.rev, nonNegativeInteger(rev)) };
  if (previous.at === nonNegativeInteger(at)) delete accepted.dirty;
  return { ...current, sections: { ...current.sections, [section]: accepted } };
}

// The local value stays and stays in the outbox, now based on the server's revision: the server holds something else
// that this copy chose not to take (a card older than the local one, lot A3), or it lost its copy.
export function withRebasedActorArchiveSection(record, section, rev) {
  const current = normalizeActorArchiveRecord(record);
  const previous = current?.sections[section];
  if (!previous) return current;
  return { ...current, sections: { ...current.sections, [section]: { ...previous, rev: nonNegativeInteger(rev), dirty: true } } };
}

// The outbox of a record: its sections not yet accepted by the server, with the revision each one started from.
export function pendingActorArchiveSections(record) {
  const current = normalizeActorArchiveRecord(record);
  if (!current) return [];
  return actorArchiveSectionNames(current.kind)
    .filter((name) => current.sections[name]?.dirty === true)
    .map((name) => ({ section: name, baseRev: current.sections[name].rev, at: current.sections[name].at, value: jsonClone(current.sections[name].value) }));
}
