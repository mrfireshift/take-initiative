import test from "node:test";
import assert from "node:assert/strict";

import { renderCasterConcentrationSummary } from "../src/spellsPanelCasterSummaryView.js";

function createTestDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        children: [],
        listeners: {},
        textContent: "",
        title: "",
        append(...children) {
          this.children.push(...children);
        },
        addEventListener(type, listener) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
          for (const listener of this.listeners[type] || []) {
            await listener(event);
          }
        },
      };
    },
  };
}

test("un riepilogo vuoto resta nascosto", () => {
  const documentRef = createTestDocument();
  const wrap = { style: { display: "" } };
  const list = documentRef.createElement("div");

  renderCasterConcentrationSummary({
    document: documentRef,
    wrap,
    list,
    concentrations: {},
  });

  assert.equal(wrap.style.display, "none");
  assert.equal(list.children.length, 0);
});

test("le concentrazioni conservano ordine, nome risolto e numero bersagli", () => {
  const documentRef = createTestDocument();
  const wrap = { style: { display: "none" } };
  const list = documentRef.createElement("div");

  renderCasterConcentrationSummary({
    document: documentRef,
    wrap,
    list,
    concentrations: {
      bless: {
        name: "Benedizione",
        targets: ["ally-a", "ally-b"],
      },
      custom: {
        name: "Effetto personalizzato",
        targets: null,
      },
    },
  });

  assert.equal(wrap.style.display, "");
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].className, "row");
  assert.equal(list.children[0].children[0].textContent, "Benedizione (2)");
  assert.equal(list.children[1].children[0].textContent, "Effetto personalizzato (0)");
  assert.equal(list.children[0].children[1].className, "iconbtn");
  assert.equal(
    list.children[0].children[1].title,
    "Interrompi questa concentrazione",
  );
});

test("il pulsante inoltra identità, nome e target senza mutarli", async () => {
  const documentRef = createTestDocument();
  const wrap = { style: {} };
  const list = documentRef.createElement("div");
  const info = {
    instanceId: "spell-instance",
    name: "Benedizione",
    targets: ["ally"],
  };
  const calls = [];
  let propagationStopped = false;

  renderCasterConcentrationSummary({
    document: documentRef,
    wrap,
    list,
    concentrations: { bless: info },
    async onBreak(payload) {
      calls.push(payload);
    },
  });

  await list.children[0].children[1].dispatch("click", {
    stopPropagation() {
      propagationStopped = true;
    },
  });

  assert.equal(propagationStopped, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "bless");
  assert.equal(calls[0].info, info);
  assert.equal(calls[0].displayName, "Benedizione");
  assert.equal(calls[0].targetIds, info.targets);
});
