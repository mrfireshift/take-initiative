import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellCatalogMenuPlan,
  createSpellCatalogMenuController,
} from "../src/spellsPanelCatalogMenu.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        attributes: {},
        children: [],
        listeners: {},
        hidden: false,
        textContent: "",
        title: "",
        value: "",
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        replaceChildren(...children) {
          this.children = children;
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
        focus() {
          this.focused = true;
        },
      };
    },
  };
}

const entries = [
  { id: "light", value: "Luce", label: "Luce", level: 0, concentration: false, area: false, automated: false },
  { id: "bless", value: "Benedizione", label: "Benedizione", level: 1, concentration: true, area: false, automated: true },
  { id: "fireball", value: "Palla di Fuoco", label: "Palla di Fuoco", level: 3, concentration: false, area: true, automated: false },
  { id: "web", value: "Ragnatela", label: "Ragnatela", level: 2, concentration: true, area: true, automated: true },
];

test("il catalogo filtra per testo senza alterare l'ordine delle voci", () => {
  const plan = buildSpellCatalogMenuPlan({
    entries,
    query: "alla di",
  });

  assert.deepEqual(plan.groups.map((group) => group.entries.map((entry) => entry.id)), [
    ["fireball"],
  ]);
  assert.equal(plan.empty, false);
});

test("i filtri catalogo distinguono concentrazione, area ed effetti", () => {
  const idsFor = (activeFilter) => buildSpellCatalogMenuPlan({
    entries,
    activeFilter,
  }).groups.flatMap((group) => group.entries.map((entry) => entry.id));

  assert.deepEqual(idsFor("concentration"), ["bless", "web"]);
  assert.deepEqual(idsFor("area"), ["web", "fireball"]);
  assert.deepEqual(idsFor("automated"), ["bless", "web"]);
  assert.deepEqual(idsFor("all"), ["light", "bless", "web", "fireball"]);
});

test("i gruppi sono ordinati per livello e mantengono le etichette correnti", () => {
  const plan = buildSpellCatalogMenuPlan({ entries });

  assert.deepEqual(plan.groups.map(({ level, label }) => [level, label]), [
    [0, "Trucchetti"],
    [1, "Livello 1"],
    [2, "Livello 2"],
    [3, "Livello 3"],
  ]);
  assert.equal(plan.filters.find((filter) => filter.value === "all").active, true);
});

test("una ricerca senza risultati espone lo stato vuoto", () => {
  const plan = buildSpellCatalogMenuPlan({
    entries,
    query: "inesistente",
  });

  assert.equal(plan.empty, true);
  assert.deepEqual(plan.groups, []);
});

test("il controller apre il menu e consegna la scelta prima di rifocalizzare l'input", async () => {
  const documentRef = createTestDocument();
  const input = documentRef.createElement("input");
  const toggle = documentRef.createElement("button");
  const menu = documentRef.createElement("div");
  let selected = null;
  const controller = createSpellCatalogMenuController({
    document: documentRef,
    input,
    toggle,
    menu,
    entries,
    onSelect(entry) {
      selected = entry.id;
    },
  });

  controller.openSpellMenu("palla");

  assert.equal(menu.hidden, false);
  assert.equal(input.attributes["aria-expanded"], "true");
  assert.equal(toggle.attributes["aria-expanded"], "true");
  assert.equal(menu.children.length, 2);
  const option = menu.children[1].children[1];
  await option.dispatch("click");
  assert.equal(selected, "fireball");
  assert.equal(input.value, "Palla di Fuoco");
  assert.equal(menu.hidden, true);
  assert.equal(input.focused, true);
});
