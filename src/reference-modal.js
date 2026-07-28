import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { CONDITION_REFERENCE, REFERENCE_SOURCE } from "./referenceData.js";
import { getSpellCatalog } from "./spells-srd.js";
import spellReferenceData from "./spell-reference-it.json" with { type: "json" };

const MODAL_ID = `${ID}/reference-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;

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
  let activeTab = params.get("tab") === "spells" ? "spells" : "conditions";
  let activeEntry = CONDITION_REFERENCE[0] || null;

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
      const text = document.createElement("p");
      text.className = "text";
      text.textContent = entry.details;
      detail.appendChild(text);
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
    const text = document.createElement("p");
    text.className = "text";
    text.textContent = reference.description || "Descrizione non disponibile.";
    detail.appendChild(text);

    if (reference.higherLevels) {
      const higherTitle = document.createElement("div");
      higherTitle.className = "section-title";
      higherTitle.textContent = "AI LIVELLI SUPERIORI";
      detail.appendChild(higherTitle);
      const higher = document.createElement("p");
      higher.className = "text";
      higher.textContent = reference.higherLevels.replace(/^Ai livelli superiori\.\s*/i, "");
      detail.appendChild(higher);
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

  function renderResults() {
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
    activeEntry = currentEntries()[0] || null;
    for (const button of tabs) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
    search.value = "";
    renderResults();
  }

  const refreshSearchResults = () => renderResults();
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
  search.value = params.get("entry") || "";
  renderResults();
});
