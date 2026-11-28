// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A3: the service in the GM's background that keeps the
// working archive of the room and the archive server aligned. It runs only with the archive switched on in this browser
// and a server configured (the Options). It never stands between the GM and a card: opening and saving work on the
// working archive, and what is not sent yet waits in the outbox.
// When: at start-up, at every scene opening, when a page of the plugin writes to the archive, when the configuration
// changes, when the network comes back, and every thirty seconds while something is still unsent after a failure.
import {
  ACTOR_ARCHIVE_FLAG_KEY,
  actorArchiveEnabled,
  createActorArchiveStore,
  openActorArchiveChannel,
} from "./actorArchiveStore.js";
import {
  ACTOR_ARCHIVE_SERVER_KEY,
  readActorArchiveServer,
  writeActorArchiveStatus,
} from "./actorArchiveConfig.js";
import { createActorArchiveSync } from "./actorArchiveSync.js";
import { initiativeCardArchivePrefersLocal } from "./initiativeCardArchiveCore.js";

export const ACTOR_ARCHIVE_RETRY_MS = 30_000;
const DIRTY_DELAY_MS = 400;

function italianList(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names.join("");
}

// What the GM reads when cards written here gave way to newer ones of another computer; "" when none did.
export function actorArchiveConflictNotice(conflicts) {
  const names = [...new Set((Array.isArray(conflicts) ? conflicts : [])
    .filter((conflict) => conflict?.section === "card")
    .map((conflict) => String(conflict.name || "").trim() || "un personaggio"))];
  if (!names.length) return "";
  return `Archivio: su un altro computer c'è una versione più recente ${names.length === 1 ? "della scheda" : "delle schede"} di ${italianList(names)}. Uso quella.`;
}

/**
 * obr: the SDK (room.id, notification). onCardsPulled: called after cards arrived from the server, to realign the
 * scene's tokens. subscribeSceneReady(listener): calls listener at every scene opening and returns its unsubscribe.
 * Returns { syncNow, stop }.
 */
export function mountActorArchiveSync({
  obr,
  store = createActorArchiveStore(),
  fetch = globalThis.fetch,
  onCardsPulled = null,
  subscribeSceneReady = null,
  host = globalThis,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (handle) => clearTimeout(handle),
  now = Date.now,
} = {}) {
  const engine = createActorArchiveSync({ store, fetch, preferLocal: initiativeCardArchivePrefersLocal });
  let stopped = false;
  let timer = null;
  let failureTold = false;

  const notify = (message) => {
    try { void obr?.notification?.show?.(message, "WARNING")?.catch?.(() => {}); } catch {}
  };

  function schedule(delay) {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void syncNow();
    }, delay);
    // Node (the tests): a pending round must not keep the process alive.
    timer?.unref?.();
  }

  async function syncNow() {
    if (stopped || !actorArchiveEnabled()) return null;
    const server = readActorArchiveServer();
    let roomId = "";
    try { roomId = String(obr?.room?.id || ""); } catch {}
    if (!server || !roomId) return null;
    const summary = await engine.sync(roomId, server);
    if (stopped) return summary;
    writeActorArchiveStatus({ at: now(), roomId, ok: summary.ok, error: summary.error, pending: summary.pending,
      pulled: summary.pulled, pushed: summary.pushed });
    if (typeof onCardsPulled === "function" && summary.pulledSections.some((entry) => entry.section === "card")) {
      try { await onCardsPulled(); } catch (error) { console.warn("[actor-archive] realignment:", error?.message || error); }
    }
    const conflictNotice = actorArchiveConflictNotice(summary.conflicts);
    if (conflictNotice) notify(conflictNotice);
    if (summary.ok) {
      failureTold = false;
    } else {
      console.warn("[actor-archive] sincronizzazione:", summary.error);
      // Told once, until a round succeeds: the outbox keeps everything meanwhile.
      if (!failureTold) notify("Archivio online non raggiungibile: le modifiche restano in questo browser e partono appena torna.");
      failureTold = true;
    }
    if (!summary.ok || summary.pending > 0) schedule(ACTOR_ARCHIVE_RETRY_MS);
    return summary;
  }

  const channel = openActorArchiveChannel();
  if (channel) {
    channel.onmessage = (event) => schedule(event?.data?.type === "sync-now" ? 0 : DIRTY_DELAY_MS);
  }
  const onStorage = (event) => {
    if (event?.key === ACTOR_ARCHIVE_FLAG_KEY || event?.key === ACTOR_ARCHIVE_SERVER_KEY) schedule(0);
  };
  const onOnline = () => schedule(0);
  host?.addEventListener?.("storage", onStorage);
  host?.addEventListener?.("online", onOnline);
  const unsubscribeScene = typeof subscribeSceneReady === "function" ? subscribeSceneReady(() => schedule(0)) : null;
  schedule(0);

  function stop() {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    try { channel?.close(); } catch {}
    host?.removeEventListener?.("storage", onStorage);
    host?.removeEventListener?.("online", onOnline);
    try { unsubscribeScene?.(); } catch {}
  }

  return { syncNow, stop };
}
