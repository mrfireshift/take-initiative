import test, { mock } from "node:test";
import assert from "node:assert/strict";

const referenceCalls = [];
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {},
    buildLabel: () => ({}),
  },
});
mock.module("../src/referencePopover.js", {
  exports: {
    openReferencePopover: (options) => {
      referenceCalls.push(options);
      return Promise.resolve();
    },
  },
});

const {
  MAX_VISIBLE_CHIPS,
  bindReferenceChips,
  collectChipsDeep,
  mountChipsWithOverflow,
} = await import("../src/initiativeChipOverflow.js");

function selectorMatches(element, selector) {
  if (selector === "span" || selector === "div" || selector === "button") {
    return element.tagName === selector.toUpperCase();
  }
  if (selector === "[data-chip]") return Object.hasOwn(element.dataset, "chip");
  if (selector === "[data-reference-entry]") {
    return Object.hasOwn(element.dataset, "referenceEntry");
  }
  if (selector.startsWith(".")) {
    return String(element.className || "").split(/\s+/).includes(selector.slice(1));
  }
  return false;
}

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.title = "";
  }

  appendChild(child) {
    if (child?.isFragment) {
      for (const nested of [...child.children]) this.appendChild(nested);
      child.children.length = 0;
      return child;
    }
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((entry) => entry !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners[type] || []) listener(event);
  }

  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => child.contains?.(candidate));
  }

  querySelectorAll(selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    const result = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (selectors.some((part) => selectorMatches(child, part))) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    if (selector !== '[data-tracker-card="1"]') return null;
    let current = this;
    while (current) {
      if (current.dataset?.trackerCard === "1") return current;
      current = current.parentElement;
    }
    return null;
  }
}

class TestFragment extends TestElement {
  constructor() {
    super("#fragment");
    this.isFragment = true;
  }
}

function createTestDocument() {
  return {
    createElement: (tagName) => new TestElement(tagName),
    createDocumentFragment: () => new TestFragment(),
  };
}

function chip(documentRef, label, className = "chip") {
  const element = documentRef.createElement("span");
  element.className = className;
  element.textContent = label;
  return element;
}

test("la raccolta preferisce chip esplicite e aggiunge solo leaf significativi", () => {
  const documentRef = createTestDocument();
  const fragment = documentRef.createDocumentFragment();
  const explicit = chip(documentRef, "Prono");
  const nested = chip(documentRef, "interno", "");
  explicit.appendChild(nested);
  const wrapper = documentRef.createElement("div");
  const looseLeaf = chip(documentRef, "Marchiato", "");
  const emptyLeaf = chip(documentRef, "", "");
  wrapper.append(looseLeaf, emptyLeaf);
  fragment.append(explicit, wrapper);

  assert.deepEqual(
    collectChipsDeep(fragment, { documentRef }),
    [explicit, looseLeaf],
  );
});

test("senza overflow monta una sola riga e conserva il limite predefinito", () => {
  const documentRef = createTestDocument();
  const dock = documentRef.createElement("div");
  const fragment = documentRef.createDocumentFragment();
  const chips = [chip(documentRef, "A"), chip(documentRef, "B")];
  fragment.append(...chips);

  mountChipsWithOverflow(dock, fragment, { documentRef });

  assert.equal(MAX_VISIBLE_CHIPS, 3);
  assert.equal(dock.style.flexDirection, "column");
  assert.equal(dock.children.length, 1);
  assert.deepEqual(dock.children[0].children, chips);
});

test("il toggle overflow mantiene righe, aria, stop propagation e z-index correnti", () => {
  const documentRef = createTestDocument();
  const owner = documentRef.createElement("article");
  owner.dataset.trackerCard = "1";
  owner.style.zIndex = "7";
  const dock = documentRef.createElement("div");
  owner.appendChild(dock);
  const fragment = documentRef.createDocumentFragment();
  const chips = ["A", "B", "C", "D"].map((label) => chip(documentRef, label));
  fragment.append(...chips);

  mountChipsWithOverflow(dock, fragment, { limit: 2, documentRef });
  const [row1, row2] = dock.children;
  const more = row1.children[2];
  assert.deepEqual(row1.children.slice(0, 2), chips.slice(0, 2));
  assert.deepEqual(row2.children, chips.slice(2));
  assert.equal(row2.style.display, "none");
  assert.equal(more.textContent, "+2");
  assert.equal(more.attributes["aria-expanded"], "false");

  let stopped = 0;
  more.dispatch("click", { stopPropagation: () => { stopped += 1; } });
  assert.equal(row2.style.display, "flex");
  assert.equal(more.textContent, "−");
  assert.equal(more.attributes["aria-expanded"], "true");
  assert.equal(owner.style.zIndex, "30");

  more.dispatch("click", { stopPropagation: () => { stopped += 1; } });
  assert.equal(row2.style.display, "none");
  assert.equal(more.textContent, "+2");
  assert.equal(more.attributes["aria-expanded"], "false");
  assert.equal(owner.style.zIndex, "30");
  assert.equal(stopped, 2);
});

test("le chip reference conservano role, tastiera e routing enciclopedia", () => {
  referenceCalls.length = 0;
  const documentRef = createTestDocument();
  const dock = documentRef.createElement("div");
  const condition = chip(documentRef, "Prono");
  condition.dataset.referenceEntry = "Prono";
  condition.dataset.referenceType = "conditions";
  condition.title = "Condizione";
  const spell = chip(documentRef, "Lentezza");
  spell.dataset.referenceEntry = "Lentezza";
  spell.dataset.referenceType = "spells";
  spell.appendChild(documentRef.createElement("button"));
  dock.append(condition, spell);

  bindReferenceChips(dock);

  assert.equal(condition.attributes.role, "button");
  assert.equal(spell.attributes.role, "group");
  assert.equal(condition.attributes.tabindex, "0");
  assert.equal(condition.title, "Condizione · Apri nell'Enciclopedia DM");
  const events = [];
  const event = {
    preventDefault: () => events.push("prevent"),
    stopPropagation: () => events.push("stop"),
  };
  condition.dispatch("click", event);
  spell.dispatch("keydown", { ...event, key: "Enter" });
  condition.dispatch("keydown", { ...event, key: "Escape" });

  assert.deepEqual(referenceCalls, [
    { tab: "conditions", entry: "Prono" },
    { tab: "spells", entry: "Lentezza" },
  ]);
  assert.deepEqual(events, ["prevent", "stop", "prevent", "stop"]);
});
