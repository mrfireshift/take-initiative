import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { fiveToolsArchiveSizeLabel } from "./fiveToolsArchiveCore.js";
import {
  filterRulesCatalogBySource,
  mergeRulesCatalogs,
  parsePrivatePack,
  privatePackContentsLabel,
  privateSpellTexts,
  privateTextMissingNote,
  rulesSourceCounts,
  SRD_SOURCE,
} from "./privatePackCore.js";
import { createPrivatePackStore } from "./privatePackStore.js";
import { CONDITION_REFERENCE, REFERENCE_SOURCE } from "./referenceData.js";
import { buildRulesIndex, entryPath, resolveRelated, rulesTree, searchRules } from "./rulesReferenceCore.js";
import { rulesTextBlock } from "./rulesTextView.js";

const MODAL_ID = `${ID}/reference-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const TABS = new Set(["conditions", "spells", "rules"]);
// The rules tab searches a few hundred texts: it waits for a pause in typing instead of running on every key.
const RULES_SEARCH_DELAY_MS = 120;
// The sources the GM hid in the Rules tab, kept in this browser only (a viewer's convenience).
const HIDDEN_SOURCES_KEY = `${ID}/reference-rules-hidden-sources`;

function readHiddenSources() {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_SOURCES_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveHiddenSources(hidden) {
  try {
    localStorage.setItem(HIDDEN_SOURCES_KEY, JSON.stringify([...hidden]));
  } catch {}
}

// The SRD rules compendium is a chunk of its own, downloaded the first time the Rules tab opens.
function loadRulesCatalog() {
  return import("./rules-reference-it.json").then((module) => module.default);
}

// The spell catalog and its Italian texts, the heaviest part of the encyclopedia, likewise wait for the Spells tab;
// the texts through the module the character sheet loads too, so both share one chunk. The supplement and PHB spells
// take their text from the GM's private packs (privatePacks: () => Promise<pack[]>).
function loadSpells(privatePacks) {
  return Promise.all([import("./spells-srd.js"), import("./spellReferenceItData.js"), privatePacks().catch(() => [])])
    .then(([catalog, reference, packs]) => {
      const spellReferenceData = reference.default;
      const spellReferences = spellReferenceData?.spells && typeof spellReferenceData.spells === "object"
        ? spellReferenceData.spells
        : {};
      const texts = privateSpellTexts(packs);
      return catalog.getSpellCatalog()
        .map((spell) => {
          const base = spellReferences[spell.id] || spell.italianReference || null;
          const text = base?.privateSource ? texts.get(base.privateTextId || spell.id) : null;
          return {
            ...spell,
            italianReference: text ? { ...base, description: text.description, higherLevels: text.higherLevels } : base,
          };
        })
        .sort((a, b) => spellLabel(a).localeCompare(spellLabel(b), "it"));
    });
}

function closeReferencePopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function spellLabel(spell) {
  return spell.italianReference?.name || spell.displayName || spell.name || spell.id || "Incantesimo";
}

function spellBadgeText(spell) {
  const reference = spell.italianReference;
  const levelValue = Number(reference?.level ?? spell.level);
  const level = levelValue === 0 ? "Trucchetto" : `Livello ${levelValue}`;
  return [
    level,
    reference?.school || null,
    reference?.ritual ? "Rituale" : null,
    reference?.castingTime ? `Tempo: ${reference.castingTime}` : null,
    reference?.range ? `Gittata: ${reference.range}` : null,
    reference?.components ? `Componenti: ${reference.components}` : null,
    reference?.duration ? `Durata: ${reference.duration}` : "Durata non indicata",
    reference?.concentration ? "Concentrazione" : null,
  ].filter(Boolean);
}

function spellSearchText(spell) {
  const reference = spell.italianReference;
  return [
    spell.id,
    spell.name,
    spell.displayName,
    reference?.name,
    reference?.description,
    ...(spell.aliases || []),
  ].filter(Boolean).join(" ");
}

OBR.onReady(() => {
  const results = document.getElementById("results");
  const detail = document.getElementById("detail");
  const search = document.getElementById("search");
  const sourceFilter = document.getElementById("sources");
  const close = document.getElementById("close");
  const panel = document.querySelector(".panel");
  const packsToggle = document.getElementById("packsToggle");
  const packsPanel = document.getElementById("packs");
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  if (!results || !detail || !search) return;

  // The private packs this browser keeps (privatePackStore.js) and the state of the Pacchetti panel.
  const packStore = createPrivatePackStore();
  const packs = { open: false, list: [], busy: false, message: { text: "", tone: "" } };

  const spells = { status: "idle", list: [] };
  const params = new URLSearchParams(window.location.search);
  let activeTab = TABS.has(params.get("tab")) ? params.get("tab") : "conditions";
  let activeEntry = CONDITION_REFERENCE[0] || null;
  // The Rules tab keeps its own selection, the topics opened in the tree and the entries left through "Vedi anche".
  // merged is the SRD compendium (srd) with the rules of the imported packs; catalog is merged without the sources the
  // GM hid (hiddenSources), and the index and the tree follow it.
  const rules = {
    status: "idle", srd: null, merged: null, catalog: null, index: null, tree: [], active: null, history: [], expanded: new Set(),
    hiddenSources: readHiddenSources(),
  };
  let pendingRuleId = activeTab === "rules" ? params.get("entry") || "" : "";
  let searchTimer = null;

  const currentEntries = () => activeTab === "conditions" ? CONDITION_REFERENCE : spells.list;
  const entryLabel = (entry) => activeTab === "conditions" ? entry.name : spellLabel(entry);

  function renderDetail(entry) {
    detail.replaceChildren();
    if (!entry) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Seleziona una voce.";
      detail.appendChild(empty);
      return;
    }

    const title = document.createElement("h2");
    title.textContent = entryLabel(entry);
    detail.appendChild(title);

    if (activeTab === "conditions") {
      const summary = document.createElement("p");
      summary.className = "summary";
      summary.textContent = entry.summary;
      detail.appendChild(summary);
      const sectionTitle = document.createElement("div");
      sectionTitle.className = "section-title";
      sectionTitle.textContent = "EFFETTI";
      detail.appendChild(sectionTitle);
      detail.appendChild(rulesTextBlock(entry.details, { className: "text" }));
      const source = document.createElement("p");
      source.className = "source-note";
      source.textContent = `${REFERENCE_SOURCE.label} · Appendice A · ${REFERENCE_SOURCE.license}`;
      detail.appendChild(source);
      return;
    }

    const reference = entry.italianReference;
    if (!reference) {
      const sectionTitle = document.createElement("div");
      sectionTitle.className = "section-title";
      sectionTitle.textContent = "DATI NON DISPONIBILI NELLO SRD 5.1";
      detail.appendChild(sectionTitle);
      const text = document.createElement("p");
      text.className = "text";
      text.textContent = "Questa voce appartiene al catalogo locale del tracker e non è presente nell'SRD italiano importato.";
      detail.appendChild(text);
      return;
    }

    const badges = document.createElement("div");
    badges.className = "badges";
    for (const value of spellBadgeText(entry)) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = value;
      badges.appendChild(badge);
    }
    detail.appendChild(badges);

    const sectionTitle = document.createElement("div");
    sectionTitle.className = "section-title";
    sectionTitle.textContent = "DESCRIZIONE";
    detail.appendChild(sectionTitle);
    const description = reference.description
      || (reference.privateSource ? privateTextMissingNote(reference.privateSource) : "Descrizione non disponibile.");
    detail.appendChild(rulesTextBlock(description, { className: "text" }));

    if (reference.higherLevels) {
      const higherTitle = document.createElement("div");
      higherTitle.className = "section-title";
      higherTitle.textContent = "AI LIVELLI SUPERIORI";
      detail.appendChild(higherTitle);
      detail.appendChild(rulesTextBlock(reference.higherLevels.replace(/^Ai livelli superiori\.\s*/i, ""), { className: "text" }));
    }

    const source = document.createElement("p");
    source.className = "source-note";
    if (reference.sourceTitle) {
      const pages = reference.sourcePageRange
        ? `pp. ${reference.sourcePageRange.from}–${reference.sourcePageRange.to}`
        : "pagina non indicata";
      source.textContent = `${reference.sourceTitle} · ${pages} · pacchetto privato`;
    } else {
      source.textContent = `${REFERENCE_SOURCE.label} · p. ${reference.sourcePage} · ${REFERENCE_SOURCE.license}`;
    }
    detail.appendChild(source);
  }

  function emptyNote(text) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  // The results column of a tab whose data is still downloading, or failed to: a note, and a retry after a failure.
  function renderLoadState(state, { loading, failed }) {
    results.replaceChildren();
    if (state.status !== "error") {
      results.appendChild(emptyNote(loading));
      return;
    }
    const note = emptyNote(failed);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Riprova";
    retry.addEventListener("click", () => {
      state.status = "idle";
      renderResults();
    });
    note.append(document.createElement("br"), retry);
    results.appendChild(note);
  }

  function ensureSpells() {
    if (spells.status !== "idle") return;
    spells.status = "loading";
    loadSpells(() => packStore.all())
      .then((list) => {
        spells.list = list;
        spells.status = "ready";
      })
      .catch((error) => {
        console.warn("[reference-modal] incantesimi:", error?.message || error);
        spells.status = "error";
      })
      .finally(() => {
        if (activeTab === "spells") renderResults();
      });
  }

  // Rebuilds the index and the tree; the selection and the "Indietro" stack follow their entries, or drop the ones
  // a removed pack took away.
  function setRulesCatalog(merged) {
    rules.merged = merged;
    const shown = new Set(rulesSourceCounts(merged).map((source) => source.id));
    // A hidden source that no longer has entries (its pack removed) stops hiding; at least one source stays shown.
    for (const id of rules.hiddenSources) if (!shown.has(id)) rules.hiddenSources.delete(id);
    if ([...shown].every((id) => rules.hiddenSources.has(id))) rules.hiddenSources.clear();
    const catalog = filterRulesCatalogBySource(merged, rules.hiddenSources);
    rules.catalog = catalog;
    rules.index = buildRulesIndex(catalog);
    rules.tree = rulesTree(catalog);
    rules.active = rules.active ? rules.index.byId.get(rules.active.id) || null : null;
    rules.history = rules.history.map((entry) => rules.index.byId.get(entry.id)).filter(Boolean);
  }

  function refreshRulesFromPacks() {
    if (rules.status !== "ready") return;
    void packStore.all().then((list) => {
      setRulesCatalog(mergeRulesCatalogs(rules.srd, list));
      if (packs.open) renderPacks();
      if (activeTab === "rules" && !packs.open) renderResults();
    });
  }

  function resetSpells() {
    if (spells.status !== "ready") return;
    spells.status = "idle";
    spells.list = [];
  }

  const sourceOf = (entry) => rules.catalog?.sources?.find((source) => source.id === entry.source) || SRD_SOURCE;

  function ensureRules() {
    if (rules.status !== "idle") return;
    rules.status = "loading";
    let linked = false;
    Promise.all([loadRulesCatalog(), packStore.all()])
      .then(([srd, list]) => {
        rules.srd = srd;
        setRulesCatalog(mergeRulesCatalogs(srd, list));
        rules.status = "ready";
        if (pendingRuleId) {
          const entry = rules.index.byId.get(pendingRuleId);
          if (entry) {
            rules.active = entry;
            rules.expanded.add(entry.topic);
            linked = true;
          } else if (activeTab === "rules") {
            search.value = pendingRuleId;
          }
          pendingRuleId = "";
        }
      })
      .catch((error) => {
        console.warn("[reference-modal] regole:", error?.message || error);
        rules.status = "error";
      })
      .finally(() => {
        if (activeTab !== "rules") return;
        renderResults();
        if (linked) results.querySelector('.result[aria-pressed="true"]')?.scrollIntoView({ block: "center" });
      });
  }

  function showRule(entry, { fromRelated = false } = {}) {
    if (fromRelated && rules.active && rules.active !== entry) rules.history.push(rules.active);
    if (!fromRelated) rules.history = [];
    rules.active = entry;
    rules.expanded.add(entry.topic);
    renderResults();
    detail.scrollTop = 0;
  }

  function showTopic(topicId) {
    search.value = "";
    rules.expanded.add(topicId);
    renderResults();
    results.querySelector(`[data-topic="${CSS.escape(topicId)}"]`)?.scrollIntoView({ block: "start" });
  }

  function showCondition(condition) {
    setTab("conditions");
    activeEntry = condition;
    renderResults();
  }

  function ruleButton(entry, path = []) {
    const button = document.createElement("button");
    button.className = "result";
    button.type = "button";
    button.textContent = entry.name;
    button.title = entry.name;
    button.setAttribute("aria-pressed", String(entry === rules.active));
    // The badge of a pack's entry (XGE, TCE…) and, in the search results, the path.
    const metaText = [entry.source !== SRD_SOURCE.id ? sourceOf(entry).badge : "", path.join(" › ")].filter(Boolean).join(" · ");
    if (metaText) {
      const meta = document.createElement("small");
      meta.textContent = metaText;
      button.appendChild(meta);
    }
    button.addEventListener("click", () => showRule(entry));
    return button;
  }

  function renderRuleDetail(entry) {
    detail.replaceChildren();
    if (!entry) {
      detail.appendChild(emptyNote("Scegli un argomento o cerca una regola."));
      return;
    }

    if (rules.history.length) {
      const back = document.createElement("button");
      back.className = "back";
      back.type = "button";
      back.textContent = "‹ Indietro";
      back.addEventListener("click", () => {
        rules.active = rules.history.pop();
        renderResults();
        detail.scrollTop = 0;
      });
      detail.appendChild(back);
    }

    const crumbs = document.createElement("nav");
    crumbs.className = "crumbs";
    crumbs.setAttribute("aria-label", "Percorso");
    const [topicName, sectionName] = entryPath(rules.catalog, entry);
    const topic = document.createElement("button");
    topic.className = "crumb";
    topic.type = "button";
    topic.textContent = topicName;
    topic.title = "Mostra l'argomento";
    topic.addEventListener("click", () => showTopic(entry.topic));
    crumbs.appendChild(topic);
    if (sectionName) {
      const section = document.createElement("span");
      section.textContent = `› ${sectionName}`;
      crumbs.appendChild(section);
    }
    detail.appendChild(crumbs);

    const title = document.createElement("h2");
    title.textContent = entry.name;
    detail.appendChild(title);

    const entrySource = sourceOf(entry);
    if (entry.optional || entrySource.id !== SRD_SOURCE.id) {
      const badges = document.createElement("div");
      badges.className = "badges";
      if (entrySource.id !== SRD_SOURCE.id) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = entrySource.badge;
        badge.title = entrySource.title;
        badges.appendChild(badge);
      }
      if (entry.optional) {
        const badge = document.createElement("span");
        badge.className = "badge optional";
        badge.textContent = "Regola opzionale";
        badges.appendChild(badge);
      }
      detail.appendChild(badges);
    }

    detail.appendChild(rulesTextBlock(entry.text, { className: "text" }));

    const related = resolveRelated(rules.catalog, entry, CONDITION_REFERENCE);
    if (related.length) {
      const relatedTitle = document.createElement("div");
      relatedTitle.className = "section-title";
      relatedTitle.textContent = "VEDI ANCHE";
      detail.appendChild(relatedTitle);
      const chips = document.createElement("div");
      chips.className = "related";
      for (const item of related) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.type = "button";
        if (item.kind === "condition") {
          chip.textContent = item.condition.name;
          chip.title = "Condizione";
          chip.addEventListener("click", () => showCondition(item.condition));
        } else {
          chip.textContent = item.entry.name;
          chip.addEventListener("click", () => showRule(item.entry, { fromRelated: true }));
        }
        chips.appendChild(chip);
      }
      detail.appendChild(chips);
    }

    const source = document.createElement("p");
    source.className = "source-note";
    source.textContent = entrySource.id === SRD_SOURCE.id
      ? `${REFERENCE_SOURCE.label} · p. ${entry.page} · ${REFERENCE_SOURCE.license}`
      : `${entrySource.title} · p. ${entry.page} · pacchetto privato`;
    detail.appendChild(source);
  }

  // The Pacchetti panel: the packs this browser keeps, Importa pacchetto… and Rimuovi. It takes the place of the tabs.
  function packRow(info) {
    const row = document.createElement("div");
    row.className = "pack-row";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = info.badge;
    const text = document.createElement("span");
    text.className = "pack-info";
    const title = document.createElement("strong");
    title.textContent = info.title;
    const meta = document.createElement("small");
    const imported = info.importedAt ? new Date(info.importedAt).toLocaleDateString("it-IT") : "";
    meta.textContent = [
      privatePackContentsLabel(info),
      info.bytes ? fiveToolsArchiveSizeLabel(info.bytes) : "",
      imported ? `importato il ${imported}` : "",
      info.persisted ? "" : "solo per questa sessione",
    ].filter(Boolean).join(" · ");
    text.append(title, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Rimuovi";
    remove.disabled = packs.busy;
    remove.dataset.packRemove = info.id;
    remove.addEventListener("click", () => void removePack(info));
    row.append(badge, text, remove);
    return row;
  }

  function renderPacks() {
    if (!packsPanel) return;
    const intro = document.createElement("p");
    intro.className = "packs-intro";
    intro.textContent = "I pacchetti privati aggiungono i testi dei manuali che non sono nell'SRD. Li generi dai tuoi PDF e restano solo in questo browser: non vanno nella stanza né agli altri giocatori.";
    const list = document.createElement("div");
    list.className = "pack-list";
    if (packs.list.length) list.append(...packs.list.map(packRow));
    else list.appendChild(emptyNote("Nessun pacchetto importato."));
    const actions = document.createElement("div");
    actions.className = "pack-actions";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.multiple = true;
    file.hidden = true;
    file.addEventListener("change", () => void importPacks([...file.files]));
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Importa pacchetto…";
    add.disabled = packs.busy;
    add.addEventListener("click", () => file.click());
    actions.append(add, file);
    const nodes = [intro, list, actions];
    // A pack entry whose id is taken, or whose topic is unknown, is left out (privatePackCore.js): said, not silent
    // (lot L19).
    const skipped = Number(rules.merged?.skipped) || 0;
    if (skipped > 0) {
      const note = document.createElement("p");
      note.className = "packs-message";
      note.textContent = skipped === 1
        ? "1 voce dei pacchetti non è mostrata: il suo id è già usato o il suo argomento non esiste."
        : `${skipped} voci dei pacchetti non sono mostrate: il loro id è già usato o il loro argomento non esiste.`;
      nodes.push(note);
    }
    if (packs.message.text) {
      const message = document.createElement("p");
      message.className = `packs-message ${packs.message.tone}`.trim();
      message.setAttribute("role", "status");
      message.textContent = packs.message.text;
      nodes.push(message);
    }
    packsPanel.replaceChildren(...nodes);
  }

  async function reloadPacks() {
    packs.list = await packStore.list();
    renderPacks();
  }

  async function importPacks(files) {
    if (!files.length) return;
    packs.busy = true;
    renderPacks();
    const done = [];
    const failed = [];
    for (const file of files) {
      const { pack, error } = parsePrivatePack(await file.text().catch(() => ""));
      if (error) {
        failed.push(`${file.name}: ${error}`);
        continue;
      }
      const saved = await packStore.put(pack, { bytes: file.size });
      done.push(saved.persisted ? pack.title.trim() : `${pack.title.trim()} (solo per questa sessione: ${saved.reason})`);
    }
    packs.busy = false;
    packs.message = failed.length
      ? { text: [done.length ? `Importati: ${done.join(", ")}.` : "", ...failed].filter(Boolean).join(" "), tone: "error" }
      : { text: `Importati: ${done.join(", ")}.`, tone: "ok" };
    await reloadPacks();
    refreshRulesFromPacks();
    resetSpells();
  }

  async function removePack(info) {
    packs.busy = true;
    renderPacks();
    await packStore.remove(info.id);
    packs.busy = false;
    packs.message = { text: `Rimosso: ${info.title}.`, tone: "ok" };
    await reloadPacks();
    refreshRulesFromPacks();
    resetSpells();
  }

  function setPacksOpen(open) {
    packs.open = open;
    panel?.classList.toggle("packs-open", open);
    if (packsPanel) packsPanel.hidden = !open;
    packsToggle?.setAttribute("aria-pressed", String(open));
    if (packsToggle) packsToggle.textContent = open ? "‹ Enciclopedia" : "Pacchetti";
    if (open) {
      packs.message = { text: "", tone: "" };
      void reloadPacks();
    } else {
      renderResults();
    }
  }

  // The source chips under the search: shown in the Rules tab when a pack adds rules to the SRD's, one per source with
  // its count; a click hides or shows that source's entries, never the last one shown.
  function renderSources() {
    const counts = activeTab === "rules" && rules.status === "ready" ? rulesSourceCounts(rules.merged) : [];
    sourceFilter.hidden = counts.length < 2;
    if (sourceFilter.hidden) {
      sourceFilter.replaceChildren();
      return;
    }
    sourceFilter.replaceChildren(...counts.map((source) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "source-chip";
      chip.dataset.source = source.id;
      chip.textContent = `${source.badge} · ${source.count}`;
      chip.title = source.title;
      const shown = !rules.hiddenSources.has(source.id);
      chip.setAttribute("aria-pressed", String(shown));
      chip.addEventListener("click", () => {
        if (shown && counts.every((other) => other.id === source.id || rules.hiddenSources.has(other.id))) return;
        if (shown) rules.hiddenSources.add(source.id);
        else rules.hiddenSources.delete(source.id);
        saveHiddenSources(rules.hiddenSources);
        setRulesCatalog(rules.merged);
        renderResults();
      });
      return chip;
    }));
  }

  function renderRules() {
    if (rules.status === "idle") ensureRules();
    if (rules.status !== "ready") {
      renderLoadState(rules, { loading: "Caricamento delle regole…", failed: "Impossibile caricare le regole." });
      renderRuleDetail(null);
      return;
    }
    results.replaceChildren();

    if (search.value.trim()) {
      const { results: found, total } = searchRules(rules.index, search.value);
      if (!found.length) {
        results.appendChild(emptyNote("Nessun risultato."));
      } else {
        if (!found.includes(rules.active)) rules.active = found[0];
        for (const entry of found) results.appendChild(ruleButton(entry, entryPath(rules.catalog, entry)));
        if (total > found.length) {
          const more = document.createElement("div");
          more.className = "more";
          more.textContent = `Altri ${total - found.length} risultati: aggiungi una parola alla ricerca.`;
          results.appendChild(more);
        }
      }
      renderRuleDetail(rules.active);
      return;
    }

    for (const { topic, sections } of rules.tree) {
      // A topic whose entries the source filter hides all is left out.
      if (!sections.length) continue;
      const expanded = rules.expanded.has(topic.id);
      const header = document.createElement("button");
      header.className = "topic";
      header.type = "button";
      header.dataset.topic = topic.id;
      header.textContent = topic.name;
      header.setAttribute("aria-expanded", String(expanded));
      header.addEventListener("click", () => {
        if (rules.expanded.has(topic.id)) rules.expanded.delete(topic.id);
        else rules.expanded.add(topic.id);
        renderResults();
      });
      results.appendChild(header);
      if (!expanded) continue;
      for (const { section, entries } of sections) {
        if (section) {
          const label = document.createElement("div");
          label.className = "section-label";
          label.textContent = section.name;
          results.appendChild(label);
        }
        for (const entry of entries) results.appendChild(ruleButton(entry));
      }
    }
    renderRuleDetail(rules.active);
  }

  function renderResults() {
    renderSources();
    if (activeTab === "rules") {
      renderRules();
      return;
    }
    if (activeTab === "spells") {
      if (spells.status === "idle") ensureSpells();
      if (spells.status !== "ready") {
        renderLoadState(spells, { loading: "Caricamento degli incantesimi…", failed: "Impossibile caricare gli incantesimi." });
        renderDetail(null);
        return;
      }
    }
    const query = normalize(search.value);
    const entries = currentEntries().filter((entry) => normalize(
      activeTab === "conditions" ? `${entry.name} ${entry.summary}` : spellSearchText(entry),
    ).includes(query));
    results.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nessun risultato.";
      results.appendChild(empty);
      renderDetail(null);
      return;
    }
    if (!entries.includes(activeEntry)) activeEntry = entries[0];
    for (const entry of entries) {
      const button = document.createElement("button");
      button.className = "result";
      button.type = "button";
      button.textContent = entryLabel(entry);
      button.setAttribute("aria-pressed", String(entry === activeEntry));
      if (activeTab === "spells") {
        const meta = document.createElement("small");
        const level = Number(entry.italianReference?.level ?? entry.level);
        meta.textContent = level === 0 ? "Trucchetto" : `Livello ${level}`;
        button.appendChild(meta);
      }
      button.addEventListener("click", () => {
        activeEntry = entry;
        renderResults();
      });
      results.appendChild(button);
    }
    renderDetail(activeEntry);
  }

  function setTab(tab) {
    activeTab = tab;
    if (tab !== "rules") activeEntry = currentEntries()[0] || null;
    clearTimeout(searchTimer);
    for (const button of tabs) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
    search.value = "";
    renderResults();
  }

  const refreshSearchResults = () => {
    clearTimeout(searchTimer);
    if (activeTab === "rules") searchTimer = setTimeout(renderResults, RULES_SEARCH_DELAY_MS);
    else renderResults();
  };
  for (const tab of tabs) tab.addEventListener("click", () => setTab(tab.dataset.tab));
  search.addEventListener("input", refreshSearchResults);
  search.addEventListener("search", refreshSearchResults);
  search.addEventListener("keyup", refreshSearchResults);
  search.addEventListener("compositionend", refreshSearchResults);
  close?.addEventListener("click", closeReferencePopover);
  packsToggle?.addEventListener("click", () => setPacksOpen(!packs.open));
  for (const tab of tabs) {
    const active = tab.dataset.tab === activeTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  // A rules link names an entry by id, opened once the compendium is loaded; the other tabs search its text.
  search.value = activeTab === "rules" ? "" : params.get("entry") || "";
  renderResults();
});
