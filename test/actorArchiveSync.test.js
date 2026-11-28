import test from "node:test";
import assert from "node:assert/strict";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import { createArchiveServerReference } from "../test-support/archiveServerReference.js";
import { ACTOR_ARCHIVE_FLAG_KEY, createActorArchiveStore } from "../src/actorArchiveStore.js";
import { createActorArchiveSync } from "../src/actorArchiveSync.js";
import { initiativeCardArchivePrefersLocal, initiativeCardRegistryFromArchive } from "../src/initiativeCardArchiveCore.js";
import { ACTOR_ARCHIVE_RETRY_MS, actorArchiveConflictNotice, mountActorArchiveSync } from "../src/actorArchiveSyncRuntime.js";
import {
  ACTOR_ARCHIVE_SERVER_KEY,
  ACTOR_ARCHIVE_STATUS_KEY,
  normalizeActorArchiveServer,
  normalizeActorArchiveUrl,
} from "../src/actorArchiveConfig.js";

// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A3: the GM's two computers, each with its own working
// archive, and the archive server (the reference, in memory) between them.
const KEY = "chiave-di-prova-lunga-almeno-trentadue-caratteri";
const ROOM = "stanza-1";
const HERO = "actor-hero";
const SERVER = { url: "https://archivio.test/archivio.php", key: KEY };
const card = (updatedAt, armorClass) => ({ entry: { actorProfileId: HERO, name: "Hero", profile: { armorClass, savingThrows: {} }, updatedAt }, keys: ["hero"] });

function computer(server, options = {}) {
  const store = createActorArchiveStore({ indexedDB: createVersionedIndexedDB() });
  const sync = createActorArchiveSync({ store, fetch: options.fetch || server.fetch, preferLocal: options.preferLocal ?? initiativeCardArchivePrefersLocal });
  return {
    store,
    sync: () => sync.sync(ROOM, SERVER),
    ping: () => sync.ping(SERVER),
    save: (value, name = "Hero") => store.writeSection(ROOM, "actor", HERO, "card", value, { name }),
    card: async () => (await store.get(ROOM, "actor", HERO))?.sections.card,
  };
}

test("A3: il primo computer carica la scheda, il secondo la scarica e la ritrova nel registro", async () => {
  const server = createArchiveServerReference({ key: KEY });
  const workstation = computer(server);
  const laptop = computer(server);

  await workstation.save(card(100, 18));
  const first = await workstation.sync();
  assert.deepEqual([first.ok, first.pulled, first.pushed, first.pending], [true, 0, 1, 0]);
  assert.deepEqual(await workstation.card(), { rev: 1, at: (await workstation.card()).at, value: card(100, 18) }, "accepted: out of the outbox, on revision 1");
  // Nothing new: a round that neither reads nor writes anything.
  const idle = await workstation.sync();
  assert.deepEqual([idle.pulled, idle.pushed], [0, 0]);

  const pulled = await laptop.sync();
  assert.deepEqual([pulled.ok, pulled.pulled, pulled.pushed], [true, 1, 0]);
  assert.deepEqual(pulled.pulledSections, [{ kind: "actor", id: HERO, name: "Hero", section: "card" }]);
  const registry = initiativeCardRegistryFromArchive(await laptop.store.list(ROOM));
  assert.equal(registry.hero.profile.armorClass, 18);
  assert.deepEqual(registry.hero.profile.savingThrows, {}, "an empty object comes back as one");
  assert.equal((await laptop.store.get(ROOM, "actor", HERO)).name, "Hero");
  assert.equal(await laptop.store.getCursor(ROOM), 1);

  // The laptop changes it, the workstation gets the change.
  await laptop.save(card(200, 19));
  assert.equal((await laptop.sync()).pushed, 1);
  const back = await workstation.sync();
  assert.deepEqual([back.pulled, back.conflicts.length], [1, 0]);
  assert.equal((await workstation.card()).value.entry.profile.armorClass, 19);
  assert.equal((await workstation.card()).rev, 2);
});

test("A3: due modifiche alla stessa scheda sui due computer: resta quella con la data più recente", async () => {
  // The laptop's is the newer one and syncs second: it goes up over the workstation's.
  let server = createArchiveServerReference({ key: KEY });
  let workstation = computer(server);
  let laptop = computer(server);
  await workstation.save(card(100, 18));
  await workstation.sync();
  await laptop.sync();
  await workstation.save(card(300, 20));
  await laptop.save(card(400, 21));
  await workstation.sync();
  const kept = await laptop.sync();
  assert.deepEqual([kept.ok, kept.conflicts.length, kept.pushed, kept.pending], [true, 0, 1, 0]);
  assert.equal((await laptop.card()).value.entry.profile.armorClass, 21);
  await workstation.sync();
  assert.equal((await workstation.card()).value.entry.profile.armorClass, 21, "both computers end on the newer card");

  // The laptop's is the older one: the server's stays, and the laptop is told.
  server = createArchiveServerReference({ key: KEY });
  workstation = computer(server);
  laptop = computer(server);
  await workstation.save(card(100, 18));
  await workstation.sync();
  await laptop.sync();
  await workstation.save(card(400, 20));
  await laptop.save(card(300, 21));
  await workstation.sync();
  const lost = await laptop.sync();
  assert.deepEqual(lost.conflicts, [{ kind: "actor", id: HERO, name: "Hero", section: "card" }]);
  assert.equal((await laptop.card()).value.entry.profile.armorClass, 20);
  assert.equal(lost.pending, 0);
  assert.equal(actorArchiveConflictNotice(lost.conflicts), "Archivio: su un altro computer c'è una versione più recente della scheda di Hero. Uso quella.");
});

test("A3, E4: senza una regola propria della sezione, in un conflitto vale il server", async () => {
  const server = createArchiveServerReference({ key: KEY });
  const workstation = computer(server, { preferLocal: undefined });
  const laptop = computer(server, { preferLocal: () => false });
  await workstation.save(card(100, 18));
  await workstation.sync();
  await laptop.sync();
  await workstation.save(card(300, 20));
  await laptop.save(card(400, 21));
  await workstation.sync();
  const lost = await laptop.sync();
  assert.equal(lost.conflicts.length, 1);
  assert.equal((await laptop.card()).value.entry.profile.armorClass, 20);
});

test("A3: server irraggiungibile, risposta persa, chiave sbagliata: niente si perde e niente si conta due volte", async () => {
  const server = createArchiveServerReference({ key: KEY });
  let mode = "down";
  const fetch = async (address, options) => {
    if (mode === "down") throw new TypeError("Failed to fetch");
    const response = await server.fetch(address, options);
    if (mode === "lost-answer" && options?.method === "PUT") throw new TypeError("Failed to fetch");
    return response;
  };
  const laptop = computer(server, { fetch });
  await laptop.save(card(100, 18));

  const down = await laptop.sync();
  assert.deepEqual([down.ok, down.pending, down.error], [false, 1, "Failed to fetch"]);
  assert.equal((await laptop.card()).dirty, true, "still in the outbox");

  // The server takes the write, the answer is lost: the next round finds it there and does not count it twice.
  mode = "lost-answer";
  assert.deepEqual([(await laptop.sync()).ok, server.rooms.get(ROOM).seq], [false, 1]);
  mode = "up";
  const again = await laptop.sync();
  assert.deepEqual([again.ok, again.pending, again.conflicts.length, server.rooms.get(ROOM).seq], [true, 0, 0, 1]);
  assert.equal((await laptop.card()).rev, 1);

  const wrongKey = createActorArchiveSync({ store: laptop.store, fetch: server.fetch });
  const refused = await wrongKey.sync(ROOM, { ...SERVER, key: "x".repeat(40) });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /401/);
  assert.equal(refused.error.includes("x".repeat(40)), false, "the key is never in a message");
  assert.deepEqual(await laptop.ping(), { ok: true, status: 200, error: "" });
  assert.equal((await wrongKey.ping({ ...SERVER, key: "x".repeat(40) })).ok, false);
});

test("A3: un server che ha perso i dati riceve di nuovo ciò che è in coda", async () => {
  let server = createArchiveServerReference({ key: KEY });
  let current = server;
  const laptop = computer(server, { fetch: (address, options) => current.fetch(address, options) });
  await laptop.save(card(100, 18));
  await laptop.sync();
  await laptop.save(card(200, 19));
  await laptop.sync();
  assert.equal((await laptop.card()).rev, 2);

  // A new, empty server at the same address; the laptop has one more change to send, based on revision 2.
  current = createArchiveServerReference({ key: KEY });
  await laptop.save(card(300, 20));
  const restored = await laptop.sync();
  assert.deepEqual([restored.ok, restored.pending], [true, 0]);
  assert.equal(JSON.parse(current.rooms.get(ROOM).records.get(`actor|${HERO}`).sections.card.json).entry.profile.armorClass, 20);
  assert.equal((await laptop.card()).rev, 1, "the section starts again from the new server's revision");
  // The next round reads its own write back and moves its point forward.
  assert.deepEqual(await laptop.sync().then((summary) => [summary.ok, summary.pulled, summary.pushed]), [true, 0, 0]);
  assert.equal(await laptop.store.getCursor(ROOM), 1);
});

test("A3: l'indirizzo del server è https, senza credenziali, e la chiave ha almeno 32 caratteri", () => {
  assert.equal(normalizeActorArchiveUrl(" https://nas.example:8443/archivio.php "), "https://nas.example:8443/archivio.php");
  assert.equal(normalizeActorArchiveUrl("http://nas.example/archivio.php"), "", "plain http only on this computer");
  assert.equal(normalizeActorArchiveUrl("http://localhost:8080/archivio.php"), "http://localhost:8080/archivio.php");
  assert.equal(normalizeActorArchiveUrl("https://utente:segreto@nas.example/archivio.php"), "");
  assert.equal(normalizeActorArchiveUrl("ftp://nas.example/x"), "");
  assert.equal(normalizeActorArchiveUrl("non un indirizzo"), "");
  assert.deepEqual(normalizeActorArchiveServer({ url: "https://nas.example/a.php#x", key: ` ${KEY} ` }), { url: "https://nas.example/a.php", key: KEY });
  assert.equal(normalizeActorArchiveServer({ url: "https://nas.example/a.php", key: "corta" }), null);
});

test("A3 servizio: parte solo con interruttore e server, scrive lo stato, riallinea i token e avvisa una volta sola", async () => {
  const server = createArchiveServerReference({ key: KEY });
  const workstation = computer(server);
  await workstation.save(card(100, 18));
  await workstation.sync();

  const values = new Map();
  const previousStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true,
    value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) } });
  const notices = [];
  const timers = [];
  let down = false;
  let realigned = 0;
  const store = createActorArchiveStore({ indexedDB: createVersionedIndexedDB() });
  const runtime = mountActorArchiveSync({
    obr: { room: { id: ROOM }, notification: { show: async (message) => { notices.push(message); } } },
    store,
    fetch: (address, options) => (down ? Promise.reject(new TypeError("Failed to fetch")) : server.fetch(address, options)),
    onCardsPulled: async () => { realigned += 1; },
    host: null,
    setTimer: (callback, delay) => { timers.push(delay); return timers.length; },
    clearTimer: () => {},
    now: () => 5000,
  });
  try {
    assert.equal(await runtime.syncNow(), null, "switched off: nothing happens");
    values.set(ACTOR_ARCHIVE_FLAG_KEY, "1");
    assert.equal(await runtime.syncNow(), null, "no server configured: nothing happens");
    values.set(ACTOR_ARCHIVE_SERVER_KEY, JSON.stringify(SERVER));

    const first = await runtime.syncNow();
    assert.deepEqual([first.ok, first.pulled], [true, 1]);
    assert.equal(realigned, 1, "cards arrived: the scene's tokens are realigned");
    const status = JSON.parse(values.get(ACTOR_ARCHIVE_STATUS_KEY));
    assert.deepEqual(status, { at: 5000, roomId: ROOM, ok: true, error: "", pending: 0, pulled: 1, pushed: 0 });
    assert.equal(JSON.stringify(status).includes(KEY), false);
    assert.equal(await runtime.syncNow().then((summary) => summary.pulled), 0);
    assert.equal(realigned, 1, "nothing new: no realignment");

    // The server goes away with a write in the outbox: told once, and a retry is scheduled.
    down = true;
    await store.writeSection(ROOM, "actor", HERO, "card", card(200, 19), { name: "Hero" });
    timers.length = 0;
    await runtime.syncNow();
    await runtime.syncNow();
    assert.equal(notices.filter((message) => message.startsWith("Archivio online non raggiungibile")).length, 1);
    assert.deepEqual(timers, [ACTOR_ARCHIVE_RETRY_MS, ACTOR_ARCHIVE_RETRY_MS]);
    assert.equal(JSON.parse(values.get(ACTOR_ARCHIVE_STATUS_KEY)).pending, 1);
    down = false;
    assert.deepEqual(await runtime.syncNow().then((summary) => [summary.ok, summary.pushed, summary.pending]), [true, 1, 0]);

    runtime.stop();
    assert.equal(await runtime.syncNow(), null, "stopped");
  } finally {
    runtime.stop();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: previousStorage });
  }
});
