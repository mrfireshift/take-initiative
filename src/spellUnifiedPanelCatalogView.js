import {
  createButton,
  createNode,
} from "./spellUnifiedPanelDom.js";

const FILTER_DEFINITIONS = Object.freeze([
  {
    id: "concentration",
    label: "Concentrazione",
    matches: (entry) => entry.flags?.concentration === true,
  },
  {
    id: "automated",
    label: "Automazioni",
    matches: (entry) => entry.flags?.automated === true,
  },
  {
    id: "targeting",
    label: "Bersagli",
    matches: (entry) => entry.flags?.targeting === true,
  },
  {
    id: "placement",
    label: "Area o pedina",
    matches: (entry) => entry.flags?.placement === true,
  },
  {
    id: "active",
    label: "Azioni attive",
    matches: (entry) => entry.flags?.active === true,
  },
]);

function normalizedEntry(entry) {
  return {
    key: String(entry?.key ?? entry?.value ?? "").trim(),
    label: String(entry?.label ?? entry?.name ?? "").trim(),
    level: Number.isFinite(Number(entry?.level)) ? Number(entry.level) : null,
    source: String(entry?.source ?? "").trim(),
    flags: { ...(entry?.flags || {}) },
  };
}

export function dedupeCatalogEntries(entries = []) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const normalized = normalizedEntry(entry);
    if (!normalized.key || seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    result.push(normalized);
  }
  return result;
}

function sortCatalogEntries(entries = []) {
  return [...entries].sort((first, second) => (
    first.label.localeCompare(second.label, "it", { sensitivity: "base" })
      || first.key.localeCompare(second.key, "it", { sensitivity: "base" })
  ));
}

export function buildCatalogFilters(entries = [], selectedFilter = "all") {
  const normalized = dedupeCatalogEntries(entries);
  const definitions = [
    {
      id: "all",
      label: "Tutti",
      matches: () => true,
    },
    ...FILTER_DEFINITIONS.filter((definition) =>
      normalized.some(definition.matches)),
  ];
  const active = definitions.some((definition) => definition.id === selectedFilter)
    ? selectedFilter
    : "all";
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    count: normalized.filter(definition.matches).length,
    active: definition.id === active,
  }));
}

export function filterCatalogEntries(entries = [], {
  query = "",
  filter = "all",
} = {}) {
  const normalized = dedupeCatalogEntries(entries);
  const search = String(query || "").trim().toLocaleLowerCase("it");
  const definition = FILTER_DEFINITIONS.find((candidate) => candidate.id === filter);
  return normalized.filter((entry) => {
    const matchesQuery = !search
      || entry.label.toLocaleLowerCase("it").includes(search)
      || entry.source.toLocaleLowerCase("it").includes(search);
    return matchesQuery && (!definition || definition.matches(entry));
  });
}

export function buildCatalogViewModel({
  entries = [],
  query = "",
  filter = "all",
  selectedKey = "",
  expanded = true,
  activeIndex = 0,
  loading = false,
} = {}) {
  const allEntries = sortCatalogEntries(dedupeCatalogEntries(entries));
  const visibleEntries = filterCatalogEntries(allEntries, { query, filter });
  const selectedEntry = allEntries.find((entry) => entry.key === selectedKey) || null;
  const safeIndex = visibleEntries.length
    ? Math.min(Math.max(Number(activeIndex) || 0, 0), visibleEntries.length - 1)
    : -1;
  return {
    entries: allEntries,
    visibleEntries: visibleEntries.map((entry, index) => ({
      ...entry,
      selected: entry.key === selectedKey,
      active: index === safeIndex,
    })),
    filters: buildCatalogFilters(allEntries, filter),
    query: String(query || ""),
    selectedLabel: selectedEntry?.label || "",
    selectedConcentration: selectedEntry?.flags?.concentration === true,
    filter,
    selectedKey: String(selectedKey || ""),
    expanded: expanded !== false,
    activeIndex: safeIndex,
    loading: loading === true,
  };
}

function optionId(index) {
  return `spell-catalog-option-${index}`;
}

export function renderSpellCatalogCombobox(
  documentRef,
  model,
  callbacks = {},
) {
  const section = createNode(documentRef, "section", {
    className: "unified-section unified-catalog",
    attributes: { "aria-labelledby": "unified-catalog-heading" },
  });
  section.append(createNode(documentRef, "div", {
    className: "unified-section__heading",
    children: [
      createNode(documentRef, "h2", {
        id: "unified-catalog-heading",
        text: "Incantesimo",
      }),
    ],
  }));

  const searchShell = createNode(documentRef, "div", {
    className: `unified-combobox-shell${model.selectedConcentration ? " has-concentration" : ""}`,
  });
  const input = createNode(documentRef, "input", {
    id: "spell-unified-catalog-input",
    className: "unified-combobox",
    attributes: {
      type: "search",
      role: "combobox",
      value: model.expanded ? model.query : (model.query || model.selectedLabel || ""),
      "aria-label": "Cerca o seleziona un incantesimo",
      placeholder: "Cerca un incantesimo",
      autocomplete: "off",
      "aria-autocomplete": "list",
      "aria-controls": "spell-unified-catalog-list",
      "aria-expanded": model.expanded,
      "aria-activedescendant": model.expanded && model.activeIndex >= 0
        ? optionId(model.activeIndex)
        : "",
    },
  });
  input.addEventListener("input", (event) => callbacks.onQueryChange?.(event.target.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      callbacks.onActiveIndexChange?.(Math.min(
        Math.max(model.activeIndex + 1, 0),
        model.visibleEntries.length - 1,
      ));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      callbacks.onActiveIndexChange?.(Math.max(model.activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = model.visibleEntries[model.activeIndex];
      if (active) callbacks.onSelect?.(active.key);
    } else if (event.key === "Escape") {
      event.preventDefault();
      callbacks.onEscape?.();
    }
  });
  input.addEventListener("focus", () => callbacks.onFocus?.());
  searchShell.append(input);
  if (model.selectedConcentration) {
    searchShell.append(createNode(documentRef, "span", {
      className: "unified-catalog-concentration-badge",
      text: "C",
      attributes: {
        role: "img",
        title: "Incantesimo a concentrazione",
        "aria-label": "Incantesimo a concentrazione",
      },
    }));
  }

  const toggle = createButton(documentRef, {
    label: model.expanded ? "▴" : "▾",
    className: "unified-combobox-toggle",
    ariaLabel: model.expanded ? "Chiudi catalogo" : "Apri catalogo",
    attributes: { "aria-controls": "spell-unified-catalog-list" },
  });
  toggle.addEventListener("click", () => callbacks.onToggle?.());
  searchShell.append(toggle);
  const catalogControls = createNode(documentRef, "div", {
    className: "unified-catalog-controls",
  });
  catalogControls.append(searchShell);
  const reference = createButton(documentRef, {
    label: "",
    className: "unified-reference-button",
    disabled: !model.selectedKey,
    ariaLabel: model.selectedKey
      ? `Apri il riferimento di ${model.selectedLabel || "questo incantesimo"}`
      : "Riferimento incantesimo non disponibile",
    attributes: {
      "data-spell-reference": model.selectedKey || "",
      title: model.selectedKey
        ? `Apri il riferimento di ${model.selectedLabel || "questo incantesimo"}`
        : "Seleziona un incantesimo per aprire il riferimento",
    },
  });
  reference.append(createNode(documentRef, "img", {
    className: "unified-reference-button__icon",
    attributes: {
      src: "/reference.svg",
      alt: "",
      "aria-hidden": "true",
    },
  }));
  reference.addEventListener("click", () => callbacks.onReference?.(model.selectedKey));
  catalogControls.append(reference);
  section.append(catalogControls);

  const list = createNode(documentRef, "div", {
    id: "spell-unified-catalog-list",
    className: "unified-catalog-list",
    attributes: { role: "listbox", "aria-label": "Incantesimi disponibili" },
  });
  list.hidden = !model.expanded;
  for (const [index, entry] of (model.loading ? [] : model.visibleEntries).entries()) {
    const option = createNode(documentRef, "div", {
      id: optionId(index),
      className: "unified-catalog-option",
      attributes: {
        role: "option",
        "aria-selected": entry.selected,
        "data-catalog-key": entry.key,
        tabindex: "-1",
      },
      children: [
        createNode(documentRef, "span", {
          className: "unified-catalog-option__main",
          children: [
            createNode(documentRef, "strong", { text: entry.label }),
            createNode(documentRef, "span", {
              className: "unified-catalog-option__meta",
              text: [
                entry.level === null ? "" : `${entry.level}° livello`,
                entry.flags?.concentration ? "Concentrazione" : "",
              ].filter(Boolean).join(" · "),
            }),
          ],
        }),
        createNode(documentRef, "span", {
          className: "unified-catalog-option__signals",
          text: [
            entry.flags?.targeting ? "TS" : "",
            entry.flags?.placement ? "area" : "",
            entry.flags?.active ? "azione" : "",
          ].filter(Boolean).join(" · "),
        }),
      ],
    });
    if (entry.active) option.dataset.active = "true";
    option.addEventListener("click", () => callbacks.onSelect?.(entry.key));
    list.append(option);
  }
  if (model.loading) {
    list.append(createNode(documentRef, "div", {
      className: "unified-empty-state",
      text: "Caricamento catalogo…",
      attributes: { role: "status" },
    }));
  } else if (!model.visibleEntries.length) {
    list.append(createNode(documentRef, "div", {
      className: "unified-empty-state",
      text: "Nessun incantesimo corrisponde ai filtri.",
    }));
  }
  if (model.loading) {
    section.append(createNode(documentRef, "div", {
      className: "unified-inline-feedback",
      text: "Caricamento del contesto della scena…",
      attributes: { role: "status", "aria-live": "polite" },
    }));
  }
  section.append(list);
  return section;
}
