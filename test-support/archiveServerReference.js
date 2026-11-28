// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A2: the archive server's protocol, written once more in
// JavaScript and kept in memory. It is the reference the checking program is tried against (the PHP script cannot run on
// the development computer) and the server the client's tests of lot A3 will talk to. server/archive/archivio.php must
// answer the same way: scripts/check-archive-server.mjs says whether it does.
//
// One address, the room in the query. Every request carries the key in the X-TI-Key header.
//   GET  ?ping=1                  → { ok, servizio, protocollo }
//   GET  ?room=R&since=N          → { ok, seq, records: [{ kind, id, name, seq, sections: { card: { rev, at, json } } }] }
//                                   the records written after N (the room's counter), oldest first
//   PUT  ?room=R   { kind, id, name, section, baseRev, at, json }
//                                 → 200 { ok, rev, seq } when baseRev is the section's revision (0 for a new one)
//                                 → 409 { ok: false, errore, section, seq } when it is not: `section` is the server's
//   DELETE ?room=prova-…          → { ok }: only a room of the checking program can be deleted
// `json` is the section's value as JSON text: the server stores and returns it as it came, without reading it, so an
// empty object never comes back as an empty list.
export const ARCHIVE_PROTOCOL = 1;
export const ARCHIVE_SERVICE = "take-initiative-archivio";
export const ARCHIVE_MIN_KEY_LENGTH = 32;
export const ARCHIVE_MAX_BODY_BYTES = 131072;
export const ARCHIVE_MAX_VALUE_BYTES = 65536;
export const ARCHIVE_MAX_ROOM_RECORDS = 2000;
export const ARCHIVE_TEST_ROOM_PREFIX = "prova-";
export const ARCHIVE_SECTIONS = Object.freeze({ actor: ["card", "vitals", "state"], "card-key": ["card"] });
export const ARCHIVE_DEFAULT_ORIGINS = Object.freeze(["https://take-initiative.onrender.com", "http://localhost:5173"]);

const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const byteLength = (text) => new TextEncoder().encode(text).length;

function integer(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isJsonText(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// request: { method, query: { room, since, ping }, headers (lower-case names), body (text) }
// → { status, headers, body (object, or null for an answer without one) }
export function createArchiveServerReference({ key, origins = ARCHIVE_DEFAULT_ORIGINS } = {}) {
  const rooms = new Map();

  function handle({ method = "GET", query = {}, headers = {}, body = "" } = {}) {
    const origin = String(headers.origin || "");
    const allowed = origins.includes(origin);
    const responseHeaders = { "cache-control": "no-store" };
    if (allowed) {
      Object.assign(responseHeaders, {
        "access-control-allow-origin": origin,
        vary: "Origin",
        "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "Content-Type, X-TI-Key",
        "access-control-max-age": "600",
      });
    }
    const reply = (status, answer) => ({ status, headers: responseHeaders, body: answer });
    const refuse = (status, errore, extra = {}) => reply(status, { ok: false, errore, ...extra });

    if (method === "OPTIONS") return reply(allowed ? 204 : 403, null);
    if (origin && !allowed) return refuse(403, "origine non ammessa");
    if (typeof key !== "string" || key.length < ARCHIVE_MIN_KEY_LENGTH) return refuse(500, "chiave non impostata o troppo corta");
    if (String(headers["x-ti-key"] || "") !== key) return refuse(401, "chiave mancante o sbagliata");

    if (method === "GET" && query.ping !== undefined && query.room === undefined) {
      return reply(200, { ok: true, servizio: ARCHIVE_SERVICE, protocollo: ARCHIVE_PROTOCOL });
    }
    const roomId = String(query.room ?? "");
    if (!ROOM_PATTERN.test(roomId)) return refuse(400, "stanza non valida");
    const room = rooms.get(roomId) || { seq: 0, records: new Map() };

    if (method === "GET") {
      const since = query.since === undefined ? 0 : integer(Number(query.since));
      if (since === null) return refuse(400, "since non valido");
      const records = [...room.records.values()].filter((record) => record.seq > since).sort((left, right) => left.seq - right.seq);
      return reply(200, { ok: true, seq: room.seq, records: structuredClone(records) });
    }

    if (method === "DELETE") {
      if (!roomId.startsWith(ARCHIVE_TEST_ROOM_PREFIX)) return refuse(403, "si cancella solo una stanza di prova");
      rooms.delete(roomId);
      return reply(200, { ok: true });
    }

    if (method !== "PUT") return refuse(405, "metodo non previsto");
    if (byteLength(String(body)) > ARCHIVE_MAX_BODY_BYTES) return refuse(413, "richiesta troppo grande");
    let write = null;
    try { write = JSON.parse(String(body)); } catch {}
    if (!write || typeof write !== "object" || Array.isArray(write)) return refuse(400, "il corpo non è JSON");
    const { kind, id, section, json } = write;
    const name = typeof write.name === "string" ? write.name.slice(0, 120) : "";
    const baseRev = integer(write.baseRev);
    const at = integer(write.at);
    if (!Object.hasOwn(ARCHIVE_SECTIONS, kind) || !ARCHIVE_SECTIONS[kind].includes(section)) return refuse(400, "tipo o sezione non validi");
    if (typeof id !== "string" || !id || id.length > 1024) return refuse(400, "id non valido");
    if (baseRev === null || at === null) return refuse(400, "revisione o data non valide");
    if (typeof json !== "string" || byteLength(json) > ARCHIVE_MAX_VALUE_BYTES) return refuse(413, "valore assente o troppo grande");
    if (!isJsonText(json)) return refuse(400, "il valore non è JSON");

    const recordKey = `${kind}|${id}`;
    const record = room.records.get(recordKey) || { kind, id, name: "", seq: 0, sections: {} };
    const stored = record.sections[section] || null;
    const storedRev = stored?.rev || 0;
    // The same write sent again after an answer that was lost: it is already there.
    if (stored && storedRev === baseRev + 1 && stored.json === json && stored.at === at) {
      return reply(200, { ok: true, rev: storedRev, seq: record.seq });
    }
    if (baseRev !== storedRev) return refuse(409, "revisione superata", { section: stored ? { ...stored } : null, seq: room.seq });
    if (!room.records.has(recordKey) && room.records.size >= ARCHIVE_MAX_ROOM_RECORDS) return refuse(413, "stanza piena");

    room.seq += 1;
    record.sections[section] = { rev: storedRev + 1, at, json };
    record.name = name;
    record.seq = room.seq;
    room.records.set(recordKey, record);
    rooms.set(roomId, room);
    return reply(200, { ok: true, rev: storedRev + 1, seq: room.seq });
  }

  // A fetch() that talks to this server: for the checking program's test and for the client's tests.
  async function fetchFromReference(address, { method = "GET", headers = {}, body = "" } = {}) {
    const url = new URL(address);
    const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
    const answer = handle({ method, query: Object.fromEntries(url.searchParams), headers: lowerHeaders, body });
    const text = answer.body === null ? "" : JSON.stringify(answer.body);
    return {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: { get: (name) => answer.headers[String(name).toLowerCase()] ?? null },
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  }

  return { handle, fetch: fetchFromReference, rooms };
}
