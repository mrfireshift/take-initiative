// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A3: the «Archivio degli attori» section of the Options.
// The switch of this browser (decision E9), the archive server's address and key, «Salva e prova» and the outcome of
// the last synchronization. Outside the options' draft and their «Salva», as the «Giocatori» panel: it writes at once,
// in this browser only. The key is never shown again once saved.
import { ACTOR_ARCHIVE_FLAG_KEY, actorArchiveEnabled, notifyActorArchiveDirty } from "./actorArchiveStore.js";
import {
  ACTOR_ARCHIVE_MIN_KEY_LENGTH,
  ACTOR_ARCHIVE_STATUS_KEY,
  normalizeActorArchiveUrl,
  readActorArchiveServer,
  readActorArchiveStatus,
  writeActorArchiveServer,
} from "./actorArchiveConfig.js";
import { createActorArchiveSync } from "./actorArchiveSync.js";

function clockTime(at) {
  const date = new Date(Number(at) || 0);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
}

// What the status line says of the last synchronization; pure, for the tests.
export function actorArchiveStatusText({ enabled, server, status } = {}) {
  if (!enabled) return "Spento: il plugin lavora come prima, con le schede in questo browser e nella stanza.";
  if (!server) return "Acceso senza server: le schede usate in ogni stanza vanno nell'archivio di questo browser.";
  if (!status) return "Server impostato: la prima sincronizzazione parte tra poco.";
  const pending = Number(status.pending) || 0;
  const queue = pending === 0 ? "Niente in coda." : pending === 1 ? "Una scrittura in coda." : `${pending} scritture in coda.`;
  const time = clockTime(status.at);
  return status.ok
    ? `Ultima sincronizzazione${time ? ` alle ${time}` : ""}: a posto. ${queue}`
    : `Ultima sincronizzazione${time ? ` alle ${time}` : ""} non riuscita (${String(status.error || "errore")}). ${queue}`;
}

/**
 * root: the section's element, with [data-actor-archive-enabled], [data-actor-archive-url], [data-actor-archive-key],
 * [data-action="actor-archive-save"] and [data-actor-archive-status]. Returns { dispose }.
 */
export function mountActorArchivePanel(root, { fetch = globalThis.fetch, host = globalThis } = {}) {
  const enabledInput = root?.querySelector("[data-actor-archive-enabled]");
  const urlInput = root?.querySelector("[data-actor-archive-url]");
  const keyInput = root?.querySelector("[data-actor-archive-key]");
  const saveButton = root?.querySelector('[data-action="actor-archive-save"]');
  const statusNode = root?.querySelector("[data-actor-archive-status]");
  if (!enabledInput || !urlInput || !keyInput || !saveButton || !statusNode) return { dispose() {} };

  const say = (text, kind = "") => {
    statusNode.textContent = text;
    statusNode.dataset.state = kind;
  };
  const render = () => {
    const server = readActorArchiveServer();
    enabledInput.checked = actorArchiveEnabled();
    if (host.document?.activeElement !== urlInput) urlInput.value = server?.url || urlInput.value || "";
    keyInput.placeholder = server ? "Salvata: lascia vuoto per tenerla" : `Almeno ${ACTOR_ARCHIVE_MIN_KEY_LENGTH} caratteri`;
    say(actorArchiveStatusText({ enabled: enabledInput.checked, server, status: readActorArchiveStatus() }));
  };

  const onToggle = () => {
    try {
      if (enabledInput.checked) host.localStorage.setItem(ACTOR_ARCHIVE_FLAG_KEY, "1");
      else host.localStorage.removeItem(ACTOR_ARCHIVE_FLAG_KEY);
    } catch {
      say("Questo browser non lascia salvare l'impostazione.", "error");
      return;
    }
    notifyActorArchiveDirty("sync-now");
    render();
  };

  const onSave = async () => {
    const url = normalizeActorArchiveUrl(urlInput.value);
    const key = keyInput.value.trim() || readActorArchiveServer()?.key || "";
    if (!urlInput.value.trim() && !keyInput.value.trim() && !readActorArchiveServer()) {
      say("Scrivi l'indirizzo del server e la sua chiave.", "error");
      return;
    }
    if (!url) {
      say("Indirizzo non valido: deve cominciare con https://", "error");
      return;
    }
    if (key.length < ACTOR_ARCHIVE_MIN_KEY_LENGTH) {
      say(`La chiave deve avere almeno ${ACTOR_ARCHIVE_MIN_KEY_LENGTH} caratteri.`, "error");
      return;
    }
    saveButton.disabled = true;
    say("Provo il collegamento…");
    const answer = await createActorArchiveSync({ fetch }).ping({ url, key });
    saveButton.disabled = false;
    if (!answer.ok) {
      say(answer.status === 401 ? "Il server risponde, ma la chiave non è la sua. Non ho salvato."
        : answer.status ? `Il server risponde ${answer.status} (${answer.error}). Non ho salvato.`
          : "Il server non risponde: controlla indirizzo, porta e certificato. Non ho salvato.", "error");
      return;
    }
    if (!writeActorArchiveServer({ url, key })) {
      say("Questo browser non lascia salvare l'impostazione.", "error");
      return;
    }
    keyInput.value = "";
    urlInput.value = url;
    notifyActorArchiveDirty("sync-now");
    render();
    say(enabledInput.checked ? "Collegato e salvato. La sincronizzazione parte adesso." : "Collegato e salvato. Accendi l'archivio per usarlo.", "ok");
  };

  const onStorage = (event) => {
    if (event?.key === ACTOR_ARCHIVE_STATUS_KEY || event?.key === ACTOR_ARCHIVE_FLAG_KEY) render();
  };
  enabledInput.addEventListener("change", onToggle);
  saveButton.addEventListener("click", onSave);
  host.addEventListener?.("storage", onStorage);
  render();

  return {
    dispose() {
      enabledInput.removeEventListener("change", onToggle);
      saveButton.removeEventListener("click", onSave);
      host.removeEventListener?.("storage", onStorage);
    },
  };
}
