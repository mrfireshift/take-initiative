import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const initiativeListSource = readFileSync(
  new URL("../src/initiativeChipFallback.js", import.meta.url),
  "utf8",
);

function fallbackBlock() {
  const start = initiativeListSource.indexOf("function __chip(");
  const end = initiativeListSource.indexOf("// End initiative chip fallback family.", start);
  assert.ok(start >= 0, "chip fallback start marker missing");
  assert.ok(end > start, "chip fallback end marker missing");
  return initiativeListSource.slice(start, end);
}

function fakeDocument() {
  return {
    createElement: () => ({ textContent: "", style: {} }),
    createDocumentFragment: () => ({
      children: [],
      appendChild(child) { this.children.push(child); },
    }),
  };
}

function loadFallback({ instances = [], buildConditionChips = null } = {}) {
  const warnings = [];
  const context = {
    document: fakeDocument(),
    getEffectiveConditionInstances: () => structuredClone(instances),
    buildConditionChips,
    console: { warn: (...args) => warnings.push(args) },
  };
  vm.runInNewContext(
    `${fallbackBlock()}\n;globalThis.__chipFallback = { __chip, __buildChipsSimple, __buildConditionChipsSafe };`,
    context,
  );
  return { ...context.__chipFallback, warnings };
}

function labels(fragment) {
  return fragment.children.map((child) => child.textContent);
}

test("il fallback raggruppa le istanze, rispetta cap e conserva lo stile compact", () => {
  const { __buildChipsSimple } = loadFallback({
    instances: [
      { condition: "Accecato" },
      { condition: "Custom" },
      { condition: "Accecato" },
    ],
  });
  const fragment = __buildChipsSimple({}, {
    cap: ["Prono", "Accecato"],
    compact: true,
  });

  assert.deepEqual(labels(fragment), ["Accecato x2", "Custom"]);
  assert.equal(fragment.children[0].style.fontSize, "10px");
  assert.equal(fragment.children[0].style.padding, "1px 5px");
});

test("il fallback legacy mantiene ordine whitelist, flag extra e custom", () => {
  const { __buildChipsSimple } = loadFallback();
  const fragment = __buildChipsSimple({
    flags: { Prono: true, Invisibile: false, Extra: true },
    custom: ["Marchiato"],
  }, {
    cap: ["Invisibile", "Prono"],
    compact: false,
  });

  assert.deepEqual(labels(fragment), ["Prono", "Extra", "Marchiato"]);
  assert.equal(fragment.children[0].style.fontSize, "11px");
  assert.equal(fragment.children[0].style.padding, "2px 6px");
});

test("il wrapper usa il renderer canonico e ripiega sul fallback solo se questo lancia", () => {
  const canonical = { kind: "canonical" };
  const delegated = loadFallback({ buildConditionChips: () => canonical });
  assert.equal(delegated.__buildConditionChipsSafe({}, {}), canonical);
  assert.equal(delegated.warnings.length, 0);

  const fallback = loadFallback({
    instances: [{ condition: "Prono" }],
    buildConditionChips: () => { throw new Error("boom"); },
  });
  assert.deepEqual(labels(fallback.__buildConditionChipsSafe({}, { cap: ["Prono"] })), ["Prono"]);
  assert.equal(fallback.warnings.length, 1);
  assert.match(String(fallback.warnings[0][0]), /chip render/);
});
