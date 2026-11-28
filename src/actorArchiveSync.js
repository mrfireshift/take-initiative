// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A3: one round of synchronization between the working
// archive of a room (actorArchiveStore.js) and the archive server (the protocol of test-support/archiveServerReference.js).
// First the server's changes since the last round are read and applied, then this copy's outbox is sent. Nothing here
// knows about Owlbear: the room, the server and the store are given.
import {
  withAcknowledgedActorArchiveSection,
  withRebasedActorArchiveSection,
  withServerActorArchiveSection,
} from "./actorArchiveCore.js";

function address(url, query) {
  return `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams(query)}`;
}

function serverError(status, data) {
  const error = new Error(`actor-archive-server-${status}${data?.errore ? `: ${data.errore}` : ""}`);
  error.status = status;
  return error;
}

// A section as the server sends it, { rev, at, json }, as the archive keeps it; null when it is not readable.
function serverSection(section) {
  if (!section || typeof section !== "object" || typeof section.json !== "string") return null;
  try {
    return { rev: section.rev, at: section.at, value: JSON.parse(section.json) };
  } catch {
    return null;
  }
}

/**
 * preferLocal(sectionName, localValue, serverValue): when the server holds a newer revision of a section this copy
 * still has in its outbox with another value, true keeps the local value (it goes up over the server's), false takes
 * the server's and the local write is lost (decision E4, the default). Cards pass their own rule: the newer date.
 */
export function createActorArchiveSync({ store, fetch = globalThis.fetch, preferLocal = () => false } = {}) {
  let running = Promise.resolve();

  async function call(server, method, query, body) {
    const response = await fetch(address(server.url, query), {
      method,
      headers: { "X-TI-Key": server.key, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    return { status: response.status, data };
  }

  // The server's section meets this copy's. Returns what happened: "applied", "kept" (the local value stays, rebased),
  // "lost" (the local write gave way to the server's) or "same" (nothing to do).
  async function receive(roomId, record, sectionName, incoming, summary) {
    let outcome = "same";
    await store.update(roomId, record.kind, record.id, (current) => {
      const local = current.sections[sectionName];
      const named = (next) => (record.name && !next.name ? { ...next, name: String(record.name).slice(0, 120) } : next);
      if (local?.dirty === true && incoming.rev > local.rev && preferLocal(sectionName, local.value, incoming.value)) {
        outcome = "kept";
        return withRebasedActorArchiveSection(current, sectionName, incoming.rev);
      }
      const received = withServerActorArchiveSection(current, sectionName, incoming);
      if (!received.applied) return current;
      outcome = received.conflict ? "lost" : "applied";
      return named(received.record);
    });
    if (outcome === "applied" || outcome === "lost") {
      summary.pulled += 1;
      summary.pulledSections.push({ kind: record.kind, id: record.id, name: record.name || "", section: sectionName });
    }
    if (outcome === "lost") summary.conflicts.push({ kind: record.kind, id: record.id, name: record.name || "", section: sectionName });
    return outcome;
  }

  async function pull(roomId, server, summary) {
    const since = await store.getCursor(roomId);
    const { status, data } = await call(server, "GET", { room: roomId, since });
    if (status !== 200 || !data?.ok || !Array.isArray(data.records)) throw serverError(status, data);
    // A server that lost its data (its counter is behind this copy's point): everything is read again from the start,
    // and what it no longer has goes up again from the outbox as its sections are refused.
    if (Number(data.seq) < since) {
      await store.setCursor(roomId, 0);
      return pull(roomId, server, summary);
    }
    for (const record of data.records) {
      for (const [sectionName, section] of Object.entries(record?.sections || {})) {
        const incoming = serverSection(section);
        if (incoming) await receive(roomId, record, sectionName, incoming, summary);
      }
    }
    await store.setCursor(roomId, Number(data.seq) || 0);
  }

  async function push(roomId, server, summary) {
    for (const { record, pending } of await store.listPending(roomId)) {
      for (const write of pending) {
        const { status, data } = await call(server, "PUT", { room: roomId }, {
          kind: record.kind, id: record.id, name: record.name, section: write.section, baseRev: write.baseRev, at: write.at,
          json: JSON.stringify(write.value),
        });
        if (status === 200 && data?.ok) {
          await store.update(roomId, record.kind, record.id, (current) => withAcknowledgedActorArchiveSection(current, write.section, { rev: data.rev, at: write.at }));
          summary.pushed += 1;
          continue;
        }
        if (status !== 409) throw serverError(status, data);
        // Refused: the server's section is not the one this write started from.
        const incoming = serverSection(data.section);
        if (!incoming) {
          // The server has no such section (its data were lost): the write goes up again as a new one.
          await store.update(roomId, record.kind, record.id, (current) => withRebasedActorArchiveSection(current, write.section, 0));
          summary.retry = true;
          continue;
        }
        const outcome = await receive(roomId, record, write.section, incoming, summary);
        if (outcome === "same") {
          // The server is behind this copy's revision (a restored backup): the write starts again from the server's.
          await store.update(roomId, record.kind, record.id, (current) => withRebasedActorArchiveSection(current, write.section, incoming.rev));
        }
        if (outcome !== "applied" && outcome !== "lost") summary.retry = true;
      }
    }
  }

  /**
   * One round for a room. server: { url, key }. Returns { ok, pulled, pushed, pending, conflicts, pulledSections, error }:
   * `conflicts` lists the local writes that gave way to the server's, `pending` what is still in the outbox. It never
   * throws: an unreachable server leaves everything in the outbox for the next round.
   */
  function sync(roomId, server) {
    const run = async () => {
      const summary = { ok: true, pulled: 0, pushed: 0, pending: 0, conflicts: [], pulledSections: [], error: "", retry: false };
      try {
        await pull(roomId, server, summary);
        await push(roomId, server, summary);
        // A section rebased during the push goes up in a second pass of the same round.
        if (summary.retry) {
          summary.retry = false;
          await push(roomId, server, summary);
        }
      } catch (error) {
        summary.ok = false;
        summary.error = String(error?.message || error || "errore");
      }
      try {
        summary.pending = (await store.listPending(roomId)).reduce((count, entry) => count + entry.pending.length, 0);
      } catch {}
      delete summary.retry;
      return summary;
    };
    const queued = running.then(run, run);
    running = queued.catch(() => {});
    return queued;
  }

  // The server's greeting: { ok, status, error }. For the «Salva e prova» of the Options.
  async function ping(server) {
    try {
      const { status, data } = await call(server, "GET", { ping: 1 });
      return { ok: status === 200 && data?.ok === true, status, error: status === 200 ? "" : String(data?.errore || `risposta ${status}`) };
    } catch (error) {
      return { ok: false, status: 0, error: String(error?.message || error || "errore") };
    }
  }

  return Object.freeze({ sync, ping });
}
