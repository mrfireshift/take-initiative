import {
  factionColor,
  factionKey,
} from "./spellsPanelViewCore.js";

export function spellTargetMatchesFilters(
  control,
  activeFactions = new Set(),
  nameQuery = "",
) {
  const normalizedQuery = String(nameQuery || "").trim().toLocaleLowerCase("it");
  const matchesFaction = activeFactions.size === 0
    || activeFactions.has(control.faction);
  const matchesName = !normalizedQuery || control.name.includes(normalizedQuery);
  return matchesFaction && matchesName;
}

export function spellTargetCountLabel(count) {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  return normalizedCount === 1 ? "1 selezionato" : `${normalizedCount} selezionati`;
}

export function spellSubmitActionLabel({ count = 0, phase = "", subjectMode = "" } = {}) {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  if (phase === "prepare") return "Prepara sul caster";
  if (subjectMode === "self" || subjectMode === "caster") return "Applica al caster";
  return normalizedCount === 1
    ? "Applica a 1 bersaglio"
    : `Applica a ${normalizedCount} bersagli`;
}

export function spellResolveActionPresentation(count) {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  return {
    disabled: normalizedCount === 0,
    text: normalizedCount > 0 ? `Risolvi (${normalizedCount})` : "Risolvi",
    title: normalizedCount > 0
      ? `Risolvi sui ${normalizedCount} bersagli selezionati`
      : "Seleziona almeno un bersaglio",
  };
}

export function createSpellTargetPicker({
  document: documentRef,
  items = [],
  list,
  nameFilter,
  factionButtons = [],
  onSelectionChange = () => {},
  onSelectionCountChange = () => {},
} = {}) {
  const spellTargetControls = new Map();
  const activeSpellFactionFilters = new Set();

  function selectedSpellTargetIds() {
    return Array.from(spellTargetControls.entries())
      .filter(([, control]) => control.checkbox.checked)
      .map(([id]) => id);
  }

  function notifySelectionCount() {
    onSelectionCountChange(selectedSpellTargetIds().length);
  }

  function applySpellTargetSelection(ids) {
    const selected = new Set(Array.isArray(ids) ? ids : []);
    for (const [id, control] of spellTargetControls) {
      control.checkbox.checked = selected.has(id);
      control.row.classList.toggle("selected", control.checkbox.checked);
    }
    notifySelectionCount();
  }

  function applySpellTargetFilter() {
    const nameQuery = nameFilter?.value || "";
    for (const control of spellTargetControls.values()) {
      control.row.style.display = spellTargetMatchesFilters(
        control,
        activeSpellFactionFilters,
        nameQuery,
      ) ? "flex" : "none";
    }
  }

  for (const item of items) {
    const row = documentRef.createElement("label");
    row.className = "spell-target";
    const checkbox = documentRef.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.style.accentColor = "#2563eb";
    const faction = documentRef.createElement("span");
    faction.className = "spell-target-faction";
    faction.style.background = factionColor(item);
    faction.style.color = factionColor(item);
    const label = documentRef.createElement("span");
    label.className = "spell-target-name";
    label.textContent = item.name || item.id;
    row.append(checkbox, faction, label);
    list?.appendChild(row);
    spellTargetControls.set(item.id, {
      row,
      checkbox,
      faction: factionKey(item),
      name: String(item.name || item.id).toLocaleLowerCase("it"),
    });
    checkbox.addEventListener("change", () => {
      row.classList.toggle("selected", checkbox.checked);
      notifySelectionCount();
      void onSelectionChange([item.id], checkbox.checked);
    });
  }

  nameFilter?.addEventListener("input", applySpellTargetFilter);
  for (const button of factionButtons) {
    button.addEventListener("click", () => {
      const faction = button.dataset.spellFaction;
      if (activeSpellFactionFilters.has(faction)) activeSpellFactionFilters.delete(faction);
      else activeSpellFactionFilters.add(faction);
      const active = activeSpellFactionFilters.has(faction);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      applySpellTargetFilter();
    });
  }
  applySpellTargetFilter();

  return {
    applySpellTargetFilter,
    applySpellTargetSelection,
    selectedSpellTargetIds,
  };
}
