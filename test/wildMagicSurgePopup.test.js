// The surge's popup (src/wild-magic-surge.js) on a fake page, with the runtime mocked: the fixed row says what is missing, a d100
// is applied once, a message about another row does not stay, and the pill builder stays folded until it is asked for.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => { for (let turn = 0; turn < 6; turn += 1) await tick(); };

function fakeElement(id) {
  const listeners = new Map();
  return {
    id, hidden: false, disabled: false, open: false, checked: false, value: "", textContent: "", dataset: {}, offsetWidth: 1, scrolled: 0, focused: 0,
    classList: { add() {}, remove() {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    fire(type, event = {}) { return listeners.get(type)?.(event); },
    replaceChildren() {},
    focus() { this.focused += 1; },
    scrollIntoView() { this.scrolled += 1; },
  };
}
const elements = new Map();
const $ = (id) => {
  if (!elements.has(id)) elements.set(id, fakeElement(id));
  return elements.get(id);
};
globalThis.document = { getElementById: $ };
globalThis.window = { location: { search: "?source=sor" } };
globalThis.Option = class { constructor(label, value) { this.label = label; this.value = value; } };

const applied = [];
const opened = [];
let selection = [];
let tidesSpent = false;
let refuse = null;
mock.module("@owlbear-rodeo/sdk", {
  defaultExport: {
    onReady: (callback) => callback(),
    player: { getSelection: async () => selection },
    popover: { close: async () => {} },
    scene: { items: { getItems: async () => [{ id: "sor", name: "Dars" }] } },
  },
});
mock.module("../src/wildMagicSurgeRuntime.js", {
  namedExports: {
    applyWildMagicSurgePlan: async (plan, record) => {
      if (refuse) throw new Error(refuse);
      applied.push({ plan, record });
      return { message: "Fatto." };
    },
    wildMagicTidesSpent: async () => tidesSpent,
  },
});
mock.module("../src/classFeatureDescriptions.js", {
  namedExports: { loadClassFeatureDescriptions: async () => {}, classFeatureTableText: (_feature, row) => `Riga ${row}.` },
});
mock.module("../src/popoverDragHost.js", {
  namedExports: { openTrackedPopover: async (options) => { opened.push(options); } },
});

await import("../src/wild-magic-surge.js");
await settle();

const type = (value) => {
  $("roll").value = String(value);
  $("roll").fire("input");
};
const press = async (id = "apply") => {
  if (!$(id).disabled) $(id).fire("click");
  await settle();
};
const fixedRow = () => $("summary").textContent;

test("it opens on the sorcerer, with the d100 in focus", () => {
  assert.equal($("subtitle").textContent, "Dars");
  assert.equal($("roll").focused, 1);
});

test("the fixed row asks for the d100, and warns about a number off the table", () => {
  type("");
  assert.equal(fixedRow(), "Manca il d100.");
  assert.equal($("summary").dataset.kind, "");
  assert.equal($("apply").disabled, true);
  type(120);
  assert.equal(fixedRow(), "Numero fuori tabella (1-100).");
  assert.equal($("summary").dataset.kind, "warning");
  assert.equal($("apply").disabled, true);
  assert.equal($("outcome").hidden, true);
  assert.equal($("builder").hidden, true);
});

test("each row says what Applica does with it, and the builder stays folded in all of them", () => {
  type(42);
  assert.equal(fixedRow(), "Applica riproduce l'esito.");
  assert.equal($("summary").dataset.kind, "");
  assert.equal($("auto-tag").textContent, "Automatico");
  assert.equal($("action-line").textContent, "Pillola «Pianta in vaso» e Incapacitato", "a fact: no arrow before it");
  assert.equal($("apply").disabled, false);
  assert.equal($("builder").hidden, false);
  assert.equal($("builder").open, false);
  type(84);
  assert.equal(fixedRow(), "Applica non scrive nulla: usa la pillola se serve.");
  assert.equal($("auto-tag").textContent, "Al tavolo");
  assert.equal($("apply").disabled, false);
  assert.equal($("builder").open, false, "a row at the table does not unfold it: it would go past the window");
});

test("opening the builder brings it into view; closing it does not move the panel", () => {
  type(84);
  const before = $("builder").scrolled;
  $("builder").open = true;
  $("builder").fire("toggle");
  assert.equal($("builder").scrolled, before + 1);
  $("builder").open = false;
  $("builder").fire("toggle");
  assert.equal($("builder").scrolled, before + 1);
  $("builder").open = true;
  type(42);
  assert.equal($("builder").open, false, "a new row folds it again");
});

test("the healing row asks for its total before Applica", async () => {
  type(40);
  assert.equal($("heal-row").hidden, false);
  assert.equal(fixedRow(), "Manca il totale dei PF.");
  assert.equal($("apply").disabled, true);
  $("heal-total").value = "7";
  $("heal-total").fire("input");
  assert.equal(fixedRow(), "Applica riproduce l'esito.");
  assert.equal($("apply").disabled, false);
  $("heal-total").value = "";
  $("heal-total").fire("input");
  assert.equal($("apply").disabled, true);
  $("heal-roll").fire("click");
  assert.ok(Number($("heal-total").value) >= 2, "the dice fill the total");
  assert.equal($("apply").disabled, false);
  const before = applied.length;
  await press();
  assert.equal(applied.length, before + 1);
  assert.equal(applied.at(-1).plan.heal.targetId, "sor");
  assert.equal(applied.at(-1).plan.heal.amount, Number($("heal-total").value));
});

test("F8: a d100 is applied once. Neither a second click nor Enter writes it again; a new d100 does", async () => {
  type(42);
  const before = applied.length;
  await press();
  assert.equal(applied.length, before + 1);
  assert.equal($("status").textContent, "Fatto.");
  assert.equal($("status").dataset.kind, "ok");
  assert.equal($("apply").disabled, true);
  assert.equal(fixedRow(), "Già applicato: un nuovo d100 per un altro Impulso.");
  $("apply").fire("click");
  $("roll").fire("keydown", { key: "Enter" });
  await settle();
  assert.equal(applied.length, before + 1, "the button off and Enter both stop");
  type(42);
  assert.equal($("apply").disabled, false, "the same number rolled again is a new surge");
  assert.equal(fixedRow(), "Applica riproduce l'esito.");
  await press();
  assert.equal(applied.length, before + 2);
});

test("the GM's own pill stays possible after Applica, and does not count as it", async () => {
  type(84);
  $("pill-name").value = "Prova del GM";
  await press("pill-apply");
  const before = applied.length;
  assert.equal($("apply").disabled, false, "the pill alone leaves Applica on");
  await press();
  assert.equal(applied.length, before + 1);
  assert.equal($("apply").disabled, true);
  await press("pill-apply");
  assert.equal(applied.length, before + 2, "the builder has no such limit");
  assert.equal(applied.at(-1).plan.kind, "buff");
  assert.equal(applied.at(-1).plan.pill.targetIds[0], "sor");
});

test("a failure leaves Applica on and says so in red; a new row takes the message away", async () => {
  selection = [];
  type(70);
  const before = applied.length;
  await press();
  assert.equal(applied.length, before);
  assert.equal($("status").dataset.kind, "error");
  assert.match($("status").textContent, /Seleziona sulla mappa/);
  assert.equal($("apply").disabled, false, "with the creatures selected it can go again");
  selection = ["goblin"];
  await press();
  assert.equal(applied.length, before + 1);
  selection = [];
  refuse = "Scena non pronta.";
  type(42);
  assert.equal($("status").textContent, "", "the row before's message is gone");
  assert.equal($("status").dataset.kind, "");
  await press();
  refuse = null;
  assert.equal($("status").textContent, "Scena non pronta.");
  assert.equal($("status").dataset.kind, "error");
  assert.equal($("apply").disabled, false, "nothing was written: it can be tried again");
  assert.equal(fixedRow(), "Applica riproduce l'esito.");
});

test("a spell's row opens the panel without a slot, once", async () => {
  type(7);
  assert.match($("action-line").textContent, /^Lancio dal pannello incantesimi, senza slot: /);
  const before = opened.length;
  await press();
  assert.equal(opened.length, before + 1);
  assert.match(opened.at(-1).url, /spell-unified-panel\.html/);
  assert.equal($("status").dataset.kind, "ok");
  assert.equal($("apply").disabled, true);
});
