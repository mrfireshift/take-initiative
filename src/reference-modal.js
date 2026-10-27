import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { CONDITION_REFERENCE, REFERENCE_SOURCE } from "./referenceData.js";
import { buildRulesIndex, entryPath, resolveRelated, rulesTree, searchRules } from "./rulesReferenceCore.js";
import { rulesTextBlock } from "./rulesTextView.js";
import { getSpellCatalog } from "./spells-srd.js";
import spellReferenceData from "./spell-reference-it.json" with { type: "json" };

const MODAL_ID = `${ID}/reference-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const TABS = new Set(["conditions", "spells", "rules"]);
// The rules tab searches a few hundred texts: it waits for a pause in typing instead of running on every key.
const RULES_SEARCH_DELAY_MS = 120;

// The SRD rules compendium is a chunk of its own, downloaded the first time the Rules tab opens.
function loadRulesCatalog() {
  return import("./rules-reference-it.json").then((module) => module.default);
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
  const close = document.getElementById("close");
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  if (!results || !detail || !search) return;

  const spellReferences = spellReferenceData?.spells && typeof spellReferenceData.spells === "object"
    ? spellReferenceData.spells
    : {};
  const spells = getSpellCatalog()
    .map((spell) => ({
      ...spell,
      italianReference: spellReferences[spell.id] || spell.italianReference || null,
    }))
    .sort((a, b) => spellLabel(a).localeCompare(spellLabel(b), "it"));
  const params = new URLSearchParams(window.location.search);
  let activeTab = TABS.has(params.get("tab")) ? params.get("tab") : "conditions";
  let activeEntry = CONDITION_REFERENCE[0] || null;
  // The Rules tab keeps its own selection, the topics opened in the tree and the entries left through "Vedi anche".
  const rules = { status: "idle", catalog: null, index: null, tree: [], active: null, history: [], expanded: new Set() };
  let pendingRuleId = activeTab === "rules" ? params.get("entry") || "" : "";
  let searchTimer = null;

  const currentEntries = () => activeTab === "conditions" ? CONDITION_REFERENCE : spells;
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
    detail.appendChild(rulesTextBlock(reference.description || "Descrizione non disponibile.", { className: "text" }));

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
      source.textContent = `${reference.sourceTitle} · ${pages} · catalogo privato`;
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

  function ensureRules() {
    if (rules.status !== "idle") return;
    rules.status = "loading";
    let linked = false;
    loadRulesCatalog()
      .then((catalog) => {
        rules.catalog = catalog;
        rules.index = buildRulesIndex(catalog);
        rules.tree = rulesTree(catalog);
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
    if (path.length) {
      const meta = document.createElement("small");
      meta.textContent = path.join(" › ");
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

    if (entry.optional) {
      const badges = document.createElement("div");
      badges.className = "badges";
      const badge = document.createElement("span");
      badge.className = "badge optional";
      badge.textContent = "Regola opzionale";
      badges.appendChild(badge);
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
    source.textContent = `${REFERENCE_SOURCE.label} · p. ${entry.page} · ${REFERENCE_SOURCE.license}`;
    detail.appendChild(source);
  }

  function renderRules() {
    results.replaceChildren();
    if (rules.status === "idle") ensureRules();
    if (rules.status === "loading") {
      results.appendChild(emptyNote("Caricamento delle regole…"));
      renderRuleDetail(null);
      return;
    }
    if (rules.status === "error") {
      const failed = emptyNote("Impossibile caricare le regole.");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Riprova";
      retry.addEventListener("click", () => {
        rules.status = "idle";
        renderResults();
      });
      failed.append(document.createElement("br"), retry);
      results.appendChild(failed);
      renderRuleDetail(null);
      return;
    }

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
    if (activeTab === "rules") {
      renderRules();
      return;
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
  for (const tab of tabs) {
    const active = tab.dataset.tab === activeTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  // A rules link names an entry by id, opened once the compendium is loaded; the other tabs search its text.
  search.value = activeTab === "rules" ? "" : params.get("entry") || "";
  renderResults();
});
