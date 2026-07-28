import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpellTargetPicker,
  spellResolveActionPresentation,
  spellSubmitActionLabel,
  spellTargetCountLabel,
  spellTargetMatchesFilters,
} from "../src/spellsPanelTargetPicker.js";
import { ID } from "../src/constants.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      const classes = new Set();
      return {
        tagName: String(tagName).toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        listeners: {},
        checked: false,
        textContent: "",
        value: "",
        classList: {
          toggle(name, force) {
            if (force) classes.add(name);
            else classes.delete(name);
          },
          contains(name) {
            return classes.has(name);
          },
        },
        append(...children) {
          this.children.push(...children);
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          for (const listener of this.listeners[type] || []) await listener(event);
        },
      };
    },
  };
}

function item(id, name, attitude) {
  return {
    id,
    name,
    metadata: {
      [ID + "/meta"]: { attitude },
    },
  };
}

test("il filtro bersagli combina fazione e nome normalizzato", () => {
  const control = {
    faction: "enemy",
    name: "goblin arciere",
  };

  assert.equal(spellTargetMatchesFilters(control, new Set(), ""), true);
  assert.equal(spellTargetMatchesFilters(control, new Set(["enemy"]), "GOBLIN"), true);
  assert.equal(spellTargetMatchesFilters(control, new Set(["ally"]), "goblin"), false);
  assert.equal(spellTargetMatchesFilters(control, new Set(["enemy"]), "mago"), false);
});

test("il contatore bersagli conserva singolare, plurale e zero", () => {
  assert.equal(spellTargetCountLabel(0), "0 selezionati");
  assert.equal(spellTargetCountLabel(1), "1 selezionato");
  assert.equal(spellTargetCountLabel(3), "3 selezionati");
});

test("l'azione submit rispetta preparazione, caster e bersagli", () => {
  assert.equal(spellSubmitActionLabel({
    count: 3,
    phase: "prepare",
    subjectMode: "target",
  }), "Prepara sul caster");
  assert.equal(spellSubmitActionLabel({
    count: 3,
    subjectMode: "self",
  }), "Applica al caster");
  assert.equal(spellSubmitActionLabel({
    count: 1,
    subjectMode: "target",
  }), "Applica a 1 bersaglio");
  assert.equal(spellSubmitActionLabel({
    count: 4,
    subjectMode: "target",
  }), "Applica a 4 bersagli");
});

test("la risoluzione attiva richiede almeno un bersaglio", () => {
  assert.deepEqual(spellResolveActionPresentation(0), {
    disabled: true,
    text: "Risolvi",
    title: "Seleziona almeno un bersaglio",
  });
  assert.deepEqual(spellResolveActionPresentation(2), {
    disabled: false,
    text: "Risolvi (2)",
    title: "Risolvi sui 2 bersagli selezionati",
  });
});

test("il controller sincronizza checkbox, conteggio e filtri visivi", async () => {
  const documentRef = createTestDocument();
  const list = documentRef.createElement("div");
  const nameFilter = documentRef.createElement("input");
  const enemyFilter = documentRef.createElement("button");
  enemyFilter.dataset.spellFaction = "enemy";
  const writes = [];
  const counts = [];
  const picker = createSpellTargetPicker({
    document: documentRef,
    items: [
      item("hero", "Eroe", "pc"),
      item("goblin", "Goblin", "enemy"),
    ],
    list,
    nameFilter,
    factionButtons: [enemyFilter],
    onSelectionChange(ids, selected) {
      writes.push([ids, selected]);
    },
    onSelectionCountChange(count) {
      counts.push(count);
    },
  });

  picker.applySpellTargetSelection(["goblin"]);
  assert.deepEqual(picker.selectedSpellTargetIds(), ["goblin"]);
  assert.equal(list.children[1].classList.contains("selected"), true);
  assert.equal(counts.at(-1), 1);

  const heroCheckbox = list.children[0].children[0];
  heroCheckbox.checked = true;
  await heroCheckbox.dispatch("change");
  assert.deepEqual(writes, [[["hero"], true]]);
  assert.equal(counts.at(-1), 2);

  nameFilter.value = "gob";
  await nameFilter.dispatch("input");
  assert.equal(list.children[0].style.display, "none");
  assert.equal(list.children[1].style.display, "flex");

  await enemyFilter.dispatch("click");
  assert.equal(enemyFilter.attributes["aria-pressed"], "true");
  assert.equal(list.children[1].style.display, "flex");
});
