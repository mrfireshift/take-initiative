import test from "node:test";
import assert from "node:assert/strict";
import { initiativeCardArchiveWrites, initiativeCardRegistryFromArchive } from "../src/initiativeCardArchiveCore.js";
import { emptyActorArchiveRecord, withLocalActorArchiveSection } from "../src/actorArchiveCore.js";

// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A1: the translation between the card registry (a map from
// a key to an entry) and the archive's records (one per actor, one per key for a card without an identity).
const ROOM = "room-1";
const hero = (updatedAt, armorClass = 18) => ({ actorProfileId: "actor-hero", name: "Hero", profile: { actorProfileId: "actor-hero", armorClass }, updatedAt });
const goblin = (updatedAt) => ({ name: "Goblin", profile: { armorClass: 15, monsterProfile: { source: "manual" } }, updatedAt });

// Applies the writes to a list of records, as initiativeCards.js does through the store.
function apply(records, writes) {
  const byKey = new Map(records.map((record) => [`${record.kind}|${record.id}`, record]));
  for (const write of writes) {
    const key = `${write.kind}|${write.id}`;
    const current = byKey.get(key) || emptyActorArchiveRecord({ roomId: ROOM, kind: write.kind, id: write.id });
    const value = write.update(current.sections.card?.value ?? null);
    if (value === null) byKey.delete(key);
    else byKey.set(key, withLocalActorArchiveSection(current, "card", value, { name: write.name }).record);
  }
  return [...byKey.values()];
}

test("A1 traduttore: una voce con identità va nella voce dell'attore con le sue chiavi, una senza va per chiave", () => {
  const entry = hero(10);
  const monster = goblin(5);
  const next = { "asset:https://img.test/hero.png": entry, hero: entry, goblin: monster };
  const writes = initiativeCardArchiveWrites({}, next);
  const records = apply([], writes);
  assert.deepEqual(records.map((record) => [record.kind, record.id, record.name]).sort(), [["actor", "actor-hero", "Hero"], ["card-key", "goblin", "Goblin"]]);
  const actor = records.find((record) => record.kind === "actor");
  assert.deepEqual(actor.sections.card.value.keys, ["asset:https://img.test/hero.png", "hero"]);

  const registry = initiativeCardRegistryFromArchive(records);
  assert.deepEqual(Object.keys(registry).sort(), ["asset:https://img.test/hero.png", "goblin", "hero"]);
  assert.deepEqual(registry.hero, entry);
  assert.equal(registry.hero, registry["asset:https://img.test/hero.png"], "the keys of an actor share one entry");
  assert.deepEqual(registry.goblin, monster);
});

test("A1 traduttore: scrive solo ciò che la scrittura ha cambiato e ciò che la stanza ha e l'archivio no", () => {
  const stored = hero(10);
  const other = { name: "Dars", profile: { armorClass: 15 }, updatedAt: 4 };
  const foreign = { name: "Zorya", profile: { armorClass: 13 }, updatedAt: 5 };
  const previous = { hero: stored, dars: other, zorya: foreign };
  const written = hero(20, 19);
  const next = { ...previous, hero: written };
  // dars is in the Room and not in the archive yet; zorya comes from the old local copy of another campaign.
  const writes = initiativeCardArchiveWrites(previous, next, { archiveRegistry: {}, roomRegistry: { dars: other } });
  assert.deepEqual(writes.map((write) => `${write.kind}:${write.id}`).sort(), ["actor:actor-hero", "card-key:dars", "card-key:hero"]);
  const records = apply([], writes);
  assert.deepEqual(records.map((record) => record.id).sort(), ["actor-hero", "dars"], "the key now of an actor has no record of its own");
  assert.equal(initiativeCardRegistryFromArchive(records).hero.profile.armorClass, 19);
  assert.equal(Object.hasOwn(initiativeCardRegistryFromArchive(records), "zorya"), false, "an untouched card of the old copy stays out");
  // Nothing changed, the archive has everything the Room has: nothing to write.
  assert.deepEqual(initiativeCardArchiveWrites(previous, previous, { archiveRegistry: { dars: other }, roomRegistry: { dars: other } }), []);
});

test("A1 traduttore: la voce dell'attore ricorda le chiavi di prima, e una scheda che prende un'identità lascia la sua voce per chiave", () => {
  // A card never linked, by its two keys.
  const legacy = { name: "Hero", profile: { armorClass: 14 }, updatedAt: 3 };
  let records = apply([], initiativeCardArchiveWrites({}, { "asset:old.png": legacy, hero: legacy }));
  assert.deepEqual(records.map((record) => record.kind), ["card-key", "card-key"]);

  // The identity migration links both keys to an actor.
  const previous = initiativeCardRegistryFromArchive(records);
  const linked = Object.fromEntries(Object.entries(previous).map(([key, entry]) => [key, { ...entry, actorProfileId: "actor-hero" }]));
  records = apply(records, initiativeCardArchiveWrites(previous, linked, { archiveRegistry: previous }));
  assert.deepEqual(records.map((record) => [record.kind, record.id]), [["actor", "actor-hero"]]);
  assert.deepEqual(records[0].sections.card.value.keys.sort(), ["asset:old.png", "hero"]);

  // Saved later from a token with another image: the new key is added, the old ones stay, all on the new entry.
  const before = initiativeCardRegistryFromArchive(records);
  const saved = hero(30, 20);
  records = apply(records, initiativeCardArchiveWrites(before, { ...before, "asset:new.png": saved, hero: saved }, { archiveRegistry: before }));
  assert.deepEqual(records[0].sections.card.value.keys, ["hero", "asset:new.png", "asset:old.png"], "the keys just written first");
  const registry = initiativeCardRegistryFromArchive(records);
  assert.equal(registry["asset:old.png"].profile.armorClass, 20, "every key of the actor answers with the entry last written");
});

test("A1 traduttore: una chiave tolta dal registro lascia l'archivio, e una cancellazione resta una voce", () => {
  const entry = hero(10);
  const monster = goblin(5);
  let records = apply([], initiativeCardArchiveWrites({}, { hero: entry, "asset:hero.png": entry, goblin: monster }));
  let registry = initiativeCardRegistryFromArchive(records);

  // One key of the actor and the monster's key removed.
  const { hero: _removed, goblin: _monster, ...rest } = registry;
  records = apply(records, initiativeCardArchiveWrites(registry, rest, { archiveRegistry: registry }));
  assert.deepEqual(records.map((record) => [record.kind, record.sections.card.value.keys]), [["actor", ["asset:hero.png"]]]);
  // The last key removed: the actor's record goes.
  registry = initiativeCardRegistryFromArchive(records);
  records = apply(records, initiativeCardArchiveWrites(registry, {}, { archiveRegistry: registry }));
  assert.deepEqual(records, []);

  // A deletion (the tombstone the Undo writes) is an entry like the others, and it is read back as one.
  const tombstone = { actorProfileId: "actor-hero", name: "Hero", deleted: true, updatedAt: 40 };
  records = apply([], initiativeCardArchiveWrites({ hero: entry }, { hero: tombstone }));
  assert.equal(initiativeCardRegistryFromArchive(records).hero.deleted, true);
});

test("A1 traduttore: due voci che rispondono alla stessa chiave, vale la più recente; ciò che non è una scheda si salta", () => {
  const older = withLocalActorArchiveSection(emptyActorArchiveRecord({ roomId: ROOM, kind: "card-key", id: "hero" }), "card", { entry: { name: "Hero", profile: { armorClass: 10 }, updatedAt: 5 } }).record;
  const newer = withLocalActorArchiveSection(emptyActorArchiveRecord({ roomId: ROOM, kind: "actor", id: "actor-hero" }), "card", { entry: hero(9), keys: ["hero"] }).record;
  assert.equal(initiativeCardRegistryFromArchive([older, newer]).hero.profile.armorClass, 18);
  assert.equal(initiativeCardRegistryFromArchive([newer, older]).hero.profile.armorClass, 18);
  const vitalsOnly = withLocalActorArchiveSection(emptyActorArchiveRecord({ roomId: ROOM, kind: "actor", id: "actor-mira" }), "vitals", { hp: 3, hpMax: 9 }).record;
  const emptied = withLocalActorArchiveSection(newer, "card", null).record;
  assert.deepEqual(initiativeCardRegistryFromArchive([vitalsOnly, emptied, null, {}]), {});
  assert.deepEqual(initiativeCardRegistryFromArchive(null), {});
});
