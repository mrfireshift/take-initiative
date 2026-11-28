import test from "node:test";
import assert from "node:assert/strict";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import {
  ACTOR_ARCHIVE_KIND_ACTOR,
  ACTOR_ARCHIVE_KIND_CARD_KEY,
  actorArchiveKey,
  actorArchiveSection,
  emptyActorArchiveRecord,
  normalizeActorArchiveRecord,
  pendingActorArchiveSections,
  withAcknowledgedActorArchiveSection,
  withLocalActorArchiveSection,
  withServerActorArchiveSection,
} from "../src/actorArchiveCore.js";
import {
  ACTOR_ARCHIVE_DB_NAME,
  ACTOR_ARCHIVE_FLAG_KEY,
  actorArchiveEnabled,
  createActorArchiveStore,
} from "../src/actorArchiveStore.js";

// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A0: the record with its sections and revisions, and the
// working copy in IndexedDB. Nothing uses them yet.
const ROOM = "room-1";
const HERO = "actor_0123456789abcdef0123456789abcdef";
const hero = () => emptyActorArchiveRecord({ roomId: ROOM, kind: ACTOR_ARCHIVE_KIND_ACTOR, id: HERO, name: "Aelar" });
const clock = (start) => { let time = start; return () => time++; };

test("A0 nucleo: la chiave separa stanza, tipo e id, e rifiuta ciò che manca", () => {
  assert.equal(actorArchiveKey(ROOM, "actor", HERO), `room-1|actor|${HERO}`);
  assert.notEqual(actorArchiveKey("a|b", "actor", "c"), actorArchiveKey("a", "actor", "b|c"), "the separator is encoded");
  assert.equal(actorArchiveKey("", "actor", HERO), "");
  assert.equal(actorArchiveKey(ROOM, "actor", ""), "");
  assert.equal(actorArchiveKey(ROOM, "pet", HERO), "", "an unknown kind");
  assert.equal(emptyActorArchiveRecord({ roomId: ROOM, kind: "pet", id: HERO }), null);
  assert.equal(normalizeActorArchiveRecord({ roomId: ROOM }), null);
});

test("A0 nucleo: una scrittura tocca solo la sua sezione e la mette in coda", () => {
  const now = clock(1000);
  const card = withLocalActorArchiveSection(hero(), "card", { armorClass: 18 }, { now });
  assert.equal(card.changed, true);
  assert.deepEqual(card.record.sections.card, { rev: 0, at: 1000, value: { armorClass: 18 }, dirty: true });
  const vitals = withLocalActorArchiveSection(card.record, "vitals", { hp: 12, hpMax: 27 }, { now });
  assert.deepEqual(vitals.record.sections.card, card.record.sections.card, "the card is left as it was");
  assert.equal(vitals.record.touchedAt, 1001);
  assert.deepEqual(pendingActorArchiveSections(vitals.record).map((entry) => [entry.section, entry.baseRev]), [["card", 0], ["vitals", 0]]);

  // The same value, whatever the order of its keys, writes nothing.
  const same = withLocalActorArchiveSection(vitals.record, "vitals", { hpMax: 27, hp: 12 }, { now });
  assert.equal(same.changed, false);
  assert.equal(same.record.sections.vitals.at, 1001);
  // An unknown section, or one a card by key does not have, writes nothing.
  assert.equal(withLocalActorArchiveSection(vitals.record, "notes", {}, { now }).changed, false);
  const statblock = emptyActorArchiveRecord({ roomId: ROOM, kind: ACTOR_ARCHIVE_KIND_CARD_KEY, id: "goblin" });
  assert.equal(withLocalActorArchiveSection(statblock, "vitals", { hp: 7, hpMax: 7 }, { now }).changed, false);
  assert.equal(withLocalActorArchiveSection(statblock, "card", { monsterProfile: {} }, { now }).changed, true);
  // The stored value is a copy: changing the caller's object afterwards does not reach the record.
  const value = { armorClass: 15 };
  const written = withLocalActorArchiveSection(hero(), "card", value, { now });
  value.armorClass = 1;
  assert.equal(written.record.sections.card.value.armorClass, 15);
});

test("A0 nucleo: il server accetta, e solo allora la sezione esce dalla coda", () => {
  const now = clock(1000);
  let record = withLocalActorArchiveSection(hero(), "card", { armorClass: 18 }, { now }).record;
  const [sent] = pendingActorArchiveSections(record);
  // A newer local write while the first one is on its way.
  record = withLocalActorArchiveSection(record, "card", { armorClass: 19 }, { now }).record;
  record = withAcknowledgedActorArchiveSection(record, "card", { rev: 1, at: sent.at });
  assert.deepEqual(record.sections.card, { rev: 1, at: 1001, value: { armorClass: 19 }, dirty: true }, "still in the outbox, on the accepted revision");
  assert.deepEqual(pendingActorArchiveSections(record).map((entry) => entry.baseRev), [1]);
  record = withAcknowledgedActorArchiveSection(record, "card", { rev: 2, at: 1001 });
  assert.deepEqual(record.sections.card, { rev: 2, at: 1001, value: { armorClass: 19 } });
  assert.deepEqual(pendingActorArchiveSections(record), []);
});

test("A0 nucleo, E4: una revisione più nuova del server vale, anche su una scrittura in coda", () => {
  const now = clock(1000);
  let record = withLocalActorArchiveSection(hero(), "card", { armorClass: 18 }, { now }).record;
  record = withAcknowledgedActorArchiveSection(record, "card", { rev: 3, at: 1000 });

  // The same revision or an older one: this copy already has it.
  for (const rev of [3, 2]) {
    const stale = withServerActorArchiveSection(record, "card", { rev, at: 5, value: { armorClass: 1 } });
    assert.deepEqual([stale.applied, stale.conflict], [false, false]);
    assert.equal(stale.record.sections.card.value.armorClass, 18);
  }
  // A newer one, nothing pending here: applied, no conflict.
  const newer = withServerActorArchiveSection(record, "card", { rev: 4, at: 2000, value: { armorClass: 20 } });
  assert.deepEqual([newer.applied, newer.conflict], [true, false]);
  assert.deepEqual(newer.record.sections.card, { rev: 4, at: 2000, value: { armorClass: 20 } });

  // A newer one over a pending local write: the server wins and the conflict is told. The other sections stay.
  let pending = withLocalActorArchiveSection(record, "card", { armorClass: 19 }, { now }).record;
  pending = withLocalActorArchiveSection(pending, "state", { tempHp: 5 }, { now }).record;
  const conflict = withServerActorArchiveSection(pending, "card", { rev: 4, at: 2000, value: { armorClass: 20 } });
  assert.deepEqual([conflict.applied, conflict.conflict], [true, true]);
  assert.equal(conflict.record.sections.card.value.armorClass, 20);
  assert.deepEqual(pendingActorArchiveSections(conflict.record).map((entry) => entry.section), ["state"]);
  // The same value from the other computer is no conflict.
  const agreed = withServerActorArchiveSection(pending, "card", { rev: 4, at: 2000, value: { armorClass: 19 } });
  assert.deepEqual([agreed.applied, agreed.conflict], [true, false]);
  // A section this copy never had.
  const fresh = withServerActorArchiveSection(hero(), "vitals", { rev: 1, at: 10, value: { hp: 3, hpMax: 9 } });
  assert.deepEqual([fresh.applied, fresh.conflict], [true, false]);
  assert.deepEqual(actorArchiveSection(fresh.record, "vitals"), { rev: 1, at: 10, value: { hp: 3, hpMax: 9 } });
  // A null value is a section emptied on purpose, kept as such.
  assert.equal(withLocalActorArchiveSection(hero(), "state", null, { now }).record.sections.state.value, null);
});

test("A0 archivio: scrive una sezione, la rilegge e tiene separate le stanze", async () => {
  const indexedDB = createVersionedIndexedDB();
  const store = createActorArchiveStore({ indexedDB });
  const now = clock(1000);

  assert.equal(await store.get(ROOM, "actor", HERO), null);
  const first = await store.writeSection(ROOM, "actor", HERO, "card", { armorClass: 18 }, { name: "Aelar", now });
  assert.equal(first.changed, true);
  assert.equal(first.record.name, "Aelar");
  await store.writeSection(ROOM, "actor", HERO, "vitals", { hp: 12, hpMax: 27 }, { now });
  await store.writeSection(ROOM, "card-key", "goblin", "card", { monsterProfile: { source: "manual" } }, { name: "Goblin", now });
  await store.writeSection("room-2", "actor", HERO, "card", { armorClass: 11 }, { now });

  const record = await store.get(ROOM, "actor", HERO);
  assert.equal(record.sections.card.value.armorClass, 18);
  assert.deepEqual(record.sections.vitals.value, { hp: 12, hpMax: 27 });
  assert.deepEqual((await store.list(ROOM)).map((entry) => [entry.kind, entry.name]).sort(), [["actor", "Aelar"], ["card-key", "Goblin"]]);
  assert.deepEqual((await store.list("room-2")).map((entry) => entry.sections.card.value.armorClass), [11]);
  assert.deepEqual(await store.list(""), []);

  // The same value again: nothing is written.
  const again = await store.writeSection(ROOM, "actor", HERO, "card", { armorClass: 18 }, { now });
  assert.equal(again.changed, false);
  assert.equal(again.record.sections.card.at, first.record.sections.card.at);
  // An unknown section writes nothing and stores no empty record.
  const unknown = await store.writeSection(ROOM, "actor", "actor_new", "notes", {}, { now });
  assert.deepEqual([unknown.changed, unknown.record], [false, null]);
  assert.equal(await store.get(ROOM, "actor", "actor_new"), null);

  // The outbox of the room.
  const pending = await store.listPending(ROOM);
  assert.deepEqual(pending.map((entry) => [entry.record.name, entry.pending.map((item) => item.section)]).sort(),
    [["Aelar", ["card", "vitals"]], ["Goblin", ["card"]]]);

  assert.equal(await store.remove(ROOM, "card-key", "goblin"), null);
  assert.equal((await store.list(ROOM)).length, 1);
  assert.deepEqual(indexedDB.inspect(ACTOR_ARCHIVE_DB_NAME).stores.records.indexes, ["roomId"]);
});

test("A0 archivio: le scritture di una pagina sullo stesso attore non si cancellano, e un errore non scrive niente", async () => {
  const store = createActorArchiveStore({ indexedDB: createVersionedIndexedDB() });
  const now = clock(1000);
  // Three writes started together on three sections of the same record.
  await Promise.all([
    store.writeSection(ROOM, "actor", HERO, "card", { armorClass: 18 }, { now }),
    store.writeSection(ROOM, "actor", HERO, "vitals", { hp: 12, hpMax: 27 }, { now }),
    store.writeSection(ROOM, "actor", HERO, "state", { tempHp: 5 }, { now }),
  ]);
  const record = await store.get(ROOM, "actor", HERO);
  assert.deepEqual(Object.keys(record.sections).sort(), ["card", "state", "vitals"]);

  await assert.rejects(() => store.update(ROOM, "actor", HERO, () => { throw new Error("updater-failed"); }), /updater-failed/);
  await assert.rejects(() => store.update(ROOM, "actor", HERO, (current) => ({ ...current, id: "another" })), /actor-archive-invalid-record/);
  await assert.rejects(() => store.update(ROOM, "pet", HERO, (current) => current), /actor-archive-invalid-key/);
  assert.deepEqual(await store.get(ROOM, "actor", HERO), record, "the record is as it was");
  // The queue goes on after a failure.
  assert.equal((await store.writeSection(ROOM, "actor", HERO, "state", { tempHp: 0 }, { now })).changed, true);
});

test("A0 archivio: senza IndexedDB fallisce con un errore chiaro, e l'interruttore parte spento", async () => {
  const store = createActorArchiveStore({ indexedDB: null });
  await assert.rejects(() => store.get(ROOM, "actor", HERO), /actor-archive-unavailable/);
  await assert.rejects(() => store.writeSection(ROOM, "actor", HERO, "card", {}), /actor-archive-unavailable/);

  const previous = globalThis.localStorage;
  const values = new Map();
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => values.get(key) ?? null } });
    assert.equal(actorArchiveEnabled(), false, "off until proved in a room (decision E9)");
    values.set(ACTOR_ARCHIVE_FLAG_KEY, "1");
    assert.equal(actorArchiveEnabled(), true);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(actorArchiveEnabled(), false, "site storage blocked");
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous, writable: true });
  }
});
