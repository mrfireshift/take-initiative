// Buff composer of the Conditions popup: the GM builds a buff (name, icon, duration, spell effect,
// defenses, notes shown as micropills, who gives it), applies it and may save it among "I miei buff".
// Models are only starting points; every field stays editable.
import { DAMAGE_TYPES } from "./damageDefensesCore.js";
import {
  BUFF_ALL_DAMAGE_TYPES,
  BUFF_DEFENSE_KINDS,
  BUFF_DURATION_UNITS,
  BUFF_ICONS,
  BUFF_NEW_OPTION_VALUE,
  BUFF_OPTION_PREFIX,
  BUFF_PRESETS,
  BUFF_SAVED_OPTION_PREFIX,
  buffDefenseRows,
  buffPresetFromOptionValue,
  isBuffOptionValue,
  normalizeBuffDefinition,
  planBuffApplication,
} from "./buffPresetCore.js";
import { createBuffPresetStore } from "./buffPresetStore.js";
import { loadBuffSpellChoices, loadBuffSpellOptions } from "./buffSpellApplication.js";

const EMPTY_BUFF = Object.freeze({ name: "", icon: "✨", duration: 1, unit: "minutes" });

export function createBuffComposer({ cell, documentRef = globalThis.document, store = createBuffPresetStore() } = {}) {
  const doc = documentRef;
  const input = (placeholder = "", maxLength = 80) => {
    const element = doc.createElement("input");
    element.type = "text";
    element.maxLength = maxLength;
    element.autocomplete = "off";
    element.spellcheck = false;
    element.placeholder = placeholder;
    return element;
  };
  const select = (options) => {
    const element = doc.createElement("select");
    for (const [value, label] of options) element.appendChild(new Option(label, value));
    return element;
  };
  const button = (label, tone = "") => {
    const element = doc.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.className = `effects-btn${tone ? ` effects-btn-${tone}` : ""}`;
    return element;
  };
  const wide = (element) => { element.style.gridColumn = "1 / -1"; return element; };

  const nameInput = input("Es. Benedizione di Auril");
  const iconSelect = select(BUFF_ICONS.map((icon) => [icon, icon]));
  const durationInput = doc.createElement("input");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.step = "1";
  const unitSelect = select(BUFF_DURATION_UNITS.map((unit) => [unit.id, unit.label]));
  const giverInput = input("Es. un PNG, un altare…");
  const notesInput = input("Es. 10 PF temp., +1 CA", 160);
  notesInput.title = "Promemoria separati da virgola: compaiono come micropill (max 4).";

  // Optional spell effect: the whole spell list, loaded the first time the field is used.
  const spellInput = input("Nessuno (es. Velocità)", 120);
  const spellList = doc.createElement("datalist");
  spellList.id = "effectsBuffSpellOptions";
  spellInput.setAttribute("list", spellList.id);
  let spellListLoaded = false;
  spellInput.addEventListener("focus", () => {
    if (spellListLoaded) return;
    spellListLoaded = true;
    void loadBuffSpellOptions().then((options) => {
      spellList.replaceChildren(...options.map((entry) => new Option(entry.label, entry.label)));
    }).catch(() => { spellListLoaded = false; });
  });
  const choiceSelect = doc.createElement("select");
  const choiceCell = cell("VARIANTE", choiceSelect);
  let spellRevision = 0;
  const syncSpellChoices = async (preferredChoice = "") => {
    const revision = ++spellRevision;
    const value = spellInput.value.trim();
    const resolved = value ? await loadBuffSpellChoices(value).catch(() => null) : null;
    if (revision !== spellRevision) return;
    const choices = resolved?.choices || [];
    choiceSelect.replaceChildren(...choices.map((entry) => new Option(entry.label || entry.id, entry.id)));
    if (choices.some((entry) => entry.id === preferredChoice)) choiceSelect.value = preferredChoice;
    choiceCell.style.display = choices.length && visible ? "" : "none";
    spellInput.title = value && !resolved ? "Incantesimo non trovato nel catalogo" : "";
    spellInput.style.borderColor = value && !resolved ? "rgba(248,113,113,.9)" : "";
  };
  spellInput.addEventListener("change", () => { void syncSpellChoices(); });

  // Defenses: one row per kind and damage type; "Tutti i danni" covers every type.
  const defenseList = doc.createElement("div");
  Object.assign(defenseList.style, { display: "grid", gap: "4px" });
  const addDefenseRow = (row = { kind: "resistance", type: "cold" }) => {
    const line = doc.createElement("div");
    line.dataset.buffDefenseRow = "1";
    Object.assign(line.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: "4px" });
    const kind = select(BUFF_DEFENSE_KINDS.map((entry) => [entry.id, entry.label]));
    kind.value = row.kind;
    kind.classList.add("effects-control");
    const type = select([[BUFF_ALL_DAMAGE_TYPES, "Tutti i danni"], ...DAMAGE_TYPES.map((entry) => [entry.id, entry.label])]);
    type.value = row.type;
    type.classList.add("effects-control");
    const remove = button("×", "danger");
    remove.title = "Rimuovi difesa";
    remove.addEventListener("click", () => line.remove());
    line.append(kind, type, remove);
    defenseList.appendChild(line);
  };
  const addDefense = button("+ Difesa");
  const defenseWrap = doc.createElement("div");
  Object.assign(defenseWrap.style, { display: "grid", gap: "4px", justifyItems: "start" });
  defenseWrap.append(defenseList, addDefense);
  addDefense.addEventListener("click", () => addDefenseRow());
  const defenseRows = () => Array.from(defenseList.querySelectorAll("[data-buff-defense-row='1']")).map((line) => {
    const [kind, type] = line.querySelectorAll("select");
    return { kind: kind.value, type: type.value };
  });

  const saveButton = button("Salva nei miei buff");
  const deleteButton = button("Elimina", "danger");
  const status = doc.createElement("span");
  Object.assign(status.style, { fontSize: "var(--obrt-type-secondary, 11px)", color: "rgba(255,255,255,.7)" });
  const saveBar = doc.createElement("div");
  Object.assign(saveBar.style, { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" });
  saveBar.append(saveButton, deleteButton, status);

  const spellCell = cell("INCANTESIMO", spellInput);
  spellCell.appendChild(spellList);
  const cells = [
    cell("NOME", nameInput),
    cell("ICONA", iconSelect),
    cell("DURATA", durationInput),
    cell("UNITÀ", unitSelect),
    spellCell,
    choiceCell,
    cell("CONCESSO DA", giverInput),
    cell("PROMEMORIA", notesInput),
    wide(cell("DIFESE", defenseWrap)),
    wide(cell("I MIEI BUFF", saveBar)),
  ];

  let visible = false;
  let shownValue = "";
  let effectSelect = null;

  const definitionFor = (value) => {
    if (value.startsWith(BUFF_SAVED_OPTION_PREFIX)) return store.get(value.slice(BUFF_SAVED_OPTION_PREFIX.length))?.definition || null;
    if (value.startsWith(BUFF_OPTION_PREFIX)) return buffPresetFromOptionValue(value);
    return value === BUFF_NEW_OPTION_VALUE ? EMPTY_BUFF : null;
  };
  const savedId = () => (shownValue.startsWith(BUFF_SAVED_OPTION_PREFIX) ? shownValue.slice(BUFF_SAVED_OPTION_PREFIX.length) : "");

  function fill(definition) {
    const buff = normalizeBuffDefinition(definition);
    nameInput.value = buff.name;
    iconSelect.value = buff.icon;
    durationInput.value = String(buff.duration || 1);
    unitSelect.value = buff.unit;
    notesInput.value = buff.notes.join(", ");
    defenseList.replaceChildren();
    for (const row of buffDefenseRows(buff.defenses)) addDefenseRow(row);
    spellInput.value = "";
    if (buff.spellId) {
      void loadBuffSpellChoices(buff.spellId).then((resolved) => {
        spellInput.value = resolved?.spell?.displayName || resolved?.spell?.name || buff.spellId;
        void syncSpellChoices(buff.spellChoice);
      }).catch(() => { spellInput.value = buff.spellId; });
    } else {
      void syncSpellChoices();
    }
    status.textContent = "";
    deleteButton.style.display = savedId() ? "" : "none";
    saveButton.textContent = savedId() ? "Aggiorna nei miei buff" : "Salva nei miei buff";
  }

  function currentDefinition() {
    return {
      name: nameInput.value,
      icon: iconSelect.value,
      duration: Number(durationInput.value),
      unit: unitSelect.value,
      notes: notesInput.value,
      spellId: spellInput.value.trim(),
      spellChoice: choiceCell.style.display === "none" ? "" : choiceSelect.value,
      detail: definitionFor(shownValue)?.detail || "",
      defenses: {},
    };
  }

  function appendOptions(target) {
    effectSelect = target;
    for (const group of Array.from(target.querySelectorAll("optgroup[data-buff-group='1']"))) group.remove();
    const make = (label, entries) => {
      const group = doc.createElement("optgroup");
      group.label = label;
      group.dataset.buffGroup = "1";
      for (const [value, text] of entries) group.appendChild(new Option(text, value));
      target.appendChild(group);
    };
    make("Buff", [[BUFF_NEW_OPTION_VALUE, "＋ Nuovo buff…"]]);
    const saved = store.list();
    if (saved.length) make("I miei buff", saved.map((entry) => [`${BUFF_SAVED_OPTION_PREFIX}${entry.id}`, `${entry.definition.icon} ${entry.definition.name}`]));
    make("Modelli", BUFF_PRESETS.map((entry) => [`${BUFF_OPTION_PREFIX}${entry.id}`, `${entry.icon} ${entry.name}`]));
  }

  function selectValue(value) {
    if (!effectSelect) return;
    effectSelect.value = value;
    effectSelect.dispatchEvent(new Event("change"));
  }

  saveButton.addEventListener("click", () => {
    const definition = { ...currentDefinition(), defenses: planBuffApplication({ definition: currentDefinition(), defenseRows: defenseRows() }).definition?.defenses || {} };
    const entry = store.save(definition, savedId());
    if (!entry) {
      status.textContent = normalizeBuffDefinition(definition).name ? "Salvataggio non riuscito." : "Dai un nome al buff.";
      return;
    }
    appendOptions(effectSelect);
    shownValue = "";
    selectValue(`${BUFF_SAVED_OPTION_PREFIX}${entry.id}`);
    status.textContent = "Salvato.";
  });
  deleteButton.addEventListener("click", () => {
    const id = savedId();
    if (!id || !store.remove(id)) return;
    appendOptions(effectSelect);
    shownValue = "";
    selectValue(BUFF_NEW_OPTION_VALUE);
    status.textContent = "Eliminato.";
  });

  return {
    cells,
    appendOptions,
    isBuff: (value) => isBuffOptionValue(value),
    // Shows the composer for the chosen entry, filling it only when the entry changes.
    show(value) {
      visible = isBuffOptionValue(value);
      for (const element of cells) element.style.display = visible ? "" : "none";
      if (!visible) {
        choiceCell.style.display = "none";
        return;
      }
      if (value !== shownValue) {
        shownValue = value;
        fill(definitionFor(value) || EMPTY_BUFF);
      }
      void syncSpellChoices(choiceSelect.value);
    },
    name: () => nameInput.value.trim(),
    setStatus: (message) => { status.textContent = String(message || ""); },
    onNameInput: (listener) => nameInput.addEventListener("input", listener),
    plan: () => planBuffApplication({
      definition: currentDefinition(),
      defenseRows: defenseRows(),
      giver: giverInput.value,
      effectKey: savedId() || (shownValue.startsWith(BUFF_OPTION_PREFIX) ? shownValue.slice(BUFF_OPTION_PREFIX.length) : ""),
    }),
  };
}
