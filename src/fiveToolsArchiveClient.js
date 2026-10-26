// The network side of 5eTools' archive (attacchi dei mostri, fase 3, lotto 4): reads the index and downloads a book,
// checked and shaped as a cache record. Only on the GM's request (Aggiungi, Aggiorna, the base of a derived monster),
// never on a turn and never in the players' browsers. Every request has a time limit.
import { fiveToolsArchiveBookUrl, fiveToolsArchiveIndexUrl, fiveToolsArchiveRecord, parseFiveToolsArchiveIndex } from "./fiveToolsArchiveCore.js";

const TIMEOUT_MS = 30000;

async function fetchText(url, fetchImpl, timeoutMs) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, { cache: "no-store", ...(controller ? { signal: controller.signal } : {}) });
    if (!response.ok) throw new Error(`l'archivio risponde ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`nessuna risposta in ${Math.round(timeoutMs / 1000)} secondi`);
    if (error instanceof TypeError) throw new Error("archivio non raggiungibile (rete o indirizzo)");
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createFiveToolsArchiveClient({ fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = TIMEOUT_MS } = {}) {
  return Object.freeze({
    // The archive's books: [{ code, file, name, year, rules2024, disabled }].
    async books(base, { allow2024 = false } = {}) {
      const url = fiveToolsArchiveIndexUrl(base);
      if (!url) throw new Error("nessun indirizzo dell'archivio: scrivilo in Opzioni → Console attacchi");
      let index;
      try { index = JSON.parse(await fetchText(url, fetchImpl, timeoutMs)); } catch (error) {
        throw error instanceof SyntaxError ? new Error("l'indice dell'archivio non è JSON") : error;
      }
      const books = parseFiveToolsArchiveIndex(index, { allow2024 });
      if (!books.length) throw new Error("all'indirizzo non c'è un indice di bestiari di 5eTools");
      return books;
    },
    // One book downloaded and checked, as the record the cache keeps.
    async download(base, book) {
      if (book?.disabled) throw new Error(`${book.name}: regole 2024, non si scarica`);
      const url = fiveToolsArchiveBookUrl(base, book?.file);
      if (!url) throw new Error("libro dell'archivio non valido");
      const text = await fetchText(url, fetchImpl, timeoutMs);
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`il file di ${book.code} non è JSON`); }
      return fiveToolsArchiveRecord({ code: book.code, file: book.file, url, text, data });
    },
  });
}
