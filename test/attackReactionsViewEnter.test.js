import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Lot L17 of the bugfix pass (AT-03): Enter in the amount of a retaliation (Fire Shield) ran the console's main action
// (the PC console's Enter shortcut, the Boss console's form submit with its average damage) instead of the retaliation.
const row = { instanceId: "fire-shield-1", label: "Scudo di fuoco", dice: "2d8", text: "Ritorsione", type: "fire" };
let rows = [row];
mock.module("../src/attackReactionsCore.js", {
  namedExports: { attackTargetReactions: () => ({ sanctuary: null, retaliations: rows, offers: [] }) },
});
const { renderAttackReactions } = await import("../src/attackReactionsView.js");

function fakeDocument() {
  const make = (tag) => {
    const listeners = new Map();
    const node = {
      tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, disabled: false, hidden: false, value: "",
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
      dispatch(type, event) { for (const handler of listeners.get(type) || []) handler(event); },
      click() { this.dispatch("click", {}); },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = [...nodes]; },
    };
    return node;
  };
  return { createElement: make };
}

function keydown(key, extra = {}) {
  const event = { key, isComposing: false, defaultPrevented: false, propagationStopped: false, ...extra };
  event.preventDefault = () => { event.defaultPrevented = true; };
  event.stopPropagation = () => { event.propagationStopped = true; };
  return event;
}

function render({ busy = false } = {}) {
  const documentRef = fakeDocument();
  const box = documentRef.createElement("div");
  const applied = [];
  renderAttackReactions(box, { target: { id: "wizard" } }, {
    busy, documentRef, retaliate: (retaliation, amount) => applied.push([retaliation.instanceId, amount]),
  });
  const [, input] = box.children[0].children;
  return { input, applied };
}

test("L17: Invio nel campo della ritorsione applica la ritorsione e non arriva alla console", () => {
  const { input, applied } = render();
  input.value = "9";
  const enter = keydown("Enter");
  input.dispatch("keydown", enter);
  assert.deepEqual(applied, [["fire-shield-1", "9"]]);
  assert.equal(enter.defaultPrevented, true, "no submit of the Boss form");
  assert.equal(enter.propagationStopped, true, "no Enter shortcut of the PC console");

  const tab = keydown("Tab");
  input.dispatch("keydown", tab);
  assert.equal(tab.defaultPrevented, false);
  input.dispatch("keydown", keydown("Enter", { isComposing: true }));
  assert.equal(applied.length, 1, "an IME composition is left alone");
});

test("L17: con la console occupata Invio non applica nulla e resta comunque nel campo", () => {
  const { input, applied } = render({ busy: true });
  const enter = keydown("Enter");
  input.dispatch("keydown", enter);
  assert.deepEqual(applied, []);
  assert.equal(enter.propagationStopped, true);
});

// CAP-TEMP, lotto T3c: Armor of Agathys' retaliation is a fixed amount: no field, the button applies it.
test("una ritorsione a danno fisso (Armatura di Agathys) non chiede il tiro: il pulsante applica il danno", () => {
  rows = [{ instanceId: "aoa-1", label: "Armatura di Agathys", dice: "10", amount: 10, text: "Ritorsione", type: "cold" }];
  const documentRef = fakeDocument();
  const box = documentRef.createElement("div");
  const applied = [];
  renderAttackReactions(box, { target: { id: "wizard" } }, {
    documentRef, retaliate: (retaliation, amount) => applied.push([retaliation.instanceId, amount]),
  });
  const parts = box.children[0].children;
  assert.equal(parts.length, 2, "the note and the button");
  assert.equal(parts[1].textContent, "Applica 10");
  parts[1].click();
  assert.deepEqual(applied, [["aoa-1", 10]]);
  rows = [row];
});
