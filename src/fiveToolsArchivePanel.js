// The sheet's "Archivio online" (attacchi dei mostri, fase 3, lotto 4): the books of 5eTools' archive this browser keeps
// (date, size, monsters, Aggiorna, Rimuovi) and Aggiungi libro from the archive's index. Their monsters go to the
// sheet's picker through onChange, with the files the GM loads. The network is used only on Aggiungi, Aggiorna and for
// the base of a derived monster (decision D2); books are refreshed only by hand (D3).
import { createFiveToolsArchiveClient } from "./fiveToolsArchiveClient.js";
import { createFiveToolsArchiveStore } from "./fiveToolsArchiveStore.js";
import { fiveToolsArchiveBookForSource, fiveToolsArchiveSizeLabel, fiveToolsBook, fiveToolsBookLabel } from "./fiveToolsArchiveCore.js";

export function createFiveToolsArchivePanel({
  container, documentRef = globalThis.document, store = createFiveToolsArchiveStore(), client = createFiveToolsArchiveClient(),
  readBase = () => "", onChange = () => {}, allow2024 = () => false,
} = {}) {
  let cached = [];
  let index = null;
  let busy = false;
  let message = { text: "", tone: "" };
  const el = (tag, className = "", text = "") => {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const say = (text, tone = "") => { message = { text, tone }; render(); };

  function bookRow(entry) {
    const row = el("div", "five-tools-book");
    const info = el("span", "five-tools-book-info");
    const date = new Date(entry.fetchedAt).toLocaleDateString("it-IT");
    info.append(el("strong", "", fiveToolsBookLabel(fiveToolsBook(entry.code))),
      el("small", "", `${entry.monsters} mostri · ${fiveToolsArchiveSizeLabel(entry.bytes)} · ${date}${entry.persisted ? "" : " · solo per questa sessione"}`));
    const update = el("button", "quick-action-add", "Aggiorna");
    update.type = "button";
    update.disabled = busy || !readBase();
    update.dataset.archiveUpdate = entry.code;
    update.addEventListener("click", () => void addBook(entry.code, { update: true }));
    const remove = el("button", "quick-action-add", "Rimuovi");
    remove.type = "button";
    remove.disabled = busy;
    remove.dataset.archiveRemove = entry.code;
    remove.addEventListener("click", () => void removeBook(entry.code));
    row.append(info, update, remove);
    return row;
  }

  function render() {
    if (!container) return;
    const nodes = [];
    const base = readBase();
    if (!base) nodes.push(el("p", "sheet-import-pool", "Nessun archivio: scrivi l'indirizzo in Opzioni → Console attacchi → Archivio 5eTools."));
    if (cached.length) nodes.push(...cached.map(bookRow));
    else if (base) nodes.push(el("p", "sheet-import-pool", "Nessun libro in memoria: aggiungine uno, una volta sola."));
    if (base) {
      const row = el("div", "five-tools-add");
      const select = el("select");
      select.dataset.archiveBooks = "1";
      select.setAttribute("aria-label", "Libro da aggiungere");
      const kept = new Set(cached.map((entry) => entry.code.toLowerCase()));
      const books = (index || []).filter((book) => !kept.has(book.code.toLowerCase()));
      select.append(...(index ? books : []).map((book) => {
        const option = el("option", "", fiveToolsBookLabel(book));
        option.value = book.code;
        option.disabled = book.disabled;
        return option;
      }));
      if (!index) select.append(Object.assign(el("option", "", "Elenco dei libri non ancora letto"), { value: "" }));
      select.disabled = busy || !index;
      const add = el("button", "quick-action-add", index ? "Aggiungi libro" : "Leggi l'elenco");
      add.type = "button";
      add.disabled = busy;
      add.dataset.archiveAdd = "1";
      add.addEventListener("click", () => void (index ? addBook(select.value) : loadIndex()));
      row.append(select, add);
      nodes.push(row);
    }
    if (message.text) {
      const status = el("p", "five-tools-archive-message", message.text);
      status.dataset.tone = message.tone;
      status.setAttribute("role", "status");
      nodes.push(status);
    }
    container.replaceChildren(...nodes);
  }

  async function refresh() {
    cached = await store.list();
    render();
    onChange(await store.allData());
  }

  async function loadIndex() {
    if (busy) return null;
    busy = true;
    say("Leggo l'elenco dei libri dell'archivio…");
    try {
      index = await client.books(readBase(), { allow2024: allow2024() });
      busy = false;
      say(`${index.filter((book) => !book.disabled).length} libri disponibili.`);
      return index;
    } catch (error) {
      busy = false;
      say(`Archivio non raggiungibile: ${error?.message || error}.`, "error");
      return null;
    }
  }

  async function addBook(code, { update = false, quiet = false } = {}) {
    if (busy || !code) return false;
    const books = index || await loadIndex();
    const book = books?.find((entry) => entry.code.toLowerCase() === String(code).toLowerCase());
    if (!book) {
      if (books) say(`${code} non è nell'archivio.`, "error");
      return false;
    }
    busy = true;
    say(`${update ? "Aggiorno" : "Scarico"} ${fiveToolsBookLabel(book)}…`);
    try {
      const record = await client.download(readBase(), book);
      const saved = await store.put(record);
      busy = false;
      await refresh();
      if (!quiet) say(`${fiveToolsBookLabel(book)}: ${record.monsters} mostri${saved.persisted ? "" : `, solo per questa sessione (${saved.reason})`}.`, saved.persisted ? "ok" : "error");
      return true;
    } catch (error) {
      busy = false;
      say(`${fiveToolsBookLabel(book)} non scaricato: ${error?.message || error}.`, "error");
      return false;
    }
  }

  async function removeBook(code) {
    if (busy) return;
    await store.remove(code);
    await refresh();
    say(`${fiveToolsBookLabel(fiveToolsBook(code))} tolto dalla memoria.`);
  }

  // The base of a derived monster is in a book not kept yet: download it (D2). True when the book is now kept.
  async function ensureSource(source) {
    if (!readBase() || cached.some((entry) => entry.code.toLowerCase() === String(source).toLowerCase())) return false;
    const books = index || await loadIndex();
    const book = books ? fiveToolsArchiveBookForSource(books, source) : null;
    if (!book || book.disabled) return false;
    return addBook(book.code, { quiet: true });
  }

  return Object.freeze({ refresh, render, loadIndex, addBook, removeBook, ensureSource, hasBase: () => !!readBase() });
}
