import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runArchiveServerChecks } from "../scripts/archiveServerCheckCore.mjs";
import {
  ARCHIVE_DEFAULT_ORIGINS,
  ARCHIVE_MAX_BODY_BYTES,
  ARCHIVE_MAX_ROOM_RECORDS,
  ARCHIVE_MAX_VALUE_BYTES,
  ARCHIVE_MIN_KEY_LENGTH,
  ARCHIVE_PROTOCOL,
  ARCHIVE_SECTIONS,
  ARCHIVE_SERVICE,
  ARCHIVE_TEST_ROOM_PREFIX,
  createArchiveServerReference,
} from "../test-support/archiveServerReference.js";
import { ACTOR_ARCHIVE_SECTIONS } from "../src/actorArchiveCore.js";

// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A2: the checking program passes on the reference server
// and catches a server that answers wrongly. The PHP script itself runs only on the real server.
const KEY = "chiave-di-prova-lunga-almeno-trentadue-caratteri";
const URL_BASE = "https://archivio.test/archivio.php";

test("A2: il server di riferimento passa tutti i controlli e non tiene la stanza di prova", async () => {
  const server = createArchiveServerReference({ key: KEY });
  const results = await runArchiveServerChecks({ fetch: server.fetch, url: URL_BASE, key: KEY, room: "prova-test" });
  assert.deepEqual(results.filter((result) => !result.ok), []);
  assert.ok(results.length >= 14);
  assert.equal(server.rooms.size, 0, "the checking room is deleted");
});

test("A2: i controlli scoprono un server che non guarda la revisione, che perde gli oggetti vuoti o che accetta ogni chiave", async () => {
  const failing = async (breakAnswer) => {
    const server = createArchiveServerReference({ key: KEY });
    const fetch = async (address, options) => breakAnswer(await server.fetch(address, options), address, options, server);
    return (await runArchiveServerChecks({ fetch, url: URL_BASE, key: KEY, room: "prova-test" })).filter((result) => !result.ok).map((result) => result.name);
  };
  const withBody = (response, body) => ({ ...response, status: 200, ok: true, text: async () => JSON.stringify(body), json: async () => body });

  // Accepts a write whatever revision it started from.
  const noRevision = await failing(async (response) => (response.status === 409 ? withBody(response, { ok: true, rev: 2, seq: 2 }) : response));
  assert.ok(noRevision.includes("rifiuta una scrittura partita da una revisione vecchia e restituisce la sua"), noRevision.join("; "));
  // Reads the value and writes it back as PHP's arrays would: {} becomes [].
  const emptyObjects = await failing(async (response) => {
    const text = (await response.text()).replaceAll('\\"vuoto\\":{}', '\\"vuoto\\":[]');
    return { ...response, text: async () => text, json: async () => JSON.parse(text) };
  });
  assert.deepEqual(emptyObjects, ["restituisce il valore identico, oggetti vuoti compresi"]);
  // Answers without looking at the key.
  const noKey = await failing(async (response) => (response.status === 401 ? withBody(response, { ok: true, protocollo: 1 }) : response));
  assert.deepEqual(noKey, ["rifiuta una chiave sbagliata o assente"]);
});

test("A2: una chiave corta, un'origine estranea e una stanza piena sono rifiutate dal riferimento", () => {
  const short = createArchiveServerReference({ key: "corta" });
  assert.equal(short.handle({ query: { ping: "1" }, headers: { "x-ti-key": "corta" } }).status, 500);
  const server = createArchiveServerReference({ key: KEY });
  assert.equal(server.handle({ method: "OPTIONS", headers: { origin: "https://altro.example" } }).status, 403);
  // Without an Origin (the checking program run by hand, curl) the key alone decides.
  assert.equal(server.handle({ query: { ping: "1" }, headers: { "x-ti-key": KEY } }).status, 200);
  const put = (id) => server.handle({ method: "PUT", query: { room: "stanza" }, headers: { "x-ti-key": KEY },
    body: JSON.stringify({ kind: "card-key", id, name: "", section: "card", baseRev: 0, at: 1, json: "null" }) });
  for (let index = 0; index < ARCHIVE_MAX_ROOM_RECORDS; index += 1) assert.equal(put(`k${index}`).status, 200);
  assert.equal(put("una di troppo").status, 413);
  assert.equal(server.handle({ method: "DELETE", query: { room: "stanza" }, headers: { "x-ti-key": KEY } }).status, 403, "a campaign's room is never deleted");
});

test("A2: lo script PHP dichiara gli stessi limiti e le stesse sezioni del riferimento e dell'archivio del plugin", () => {
  const php = readFileSync(new URL("../server/archive/archivio.php", import.meta.url), "utf8");
  const constant = (name) => php.match(new RegExp(`const ${name} = ([^;]+);`))?.[1];
  assert.equal(Number(constant("TI_PROTOCOL")), ARCHIVE_PROTOCOL);
  assert.equal(constant("TI_SERVICE"), `'${ARCHIVE_SERVICE}'`);
  assert.equal(Number(constant("TI_MIN_KEY_LENGTH")), ARCHIVE_MIN_KEY_LENGTH);
  assert.equal(Number(constant("TI_MAX_BODY_BYTES")), ARCHIVE_MAX_BODY_BYTES);
  assert.equal(Number(constant("TI_MAX_VALUE_BYTES")), ARCHIVE_MAX_VALUE_BYTES);
  assert.equal(Number(constant("TI_MAX_ROOM_RECORDS")), ARCHIVE_MAX_ROOM_RECORDS);
  assert.equal(constant("TI_TEST_ROOM_PREFIX"), `'${ARCHIVE_TEST_ROOM_PREFIX}'`);
  assert.equal(constant("TI_SECTIONS"), "['actor' => ['card', 'vitals', 'state'], 'card-key' => ['card']]");
  assert.equal(constant("TI_DEFAULT_ORIGINS"), `[${ARCHIVE_DEFAULT_ORIGINS.map((origin) => `'${origin}'`).join(", ")}]`);
  assert.deepEqual(ARCHIVE_SECTIONS, Object.fromEntries(Object.entries(ACTOR_ARCHIVE_SECTIONS).map(([kind, sections]) => [kind, [...sections]])));
  // No secret and no address of a real server in the repository.
  const example = readFileSync(new URL("../server/archive/config.esempio.php", import.meta.url), "utf8");
  assert.match(example, /'key' => 'METTI-QUI-/);
  assert.doesNotMatch(php + example, /synology|\.me\b|192\.168\./i);
});
