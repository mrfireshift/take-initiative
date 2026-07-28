const SPELL_CATALOG_FILTERS = Object.freeze([
  Object.freeze({ value: "all", label: "Tutti" }),
  Object.freeze({ value: "concentration", label: "Concentrazione" }),
  Object.freeze({ value: "area", label: "Area/TS" }),
  Object.freeze({ value: "automated", label: "Effetti" }),
]);

export function buildSpellCatalogMenuPlan({
  entries = [],
  query = "",
  activeFilter = "all",
} = {}) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("it");
  const matches = entries.filter((entry) => {
    const matchesFilter = ({
      concentration: entry.concentration,
      area: entry.area,
      automated: entry.automated,
    })[activeFilter] ?? true;
    return matchesFilter
      && (!normalizedQuery || entry.label.toLocaleLowerCase("it").includes(normalizedQuery));
  });
  const entriesByLevel = new Map();
  for (const entry of matches) {
    const level = Math.max(0, Math.floor(Number(entry.level) || 0));
    if (!entriesByLevel.has(level)) entriesByLevel.set(level, []);
    entriesByLevel.get(level).push(entry);
  }

  return {
    filters: SPELL_CATALOG_FILTERS.map((filter) => ({
      ...filter,
      active: filter.value === activeFilter,
    })),
    groups: [...entriesByLevel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, groupEntries]) => ({
        level,
        label: level === 0 ? "Trucchetti" : `Livello ${level}`,
        entries: groupEntries,
      })),
    empty: matches.length === 0,
  };
}

export function createSpellCatalogMenuController({
  document: documentRef,
  input,
  toggle,
  menu,
  entries = [],
  getSelectedId = () => "",
  onSelect = () => {},
} = {}) {
  let activeSpellCatalogFilter = "all";

  const closeSpellMenu = () => {
    if (!menu || !toggle) return;
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openSpellMenu = (query = "") => {
    if (!menu || !toggle || !documentRef) return;
    const plan = buildSpellCatalogMenuPlan({
      entries,
      query,
      activeFilter: activeSpellCatalogFilter,
    });
    const selectedId = String(getSelectedId() || "");
    menu.replaceChildren();

    const filters = documentRef.createElement("div");
    filters.className = "spell-menu-filters";
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filtra catalogo incantesimi");
    for (const filter of plan.filters) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "spell-menu-filter" + (filter.active ? " active" : "");
      button.textContent = filter.label;
      button.setAttribute("aria-pressed", String(filter.active));
      button.addEventListener("click", () => {
        activeSpellCatalogFilter = filter.value;
        openSpellMenu(query);
      });
      filters.appendChild(button);
    }
    menu.appendChild(filters);

    for (const groupPlan of plan.groups) {
      const group = documentRef.createElement("div");
      group.className = "spell-menu-group";
      const heading = documentRef.createElement("div");
      heading.className = "spell-menu-level";
      heading.textContent = groupPlan.label;
      group.appendChild(heading);
      for (const entry of groupPlan.entries) {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "spell-menu-option" + (selectedId === entry.id ? " active" : "");
        button.textContent = entry.label;
        button.title = entry.label;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(selectedId === entry.id));
        button.addEventListener("click", () => {
          input.value = entry.value;
          closeSpellMenu();
          onSelect(entry);
          input.focus();
        });
        group.appendChild(button);
      }
      menu.appendChild(group);
    }

    if (plan.empty) {
      const empty = documentRef.createElement("div");
      empty.className = "spell-menu-empty";
      empty.textContent = "Nessun incantesimo trovato.";
      menu.appendChild(empty);
    }
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-expanded", "true");
  };

  return {
    closeSpellMenu,
    openSpellMenu,
  };
}
